-- Readers answer one another's essays (worker/index.ts), and choose passages they marked in
-- their notebooks to show on their own pages (/u/<name>).

CREATE TABLE essay_comments (
  id TEXT PRIMARY KEY,                -- twelve letters and digits
  essay TEXT NOT NULL,                -- the essay answered
  author TEXT NOT NULL,               -- the account's name
  body TEXT NOT NULL,                 -- plain text, up to 2000 characters
  created INTEGER NOT NULL
);

CREATE INDEX essay_comments_essay ON essay_comments (essay, created);
CREATE INDEX essay_comments_author ON essay_comments (author);

-- [{ id, book, quote }]: the marks a reader chose to show, from books out of copyright, at most twelve.
ALTER TABLE people ADD COLUMN quotes TEXT NOT NULL DEFAULT '[]';
