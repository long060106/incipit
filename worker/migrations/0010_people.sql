-- What a reader shows of themselves on a page of their own (/u/<name>), and the essays
-- readers write for everyone (/essays), each read by the keeper before it is shown
-- (worker/index.ts). Both follow the account's name; erasing the card erases them.

CREATE TABLE people (
  name TEXT PRIMARY KEY,              -- the account's name
  bio TEXT NOT NULL DEFAULT '',       -- a few lines of their own, up to 280 characters
  tone INTEGER NOT NULL DEFAULT -1,   -- the colour behind their initial, 0 to 7; -1: the one their name gives
  reading INTEGER NOT NULL DEFAULT 0, -- 1: their page shows what they are reading
  changed INTEGER NOT NULL
);

CREATE TABLE essays (
  id TEXT PRIMARY KEY,                -- twelve letters and digits
  author TEXT NOT NULL,               -- the account's name
  title TEXT NOT NULL,
  body TEXT NOT NULL,                 -- a little Markdown (src/lib/prose.tsx)
  excerpt TEXT NOT NULL,              -- its first words, plain
  words INTEGER NOT NULL,
  books TEXT NOT NULL,                -- ',id,id,': the books it is about, up to three
  status TEXT NOT NULL,               -- 'pending', 'approved' or 'rejected'
  reason TEXT,                        -- the keeper's word on a refusal
  reports INTEGER NOT NULL DEFAULT 0, -- readers who have flagged it since it was approved
  created INTEGER NOT NULL,
  changed INTEGER NOT NULL,
  decided INTEGER                     -- when the keeper last approved or refused it
);

CREATE INDEX essays_shown ON essays (status, decided);
CREATE INDEX essays_author ON essays (author, changed);

-- One flag from each card on each essay.
CREATE TABLE essay_reports (
  essay TEXT NOT NULL,
  card TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (essay, card)
);
