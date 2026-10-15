import { useCallback, useEffect, useState } from 'react';
import type { Book, Mood } from '../data/types';
import { AXES } from '../data/vocab';
import { card, useCard } from './card';
import { withCard } from './keeper';

/*
  What readers say of a book (worker/index.ts, /api/reviews/<book>): stars, how it felt to
  them, and a few words. Only a reader with an account can write; anyone can read.

  While a book's page is open it asks again every few seconds, so that what others write
  appears without the page being opened again. A page in a tab out of sight does not ask.

  The stars readers give join the book's rating from Open Library, and how it felt to them
  moves the book's mood away from the catalogue's, a little more with each reader.
*/

export interface Summary {
  /** Readers who have said anything at all. */
  n: number;
  stars: number | null;
  starsN: number;
  mood: Mood | null;
  moodN: number;
}

export interface Review {
  name: string;
  /** The colour behind their initial (lib/people.ts). */
  tone: number;
  stars: number | null;
  text: string;
  changed: number;
  mine: boolean;
}

export interface Mine {
  stars: number | null;
  mood: Mood | null;
  text: string | null;
}

export interface Said {
  summary: Summary;
  reviews: Review[];
  mine: Mine | null;
}

const API = `${import.meta.env.BASE_URL}api`;
const EVERY = 8000; // milliseconds between askings while the page is open
/** How many readers the catalogue's own mood counts for, against what readers say. */
const CATALOGUE_WEIGHT = 4;

/** The book's mood, moved toward how it felt to readers. */
export function blendedMood(book: Book, summary: Summary | null): Mood {
  if (!summary?.mood || !summary.moodN) return book.mood;
  const weight = summary.moodN;
  return Object.fromEntries(AXES.map(({ id }) => [id, Math.round((book.mood[id] * CATALOGUE_WEIGHT + summary.mood![id] * weight) / (CATALOGUE_WEIGHT + weight))])) as Mood;
}

/** The book's rating, with the stars readers here gave counted in. */
export function blendedRating(book: Book, summary: Summary | null): { value: number; count: number; ours: number } {
  if (!summary?.stars || !summary.starsN) return { ...book.rating, ours: 0 };
  const count = book.rating.count + summary.starsN;
  return { value: (book.rating.value * book.rating.count + summary.stars * summary.starsN) / count, count, ours: summary.starsN };
}

export type Problem = 'needs-account' | 'too-long' | 'too-many' | 'offline' | 'locked';

/** What readers say of one book, kept fresh while it is open, and the reader's own say in it. */
export function useReviews(bookId: string) {
  const { card: mine } = useCard();
  const code = mine?.code ?? null;
  const [said, setSaid] = useState<Said | null>(null);

  const ask = useCallback(async () => {
    try {
      const response = await fetch(`${API}/reviews/${bookId}`, { headers: withCard(code) });
      if (response.ok) setSaid((await response.json()) as Said);
    } catch {
      // Not reached: what was shown stays, and it is asked again shortly.
    }
  }, [bookId, code]);

  useEffect(() => {
    setSaid(null);
    void ask();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void ask();
    }, EVERY);
    const onShow = () => document.visibilityState === 'visible' && void ask();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [ask]);

  const send = async (method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Problem | null> => {
    const held = card.code();
    if (!held) return 'needs-account';
    try {
      const response = await fetch(`${API}/reviews/${path}`, {
        method,
        headers: { ...withCard(held), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) {
        setSaid((await response.json()) as Said);
        return null;
      }
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      if (error === 'needs-account' || error === 'too-long' || error === 'too-many') return error;
      if (response.status === 423) return 'locked';
      return 'offline';
    } catch {
      return 'offline';
    }
  };

  return {
    said,
    /** Writes the reader's review; with nothing in it, takes it back. */
    save: (review: Mine) => send('PUT', bookId, review),
    remove: () => send('DELETE', bookId),
    /** For the keeper: takes down what one reader wrote. */
    takeDown: (name: string) => send('DELETE', `${bookId}/${encodeURIComponent(name)}`),
  };
}
