-- Accounts: a name and a password in front of a library card (worker/index.ts).
--
-- The card stays the key to a reader's notebook. An account lets the reader open that card
-- from any device with a name and a password instead of its twenty-character code. Neither
-- the password nor the code is kept as it is: the password is stretched with its salt, and
-- the code is sealed with a key made from the password, so that this table alone opens nothing.

CREATE TABLE accounts (
  name TEXT PRIMARY KEY,          -- lower case: letters, digits, dot, dash, underscore
  card TEXT NOT NULL UNIQUE REFERENCES cards (id) ON DELETE CASCADE,
  salt TEXT NOT NULL,             -- hex
  hash TEXT NOT NULL,             -- proof of the password
  iv TEXT NOT NULL,               -- hex
  sealed TEXT NOT NULL,           -- the card's code, sealed with the password (hex)
  created INTEGER NOT NULL        -- milliseconds
);
