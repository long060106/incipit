import { useEffect, useState } from 'react';
import { partOf } from '../data/stacks';
import type { Book } from '../data/types';

/*
  The books of the stacks (src/data/stacks.ts) as this page holds them. The list arrives with
  every book's name, mood and cover, which is all the wall and the filters read. What a book says
  of itself is fetched when its sheet opens, along with the other books of the same file.
*/

const STACKS = `${import.meta.env.BASE_URL}stacks`;

const blank = () => ({ en: '', fr: '' });

/** The one request for the list this page makes: no books if there is none to be had. */
export const stacks: Promise<Book[]> = fetch(`${STACKS}/list.json`)
  .then((response) => (response.ok ? (response.json() as Promise<Omit<Book, 'description' | 'advice'>[]>) : []))
  .then((list) => (Array.isArray(list) ? list : []))
  .then((list) => list.map((book) => ({ ...book, stacks: true as const, description: blank(), advice: { pace: blank(), headsUp: blank(), readIf: blank(), skipIf: blank() } })))
  .catch(() => []);

const parts = new Map<number, Promise<Record<string, Book>>>();

function part(at: number) {
  let asked = parts.get(at);
  if (!asked) {
    asked = fetch(`${STACKS}/parts/${at}.json`).then((response) => {
      if (!response.ok) throw new Error('no-such-part');
      return response.json() as Promise<Record<string, Book>>;
    });
    // Asked again the next time a book of this file is opened.
    asked.catch(() => parts.delete(at));
    parts.set(at, asked);
  }
  return asked;
}

/** Keeps the keeper's corrections, which arrive first. */
async function fill(book: Book) {
  const whole = (await part(partOf(book.id)))[book.id];
  if (!whole) return;
  book.description = { en: book.description.en || whole.description.en, fr: book.description.fr || whole.description.fr };
  book.advice = whole.advice;
}

/** Fills in a book of the stacks once it is on the page, and shows it again when that is done. */
export function useFilled(book: Book) {
  const [, turn] = useState(0);
  useEffect(() => {
    if (!book.stacks || book.advice.readIf.en) return;
    let here = true;
    fill(book).then(
      () => here && turn((n) => n + 1),
      () => undefined,
    );
    return () => {
      here = false;
    };
  }, [book]);
}
