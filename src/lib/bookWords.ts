import { BOOKS } from '../data/books';
import type { BookL, Lang } from '../data/types';

/**
 * What books.ru.ts and books.vi.ts hold for one book: the words books.ts writes for it in English
 * and French, in one more language. `also` and `original` follow the order of the book's own lists.
 */
export interface BookWords {
  place?: string;
  description: string;
  pace: string;
  headsUp: string;
  readIf: string;
  skipIf: string;
  note?: string;
  also?: string[];
  original?: string[];
}

/*
  Only English and French are written into books.ts. The other languages are kept apart and
  loaded the first time a reader picks one, so that nobody downloads the words of a language
  they do not read. Once loaded they are put into the books themselves, beside the English and
  the French, and the pages find them where they find the others.
*/
const PACKS: Partial<Record<Lang, () => Promise<{ WORDS: Record<string, BookWords> }>>> = {
  ru: () => import('../data/books.ru'),
  vi: () => import('../data/books.vi'),
};

const loading = new Map<Lang, Promise<void>>();

function put(target: BookL | undefined, lang: Lang, text: string | undefined) {
  if (target && text) target[lang] = text;
}

/** Puts the books' words in `lang` into the catalogue. It never fails: English stands in for what is missing. */
export function loadBookWords(lang: Lang): Promise<void> {
  const pack = PACKS[lang];
  if (!pack) return Promise.resolve();
  let done = loading.get(lang);
  if (!done) {
    done = pack()
      .then(({ WORDS }) => {
        for (const book of BOOKS) {
          const words = WORDS[book.id];
          if (!words) continue;
          put(book.setting.place, lang, words.place);
          put(book.description, lang, words.description);
          put(book.advice.pace, lang, words.pace);
          put(book.advice.headsUp, lang, words.headsUp);
          put(book.advice.readIf, lang, words.readIf);
          put(book.advice.skipIf, lang, words.skipIf);
          put(book.free?.note, lang, words.note);
          book.free?.also?.forEach((entry, i) => put(entry.label, lang, words.also?.[i]));
          book.original?.forEach((entry, i) => put(entry.label, lang, words.original?.[i]));
        }
      })
      .catch(() => {
        // Offline before the words ever came: the books stay in English, and the next choice tries again.
        loading.delete(lang);
      });
    loading.set(lang, done);
  }
  return done;
}
