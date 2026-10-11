import { useSyncExternalStore } from 'react';
import { shelf, watchShelf } from './shelf';

/*
  The library card: what carries a reader's notebook (src/lib/shelf.ts) to the server and to
  their other devices. A card is a twenty-character code the server makes (worker/index.ts).
  It is the whole key: there is no name, email or password. This browser remembers it, and
  with it sends each change of the notebook up and takes down what other devices changed.

  Without a card nothing here does anything, and the notebook stays in this browser.
*/

interface Kept {
  code: string;
  /** The server's mark of how far this device has heard from the others. */
  cursor: number;
  /** Every record changed up to this time (by this device's clock) has been sent. */
  pushed: number;
  role?: string;
  /** When the notebook was last exchanged with the server. */
  syncedAt?: number;
}

export type CardStatus = 'idle' | 'syncing' | 'offline' | 'unknown';

const KEY = 'incipit:card';
const API = `${import.meta.env.BASE_URL}api`;
const listeners = new Set<() => void>();
let kept: Kept | null = load();
let status: CardStatus = 'idle';
let snapshot: { card: Kept | null; status: CardStatus } = { card: kept, status };

function load(): Kept | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return parsed && typeof parsed.code === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function set(next: Kept | null, nextStatus: CardStatus = status) {
  kept = next;
  status = nextStatus;
  snapshot = { card: kept, status };
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // The card then lasts for this visit only.
  }
  for (const listener of listeners) listener();
}

const call = (path: string, code: string | null, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: { ...(code ? { authorization: `Card ${code}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });

/** How the code is shown and typed: four groups of five. */
export const printed = (code: string) => code.replace(/(.{5})(?=.)/g, '$1-');

let running: Promise<boolean> | null = null;

/** Sends what changed here, takes what changed elsewhere. Resolves to whether it went through. */
function sync(keepalive = false): Promise<boolean> {
  if (!kept) return Promise.resolve(false);
  running ??= (async () => {
    const card = kept!;
    set(card, 'syncing');
    try {
      const rows = shelf.changedSince(card.pushed);
      const response = await call('/sync', card.code, { method: 'POST', body: JSON.stringify({ since: card.cursor, rows }), keepalive });
      if (response.status === 401) {
        set(card, 'unknown');
        return false;
      }
      if (!response.ok) throw new Error(String(response.status));
      const answer = (await response.json()) as { cursor: number; rows: { key: string; v?: unknown; t: number }[] };
      shelf.merge(answer.rows);
      // The card may have been put away while the request was out.
      if (kept?.code === card.code) {
        set({ ...kept, cursor: answer.cursor, pushed: Math.max(card.pushed, ...rows.map((row) => row.t)), syncedAt: Date.now() }, 'idle');
      }
      return true;
    } catch {
      if (kept?.code === card.code) set(kept, 'offline');
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

export const card = {
  sync,

  /** Asks the server for a new card and puts this browser's notebook on it. */
  async take(): Promise<boolean> {
    try {
      const response = await call('/card', null, { method: 'POST' });
      if (!response.ok) return false;
      const { code } = (await response.json()) as { code: string };
      set({ code, cursor: 0, pushed: 0 }, 'idle');
      return sync();
    } catch {
      return false;
    }
  },

  /** Opens a card the reader already has. What is in this browser is added to it. */
  async enter(typed: string): Promise<'ok' | 'unknown' | 'offline'> {
    const code = typed.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    try {
      const response = await call('/me', code);
      if (response.status === 401) return 'unknown';
      if (!response.ok) return 'offline';
      const { role } = (await response.json()) as { role: string };
      set({ code, cursor: 0, pushed: 0, role }, 'idle');
      await sync();
      return 'ok';
    } catch {
      return 'offline';
    }
  },

  /** Puts the card away on this device. The notebook stays here and on the server. */
  leave() {
    set(null, 'idle');
  },

  /** Erases the card and everything kept under it on the server. The notebook stays in this browser. */
  async erase(): Promise<boolean> {
    if (!kept) return false;
    try {
      const response = await call('/card', kept.code, { method: 'DELETE' });
      if (!response.ok && response.status !== 401) return false;
      set(null, 'idle');
      return true;
    } catch {
      return false;
    }
  },
};

export function useCard() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

/**
 * Keeps the notebook in step while the site is open: once on arrival, a few seconds after
 * each change, and as the reader leaves the page. Called once, from main.tsx.
 */
export function keepInStep() {
  let timer = 0;
  if (kept) void sync();
  watchShelf(() => {
    if (!kept) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), 4000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !kept) return;
    window.clearTimeout(timer);
    if (shelf.changedSince(kept.pushed).length) void sync(true);
  });
  // Another tab took or put away a card.
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) set(load(), 'idle');
  });
}
