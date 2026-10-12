import { BOOKS, BOOKS_BY_ID } from '../data/books';
import type { Book } from '../data/types';

/*
  The books the keeper has added from the desk (/admin), beside the catalogue of
  src/data/books.ts. They are kept by the server and arrive with GET /api/books. Before the
  site starts (src/main.tsx waits for `ready`) they are put into BOOKS itself, so every page
  finds them where it finds the others. The last answer is remembered in this browser, and
  stands in when the server is slow or cannot be reached.
*/

const KEY = 'incipit:added';
const WAIT = 1500; // milliseconds the site will wait for the server before starting

/** What GET /api/books answers. `books` is read by src/lib/keeper.ts. */
export interface Answer {
  books?: Record<string, unknown>;
  added?: Book[];
}

/** The one request for /api/books this page makes; null if the server gave no answer. */
export const answer: Promise<Answer | null> = fetch(`${import.meta.env.BASE_URL}api/books`)
  .then((response) => (response.ok ? (response.json() as Promise<Answer>) : null))
  .catch(() => null);

function remembered(): Book[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, JSON.stringify(BOOKS.filter((book) => book.added)));
  } catch {
    // Then the server is asked again next time, as it is anyway.
  }
}

/** Puts an added book among the others, in place of an earlier copy of itself if there is one. */
export function shelve(book: Book) {
  const at = BOOKS.findIndex((entry) => entry.id === book.id);
  if (at < 0) BOOKS.push(book);
  else if (BOOKS[at].added) BOOKS[at] = book;
  else return; // never over a book of the catalogue
  BOOKS_BY_ID.set(book.id, book);
  remember();
}

export function unshelve(id: string) {
  const at = BOOKS.findIndex((entry) => entry.id === id && entry.added);
  if (at < 0) return;
  BOOKS.splice(at, 1);
  BOOKS_BY_ID.delete(id);
  remember();
}

/** Resolves once the added books are in place: when the server has answered, or after a short wait. */
export const ready: Promise<void> = Promise.race([answer, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), WAIT))]).then((first) => {
  const list = first ? (first.added ?? []) : remembered();
  for (const book of list) if (book && typeof book.id === 'string' && book.added) shelve(book);
  if (first) remember();
  // An answer that came too late for this visit is kept for the next.
  else if (first === undefined) void answer.then((late) => late && localStorage.setItem(KEY, JSON.stringify(late.added ?? [])), () => undefined);
});
