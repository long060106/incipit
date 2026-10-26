import { AXES, ELSEWHERE } from '../data/vocab';
import type { AxisId, Book, GenreId, KeywordId, Mood } from '../data/types';

export type LengthBand = 'short' | 'medium' | 'long';
export type EraBand = 'pre1900' | 'c20' | 'c21';
export type LevelBand = 'easy' | 'moderate' | 'demanding';
/**
 * How results are ordered. `match` is by closeness of fit. `popular` goes by how many
 * readers have rated a book on Open Library, the nearest thing the catalogue has to sales.
 */
export type SortId = 'match' | 'rating' | 'popular';

export interface Filters {
  query: string;
  /** Only the axes the reader has touched are present. */
  mood: Partial<Record<AxisId, number>>;
  keywords: KeywordId[];
  genre: GenreId | null;
  length: LengthBand | null;
  era: EraBand | null;
  level: LevelBand | null;
  minRating: number | null;
  country: string | null;
  freeOnly: boolean;
  /** Only books read to learn something ('learn'), only stories ('story'), or either (null). */
  kind: BookKind | null;
  /** The book the reader came from, left out of what is shown "like it, but…". */
  besides: string | null;
  sort: SortId;
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  mood: {},
  keywords: [],
  genre: null,
  length: null,
  era: null,
  level: null,
  minRating: null,
  country: null,
  freeOnly: false,
  kind: null,
  besides: null,
  sort: 'match',
};

export type BookKind = 'learn' | 'story';

const LEARN_GENRES: GenreId[] = ['science', 'history', 'economics', 'investing', 'psychology', 'philosophy'];
// Humour and adventure are left out: a book of science can be funny (Bryson) or a voyage (Darwin's).
const STORY_GENRES: GenreId[] = ['literary', 'gothic', 'romance', 'scifi', 'fantasy', 'mystery', 'historical'];

/** A book is read to learn something when its genres are those of ideas and none is a story's. */
export const kindOf = (book: Book): BookKind =>
  book.genres.some((g) => LEARN_GENRES.includes(g)) && !book.genres.some((g) => STORY_GENRES.includes(g)) ? 'learn' : 'story';

export interface Scored {
  book: Book;
  /** 0–1, higher is a better fit. */
  score: number;
}

export interface MatchResult {
  /** False when no filter is set: the wall rests and nothing is ranked. */
  active: boolean;
  /** Books that fit, best first. */
  fits: Scored[];
  /** True when no book met the mood threshold and `fits` holds the nearest ones instead. */
  closest: boolean;
}

/** A book fits a mood when it sits within this average distance (out of 100) of the sliders. */
const MOOD_TOLERANCE = 24;
const MIN_SUGGESTIONS = 3;

/** Lower case, accents off: how typed text is compared. */
export const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function countActive(filters: Filters): number {
  return (
    (filters.query.trim() ? 1 : 0) +
    Object.keys(filters.mood).length +
    filters.keywords.length +
    (filters.genre ? 1 : 0) +
    (filters.length ? 1 : 0) +
    (filters.era ? 1 : 0) +
    (filters.level ? 1 : 0) +
    (filters.minRating ? 1 : 0) +
    (filters.country ? 1 : 0) +
    (filters.freeOnly ? 1 : 0) +
    (filters.kind ? 1 : 0) +
    (filters.sort !== 'match' ? 1 : 0)
  );
}

function lengthBand(pages: number): LengthBand {
  if (pages < 200) return 'short';
  return pages <= 400 ? 'medium' : 'long';
}

function eraBand(year: number): EraBand {
  if (year < 1900) return 'pre1900';
  return year < 2000 ? 'c20' : 'c21';
}

function levelBand(difficulty: number): LevelBand {
  if (difficulty <= 2) return 'easy';
  return difficulty === 3 ? 'moderate' : 'demanding';
}

function passesHardFilters(book: Book, filters: Filters, query: string): boolean {
  if (book.id === filters.besides) return false;
  if (query) {
    const haystack = fold(`${book.title} ${book.originalTitle ?? ''} ${book.author}`);
    if (!haystack.includes(query)) return false;
  }
  if (filters.genre && !book.genres.includes(filters.genre)) return false;
  if (filters.length && lengthBand(book.pages) !== filters.length) return false;
  if (filters.era && eraBand(book.year) !== filters.era) return false;
  if (filters.level && levelBand(book.difficulty) !== filters.level) return false;
  if (filters.minRating && ratingOf(book) < filters.minRating) return false;
  if (filters.freeOnly && !book.free) return false;
  if (filters.kind && kindOf(book) !== filters.kind) return false;
  if (filters.country) {
    const inCountry =
      filters.country === ELSEWHERE
        ? book.setting.countries.length === 0
        : book.setting.countries.includes(filters.country);
    if (!inCountry) return false;
  }
  // Themes widen rather than narrow: a book needs any one of the chosen themes.
  if (filters.keywords.length && !filters.keywords.some((k) => book.keywords.includes(k))) return false;
  return true;
}

export function moodDistance(a: Partial<Record<AxisId, number>>, book: Book): number | null {
  const axes = Object.keys(a) as AxisId[];
  if (!axes.length) return null;
  const total = axes.reduce((sum, axis) => sum + Math.abs((a[axis] as number) - book.mood[axis]), 0);
  return total / axes.length;
}

/** One or two readers are not a rating: below this many, a book counts as unrated. */
export const MIN_RATINGS = 3;

/** The book's rating out of 5, or 0 when too few readers have rated it. */
export const ratingOf = (book: Book) => (book.rating.count >= MIN_RATINGS ? book.rating.value : 0);

/** Puts the chosen order on a list that is already ranked by fit. */
function ordered(fits: Scored[], filters: Filters): Scored[] {
  if (filters.sort === 'match') return fits;
  const by =
    filters.sort === 'rating'
      ? (a: Scored, b: Scored) => ratingOf(b.book) - ratingOf(a.book) || b.book.rating.count - a.book.rating.count
      : (a: Scored, b: Scored) => b.book.rating.count - a.book.rating.count;
  // An order on its own puts the whole catalogue in that order: the tray lists it from the top.
  return [...fits].sort(by);
}

export function matchBooks(books: Book[], filters: Filters): MatchResult {
  const result = rank(books, filters);
  return result.active ? { ...result, fits: ordered(result.fits, filters) } : result;
}

/** What is let go first when filters asked for in a few words leave no book at all; the mood always stays. */
const LOOSEN: (keyof Filters)[] = ['keywords', 'level', 'era', 'length', 'genre', 'country', 'kind', 'freeOnly', 'query'];

/** The filters, loosened one by one in that order until at least one book fits them. */
export function loosened(books: Book[], filters: Filters): Filters {
  let next = filters;
  for (const key of LOOSEN) {
    if (matchBooks(books, next).fits.length) break;
    next = { ...next, [key]: EMPTY_FILTERS[key] };
  }
  return next;
}

function rank(books: Book[], filters: Filters): MatchResult {
  if (countActive(filters) === 0) return { active: false, fits: [], closest: false };

  const query = fold(filters.query.trim());
  const candidates = books.filter((book) => passesHardFilters(book, filters, query));

  const scored: (Scored & { distance: number | null })[] = candidates.map((book) => {
    const distance = moodDistance(filters.mood, book);
    const moodScore = distance === null ? null : 1 - distance / 100;
    const themeScore = filters.keywords.length
      ? filters.keywords.filter((k) => book.keywords.includes(k)).length / filters.keywords.length
      : null;

    let score: number;
    if (moodScore !== null && themeScore !== null) score = moodScore * 0.75 + themeScore * 0.25;
    else if (moodScore !== null) score = moodScore;
    else if (themeScore !== null) score = themeScore;
    else score = ratingOf(book) / 5;

    return { book, score, distance };
  });

  scored.sort((a, b) => b.score - a.score || ratingOf(b.book) - ratingOf(a.book));

  const moodIsSet = Object.keys(filters.mood).length > 0;
  if (!moodIsSet) return { active: true, fits: scored, closest: false };

  const within = scored.filter((s) => (s.distance as number) <= MOOD_TOLERANCE);
  if (within.length >= MIN_SUGGESTIONS || within.length === scored.length) {
    return { active: true, fits: within, closest: false };
  }
  // Too few exact fits: always leave the reader with something to open.
  return { active: true, fits: scored.slice(0, MIN_SUGGESTIONS), closest: within.length === 0 };
}

/** Other books closest in mood, nudged by shared themes and genres. */
export function similarBooks(book: Book, books: Book[], count = 4): Book[] {
  return books
    .filter((other) => other.id !== book.id)
    .map((other) => {
      const distance = AXES.reduce((sum, { id }) => sum + Math.abs(book.mood[id] - other.mood[id]), 0) / AXES.length;
      const sharedThemes = other.keywords.filter((k) => book.keywords.includes(k)).length;
      const sharedGenre = other.genres.some((g) => book.genres.includes(g)) ? 1 : 0;
      return { other, score: 1 - distance / 100 + sharedThemes * 0.06 + sharedGenre * 0.08 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ other }) => other);
}

/** Ways to ask for a book like this one, but different in one respect. */
export type Nudge = 'lighter' | 'darker' | 'stranger' | 'shorter';

/** How far a nudge moves the axes it touches, out of 100: enough to leave the book's own neighbours behind. */
const NUDGE = 30;
const SHORTER: Partial<Record<LengthBand, LengthBand>> = { long: 'medium', medium: 'short' };

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * The nudges that mean something for this book: none towards an end of the scale it already sits at,
 * and no "shorter" for a short book.
 */
export function nudgesFor(book: Book, mood: Mood): Nudge[] {
  const out: Nudge[] = [];
  if (mood.tone > 20 || mood.intensity > 20) out.push('lighter');
  if (mood.tone < 80 || mood.intensity < 80) out.push('darker');
  if (mood.strange < 75) out.push('stranger');
  if (SHORTER[lengthBand(book.pages)]) out.push('shorter');
  return out;
}

/** Filters for books of the same kind with this mood, moved by a nudge, leaving the book itself out. */
export function likeThis(book: Book, mood: Mood, nudge: Nudge): Filters {
  const next: Mood = { ...mood };
  if (nudge === 'lighter') {
    next.tone = clamp(mood.tone - NUDGE);
    next.intensity = clamp(mood.intensity - NUDGE);
  } else if (nudge === 'darker') {
    next.tone = clamp(mood.tone + NUDGE);
    next.intensity = clamp(mood.intensity + NUDGE);
  } else if (nudge === 'stranger') {
    next.strange = clamp(mood.strange + NUDGE + 5);
  }
  return {
    ...EMPTY_FILTERS,
    mood: next,
    length: nudge === 'shorter' ? SHORTER[lengthBand(book.pages)] ?? null : null,
    kind: kindOf(book),
    besides: book.id,
  };
}
