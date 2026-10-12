-- Books the keeper adds from the desk, beside the catalogue of src/data/books.ts, and who
-- may fetch each kept file.

-- 1 when every reader may have the file; 0 when only the keeper's card may. The keeper sets
-- it. A new file starts open beside a book the catalogue marks as out of copyright, and
-- closed beside any other.
ALTER TABLE files ADD COLUMN open INTEGER NOT NULL DEFAULT 0;

CREATE TABLE added_books (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,              -- JSON: a Book of src/data/types.ts, checked by worker/index.ts
  changed INTEGER NOT NULL
);

-- The cover of an added book: one small image.
CREATE TABLE covers (
  book TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  changed INTEGER NOT NULL
);
