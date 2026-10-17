import { useSyncExternalStore } from 'react';
import { shelf, watchShelf } from './shelf';

/*
  The library card: what carries a reader's notebook (src/lib/shelf.ts) to the server and to
  their other devices. A card is a twenty-character code the server makes (worker/index.ts).
  It is the whole key. A reader may put a name and a password in front of it (an account), to
  open it from any device without the code. This browser remembers the card, and
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
  /** The name of the account in front of this card, if it has one. */
  name?: string | null;
  /** The email the account can also be opened with; seen only by its owner. */
  email?: string | null;
  /** Whether a Google person is tied to the account, and whether it has a password. */
  google?: boolean;
  password?: boolean;
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

  /** The code of the card on this device, and what it may do, as they are at this moment. */
  code: () => kept?.code ?? null,
  role: () => kept?.role ?? null,

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
      const { role, name, email, google, password } = (await response.json()) as { role: string; name?: string | null; email?: string | null; google?: boolean; password?: boolean };
      set({ code, cursor: 0, pushed: 0, role, name, email, google, password }, 'idle');
      await sync();
      return 'ok';
    } catch {
      return 'offline';
    }
  },

  /** Asks the server again what this card may do (reader, or keeper of the site). */
  async refresh(): Promise<void> {
    if (!kept) return;
    try {
      const response = await call('/me', kept.code);
      if (!response.ok) return;
      const { role, name = null, email = null, google, password } = (await response.json()) as { role: string; name?: string | null; email?: string | null; google?: boolean; password?: boolean };
      if (kept && (kept.role !== role || (kept.name ?? null) !== name || (kept.email ?? null) !== email || kept.google !== google || kept.password !== password)) set({ ...kept, role, name, email, google, password });
    } catch {
      // Stays as it was.
    }
  },

  /**
   * Puts a name and a password in front of the card on this device, taking a card first if
   * there is none. From then on the name (or the email, if one is given) and the password open
   * it anywhere.
   */
  async register(name: string, password: string, email: string): Promise<'ok' | 'taken' | 'email-taken' | 'bad-name' | 'bad-email' | 'bad-password' | 'too-many' | 'offline'> {
    try {
      if (!kept && !(await card.take())) return 'offline';
      const response = await call('/account', kept!.code, { method: 'POST', body: JSON.stringify({ name, password, email }) });
      if (response.ok) {
        const answer = (await response.json()) as { name: string; email: string | null };
        if (kept) set({ ...kept, name: answer.name, email: answer.email, google: false, password: true });
        return 'ok';
      }
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      return error === 'taken' || error === 'email-taken' || error === 'bad-name' || error === 'bad-email' || error === 'bad-password' || error === 'too-many'
        ? error
        : 'offline';
    } catch {
      return 'offline';
    }
  },

  /** Whether nobody has a name yet: `null` when the server cannot say. */
  async nameFree(name: string): Promise<boolean | null> {
    try {
      const response = await call(`/account/free?name=${encodeURIComponent(name)}`, null);
      return response.ok ? ((await response.json()) as { free: boolean }).free : null;
    } catch {
      return null;
    }
  },

  /** Opens the card behind a name (or the account's email) and its password. What is in this browser is added to it. */
  async signIn(name: string, password: string): Promise<'ok' | 'wrong' | 'too-many' | 'offline'> {
    try {
      const response = await call('/account/enter', null, { method: 'POST', body: JSON.stringify({ name, password }) });
      if (response.status === 401) return 'wrong';
      if (response.status === 429) return 'too-many';
      if (!response.ok) return 'offline';
      const answer = (await response.json()) as { code: string; role: string; name: string; email?: string | null; google?: boolean; password?: boolean };
      set({ code: answer.code, cursor: 0, pushed: 0, role: answer.role, name: answer.name, email: answer.email ?? null, google: answer.google, password: answer.password }, 'idle');
      await sync();
      return 'ok';
    } catch {
      return 'offline';
    }
  },

  /** The id of the site's client at Google, or null when signing in with Google is not on. */
  async googleClient(): Promise<string | null> {
    try {
      const response = await call('/account/google', null);
      return response.ok ? ((await response.json()) as { client: string | null }).client : null;
    } catch {
      return null;
    }
  },

  /**
   * Signs in with the token Google gave the page. A person with no account here yet comes back as
   * `{ email }`: the page asks them for a name, and sends the token again with it, which makes
   * the account. What is in this browser is added to the card, as with a password.
   */
  async google(credential: string, name?: string): Promise<'ok' | 'wrong' | 'has-account' | 'taken' | 'bad-name' | 'too-many' | 'offline' | { email: string }> {
    try {
      const response = await call('/account/google', null, { method: 'POST', body: JSON.stringify({ credential, name }) });
      if (response.status === 404) return { email: ((await response.json()) as { email: string }).email };
      if (response.status === 401) return 'wrong';
      if (response.status === 429) return 'too-many';
      if (response.status === 400) return 'bad-name';
      if (response.status === 409) return ((await response.json().catch(() => ({}))) as { error?: string }).error === 'taken' ? 'taken' : 'has-account';
      if (!response.ok) return 'offline';
      const answer = (await response.json()) as { code: string; role: string; name: string; email?: string | null; google?: boolean; password?: boolean };
      set({ code: answer.code, cursor: 0, pushed: 0, role: answer.role, name: answer.name, email: answer.email ?? null, google: true, password: answer.password }, 'idle');
      await sync();
      return 'ok';
    } catch {
      return 'offline';
    }
  },

  /** Ties the Google person of this token to the account on this device, when its email is the account's own. */
  async linkGoogle(credential: string): Promise<'ok' | 'wrong' | 'email-differs' | 'google-taken' | 'too-many' | 'offline'> {
    if (!kept) return 'offline';
    try {
      const response = await call('/account/link', kept.code, { method: 'POST', body: JSON.stringify({ credential }) });
      if (response.ok) {
        if (kept) set({ ...kept, google: true });
        return 'ok';
      }
      if (response.status === 401) return 'wrong';
      if (response.status === 429) return 'too-many';
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      return error === 'email-differs' || error === 'google-taken' ? error : 'offline';
    } catch {
      return 'offline';
    }
  },

  /** Whether the site can send a link that sets a new password: `null` when the server cannot say. */
  async canMail(): Promise<boolean | null> {
    try {
      const response = await call('/account/forgot', null);
      return response.ok ? ((await response.json()) as { mail: boolean }).mail : null;
    } catch {
      return null;
    }
  },

  /**
   * Asks for a link that sets a new password, sent to the email of the account with this name or
   * email. 'sent' says only that it was asked for: whether there is such an account is not told.
   */
  async forgot(who: string, lang: string): Promise<'sent' | 'no-mail' | 'too-many' | 'offline'> {
    try {
      const response = await call('/account/forgot', null, { method: 'POST', body: JSON.stringify({ who, lang }) });
      if (response.ok) return 'sent';
      if (response.status === 503) return 'no-mail';
      if (response.status === 429) return 'too-many';
      return 'offline';
    } catch {
      return 'offline';
    }
  },

  /** Uses a link from that letter: the new password is set, and the account opened on this device. */
  async reset(token: string, password: string): Promise<'ok' | 'bad-link' | 'bad-password' | 'too-many' | 'offline'> {
    try {
      const response = await call('/account/reset', null, { method: 'POST', body: JSON.stringify({ token, password }) });
      if (response.status === 429) return 'too-many';
      if (response.status === 400) {
        const { error } = (await response.json().catch(() => ({}))) as { error?: string };
        return error === 'bad-password' ? 'bad-password' : 'bad-link';
      }
      if (!response.ok) return 'offline';
      const answer = (await response.json()) as { code: string; role: string; name: string; email?: string | null; google?: boolean; password?: boolean };
      set({ code: answer.code, cursor: 0, pushed: 0, role: answer.role, name: answer.name, email: answer.email ?? null, google: answer.google, password: answer.password }, 'idle');
      await sync();
      return 'ok';
    } catch {
      return 'offline';
    }
  },

  /** A new password for the account on this device, given the one it has. */
  async changePassword(current: string, password: string): Promise<'ok' | 'wrong' | 'bad-password' | 'too-many' | 'offline'> {
    if (!kept) return 'offline';
    try {
      const response = await call('/account', kept.code, { method: 'PUT', body: JSON.stringify({ current, password }) });
      if (response.ok) return 'ok';
      if (response.status === 401) return 'wrong';
      if (response.status === 429) return 'too-many';
      return response.status === 400 ? 'bad-password' : 'offline';
    } catch {
      return 'offline';
    }
  },

  /** Makes this card the keeper's, with the one-time code the owner of the site was given. */
  async claim(token: string): Promise<boolean> {
    if (!kept) return false;
    try {
      const response = await call('/claim', kept.code, { method: 'POST', body: JSON.stringify({ token }) });
      if (!response.ok) return false;
      set({ ...kept, role: 'admin' });
      return true;
    } catch {
      return false;
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
  if (kept) void sync().then(() => card.refresh());
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
