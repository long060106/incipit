/*
  Where the books of the stacks are kept. The stacks are the books scripts/add-books.mjs writes
  on a schedule: thousands of them, too many for the catalogue of src/data/books.ts or the rows
  of the database, so they are files of the site, under public/stacks:

    list.json        every book, without its description and advice, for the wall and the filters
    ids.txt          every id, for the sitemap
    parts/<n>.json   each book whole, by id, in one of PARTS files: partOf says which
*/
export const PARTS = 64;

/** Which file of public/stacks/parts holds a book: the site, the server and the script all ask here. */
export const partOf = (id: string) => [...id].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) % 65521, 7) % PARTS;
