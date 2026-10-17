-- Signing in with Google (worker/index.ts). An account can be tied to one Google person: the
-- `sub` Google gives them, which never changes, whatever email they use.
--
-- An account opened with Google has no password, so the code of its card cannot be sealed under
-- one: it is sealed under a key held only by the worker (the secret ACCOUNT_SEAL_KEY), so that
-- this table alone still opens nothing. Such an account has empty salt, hash, iv and sealed.

ALTER TABLE accounts ADD COLUMN google TEXT;   -- Google's id for the person, or NULL
ALTER TABLE accounts ADD COLUMN gseal TEXT;    -- the card's code sealed under the worker's key: "<iv hex>.<sealed hex>", or NULL
CREATE UNIQUE INDEX accounts_google ON accounts (google);
