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

/** A document's body as cleaned blocks, and the first heading found in it. */
function blocksOf(root: Element): { html: string; heading: string } {
  const parts: string[] = [];
  let heading = '';
  const walk = (node: Element) => {
    let loose = '';
    const flush = () => {
      const html = paragraph(loose);
      if (html) parts.push(html);
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
        if (!heading && text) heading = text;
        else if (text) parts.push(`<h3>${escape(text)}</h3>`);
      } else if (tag === 'hr') {
        flush();
        parts.push('<hr>');
      } else if (KEPT.has(tag)) {
        flush();
        const html = outer(child);
        if (html) parts.push(html);
      } else if (BLOCKISH.has(tag) && [...child.children].some((inside) => BLOCKISH.has(name(inside)))) {
        flush();
        walk(child);
      } else if (BLOCKISH.has(tag)) {
        flush();
        const html = paragraph(inner(child));
        if (html) parts.push(html);
      } else {
        loose += outer(child);
      }
    }
    flush();
  };
  walk(root);
  return { html: parts.join('\n'), heading };
}

const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
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
  const items = new Map([...pack.getElementsByTagName('*')].filter((el) => el.localName === 'item').map((el) => [el.getAttribute('id'), el.getAttribute('href')]));
  const spine = [...pack.getElementsByTagName('*')].filter((el) => el.localName === 'itemref').map((el) => items.get(el.getAttribute('idref')));

  const sections: OwnText['sections'] = [];
  for (const href of spine) {
    const source = href ? read(resolve(folder(opfPath), href)) : null;
    if (!source) continue;
    // XHTML that is not well formed still opens as ordinary HTML.
    let page = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    if (page.querySelector('parsererror') || !page.body) page = new DOMParser().parseFromString(source, 'text/html');
    const { html, heading } = blocksOf(page.body);
    const words = count(plain(html));
    if (words < 12) continue; // a cover, a blank page, a half-title
    sections.push({ title: heading, html, words });
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

/** Opens a file from the reader's device and keeps it as one of their own books. */
export async function addOwnBook(file: File): Promise<OwnBook> {
  const epub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
  const text = /\.txt$/i.test(file.name) || file.type === 'text/plain';
  if (!epub && !text) throw new Error('unsupported');
  const read = await (epub ? fromEpub(file) : fromText(file));
  const book: OwnBook = { id: `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: read.title, author: read.author, added: Date.now() };
  await withStore('readwrite', (store) => store.put(read.text, book.id));
  setList([book, ...list]);
  return book;
}
