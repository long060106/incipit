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

  The keeper of the site holds a card whose role is 'admin', and decides two things about
  each book: whether its download is offered, and which articles are listed beside it.

    GET    /api/books        what the keeper has decided, for every reader -> { books }
    PUT    /api/books/<id>   decide it (keeper only)                       -> { book }
    POST   /api/claim        turn the card presented into the keeper's, with a one-time code

  Requests carry `Authorization: Card <code>`, except making a card and GET /api/books.

  Records are the flat rows of src/lib/shelf.ts: a key, a JSON value (absent once deleted)
  and the time the reader last changed it. Between two devices the later change wins.
*/

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
const KEY = /^(mark|place):[A-Za-z0-9-]{1,80}$/;
const BOOK = /^[a-z0-9-]{1,80}$/;
const MAX_ARTICLES = 12;
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

async function overrides(env: Env): Promise<Response> {
  const all = await env.DB.prepare('SELECT book, download, articles FROM book_overrides').all<{ book: string; download: number; articles: string }>();
  const books: Record<string, { download: boolean; articles: Article[] }> = {};
  for (const row of all.results) books[row.book] = { download: row.download !== 0, articles: JSON.parse(row.articles) };
  return json({ books });
}

async function decide(request: Request, env: Env, book: string): Promise<Response> {
  let body: { download?: unknown; articles?: unknown };
  try {
    body = JSON.parse((await request.text()).slice(0, MAX_BODY));
  } catch {
    return refuse(400, 'not-json');
  }
  const before = await env.DB.prepare('SELECT download, articles FROM book_overrides WHERE book = ?1').bind(book).first<{ download: number; articles: string }>();
  const download = typeof body.download === 'boolean' ? body.download : before ? before.download !== 0 : true;
  const articles = body.articles === undefined ? (JSON.parse(before?.articles ?? '[]') as Article[]) : articlesFrom(body.articles);
  if (!articles) return refuse(400, 'bad-articles');
  await env.DB.prepare(
    `INSERT INTO book_overrides (book, download, articles, changed) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (book) DO UPDATE SET download = excluded.download, articles = excluded.articles, changed = excluded.changed`,
  )
    .bind(book, download ? 1 : 0, JSON.stringify(articles), Date.now())
    .run();
  return json({ book: { download, articles } });
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

  const card = await cardOf(request, env);
  if (!card) return refuse(401, 'no-such-card');

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
