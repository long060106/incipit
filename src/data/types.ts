export type Lang = 'en' | 'fr';

/** A string in every interface language. */
export type L = Record<Lang, string>;

export type AxisId = 'tone' | 'voice' | 'intensity' | 'pace' | 'strange';

/** 0–100 on each axis; 0 is the axis's `low` word, 100 its `high` word. */
export type Mood = Record<AxisId, number>;

export type GenreId =
  | 'literary'
  | 'gothic'
  | 'romance'
  | 'adventure'
  | 'scifi'
  | 'fantasy'
  | 'mystery'
  | 'humour'
  | 'historical'
  | 'philosophy'
  | 'memoir'
  | 'history';

export type KeywordId =
  | 'love'
  | 'obsession'
  | 'revenge'
  | 'family'
  | 'comingOfAge'
  | 'identity'
  | 'society'
  | 'war'
  | 'memory'
  | 'solitude'
  | 'friendship'
  | 'freedom'
  | 'power'
  | 'justice'
  | 'nature'
  | 'science'
  | 'supernatural'
  | 'mystery'
  | 'adventure'
  | 'madness'
  | 'art'
  | 'knowledge'
  | 'survival'
  | 'faith';

export type LanguageId =
  | 'en'
  | 'fr'
  | 'ru'
  | 'de'
  | 'grc'
  | 'es'
  | 'ja'
  | 'it'
  | 'he'
  | 'vi'
  | 'zh'
  | 'pt'
  | 'ko'
  | 'no'
  | 'sv'
  | 'nl'
  | 'cs'
  | 'tr'
  | 'ar'
  | 'bn'
  | 'id';

export interface Book {
  /** URL slug. */
  id: string;
  /** Title of the English edition. */
  title: string;
  /** Title in the original language, when the book is a translation. */
  originalTitle?: string;
  author: string;
  year: number;
  pages: number;
  language: LanguageId;
  genres: GenreId[];
  keywords: KeywordId[];
  setting: {
    place: L;
    /** ISO country codes; empty when the book is set nowhere on Earth in particular. */
    countries: string[];
  };
  mood: Mood;
  /** 1 (very easy) to 5 (very demanding). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Open Library community rating. Under MIN_RATINGS (src/lib/match.ts) it is not shown. */
  rating: { value: number; count: number };
  /** Open Library cover id; scripts/fetch-covers.mjs turns it into the files in public/covers. */
  cover: number;
  /** Open Library work key, e.g. "/works/OL66554W". */
  olKey: string;
  /**
   * Legal free editions, present only for books that are out of copyright.
   * scripts/fetch-books.mjs keeps a PDF of each of them on this site.
   */
  free?: {
    /** Project Gutenberg's number for the English text. */
    gutenberg: number;
    /** Path of the Standard Ebooks edition, when there is one. */
    standardEbooks?: string;
    /** Said beside the download when the free edition is not the whole book. */
    note?: L;
    /** Other free editions worth pointing to: the original language, another translation. */
    also?: { label: L; url: string }[];
  };
  /** Internet Archive id of an English copy that can be borrowed online, when there is one. */
  borrow?: string;
  /**
   * For an old book whose English translation is still in copyright: free legal texts in
   * the language it was written in.
   */
  original?: { label: L; url: string }[];
  /** Set on a book the keeper added from the desk (/admin) rather than one of the catalogue's. */
  added?: true;
  /** For an added book: when its cover was last kept, to tell one cover's address from the next. */
  coverAt?: number;
  description: L;
  advice: {
    pace: L;
    headsUp: L;
    readIf: L;
    skipIf: L;
  };
}
