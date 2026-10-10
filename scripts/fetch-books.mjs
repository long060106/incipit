// Keeps a PDF of every public-domain book on the site itself, so "Download the book" hands
// over a file that opens on any device instead of sending the reader to another site, and
// finds each book's free audiobook on LibriVox.
//
//   npm run books            -> only what is missing
//   npm run books -- --force -> make everything again
//   npm run books -- emma    -> only books whose id contains the text, made again
//
// Neither source publishes PDFs, so each one is made here: the book's whole text is opened
// as a single web page (Standard Ebooks when the book has an edition there, since their
// files are dedicated to the public domain; otherwise Project Gutenberg, with its notice
// and licence left in place) and printed by the browser as small book pages. Needs
// Microsoft Edge or Google Chrome on this machine. Books still in copyright are never
// fetched: they have no `free` entry in src/data/books.ts.
//
// Writes public/books/<id>.pdf and src/data/editions.ts (sizes, sources, audiobook links).

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BOOKS } from '../src/data/books.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'books');
const MANIFEST = join(ROOT, 'src', 'data', 'editions.ts');
const AGENT = 'incipit-catalog-script (prototype)';
const UA = { 'User-Agent': AGENT };
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((arg) => !arg.startsWith('--'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(OUT, { recursive: true });

// The page of the PDF: A5, which reads well on a screen and prints two to a sheet. The
// rules below undo what each source's web page does for a browser window (a narrow centred
// column, a site bar, large screen type) and start every part of the book on a new page.
const PRINT_CSS = `
  @page { size: 148mm 210mm; margin: 17mm 15mm 19mm; }
  html, body { font-size: 10.5pt !important; }
  body {
    display: block !important; margin: 0 !important; padding: 0 !important;
    width: auto !important; max-width: none !important;
    font-family: Georgia, 'Times New Roman', serif !important; line-height: 1.42 !important;
    background: #fff !important; color: #000 !important;
  }
  p { orphans: 2; widows: 2; }
  img, svg { max-width: 100% !important; height: auto !important; }
  a { color: inherit !important; text-decoration: none !important; }

  /* Standard Ebooks */
  body > header:not(#pg-header) { display: none !important; }
  main { margin: 0 !important; padding: 0 !important; width: auto !important; max-width: none !important; }
  main > section, main > article, main > nav { break-before: page; margin-top: 0 !important; }
  main > :first-child { break-before: auto; }
  main p { text-align: justify; }
  main #toc ol { columns: 3; padding: 0; }
  main #toc li { margin: 0 0 0.2em !important; }

  /* Project Gutenberg. A margin hanging off the end of its notice would leave a blank page. */
  #pg-start-separator, #pg-header > :last-child { margin-bottom: 0 !important; }
  figure, .figcenter, .figleft, .figright, .illus { break-inside: avoid; }
`;
const PAGE_NUMBER =
  '<div style="width:100%;text-align:center;font:8px Georgia,serif;color:#555"><span class="pageNumber"></span></div>';

/** The whole book as one web page at its source, best edition first. */
function sources(book) {
  const list = [];
  if (book.free.standardEbooks) list.push(['standardebooks', `https://standardebooks.org/ebooks/${book.free.standardEbooks}/text/single-page`]);
  if (book.free.gutenberg) list.push(['gutenberg', `https://www.gutenberg.org/ebooks/${book.free.gutenberg}.html.images`]);
  return list;
}

let browser = null;
async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('Making the PDFs needs Microsoft Edge or Google Chrome installed.');
}

async function makePdf(book) {
  const file = join(OUT, `${book.id}.pdf`);
  browser ??= await launch();
  for (const [from, url] of sources(book)) {
    const context = await browser.newContext({ userAgent: AGENT });
    try {
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'load', timeout: 240000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
      // A book is long: a short page is an error page or a stub.
      const length = await page.evaluate(() => document.body.innerText.length);
      if (length < 15000) throw new Error(`only ${length} characters`);
      await page.evaluate((title) => {
        document.title = title;
        // Project Gutenberg's notice and licence go on pages of their own. Their boxes
        // inherit every property, so the break is set on the book's first and last parts.
        const filled = (element) => element.textContent.trim() || element.querySelector('img, svg');
        let first = document.getElementById('pg-header')?.nextElementSibling;
        while (first && !filled(first)) first = first.nextElementSibling;
        if (first) first.style.breakBefore = 'page';
        let last = document.getElementById('pg-footer')?.previousElementSibling;
        while (last && !filled(last)) last = last.previousElementSibling;
        if (last) last.style.breakAfter = 'page';
      }, `${book.title}, by ${book.author}`);
      // Illustrations scanned at print size, or traced as drawings of a million strokes,
      // would make a file of tens of megabytes: turn the heavy ones into pictures no
      // larger than an A5 page can show.
      await page.evaluate(async (limit) => {
        for (const img of document.images) {
          const vector = /^data:image\/svg|\.svg(\?|$)/.test(img.currentSrc);
          const heavy = vector ? img.currentSrc.length > 200000 : img.naturalWidth * img.naturalHeight > 1200000;
          if (!heavy || !img.naturalWidth) continue;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = vector ? limit * 0.72 : Math.min(limit, img.naturalWidth);
            canvas.height = Math.round((canvas.width * img.naturalHeight) / img.naturalWidth);
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(img, 0, 0, canvas.width, canvas.height);
            img.removeAttribute('srcset');
            img.src = canvas.toDataURL('image/jpeg', vector ? 0.6 : 0.8);
            await img.decode();
          } catch {
            // An image from another site cannot be redrawn; it stays as it is.
          }
        }
      }, 1000);
      await page.addStyleTag({ content: PRINT_CSS });
      await page.emulateMedia({ media: 'print' });
      await page.pdf({
        path: file,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: PAGE_NUMBER,
      });
      if (statSync(file).size < 30000) throw new Error('the PDF came out empty');
      return from;
    } catch (error) {
      console.error(`  ${book.id}: ${from} failed (${error.message.split('\n')[0]})`);
    } finally {
      await context.close();
    }
  }
  return null;
}

/** The LibriVox recording of the book in English: the first complete one by this author. */
async function audiobook(book) {
  const surname = book.author.split(' ').at(-1).toLowerCase();
  // LibriVox files titles its own way ("Moby Dick, or the Whale"), so try the title as it
  // stands, then without its article and hyphens, then by its first two words.
  const plain = book.title.replace(/^(The|A|An) /, '').replaceAll('-', ' ');
  const titles = [...new Set([book.title, plain, plain.split(' ').slice(0, 2).join(' ')])];
  for (const title of titles) {
    const url = `https://librivox.org/api/feed/audiobooks/?title=${encodeURIComponent('^' + title)}&format=json&fields=${encodeURIComponent('{id,title,url_librivox,language,authors}')}`;
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!res.ok) continue;
      const { books = [] } = await res.json();
      const match = books.find(
        (entry) =>
          entry.language === 'English' &&
          entry.url_librivox &&
          // A recording of one volume is not the book.
          !/\b(vol|volume|book|part)\b\.? ?\d/i.test(entry.title) &&
          entry.authors?.some((author) => {
            const last = author.last_name?.toLowerCase() ?? '';
            return last && (last.includes(surname) || surname.includes(last));
          }),
      );
      if (match) return match.url_librivox;
    } catch {
      // Try the next spelling.
    }
    await pause(400);
  }
  return null;
}

const previous = existsSync(MANIFEST) ? (await import(`file://${MANIFEST}`)).EDITIONS : {};
const editions = {};

for (const book of BOOKS) {
  if (!book.free) continue;
  const file = join(OUT, `${book.id}.pdf`);
  const known = previous[book.id];

  let from = existsSync(file) ? (known?.from ?? null) : null;
  if (only ? book.id.includes(only) : force || !from) {
    from = await makePdf(book);
    await pause(1500);
  }
  let librivox = known?.librivox;
  if ((force && !only) || librivox === undefined) {
    librivox = await audiobook(book);
    await pause(500);
  }

  if (from) editions[book.id] = { from, bytes: statSync(file).size, librivox: librivox ?? null };
  else if (librivox) editions[book.id] = { from: null, bytes: 0, librivox };
  console.log(`${book.id}: ${from ? `${(statSync(file).size / 1024).toFixed(0)} kB from ${from}` : 'NO FILE'}${librivox ? ', audiobook found' : ''}`);
}
await browser?.close();

const lines = Object.entries(editions).map(([id, entry]) => `  '${id}': ${JSON.stringify(entry)},`);
writeFileSync(
  MANIFEST,
  `// Written by scripts/fetch-books.mjs. Do not edit by hand.
//
// For each public-domain book: the PDF kept in public/books (which edition it was made from
// and its size), and the address of its free audiobook on LibriVox when there is one.

export interface Edition {
  from: 'standardebooks' | 'gutenberg' | null;
  bytes: number;
  librivox: string | null;
}

export const EDITIONS: Record<string, Edition> = {
${lines.join('\n')}
};
`,
);
const total = Object.values(editions).reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`${Object.keys(editions).length} books, ${(total / 1024 / 1024).toFixed(1)} MB`);
