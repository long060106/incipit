# Incipit

**Find your next book by how you want to feel.**
Live at <https://incipit.incipit.workers.dev>

Most book sites ask what you want to read. Incipit asks how you want to feel: you set a mood,
and the books that fit it step into the light. Books out of copyright can be read on the
site or downloaded, free and legally; for the rest, the site points to a library or a bookshop.

Designed and developed by **Long Nguyen**.

<!-- Add screenshots here once taken, e.g.:
![The wall of covers](docs/wall.png)
![The reader at night](docs/reader.png)
-->

**289 books** from 61 countries in 27 languages: 181 out of copyright (readable on the site and
downloadable as PDF) and 108 still in copyright (described, with links to libraries and bookshops only).

## What is in it

- **The wall.** Every book as a cover on one wall you can drag, zoom out of, and filter by
  mood, theme, genre, era, length and language.
- **Book pages.** What the book is like, who it suits, who should skip it, and where to get it.
- **A reader.** Books out of copyright open on the site, chapter by chapter, with notes,
  highlights and a quiet night sky behind the page.
- **First pages.** Meet a book by its opening lines alone, with no cover and no name.
- **The globe.** Books by where they are set.
- **A notebook.** Your notes and shelves, carried between devices with a library card
  instead of an account.
- **About.** Who made the site and why.
- **An app.** The site installs to a phone or computer from the browser and opens with no network.
- **The keeper's desk** (`/admin`). For the owner only, behind a card and a password: correct
  entries, add books, upload files and decide who may open them, and write the About page.

## How it is built

| Part | Made with |
| --- | --- |
| The site | React 19, TypeScript, Vite |
| The server | One Cloudflare Worker (`worker/index.ts`), answering `/api/*` |
| The database | Cloudflare D1 (tables in `worker/migrations`) |
| Hosting | Cloudflare Workers; every push to `main` deploys |

```
src/            the site: pages, the wall, the reader, styles
src/data/       the catalogue
worker/         the server and its database migrations
public/         covers, texts of books out of copyright, icons, the service worker
scripts/        the scripts that fetched the catalogue, covers and texts
```

## About the book data

The mood scores, themes, descriptions and "read it if / skip it if" advice were written with the
help of AI, not taken from a published source. The ratings come from Open Library. The batches
added on 2026-10-10 (104 books), 2026-10-19 (30 books) and 2026-10-26 (50 books, on money,
markets, science and the mind) have not yet been reviewed by hand, so treat the mood scores of
those books as a first draft.

## Running it

```bash
npm install
npm run dev
```

The site is then at <http://localhost:5173>. For the notebook, the cards and the keeper's
desk, run the server beside it:

```bash
npx wrangler d1 migrations apply incipit --local
npx wrangler dev --port 8787
```

To build and deploy by hand:

```bash
npm run deploy
```

## Sources and credits

- Texts: [Project Gutenberg](https://www.gutenberg.org) and [Standard Ebooks](https://standardebooks.org).
  Audiobooks: [LibriVox](https://librivox.org).
- Covers and catalogue data: [Open Library](https://openlibrary.org), a project of the Internet Archive.
- The two hands on the first page: Michelangelo, *The Creation of Adam*, about 1511.
- Typefaces: Cinzel Decorative, Brygada 1918, Monsieur La Doulaise, Hanken Grotesk.

Only books out of copyright are offered to read or download. Books still in copyright are
described and linked to libraries and shops, and their covers remain the property of their publishers.
