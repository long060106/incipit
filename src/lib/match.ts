import { AXES, ELSEWHERE } from '../data/vocab';
import type { AxisId, Book, GenreId, KeywordId } from '../data/types';

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
  sort: 'match',
};

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
/** With a sort order and nothing else chosen, this many books from the top are shown. */
const TOP = 10;

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
  const sorted = [...fits].sort(by);
  // A sort order on its own is a request for the top of the list, not for every book.
  return countActive(filters) === 1 ? sorted.slice(0, TOP) : sorted;
}

export function matchBooks(books: Book[], filters: Filters): MatchResult {
  const result = rank(books, filters);
  return result.active ? { ...result, fits: ordered(result.fits, filters) } : result;
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
