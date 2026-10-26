import { BOOKS } from '../data/books';
import { OPENINGS } from '../data/openings';
import type { Book } from '../data/types';

/*
  The daily first line (/daily). Every reader is given the same opening on the same day, and has
  TRIES guesses to name its book. Which book a day is given is worked out here, from the date
  alone: no server is asked, and the same list of books gives the same answer everywhere.
*/

export const TRIES = 5;

/** The day of No. 1. */
const FIRST_DAY = Date.UTC(2026, 9, 26);
const DAY_MS = 86_400_000;
const STORE_KEY = 'incipit:daily';

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

const FIRST_MOST = 300;

/**
 * What the game shows at first, and what it keeps back for the first clue. Lines that are only a
 * few words ("Tom!" "No answer.") are shown together; a paragraph that runs long is cut after its
 * first sentences (a sentence is never cut), a long verse after its first lines. The rest of the
 * page is the first clue.
 */
export function splitOpening(lines: string[]): { first: string[]; more: string[] } {
  const rest = [...lines];
  const first: string[] = [];
  let total = 0;
  while (rest.length && total < 60) {
    const paragraph = rest.shift()!;
    if (total + paragraph.length <= FIRST_MOST) {
      first.push(paragraph);
      total += paragraph.length;
      continue;
    }
    const verse = paragraph.includes('\n');
    // A sentence ends where its stop is followed by a space: "R.N., sailed" is one sentence.
    const pieces = verse ? paragraph.split('\n') : paragraph.split(/(?<=[.!?…][”’"')\]]*)\s+/);
    let taken = 0;
    let length = 0;
    while (taken < pieces.length && (total + length < 120 || total + length + pieces[taken].length <= FIRST_MOST)) {
      length += pieces[taken].length;
      taken += 1;
    }
    const join = (part: string[]) => part.join(verse ? '\n' : ' ');
    first.push(join(pieces.slice(0, taken)));
    if (taken < pieces.length) rest.unshift(join(pieces.slice(taken)));
    break;
  }
  return { first, more: rest };
}

/** The books a day can be given: those whose first words are on the site. */
export const DAILY_BOOKS: Book[] = Object.keys(OPENINGS)
  .filter((id) => BY_ID.has(id) && OPENINGS[id].lines.length)
  .sort()
  .map((id) => BY_ID.get(id)!);

/** Today's number, counted on the reader's own calendar, so a new line comes at their midnight. */
export function todayNumber(now = new Date()): number {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((local - FIRST_DAY) / DAY_MS) + 1);
}

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** A shuffle that comes out the same for the same seed. */
function seeded<T>(list: T[], seed: number): T[] {
  const copy = [...list];
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The book of day `no`. Every book comes once before any comes again. */
export function bookOfDay(no: number): Book {
  const count = DAILY_BOOKS.length;
  const round = Math.floor((no - 1) / count);
  return seeded(DAILY_BOOKS, hash(`incipit-daily:${round}`))[(no - 1) % count];
}

/** One day's game: the book it was given, and each guess (a book's id, or null for a guess passed). */
export interface DayGame {
  book: string;
  guesses: (string | null)[];
}

type Store = Record<string, DayGame>;

function readStore(): Store {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Store) : {};
  } catch {
    return {};
  }
}

/**
 * The game of day `no`, as this reader left it. A day already begun keeps the book it began
 * with, even if the catalogue has changed since and the day would now be given another.
 */
export function loadGame(no: number): DayGame {
  const kept = readStore()[no];
  if (kept && BY_ID.has(kept.book) && OPENINGS[kept.book] && Array.isArray(kept.guesses)) return kept;
  return { book: bookOfDay(no).id, guesses: [] };
}

export function saveGame(no: number, game: DayGame) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [no]: game }));
  } catch {
    // Not kept: the day begins again on the next visit.
  }
}

export const isWon = (game: DayGame) => game.guesses.includes(game.book);
export const isOver = (game: DayGame) => isWon(game) || game.guesses.length >= TRIES;

/** Days in a row named, up to today (or up to yesterday, while today is still being played). */
export function streak(today: number): number {
  const store = readStore();
  const won = (no: number) => !!store[no] && isWon(store[no]);
  let day = won(today) ? today : today - 1;
  let count = 0;
  while (day >= 1 && won(day)) {
    count += 1;
    day -= 1;
  }
  return count;
}

/** The result as squares, the way such games are shared: wrong, passed, then the one found. */
export function squares(game: DayGame): string {
  return game.guesses.map((guess) => (guess === game.book ? '🟩' : guess === null ? '⬛' : '🟥')).join('');
}

export function shareText(no: number, game: DayGame, title: string, url: string): string {
  const score = isWon(game) ? `${game.guesses.length}/${TRIES}` : `X/${TRIES}`;
  return `${title} No. ${no}\n${squares(game)} ${score}\n${url}`;
}

/** The first lines, cut short at a sentence (or failing that a word) when they run long for a card. */
function forCard(text: string, most = 380): string {
  if (text.length <= most) return text;
  const cut = text.slice(0, most);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentence > most * 0.5) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))} …`;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tried = line ? `${line} ${word}` : word;
      if (line && context.measureText(tried).width > width) {
        lines.push(line);
        line = word;
      } else line = tried;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A picture of the day's first line, to post where links are not read (a story, a feed): the line,
 * the question, and where to answer it. It never shows the answer. Drawn in the colours of the
 * room the reader is in.
 */
export async function drawCard(options: { no: number; line: string; eyebrow: string; question: string; address: string }): Promise<Blob> {
  const WIDTH = 1080;
  const HEIGHT = 1350;
  const MARGIN = 120;
  const style = getComputedStyle(document.documentElement);
  const colour = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const bg = colour('--bg', '#0c0c0d');
  const text = colour('--text', '#ece8df');
  const muted = colour('--muted', '#918d85');
  const accent = colour('--accent', '#c9a45c');

  await Promise.all(
    ['400 60px "Brygada 1918"', 'italic 400 44px "Brygada 1918"', '400 26px "Geist Mono"'].map((font) => document.fonts.load(font).catch(() => [])),
  );

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = bg;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.textBaseline = 'alphabetic';

  const label = (words: string, y: number, fill: string) => {
    context.font = '400 26px "Geist Mono", ui-monospace, monospace';
    if ('letterSpacing' in context) context.letterSpacing = '4px';
    context.fillStyle = fill;
    context.fillText(words.toUpperCase(), MARGIN, y);
    if ('letterSpacing' in context) context.letterSpacing = '0px';
  };

  label(options.eyebrow, MARGIN + 26, muted);
  context.fillStyle = accent;
  context.fillRect(MARGIN, MARGIN + 62, 72, 2);

  // The line, as large as the space between the label and the question allows.
  const line = forCard(options.line);
  const top = MARGIN + 170;
  const room = HEIGHT - top - 330;
  let size = 64;
  let lines: string[] = [];
  for (; size >= 34; size -= 2) {
    context.font = `400 ${size}px "Brygada 1918", Georgia, serif`;
    lines = wrap(context, line, WIDTH - MARGIN * 2);
    if (lines.length * size * 1.42 <= room) break;
  }
  // Set in the middle of its space, a little above, as on a title page.
  const start = top + Math.max(0, (room - lines.length * size * 1.42) * 0.42);
  context.fillStyle = text;
  lines.forEach((words, index) => context.fillText(words, MARGIN, start + size + index * size * 1.42));

  context.font = 'italic 400 46px "Brygada 1918", Georgia, serif';
  context.fillStyle = accent;
  context.fillText(options.question, MARGIN, HEIGHT - MARGIN - 110);
  label(options.address, HEIGHT - MARGIN - 30, muted);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png'));
}
