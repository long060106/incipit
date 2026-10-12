import { useSyncExternalStore } from 'react';
import { BOOKS } from '../data/books';
import { answer } from './added';

/*
  What the keeper of the site has decided about each book, over what the catalogue says:
  whether its download is offered, which articles are listed beside it, corrections to its
  entry, and a file put beside it, open to every reader or closed to all but the keeper. Every reader fetches these once (GET /api/books); only a
  card whose role is 'admin' can change them (worker/index.ts). With no server, nothing is
  decided and every book is as the catalogue has it.

  A file is kept by the server in pieces and put together again here. The server hands an
  open file to anyone, and a closed one only to the keeper's own card.
*/

export interface Article {
  title: string;
  url: string;
}

/** The keeper's corrections to a book's entry. A field left out is as the catalogue has it. */
export interface Edits {
  title?: string;
  author?: string;
  year?: number;
  description?: { en?: string; fr?: string };
}

export interface KeptFile {
  name: string;
  bytes: number;
  pieces: number;
  /** When the server kept it: tells a file from the one it replaced. */
  changed?: number;
  /** Whether every reader may have it. Given in the keeper's list; what readers are told of is always open. */
  open?: boolean;
}

export interface Decided {
  download: boolean;
  articles: Article[];
  edits?: Edits;
  file?: KeptFile;
}

const API = `${import.meta.env.BASE_URL}api`;
const PIECE = 512 * 1024; // as in worker/index.ts
export const MAX_FILE = 60 * 1024 * 1024;
export const FILE_KINDS = /\.(epub|pdf|txt|mobi|azw3)$/i;

const listeners = new Set<() => void>();
let decided: Record<string, Decided> = {};
let asked = false;
/** What the keeper changed on this page before the server's answer arrived. */
const changed: Record<string, Decided> = {};

/** Each book as the catalogue wrote it, so that a correction can be taken back. */
const PRINTED = new Map(BOOKS.map((book) => [book.id, { title: book.title, author: book.author, year: book.year, description: { ...book.description } }]));
export const printed = (bookId: string) => PRINTED.get(bookId);

/** Writes the keeper's corrections into the catalogue held in memory, where every page reads it. */
function correct(bookId: string, edits: Edits = {}) {
  const book = BOOKS.find((entry) => entry.id === bookId);
  const first = PRINTED.get(bookId);
  if (!book || !first) return;
  book.title = edits.title ?? first.title;
  book.author = edits.author ?? first.author;
  book.year = edits.year ?? first.year;
  book.description = { ...first.description, ...edits.description };
}

const tell = () => {
  for (const listener of listeners) listener();
};

function ask() {
  if (asked) return;
  asked = true;
  // The request is made once for the whole page, by src/lib/added.ts. With no server (or
  // none reachable) nothing arrives and the catalogue stands as it is.
  void answer.then((given) => {
    if (!given) return;
    decided = { ...((given.books ?? {}) as Record<string, Decided>), ...changed };
    for (const [bookId, book] of Object.entries(decided)) correct(bookId, book.edits);
    tell();
  });
}

/** The keeper's decisions, by book id. Empty until they arrive. */
export function useDecided() {
  ask();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => decided,
  );
}

/** Changes a decision. Resolves to whether the server took it. */
export async function decide(code: string, bookId: string, change: Partial<Pick<Decided, 'download' | 'articles' | 'edits'>>): Promise<boolean> {
  try {
    const response = await fetch(`${API}/books/${bookId}`, {
      method: 'PUT',
      headers: { authorization: `Card ${code}`, 'content-type': 'application/json' },
      body: JSON.stringify(change),
    });
    if (!response.ok) return false;
    const { book } = (await response.json()) as { book: Decided };
    decided = { ...decided, [bookId]: { ...book, file: decided[bookId]?.file } };
    changed[bookId] = decided[bookId];
    correct(bookId, book.edits);
    tell();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// Files

const withCard = (code: string | null | undefined): HeadersInit => (code ? { authorization: `Card ${code}` } : {});

/** Every file the server keeps, by book id: the keeper's own view. */
export async function keptFiles(code: string): Promise<Record<string, KeptFile>> {
  const response = await fetch(`${API}/files`, { headers: withCard(code) });
  if (!response.ok) throw new Error('refused');
  return ((await response.json()) as { files: Record<string, KeptFile> }).files;
}

/**
 * Sends a file to be kept beside a book, piece by piece. `onProgress` is told how far it
 * has got, from 0 to 1. Throws an Error whose message is the server's reason.
 */
export async function keepFile(code: string, bookId: string, file: File, onProgress: (done: number) => void): Promise<KeptFile> {
  if (!FILE_KINDS.test(file.name)) throw new Error('bad-name');
  if (file.size > MAX_FILE) throw new Error('too-large');
  const pieces = Math.ceil(file.size / PIECE);
  const send = async (path: string, init: RequestInit) => {
    const response = await fetch(`${API}/files/${bookId}${path}`, { ...init, headers: { ...withCard(code), ...init.headers } });
    if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? 'failed');
    return response.json() as Promise<{ open?: boolean; changed?: number }>;
  };
  await send('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, bytes: file.size, pieces }) });
  for (let n = 0; n < pieces; n++) {
    await send(`/${n}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file.slice(n * PIECE, (n + 1) * PIECE) });
    onProgress((n + 1) / pieces);
  }
  const { open, changed: at } = await send('/done', { method: 'POST' });
  const kept: KeptFile = { name: file.name, bytes: file.size, pieces, open: !!open, changed: at };
  show(bookId, kept);
  return kept;
}

/** Readers of this page see a file on a book's sheet only while it is open. */
function show(bookId: string, file: KeptFile) {
  decided = { ...decided, [bookId]: { ...(decided[bookId] ?? { download: true, articles: [] }), file: file.open ? file : undefined } };
  changed[bookId] = decided[bookId];
  tell();
}

/** Opens a kept file to every reader, or closes it to all but the keeper. */
export async function openFile(code: string, bookId: string, file: KeptFile, open: boolean): Promise<KeptFile | null> {
  const response = await fetch(`${API}/files/${bookId}/open`, { method: 'POST', headers: { ...withCard(code), 'content-type': 'application/json' }, body: JSON.stringify({ open }) });
  if (!response.ok) return null;
  const next = { ...file, open };
  show(bookId, next);
  return next;
}

export async function dropFile(code: string, bookId: string): Promise<boolean> {
  const response = await fetch(`${API}/files/${bookId}`, { method: 'DELETE', headers: withCard(code) });
  if (response.ok && decided[bookId]?.file) {
    decided = { ...decided, [bookId]: { ...decided[bookId], file: undefined } };
    changed[bookId] = decided[bookId];
    tell();
  }
  return response.ok;
}

/** A kept file, whole, as the browser's own File. */
export async function fetchFile(bookId: string, file: KeptFile, code?: string | null): Promise<File | null> {
  try {
    const parts: ArrayBuffer[] = [];
    for (let n = 0; n < file.pieces; n++) {
      const response = await fetch(`${API}/files/${bookId}/${n}`, { headers: withCard(code) });
      if (!response.ok) return null;
      parts.push(await response.arrayBuffer());
    }
    return new File(parts, file.name, { type: /\.epub$/i.test(file.name) ? 'application/epub+zip' : /\.txt$/i.test(file.name) ? 'text/plain' : 'application/octet-stream' });
  } catch {
    return null;
  }
}

/** Fetches a kept file whole and hands it to the browser to save. The card is needed only for the keeper's own files. */
export async function saveFile(bookId: string, file: KeptFile, code?: string | null): Promise<boolean> {
  try {
    const whole = await fetchFile(bookId, file, code);
    if (!whole) return false;
    const url = URL.createObjectURL(whole);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

export const megabytes = (bytes: number) => (bytes < 100_000 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`);
