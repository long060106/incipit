-- An email address a reader may sign in with, instead of the account's name (worker/index.ts).
-- It is never shown to anyone else: on the site a reader is known by the name alone.

ALTER TABLE accounts ADD COLUMN email TEXT;               -- lower case, or NULL
CREATE UNIQUE INDEX accounts_email ON accounts (email);
