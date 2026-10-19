import { EDITIONS } from '../data/editions';
import type { Book } from '../data/types';

/** Widths of the WebP covers that scripts/fetch-covers.mjs writes to public/covers. */
export const COVER_WIDTHS = { sm: 180, md: 320 } as const;
export type CoverSize = keyof typeof COVER_WIDTHS;

/** A catalogue book's cover is a file of the site; an added book's is kept by the server, in one size. */
/** A book's own page: the wall with that book open over it (src/App.tsx, worker/index.ts). */
export const bookUrl = (id: string) => `${import.meta.env.BASE_URL}book/${id}`;

export const coverUrl = (book: Book, size: CoverSize) =>
  book.added ? `${import.meta.env.BASE_URL}api/covers/${book.id}?v=${book.coverAt ?? 0}` : `${import.meta.env.BASE_URL}covers/${book.id}-${size}.webp`;

const search = (book: Book) => encodeURIComponent(`${book.title} ${book.author}`);

/**
 * Every way to get a book. Books out of copyright are handed over from this site itself as
 * a PDF (public/books), with the other free editions beside it. Books in copyright are
 * never offered for download: they go to a lender, a library or a shop.
 */
export function bookLinks(book: Book) {
  const edition = EDITIONS[book.id];
  const gutenberg = book.free ? `https://www.gutenberg.org/ebooks/${book.free.gutenberg}` : null;
  const standardEbooks = book.free?.standardEbooks ? `https://standardebooks.org/ebooks/${book.free.standardEbooks}` : null;
  return {
    /** The PDF kept here, once scripts/fetch-books.mjs has made it. */
    pdf: edition?.from ? `${import.meta.env.BASE_URL}books/${book.id}.pdf` : null,
    /** The name the downloaded file is given. */
    pdfName: `${book.title} - ${book.author}.pdf`,
    pdfBytes: edition?.from ? edition.bytes : 0,
    readOnline: gutenberg ? `${gutenberg}.html.images` : null,
    /** Where the EPUB and Kindle files are: the edition's own page at its source. */
    ereader: standardEbooks ?? gutenberg,
    ereaderSource: standardEbooks ? ('standardebooks' as const) : ('gutenberg' as const),
    audiobook: (book.free && edition?.librivox) || null,
    also: [...(book.free?.also ?? []), ...(book.original ?? [])],
    borrow: book.borrow ? `https://archive.org/details/${book.borrow}` : null,
    libby: `https://www.overdrive.com/search?q=${search(book)}`,
    bookshop: `https://bookshop.org/search?keywords=${search(book)}`,
    goodreads: `https://www.goodreads.com/search?q=${search(book)}`,
    storygraph: `https://app.thestorygraph.com/browse?search_term=${search(book)}`,
  };
}
