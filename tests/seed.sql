-- What the tests start from (tests/run.mjs): three approved essays by writers with no account.
-- The test server's database is made new for every run, so this is all it holds.
INSERT INTO essays (id, author, title, body, excerpt, words, books, status, reason, reports, created, changed, decided) VALUES
('seedessay001', 'Marguerite', 'The monster who read Plutarch', 'What frightened me in Frankenstein was never the creature. It was the moment Victor turns away from him, the night he first opens his eyes.

## A creature who reads

The creature learns to read from three books found in a satchel. Think of what that means: his idea of what a person is comes from Plutarch, Goethe and Milton.

> I learned, from Werter''s imaginations, despondency and gloom: but Plutarch taught me high thoughts; he elevated me above the wretched sphere of my own reflections.

That is the sentence I keep coming back to. He is formed by what he reads, as we all are, and then he is refused by the one person whose book he most needed.

---

Read it again in winter, when the nights are long. *It is a book about loneliness first.*', 'What frightened me in Frankenstein was never the creature. It was the moment Victor turns away from him, the night he first opens his eyes. A creature who reads The creature learns to read from three books found in a satchel.', 260, ',frankenstein,the-sorrows-of-young-werther,the-divine-comedy,', 'approved', NULL, 0, 1760000000000, 1760000000000, 1760500000000),
('seedessay002', 'Theo', 'Ishmael is funny, and nobody told me', 'Nobody warns you that Moby-Dick is funny. The first hundred pages are a comedy of two men sharing a bed at an inn. The whale comes much later, and by then you love the crew.', 'Nobody warns you that Moby-Dick is funny. The first hundred pages are a comedy of two men sharing a bed at an inn.', 120, ',moby-dick,', 'approved', NULL, 0, 1759000000000, 1759000000000, 1759500000000),
('seedessay003', 'Lan', 'Three homecomings', 'I have read The Odyssey three times, and each time a different man came home.', 'I have read The Odyssey three times, and each time a different man came home.', 90, ',the-odyssey,', 'approved', NULL, 0, 1758000000000, 1758000000000, 1758500000000);
