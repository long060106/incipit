-- What readers say of a book: stars, how it felt to them, and a few words (worker/index.ts).
--
-- One review for each reader and book, which they can change or take back. Only a reader
-- with an account (0007_accounts.sql) can write one, so that each is shown under a name.
-- Erasing the card erases its reviews.

CREATE TABLE reviews (
  book TEXT NOT NULL,             -- the book's id
  card TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  stars INTEGER,                  -- 1 to 5, or NULL when the reader gave none
  mood TEXT,                      -- JSON: the five axes, 0 to 100, or NULL
  text TEXT,                      -- the reader's words, or NULL
  created INTEGER NOT NULL,       -- milliseconds
  changed INTEGER NOT NULL,
  PRIMARY KEY (book, card)
);

CREATE INDEX reviews_book ON reviews (book, changed);
