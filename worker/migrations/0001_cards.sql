-- Library cards and the notebooks they open (worker/index.ts).

CREATE TABLE cards (
  id TEXT PRIMARY KEY,            -- SHA-256 of the card's code; the code itself is not kept
  created INTEGER NOT NULL,       -- milliseconds
  seen INTEGER NOT NULL,          -- last time the card was used
  role TEXT NOT NULL DEFAULT 'reader'  -- 'admin' for the owner of the site
);

-- A reader's records: places kept in books, marked passages, notes.
CREATE TABLE rows (
  card TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  key TEXT NOT NULL,              -- "place:<book id>" or "mark:<id>"
  value TEXT,                     -- JSON; NULL once the reader has deleted it
  changed INTEGER NOT NULL,       -- when the reader changed it, by their own clock
  stored INTEGER NOT NULL,        -- when it reached the server, for handing on to other devices
  PRIMARY KEY (card, key)
);

CREATE INDEX rows_stored ON rows (card, stored);

-- How many cards an address has asked for today. `bucket` is a hash, never the address.
CREATE TABLE limits (
  bucket TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL
);
