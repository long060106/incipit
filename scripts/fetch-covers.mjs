// Downloads each book's cover from Open Library once and writes resized WebP copies to
// public/covers, so the site serves its own small images instead of hot-linking.
// Usage: npm run covers            -> only books whose files are missing
//        npm run covers -- --force -> redo everything

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BOOKS } from '../src/data/books.ts';

// Keep in step with COVER_WIDTHS in src/lib/links.ts.
const WIDTHS = { sm: 180, md: 320 };
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'covers');
const force = process.argv.includes('--force');

mkdirSync(OUT, { recursive: true });
let total = 0;

for (const book of BOOKS) {
  const targets = Object.entries(WIDTHS).map(([size, width]) => ({ width, file: join(OUT, `${book.id}-${size}.webp`) }));
  if (!force && targets.every(({ file }) => existsSync(file))) continue;

  // The cover server drops a connection now and then: try three times before giving up.
  let source = null;
  let failure = '';
  for (let attempt = 0; attempt < 3 && !source; attempt++) {
    try {
      const res = await fetch(`https://covers.openlibrary.org/b/id/${book.cover}-L.jpg`, {
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) source = Buffer.from(await res.arrayBuffer());
      else failure = `HTTP ${res.status}`;
    } catch (error) {
      failure = error.cause?.code ?? error.message;
    }
    if (!source) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!source) {
    console.error(`FAILED ${book.id}: ${failure}`);
    process.exitCode = 1;
    continue;
  }
  const { width: sourceWidth } = await sharp(source).metadata();

  const sizes = [];
  for (const { width, file } of targets) {
    const info = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width > 200 ? 64 : 70 })
      .toFile(file);
    total += info.size;
    sizes.push(`${info.width}w ${(info.size / 1024).toFixed(0)}KB`);
  }
  console.log(`${book.id} (source ${sourceWidth}px): ${sizes.join(', ')}`);
}

console.log(`Wrote ${(total / 1024).toFixed(0)} KB`);
