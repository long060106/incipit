import { answer } from './added';
import { fetchFile, keptFiles, type Decided, type KeptFile } from './keeper';
import { dropText, readBookFile, storedText, storeText, type OwnText } from './mybooks';

/*
  Reading the file the keeper keeps beside a book (an EPUB or a text file) in the site's own
  reader, at the book's own address (/read/<book id>), so that a book the keeper added reads
  like any other: chapters, place kept, marks and notes under the book's name.

  The file is fetched once, cut into its chapters here (src/lib/mybooks.ts) and kept in this
  browser; it is fetched again only when the keeper has put another file in its place. A
  closed file is read by the keeper's card alone.
*/

/** Whether the reader can show this kind of file. PDF and Kindle files can only be downloaded. */
export const reads = (file: KeptFile | undefined) => !!file && /\.(epub|txt)$/i.test(file.name);

const key = (bookId: string) => `kept:${bookId}`;

/** The text of a book's kept file, or null when there is none this reader may read. `keeper` is the keeper's code, if this is their card. */
export async function keptText(bookId: string, keeper?: string | null): Promise<OwnText | null> {
  const given = await answer;
  const stored = await storedText(key(bookId));
  // With no word from the server (offline), what was read before can still be read.
  if (!given) return stored?.text ?? null;

  let file = (given.books as Record<string, Decided> | undefined)?.[bookId]?.file;
  let code: string | null = null;
  if (!file && keeper) {
    file = (await keptFiles(keeper).catch(() => ({}) as Record<string, KeptFile>))[bookId];
    code = keeper;
  }
  if (!file || !reads(file)) {
    // Closed or removed since: this browser's copy goes with it.
    if (stored) void dropText(key(bookId));
    return null;
  }
  const stamp = `${file.name}:${file.bytes}:${file.changed ?? 0}`;
  if (stored?.stamp === stamp) return stored.text;
  const whole = await fetchFile(bookId, file, code);
  if (!whole) return null;
  const { text } = await readBookFile(whole);
  void storeText(key(bookId), { stamp, text });
  return text;
}
