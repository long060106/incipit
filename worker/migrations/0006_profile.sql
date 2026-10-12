-- The page about who made the site (/about): the maker's own words and portrait, written
-- from the keeper's desk. One row of each at most.

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,              -- JSON: a Profile, checked by worker/index.ts
  changed INTEGER NOT NULL
);

CREATE TABLE portrait (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  changed INTEGER NOT NULL
);
