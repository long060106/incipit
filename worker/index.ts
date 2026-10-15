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

  And the keeper writes the page about who made the site (/about).

    GET    /api/profile              the maker's words, for everyone
    PUT    /api/profile              write them again                       (keeper only)
    GET    /api/portrait             the maker's portrait, for everyone
    PUT    /api/portrait             a new portrait                         (keeper only)
    DELETE /api/portrait             take it down                           (keeper only)

  Requests carry `Authorization: Card <code>`, except making a card, GET /api/books, covers,
  the profile and its portrait, and fetching an open file.

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
import type { Book, L, Mood } from '../src/data/types';
import { AXES, GENRES, KEYWORDS, LANGUAGES } from '../src/data/vocab';

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
const MAX_ENTERS_PER_DAY = 40; // tries at a name and password, from one address
const MAX_ACCOUNTS_PER_DAY = 10; // from one address
const NAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;
/** An email address a reader may sign in with; it is never shown to anyone. */
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_NAME_LOOKUPS_PER_DAY = 400; // asking whether a name is free, from one address
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

// ── Accounts ────────────────────────────────────────────────────────────────

interface Account {
  name: string;
  email: string | null;
  card: string;
  salt: string;
  hash: string;
  iv: string;
  sealed: string;
}

/** One stretching of a password gives both what proves it and the key that seals a card's code. */
async function keysOf(password: string, salt: Uint8Array): Promise<{ proof: string; seal: CryptoKey }> {
  const master = await stretched(password, salt);
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`seal:${master}`));
  return { proof: await sha256(`proof:${master}`), seal: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}

/** What is kept of a password and the code it opens. */
async function sealUnder(password: string, code: string): Promise<{ salt: string; hash: string; iv: string; sealed: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { proof, seal } = await keysOf(password, salt);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, seal, new TextEncoder().encode(code)));
  return { salt: hex(salt), hash: proof, iv: hex(iv), sealed: hex(sealed) };
}

const goodPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 200;

async function bodyOf(request: Request, most = 2000): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > most) return null;
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The card's code as this request carries it: a card has just been found by it. */
const codeIn = (request: Request) => tidy((request.headers.get('authorization') ?? '').split(' ')[1] ?? '')!;

/** Puts a name and a password in front of the card that asks. */
async function makeAccount(request: Request, env: Env, card: Card): Promise<Response> {
  const body = await bodyOf(request);
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : '';
  // The email is optional: with one, the reader may sign in with it instead of the name.
  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const password = body?.password;
  if (!NAME.test(name)) return refuse(400, 'bad-name');
  if (email !== null && (email.length > 254 || !EMAIL.test(email))) return refuse(400, 'bad-email');
  if (!goodPassword(password)) return refuse(400, 'bad-password');
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE card = ?1').bind(card.id).first()) return refuse(409, 'has-account');
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE name = ?1').bind(name).first()) return refuse(409, 'taken');
  if (email && (await env.DB.prepare('SELECT 1 FROM accounts WHERE email = ?1').bind(email).first())) return refuse(409, 'email-taken');
  if (!(await within(env, request, 'account', MAX_ACCOUNTS_PER_DAY))) return refuse(429, 'too-many');
  const kept = await sealUnder(password, codeIn(request));
  try {
    await env.DB.prepare('INSERT INTO accounts (name, email, card, salt, hash, iv, sealed, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(name, email, card.id, kept.salt, kept.hash, kept.iv, kept.sealed, Date.now())
      .run();
  } catch {
    // Someone took the name, or the email, in the same moment.
    return refuse(409, 'taken');
  }
  return json({ name, email }, 201);
}

/** Whether a name is still free, asked while a reader types one. Names are public; emails are never asked about. */
async function nameFree(request: Request, env: Env): Promise<Response> {
  const name = (new URL(request.url).searchParams.get('name') ?? '').trim().toLowerCase();
  if (!NAME.test(name)) return json({ free: false, reason: 'bad-name' });
  if (!(await within(env, request, 'lookup', MAX_NAME_LOOKUPS_PER_DAY))) return refuse(429, 'too-many');
  const found = await env.DB.prepare('SELECT 1 FROM accounts WHERE name = ?1').bind(name).first();
  return json({ free: !found });
}

/** A name and its password, for the code of the card behind them. */
async function enterAccount(request: Request, env: Env): Promise<Response> {
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request);
  // What the reader typed is their name or their email.
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' && body.password.length <= 200 ? body.password : '';
  const row = NAME.test(name)
    ? await env.DB.prepare('SELECT name, email, card, salt, hash, iv, sealed FROM accounts WHERE name = ?1').bind(name).first<Account>()
    : EMAIL.test(name)
      ? await env.DB.prepare('SELECT name, email, card, salt, hash, iv, sealed FROM accounts WHERE email = ?1').bind(name).first<Account>()
      : null;
  // The same work whether or not there is such a name, so that the wait tells nothing.
  const { proof, seal } = await keysOf(password, row ? unhex(row.salt) : new Uint8Array(16));
  if (!row || !same(proof, row.hash)) return refuse(401, 'wrong');
  const code = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(row.iv) }, seal, unhex(row.sealed)));
  const card = await env.DB.prepare('SELECT role FROM cards WHERE id = ?1').bind(row.card).first<{ role: string }>();
  if (!card) return refuse(401, 'wrong');
  return json({ code, role: card.role, name: row.name, email: row.email });
}

/** A new password for the account of the card that asks, given the one it has. */
async function changeAccount(request: Request, env: Env, card: Card): Promise<Response> {
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request);
  const password = body?.password;
  const row = await env.DB.prepare('SELECT name, email, card, salt, hash, iv, sealed FROM accounts WHERE card = ?1').bind(card.id).first<Account>();
  if (!row) return refuse(404, 'no-account');
  const current = typeof body?.current === 'string' && body.current.length <= 200 ? body.current : '';
  if (!same((await keysOf(current, unhex(row.salt))).proof, row.hash)) return refuse(401, 'wrong');
  if (!goodPassword(password)) return refuse(400, 'bad-password');
  const kept = await sealUnder(password, codeIn(request));
  await env.DB.prepare('UPDATE accounts SET salt = ?1, hash = ?2, iv = ?3, sealed = ?4 WHERE name = ?5').bind(kept.salt, kept.hash, kept.iv, kept.sealed, row.name).run();
  return json({ ok: true });
}

/**
 * For a reader who has forgotten their password: the keeper gives the account a new one, made
 * here and shown once. The code of the card cannot be read back, so the card is given a new
 * code too; devices still holding the old one must sign in again.
 */
async function resetAccount(env: Env, name: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT card FROM accounts WHERE name = ?1').bind(name).first<{ card: string }>();
  if (!row) return refuse(404, 'no-account');
  const code = newCode();
  const id = await sha256(code);
  const password = [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => ALPHABET[byte & 31]).join('').toLowerCase();
  const kept = await sealUnder(password, code);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cards (id, created, seen, role) SELECT ?1, created, seen, role FROM cards WHERE id = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE rows SET card = ?1 WHERE card = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE reviews SET card = ?1 WHERE card = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE accounts SET card = ?1, salt = ?2, hash = ?3, iv = ?4, sealed = ?5 WHERE name = ?6').bind(id, kept.salt, kept.hash, kept.iv, kept.sealed, name),
    env.DB.prepare('DELETE FROM keeper_sessions WHERE card = ?1').bind(row.card),
    env.DB.prepare('DELETE FROM cards WHERE id = ?1').bind(row.card),
  ]);
  return json({ name, password });
}

async function accounts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT name, created FROM accounts ORDER BY created DESC LIMIT 500').all<{ name: string; created: number }>();
  return json({ accounts: results });
}

// ── What readers say ────────────────────────────────────────────────────────

const MAX_REVIEWS_PER_DAY = 60; // written or changed, from one address
const MAX_WORDS = 1000; // characters in a review's text
const SHOWN_REVIEWS = 100;

interface ReviewRow {
  card: string;
  name: string | null;
  stars: number | null;
  mood: string | null;
  text: string | null;
  changed: number;
}

/**
 * Everything readers have said of a book: how many stars on average, how it felt to them on
 * average, and the reviews with words in them, newest first. With the card of the reader
 * asking, their own review as well.
 */
async function reviewsOf(env: Env, book: string, card: Card | null): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT reviews.card AS card, accounts.name AS name, stars, mood, text, changed
     FROM reviews LEFT JOIN accounts ON accounts.card = reviews.card
     WHERE book = ?1 ORDER BY changed DESC LIMIT 2000`,
  )
    .bind(book)
    .all<ReviewRow>();
  let stars = 0;
  let starsN = 0;
  let moodN = 0;
  const sums = Object.fromEntries(AXES.map(({ id }) => [id, 0])) as Mood;
  let mine: { stars: number | null; mood: Mood | null; text: string | null } | null = null;
  const reviews: { name: string; stars: number | null; text: string; changed: number; mine: boolean }[] = [];
  for (const row of results) {
    const mood = row.mood ? (JSON.parse(row.mood) as Mood) : null;
    if (row.stars) {
      stars += row.stars;
      starsN += 1;
    }
    if (mood) {
      moodN += 1;
      for (const { id } of AXES) sums[id] += mood[id];
    }
    const own = !!card && row.card === card.id;
    if (own) mine = { stars: row.stars, mood, text: row.text };
    if (row.text && row.name && reviews.length < SHOWN_REVIEWS) reviews.push({ name: row.name, stars: row.stars, text: row.text, changed: row.changed, mine: own });
  }
  const mood = moodN ? (Object.fromEntries(AXES.map(({ id }) => [id, Math.round(sums[id] / moodN)])) as Mood) : null;
  return json({
    summary: { n: results.length, stars: starsN ? Math.round((stars / starsN) * 100) / 100 : null, starsN, mood, moodN },
    reviews,
    mine,
  });
}

/** Writes the review of the reader asking, in place of the one they had. Nothing in it takes it back. */
async function writeReview(request: Request, env: Env, card: Card, book: string): Promise<Response> {
  if (!(await known(env, book))) return refuse(404, 'no-such-book');
  if (!(await env.DB.prepare('SELECT 1 FROM accounts WHERE card = ?1').bind(card.id).first())) return refuse(403, 'needs-account');
  const body = await bodyOf(request, 8000);
  if (!body) return refuse(400, 'not-json');
  const stars = body.stars ?? null;
  if (stars !== null && (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5)) return refuse(400, 'bad-stars');
  const mood = body.mood == null ? null : moodFrom(body.mood);
  if (body.mood != null && !mood) return refuse(400, 'bad-mood');
  if (body.text != null && typeof body.text !== 'string') return refuse(400, 'bad-text');
  const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim().replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : null;
  if (text && text.length > MAX_WORDS) return refuse(400, 'too-long');
  if (!(await within(env, request, 'review', MAX_REVIEWS_PER_DAY))) return refuse(429, 'too-many');
  if (stars === null && !mood && !text) {
    await env.DB.prepare('DELETE FROM reviews WHERE book = ?1 AND card = ?2').bind(book, card.id).run();
  } else {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO reviews (book, card, stars, mood, text, created, changed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (book, card) DO UPDATE SET stars = excluded.stars, mood = excluded.mood, text = excluded.text, changed = excluded.changed`,
    )
      .bind(book, card.id, stars, mood ? JSON.stringify(mood) : null, text, now)
      .run();
  }
  return reviewsOf(env, book, card);
}

// ── A page of its own for each book ─────────────────────────────────────────

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
const inAttribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shortened = (text: string, most: number) => (text.length <= most ? text : `${text.slice(0, text.lastIndexOf(' ', most - 1))}…`);

/** A book as readers see it: the catalogue's entry or one the keeper added, with the keeper's corrections. */
async function entryOf(env: Env, id: string): Promise<Book | null> {
  let book = BY_ID.get(id) ?? null;
  if (!book) {
    const row = await env.DB.prepare('SELECT data FROM added_books WHERE id = ?1').bind(id).first<{ data: string }>();
    book = row ? (JSON.parse(row.data) as Book) : null;
  }
  if (!book) return null;
  const row = await env.DB.prepare('SELECT edits FROM book_overrides WHERE book = ?1').bind(id).first<{ edits: string }>();
  const edits = row ? (JSON.parse(row.edits) as Edits) : {};
  return { ...book, title: edits.title ?? book.title, author: edits.author ?? book.author, year: edits.year ?? book.year, description: { ...book.description, ...edits.description } };
}

/**
 * /book/<id>: the site itself, with the book's name, words and cover written into the head,
 * so that search engines find each book, and a link to one shows its cover where it is shared.
 * The page then opens the book over the wall (src/App.tsx).
 */
async function bookPage(request: Request, env: Env, id: string): Promise<Response> {
  const origin = new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`, { headers: { accept: 'text/html' } }));
  const book = BOOK.test(id) ? await entryOf(env, id) : null;
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' };
  if (!book) return new Response(shell.body, { status: 404, headers });
  const title = `${book.title} by ${book.author} · Incipit`;
  const description = shortened(book.description.en, 220);
  const page = `${origin}/book/${book.id}`;
  const image = KNOWN.has(book.id) ? `${origin}/covers/${book.id}-md.webp` : `${origin}/api/covers/${book.id}`;
  const facts = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    datePublished: String(book.year),
    numberOfPages: book.pages,
    inLanguage: book.language,
    image,
    url: page,
    description,
  };
  const content = (value: string) => ({
    element(element: Element) {
      element.setAttribute('content', value);
    },
  });
  const page_ = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', content(description))
    .on('meta[property="og:type"]', content('book'))
    .on('meta[property="og:title"]', content(title))
    .on('meta[property="og:description"]', content(description))
    .on('meta[property="og:url"]', content(page))
    .on('meta[property="og:image"]', content(image))
    .on('meta[name="twitter:title"]', content(title))
    .on('meta[name="twitter:description"]', content(description))
    .on('meta[name="twitter:image"]', content(image))
    .on('head', {
      element(element) {
        element.append(`<link rel="canonical" href="${inAttribute(page)}" /><script type="application/ld+json">${JSON.stringify(facts).replace(/</g, '\\u003c')}</script>`, { html: true });
      },
    })
    .transform(shell);
  return new Response(page_.body, { headers });
}

/** Every page there is, for search engines. */
async function sitemap(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const { results } = await env.DB.prepare('SELECT id FROM added_books').all<{ id: string }>();
  const paths = ['', 'globe', 'first-pages', 'about', ...BOOKS.map((book) => `book/${book.id}`), ...results.map((row) => `book/${row.id}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${origin}/${path}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
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
  /** The five axes, 0 to 100, in place of the catalogue's. */
  mood?: Mood;
  /** The keeper has looked the entry over, its mood above all. */
  reviewed?: boolean;
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
  if (given.mood !== undefined) {
    const mood = moodFrom(given.mood);
    if (!mood) return null;
    edits.mood = mood;
  }
  if (given.reviewed !== undefined) {
    if (typeof given.reviewed !== 'boolean') return null;
    if (given.reviewed) edits.reviewed = true;
  }
  return edits;
}

/** The five axes of a mood, each a whole number from 0 to 100, or null if anything is amiss. */
function moodFrom(value: unknown): Mood | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const mood = {} as Mood;
  for (const { id } of AXES) {
    const at = given[id];
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > 100) return null;
    mood[id] = at;
  }
  return mood;
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

/** The maker's words as the keeper may write them: short lines, a few paragraphs, a few links. */
interface Profile {
  name: string;
  line: string;
  why: string;
  about: string;
  links: { label: string; url: string }[];
}

function profileFrom(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null;
  const given = value as Record<string, unknown>;
  const text = (key: string, most: number) => (typeof given[key] === 'string' ? (given[key] as string).trim().slice(0, most) : '');
  const name = text('name', 80);
  if (!name) return null;
  const links = (Array.isArray(given.links) ? given.links : [])
    .slice(0, 8)
    .map((link) => (link && typeof link === 'object' ? (link as Record<string, unknown>) : {}))
    .map((link) => ({ label: typeof link.label === 'string' ? link.label.trim().slice(0, 40) : '', url: typeof link.url === 'string' ? link.url.trim().slice(0, 300) : '' }))
    // Only addresses a link may safely lead to.
    .filter((link) => link.label && /^(https:\/\/|mailto:)[^\s<>"']+$/i.test(link.url));
  return { name, line: text('line', 160), why: text('why', 6000), about: text('about', 6000), links };
}

async function profile(env: Env): Promise<Response> {
  const [words, picture] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare('SELECT data FROM profile WHERE id = 1'),
    env.DB.prepare('SELECT changed FROM portrait WHERE id = 1'),
  ]);
  return json({
    profile: words.results[0] ? (JSON.parse(words.results[0].data as string) as Profile) : null,
    portraitAt: (picture.results[0]?.changed as number | undefined) ?? 0,
  });
}

async function writeProfile(request: Request, env: Env): Promise<Response> {
  let written: Profile | null = null;
  try {
    written = profileFrom(JSON.parse((await request.text()).slice(0, MAX_BODY)));
  } catch {
    return refuse(400, 'not-json');
  }
  if (!written) return refuse(400, 'bad-profile');
  await env.DB.prepare('INSERT OR REPLACE INTO profile (id, data, changed) VALUES (1, ?1, ?2)').bind(JSON.stringify(written), Date.now()).run();
  return json({ profile: written });
}

async function keepPortrait(request: Request, env: Env): Promise<Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0];
  if (!COVER_TYPES.includes(type)) return refuse(400, 'bad-picture');
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_COVER) return refuse(413, 'too-large');
  const now = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO portrait (id, type, data, changed) VALUES (1, ?1, ?2, ?3)').bind(type, data, now).run();
  return json({ portraitAt: now });
}

async function portrait(env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT type, data FROM portrait WHERE id = 1').first<{ type: string; data: ArrayBuffer | number[] }>();
  if (!row) return refuse(404, 'no-portrait');
  // As with covers, the address carries the time it was kept (?v=).
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
  if (path === '/api/account/enter' && request.method === 'POST') return enterAccount(request, env);
  if (path === '/api/account/free' && request.method === 'GET') return nameFree(request, env);
  if (path === '/api/books' && request.method === 'GET') return overrides(env);
  if (path === '/api/profile' && request.method === 'GET') return profile(env);
  if (path === '/api/portrait' && request.method === 'GET') return portrait(env);

  const [, , section, book, rest] = path.split('/');
  // What readers say of a book is for everyone to read; whose own it is, only the card can tell.
  if (section === 'reviews' && request.method === 'GET' && BOOK.test(book ?? '') && rest === undefined) return reviewsOf(env, book, await cardOf(request, env));
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
  if (path === '/api/profile' || path === '/api/portrait') {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
    if (path === '/api/profile' && request.method === 'PUT') return writeProfile(request, env);
    if (path === '/api/portrait' && request.method === 'PUT') return keepPortrait(request, env);
    if (path === '/api/portrait' && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM portrait WHERE id = 1').run();
      return json({ portraitAt: 0 });
    }
    return refuse(404, 'not-found');
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

  if (section === 'accounts') {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
    if (book === undefined && request.method === 'GET') return accounts(env);
    if (NAME.test(book ?? '') && rest === 'reset' && request.method === 'POST') return resetAccount(env, book);
    return refuse(404, 'not-found');
  }
  if (section === 'reviews' && BOOK.test(book ?? '')) {
    if (rest === undefined && request.method === 'PUT') return writeReview(request, env, card, book);
    if (rest === undefined && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM reviews WHERE book = ?1 AND card = ?2').bind(book, card.id).run();
      return reviewsOf(env, book, card);
    }
    // The keeper can take down what a reader wrote.
    if (NAME.test(rest ?? '') && request.method === 'DELETE') {
      const shut = await keeperGate(request, env, card);
      if (shut) return shut;
      await env.DB.prepare('DELETE FROM reviews WHERE book = ?1 AND card = (SELECT card FROM accounts WHERE name = ?2)').bind(book, rest).run();
      return reviewsOf(env, book, card);
    }
    return refuse(404, 'not-found');
  }
  if (path === '/api/account' && request.method === 'POST') return makeAccount(request, env, card);
  if (path === '/api/account' && request.method === 'PUT') return changeAccount(request, env, card);

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
    const account = await env.DB.prepare('SELECT name, email FROM accounts WHERE card = ?1').bind(card.id).first<{ name: string; email: string | null }>();
    return json({ role: card.role, rows: held?.n ?? 0, created: card.created, name: account?.name ?? null, email: account?.email ?? null });
  }
  if (path === '/api/sync' && request.method === 'POST') return sync(request, env, card);
  if (path === '/api/card' && request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rows WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM accounts WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM reviews WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM cards WHERE id = ?1').bind(card.id),
    ]);
    return json({ ok: true });
  }
  return refuse(404, 'not-found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith('/book/')) return await bookPage(request, env, decodeURIComponent(pathname.slice('/book/'.length)).replace(/\/$/, ''));
      if (pathname === '/sitemap.xml') return await sitemap(request, env);
    } catch (error) {
      console.error(error);
      return env.ASSETS.fetch(new Request(new URL('/', request.url)));
    }
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, pathname);
    } catch (error) {
      console.error(error);
      return refuse(500, 'server-error');
    }
  },
} satisfies ExportedHandler<Env>;
