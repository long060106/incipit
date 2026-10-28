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

  A reader who has forgotten their password, and gave an email with their account, can be sent
  a link that sets a new one. The site sends it through a mail service (Brevo or Resend) whose
  key the owner of the site keeps as a secret of the worker; without one, these answer 503 and
  the keeper sets the password again by hand (POST /api/accounts/<name>/reset).

    GET    /api/account/forgot   can a link be sent at all                  -> { mail }
    POST   /api/account/forgot   send one: { who, lang }                    -> { ok }
    POST   /api/account/reset    use it: { token, password }                -> as /api/account/enter

  An account always has an email. A reader may also sign in with Google (the button of Google
  Identity Services, whose signed token is checked here). It needs the site's client id (the
  variable GOOGLE_CLIENT_ID, in wrangler.jsonc) and a secret that seals the cards of those accounts
  (ACCOUNT_SEAL_KEY); without them these answer 503 and the page shows no button.

    GET    /api/account/google   the client id, or null if Google is not on -> { client }
    POST   /api/account/google   { credential, name? }: sign in; 404 `new` if the person has no
                                 account yet, and then with a name it makes one -> as /api/account/enter
    POST   /api/account/link     tie the Google person of { credential } to the account of the
                                 card presented, when its email is the account's own

  Records are the flat rows of src/lib/shelf.ts: a key, a JSON value (absent once deleted)
  and the time the reader last changed it. Between two devices the later change wins.
*/

import { BOOKS } from '../src/data/books';
import { LANGS, type Book, type BookL, type L, type Lang, type Mood } from '../src/data/types';
import { AXES, GENRES, KEYWORDS, LANGUAGES } from '../src/data/vocab';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** The mail service's key, kept as a secret (`wrangler secret put`): Brevo's, or Resend's. */
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  /** Who the letters are from: "Incipit <address>", an address the mail service has verified. */
  MAIL_FROM?: string;
  /** '1' on a development server only: a letter is handed back in the answer instead of sent. */
  MAIL_DEV?: string;
  /** The id of the site's client at Google, which is public (wrangler.jsonc), and the secret that seals a card's code for the accounts opened with Google. */
  GOOGLE_CLIENT_ID?: string;
  ACCOUNT_SEAL_KEY?: string;
  /** A development server only: the keys Google's tokens are checked against instead of Google's own (base64 of a JWKS). */
  GOOGLE_DEV_KEYS?: string;
  /** Workers AI (wrangler.jsonc), which turns a reader's few words into filters (/api/ask). */
  AI?: Ai;
  /** Google's key for Gemini, kept as a secret (`wrangler secret put GEMINI_API_KEY`). Absent, /api/ask uses Workers AI alone. */
  GEMINI_API_KEY?: string;
  /** '1' on a development server only: /api/ask answers without the model, which runs only at Cloudflare. */
  ASK_DEV?: string;
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
const MAX_FORGOT_PER_DAY = 10; // links asked for, from one address
const MAX_LETTERS_PER_ACCOUNT = 3; // links sent to one account in a day
const RESET_FOR = 30 * 60 * 1000; // milliseconds a link works
const DAY = 24 * 60 * 60 * 1000;
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
  // A development server (the tests) makes many accounts from one address.
  return (row?.count ?? 1) <= (mailDev(request, env) ? most * 100 : most);
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
  google?: string | null;
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
  // Everyone gives an email: a forgotten password is set again by it, and it opens the account instead of the name.
  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const password = body?.password;
  if (!NAME.test(name)) return refuse(400, 'bad-name');
  if (email === null || email.length > 254 || !EMAIL.test(email)) return refuse(400, 'bad-email');
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
    ? await env.DB.prepare('SELECT name, email, google, card, salt, hash, iv, sealed FROM accounts WHERE name = ?1').bind(name).first<Account>()
    : EMAIL.test(name)
      ? await env.DB.prepare('SELECT name, email, google, card, salt, hash, iv, sealed FROM accounts WHERE email = ?1').bind(name).first<Account>()
      : null;
  // The same work whether or not there is such a name, so that the wait tells nothing.
  const { proof, seal } = await keysOf(password, row ? unhex(row.salt) : new Uint8Array(16));
  if (!row || !same(proof, row.hash)) return refuse(401, 'wrong');
  const code = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(row.iv) }, seal, unhex(row.sealed)));
  const card = await env.DB.prepare('SELECT role FROM cards WHERE id = ?1').bind(row.card).first<{ role: string }>();
  if (!card) return refuse(401, 'wrong');
  return json({ code, role: card.role, name: row.name, email: row.email, google: !!row.google, password: true });
}

/** A new password for the account of the card that asks, given the one it has. */
async function changeAccount(request: Request, env: Env, card: Card): Promise<Response> {
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request);
  const password = body?.password;
  const row = await env.DB.prepare('SELECT name, email, card, salt, hash, iv, sealed FROM accounts WHERE card = ?1').bind(card.id).first<Account>();
  if (!row) return refuse(404, 'no-account');
  if (!row.hash) return refuse(400, 'no-password');
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
  const password = [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => ALPHABET[byte & 31]).join('').toLowerCase();
  if (!(await rekey(env, name, password))) return refuse(404, 'no-account');
  return json({ name, password });
}

/**
 * Puts a new password in front of an account. The code of its card cannot be read back without
 * the old one, so the card is given a new code and everything kept under the old one moves to
 * it; devices still holding the old code must sign in again.
 */
async function rekey(env: Env, name: string, password: string): Promise<{ code: string; role: string } | null> {
  const row = await env.DB.prepare('SELECT accounts.card, accounts.gseal, cards.role FROM accounts JOIN cards ON cards.id = accounts.card WHERE accounts.name = ?1')
    .bind(name)
    .first<{ card: string; gseal: string | null; role: string }>();
  if (!row) return null;
  const code = newCode();
  const id = await sha256(code);
  const kept = await sealUnder(password, code);
  // An account tied to Google keeps its card's new code sealed for Google too.
  const gseal = row.gseal && googleReady(env) ? await sealToServer(env, code) : null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cards (id, created, seen, role) SELECT ?1, created, seen, role FROM cards WHERE id = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE rows SET card = ?1 WHERE card = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE reviews SET card = ?1 WHERE card = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE essay_reports SET card = ?1 WHERE card = ?2').bind(id, row.card),
    env.DB.prepare('UPDATE accounts SET card = ?1, salt = ?2, hash = ?3, iv = ?4, sealed = ?5, gseal = ?6 WHERE name = ?7').bind(id, kept.salt, kept.hash, kept.iv, kept.sealed, gseal, name),
    env.DB.prepare('DELETE FROM keeper_sessions WHERE card = ?1').bind(row.card),
    env.DB.prepare('DELETE FROM cards WHERE id = ?1').bind(row.card),
    env.DB.prepare('DELETE FROM resets WHERE name = ?1').bind(name),
  ]);
  return { code, role: row.role };
}

// ── Forgotten passwords ─────────────────────────────────────────────────────

const mailReady = (env: Env) => !!env.MAIL_FROM && !!(env.BREVO_API_KEY || env.RESEND_API_KEY);
/** A development server asked to hand letters back: never the site itself, whatever it is told. */
const mailDev = (request: Request, env: Env) => env.MAIL_DEV === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);

interface Letter {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends a letter through the mail service whose key the worker holds. */
async function send(env: Env, letter: Letter): Promise<void> {
  const from = /^(.*)<([^>]+)>\s*$/.exec(env.MAIL_FROM ?? '');
  const sender = from ? { name: from[1].trim() || 'Incipit', email: from[2].trim() } : { name: 'Incipit', email: (env.MAIL_FROM ?? '').trim() };
  try {
    const response = env.RESEND_API_KEY
      ? await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: `${sender.name} <${sender.email}>`, to: [letter.to], subject: letter.subject, text: letter.text, html: letter.html }),
        })
      : await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY ?? '', 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender, to: [{ email: letter.to }], subject: letter.subject, textContent: letter.text, htmlContent: letter.html }),
        });
    if (!response.ok) console.error('mail refused', response.status, await response.text().catch(() => ''));
  } catch (error) {
    console.error('mail failed', error);
  }
}

function resetLetter(link: string, name: string, lang: Lang): Omit<Letter, 'to'> {
  const words = {
    en: {
      subject: 'A new password for Incipit',
      hello: `Hello ${name},`,
      why: 'Someone, we hope you, asked for a new password for your Incipit account. Open this link to choose one. It works once, for 30 minutes:',
      button: 'Choose a new password',
      ignore: 'If you did not ask, ignore this email: your password stays as it is.',
    },
    fr: {
      subject: 'Un nouveau mot de passe pour Incipit',
      hello: `Bonjour ${name},`,
      why: 'Quelqu’un, vous sans doute, a demandé un nouveau mot de passe pour votre compte Incipit. Ouvrez ce lien pour le choisir. Il fonctionne une fois, pendant 30 minutes :',
      button: 'Choisir un nouveau mot de passe',
      ignore: 'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste le même.',
    },
    ru: {
      subject: 'Новый пароль для Incipit',
      hello: `Здравствуйте, ${name}!`,
      why: 'Кто-то — надеемся, вы — попросил новый пароль для вашего аккаунта Incipit. Откройте эту ссылку, чтобы выбрать его. Она срабатывает один раз в течение 30 минут:',
      button: 'Выбрать новый пароль',
      ignore: 'Если вы ничего не просили, просто не обращайте внимания на это письмо: ваш пароль остаётся прежним.',
    },
    vi: {
      subject: 'Mật khẩu mới cho Incipit',
      hello: `Chào ${name},`,
      why: 'Có người, mong là bạn, đã xin mật khẩu mới cho tài khoản Incipit của bạn. Mở đường dẫn này để chọn mật khẩu. Đường dẫn dùng được một lần, trong 30 phút:',
      button: 'Chọn mật khẩu mới',
      ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu của bạn vẫn giữ nguyên.',
    },
  }[lang];
  const text = `${words.hello}\n\n${words.why}\n\n${link}\n\n${words.ignore}\n\nIncipit`;
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1b1a17;max-width:520px">
<p>${inText(words.hello)}</p><p>${inText(words.why)}</p>
<p><a href="${inAttribute(link)}" style="display:inline-block;padding:10px 18px;background:#7a1f2b;color:#f4f0e8;text-decoration:none;border-radius:4px">${inText(words.button)}</a></p>
<p style="font-size:13px;color:#5c574d;word-break:break-all">${inText(link)}</p>
<p style="font-size:13px;color:#5c574d">${inText(words.ignore)}</p><p>Incipit</p></div>`;
  return { subject: words.subject, text, html };
}

/**
 * Sends a link that sets a new password to the email of the account named, or of the account
 * with that email. The answer is the same whether or not there is such an account, and the letter
 * goes out after it, so that neither the answer nor the wait says whether an email is known.
 */
async function forgot(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const dev = mailDev(request, env);
  if (!mailReady(env) && !dev) return refuse(503, 'no-mail');
  if (!(await within(env, request, 'forgot', MAX_FORGOT_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request);
  const who = typeof body?.who === 'string' ? body.who.trim().toLowerCase() : '';
  const lang = LANGS.find((known) => known === body?.lang) ?? 'en';
  const row = NAME.test(who)
    ? await env.DB.prepare('SELECT name, email FROM accounts WHERE name = ?1').bind(who).first<{ name: string; email: string | null }>()
    : EMAIL.test(who)
      ? await env.DB.prepare('SELECT name, email FROM accounts WHERE email = ?1').bind(who).first<{ name: string; email: string | null }>()
      : null;
  if (!row?.email) return json({ ok: true });
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM resets WHERE name = ?1 AND created > ?2').bind(row.name, now - DAY).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_LETTERS_PER_ACCOUNT) return json({ ok: true });
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM resets WHERE created < ?1').bind(now - 2 * DAY),
    env.DB.prepare('INSERT INTO resets (id, name, created, expires) VALUES (?1, ?2, ?3, ?4)').bind(await sha256(token), row.name, now, now + RESET_FOR),
  ]);
  // In the fragment, so the token is never sent to a server, nor in a Referer.
  const link = `${new URL(request.url).origin}/signin#reset=${token}`;
  if (dev) return json({ ok: true, letter: { to: row.email, link } });
  ctx.waitUntil(send(env, { to: row.email, ...resetLetter(link, row.name, lang) }));
  return json({ ok: true });
}

/** A link from a letter, and the new password: the account is opened, as with a name and a password. */
async function resetByLetter(request: Request, env: Env): Promise<Response> {
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = body?.password;
  if (!/^[0-9a-f]{64}$/.test(token)) return refuse(400, 'bad-link');
  if (!goodPassword(password)) return refuse(400, 'bad-password');
  // Marking the link used and checking that it was still good are one statement, so it works once.
  const now = Date.now();
  const taken = await env.DB.prepare('UPDATE resets SET used = ?2 WHERE id = ?1 AND used IS NULL AND expires > ?2 RETURNING name')
    .bind(await sha256(token), now)
    .first<{ name: string }>();
  if (!taken) return refuse(400, 'bad-link');
  const opened = await rekey(env, taken.name, password);
  if (!opened) return refuse(400, 'bad-link');
  const account = await env.DB.prepare('SELECT name, email, google FROM accounts WHERE name = ?1').bind(taken.name).first<{ name: string; email: string | null; google: string | null }>();
  return json({ code: opened.code, role: opened.role, name: account?.name ?? taken.name, email: account?.email ?? null, google: !!account?.google, password: true });
}

// ── Signing in with Google ──────────────────────────────────────────────────

/*
  The page shows Google's own button (Google Identity Services); Google hands the page a signed
  token that says who the reader is, and the page sends it here. The token is checked as Google
  signs it: its signature against Google's public keys, its audience (this site's client id), its
  expiry, and that Google has confirmed the email. Nothing else of Google's is asked or kept:
  only the person's id, and the email, which the account must have anyway.
*/

const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const googleReady = (env: Env) => !!env.GOOGLE_CLIENT_ID && !!env.ACCOUNT_SEAL_KEY;

const unb64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

type GoogleKey = JsonWebKey & { kid?: string };
let googleKeys: { at: number; keys: GoogleKey[] } | null = null;

/** The keys Google signs with, kept an hour. A development server may bring its own. */
async function keysOfGoogle(request: Request, env: Env): Promise<GoogleKey[]> {
  if (env.GOOGLE_DEV_KEYS && mailDev(request, env)) return (JSON.parse(new TextDecoder().decode(unb64(env.GOOGLE_DEV_KEYS))) as { keys: GoogleKey[] }).keys;
  if (googleKeys && Date.now() - googleKeys.at < 60 * 60 * 1000) return googleKeys.keys;
  const response = await fetch(GOOGLE_KEYS, { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error(`Google's keys: ${response.status}`);
  googleKeys = { at: Date.now(), keys: ((await response.json()) as { keys: GoogleKey[] }).keys };
  return googleKeys.keys;
}

/** Who a token from Google says the reader is, or null if it cannot be trusted. */
async function googleWho(request: Request, env: Env, credential: unknown): Promise<{ sub: string; email: string } | null> {
  if (typeof credential !== 'string' || credential.length > 4000) return null;
  const parts = credential.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(unb64(parts[0]))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(unb64(parts[1]))) as Record<string, unknown>;
    if (header.alg !== 'RS256') return null;
    const jwk = (await keysOfGoogle(request, env)).find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))) return null;
    if (claims.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') return null;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000 - 60) return null;
    if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') return null;
    if (claims.email_verified !== true && claims.email_verified !== 'true') return null;
    const email = claims.email.trim().toLowerCase();
    return email.length <= 254 && EMAIL.test(email) ? { sub: claims.sub, email } : null;
  } catch {
    return null;
  }
}

/** The key that seals the code of a card for an account opened with Google. */
async function serverSeal(env: Env): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account-seal:${env.ACCOUNT_SEAL_KEY}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function sealToServer(env: Env, code: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await serverSeal(env), new TextEncoder().encode(code)));
  return `${hex(iv)}.${hex(sealed)}`;
}

async function openFromServer(env: Env, kept: string): Promise<string | null> {
  const [iv, sealed] = kept.split('.');
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(iv ?? '') }, await serverSeal(env), unhex(sealed ?? '')));
  } catch {
    return null;
  }
}

/**
 * A token from Google, for the account tied to that person. If there is none yet, and the email is
 * not one an account already has, it answers 404 `new` with the email: the page then asks for a
 * name, and sends the token again with it, which makes the account.
 */
async function googleEnter(request: Request, env: Env): Promise<Response> {
  if (!googleReady(env)) return refuse(503, 'no-google');
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const body = await bodyOf(request, 6000);
  const who = await googleWho(request, env, body?.credential);
  if (!who) return refuse(401, 'wrong');
  const found = await env.DB.prepare('SELECT name, email, card, hash, gseal FROM accounts WHERE google = ?1')
    .bind(who.sub)
    .first<{ name: string; email: string | null; card: string; hash: string; gseal: string | null }>();
  if (found) {
    const code = found.gseal ? await openFromServer(env, found.gseal) : null;
    const card = await env.DB.prepare('SELECT role FROM cards WHERE id = ?1').bind(found.card).first<{ role: string }>();
    if (!code || !card) return refuse(401, 'wrong');
    return json({ code, role: card.role, name: found.name, email: found.email, google: true, password: found.hash !== '' });
  }
  // An account already has this email: Google's word is not enough to open it. Its owner signs in
  // as before (or sets a password again by email), then ties Google to it from the account page.
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE email = ?1').bind(who.email).first()) return refuse(409, 'has-account');
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : '';
  if (!name) return json({ error: 'new', email: who.email }, 404);
  if (!NAME.test(name)) return refuse(400, 'bad-name');
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE name = ?1').bind(name).first()) return refuse(409, 'taken');
  if (!(await within(env, request, 'account', MAX_ACCOUNTS_PER_DAY))) return refuse(429, 'too-many');
  const code = newCode();
  const id = await sha256(code);
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO cards (id, created, seen, role) VALUES (?1, ?2, ?2, 'reader')").bind(id, now),
      env.DB.prepare("INSERT INTO accounts (name, email, card, salt, hash, iv, sealed, created, google, gseal) VALUES (?1, ?2, ?3, '', '', '', '', ?4, ?5, ?6)").bind(
        name,
        who.email,
        id,
        now,
        who.sub,
        await sealToServer(env, code),
      ),
    ]);
  } catch {
    // Someone took the name, or this person, in the same moment.
    return refuse(409, 'taken');
  }
  return json({ code, role: 'reader', name, email: who.email, google: true, password: false }, 201);
}

/** Ties a Google person to the account of the card that asks, if it is the account's own email. */
async function googleLink(request: Request, env: Env, card: Card): Promise<Response> {
  if (!googleReady(env)) return refuse(503, 'no-google');
  if (!(await within(env, request, 'enter', MAX_ENTERS_PER_DAY))) return refuse(429, 'too-many');
  const who = await googleWho(request, env, (await bodyOf(request, 6000))?.credential);
  if (!who) return refuse(401, 'wrong');
  const row = await env.DB.prepare('SELECT name, email FROM accounts WHERE card = ?1').bind(card.id).first<{ name: string; email: string | null }>();
  if (!row) return refuse(404, 'no-account');
  if (row.email !== who.email) return refuse(409, 'email-differs');
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE google = ?1 AND card != ?2').bind(who.sub, card.id).first()) return refuse(409, 'google-taken');
  await env.DB.prepare('UPDATE accounts SET google = ?1, gseal = ?2 WHERE card = ?3').bind(who.sub, await sealToServer(env, codeIn(request)), card.id).run();
  return json({ ok: true });
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
  tone: number | null;
}

/**
 * Everything readers have said of a book: how many stars on average, how it felt to them on
 * average, and the reviews with words in them, newest first. With the card of the reader
 * asking, their own review as well.
 */
async function reviewsOf(env: Env, book: string, card: Card | null): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT reviews.card AS card, accounts.name AS name, stars, mood, text, reviews.changed AS changed, people.tone AS tone
     FROM reviews LEFT JOIN accounts ON accounts.card = reviews.card LEFT JOIN people ON people.name = accounts.name
     WHERE book = ?1 ORDER BY reviews.changed DESC LIMIT 2000`,
  )
    .bind(book)
    .all<ReviewRow>();
  let stars = 0;
  let starsN = 0;
  let moodN = 0;
  const sums = Object.fromEntries(AXES.map(({ id }) => [id, 0])) as Mood;
  let mine: { stars: number | null; mood: Mood | null; text: string | null } | null = null;
  const reviews: { name: string; tone: number; stars: number | null; text: string; changed: number; mine: boolean }[] = [];
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
    if (row.text && row.name && reviews.length < SHOWN_REVIEWS) reviews.push({ name: row.name, tone: row.tone ?? -1, stars: row.stars, text: row.text, changed: row.changed, mine: own });
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

// ── Readers' own pages, and their essays ────────────────────────────────────
//
//   GET    /api/people/<name>          a reader's page: their words, reviews and essays
//   PUT    /api/people                 the reader's own: { bio, tone, reading }
//   GET    /api/essays[?book=&before=] the essays the keeper has approved, newest first
//   GET    /api/essays/<id>            one: approved, or the author's own, or for the keeper
//   POST   /api/essays                 write one: { title, body, books }; it waits for the keeper
//   PUT    /api/essays/<id>            write it again; it waits for the keeper again
//   DELETE /api/essays/<id>            take it away (its author, or the keeper)
//   POST   /api/essays/<id>/report     flag an approved essay for the keeper to look at again
//   GET    /api/essays/queue           what waits for the keeper, and what was flagged (keeper only)
//   POST   /api/essays/<id>/decide     { approve, reason? }                          (keeper only)
//   GET    /api/essays/<id>/comments   the answers to an approved essay, oldest first
//   POST   /api/essays/<id>/comments   answer it: { body }
//   DELETE /api/essays/<id>/comments/<c> take an answer away (its writer, the essay's author, or the keeper)
//   PUT    /api/people/quotes          the passages a reader shows on their page: { quotes: [{ id, book, quote }] }

const TONES = 8;
const MAX_BIO = 280;
const MAX_TITLE = 140;
const MIN_ESSAY = 300; // characters
const MAX_ESSAY = 20_000;
/** Quotation is welcome, a whole chapter is not: lines that begin with ">" may hold this many characters in all. */
const MAX_QUOTED = 1_500;
const MAX_ESSAY_BOOKS = 3;
const MAX_ESSAYS_PER_DAY = 8; // written or written again, from one address
const MAX_WAITING = 5; // one reader's essays waiting for the keeper at once
const MAX_REPORTS_PER_DAY = 30;
const MAX_REASON = 400;
const SHOWN_ESSAYS = 30;
const ESSAY_ID = /^[a-z0-9]{12}$/;
const ESSAY_LIST = 'id, author, title, excerpt, words, books, status, reason, reports, created, changed, decided';
/** How many have answered an essay, for the lists and the essay's page. */
const COMMENT_COUNT = '(SELECT COUNT(*) FROM essay_comments WHERE essay_comments.essay = essays.id) AS comments';
const MAX_COMMENT = 2_000;
const MAX_COMMENTS_PER_DAY = 40; // from one address
const SHOWN_COMMENTS = 300;
const MAX_PASSAGES = 12;
const MAX_PASSAGE = 500;
const MARK_ID = /^[a-z0-9]{4,24}$/;

interface EssayRow {
  id: string;
  author: string;
  title: string;
  excerpt: string;
  words: number;
  books: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  reports: number;
  created: number;
  changed: number;
  decided: number | null;
  body?: string;
  tone?: number | null;
  comments?: number;
}

/** An essay as it is sent: the books as a list, and what only its author or the keeper is told left out for others. */
function essayOut(row: EssayRow, full: boolean) {
  return {
    id: row.id,
    author: row.author,
    tone: row.tone ?? -1,
    title: row.title,
    excerpt: row.excerpt,
    words: row.words,
    books: row.books.split(',').filter(Boolean),
    at: row.decided ?? row.changed,
    ...(row.body !== undefined ? { body: row.body } : {}),
    ...(row.comments !== undefined ? { comments: row.comments } : {}),
    ...(full ? { status: row.status, reason: row.reason, reports: row.reports, created: row.created, changed: row.changed } : {}),
  };
}

const accountOf = (env: Env, card: Card) => env.DB.prepare('SELECT name, created FROM accounts WHERE card = ?1').bind(card.id).first<{ name: string; created: number }>();

/** An essay's first words, without its marks. */
function excerptOf(body: string): string {
  const plain = body
    .split('\n')
    .filter((line) => !/^\s*(#{1,3}\s|---\s*$)/.test(line))
    // A quotation keeps its marks, so as not to run into the words after it.
    .map((line) => (line.startsWith('>') ? `“${line.replace(/^>\s?/, '').trim()}”` : line))
    .join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_>`]+/g, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return shortened(plain, 260);
}

/** What a reader wrote, as it will be kept, or the reason it cannot be. */
async function essayFrom(env: Env, body: Record<string, unknown> | null): Promise<{ title: string; body: string; books: string[] } | string> {
  if (!body) return 'not-json';
  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
  if (!title || title.length > MAX_TITLE) return 'bad-title';
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (text.length < MIN_ESSAY) return 'too-short';
  if (text.length > MAX_ESSAY) return 'too-long';
  const quoted = text
    .split('\n')
    .filter((line) => line.startsWith('>'))
    .reduce((sum, line) => sum + line.length, 0);
  if (quoted > MAX_QUOTED) return 'too-much-quoted';
  const books = Array.isArray(body.books) ? [...new Set(body.books)] : [];
  if (books.length > MAX_ESSAY_BOOKS || !books.every((book) => typeof book === 'string' && BOOK.test(book))) return 'bad-books';
  for (const book of books as string[]) if (!(await known(env, book))) return 'bad-books';
  return { title, body: text, books: books as string[] };
}

const newEssayId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => '0123456789abcdefghijklmnopqrstuvwxyz'[byte % 36]).join('');

/** A reader's page: what they say of themselves, their reviews and their essays. Their own page shows them every essay, approved or not. */
async function personPage(env: Env, name: string, card: Card | null): Promise<Response> {
  const person = await env.DB.prepare(
    `SELECT accounts.name AS name, accounts.created AS joined, accounts.card AS card, people.bio AS bio, people.tone AS tone, people.reading AS reading, people.quotes AS quotes
     FROM accounts LEFT JOIN people ON people.name = accounts.name WHERE accounts.name = ?1`,
  )
    .bind(name)
    .first<{ name: string; joined: number; card: string; bio: string | null; tone: number | null; reading: number | null; quotes: string | null }>();
  if (!person) return refuse(404, 'no-such-reader');
  const own = !!card && card.id === person.card;
  const [reviews, essays, places] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare('SELECT book, stars, text, changed FROM reviews WHERE card = ?1 AND (stars IS NOT NULL OR text IS NOT NULL) ORDER BY changed DESC LIMIT 60').bind(person.card),
    env.DB.prepare(
      own
        ? `SELECT ${ESSAY_LIST} FROM essays WHERE author = ?1 ORDER BY changed DESC LIMIT 100`
        : `SELECT ${ESSAY_LIST} FROM essays WHERE author = ?1 AND status = 'approved' ORDER BY decided DESC LIMIT 100`,
    ).bind(name),
    // Where they are in each book is in their notebook; only the books are told, and only if they say so.
    env.DB.prepare("SELECT key FROM rows WHERE card = ?1 AND key LIKE 'place:%' AND value IS NOT NULL ORDER BY changed DESC LIMIT 24").bind(person.card),
  ]);
  const showsReading = person.reading === 1;
  const reading = showsReading || own ? places.results.map((row) => (row.key as string).slice('place:'.length)).filter((book) => KNOWN.has(book)).slice(0, 8) : null;
  return json({
    name: person.name,
    joined: person.joined,
    bio: person.bio ?? '',
    tone: person.tone ?? -1,
    showsReading,
    reading,
    reviews: reviews.results,
    quotes: passagesOf(person.quotes),
    essays: essays.results.map((row) => essayOut({ ...(row as unknown as EssayRow), tone: person.tone }, own)),
    own,
  });
}

async function writePerson(request: Request, env: Env, card: Card): Promise<Response> {
  const account = await accountOf(env, card);
  if (!account) return refuse(403, 'needs-account');
  const body = await bodyOf(request);
  if (!body) return refuse(400, 'not-json');
  const bio = typeof body.bio === 'string' ? body.bio.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (bio.length > MAX_BIO) return refuse(400, 'too-long');
  const tone = body.tone ?? -1;
  if (typeof tone !== 'number' || !Number.isInteger(tone) || tone < -1 || tone >= TONES) return refuse(400, 'bad-tone');
  if (typeof body.reading !== 'boolean') return refuse(400, 'bad-reading');
  await env.DB.prepare(
    `INSERT INTO people (name, bio, tone, reading, changed) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (name) DO UPDATE SET bio = excluded.bio, tone = excluded.tone, reading = excluded.reading, changed = excluded.changed`,
  )
    .bind(account.name, bio, tone, body.reading ? 1 : 0, Date.now())
    .run();
  return personPage(env, account.name, card);
}

interface Passage {
  id: string;
  book: string;
  quote: string;
}

const passagesOf = (text: string | null): Passage[] => {
  try {
    const list = JSON.parse(text ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/**
 * The passages a reader chose from their notebook to show on their page, each the words of a
 * mark and its book. Only books out of copyright: their words may be shown to everyone.
 */
async function writePassages(request: Request, env: Env, card: Card): Promise<Response> {
  const account = await accountOf(env, card);
  if (!account) return refuse(403, 'needs-account');
  const body = await bodyOf(request, MAX_PASSAGES * (MAX_PASSAGE + 200) * 2);
  const list = Array.isArray(body?.quotes) ? (body.quotes as unknown[]) : null;
  if (!list || list.length > MAX_PASSAGES) return refuse(400, 'bad-quotes');
  const quotes: Passage[] = [];
  for (const item of list) {
    const { id, book, quote } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !MARK_ID.test(id) || typeof book !== 'string' || typeof quote !== 'string') return refuse(400, 'bad-quotes');
    if (!BY_ID.get(book)?.free) return refuse(400, 'bad-quotes');
    const words = quote.replace(/\s+/g, ' ').trim();
    if (!words || words.length > MAX_PASSAGE) return refuse(400, 'bad-quotes');
    if (!quotes.some((kept) => kept.id === id)) quotes.push({ id, book, quote: words });
  }
  await env.DB.prepare(
    `INSERT INTO people (name, quotes, changed) VALUES (?1, ?2, ?3)
     ON CONFLICT (name) DO UPDATE SET quotes = excluded.quotes, changed = excluded.changed`,
  )
    .bind(account.name, JSON.stringify(quotes), Date.now())
    .run();
  return personPage(env, account.name, card);
}

/** The approved essays, newest first: all of them, or those on one book. */
async function essayList(request: Request, env: Env): Promise<Response> {
  const asked = new URL(request.url).searchParams;
  const book = asked.get('book') ?? '';
  const before = Number(asked.get('before')) || Number.MAX_SAFE_INTEGER;
  if (book && !BOOK.test(book)) return refuse(400, 'bad-book');
  const { results } = await env.DB.prepare(
    `SELECT ${ESSAY_LIST.split(', ')
      .map((column) => `essays.${column}`)
      .join(', ')}, people.tone AS tone, ${COMMENT_COUNT}
     FROM essays LEFT JOIN people ON people.name = essays.author
     WHERE essays.status = 'approved' AND essays.decided < ?1 ${book ? 'AND essays.books LIKE ?2' : ''}
     ORDER BY essays.decided DESC LIMIT ${SHOWN_ESSAYS}`,
  )
    .bind(...(book ? [before, `%,${book},%`] : [before]))
    .all<EssayRow>();
  return json({ essays: results.map((row) => essayOut(row, false)), more: results.length === SHOWN_ESSAYS });
}

async function essayRow(env: Env, id: string): Promise<EssayRow | null> {
  return env.DB.prepare(
    `SELECT ${ESSAY_LIST.split(', ')
      .map((column) => `essays.${column}`)
      .join(', ')}, essays.body AS body, people.tone AS tone, ${COMMENT_COUNT}
     FROM essays LEFT JOIN people ON people.name = essays.author WHERE essays.id = ?1`,
  )
    .bind(id)
    .first<EssayRow>();
}

/** One essay: for everyone once approved; before that, for its author and the keeper alone. */
async function essayOne(request: Request, env: Env, id: string): Promise<Response> {
  const row = await essayRow(env, id);
  if (!row) return refuse(404, 'no-such-essay');
  const card = await cardOf(request, env);
  const mine = !!card && (await accountOf(env, card))?.name === row.author;
  const keeper = !!card && card.role === 'admin' && (await deskOpen(request, env, card));
  if (row.status !== 'approved' && !mine && !keeper) return refuse(404, 'no-such-essay');
  return json({ essay: { ...essayOut(row, mine || keeper), mine } });
}

/** Writes a new essay, or one of the reader's own again. Either way it waits for the keeper. */
async function writeEssay(request: Request, env: Env, card: Card, id: string | null): Promise<Response> {
  const account = await accountOf(env, card);
  if (!account) return refuse(403, 'needs-account');
  const written = await essayFrom(env, await bodyOf(request, MAX_ESSAY * 2 + 4000));
  if (typeof written === 'string') return refuse(400, written);
  if (id) {
    const before = await env.DB.prepare('SELECT author FROM essays WHERE id = ?1').bind(id).first<{ author: string }>();
    if (!before || before.author !== account.name) return refuse(404, 'no-such-essay');
  } else {
    const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM essays WHERE author = ?1 AND status = 'pending'").bind(account.name).first<{ n: number }>();
    if ((waiting?.n ?? 0) >= MAX_WAITING) return refuse(429, 'too-many-waiting');
  }
  if (!(await within(env, request, 'essay', MAX_ESSAYS_PER_DAY))) return refuse(429, 'too-many');
  const now = Date.now();
  const books = written.books.length ? `,${written.books.join(',')},` : '';
  const words = written.body.split(/\s+/).filter(Boolean).length;
  const excerpt = excerptOf(written.body);
  if (id) {
    // Written again, it is read again: what was approved is taken down until then.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE essays SET title = ?2, body = ?3, excerpt = ?4, words = ?5, books = ?6, status = 'pending', reason = NULL, reports = 0, changed = ?7 WHERE id = ?1",
      ).bind(id, written.title, written.body, excerpt, words, books, now),
      env.DB.prepare('DELETE FROM essay_reports WHERE essay = ?1').bind(id),
    ]);
  } else {
    id = newEssayId();
    await env.DB.prepare(
      "INSERT INTO essays (id, author, title, body, excerpt, words, books, status, created, changed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)",
    )
      .bind(id, account.name, written.title, written.body, excerpt, words, books, now)
      .run();
  }
  const row = await essayRow(env, id);
  return json({ essay: { ...essayOut(row!, true), mine: true } }, 201);
}

async function dropEssay(request: Request, env: Env, card: Card, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT author FROM essays WHERE id = ?1').bind(id).first<{ author: string }>();
  if (!row) return refuse(404, 'no-such-essay');
  if ((await accountOf(env, card))?.name !== row.author) {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM essay_reports WHERE essay = ?1').bind(id),
    env.DB.prepare('DELETE FROM essay_comments WHERE essay = ?1').bind(id),
    env.DB.prepare('DELETE FROM essays WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

/** A reader with an account flags an approved essay; the keeper sees it in the queue. Once from each card. */
async function reportEssay(request: Request, env: Env, card: Card, id: string): Promise<Response> {
  if (!(await accountOf(env, card))) return refuse(403, 'needs-account');
  if (!(await env.DB.prepare("SELECT 1 FROM essays WHERE id = ?1 AND status = 'approved'").bind(id).first())) return refuse(404, 'no-such-essay');
  if (!(await within(env, request, 'report', MAX_REPORTS_PER_DAY))) return refuse(429, 'too-many');
  const added = await env.DB.prepare('INSERT OR IGNORE INTO essay_reports (essay, card, created) VALUES (?1, ?2, ?3) RETURNING essay').bind(id, card.id, Date.now()).first();
  if (added) await env.DB.prepare('UPDATE essays SET reports = reports + 1 WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

interface CommentRow {
  id: string;
  author: string;
  body: string;
  created: number;
  tone: number | null;
}

/** An answer as it is sent, saying whether the reader asking may take it away. */
const commentOut = (row: CommentRow, me: string | null, essayAuthor: string, keeper: boolean) => ({
  id: row.id,
  author: row.author,
  tone: row.tone ?? -1,
  body: row.body,
  at: row.created,
  removable: keeper || (!!me && (me === row.author || me === essayAuthor)),
});

const approvedAuthor = (env: Env, id: string) => env.DB.prepare("SELECT author FROM essays WHERE id = ?1 AND status = 'approved'").bind(id).first<{ author: string }>();

/** The answers to an approved essay, oldest first. */
async function commentsOf(request: Request, env: Env, id: string): Promise<Response> {
  const essay = await approvedAuthor(env, id);
  if (!essay) return refuse(404, 'no-such-essay');
  const { results } = await env.DB.prepare(
    `SELECT essay_comments.id AS id, essay_comments.author AS author, essay_comments.body AS body, essay_comments.created AS created, people.tone AS tone
     FROM essay_comments LEFT JOIN people ON people.name = essay_comments.author
     WHERE essay_comments.essay = ?1 ORDER BY essay_comments.created LIMIT ${SHOWN_COMMENTS}`,
  )
    .bind(id)
    .all<CommentRow>();
  const card = await cardOf(request, env);
  const me = card ? ((await accountOf(env, card))?.name ?? null) : null;
  const keeper = !!card && card.role === 'admin' && (await deskOpen(request, env, card));
  return json({ comments: results.map((row) => commentOut(row, me, essay.author, keeper)), me });
}

/** A reader with an account answers an approved essay. */
async function writeComment(request: Request, env: Env, card: Card, id: string): Promise<Response> {
  const account = await accountOf(env, card);
  if (!account) return refuse(403, 'needs-account');
  const essay = await approvedAuthor(env, id);
  if (!essay) return refuse(404, 'no-such-essay');
  const body = await bodyOf(request, MAX_COMMENT * 2 + 400);
  const text = typeof body?.body === 'string' ? body.body.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (text.length < 2) return refuse(400, 'too-short');
  if (text.length > MAX_COMMENT) return refuse(400, 'too-long');
  if (!(await within(env, request, 'comment', MAX_COMMENTS_PER_DAY))) return refuse(429, 'too-many');
  const row = { id: newEssayId(), author: account.name, body: text, created: Date.now() };
  await env.DB.prepare('INSERT INTO essay_comments (id, essay, author, body, created) VALUES (?1, ?2, ?3, ?4, ?5)').bind(row.id, id, row.author, row.body, row.created).run();
  const tone = (await env.DB.prepare('SELECT tone FROM people WHERE name = ?1').bind(account.name).first<{ tone: number }>())?.tone ?? null;
  return json({ comment: commentOut({ ...row, tone }, account.name, essay.author, false) }, 201);
}

/** Takes an answer away: its writer may, the essay's author may, and the keeper at the open desk. */
async function dropComment(request: Request, env: Env, card: Card, id: string, comment: string): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT essay_comments.author AS author, essays.author AS essayAuthor FROM essay_comments JOIN essays ON essays.id = essay_comments.essay WHERE essay_comments.id = ?1 AND essay_comments.essay = ?2',
  )
    .bind(comment, id)
    .first<{ author: string; essayAuthor: string }>();
  if (!row) return refuse(404, 'no-such-comment');
  const me = (await accountOf(env, card))?.name;
  if (me !== row.author && me !== row.essayAuthor) {
    const shut = await keeperGate(request, env, card);
    if (shut) return shut;
  }
  await env.DB.prepare('DELETE FROM essay_comments WHERE id = ?1').bind(comment).run();
  return json({ ok: true });
}

async function essayQueue(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${ESSAY_LIST.split(', ')
      .map((column) => `essays.${column}`)
      .join(', ')}, essays.body AS body, people.tone AS tone
     FROM essays LEFT JOIN people ON people.name = essays.author
     WHERE essays.status = 'pending' OR (essays.status = 'approved' AND essays.reports > 0)
     ORDER BY essays.changed LIMIT 100`,
  ).all<EssayRow>();
  return json({ essays: results.map((row) => essayOut(row, true)) });
}

async function decideEssay(request: Request, env: Env, id: string): Promise<Response> {
  const body = await bodyOf(request);
  if (!body || typeof body.approve !== 'boolean') return refuse(400, 'bad-decision');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '';
  const now = Date.now();
  const done = await env.DB.prepare('UPDATE essays SET status = ?2, reason = ?3, reports = 0, decided = ?4 WHERE id = ?1 RETURNING id')
    .bind(id, body.approve ? 'approved' : 'rejected', body.approve ? null : reason || null, now)
    .first();
  if (!done) return refuse(404, 'no-such-essay');
  await env.DB.prepare('DELETE FROM essay_reports WHERE essay = ?1').bind(id).run();
  return json({ essay: essayOut((await essayRow(env, id))!, true) });
}

/** Everything under /api/essays. */
async function essays(request: Request, env: Env, id: string | undefined, rest: string | undefined, more: string | undefined): Promise<Response> {
  const method = request.method;
  if (id === undefined && method === 'GET') return essayList(request, env);
  if (id !== undefined && ESSAY_ID.test(id) && rest === undefined && method === 'GET') return essayOne(request, env, id);
  if (id !== undefined && ESSAY_ID.test(id) && rest === 'comments' && more === undefined && method === 'GET') return commentsOf(request, env, id);
  const card = await cardOf(request, env);
  if (!card) return refuse(401, 'no-such-card');
  if (id === undefined && method === 'POST') return writeEssay(request, env, card, null);
  if (id === 'queue' && method === 'GET') {
    const shut = await keeperGate(request, env, card);
    return shut ?? essayQueue(env);
  }
  if (id === undefined || !ESSAY_ID.test(id)) return refuse(404, 'not-found');
  if (rest === undefined && method === 'PUT') return writeEssay(request, env, card, id);
  if (rest === undefined && method === 'DELETE') return dropEssay(request, env, card, id);
  if (rest === 'report' && method === 'POST') return reportEssay(request, env, card, id);
  if (rest === 'comments' && more === undefined && method === 'POST') return writeComment(request, env, card, id);
  if (rest === 'comments' && more !== undefined && ESSAY_ID.test(more) && method === 'DELETE') return dropComment(request, env, card, id, more);
  if (rest === 'decide' && method === 'POST') {
    const shut = await keeperGate(request, env, card);
    return shut ?? decideEssay(request, env, id);
  }
  return refuse(404, 'not-found');
}

// ── A page of its own for each book ─────────────────────────────────────────

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
const inText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/** /essays/<id>: the site, with an approved essay's title and first words in the head, for search engines and for links to it. */
async function essayPage(request: Request, env: Env, id: string): Promise<Response> {
  const origin = new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`, { headers: { accept: 'text/html' } }));
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' };
  const row = ESSAY_ID.test(id)
    ? await env.DB.prepare("SELECT title, author, excerpt, books FROM essays WHERE id = ?1 AND status = 'approved'").bind(id).first<{ title: string; author: string; excerpt: string; books: string }>()
    : null;
  // An essay not approved (yet) is still opened by the page, for its author; it is only not described.
  if (!row) return new Response(shell.body, { headers: { ...headers, 'cache-control': 'no-store' } });
  const title = `${row.title} · ${row.author} · Incipit`;
  const first = row.books.split(',').filter(Boolean)[0];
  const image = first && KNOWN.has(first) ? `${origin}/covers/${first}-md.webp` : null;
  const content = (value: string) => ({
    element(element: Element) {
      element.setAttribute('content', value);
    },
  });
  let page = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', content(row.excerpt))
    .on('meta[property="og:type"]', content('article'))
    .on('meta[property="og:title"]', content(title))
    .on('meta[property="og:description"]', content(row.excerpt))
    .on('meta[property="og:url"]', content(`${origin}/essays/${id}`))
    .on('meta[name="twitter:title"]', content(title))
    .on('meta[name="twitter:description"]', content(row.excerpt));
  if (image) page = page.on('meta[property="og:image"]', content(image)).on('meta[name="twitter:image"]', content(image));
  return new Response(page.transform(shell).body, { headers });
}

/** /daily: the site, described in the head as the daily first line, for links to it shared with the result. */
async function dailyPage(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`, { headers: { accept: 'text/html' } }));
  const title = 'Whose first line is this? · Incipit';
  const description = 'One first line a day, from a book free to read. Five guesses to name it, and a clue with each miss.';
  const content = (value: string) => ({
    element(element: Element) {
      element.setAttribute('content', value);
    },
  });
  const page = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', content(description))
    .on('meta[property="og:title"]', content(title))
    .on('meta[property="og:description"]', content(description))
    .on('meta[property="og:url"]', content(`${origin}/daily`))
    .on('meta[name="twitter:title"]', content(title))
    .on('meta[name="twitter:description"]', content(description))
    .transform(shell);
  return new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

/** Every page there is, for search engines. */
async function sitemap(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const [added, written] = await env.DB.batch<{ id: string }>([
    env.DB.prepare('SELECT id FROM added_books'),
    env.DB.prepare("SELECT id FROM essays WHERE status = 'approved' ORDER BY decided DESC LIMIT 5000"),
  ]);
  const paths = [
    '',
    'globe',
    'first-pages',
    'daily',
    'essays',
    'about',
    'privacy',
    'terms',
    ...BOOKS.map((book) => `book/${book.id}`),
    ...added.results.map((row) => `book/${row.id}`),
    ...written.results.map((row) => `essays/${row.id}`),
  ];
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
  const both = (text: unknown, most: number, needed = true): BookL | null => {
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

// ---------------------------------------------------------------------------------------
// Asking for a book in a few words (/api/ask)
//
// The reader writes what they would like to read ("something sad and short, set in Russia"),
// and a model turns it into the site's own filters: Google's Gemini when the site has a key and
// the reader is where its free service may be used, otherwise Llama on Cloudflare's Workers AI. The model never
// names a book: the books come from the catalogue, through the filters, as when the sliders are
// moved by hand. What it answers is checked here, and anything not one of the site's own words
// is dropped.

/** Built with Llama: its licence asks that this be said where the model is used (src/components/AskField.tsx). */
const ASK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_ASK = 240; // characters of a wish
const MAX_ASKS_PER_DAY = 15; // from one address
/** From everyone: about 65 of the free plan's 10,000 neurons a day go on each. */
const MAX_ASKS_ALL_PER_DAY = 120;
const LENGTHS = ['short', 'medium', 'long'] as const;
const ERAS = ['pre1900', 'c20', 'c21'] as const;
const LEVELS = ['easy', 'moderate', 'demanding'] as const;
const KINDS = ['learn', 'story'] as const;
const SETTINGS = [...new Set(BOOKS.flatMap((book) => book.setting.countries))].sort();

/** A development server (the tests): the model is stood in for by a fixed answer, since it only runs at Cloudflare. */
const askDev = (request: Request, env: Env) => env.ASK_DEV === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
const askReady = (request: Request, env: Env) => !!env.AI || !!env.GEMINI_API_KEY || askDev(request, env);

/** Google's Gemini, when the keeper has given the site a key (`wrangler secret put GEMINI_API_KEY`). */
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
/**
 * Where Gemini's terms allow only its paid service (the European Economic Area, Switzerland, the
 * United Kingdom): readers there are read by Workers AI, as is anyone whose country is not known.
 */
const PAID_ONLY = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'GB']);
const geminiFor = (request: Request, env: Env) => {
  const country = (request as { cf?: { country?: string } }).cf?.country;
  return !!env.GEMINI_API_KEY && !!country && country !== 'XX' && !PAID_ONLY.has(country);
};

/** Counts a use of something from everyone today, and says whether it is still within `most`. */
async function withinAll(env: Env, what: string, most: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    'INSERT INTO limits (bucket, day, count) VALUES (?1, ?2, 1) ON CONFLICT (bucket) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(await sha256(`${what}:all:${day}`), day)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= most;
}

const ASK_PROMPT = `You turn a reader's short wish for a book into the filters of a book site. Answer with JSON only.
Set only what the reader's words call for, and leave every other field out: most wishes need the mood and one or two fields more. The reader may write in any language.

mood: each axis from 0 to 100.
- tone: 0 hopeful, 100 bleak
- voice: 0 funny, 100 serious
- intensity: 0 gentle, 100 intense
- pace: 0 slow, 100 fast
- strange: 0 familiar and realistic, 100 strange or fantastical
genre: one of ${Object.entries(GENRES)
  .map(([id, label]) => `${id} (${label.en})`)
  .join(', ')}.
keywords: at most 3 of ${Object.entries(KEYWORDS)
  .map(([id, label]) => `${id} (${label.en})`)
  .join(', ')}.
length: short (under 200 pages), medium (200 to 400), long (over 400).
era: when it was written. pre1900, c20 (1900 to 1999), c21 (2000 on).
level: how hard it is to read. easy, moderate, demanding. Words such as "easy to read", "dễ đọc" or "facile à lire" mean easy.
kind: learn (non-fiction, to learn something) or story (fiction).
country: the ISO code of where the book is set, only when the reader names a place. One of ${SETTINGS.join(', ')}.
freeOnly: true only when the reader wants a book that is free or can be read on the site.
query: only when the reader asks for books by a named author or for a named title: that surname or title. With a query, set no other field but freeOnly. A writer named as a comparison ("like Dostoevsky") is not a query: set the mood, genre, era and country that writer suggests instead.
note: at most eight words, in the reader's language, saying what you understood. Do not repeat the wish.`;

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    mood: { type: 'object', properties: Object.fromEntries(AXES.map((axis) => [axis.id, { type: 'integer', minimum: 0, maximum: 100 }])) },
    genre: { type: 'string', enum: Object.keys(GENRES) },
    keywords: { type: 'array', items: { type: 'string', enum: Object.keys(KEYWORDS) }, maxItems: 3 },
    length: { type: 'string', enum: LENGTHS },
    era: { type: 'string', enum: ERAS },
    level: { type: 'string', enum: LEVELS },
    kind: { type: 'string', enum: KINDS },
    country: { type: 'string', enum: SETTINGS },
    freeOnly: { type: 'boolean' },
    query: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['note'],
};

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined => (list.includes(value as T) ? (value as T) : undefined);

/** The model's answer, kept to the site's own words: what is not one of them is left out. */
function wishFrom(raw: unknown): { filters: Record<string, unknown>; note: string } {
  const answer = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const filters: Record<string, unknown> = {};
  const given = (answer.mood && typeof answer.mood === 'object' ? answer.mood : {}) as Record<string, unknown>;
  const mood: Record<string, number> = {};
  for (const axis of AXES) {
    const value = given[axis.id];
    if (typeof value === 'number' && Number.isFinite(value)) mood[axis.id] = Math.round(Math.min(100, Math.max(0, value)));
  }
  if (Object.keys(mood).length) filters.mood = mood;
  const genre = oneOf(Object.keys(GENRES), answer.genre);
  if (genre) filters.genre = genre;
  const keywords = Array.isArray(answer.keywords) ? [...new Set(answer.keywords.filter((id) => typeof id === 'string' && id in KEYWORDS))].slice(0, 3) : [];
  if (keywords.length) filters.keywords = keywords;
  for (const [key, list] of [
    ['length', LENGTHS],
    ['era', ERAS],
    ['level', LEVELS],
    ['kind', KINDS],
    ['country', SETTINGS],
  ] as const) {
    const value = oneOf(list, answer[key]);
    if (value) filters[key] = value;
  }
  if (answer.freeOnly === true) filters.freeOnly = true;
  if (typeof answer.query === 'string' && answer.query.trim()) filters.query = answer.query.trim().slice(0, 60);
  const note = typeof answer.note === 'string' ? answer.note.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  return { filters, note };
}

async function readByGemini(env: Env, wish: string): Promise<unknown> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${ASK_PROMPT}\nAnswer with one JSON object holding only these fields.` }] },
      contents: [{ role: 'user', parts: [{ text: wish }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 400 },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  return JSON.parse(text);
}

async function askForBook(request: Request, env: Env): Promise<Response> {
  if (!askReady(request, env)) return refuse(503, 'not-ready');
  const body = await bodyOf(request);
  const wish = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (wish.length < 2 || wish.length > MAX_ASK) return refuse(400, 'bad-wish');
  if (!(await within(env, request, 'ask', MAX_ASKS_PER_DAY))) return refuse(429, 'too-many');
  if (!(await withinAll(env, 'ask', MAX_ASKS_ALL_PER_DAY))) return refuse(429, 'resting');
  if (askDev(request, env)) {
    // Words of the site's own and words that are not, as a model might answer: the second kind is dropped.
    return json(wishFrom({ mood: { tone: 88, intensity: 140 }, length: 'short', keywords: ['war', 'not-a-theme'], genre: 'poetry', country: 'RU', note: `Dark and short: ${wish}` }));
  }
  if (geminiFor(request, env)) {
    try {
      return json(wishFrom(await readByGemini(env, wish)));
    } catch (error) {
      // Its free allowance spent, or an answer that is not JSON: Workers AI reads the wish instead.
      console.error('ask gemini', error);
    }
  }
  if (!env.AI) return refuse(503, 'resting');
  try {
    const answer = (await env.AI.run(ASK_MODEL as never, {
      messages: [
        { role: 'system', content: ASK_PROMPT },
        { role: 'user', content: wish },
      ],
      response_format: { type: 'json_schema', json_schema: ASK_SCHEMA },
      max_tokens: 300,
      temperature: 0.2,
    } as never)) as { response?: unknown };
    const response = typeof answer.response === 'string' ? JSON.parse(answer.response) : answer.response;
    return json(wishFrom(response));
  } catch (error) {
    // Most often the day's free allowance is spent, or the model could not keep to the form.
    console.error('ask', error);
    return refuse(503, 'resting');
  }
}

async function api(request: Request, env: Env, path: string, ctx: ExecutionContext): Promise<Response> {
  if (path === '/api/card' && request.method === 'POST') return makeCard(request, env);
  if (path === '/api/account/enter' && request.method === 'POST') return enterAccount(request, env);
  if (path === '/api/account/free' && request.method === 'GET') return nameFree(request, env);
  if (path === '/api/account/forgot' && request.method === 'GET') return json({ mail: mailReady(env) || mailDev(request, env) });
  if (path === '/api/account/forgot' && request.method === 'POST') return forgot(request, env, ctx);
  if (path === '/api/account/reset' && request.method === 'POST') return resetByLetter(request, env);
  if (path === '/api/account/google' && request.method === 'GET') return json({ client: googleReady(env) ? env.GOOGLE_CLIENT_ID : null });
  if (path === '/api/account/google' && request.method === 'POST') return googleEnter(request, env);
  if (path === '/api/books' && request.method === 'GET') return overrides(env);
  if (path === '/api/profile' && request.method === 'GET') return profile(env);
  if (path === '/api/portrait' && request.method === 'GET') return portrait(env);
  if (path === '/api/ask' && request.method === 'GET') return json({ ready: askReady(request, env) });
  if (path === '/api/ask' && request.method === 'POST') return askForBook(request, env);

  const [, , section, book, rest, more] = path.split('/');
  if (section === 'essays') return essays(request, env, book, rest, more);
  if (section === 'people' && request.method === 'GET' && NAME.test(book ?? '') && rest === undefined) return personPage(env, book, await cardOf(request, env));
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
  if (path === '/api/people' && request.method === 'PUT') return writePerson(request, env, card);
  if (path === '/api/people/quotes' && request.method === 'PUT') return writePassages(request, env, card);
  if (path === '/api/account' && request.method === 'POST') return makeAccount(request, env, card);
  if (path === '/api/account' && request.method === 'PUT') return changeAccount(request, env, card);
  if (path === '/api/account/link' && request.method === 'POST') return googleLink(request, env, card);

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
    const account = await env.DB.prepare('SELECT name, email, google, hash FROM accounts WHERE card = ?1').bind(card.id).first<{ name: string; email: string | null; google: string | null; hash: string }>();
    return json({ role: card.role, rows: held?.n ?? 0, created: card.created, name: account?.name ?? null, email: account?.email ?? null, google: !!account?.google, password: !!account && account.hash !== '' });
  }
  if (path === '/api/sync' && request.method === 'POST') return sync(request, env, card);
  if (path === '/api/card' && request.method === 'DELETE') {
    // A reader's page and essays go with their account.
    const account = await accountOf(env, card);
    if (account) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM essay_reports WHERE essay IN (SELECT id FROM essays WHERE author = ?1)').bind(account.name),
        env.DB.prepare('DELETE FROM essay_comments WHERE author = ?1 OR essay IN (SELECT id FROM essays WHERE author = ?1)').bind(account.name),
        env.DB.prepare('DELETE FROM essays WHERE author = ?1').bind(account.name),
        env.DB.prepare('DELETE FROM people WHERE name = ?1').bind(account.name),
        env.DB.prepare('DELETE FROM resets WHERE name = ?1').bind(account.name),
      ]);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM essay_reports WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM rows WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM accounts WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM reviews WHERE card = ?1').bind(card.id),
      env.DB.prepare('DELETE FROM cards WHERE id = ?1').bind(card.id),
    ]);
    return json({ ok: true });
  }
  return refuse(404, 'not-found');
}

/**
 * The rules every answer carries, the same as public/_headers gives the built site: a page
 * written here (a book's, an essay's) runs only the site's own scripts and is never framed.
 */
const SECURITY: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
};

function guarded(response: Response): Response {
  const answer = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY)) if (!answer.headers.has(name)) answer.headers.set(name, value);
  return answer;
}

async function answer(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  try {
    if (pathname.startsWith('/book/')) return await bookPage(request, env, decodeURIComponent(pathname.slice('/book/'.length)).replace(/\/$/, ''));
    if (pathname === '/sitemap.xml') return await sitemap(request, env);
    if (pathname === '/daily' || pathname === '/daily/') return await dailyPage(request, env);
    if (pathname.startsWith('/essays/')) return await essayPage(request, env, pathname.slice('/essays/'.length).replace(/\/$/, ''));
  } catch (error) {
    console.error(error);
    return env.ASSETS.fetch(new Request(new URL('/', request.url)));
  }
  if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  try {
    return await api(request, env, pathname, ctx);
  } catch (error) {
    console.error(error);
    return refuse(500, 'server-error');
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return guarded(await answer(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;
