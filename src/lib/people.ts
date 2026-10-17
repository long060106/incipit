import { card } from './card';
import { withCard } from './keeper';

/*
  Readers' own pages and the essays they write (worker/index.ts, /api/people and /api/essays).
  A page shows what a reader says of themselves, their reviews and their approved essays.
  An essay waits for the keeper before anyone else can read it; its author follows it on
  their own page, where they see whether it was approved, or why not.
*/

export type EssayStatus = 'pending' | 'approved' | 'rejected';

export interface EssaySummary {
  id: string;
  author: string;
  tone: number;
  title: string;
  excerpt: string;
  words: number;
  books: string[];
  /** When it was approved, or last written. */
  at: number;
  /** Told only to the author and the keeper. */
  status?: EssayStatus;
  reason?: string | null;
  reports?: number;
  /** How many have answered it. */
  comments?: number;
}

export interface Essay extends EssaySummary {
  body: string;
  mine?: boolean;
}

/** A passage a reader marked and chose to show on their page: the mark's id, its book and its words. */
export interface Passage {
  id: string;
  book: string;
  quote: string;
}

/** An answer to an essay. */
export interface Comment {
  id: string;
  author: string;
  tone: number;
  body: string;
  at: number;
  /** Whether the reader asking may take it away: their own, one on their essay, or the keeper. */
  removable: boolean;
}

export const MAX_COMMENT = 2_000;
export const MAX_PASSAGES = 12;

export interface Person {
  name: string;
  joined: number;
  bio: string;
  tone: number;
  showsReading: boolean;
  /** The books they are reading, if they show them (or it is their own page). */
  reading: string[] | null;
  reviews: { book: string; stars: number | null; text: string | null; changed: number }[];
  /** The passages they chose from their notebook to show. */
  quotes: Passage[];
  essays: EssaySummary[];
  own: boolean;
}

/** The colours behind a reader's initial: the lamp's brass and ember, leather, sage, river and ink. */
export const TONES = ['#b08a45', '#a5573a', '#7a3346', '#6f7f5c', '#4f6a86', '#6b4d70', '#93733a', '#3d6b66'];

/** The tone a reader chose, or the one their name gives. */
export function toneOf(name: string, tone = -1): string {
  if (tone >= 0 && tone < TONES.length) return TONES[tone];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export const MIN_ESSAY = 300;
export const MAX_ESSAY = 20_000;
export const MAX_QUOTED = 1_500;
export const MAX_TITLE = 140;
export const MAX_BIO = 280;

/** Characters on the lines that begin with ">", as the server counts them. */
export const quotedLength = (body: string) =>
  body
    .split('\n')
    .filter((line) => line.startsWith('>'))
    .reduce((sum, line) => sum + line.trimEnd().length, 0);

export const personUrl = (name: string) => `${import.meta.env.BASE_URL}u/${encodeURIComponent(name)}`;
export const essayUrl = (id: string) => `${import.meta.env.BASE_URL}essays/${id}`;
export const writeUrl = (options: { id?: string; book?: string } = {}) => {
  const query = new URLSearchParams(Object.entries(options).filter(([, value]) => value) as [string, string][]).toString();
  return `${import.meta.env.BASE_URL}write${query ? `?${query}` : ''}`;
};

const API = `${import.meta.env.BASE_URL}api`;

export type Problem =
  | 'needs-account'
  | 'not-found'
  | 'bad-title'
  | 'too-short'
  | 'too-long'
  | 'too-much-quoted'
  | 'bad-books'
  | 'too-many'
  | 'too-many-waiting'
  | 'locked'
  | 'offline';

const PROBLEMS = new Set<string>(['needs-account', 'bad-title', 'too-short', 'too-long', 'too-much-quoted', 'bad-books', 'too-many', 'too-many-waiting']);

async function ask<T>(path: string, init: RequestInit = {}): Promise<T | Problem> {
  try {
    const code = card.code();
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...withCard(code), ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
    if (response.ok) return (await response.json()) as T;
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    if (error && PROBLEMS.has(error)) return error as Problem;
    if (response.status === 404) return 'not-found';
    if (response.status === 401 || error === 'needs-account') return 'needs-account';
    if (response.status === 423) return 'locked';
    return 'offline';
  } catch {
    return 'offline';
  }
}

export const isProblem = (value: unknown): value is Problem => typeof value === 'string';

export const people = {
  get: (name: string) => ask<Person>(`/people/${encodeURIComponent(name)}`),
  save: (page: { bio: string; tone: number; reading: boolean }) => ask<Person>('/people', { method: 'PUT', body: JSON.stringify(page) }),
  saveQuotes: (quotes: Passage[]) => ask<Person>('/people/quotes', { method: 'PUT', body: JSON.stringify({ quotes }) }),
};

export const essays = {
  list: (options: { book?: string; before?: number } = {}) => {
    const query = new URLSearchParams();
    if (options.book) query.set('book', options.book);
    if (options.before) query.set('before', String(options.before));
    const text = query.toString();
    return ask<{ essays: EssaySummary[]; more: boolean }>(`/essays${text ? `?${text}` : ''}`);
  },
  get: async (id: string) => {
    const answer = await ask<{ essay: Essay }>(`/essays/${id}`);
    return isProblem(answer) ? answer : answer.essay;
  },
  /** Writes a new essay, or one already written again. Either way it goes to the keeper. */
  send: async (essay: { title: string; body: string; books: string[] }, id?: string) => {
    const answer = await ask<{ essay: Essay }>(id ? `/essays/${id}` : '/essays', { method: id ? 'PUT' : 'POST', body: JSON.stringify(essay) });
    return isProblem(answer) ? answer : answer.essay;
  },
  drop: (id: string) => ask<{ ok: true }>(`/essays/${id}`, { method: 'DELETE' }),
  report: (id: string) => ask<{ ok: true }>(`/essays/${id}/report`, { method: 'POST' }),
  comments: (id: string) => ask<{ comments: Comment[]; me: string | null }>(`/essays/${id}/comments`),
  comment: async (id: string, body: string) => {
    const answer = await ask<{ comment: Comment }>(`/essays/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    return isProblem(answer) ? answer : answer.comment;
  },
  dropComment: (id: string, comment: string) => ask<{ ok: true }>(`/essays/${id}/comments/${comment}`, { method: 'DELETE' }),
  /** For the keeper. */
  queue: () => ask<{ essays: Essay[] }>('/essays/queue'),
  decide: async (id: string, approve: boolean, reason = '') => {
    const answer = await ask<{ essay: Essay }>(`/essays/${id}/decide`, { method: 'POST', body: JSON.stringify({ approve, reason }) });
    return isProblem(answer) ? answer : answer.essay;
  },
};

/** Minutes to read so many words, at an unhurried pace. */
export const minutes = (words: number) => Math.max(1, Math.round(words / 220));
