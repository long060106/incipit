-- The password on the keeper's desk. Holding the keeper's card is not enough to change
-- anything: the password must have been given too, and it opens the desk for a while only.

-- One row at most. Of the password only a salted, stretched hash is kept (PBKDF2).
-- To let the keeper choose a new password after forgetting this one, empty both tables:
--   npx wrangler d1 execute incipit --remote --command "DELETE FROM keeper_lock; DELETE FROM keeper_sessions;"
CREATE TABLE keeper_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  changed INTEGER NOT NULL
);

-- The desk, opened: a random key given to the browser that entered the password. Only its
-- SHA-256 is kept here.
CREATE TABLE keeper_sessions (
  id TEXT PRIMARY KEY,
  card TEXT NOT NULL,
  expires INTEGER NOT NULL
);
