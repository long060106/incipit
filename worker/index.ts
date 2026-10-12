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
  database in pieces. Each file is either open (every reader may fetch it) or closed (only
  the keeper's card may), and the keeper chooses. A new file starts open beside a book the
  catalogue marks as out of copyright and closed beside any other. Readers are never told
  of a closed file.

    GET    /api/files                every file kept (keeper only)          -> { files }
    POST   /api/files/<id>           begin a file: { name, bytes, pieces }  (keeper only)
    PUT    /api/files/<id>/<n>       one piece of it, as raw bytes          (keeper only)
    POST   /api/files/<id>/done      all pieces sent                        (keeper only)
    POST   /api/files/<id>/open      open or close it: { open }             (keeper only)
    DELETE /api/files/<id>           remove it                              (keeper only)
    GET    /api/files/<id>/<n>       one piece, for whoever may have the file

  And the keeper can add books of their own beside the catalogue. They reach every reader
  with GET /api/books, as `added`.

    PUT    /api/added/<id>           add a book, or write it again          (keeper only)
    DELETE /api/added/<id>           remove it, with its cover and file     (keeper only)
    PUT    /api/covers/<id>          its cover, as an image                 (keeper only)
    GET    /api/covers/<id>          the cover, for everyone

  Requests carry `Authorization: Card <code>`, except making a card, GET /api/books, covers
  and fetching an open file.

  The keeper's card alone changes nothing. The desk has a password, chosen by the keeper the
  first time; entering it opens the desk for twelve hours in that browser, which is given a
  random key to send with each of the keeper's requests (`X-Keeper: <key>`). Without that
  key every keeper-only request above is refused, whatever card is presented.

    GET    /api/lock      is there a password, and is the desk open here   -> { set, open }
    POST   /api/lock      choose the password, or change it: { password, current? } -> { key }
    POST   /api/unlock    open the desk: { password }                      -> { key }
    DELETE /api/unlock    close it again

  Records are the flat rows of src/lib/shelf.ts: a key, a JSON value (absent once deleted)
  and the time the reader last changed it. Between two devices the later change wins.
*/

import { BOOKS } from '../src/data/books';
import type { Book, L } from '../src/data/types';
import { GENRES, KEYWORDS, LANGUAGES } from '../src/data/vocab';

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
/** The books the catalogue marks as out of copyright: a file put beside one starts open. */
const FREE = new Set(BOOKS.filter((book) => book.free).map((book) => book.id));
const KNOWN = new Set(BOOKS.map((book) => book.id));
const OPEN_FOR = 12 * 60 * 60 * 1000; // milliseconds the desk stays open after the password
const MIN_PASSWORD = 8;
const MAX_UNLOCKS_PER_DAY = 30; // tries from one address
const STRETCH = 100_000; // rounds of PBKDF2
const MAX_COVER = 400_000; // bytes
const MAX_ADDED = 500; // books
const COVER_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/** Whether a book is the catalogue's or one the keeper has added. */
async function known(env: Env, book: string): Promise<boolean> {
  return KNOWN.has(book) || !!(await env.DB.prepare('SELECT 1 FROM added_books WHERE id = ?1').bind(book).first());
}
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

// ---------------------------------------------------------------------------------------
// The password on the desk

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) => new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

/** A password as it is kept: stretched with its salt, so that the table alone opens nothing. */
async function stretched(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: STRETCH }, key, 256)));
}

/** Compares two hashes in the same time whether or not they match. */
function same(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let at = 0; at < a.length && at < b.length; at++) difference |= a.charCodeAt(at) ^ b.charCodeAt(at);
  return difference === 0;
}

const lockRow = (env: Env) => env.DB.prepare('SELECT salt, hash FROM keeper_lock WHERE id = 1').first<{ salt: string; hash: string }>();

async function isPassword(env: Env, password: unknown): Promise<boolean> {
  const row = await lockRow(env);
  return !!row && typeof password === 'string' && password.length <= 200 && same(await stretched(password, unhex(row.salt)), row.hash);
}

/** Whether this request carries the key of a desk that is open for this card. */
async function deskOpen(request: Request, env: Env, card: Card): Promise<boolean> {
  const key = request.headers.get('x-keeper') ?? '';
  if (!/^[0-9a-f]{64}$/.test(key)) return false;
  const row = await env.DB.prepare('SELECT expires FROM keeper_sessions WHERE id = ?1 AND card = ?2').bind(await sha256(key), card.id).first<{ expires: number }>();
  return !!row && row.expires > Date.now();
}

/** Opens the desk for this card: a new key, which is all the browser keeps. */
async function openDesk(env: Env, card: Card): Promise<Response> {
  const key = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM keeper_sessions WHERE expires < ?1').bind(now),
    env.DB.prepare('INSERT INTO keeper_sessions (id, card, expires) VALUES (?1, ?2, ?3)').bind(await sha256(key), card.id, now + OPEN_FOR),
  ]);
  return json({ key, expires: now + OPEN_FOR });
}

/** What stands between a request and the keeper's desk, or null if nothing does. */
async function keeperGate(request: Request, env: Env, card: Card): Promise<Response | null> {
  if (card.role !== 'admin') return refuse(403, 'keeper-only');
  if (!(await lockRow(env))) return refuse(423, 'no-password');
  return (await deskOpen(request, env, card)) ? null : refuse(423, 'locked');
}

async function passwordIn(request: Request): Promise<{ password?: unknown; current?: unknown } | null> {
  try {
    const body = JSON.parse((await request.text()).slice(0, 2000));
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

async function choosePassword(request: Request, env: Env, card: Card): Promise<Response> {
  const body = await passwordIn(request);
  if (!body) return refuse(400, 'not-json');
  const { password } = body;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) return refuse(400, 'bad-password');
  // A password already chosen is changed only from an open desk, or by giving it.
  if ((await lockRow(env)) && !(await deskOpen(request, env, card))) {
    if (!(await within(env, request, 'unlock', MAX_UNLOCKS_PER_DAY))) return refuse(429, 'too-many-tries');
    if (!(await isPassword(env, body.current))) return refuse(403, 'wrong-password');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO keeper_lock (id, salt, hash, changed) VALUES (1, ?1, ?2, ?3)').bind(hex(salt), await stretched(password, salt), Date.now()),
    // Every desk opened with the old password is closed.
    env.DB.prepare('DELETE FROM keeper_sessions'),
  ]);
  return openDesk(env, card);
}

async function unlock(request: Request, env: Env, card: Card): Promise<Response> {
  if (!(await within(env, request, 'unlock', MAX_UNLOCKS_PER_DAY))) return refuse(429, 'too-many-tries');
  const body = await passwordIn(request);
  if (!body) return refuse(400, 'not-json');
  if (!(await isPassword(env, body.password))) return refuse(403, 'wrong-password');
  return openDesk(env, card);
}

async function lockAgain(request: Request, env: Env): Promise<Response> {
  const key = request.headers.get('x-keeper') ?? '';
  if (key) await env.DB.prepare('DELETE FROM keeper_sessions WHERE id = ?1').bind(await sha256(key)).run();
  return json({ ok: true });
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
  /** When it was kept: tells a file from the one it replaced. */
  changed: number;
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

/** A book as the keeper wrote it at the desk, kept only if every part of it is what it should be. */
function bookFrom(value: unknown, id: string): Book | null {
  if (!value || typeof value !== 'object') return null;
  const given = value as Record<string, any>;
  const line = (text: unknown, most: number, needed = true): string | null => {
    const clean = typeof text === 'string' ? text.trim() : '';
    return clean.length <= most && (clean || !needed) ? clean : null;
  };
  const both = (text: unknown, most: number, needed = true): L | null => {
    const en = line((text as L | undefined)?.en, most, needed);
    const fr = line((text as L | undefined)?.fr, most, false);
    return en === null || fr === null ? null : { en, fr: fr || en };
  };
  const whole = (n: unknown, low: number, high: number) => Number.isInteger(n) && (n as number) >= low && (n as number) <= high;
  const among = (list: unknown, allowed: object, most: number) =>
    Array.isArray(list) && list.length <= most && list.every((entry) => typeof entry === 'string' && entry in allowed) ? [...new Set(list as string[])] : null;

  const title = line(given.title, 200);
  const author = line(given.author, 200);
  const originalTitle = line(given.originalTitle, 200, false);
  const description = both(given.description, 1200);
  const place = both(given.setting?.place, 200, false);
  const genres = among(given.genres, GENRES, 4);
  const keywords = among(given.keywords, KEYWORDS, 8);
  const countries: unknown = given.setting?.countries;
  const advice = { pace: both(given.advice?.pace, 600, false), headsUp: both(given.advice?.headsUp, 600, false), readIf: both(given.advice?.readIf, 600, false), skipIf: both(given.advice?.skipIf, 600, false) };
  const mood = given.mood ?? {};
  if (!title || !author || originalTitle === null || !description || !place || !genres?.length || !keywords) return null;
  if (!whole(given.year, -3000, 3000) || !whole(given.pages, 1, 20_000) || !whole(given.difficulty, 1, 5)) return null;
  if (typeof given.language !== 'string' || !(given.language in LANGUAGES)) return null;
  if (!Array.isArray(countries) || countries.length > 8 || !countries.every((code) => typeof code === 'string' && /^[A-Z]{2}$/.test(code))) return null;
  if (!advice.pace || !advice.headsUp || !advice.readIf || !advice.skipIf) return null;
  for (const axis of ['tone', 'voice', 'intensity', 'pace', 'strange']) if (!whole(mood[axis], 0, 100)) return null;

  return {
    id,
    title,
    ...(originalTitle ? { originalTitle } : {}),
    author,
    year: given.year,
    pages: given.pages,
    language: given.language as Book['language'],
    genres: genres as Book['genres'],
    keywords: keywords as Book['keywords'],
    setting: { place, countries: countries as string[] },
    mood: { tone: mood.tone, voice: mood.voice, intensity: mood.intensity, pace: mood.pace, strange: mood.strange },
    difficulty: given.difficulty,
    rating: { value: 0, count: 0 },
    cover: 0,
    olKey: '',
    description,
    advice: advice as Book['advice'],
    added: true,
  };
}

async function addBook(request: Request, env: Env, id: string): Promise<Response> {
  if (KNOWN.has(id)) return refuse(409, 'in-the-catalogue');
  let book: Book | null = null;
  try {
    book = bookFrom(JSON.parse((await request.text()).slice(0, MAX_BODY)), id);
  } catch {
    return refuse(400, 'not-json');
  }
  if (!book) return refuse(400, 'bad-book');
  const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM added_books WHERE id != ?1').bind(id).first<{ n: number }>();
  if ((held?.n ?? 0) >= MAX_ADDED) return refuse(413, 'shelf-full');
  await env.DB.prepare('INSERT INTO added_books (id, data, changed) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET data = excluded.data, changed = excluded.changed')
    .bind(id, JSON.stringify(book), Date.now())
    .run();
  return json({ book });
}

async function removeBook(env: Env, id: string): Promise<Response> {
  await env.DB.batch(
    ['DELETE FROM file_pieces WHERE book = ?1', 'DELETE FROM files WHERE book = ?1', 'DELETE FROM covers WHERE book = ?1', 'DELETE FROM book_overrides WHERE book = ?1', 'DELETE FROM added_books WHERE id = ?1'].map(
      (statement) => env.DB.prepare(statement).bind(id),
    ),
  );
  return json({ ok: true });
}

async function keepCover(request: Request, env: Env, id: string): Promise<Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0];
  if (!COVER_TYPES.includes(type)) return refuse(400, 'bad-cover');
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_COVER) return refuse(413, 'too-large');
  if (!(await env.DB.prepare('SELECT 1 FROM added_books WHERE id = ?1').bind(id).first())) return refuse(404, 'no-such-book');
  const now = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO covers (book, type, data, changed) VALUES (?1, ?2, ?3, ?4)').bind(id, type, data, now).run();
  return json({ coverAt: now });
}

async function cover(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT type, data FROM covers WHERE book = ?1').bind(id).first<{ type: string; data: ArrayBuffer | number[] }>();
  if (!row) return refuse(404, 'no-such-cover');
  // The address carries the time the cover was kept (?v=), so a copy may be held for good.
  return new Response(row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data), {
    headers: { 'content-type': row.type, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}

async function overrides(env: Env): Promise<Response> {
  const [all, kept, more, covers] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare('SELECT book, download, articles, edits FROM book_overrides'),
    env.DB.prepare('SELECT book, name, bytes, pieces, changed FROM files WHERE ready = 1 AND open = 1'),
    env.DB.prepare('SELECT data FROM added_books ORDER BY changed'),
    env.DB.prepare('SELECT book, changed FROM covers'),
  ]);
  const coverAt = new Map(covers.results.map((row) => [row.book as string, row.changed as number]));
  const added = more.results.map((row) => {
    const book = JSON.parse(row.data as string) as Book;
    return { ...book, coverAt: coverAt.get(book.id) ?? 0 };
  });
  const books: Record<string, { download: boolean; articles: Article[]; edits: Edits; file?: KeptFile }> = {};
  for (const row of all.results) {
    books[row.book as string] = { download: row.download !== 0, articles: JSON.parse(row.articles as string), edits: JSON.parse(row.edits as string) };
  }
  // Readers are told only of the files that are open to them.
  for (const row of kept.results) {
    const book = row.book as string;
    books[book] ??= { download: true, articles: [], edits: {} };
    books[book].file = { name: row.name as string, bytes: row.bytes as number, pieces: row.pieces as number, changed: row.changed as number };
  }
  return json({ books, added });
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
    const all = await env.DB.prepare('SELECT book, name, bytes, pieces, changed, open FROM files WHERE ready = 1').all<KeptFile & { book: string; open: number }>();
    const files: Record<string, KeptFile & { open: boolean }> = {};
    for (const { book: id, open, ...file } of all.results) files[id] = { ...file, open: open === 1 };
    return json({ files });
  }
  if (!(await known(env, book))) return refuse(400, 'bad-book');

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
        // A file that replaces another stays as open or as closed as the one before it.
        `INSERT INTO files (book, name, bytes, pieces, ready, changed, open) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)
         ON CONFLICT (book) DO UPDATE SET name = excluded.name, bytes = excluded.bytes, pieces = excluded.pieces, ready = 0, changed = excluded.changed`,
      ).bind(book, name, bytes, body.pieces, Date.now(), FREE.has(book) ? 1 : 0),
    ]);
    return json({ piece: PIECE }, 201);
  }

  const file = await env.DB.prepare('SELECT bytes, pieces, open, changed FROM files WHERE book = ?1').bind(book).first<{ bytes: number; pieces: number; open: number; changed: number }>();
  if (!file) return refuse(404, 'no-such-file');
  if (rest === 'open' && request.method === 'POST') {
    let open: unknown;
    try {
      open = JSON.parse((await request.text()).slice(0, 200)).open;
    } catch {
      return refuse(400, 'not-json');
    }
    if (typeof open !== 'boolean') return refuse(400, 'bad-open');
    await env.DB.prepare('UPDATE files SET open = ?2 WHERE book = ?1').bind(book, open ? 1 : 0).run();
    return json({ open });
  }
  if (rest === 'done' && request.method === 'POST') {
    const got = await env.DB.prepare('SELECT COUNT(*) AS pieces, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM file_pieces WHERE book = ?1')
      .bind(book)
      .first<{ pieces: number; bytes: number }>();
    if (got?.pieces !== file.pieces || got.bytes !== file.bytes) return refuse(409, 'incomplete');
    await env.DB.prepare('UPDATE files SET ready = 1 WHERE book = ?1').bind(book).run();
    return json({ ok: true, open: file.open === 1, changed: file.changed });
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
  if (section === 'covers' && request.method === 'GET' && BOOK.test(book ?? '')) return cover(env, book);
  const fetching = section === 'files' && request.method === 'GET' && BOOK.test(book ?? '') && /^\d{1,4}$/.test(rest ?? '');
  // An open file needs no card.
  if (fetching && (await env.DB.prepare('SELECT 1 FROM files WHERE book = ?1 AND ready = 1 AND open = 1').bind(book).first())) return piece(env, book, Number(rest));

  const card = await cardOf(request, env);
  if (!card) return refuse(401, 'no-such-card');

  if (section === 'lock' || section === 'unlock') {
    if (card.role !== 'admin') return refuse(403, 'keeper-only');
    if (section === 'lock' && request.method === 'GET') return json({ set: !!(await lockRow(env)), open: await deskOpen(request, env, card) });
    if (section === 'lock' && request.method === 'POST') return choosePassword(request, env, card);
    if (section === 'unlock' && request.method === 'POST') return unlock(request, env, card);
    if (section === 'unlock' && request.method === 'DELETE') return lockAgain(request, env);
    return refuse(404, 'not-found');
  }
  if (section === 'files') {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
    if (fetching) return piece(env, book, Number(rest));
    return keepFiles(request, env, book, rest);
  }
  if (section === 'added' || section === 'covers') {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
    if (!BOOK.test(book ?? '') || rest !== undefined) return refuse(400, 'bad-book');
    if (section === 'covers' && request.method === 'PUT') return keepCover(request, env, book);
    if (section === 'added' && request.method === 'PUT') return addBook(request, env, book);
    if (section === 'added' && request.method === 'DELETE') return removeBook(env, book);
    return refuse(404, 'not-found');
  }

  if (path === '/api/claim' && request.method === 'POST') return claim(request, env, card);
  if (path.startsWith('/api/books/') && request.method === 'PUT') {
    const book = path.slice('/api/books/'.length);
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
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
