-- What the keeper of the site (a card whose role is 'admin') decides about a book, over
-- what the catalogue in src/data/books.ts says.

CREATE TABLE book_overrides (
  book TEXT PRIMARY KEY,                 -- the book's id in the catalogue
  download INTEGER NOT NULL DEFAULT 1,   -- 0 once the keeper has switched its download off
  articles TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ "title": "...", "url": "https://..." }]
  changed INTEGER NOT NULL
);

-- One-time codes that make a card the keeper's. Only the SHA-256 of a code is kept.
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  used INTEGER                           -- when it was used; NULL while it is still good
);
