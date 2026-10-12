import { useSyncExternalStore } from 'react';
import { BOOKS } from '../data/books';

/*
  What the keeper of the site has decided about each book, over what the catalogue says:
  whether its download is offered, which articles are listed beside it, corrections to its
  entry, and a file put beside it. Every reader fetches these once (GET /api/books); only a
  card whose role is 'admin' can change them (worker/index.ts). With no server, nothing is
  decided and every book is as the catalogue has it.

  A file is kept by the server in pieces and put together again here. The server hands the
  file of a book out of copyright to anyone, and the file of any other book only to the
  keeper's own card.
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
  /** Whether every reader may have it (keeper's list only). */
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
  fetch(`${API}/books`)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((answer: { books: Record<string, Decided> }) => {
      decided = answer.books ?? {};
      for (const [bookId, book] of Object.entries(decided)) correct(bookId, book.edits);
      tell();
    })
    .catch(() => {
      // No server (or not reachable): the catalogue stands as it is.
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
    return response.json() as Promise<{ open?: boolean }>;
  };
  await send('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, bytes: file.size, pieces }) });
  for (let n = 0; n < pieces; n++) {
    await send(`/${n}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file.slice(n * PIECE, (n + 1) * PIECE) });
    onProgress((n + 1) / pieces);
  }
  const { open } = await send('/done', { method: 'POST' });
  const kept: KeptFile = { name: file.name, bytes: file.size, pieces, open: !!open };
  if (open) {
    decided = { ...decided, [bookId]: { ...(decided[bookId] ?? { download: true, articles: [] }), file: kept } };
    tell();
  }
  return kept;
}

export async function dropFile(code: string, bookId: string): Promise<boolean> {
  const response = await fetch(`${API}/files/${bookId}`, { method: 'DELETE', headers: withCard(code) });
  if (response.ok && decided[bookId]?.file) {
    decided = { ...decided, [bookId]: { ...decided[bookId], file: undefined } };
    tell();
  }
  return response.ok;
}

/** Fetches a kept file whole and hands it to the browser to save. The card is needed only for the keeper's own files. */
export async function saveFile(bookId: string, file: KeptFile, code?: string | null): Promise<boolean> {
  try {
    const parts: ArrayBuffer[] = [];
    for (let n = 0; n < file.pieces; n++) {
      const response = await fetch(`${API}/files/${bookId}/${n}`, { headers: withCard(code) });
      if (!response.ok) return false;
      parts.push(await response.arrayBuffer());
    }
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/octet-stream' }));
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
