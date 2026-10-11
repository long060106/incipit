import { useSyncExternalStore } from 'react';

/*
  What the keeper of the site has decided about each book, over what the catalogue says:
  whether its download is offered, and which articles are listed beside it. Every reader
  fetches these once (GET /api/books); only a card whose role is 'admin' can change them
  (PUT /api/books/<id>, worker/index.ts). With no server, nothing is decided and every book
  is as the catalogue has it.
*/

export interface Article {
  title: string;
  url: string;
}

export interface Decided {
  download: boolean;
  articles: Article[];
}

const API = `${import.meta.env.BASE_URL}api/books`;
const listeners = new Set<() => void>();
let decided: Record<string, Decided> = {};
let asked = false;

const tell = () => {
  for (const listener of listeners) listener();
};

function ask() {
  if (asked) return;
  asked = true;
  fetch(API)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((answer: { books: Record<string, Decided> }) => {
      decided = answer.books ?? {};
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
export async function decide(code: string, bookId: string, change: Partial<Decided>): Promise<boolean> {
  try {
    const response = await fetch(`${API}/${bookId}`, {
      method: 'PUT',
      headers: { authorization: `Card ${code}`, 'content-type': 'application/json' },
      body: JSON.stringify(change),
    });
    if (!response.ok) return false;
    const { book } = (await response.json()) as { book: Decided };
    decided = { ...decided, [bookId]: book };
    tell();
    return true;
  } catch {
    return false;
  }
}
