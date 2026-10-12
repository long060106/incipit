-- The keeper's corrections to a book's entry, and the files the keeper puts beside books.

-- JSON: { "title": "...", "author": "...", "year": 1900, "description": { "en": "...", "fr": "..." } },
-- holding only what the keeper has changed from src/data/books.ts.
ALTER TABLE book_overrides ADD COLUMN edits TEXT NOT NULL DEFAULT '{}';

-- One file for a book. Who may fetch it is not stored here: the catalogue decides when it is
-- asked for (worker/index.ts). A book out of copyright hands its file to every reader; any
-- other book's file is given to the keeper's card alone.
CREATE TABLE files (
  book TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- the file's name, as it will be saved
  bytes INTEGER NOT NULL,
  pieces INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0, -- 1 once every piece has arrived
  changed INTEGER NOT NULL
);

-- The file itself, in pieces small enough for one database row each.
CREATE TABLE file_pieces (
  book TEXT NOT NULL REFERENCES files (book) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (book, n)
);
