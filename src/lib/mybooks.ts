import { useSyncExternalStore } from 'react';

/*
  A reader's own books: EPUB or plain-text files they add from their device, to read with
  the site's reader (place kept, marks, notes, bookmark).

  The file never leaves the browser. It is opened here, cut into its chapters, cleaned down
  to plain structure and kept in this browser's own database (IndexedDB). Nothing of it is
  sent to the server, and no other reader can see it. Marks and notes made in it follow the
  library card like any others; the book itself has to be added again on another device.

  A short list of the books (id, title, author) is also kept in localStorage, so that pages
  can name a book without opening the database.
*/

export interface OwnBook {
  id: string;
  title: string;
  author: string;
  added: number;
}

export interface OwnText {
  sections: { title: string; html: string; words: number }[];
}

const LIST_KEY = 'incipit:own-books';
const DB_NAME = 'incipit-own-books';
const STORE = 'texts';
const listeners = new Set<() => void>();
let list: OwnBook[] = loadList();

function loadList(): OwnBook[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setList(next: OwnBook[]) {
  list = next;
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(next));
  } catch {
    // The list then lasts for this visit only.
  }
  for (const listener of listeners) listener();
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** True for the id of a reader's own book, as against one of the catalogue's. */
export const isOwn = (id: string) => id.startsWith('my-');
export const ownBook = (id: string) => list.find((book) => book.id === id);
export const ownText = (id: string) => withStore<OwnText | undefined>('readonly', (store) => store.get(id));

export function useOwnBooks() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => list,
  );
}

export async function removeOwnBook(id: string) {
  await withStore('readwrite', (store) => store.delete(id));
  setList(list.filter((book) => book.id !== id));
}

// ---------------------------------------------------------------------------------------
// Reading a file

const INLINE: Record<string, string> = { em: 'em', i: 'i', b: 'b', strong: 'strong', sup: 'sup', sub: 'sub', cite: 'i', q: 'q', small: 'small' };
const KEPT = new Set(['p', 'blockquote', 'ul', 'ol', 'li', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd']);
const DROPPED = new Set(['script', 'style', 'img', 'image', 'figure', 'svg', 'nav', 'noscript', 'iframe', 'audio', 'video', 'object', 'form', 'button', 'link', 'meta', 'title', 'head']);
const BLOCKISH = new Set(['p', 'div', 'blockquote', 'ul', 'ol', 'pre', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'hr', 'dl', 'hgroup', 'center', 'figure', 'aside', 'main', 'body']);
const HEADING = /^h[1-6]$/;

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const squeeze = (text: string) => text.replace(/\s+/g, ' ');
const name = (node: Element) => node.localName.toLowerCase();
const count = (text: string) => (text.match(/\S+/g) ?? []).length;

/** What is inside a node, with only inline marks and simple structure kept. No attribute survives. */
function inner(node: Node, pre = false): string {
  let html = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) html += escape(pre ? child.nodeValue ?? '' : squeeze(child.nodeValue ?? ''));
    else if (child instanceof Element) html += outer(child, pre);
  }
  return html;
}

function outer(node: Element, pre = false): string {
  const tag = name(node);
  if (DROPPED.has(tag)) return '';
  if (tag === 'br') return '<br>';
  if (tag === 'hr') return '<hr>';
  if (HEADING.test(tag)) return `<h3>${inner(node).trim()}</h3>`;
  const content = inner(node, pre || tag === 'pre');
  const kept = INLINE[tag] ?? (KEPT.has(tag) ? tag : null);
  if (!kept) return content;
  if (!content.trim()) return '';
  if (kept === 'p') return paragraph(content);
  return `<${kept}>${kept in INLINE ? content : content.trim()}</${kept}>`;
}

const paragraph = (content: string) => {
  const text = content.trim().replace(/^(<br>\s*)+|(\s*<br>)+$/g, '');
  return text ? `<p${text.includes('<br>') ? ' class="verse"' : ''}>${text}</p>` : '';
};

/** One cleaned block of a document; a heading keeps its words and its rank (1 for h1) instead. */
interface Block {
  html: string;
  heading?: string;
  level?: number;
}

/** A document's body as cleaned blocks, headings among them. */
function blocksOf(root: Element): Block[] {
  const parts: Block[] = [];
  const walk = (node: Element) => {
    let loose = '';
    const flush = () => {
      const html = paragraph(loose);
      if (html) parts.push({ html });
      loose = '';
    };
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        loose += escape(squeeze(child.nodeValue ?? ''));
        continue;
      }
      if (!(child instanceof Element)) continue;
      const tag = name(child);
      if (DROPPED.has(tag)) continue;
      if (HEADING.test(tag)) {
        flush();
        const text = squeeze(child.textContent ?? '').trim();
        if (text) parts.push({ html: `<h3>${escape(text)}</h3>`, heading: text, level: Number(tag[1]) });
      } else if (tag === 'hr') {
        flush();
        parts.push({ html: '<hr>' });
      } else if (KEPT.has(tag)) {
        flush();
        const html = outer(child);
        if (html) parts.push({ html });
      } else if (BLOCKISH.has(tag) && [...child.children].some((inside) => BLOCKISH.has(name(inside)))) {
        flush();
        walk(child);
      } else if (BLOCKISH.has(tag)) {
        flush();
        const html = paragraph(inner(child));
        if (html) parts.push({ html });
      } else {
        loose += outer(child);
      }
    }
    flush();
  };
  walk(root);
  return parts;
}

const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
const SPLIT_OVER = 4000; // words in one file of a book before its own headings are taken for chapters

/**
 * One file of a book as the reader's sections. Most books keep a chapter to a file, and the
 * file is then one section named by its first heading (or by `named`, from the book's table
 * of contents). A long file holding several headings of its highest rank is a whole book,
 * or a whole part, in one piece: it is cut at those headings, one section for each.
 */
function sectionsOf(blocks: Block[], named: string): OwnText['sections'] {
  const section = (title: string, inside: Block[]) => {
    const html = inside.map((block) => block.html).join('\n');
    return { title, html, words: count(plain(html)) };
  };
  const whole = section('', blocks);
  const top = Math.min(...blocks.map((block) => block.level ?? 9));
  const chapters = blocks.filter((block) => block.level === top).length;
  if (whole.words <= SPLIT_OVER || chapters < 2) {
    const first = blocks.findIndex((block) => block.heading);
    if (first < 0) return [{ ...whole, title: named }];
    return [section(blocks[first].heading!, blocks.filter((_, at) => at !== first))];
  }
  const cut: OwnText['sections'] = [];
  let title = named;
  let inside: Block[] = [];
  // A heading with nothing under it (a number above a name) is joined to the heading that follows.
  const close = (next: string) => {
    const made = section(title, inside);
    if (made.words >= 12) {
      cut.push(made);
      title = next;
    } else title = title && inside.length === 0 && cut.length > 0 ? `${title}: ${next}` : next;
    inside = [];
  };
  for (const block of blocks) {
    if (block.level === top) close(block.heading!);
    else inside.push(block);
  }
  close('');
  return cut;
}
const folder = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
/** "a/b/../c.xhtml" as "a/c.xhtml", without its #fragment. */
function resolve(base: string, href: string): string {
  const parts: string[] = [];
  for (const part of (base + decodeURIComponent(href.split('#')[0])).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

async function fromEpub(file: File): Promise<{ title: string; author: string; text: OwnText }> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');

  const container = read('META-INF/container.xml');
  const opfPath = container && xml(container).querySelector('rootfile')?.getAttribute('full-path');
  const opf = opfPath ? read(opfPath) : null;
  if (!opfPath || !opf) throw new Error('not-an-epub');
  const pack = xml(opf);
  const first = (tag: string) => [...pack.getElementsByTagName('*')].find((el) => el.localName === tag)?.textContent?.trim() ?? '';
  const entries = [...pack.getElementsByTagName('*')].filter((el) => el.localName === 'item');
  const items = new Map(entries.map((el) => [el.getAttribute('id'), el.getAttribute('href')]));
  const spine = [...pack.getElementsByTagName('*')].filter((el) => el.localName === 'itemref').map((el) => items.get(el.getAttribute('idref')));
  // XHTML that is not well formed still opens as ordinary HTML.
  const page = (source: string) => {
    const strict = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    return strict.querySelector('parsererror') || !strict.body ? new DOMParser().parseFromString(source, 'text/html') : strict;
  };

  // The names the book's own table of contents gives its files, for the chapters that carry no heading.
  const named = new Map<string, string>();
  const nameFile = (from: string, href: string | null, label: string | null | undefined) => {
    const text = squeeze(label ?? '').trim();
    const path = href ? resolve(folder(from), href) : '';
    if (text && path && !named.has(path)) named.set(path, text.slice(0, 160));
  };
  const nav = entries.find((el) => (el.getAttribute('properties') ?? '').split(/\s+/).includes('nav'))?.getAttribute('href');
  const ncx = entries.find((el) => el.getAttribute('media-type') === 'application/x-dtbncx+xml')?.getAttribute('href');
  const navPath = nav ? resolve(folder(opfPath), nav) : '';
  const navSource = navPath ? read(navPath) : null;
  if (navSource) {
    const lists = [...page(navSource).getElementsByTagName('*')].filter((el) => el.localName === 'nav');
    const contents = lists.find((el) => [...el.attributes].some((attribute) => attribute.localName === 'type' && attribute.value.split(/\s+/).includes('toc'))) ?? lists[0];
    for (const link of contents ? [...contents.getElementsByTagName('*')].filter((el) => el.localName === 'a') : []) nameFile(navPath, link.getAttribute('href'), link.textContent);
  }
  const ncxPath = ncx ? resolve(folder(opfPath), ncx) : '';
  const ncxSource = named.size === 0 && ncxPath ? read(ncxPath) : null;
  if (ncxSource) {
    for (const point of [...xml(ncxSource).getElementsByTagName('*')].filter((el) => el.localName === 'navPoint')) {
      const inside = [...point.children];
      nameFile(ncxPath, inside.find((el) => el.localName === 'content')?.getAttribute('src') ?? null, inside.find((el) => el.localName === 'navLabel')?.textContent);
    }
  }

  const sections: OwnText['sections'] = [];
  for (const href of spine) {
    const path = href ? resolve(folder(opfPath), href) : '';
    const source = path && path !== navPath ? read(path) : null;
    if (!source) continue;
    // A cover, a blank page or a half-title makes no section.
    for (const section of sectionsOf(blocksOf(page(source).body), named.get(path) ?? '')) if (section.words >= 12) sections.push(section);
  }
  if (sections.length === 0) throw new Error('empty');
  return { title: first('title') || file.name.replace(/\.epub$/i, ''), author: first('creator'), text: { sections } };
}

async function fromText(file: File): Promise<{ title: string; author: string; text: OwnText }> {
  const paragraphs = (await file.text()).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const sections: OwnText['sections'] = [];
  let current: { title: string; parts: string[]; words: number } = { title: '', parts: [], words: 0 };
  const close = () => {
    if (current.parts.length) sections.push({ title: current.title, html: current.parts.join('\n'), words: current.words });
  };
  for (const part of paragraphs) {
    // A short line that begins like a chapter heading starts a new section; so does a very long stretch.
    const heading = part.length < 80 && !part.includes('\n') && /^(chapter|part|book|chapitre|livre|canto|act|scene)\b|^[IVXLC]+\.?$/i.test(part);
    if (heading || current.words > 6000) {
      close();
      current = { title: heading ? part : '', parts: [], words: 0 };
      if (heading) continue;
    }
    current.parts.push(`<p>${escape(squeeze(part))}</p>`);
    current.words += count(part);
  }
  close();
  if (sections.length === 0) throw new Error('empty');
  return { title: file.name.replace(/\.[a-z]+$/i, ''), author: '', text: { sections } };
}

/** An EPUB or a text file as a title, an author and the sections the reader shows. */
export function readBookFile(file: File): Promise<{ title: string; author: string; text: OwnText }> {
  const epub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
  const text = /\.txt$/i.test(file.name) || file.type === 'text/plain';
  if (!epub && !text) throw new Error('unsupported');
  return epub ? fromEpub(file) : fromText(file);
}

/** A text kept in this browser under a name of the caller's, with a stamp saying which file it was read from. */
export interface StoredText {
  stamp: string;
  text: OwnText;
}
export const storedText = (key: string) => withStore<StoredText | undefined>('readonly', (store) => store.get(key)).catch(() => undefined);
export const storeText = (key: string, value: StoredText) => withStore('readwrite', (store) => store.put(value, key)).then(() => undefined, () => undefined);
export const dropText = (key: string) => withStore('readwrite', (store) => store.delete(key)).then(() => undefined, () => undefined);

/** Opens a file from the reader's device and keeps it as one of their own books. */
export async function addOwnBook(file: File): Promise<OwnBook> {
  const read = await readBookFile(file);
  const book: OwnBook = { id: `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: read.title, author: read.author, added: Date.now() };
  await withStore('readwrite', (store) => store.put(read.text, book.id));
  setList([book, ...list]);
  return book;
}
