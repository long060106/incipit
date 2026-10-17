-- Links that set a new password, sent by email to a reader who has forgotten theirs (worker/index.ts).
-- Only the SHA-256 of a link's token is kept. A link works once, for half an hour.

CREATE TABLE resets (
  id TEXT PRIMARY KEY,        -- SHA-256 of the token in the link
  name TEXT NOT NULL,         -- the account's name
  created INTEGER NOT NULL,   -- milliseconds
  expires INTEGER NOT NULL,   -- milliseconds
  used INTEGER                -- when it was used, or NULL
);

CREATE INDEX resets_name ON resets (name, created);
