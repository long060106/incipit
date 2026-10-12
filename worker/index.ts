/*
  The site's server: a Cloudflare Worker in front of the static files. It answers only
  /api/*; every other address is served from ./dist as before (see wrangler.jsonc).

  What it keeps is a reader's notebook, so that it survives a lost browser and follows them
  to another device. There are no accounts in the usual sense. A reader takes a "library
  card": a long random code made here. The code is the whole key. No name, no email and no
  password is asked for or stored, and of the code itself only a SHA-256 hash is kept, so
  the database cannot be used to open anyone's notebook.

    POST   /api/card   make a card                         -> { code }
    GET    /api/me     about the card presented            -> { role, rows, created }
    POST   /api/sync   exchange notebook records           -> { cursor, rows }
    DELETE /api/card   erase the card and all it holds     -> { ok }

  The keeper of the site holds a card whose role is 'admin', and decides these things about
  each book: whether its download is offered, which articles are listed beside it, and
  corrections to its title, author, year and description.

    GET    /api/books        what the keeper has decided, for every reader -> { books }
    PUT    /api/books/<id>   decide it (keeper only)                       -> { book }
    POST   /api/claim        turn the card presented into the keeper's, with a one-time code

  The keeper can also put one file beside a book (an EPUB, a PDF, a text). It is kept in the
  database in pieces. Who may fetch it follows the catalogue (src/data/books.ts), not a
  switch: the file of a book out of copyright is handed to every reader; the file of any
  other book is given only to the keeper's own card, and no setting changes that.

    GET    /api/files                every file kept (keeper only)          -> { files }
    POST   /api/files/<id>           begin a file: { name, bytes, pieces }  (keeper only)
    PUT    /api/files/<id>/<n>       one piece of it, as raw bytes          (keeper only)
    POST   /api/files/<id>/done      all pieces sent                        (keeper only)
    DELETE /api/files/<id>           remove it                              (keeper only)
    GET    /api/files/<id>/<n>       one piece, for whoever may have the file

  Requests carry `Authorization: Card <code>`, except making a card, GET /api/books and
  fetching the file of a book out of copyright.

  Records are the flat rows of src/lib/shelf.ts: a key, a JSON value (absent once deleted)
  and the time the reader last changed it. Between two devices the later change wins.
*/

import { BOOKS } from '../src/data/books';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Card {
  id: string;
  role: string;
  created: number;
}

interface Incoming {
  key: string;
  v?: unknown;
  t: number;
}

const MAX_BODY = 1_000_000; // bytes in one request
const MAX_ROWS_PER_SYNC = 2000;
const MAX_ROWS_PER_CARD = 20_000;
const MAX_VALUE = 20_000; // characters of JSON in one record
const MAX_CARDS_PER_DAY = 30; // from one address
const KEY = /^(mark|place|bookmark):[A-Za-z0-9-]{1,80}$/;
const BOOK = /^[a-z0-9-]{1,80}$/;
const MAX_ARTICLES = 12;
const PIECE = 512 * 1024; // bytes in one piece of a file
const MAX_FILE = 60 * 1024 * 1024;
const MAX_FILES_TOTAL = 400 * 1024 * 1024; // the free database holds 500 MB in all
const FILE_NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,150}\.(epub|pdf|txt|mobi|azw3)$/i;
/** The books anyone may be handed a copy of: those the catalogue marks as out of copyright. */
const FREE = new Set(BOOKS.filter((book) => book.free).map((book) => book.id));
const KNOWN = new Set(BOOKS.map((book) => book.id));
// Crockford's alphabet: no I, L, O or U, so a code survives being read aloud or copied by hand.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE = /^[0-9A-HJKMNP-TV-Z]{20}$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const refuse = (status: number, error: string) => json({ error }, status);

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Twenty characters, a hundred bits: five to a group, as printed on the card. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map((byte) => ALPHABET[byte & 31]).join('');
}

/** A code as typed (any case, with or without dashes, O for 0, I or L for 1) in its stored form. */
function tidy(code: string): string | null {
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE.test(clean) ? clean : null;
}

async function cardOf(request: Request, env: Env): Promise<Card | null> {
  const [scheme, value] = (request.headers.get('authorization') ?? '').split(' ');
  const code = scheme === 'Card' && value ? tidy(value) : null;
  if (!code) return null;
  return env.DB.prepare('SELECT id, role, created FROM cards WHERE id = ?1').bind(await sha256(code)).first<Card>();
}

/** Counts a use of something from one address today, and says whether it is still within `most`. */
async function within(env: Env, request: Request, what: string, most: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  // The address is never stored, only a hash that changes every day.
  const bucket = await sha256(`${what}:${day}:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
  const row = await env.DB.prepare(
    'INSERT INTO limits (bucket, day, count) VALUES (?1, ?2, 1) ON CONFLICT (bucket) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(bucket, day)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= most;
}

async function makeCard(request: Request, env: Env): Promise<Response> {
  if (!(await within(env, request, 'card', MAX_CARDS_PER_DAY))) return refuse(429, 'too-many-cards');
  const code = newCode();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cards (id, created, seen, role) VALUES (?1, ?2, ?2, ?3)').bind(await sha256(code), now, 'reader'),
    // Yesterday's counters are of no more use.
    env.DB.prepare('DELETE FROM limits WHERE day < ?1').bind(new Date().toISOString().slice(0, 10)),
  ]);
  return json({ code }, 201);
}

async function sync(request: Request, env: Env, card: Card): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return refuse(413, 'too-large');
  let body: { since?: unknown; rows?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return refuse(400, 'not-json');
  }
  const since = Number.isFinite(body.since) ? Number(body.since) : 0;
  const incoming = Array.isArray(body.rows) ? (body.rows as Incoming[]) : [];
  if (incoming.length > MAX_ROWS_PER_SYNC) return refuse(413, 'too-many-rows');

  const now = Date.now();
  const clean: { key: string; value: string | null; t: number }[] = [];
  for (const row of incoming) {
    if (!row || typeof row.key !== 'string' || !KEY.test(row.key) || !Number.isFinite(row.t)) return refuse(400, 'bad-row');
    const value = row.v === undefined || row.v === null ? null : JSON.stringify(row.v);
    if (value && value.length > MAX_VALUE) return refuse(413, 'row-too-large');
    // A clock set in the future must not make a record unbeatable.
    clean.push({ key: row.key, value, t: Math.min(Math.floor(row.t), now + 60_000) });
  }

  // What the other devices changed since this one last asked. Read before writing, so that
  // the reader's own changes are not sent straight back.
  const theirs = await env.DB.prepare('SELECT key, value, changed FROM rows WHERE card = ?1 AND stored >= ?2 ORDER BY stored LIMIT 5000')
    .bind(card.id, since)
    .all<{ key: string; value: string | null; changed: number }>();

  if (clean.length) {
    const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM rows WHERE card = ?1').bind(card.id).first<{ n: number }>();
    if ((held?.n ?? 0) + clean.length > MAX_ROWS_PER_CARD + MAX_ROWS_PER_SYNC) return refuse(413, 'notebook-full');
    const write = env.DB.prepare(
      `INSERT INTO rows (card, key, value, changed, stored) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (card, key) DO UPDATE SET value = excluded.value, changed = excluded.changed, stored = excluded.stored
       WHERE excluded.changed > rows.changed`,
    );
    for (let at = 0; at < clean.length; at += 50) {
      await env.DB.batch(clean.slice(at, at + 50).map((row) => write.bind(card.id, row.key, row.value, row.t, now)));
    }
  }
  await env.DB.prepare('UPDATE cards SET seen = ?2 WHERE id = ?1').bind(card.id, now).run();

  const sent = new Map(clean.map((row) => [row.key, row.t]));
  const rows = theirs.results
    .filter((row) => (sent.get(row.key) ?? -Infinity) < row.changed)
    .map((row) => ({ key: row.key, t: row.changed, ...(row.value === null ? {} : { v: JSON.parse(row.value) }) }));
  return json({ cursor: now, rows });
}

interface Article {
  title: string;
  url: string;
}

/** The articles as they will be stored, or null if any of them is not a title and a web address. */
function articlesFrom(value: unknown): Article[] | null {
  if (!Array.isArray(value) || value.length > MAX_ARTICLES) return null;
  const list: Article[] = [];
  for (const entry of value) {
    const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!title || title.length > 160 || url.length > 500 || !/^https?:\/\/[^\s<>"']+$/i.test(url)) return null;
    list.push({ title, url });
  }
  return list;
}

interface Edits {
  title?: string;
  author?: string;
  year?: number;
  description?: { en?: string; fr?: string };
}

interface KeptFile {
  name: string;
  bytes: number;
  pieces: number;
}

/** The corrections as they will be stored, or null if any of them is not what it should be. */
function editsFrom(value: unknown): Edits | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const edits: Edits = {};
  const line = (text: unknown, most: number) => (typeof text === 'string' && text.trim() && text.trim().length <= most ? text.trim() : null);
  for (const field of ['title', 'author'] as const) {
    if (given[field] === undefined) continue;
    const text = line(given[field], 200);
    if (!text) return null;
    edits[field] = text;
  }
  if (given.year !== undefined) {
    if (!Number.isInteger(given.year) || Math.abs(given.year as number) > 3000) return null;
    edits.year = given.year as number;
  }
  if (given.description !== undefined) {
    const said = given.description as Record<string, unknown> | null;
    if (!said || typeof said !== 'object') return null;
    edits.description = {};
    for (const lang of ['en', 'fr'] as const) {
      if (said[lang] === undefined) continue;
      const text = line(said[lang], 1200);
      if (!text) return null;
      edits.description[lang] = text;
    }
  }
  return edits;
}

async function overrides(env: Env): Promise<Response> {
  const [all, kept] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare('SELECT book, download, articles, edits FROM book_overrides'),
    env.DB.prepare('SELECT book, name, bytes, pieces FROM files WHERE ready = 1'),
  ]);
  const books: Record<string, { download: boolean; articles: Article[]; edits: Edits; file?: KeptFile }> = {};
  for (const row of all.results) {
    books[row.book as string] = { download: row.download !== 0, articles: JSON.parse(row.articles as string), edits: JSON.parse(row.edits as string) };
  }
  // Readers are told only of the files they may have.
  for (const row of kept.results) {
    const book = row.book as string;
    if (!FREE.has(book)) continue;
    books[book] ??= { download: true, articles: [], edits: {} };
    books[book].file = { name: row.name as string, bytes: row.bytes as number, pieces: row.pieces as number };
  }
  return json({ books });
}

async function decide(request: Request, env: Env, book: string): Promise<Response> {
  let body: { download?: unknown; articles?: unknown; edits?: unknown };
  try {
    body = JSON.parse((await request.text()).slice(0, MAX_BODY));
  } catch {
    return refuse(400, 'not-json');
  }
  const before = await env.DB.prepare('SELECT download, articles, edits FROM book_overrides WHERE book = ?1')
    .bind(book)
    .first<{ download: number; articles: string; edits: string }>();
  const download = typeof body.download === 'boolean' ? body.download : before ? before.download !== 0 : true;
  const articles = body.articles === undefined ? (JSON.parse(before?.articles ?? '[]') as Article[]) : articlesFrom(body.articles);
  if (!articles) return refuse(400, 'bad-articles');
  // The corrections sent replace the ones kept, whole: leaving a field out gives it back to the catalogue.
  const edits = body.edits === undefined ? (JSON.parse(before?.edits ?? '{}') as Edits) : editsFrom(body.edits);
  if (!edits) return refuse(400, 'bad-edits');
  await env.DB.prepare(
    `INSERT INTO book_overrides (book, download, articles, edits, changed) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (book) DO UPDATE SET download = excluded.download, articles = excluded.articles, edits = excluded.edits, changed = excluded.changed`,
  )
    .bind(book, download ? 1 : 0, JSON.stringify(articles), JSON.stringify(edits), Date.now())
    .run();
  return json({ book: { download, articles, edits } });
}

/** Everything the keeper does with files: /api/files[/<book>[/<n>|/done]]. */
async function keepFiles(request: Request, env: Env, book: string | undefined, rest: string | undefined): Promise<Response> {
  if (!book) {
    if (request.method !== 'GET') return refuse(404, 'not-found');
    const all = await env.DB.prepare('SELECT book, name, bytes, pieces FROM files WHERE ready = 1').all<KeptFile & { book: string }>();
    const files: Record<string, KeptFile & { open: boolean }> = {};
    for (const { book: id, ...file } of all.results) files[id] = { ...file, open: FREE.has(id) };
    return json({ files });
  }
  if (!KNOWN.has(book)) return refuse(400, 'bad-book');

  if (rest === undefined && request.method === 'DELETE') {
    await env.DB.batch([env.DB.prepare('DELETE FROM file_pieces WHERE book = ?1').bind(book), env.DB.prepare('DELETE FROM files WHERE book = ?1').bind(book)]);
    return json({ ok: true });
  }
  if (rest === undefined && request.method === 'POST') {
    let body: { name?: unknown; bytes?: unknown; pieces?: unknown };
    try {
      body = JSON.parse((await request.text()).slice(0, 2000));
    } catch {
      return refuse(400, 'not-json');
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const bytes = Number(body.bytes);
    if (!FILE_NAME.test(name)) return refuse(400, 'bad-name');
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_FILE) return refuse(413, 'too-large');
    if (body.pieces !== Math.ceil(bytes / PIECE)) return refuse(400, 'bad-pieces');
    const held = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM files WHERE book != ?1').bind(book).first<{ n: number }>();
    if ((held?.n ?? 0) + bytes > MAX_FILES_TOTAL) return refuse(413, 'shelf-full');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM file_pieces WHERE book = ?1').bind(book),
      env.DB.prepare(
        `INSERT INTO files (book, name, bytes, pieces, ready, changed) VALUES (?1, ?2, ?3, ?4, 0, ?5)
         ON CONFLICT (book) DO UPDATE SET name = excluded.name, bytes = excluded.bytes, pieces = excluded.pieces, ready = 0, changed = excluded.changed`,
      ).bind(book, name, bytes, body.pieces, Date.now()),
    ]);
    return json({ piece: PIECE }, 201);
  }

  const file = await env.DB.prepare('SELECT bytes, pieces FROM files WHERE book = ?1').bind(book).first<{ bytes: number; pieces: number }>();
  if (!file) return refuse(404, 'no-such-file');
  if (rest === 'done' && request.method === 'POST') {
    const got = await env.DB.prepare('SELECT COUNT(*) AS pieces, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM file_pieces WHERE book = ?1')
      .bind(book)
      .first<{ pieces: number; bytes: number }>();
    if (got?.pieces !== file.pieces || got.bytes !== file.bytes) return refuse(409, 'incomplete');
    await env.DB.prepare('UPDATE files SET ready = 1 WHERE book = ?1').bind(book).run();
    return json({ ok: true, open: FREE.has(book) });
  }
  if (rest !== undefined && /^\d{1,4}$/.test(rest) && request.method === 'PUT') {
    const n = Number(rest);
    const data = await request.arrayBuffer();
    const last = n === file.pieces - 1;
    if (n >= file.pieces || data.byteLength !== (last ? file.bytes - PIECE * n : PIECE)) return refuse(400, 'bad-piece');
    await env.DB.prepare('INSERT OR REPLACE INTO file_pieces (book, n, data) VALUES (?1, ?2, ?3)').bind(book, n, data).run();
    return json({ ok: true });
  }
  return refuse(404, 'not-found');
}

/** One piece of a book's file, for whoever may have it. */
async function piece(env: Env, book: string, n: number): Promise<Response> {
  const row = await env.DB.prepare('SELECT p.data FROM file_pieces p JOIN files f ON f.book = p.book WHERE p.book = ?1 AND p.n = ?2 AND f.ready = 1')
    .bind(book, n)
    .first<{ data: ArrayBuffer | number[] }>();
  if (!row) return refuse(404, 'no-such-file');
  const data = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
  return new Response(data, {
    headers: {
      'content-type': 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      // Never kept on the way: the keeper's own files are private, and a file that has been
      // replaced must not come back as a mix of old pieces and new.
      'cache-control': 'private, no-store',
    },
  });
}

async function claim(request: Request, env: Env, card: Card): Promise<Response> {
  if (!(await within(env, request, 'claim', 10))) return refuse(429, 'too-many-tries');
  let token = '';
  try {
    token = String(JSON.parse(await request.text()).token ?? '');
  } catch {
    return refuse(400, 'not-json');
  }
  // Marking the code used and checking that it was still good are one statement, so it works once.
  const taken = await env.DB.prepare('UPDATE claims SET used = ?2 WHERE id = ?1 AND used IS NULL RETURNING id').bind(await sha256(token), Date.now()).first();
  if (!taken) return refuse(403, 'not-a-claim');
  await env.DB.prepare("UPDATE cards SET role = 'admin' WHERE id = ?1").bind(card.id).run();
  return json({ role: 'admin' });
}

async function api(request: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/card' && request.method === 'POST') return makeCard(request, env);
  if (path === '/api/books' && request.method === 'GET') return overrides(env);

  const [, , section, book, rest] = path.split('/');
  const fetching = section === 'files' && request.method === 'GET' && book !== undefined && /^\d{1,4}$/.test(rest ?? '');
  // The file of a book out of copyright needs no card.
  if (fetching && FREE.has(book)) return piece(env, book, Number(rest));

  const card = await cardOf(request, env);
  if (!card) return refuse(401, 'no-such-card');

  if (section === 'files') {
    if (card.role !== 'admin') return refuse(403, 'keeper-only');
    if (fetching) return KNOWN.has(book) ? piece(env, book, Number(rest)) : refuse(400, 'bad-book');
    return keepFiles(request, env, book, rest);
  }

  if (path === '/api/claim' && request.method === 'POST') return claim(request, env, card);
  if (path.startsWith('/api/books/') && request.method === 'PUT') {
    const book = path.slice('/api/books/'.length);
    if (card.role !== 'admin') return refuse(403, 'keeper-only');
    if (!BOOK.test(book)) return refuse(400, 'bad-book');
    return decide(request, env, book);
  }

  if (path === '/api/me' && request.method === 'GET') {
    const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM rows WHERE card = ?1 AND value IS NOT NULL').bind(card.id).first<{ n: number }>();
    return json({ role: card.role, rows: held?.n ?? 0, created: card.created });
  }
  if (path === '/api/sync' && request.method === 'POST') return sync(request, env, card);
  if (path === '/api/card' && request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rows WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM cards WHERE id = ?1').bind(card.id),
    ]);
    return json({ ok: true });
  }
  return refuse(404, 'not-found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, pathname);
    } catch (error) {
      console.error(error);
      return refuse(500, 'server-error');
    }
  },
} satisfies ExportedHandler<Env>;
