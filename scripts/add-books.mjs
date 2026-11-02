// Adds books to the stacks (src/data/stacks.ts), on a schedule (.github/workflows/add-books.yml)
// and for nothing: Open Library chooses and ranks them by how many readers have logged them, and
// Gemini's free tier only writes each entry, saying so when it does not know a book well enough.
// Books already held, or refused once, are never asked about again (scripts/stacks-state.json).
//
//   GEMINI_API_KEY=... BATCH=50 node scripts/add-books.mjs     add up to BATCH books
//   node scripts/add-books.mjs --dry                           show what would be asked, write nothing
//   REMOVE=some-book,another node scripts/add-books.mjs        take books out, for good
//
// The free tier's daily limit ends a run early, which loses nothing: what was written is kept, and
// the next run goes on from there. The repository is public, and so are the logs of its runs: the
// key is only ever sent to Google, and nothing here prints it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../src/data/books.ts';
import { PARTS, partOf } from '../src/data/stacks.ts';
import { GENRES, KEYWORDS, LANGUAGES } from '../src/data/vocab.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STACKS = join(ROOT, 'public', 'stacks');
const STATE = join(ROOT, 'scripts', 'stacks-state.json');
const SITE = 'https://incipit.incipit.workers.dev';
const AGENT = 'Incipit/1.0 (https://incipit.incipit.workers.dev; book discovery site)';

const MODEL = 'gemini-3.5-flash-lite';
const GEMINI = process.env.GEMINI_URL ?? `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const BETWEEN_BOOKS = 4500; // milliseconds: under Gemini's free limit for a minute
const BETWEEN_SEARCHES = 1100; // milliseconds: Open Library asks for a request a second at most
const LONGEST_RUN = 40 * 60 * 1000; // milliseconds
const FROM_EACH_SHELF = 8; // books taken from one shelf before going on to the next
const FAILURES_IN_A_ROW = 5; // then something is wrong that the next book will not cure

/** A book's entry is asked for only if this many readers have rated and logged it. */
const ENOUGH = 'ratings_count:[5 TO *] AND readinglog_count:[100 TO *]';
/** Fewer for the literatures of other countries, which Open Library's readers log far less. */
const ENOUGH_FROM_AFAR = 'ratings_count:[3 TO *] AND readinglog_count:[30 TO *]';
const LEAVE_OUT = 'NOT subject:"erotica" NOT subject:"erotic fiction" NOT subject:"pornography"';
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,ratings_average,ratings_count,number_of_pages_median,subject';

/** Taken first: by reading log alone, Open Library would give mostly recent bestsellers in English. */
const AFAR = [
  'translations into english',
  'japanese fiction',
  'russian literature',
  'french literature',
  'latin american fiction',
  'african literature',
  'german literature',
  'korean fiction',
  'italian fiction',
  'arabic fiction',
  'indian literature',
  'chinese fiction',
  'turkish fiction',
  'french fiction',
  'polish literature',
  'brazilian fiction',
  'swedish fiction',
  'russian fiction',
  'african fiction',
  'greek literature',
  'indic fiction',
  'norwegian fiction',
  'latin american literature',
  'arabic literature',
  'spanish fiction',
  'persian literature',
  'portuguese literature',
  'irish literature',
  'canadian literature',
];
const NEAR = [
  'classic literature',
  'literary fiction',
  'memoir',
  'magical realism',
  'gothic fiction',
  'essays',
  'dystopias',
  'history',
  'crime fiction',
  'philosophy',
  'science fiction',
  'economics',
  'fantasy',
  'psychology',
  'horror',
  'satire',
  'science',
  'nature',
  'politics',
  'poetry',
  'drama',
  'american literature',
  'english literature',
  'nonfiction',
  'thriller',
  'romance',
];
const SHELVES = [...AFAR, ...NEAR];

/** Not one book but several, or a book about a book. */
const NOT_A_BOOK = /box(ed)? set|omnibus|anthology|collection|collected|^the complete|complete (works|novels|stories)|trilogy|\bseries\b|\bbooks? \d|\bvolumes?\b|\bvol\.|summary of|study guide|sparknotes|cliffs ?notes|workbook|\bset\b/i;
const PRAISE = /masterpiece|must[- ]read|unforgettable|timeless|tour de force|chef-d'œuvre/i;
const AXES = ['tone', 'voice', 'intensity', 'pace', 'strange'];

const PROMPT = `You write one entry for Incipit, a site where readers find their next book by how they want to feel. You are given a book and the facts about it. Answer with one JSON object holding only the fields below. Write only what you are sure is true of this book. If you do not know it well enough to do so, answer {"unknown":true}. If it is mainly erotica, answer {"adult":true}.

How to write: plain, exact and warm, like a well-read friend. Short sentences. Name what is particular to this book, not what is true of its whole genre. No praise ("masterpiece", "must-read", "unforgettable", "timeless"), no marketing words, no "it's not X, it's Y". Write every line yourself: never quote the book, a review or a blurb. Never give away the ending or a late turn. Write English first, then French as a French writer would put it, not word for word.

Fields:
title: the title of its English edition, or its own title if it has none. The title you are given may be in another language.
author: the author's name as it is usually written in English.
year: the year it was first published, negative for a year BC. The year you are given may be wrong.
originalTitle: the title in the book's own language and script, only when it was not written in English; otherwise "".
language: the language it was written in, one of ${Object.keys(LANGUAGES).join(', ')}.
genres: one to three of ${Object.keys(GENRES).join(', ')}.
keywords: three to five of ${Object.keys(KEYWORDS).join(', ')}.
setting: {"place":{"en":"","fr":""},"countries":[]}. place is where it happens, in a few words. countries are ISO codes of present-day countries, none for a place not on Earth.
mood: how the book feels to read, each a whole number from 0 to 100. Score the reading, not the subject, and use the whole scale.
- tone: 0 hopeful, 100 bleak
- voice: 0 funny, 100 serious
- intensity: 0 gentle, 100 intense
- pace: 0 slow, 100 fast
- strange: 0 familiar and realistic, 100 strange or fantastical
difficulty: how hard it is to read, 1 very easy to 5 very demanding.
description: {"en":"","fr":""}. Two sentences, at most 45 words each language: who, where, and what sets the book going.
advice: four parts, each {"en":"","fr":""}, one short sentence.
- pace: how it reads, and how long it takes.
- headsUp: what a reader may want warning of, such as violence, abuse or death. Name it plainly. If there is nothing, say what kind of attention it asks for.
- readIf: starts "You want" and says what this book gives.
- skipIf: says who it will not suit.

An example of the voice, for The Vegetarian:
description: "After a dream of blood, a quiet Seoul housewife stops eating meat. Her husband, her brother-in-law and her sister each tell what happens next, as her refusal grows into something none of them can follow."
pace: "Three short parts, read in a sitting or two. Spare, cold and hard to put down."
headsUp: "Marital rape, force-feeding, self-harm and psychiatric wards."
readIf: "You want a disturbing book about a body that says no."
skipIf: "You need explanations, or comfort."`;

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const slug = (text) =>
  fold(text)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
const surname = (author) => fold(author).split(/\s+/).at(-1);
/** Two records of one book: Open Library often holds a work twice over. */
const sameBook = (title, author) => `${fold(title).replace(/^(the|a|an) /, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${surname(author)}`;

/** A short line of plain text, in both languages. */
function both(value, most) {
  const en = typeof value?.en === 'string' ? value.en.trim() : '';
  const fr = typeof value?.fr === 'string' ? value.fr.trim() : '';
  return en && en.length <= most && fr.length <= most ? { en, fr: fr || en } : null;
}

/** Which of Open Library's records may be asked about. */
export function fit(doc) {
  const pages = doc.number_of_pages_median;
  return Boolean(
    doc.key?.startsWith('/works/') && doc.title && doc.author_name?.length && doc.cover_i > 0 && Number.isInteger(doc.first_publish_year) && pages >= 40 && pages <= 2500 && doc.ratings_average >= 3.5 && doc.author_name[0] !== doc.title && !NOT_A_BOOK.test(doc.title),
  );
}

/** What was written, as a book of the stacks, or the reason it cannot be one. As strict as bookFrom in worker/index.ts. */
export function entryFrom(given, doc) {
  if (!given || typeof given !== 'object') return { reason: 'not-json' };
  if (given.unknown) return { reason: 'unknown' };
  if (given.adult) return { reason: 'adult' };
  const among = (list, allowed, most) => (Array.isArray(list) ? [...new Set(list)].filter((entry) => typeof entry === 'string' && Object.hasOwn(allowed, entry)).slice(0, most) : []);
  const genres = among(given.genres, GENRES, 3);
  const keywords = among(given.keywords, KEYWORDS, 5);
  const description = both(given.description, 500);
  const place = both(given.setting?.place, 120);
  const advice = { pace: both(given.advice?.pace, 300), headsUp: both(given.advice?.headsUp, 300), readIf: both(given.advice?.readIf, 300), skipIf: both(given.advice?.skipIf, 300) };
  const countries = given.setting?.countries;
  const mood = given.mood ?? {};
  if (!genres.length) return { reason: 'genres' };
  if (keywords.length < 2) return { reason: 'keywords' };
  if (!description) return { reason: 'description' };
  if (!place) return { reason: 'place' };
  if (!Object.values(advice).every(Boolean)) return { reason: 'advice' };
  if (!advice.readIf.en.startsWith('You want')) return { reason: 'read-if' };
  if (typeof given.language !== 'string' || !Object.hasOwn(LANGUAGES, given.language)) return { reason: 'language' };
  if (!Array.isArray(countries) || countries.length > 8 || !countries.every((code) => typeof code === 'string' && /^[A-Z]{2}$/.test(code))) return { reason: 'countries' };
  if (!Number.isInteger(given.difficulty) || given.difficulty < 1 || given.difficulty > 5) return { reason: 'difficulty' };
  for (const axis of AXES) if (!Number.isInteger(mood[axis]) || mood[axis] < 0 || mood[axis] > 100) return { reason: 'mood' };
  if (PRAISE.test(JSON.stringify([description, advice]))) return { reason: 'praise' };
  const named = (text, fallback) => (typeof text === 'string' && text.trim() && text.length <= 200 ? text.trim() : fallback);
  const title = named(given.title, doc.title);
  const originalTitle = typeof given.originalTitle === 'string' ? given.originalTitle.trim().slice(0, 200) : '';
  return {
    book: {
      title,
      ...(originalTitle && originalTitle !== title ? { originalTitle } : {}),
      author: named(given.author, doc.author_name[0]),
      year: Number.isInteger(given.year) && given.year >= -3000 && given.year <= new Date().getFullYear() ? given.year : doc.first_publish_year,
      pages: doc.number_of_pages_median,
      language: given.language,
      genres,
      keywords,
      setting: { place, countries },
      mood: Object.fromEntries(AXES.map((axis) => [axis, mood[axis]])),
      difficulty: given.difficulty,
      rating: { value: Math.round(doc.ratings_average * 100) / 100, count: doc.ratings_count },
      cover: doc.cover_i,
      olKey: doc.key,
      description,
      advice,
    },
  };
}

/** The stacks as they are on disk: the parts hold every book whole. */
function readStacks() {
  const books = new Map();
  for (let at = 0; at < PARTS; at++) {
    const file = join(STACKS, 'parts', `${at}.json`);
    if (existsSync(file)) for (const book of Object.values(JSON.parse(readFileSync(file, 'utf8')))) books.set(book.id, book);
  }
  return books;
}

/** Writes every file of the stacks again, in an order that leaves a file alone if its books have not changed. */
function writeStacks(books) {
  const sorted = [...books.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const parts = Array.from({ length: PARTS }, () => []);
  for (const book of sorted) parts[partOf(book.id)].push(book);
  mkdirSync(join(STACKS, 'parts'), { recursive: true });
  parts.forEach((part, at) => {
    const file = join(STACKS, 'parts', `${at}.json`);
    if (part.length || existsSync(file)) writeFileSync(file, `{\n${part.map((book) => `${JSON.stringify(book.id)}: ${JSON.stringify(book)}`).join(',\n')}\n}\n`);
  });
  const brief = sorted.map(({ description, advice, ...book }) => JSON.stringify(book));
  writeFileSync(join(STACKS, 'list.json'), `[\n${brief.join(',\n')}\n]\n`);
  writeFileSync(join(STACKS, 'ids.txt'), sorted.map((book) => `${book.id}\n`).join(''));
}

function readState() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  return { turn: state.turn ?? 0, pages: state.pages ?? {}, refused: state.refused ?? [] };
}

const writeState = (state) => writeFileSync(STATE, `${JSON.stringify(state, null, 1)}\n`);

/** Everything that must not be asked about: the catalogue, the keeper's books, the stacks, what was refused. */
async function heldNow(books, state) {
  const keys = new Set(state.refused);
  const names = new Set();
  const hold = (book) => {
    if (book.olKey) keys.add(book.olKey);
    names.add(sameBook(book.title, book.author));
    if (book.originalTitle) names.add(sameBook(book.originalTitle, book.author));
  };
  BOOKS.forEach(hold);
  books.forEach(hold);
  const site = await fetch(`${SITE}/api/books`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000) });
  if (!site.ok) throw new Error(`The site's own books could not be read (${site.status}).`);
  (await site.json()).added?.forEach(hold);
  return { keys, names };
}

async function search(shelf, page) {
  const q = `subject:"${shelf}" AND ${AFAR.includes(shelf) ? ENOUGH_FROM_AFAR : ENOUGH} ${LEAVE_OUT}`;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=readinglog&limit=100&page=${page}&fields=${FIELDS}`;
  const response = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Open Library answered ${response.status}.`);
  return (await response.json()).docs ?? [];
}

/** The next books to ask about, a few from each shelf in turn. */
async function* candidates(held, state) {
  let empty = 0;
  while (empty < SHELVES.length) {
    const shelf = SHELVES[state.turn % SHELVES.length];
    state.turn = (state.turn + 1) % SHELVES.length;
    let taken = 0;
    while (state.pages[shelf] !== 'done' && taken < FROM_EACH_SHELF) {
      const page = state.pages[shelf] ?? 1;
      const docs = await search(shelf, page);
      await wait(BETWEEN_SEARCHES);
      for (const doc of docs) {
        if (taken >= FROM_EACH_SHELF) break;
        const name = fit(doc) ? sameBook(doc.title, doc.author_name[0]) : null;
        if (!name || held.keys.has(doc.key) || held.names.has(name)) continue;
        held.keys.add(doc.key);
        held.names.add(name);
        taken++;
        yield doc;
      }
      if (taken < FROM_EACH_SHELF) state.pages[shelf] = docs.length < 100 ? 'done' : page + 1;
    }
    empty = taken ? 0 : empty + 1;
  }
}

class Stop extends Error {}

/** One entry from Gemini. Throws Stop when the day's free use is gone, or the key is not taken. */
async function write(doc) {
  const facts = [`Title: ${doc.title}`, `Author: ${doc.author_name.join(', ')}`, `First published: ${doc.first_publish_year}`, `Pages: ${doc.number_of_pages_median}`, `Subjects on Open Library: ${(doc.subject ?? []).slice(0, 15).join(', ')}`];
  for (let tries = 0; tries < 3; tries++) {
    const response = await fetch(GEMINI, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: facts.join('\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2500 },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) {
      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    if (response.status === 429) {
      const said = await response.text();
      // A limit for the minute passes; one for the day does not.
      if (/PerDay/i.test(said)) throw new Stop('The free use of the day is gone.');
      await wait(65000);
      continue;
    }
    if (response.status >= 500) {
      await wait(10000);
      continue;
    }
    throw new Stop(`Gemini answered ${response.status}.`);
  }
  throw new Error('no answer');
}

function remove(ids, books, state) {
  for (const id of ids) {
    const book = books.get(id);
    if (!book) {
      console.log(`Not in the stacks: ${id}`);
      continue;
    }
    books.delete(id);
    state.refused.push(book.olKey);
    console.log(`Taken out: ${id}`);
  }
}

function idFor(book, doc, books) {
  const base = slug(book.title) || doc.key.split('/').at(-1).toLowerCase();
  const taken = (id) => books.has(id) || BOOKS.some((book) => book.id === id);
  if (!taken(base)) return base;
  const longer = `${base}-${slug(surname(book.author))}`.slice(0, 80).replace(/-+$/, '');
  return taken(longer) ? `${base}-${doc.key.split('/').at(-1).toLowerCase()}` : longer;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const wanted = Number(process.env.BATCH || 50);
  const books = readStacks();
  const state = readState();

  const removing = (process.env.REMOVE ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (removing.length) {
    remove(removing, books, state);
    writeStacks(books);
    writeState(state);
    return;
  }
  if (!dry && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');

  const held = await heldNow(books, state);
  const began = Date.now();
  const added = [];
  const reasons = {};
  let failures = 0;
  let asked = 0;
  let stopped = '';
  const saved = { ...state, pages: { ...state.pages } };

  try {
    for await (const doc of candidates(held, dry ? saved : state)) {
      if (dry) {
        console.log(`${doc.title} · ${doc.author_name[0]} · ${doc.first_publish_year} · ${doc.ratings_average?.toFixed(2)} (${doc.ratings_count}) · cover ${doc.cover_i}`);
        if (++asked >= wanted) break;
        continue;
      }
      if (added.length >= wanted || Date.now() - began > LONGEST_RUN) break;
      asked++;
      try {
        const written = entryFrom(await write(doc), doc);
        // An answer cut short says nothing of the book, which is asked about again another day.
        if (written.reason === 'not-json') throw new Error(written.reason);
        failures = 0;
        const { book } = written;
        const name = book && sameBook(book.title, book.author);
        // Its name in English may be that of a book held under the same name.
        const reason = name && name !== sameBook(doc.title, doc.author_name[0]) && held.names.has(name) ? 'held' : written.reason;
        if (!reason) {
          const entry = { id: idFor(book, doc, books), ...book };
          held.names.add(name);
          books.set(entry.id, entry);
          added.push(entry);
          console.log(`Added: ${book.title}, ${book.author}`);
        } else {
          reasons[reason] = (reasons[reason] ?? 0) + 1;
          // Not asked again: a model that does not know a book today is no surer of it tomorrow.
          state.refused.push(doc.key);
          console.log(`Left out (${reason}): ${doc.title}`);
        }
      } catch (error) {
        if (error instanceof Stop) throw error;
        if (++failures >= FAILURES_IN_A_ROW) throw new Stop('Too many failures in a row.');
      }
      await wait(BETWEEN_BOOKS);
    }
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    stopped = error.message;
  } finally {
    if (!dry) {
      writeStacks(books);
      writeState(state);
    }
  }

  const summary = [`Added ${added.length} of ${asked} asked about. The stacks hold ${books.size} books.`, ...(stopped ? [`Stopped: ${stopped}`] : []), ...Object.entries(reasons).map(([reason, n]) => `Left out, ${reason}: ${n}`)];
  console.log(summary.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n\n')}\n\n${added.map((book) => `- [${book.title}](${SITE}/book/${book.id}), ${book.author}`).join('\n')}\n`);
  // Nothing written at all, on a run that should have written: a red cross on GitHub.
  if (!dry && !added.length && stopped && !/free use/.test(stopped)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
