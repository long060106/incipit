import type { Filters } from './match';

/*
  Asking for a book in a few words. The server has a model read the words and answers with the
  site's own filters (worker/index.ts, askForBook); it never names a book itself.
*/

const API = `${import.meta.env.BASE_URL}api`;

export type AskError = 'too-many' | 'resting' | 'failed';
export type AskAnswer = { filters: Partial<Filters>; note: string } | { error: AskError };

let ready: Promise<boolean> | null = null;

/** Whether the server can read words: asked once a visit. */
export function askReady(): Promise<boolean> {
  ready ??= fetch(`${API}/ask`)
    .then((response) => (response.ok ? response.json() : { ready: false }))
    .then((body: { ready?: boolean }) => !!body.ready)
    .catch(() => false);
  return ready;
}

export async function askForBook(text: string): Promise<AskAnswer> {
  try {
    const response = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { filters: body.filters ?? {}, note: body.note ?? '' };
    return { error: body.error === 'too-many' || body.error === 'resting' ? body.error : 'failed' };
  } catch {
    return { error: 'failed' };
  }
}
