import { useEffect, useSyncExternalStore } from 'react';
import { BOOKS } from '../data/books';
import { useCard } from './card';
import { isProblem, MAX_PASSAGES, people, type Passage, type Problem } from './people';
import type { Mark } from './shelf';

/*
  The passages a reader shows on their own page (/u/<name>), chosen one by one in the notebook
  with a star. The list is the server's (worker/index.ts, PUT /api/people/quotes); it is
  fetched once for the reader signed in, and kept here for every note that asks.
  Only marks in books out of copyright can be shown: their words are free for everyone.
*/

const FREE = new Set(BOOKS.filter((book) => book.free).map((book) => book.id));
const MAX_WORDS = 500;

let owner: string | null = null;
let kept: Passage[] | null = null;
let loading = false;
const listeners = new Set<() => void>();
let snapshot: { owner: string | null; kept: Passage[] | null } = { owner, kept };
const changed = () => {
  snapshot = { owner, kept };
  for (const listener of listeners) listener();
};

async function load(name: string) {
  if (loading && owner === name) return;
  owner = name;
  kept = null;
  loading = true;
  changed();
  const answer = await people.get(name);
  loading = false;
  if (owner !== name) return;
  kept = isProblem(answer) ? null : (answer.quotes ?? []);
  changed();
}

/** Whether a mark can be shown on a page at all: its words, from a book out of copyright. */
export const showable = (mark: Mark) => !!mark.quote && !!mark.bookId && FREE.has(mark.bookId) && mark.quote.length <= MAX_WORDS;

export function usePassages() {
  const { card } = useCard();
  const name = card?.name ?? null;
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
  useEffect(() => {
    if (name && owner !== name) void load(name);
  }, [name]);

  const list = name && state.owner === name ? state.kept : null;
  return {
    /** Known, for a reader signed in with an account. */
    ready: !!list,
    has: (id: string) => !!list?.some((passage) => passage.id === id),
    full: (list?.length ?? 0) >= MAX_PASSAGES,
    /** Shows a mark on the reader's page, or stops showing it. */
    toggle: async (mark: Mark): Promise<Problem | null> => {
      if (!list || !name || !showable(mark)) return 'needs-account';
      const before = list;
      const next = before.some((passage) => passage.id === mark.id)
        ? before.filter((passage) => passage.id !== mark.id)
        : [...before, { id: mark.id, book: mark.bookId!, quote: mark.quote! }].slice(-MAX_PASSAGES);
      kept = next;
      changed();
      const answer = await people.saveQuotes(next);
      if (isProblem(answer)) {
        kept = before;
        changed();
        return answer;
      }
      return null;
    },
    /** Sets the whole list, as the reader's own page does when one is taken away there. */
    set: (next: Passage[]) => {
      if (owner === name) {
        kept = next;
        changed();
      }
    },
  };
}
