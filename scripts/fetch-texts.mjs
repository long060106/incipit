// Builds the texts the on-site reader shows, for the public-domain books only (those with a
// `free` entry in src/data/books.ts). Run with `npm run texts`, or `npm run texts -- <part of
// an id>` for one book.
//
// Each book is read once from its source as a single web page (Standard Ebooks when there is
// an edition, otherwise Project Gutenberg), cut into its chapters and cleaned down to plain
// structure: paragraphs, emphasis, quotations, verse. Pictures, page furniture, Project
// Gutenberg's own header and licence, and Standard Ebooks' imprint and colophon are left out;
// the reader credits and links the source instead.
//
//   public/texts/<id>/index.json   the list of sections
//   public/texts/<id>/<n>.txt      one section, as a fragment of HTML
//   src/data/openings.ts           the first lines of each book, for the "first pages" page
//
// The pages fetched are kept in .cache/texts so that a second run does not ask for them again.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'texts');
const CACHE = join(ROOT, '.cache', 'texts');
const OPENINGS = join(ROOT, 'src', 'data', 'openings.ts');
const AGENT = 'incipit-catalog-script (prototype)';
const only = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The catalogue is TypeScript; all this script needs from it are the ids and the sources.
const catalogue = await readFile(join(ROOT, 'src', 'data', 'books.ts'), 'utf8');
const BOOKS = [...catalogue.matchAll(/\n    id: '([^']+)'[\s\S]*?(?=\n  \{\n    id:|\n\];)/g)]
  .map(([entry, id]) => ({
    id,
    standardEbooks: /standardEbooks: '([^']+)'/.exec(entry)?.[1],
    gutenberg: /gutenberg: (\d+)/.exec(entry)?.[1],
  }))
  .filter((book) => book.gutenberg);

/** Where the story starts, for the books in which the guess below is wrong: a section index. */
const OPENS_AT = { 'on-the-origin-of-species': 2, middlemarch: 1, 'noli-me-tangere': 6, 'the-red-and-the-black': 1, 'cyrano-de-bergerac': 2, bushido: 3, beowulf: 6 };
/**
 * Books whose chapters are made of many short numbered pieces (the Analects' sayings,
 * Nietzsche's aphorisms): each chapter is read as one section, every piece under its number,
 * rather than as hundreds of sections.
 */
const GATHERED = new Set(['the-analects', 'beyond-good-and-evil']);

// ---------------------------------------------------------------------------------------
// Cleaning

const INLINE = { em: 'em', i: 'i', b: 'b', strong: 'strong', sup: 'sup', sub: 'sub', cite: 'i', q: 'q', small: 'small', br: 'br' };
const KEPT = { p: 'p', blockquote: 'blockquote', ul: 'ul', ol: 'ol', li: 'li', pre: 'pre', table: 'table', thead: 'thead', tbody: 'tbody', tr: 'tr', td: 'td', th: 'th', dl: 'dl', dt: 'dt', dd: 'dd' };
const DROPPED = new Set(['script', 'style', 'img', 'figure', 'svg', 'nav', 'noscript', 'iframe', 'audio', 'video', 'map', 'form', 'button', 'object', 'link', 'meta', 'title', 'head']);
const BLOCKISH = new Set(['p', 'div', 'blockquote', 'ul', 'ol', 'pre', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'hr', 'dl', 'hgroup', 'center', 'figure']);
const HEADING = /^h[1-6]$/;

const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const squeeze = (text) => text.replace(/\s+/g, ' ');
const epub = (node) => node.attribs?.['epub:type'] ?? '';
const classes = (node) => node.attribs?.class ?? '';
const skipped = (node) =>
  DROPPED.has(node.name) ||
  /pagenum|pageno|pg-boilerplate|pgheader|pgfooter/.test(classes(node)) ||
  /\b(pagebreak|backlink)\b/.test(epub(node)) ||
  node.attribs?.role === 'doc-backlink';

const textOf = (node) => (node.type === 'text' ? node.data : skipped(node) ? '' : node.name === 'br' ? '\n' : (node.children ?? []).map(textOf).join(''));
/** A heading's words; where it is broken over two lines ("CHAPTER I / A SHIFTING REEF") a colon joins them. */
const headingOf = (node) =>
  textOf(node)
    .split('\n')
    .map((part) => squeeze(part).trim().replace(/[.:]+$/, ''))
    .filter(Boolean)
    .join(': ');

/** The cleaned HTML of what is inside a node, keeping only inline marks and simple structure. */
function inner(node, pre = false) {
  let html = '';
  for (const child of node.children ?? []) {
    if (child.type === 'text') html += escape(pre ? child.data : squeeze(child.data));
    else if (child.type === 'tag') html += outer(child, pre);
  }
  return html;
}

function outer(node, pre = false) {
  if (skipped(node)) return '';
  const name = node.name;
  if (name === 'br') return '<br>';
  if (name === 'hr') return '<hr>';
  if (name === 'a' && /\bnoteref\b/.test(epub(node))) return `<sup>${inner(node)}</sup>`;
  if (HEADING.test(name)) return `<h3>${inner(node).trim()}</h3>`;
  const tag = INLINE[name] ?? KEPT[name];
  const content = inner(node, pre || name === 'pre');
  if (!tag) return content; // span, abbr, a, div and the like: their text stays, the tag goes
  if (!content.trim()) return '';
  // A chapter's argument ("In which…") and its epigraph are set apart from the text proper.
  const aside = /\b(bridgehead|argument)\b/.test(epub(node)) ? 'lede' : /\bepigraph\b/.test(epub(node)) ? 'epigraph' : '';
  if (tag === 'p') return paragraph(content, aside);
  if (aside && tag === 'blockquote') return `<blockquote class="${aside}">${content.trim()}</blockquote>`;
  return `<${tag}>${tag in INLINE ? content : content.trim()}</${tag}>`;
}

/** Lines broken by hand are verse (or a letter's address): set without indent or justification. */
const paragraph = (content, aside = '') => {
  const text = content.trim().replace(/^(<br>\s*)+|(\s*<br>)+$/g, '');
  const kind = aside || (text.includes('<br>') ? 'verse' : '');
  return text ? `<p${kind ? ` class="${kind}"` : ''}>${text}</p>` : '';
};

/**
 * Flattens a part of the page into its blocks, in order: `{ heading, text }` for a heading,
 * `{ html }` for anything else. Wrappers (div, section, header) dissolve.
 */
function blocks(node, list = []) {
  let loose = '';
  const flush = () => {
    const html = paragraph(loose);
    if (html) list.push({ html });
    loose = '';
  };
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      loose += escape(squeeze(child.data));
      continue;
    }
    if (child.type !== 'tag' || skipped(child)) continue;
    const name = child.name;
    if (HEADING.test(name)) {
      flush();
      list.push({ heading: Number(name[1]), text: headingOf(child) });
    } else if (name === 'hgroup') {
      flush();
      const parts = child.children.filter((part) => part.type === 'tag').map(headingOf);
      list.push({ heading: 2, text: parts.filter(Boolean).join(': ') });
    } else if (name === 'hr') {
      flush();
      list.push({ html: '<hr>' });
    } else if (name in KEPT) {
      flush();
      const html = outer(child);
      if (html) list.push({ html });
    } else if (BLOCKISH.has(name) && child.children?.some((inside) => inside.type === 'tag' && BLOCKISH.has(inside.name))) {
      flush();
      blocks(child, list);
    } else if (BLOCKISH.has(name)) {
      flush();
      const html = paragraph(inner(child));
      if (html) list.push({ html });
    } else {
      loose += outer(child);
    }
  }
  flush();
  return list;
}

const plain = (html) => cheerio.load(`<body>${html.replaceAll('<br>', '\n')}</body>`)('body').text();
const words = (text) => (text.match(/\S+/g) ?? []).length;

const ROMAN = /^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'with']);

/** "CHAPTER I. THE GRAND HALL." becomes "Chapter I. The Grand Hall". */
function title(text) {
  let clean = squeeze(text).trim().replace(/[.:]+$/, '');
  if (clean && clean === clean.toUpperCase() && /[A-Z]{2}/.test(clean)) {
    clean = clean
      .split(' ')
      .map((word, at, all) => {
        const bare = word.replace(/[^A-Za-z]/g, '');
        if (ROMAN.test(bare)) return word;
        const lower = word.toLowerCase();
        if (at > 0 && !all[at - 1].endsWith(':') && SMALL.has(lower.replace(/[^a-z]/g, ''))) return lower;
        return lower.replace(/(^|[-—“‘("'])([a-zà-ÿ])/g, (_, lead, letter) => lead + letter.toUpperCase());
      })
      .join(' ');
  }
  return clean;
}

// ---------------------------------------------------------------------------------------
// The two sources

const SE_SKIP = /\b(titlepage|imprint|toc|colophon|copyright-page|loi|halftitlepage|landmarks|cover)\b/;
const NOT_THE_STORY = /\b(epigraph|dedication|preface|foreword|introduction|preamble|acknowledgments|endnotes|appendix|afterword|glossary|bibliography|index|frontmatter|backmatter)\b/;

function fromStandardEbooks(html, gather = false) {
  const $ = cheerio.load(html);
  const labels = new Map();
  $('nav#toc a').each((_, link) => {
    labels.set(($(link).attr('href') ?? '').replace(/^.*#/, ''), squeeze($(link).text()).trim());
  });
  const sections = [];
  let pending = [];

  const visit = (section, story) => {
    const type = epub(section);
    if (SE_SKIP.test(type) || section.attribs?.id === 'uncopyright') return;
    const within = story && !NOT_THE_STORY.test(type);
    const children = (section.children ?? []).filter((child) => child.type === 'tag' && (child.name === 'section' || child.name === 'article'));
    const own = { children: (section.children ?? []).filter((child) => !children.includes(child)) };
    const list = blocks(own);
    const headings = list.filter((block) => block.heading);
    const body = list.filter((block) => !block.heading);
    const label = labels.get(section.attribs?.id ?? '') || headings.map((block) => block.text).join(' · ') || title(type.split(/\s+/).find((word) => !/matter$|^z3998|^se:/.test(word)) ?? '');
    const html = body.map((block) => block.html).join('\n');
    if (gather && children.length && children.every((child) => !child.children?.some((inner) => inner.type === 'tag' && (inner.name === 'section' || inner.name === 'article')))) {
      const pieces = children.map((child) => {
        const inner = blocks(child);
        return {
          label: labels.get(child.attribs?.id ?? '') || inner.filter((block) => block.heading).map((block) => block.text).join(' · '),
          html: inner.filter((block) => !block.heading).map((block) => block.html).join('\n'),
        };
      });
      const joined = [html, ...pieces.map((piece) => (piece.label ? `<h3>${piece.label}</h3>\n` : '') + piece.html)].filter(Boolean).join('\n');
      sections.push({ title: label, part: take(), html: joined, story: within });
      return;
    }
    if (children.length) {
      // A part or a volume. With nothing of its own to read, it is only a label for what follows.
      if (words(plain(html)) < 40) pending.push(label);
      else sections.push({ title: label, part: take(), html, story: within });
      for (const child of children) visit(child, within);
      return;
    }
    if (!html) return;
    sections.push({ title: label, part: take(), html, story: within });
  };
  const take = () => {
    const part = pending.join(' · ');
    pending = [];
    return part || undefined;
  };

  $('main > section, main > article, body > section, body > article').each((_, section) => visit(section, true));
  return sections;
}

const PG_SKIP = /^(contents|table of contents|list of illustrations|illustrations|transcriber.?s notes?|index|the full project gutenberg license)\b/i;
const PG_NOT_STORY = /^(preface|foreword|introduction|introductory|prefatory|translator|note|dedication|editor|biograph|author.?s (preface|note)|to the reader|a note)/i;

function fromGutenberg(html) {
  const $ = cheerio.load(html);
  $('#pg-header, #pg-footer, .pg-boilerplate, #pg-start-separator, #pg-end-separator').remove();
  const list = blocks($('body')[0]);
  const raw = [];
  let current = { title: '', blocks: [] };
  for (const block of list) {
    if (block.heading && block.heading <= 3) {
      raw.push(current);
      current = { title: title(block.text), blocks: [] };
    } else if (block.heading) current.blocks.push({ html: `<h3>${escape(block.text)}</h3>` });
    else current.blocks.push(block);
  }
  raw.push(current);

  const sections = [];
  let pending = [];
  raw.forEach((entry, at) => {
    const html = entry.blocks.map((block) => block.html).join('\n').replace(/^(<hr>\n?)+|(\n?<hr>)+$/g, '');
    const count = words(plain(html));
    if (PG_SKIP.test(entry.title)) return;
    // Before the first heading there is the title page; a list of links is a table of contents.
    if (at === 0 && count < 600) return;
    if (count < 40) {
      if (entry.title) pending.push(entry.title);
      return;
    }
    // What stands before the first section is mostly the title page; only a volume or a part is a label.
    if (sections.length === 0) pending = pending.filter((label) => /^(part|book|volume|canto|act|section)\b/i.test(label));
    sections.push({ title: entry.title, part: pending.join(' · ') || undefined, html, story: !PG_NOT_STORY.test(entry.title) });
    pending = [];
  });
  return sections;
}

// ---------------------------------------------------------------------------------------

async function page(book) {
  const tries = [];
  if (book.standardEbooks) tries.push(['standardebooks', `https://standardebooks.org/ebooks/${book.standardEbooks}/text/single-page`, `https://standardebooks.org/ebooks/${book.standardEbooks}`]);
  tries.push(['gutenberg', `https://www.gutenberg.org/ebooks/${book.gutenberg}.html.images`, `https://www.gutenberg.org/ebooks/${book.gutenberg}`]);
  for (const [from, url, credit] of tries) {
    const kept = join(CACHE, `${book.id}.${from}.html`);
    if (existsSync(kept)) return { from, credit, html: await readFile(kept, 'utf8') };
    try {
      const response = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(120000) });
      await pause(1500);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length < 20000) throw new Error('too short to be a book');
      await writeFile(kept, html);
      return { from, credit, html };
    } catch (error) {
      console.warn(`  ${book.id}: ${from} failed (${error.message})`);
    }
  }
  return null;
}

/** The first lines of a section: whole paragraphs up to about a hundred words. */
function opening(html) {
  const $ = cheerio.load(`<body>${html}</body>`);
  const lines = [];
  let total = 0;
  $('sup').remove();
  // A play: each row of the table is a speaker and a speech.
  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).children().toArray().map((cell) => squeeze($(cell).text()).trim()).filter(Boolean);
      $(table).before(`<p>${escape(cells.length > 1 ? `${cells[0]}: ${cells.slice(1).join(' ')}` : cells.join(''))}</p>`);
    });
  });
  for (const element of $('body').children().toArray()) {
    if (!['p', 'blockquote'].includes(element.name) || /lede|epigraph/.test(classes(element))) continue;
    let text = plain($.html(element)).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    if (!text) continue;
    const count = words(text);
    if (total + count > 150) {
      // A long paragraph is cut at the end of a sentence.
      const room = Math.max(40, 115 - total);
      const sentences = text.match(/[^.!?…]+[.!?…]+["”’')\]]*\s*/g) ?? [text];
      let cut = '';
      for (const sentence of sentences) {
        if (cut && words(cut + sentence) > room) break;
        cut += sentence;
      }
      if (total && words(cut) > room * 1.6) break;
      text = cut.trim();
      lines.push(text);
      break;
    }
    lines.push(text);
    total += count;
    if (total >= 70) break;
  }
  return lines;
}

await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });
const previous = existsSync(OPENINGS) ? JSON.parse((await readFile(OPENINGS, 'utf8')).replace(/^[\s\S]*?= /, '').replace(/;\s*$/, '')) : {};
const openings = {};
const report = [];

for (const book of BOOKS) {
  if (only && !book.id.includes(only)) {
    if (previous[book.id]) openings[book.id] = previous[book.id];
    continue;
  }
  const source = await page(book);
  if (!source) {
    report.push(`${book.id}: NO TEXT`);
    continue;
  }
  const sections = (source.from === 'standardebooks' ? fromStandardEbooks : fromGutenberg)(source.html, GATHERED.has(book.id));
  if (sections.length === 0) {
    report.push(`${book.id}: no sections found (${source.from})`);
    continue;
  }
  const dir = join(OUT, book.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const index = { from: source.from, source: source.credit, sections: [] };
  for (const [at, section] of sections.entries()) {
    // Plain .txt, although it holds HTML: the host would turn an address ending in .html into a redirect.
    await writeFile(join(dir, `${at}.txt`), section.html);
    index.sections.push({ title: section.title, ...(section.part ? { part: section.part } : {}), words: words(plain(section.html)) });
  }
  const guess = sections.findIndex((section) => section.story && words(plain(section.html)) > 50);
  const start = OPENS_AT[book.id] ?? Math.max(0, guess);
  index.start = start;
  await writeFile(join(dir, 'index.json'), JSON.stringify(index));
  openings[book.id] = { section: start, lines: opening(sections[start].html) };
  const total = index.sections.reduce((sum, section) => sum + section.words, 0);
  report.push(`${book.id}: ${source.from}, ${sections.length} sections, ${total} words, opens at ${start} "${sections[start].title}"`);
}

await writeFile(
  OPENINGS,
  `// Written by scripts/fetch-texts.mjs. Do not edit by hand.
//
// The first lines of each public-domain book, as its text in public/texts begins, and the
// section of that text they come from.

export const OPENINGS: Record<string, { section: number; lines: string[] }> = ${JSON.stringify(openings, null, 1)};
`,
);
if (!only) {
  await writeFile(
    join(ROOT, 'src', 'data', 'texts.ts'),
    `// Written by scripts/fetch-texts.mjs. Do not edit by hand.\n//\n// The books whose text is kept in public/texts, and can be read on the site.\n\nexport const READABLE = new Set<string>(${JSON.stringify(Object.keys(openings))});\n`,
  );
}
console.log(report.join('\n'));
