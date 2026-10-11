import { useSyncExternalStore } from 'react';

/*
  What a reader keeps: the place they stopped in each book, the passages they marked, their
  notes, and the threads between them. It lives in this browser (localStorage), so that it
  works with no account at all; with a library card (src/lib/card.ts) the same records are
  copied to the server and to the reader's other devices.

  Everything is one flat list of small records, each with the time it last changed. A deleted
  record stays as an empty marker, so that the deletion reaches the other devices too.
*/

/** A marked passage, or a thought written down on its own (then it has no book). */
export interface Mark {
  id: string;
  bookId?: string;
  /** Which section of the text (public/texts/<id>/<section>.txt)… */
  section?: number;
  /** …and from which character of its text to which. */
  start?: number;
  end?: number;
  /** The marked words themselves. */
  quote?: string;
  /** The reader's own words. */
  note: string;
  /** Other marks this one is tied to. A tie is kept on both ends. */
  links: string[];
  created: number;
}

/** Where the reader stopped in a book. */
export interface Place {
  section: number;
  /** The character of the section's text at the top of the screen. */
  offset: number;
  /** How far through the whole book, 0 to 1. */
  through: number;
}

interface Row {
  /** The value; absent once deleted. */
  v?: unknown;
  /** When it last changed, in milliseconds. */
  t: number;
}

type Rows = Record<string, Row>;

const KEY = 'incipit:shelf';
const listeners = new Set<() => void>();
let rows: Rows = load();

function load(): Rows {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function commit(next: Rows) {
  rows = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // Storage full or unavailable: the change lasts for this visit only.
  }
  for (const listener of listeners) listener();
}

// Another tab of the site changed something.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  rows = load();
  for (const listener of listeners) listener();
});

const put = (key: string, value: unknown) => commit({ ...rows, [key]: { v: value, t: Date.now() } });
const drop = (key: string) => commit({ ...rows, [key]: { t: Date.now() } });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Calls `listener` after every change, for keeping the server in step (src/lib/card.ts). */
export const watchShelf = subscribe;

/** Re-renders the component whenever anything on the shelf changes. */
export function useShelf() {
  useSyncExternalStore(subscribe, () => rows);
  return shelf;
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const shelf = {
  place: (bookId: string) => rows[`place:${bookId}`]?.v as Place | undefined,
  setPlace: (bookId: string, place: Place) => put(`place:${bookId}`, place),

  /** The paragraph the reader put a ribbon on: one for each book. */
  bookmark: (bookId: string) => rows[`bookmark:${bookId}`]?.v as { section: number; offset: number } | undefined,
  setBookmark: (bookId: string, at: { section: number; offset: number }) => put(`bookmark:${bookId}`, at),
  clearBookmark: (bookId: string) => drop(`bookmark:${bookId}`),
  /** Books with a place kept, most recently read first. */
  reading: () =>
    Object.entries(rows)
      .filter(([key, row]) => key.startsWith('place:') && row.v)
      .sort((a, b) => b[1].t - a[1].t)
      .map(([key, row]) => ({ bookId: key.slice(6), place: row.v as Place, at: row.t })),

  mark: (id: string) => rows[`mark:${id}`]?.v as Mark | undefined,
  /** Every mark, newest first. */
  marks: () =>
    Object.entries(rows)
      .filter(([key, row]) => key.startsWith('mark:') && row.v)
      .map(([, row]) => row.v as Mark)
      .sort((a, b) => b.created - a.created),
  marksIn: (bookId: string, section: number) => shelf.marks().filter((mark) => mark.bookId === bookId && mark.section === section),

  addMark: (mark: Omit<Mark, 'id' | 'links' | 'created' | 'note'> & { note?: string }) => {
    const whole: Mark = { note: '', ...mark, id: newId(), links: [], created: Date.now() };
    put(`mark:${whole.id}`, whole);
    return whole;
  },
  editMark: (id: string, change: Partial<Pick<Mark, 'note'>>) => {
    const mark = shelf.mark(id);
    if (mark) put(`mark:${id}`, { ...mark, ...change });
  },
  removeMark: (id: string) => {
    const mark = shelf.mark(id);
    if (!mark) return;
    for (const other of mark.links) shelf.untie(id, other);
    drop(`mark:${id}`);
  },

  /** Ties two marks together, or does nothing if they already are. */
  tie: (a: string, b: string) => {
    const [first, second] = [shelf.mark(a), shelf.mark(b)];
    if (!first || !second || a === b || first.links.includes(b)) return;
    const now = Date.now();
    commit({
      ...rows,
      [`mark:${a}`]: { v: { ...first, links: [...first.links, b] }, t: now },
      [`mark:${b}`]: { v: { ...second, links: [...second.links, a] }, t: now },
    });
  },
  untie: (a: string, b: string) => {
    const now = Date.now();
    const next = { ...rows };
    for (const [from, to] of [[a, b], [b, a]]) {
      const mark = shelf.mark(from);
      if (mark?.links.includes(to)) next[`mark:${from}`] = { v: { ...mark, links: mark.links.filter((id) => id !== to) }, t: now };
    }
    commit(next);
  },

  /** For the server: every record changed after `since`. */
  changedSince: (since: number) => Object.entries(rows).filter(([, row]) => row.t > since).map(([key, row]) => ({ key, ...row })),
  /** From the server: records to take in wherever they are newer than what is here. */
  merge: (incoming: { key: string; v?: unknown; t: number }[]) => {
    const next = { ...rows };
    let changed = false;
    for (const { key, v, t } of incoming) {
      if ((next[key]?.t ?? 0) >= t) continue;
      next[key] = v === undefined || v === null ? { t } : { v, t };
      changed = true;
    }
    if (changed) commit(next);
  },
};
