import { BOOKS } from '../data/books';
import { coverUrl } from '../lib/links';
import { ownBook } from '../lib/mybooks';
import type { Mark } from '../lib/shelf';

/*
  How the notebook is filed. Every book the reader has marked or written in has a folder, and
  in it one file for each day they wrote in that book, named "<title>_<date>". Thoughts written
  on their own, with no book, have a folder of their own, filed by day the same way.

  Nothing of this is stored: it is worked out from the marks themselves (src/lib/shelf.ts), so
  a note is always in the folder of its book and the file of the day it was made.
*/

/** The folder of the thoughts written with no book. */
export const LOOSE = 'thoughts';

export interface NoteFile {
  /** "<folder>/<date>". */
  id: string;
  folder: string;
  /** "YYYY-MM-DD", the reader's own calendar day. */
  date: string;
  /** "<title>_<date>". */
  name: string;
  marks: Mark[];
}

export interface Folder {
  /** The book's id, or LOOSE. */
  id: string;
  /** The book's title; undefined for the loose thoughts, whose name depends on the language. */
  title?: string;
  author?: string;
  cover?: string;
  files: NoteFile[];
  count: number;
  /** When anything in it was last made. */
  last: number;
}

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day a mark was made, in the reader's own time zone. */
export const dayOf = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The file a mark is kept in. */
export const fileIdOf = (mark: Mark) => `${mark.bookId ?? LOOSE}/${dayOf(mark.created)}`;

/** Marks in the order they come in the book; thoughts in the order they were written. */
const inOrder = (a: Mark, b: Mark) =>
  (a.section ?? -1) - (b.section ?? -1) || (a.start ?? 0) - (b.start ?? 0) || a.created - b.created;

/** Files the marks into folders: the most recently used folder first, each folder's newest file first. */
export function fileMarks(marks: Mark[], looseName: string): Folder[] {
  const folders = new Map<string, Folder>();
  for (const mark of marks) {
    const id = mark.bookId ?? LOOSE;
    let folder = folders.get(id);
    if (!folder) {
      const catalogued = mark.bookId ? BY_ID.get(mark.bookId) : undefined;
      const own = mark.bookId && !catalogued ? ownBook(mark.bookId) : undefined;
      folder = {
        id,
        title: catalogued?.title ?? own?.title ?? (mark.bookId ? mark.bookId : undefined),
        author: catalogued?.author ?? own?.author,
        cover: catalogued ? coverUrl(catalogued, 'sm') : undefined,
        files: [],
        count: 0,
        last: 0,
      };
      folders.set(id, folder);
    }
    folder.count += 1;
    folder.last = Math.max(folder.last, mark.created);
    const date = dayOf(mark.created);
    let file = folder.files.find((entry) => entry.date === date);
    if (!file) {
      file = { id: `${id}/${date}`, folder: id, date, name: `${folder.title ?? looseName}_${date}`, marks: [] };
      folder.files.push(file);
    }
    file.marks.push(mark);
  }
  for (const folder of folders.values()) {
    folder.files.sort((a, b) => b.date.localeCompare(a.date));
    for (const file of folder.files) file.marks.sort(inOrder);
  }
  return [...folders.values()].sort((a, b) => b.last - a.last);
}
