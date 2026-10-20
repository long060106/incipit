// Finds the Wikipedia articles shown under "Around the book": the book itself, its author,
// and the history and places behind the story. Run with `npm run context`.
//
// No address is guessed. They come from two places, and both are checked:
//
// 1. Wikidata. Each book is looked up by its Open Library id (which the catalogue already
//    holds) or, failing that, by its title; either way the item is accepted only if it
//    names the book's author. The articles are the ones Wikidata links from it: the item's
//    own page, its author's (P50), and what it records as the period (P2408) and the
//    place (P840) of the story.
// 2. scripts/context-topics.json: an editorial list of subjects worth reading about beside
//    each book (the June Rebellion for Les Misérables). Each title is asked of Wikipedia
//    itself; one that does not exist there is left out and reported.
//
// Writes src/data/context.ts.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Wikimedia asks scripts to say who they are and where they come from.
const HEADERS = { 'User-Agent': 'IncipitCatalog/0.1 (https://incipit.incipit.workers.dev; book discovery site)', Accept: 'application/json' };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The book's own article, where Wikidata has none under the right author. */
const OWN = {
  dune: 'Dune (novel)',
  'to-kill-a-mockingbird': 'To Kill a Mockingbird',
  'the-godfather': 'The Godfather (novel)',
  heidi: 'Heidi',
  'the-hour-of-the-star': 'The Hour of the Star',
  'the-arabian-nights': 'One Thousand and One Nights',
  'the-strange-case-of-dr-jekyll-and-mr-hyde': 'Strange Case of Dr Jekyll and Mr Hyde',
  'narrative-of-the-life-of-frederick-douglass': 'Narrative of the Life of Frederick Douglass, an American Slave',
  'crime-and-punishment': 'Crime and Punishment',
  'the-brothers-karamazov': 'The Brothers Karamazov',
  beowulf: 'Beowulf',
  'notes-from-underground': 'Notes from Underground',
  'the-analects': 'Analects',
  bushido: 'Bushido: The Soul of Japan',
  kim: 'Kim (novel)',
  gitanjali: 'Gitanjali',
  'the-idiot': 'The Idiot',
  we: 'We (novel)',
};
/** The same for the author. */
const BY = {
  dune: 'Frank Herbert',
  'to-kill-a-mockingbird': 'Harper Lee',
  'the-godfather': 'Mario Puzo',
  'the-strange-case-of-dr-jekyll-and-mr-hyde': 'Robert Louis Stevenson',
  'narrative-of-the-life-of-frederick-douglass': 'Frederick Douglass',
  'heaven-and-earth': 'Paolo Giordano',
  'crime-and-punishment': 'Fyodor Dostoevsky',
  'the-brothers-karamazov': 'Fyodor Dostoevsky',
  'the-analects': 'Confucius',
  'notes-from-underground': 'Fyodor Dostoevsky',
  bushido: 'Nitobe Inazō',
  gitanjali: 'Rabindranath Tagore',
  'the-idiot': 'Fyodor Dostoevsky',
  we: 'Yevgeny Zamyatin',
  'andersens-fairy-tales': 'Hans Christian Andersen',
};

// What Wikidata records that is no help as background: bare dates, and subjects too broad to say anything.
const DATE = /^(\d{1,4}s?( BC)?|\d{1,2}(st|nd|rd|th) century( BC)?|(january|february|march|april|may|june|july|august|september|october|november|december) \d{4})$/i;
const BROAD = new Set(['love', 'friendship', 'death', 'orphan', 'anguish', 'murder', 'divorce', 'dream', 'prince', 'sea', 'tea', 'history', 'philosophy', 'ethics', 'nature', 'adolescence', 'childhood', 'biography', 'politics', 'psychology', 'self-discovery', 'social class', 'human rights', 'racism', 'diaspora', 'hell', 'heaven', 'purgatory', 'time travel', 'far future', "children's game", 'hypochondriasis', 'feral child', 'dinosaur', 'strike', 'human migration', 'genocide', 'class struggle', 'caste', 'political science']);

const catalogue = await readFile(join(ROOT, 'src', 'data', 'books.ts'), 'utf8');
const BOOKS = [...catalogue.matchAll(/\n    id: '([^']+)'[\s\S]*?(?=\n  \{\n    id:|\n\];)/g)].map(([entry, id]) => ({
  id,
  title: /\n    title: (['"])(.*?)\1,\n/.exec(entry)[2].replaceAll("\\'", "'"),
  author: /\n    author: (['"])(.*?)\1,\n/.exec(entry)[2].replaceAll("\\'", "'"),
  ol: /olKey: '\/works\/([^']+)'/.exec(entry)?.[1],
}));
const TOPICS = JSON.parse(await readFile(join(ROOT, 'scripts', 'context-topics.json'), 'utf8'));

async function ask(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
      if (response.ok) return await response.json();
    } catch {
      // Try again below.
    }
    await pause(4000 * (attempt + 1));
  }
  throw new Error(`No answer: ${url}`);
}

/** Wikidata entities by id, fifty at a time. */
async function entities(ids, props) {
  const found = {};
  const list = [...new Set(ids)];
  for (let at = 0; at < list.length; at += 50) {
    const data = await ask('www.wikidata.org', { action: 'wbgetentities', ids: list.slice(at, at + 50).join('|'), props, languages: 'en|fr|mul', sitefilter: 'enwiki|frwiki' });
    if (data.error) console.warn(`  Wikidata refused a batch: ${data.error.code} ${data.error.info}`);
    Object.assign(found, data.entities ?? {});
    await pause(500);
  }
  return found;
}

const targets = (entity, property) =>
  (entity?.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);

const pages = (entity) => {
  const en = entity?.sitelinks?.enwiki?.title;
  const fr = entity?.sitelinks?.frwiki?.title;
  return en || fr ? { ...(en ? { en } : {}), ...(fr ? { fr } : {}) } : null;
};

// --- 1. Wikidata

const byOl = new Map();
{
  const values = BOOKS.filter((book) => book.ol).map((book) => `"${book.ol}"`).join(' ');
  const query = `SELECT ?ol ?item WHERE { VALUES ?ol { ${values} } ?item wdt:P648 ?ol }`;
  const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: HEADERS, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`The query service answered ${response.status}`);
  for (const row of (await response.json()).results.bindings) {
    const list = byOl.get(row.ol.value) ?? [];
    list.push(row.item.value.split('/').pop());
    byOl.set(row.ol.value, list);
  }
}

const works = {};
const people = {};
const known = await entities([...byOl.values()].flat(), 'claims|sitelinks');
Object.assign(people, await entities(Object.values(known).flatMap((entity) => targets(entity, 'P50')), 'labels|sitelinks'));

/** An item is the book only if one of its authors bears the author's surname. */
const byAuthor = (book) => (entity) => {
  const surname = fold(book.author).split(' ').at(-1);
  return targets(entity, 'P50').some((id) => Object.values(people[id]?.labels ?? {}).some((label) => fold(label.value).split(' ').includes(surname)));
};
// Among the items that are the book, one with an article is worth more than one without.
const best = (list) => list.find((entity) => pages(entity)) ?? list[0];

for (const book of BOOKS) {

  let match = best((byOl.get(book.ol) ?? []).map((id) => known[id]).filter(Boolean).filter(byAuthor(book)));
  if (!match || !pages(match)) {
    const search = await ask('www.wikidata.org', { action: 'wbsearchentities', search: book.title, language: 'en', type: 'item', limit: '8' });
    await pause(400);
    const candidates = await entities((search.search ?? []).map((hit) => hit.id), 'claims|sitelinks');
    Object.assign(people, await entities(Object.values(candidates).flatMap((entity) => targets(entity, 'P50')), 'labels|sitelinks'));
    match = best(Object.values(candidates).filter(byAuthor(book))) ?? match;
  }
  if (match) works[book.id] = match;
}

const pointed = await entities(
  Object.values(works).flatMap((entity) => ['P2408', 'P840'].flatMap((property) => targets(entity, property))),
  'labels|sitelinks',
);

// --- 2. The editorial subjects and the stand-in articles, checked against Wikipedia itself

const wanted = [...new Set([...Object.values(TOPICS).flat(), ...Object.values(OWN), ...Object.values(BY)])];
const wiki = new Map();
for (let at = 0; at < wanted.length; at += 40) {
  const batch = wanted.slice(at, at + 40);
  const data = await ask('en.wikipedia.org', { action: 'query', titles: batch.join('|'), redirects: '1', prop: 'langlinks|pageprops', ppprop: 'disambiguation', lllang: 'fr', lllimit: '500' });
  const renamed = new Map([...(data.query.normalized ?? []), ...(data.query.redirects ?? [])].map((step) => [step.from, step.to]));
  const found = new Map(data.query.pages.map((page) => [page.title, page]));
  for (const title of batch) {
    let final = title;
    for (let hop = 0; hop < 4 && renamed.has(final); hop += 1) final = renamed.get(final);
    const page = found.get(final);
    if (!page || page.missing || page.pageprops?.disambiguation !== undefined) {
      console.warn(`  left out, not an article on Wikipedia: "${title}"`);
      continue;
    }
    const fr = page.langlinks?.[0]?.title;
    wiki.set(title, { en: page.title, ...(fr ? { fr } : {}) });
  }
  await pause(500);
}
const plain = (title) => title.replace(/ \([^)]*\)$/, '');

// --- 3. Put together

const context = {};
for (const book of BOOKS) {
  const work = works[book.id];
  const entry = {};
  const own = wiki.get(OWN[book.id]) ?? pages(work);
  if (own) entry.book = own;
  const author = wiki.get(BY[book.id]) ?? targets(work, 'P50').map((id) => pages(people[id])).find(Boolean);
  if (author) entry.author = author;

  const setting = [];
  const seen = new Set([own?.en, author?.en]);
  const add = (label, page) => {
    const key = page.en ?? page.fr;
    if (seen.has(key) || setting.length >= 4) return;
    seen.add(key);
    setting.push({ label, page });
  };
  for (const title of TOPICS[book.id] ?? []) {
    const page = wiki.get(title);
    if (page) add({ en: plain(page.en), fr: plain(page.fr ?? page.en) }, page);
  }
  // Where the editorial list says little, Wikidata adds the period and at most two places.
  // Its "main subjects" are left alone: too many are words like "happiness".
  let places = 0;
  for (const property of setting.length >= 2 ? [] : ['P2408', 'P840']) {
    for (const id of targets(work, property)) {
      const page = pages(pointed[id]);
      const labels = pointed[id]?.labels ?? {};
      // Names are often kept once for every language, under "mul".
      const en = labels.en?.value ?? labels.mul?.value ?? labels.fr?.value;
      if (!page || !en || DATE.test(en) || BROAD.has(en.toLowerCase())) continue;
      if (property === 'P840' && (places += 1) > 2) continue;
      add({ en: en[0].toUpperCase() + en.slice(1), fr: (labels.fr?.value ?? en).replace(/^./, (letter) => letter.toUpperCase()) }, page);
    }
  }
  if (setting.length) entry.setting = setting;
  if (Object.keys(entry).length) context[book.id] = entry;
}

await writeFile(
  join(ROOT, 'src', 'data', 'context.ts'),
  `// Written by scripts/fetch-context.mjs. Do not edit by hand.
//
// Wikipedia articles around each book: the book, its author, and the history and places
// behind the story. \`en\` and \`fr\` are article titles.

import type { L } from './types';

export interface WikiPage {
  en?: string;
  fr?: string;
}

export interface Around {
  book?: WikiPage;
  author?: WikiPage;
  setting?: { label: L; page: WikiPage }[];
}

export const AROUND: Record<string, Around> = ${JSON.stringify(context)};
`,
);
const all = Object.values(context);
console.log(`${all.length} of ${BOOKS.length} books; ${all.filter((entry) => entry.book).length} with the book's article, ${all.filter((entry) => entry.author).length} with the author's, ${all.filter((entry) => entry.setting).length} with background.`);
console.log('no book article:', BOOKS.filter((book) => !context[book.id]?.book).map((book) => book.id).join(', ') || 'none');
console.log('no background:', BOOKS.filter((book) => !context[book.id]?.setting).map((book) => book.id).join(', ') || 'none');
