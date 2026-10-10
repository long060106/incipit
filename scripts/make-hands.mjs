// Cuts the two figures for the opening page out of one picture of them: already cut out
// (a transparent background), or on a flat background, black or a neutral light one (white,
// grey, or a "transparency" checkerboard that was saved into the file).
//
//   node scripts/make-hands.mjs <picture> [--preview <folder>]
//
// A picture's own transparency is used as it is. Otherwise, on black, the background is
// whatever dark reaches the edge of the picture, plus anything pure black; on a light ground
// it is told from skin by colour. Writes public/hero/hand-left.webp and hand-right.webp,
// split at the gap between the fingertips and trimmed to the rows the figures use, and
// prints what src/styles/stage.css needs to line the pieces up: how far down each fingertip
// sits, and how wide the right piece is against the left.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [source, flag, previewDir] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node scripts/make-hands.mjs <picture> [--preview <folder>]');
  process.exit(1);
}

const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const peak = (i) => Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

// 1. A rough mask of what belongs to a figure.
const mask = Buffer.alloc(width * height, 255);
const corners = [0, width - 1, (height - 1) * width, height * width - 1];
const own = (await sharp(source).metadata()).hasAlpha
  ? await sharp(source).extractChannel(3).raw().toBuffer()
  : null;
const cutOut = own !== null && corners.every((i) => own[i] < 8);
const onBlack = !cutOut && corners.every((i) => peak(i) < 40);

if (cutOut) {
  own.copy(mask);
} else if (onBlack) {
  // Flood in from the edges through the dark, so shadows inside a figure are kept.
  const stack = [];
  const visit = (i) => {
    if (mask[i] && peak(i) < 44) {
      mask[i] = 0;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < (height - 1) * width) visit(i + width);
  }
  // Gaps the flood cannot reach, between fingers.
  for (let i = 0; i < width * height; i++) if (peak(i) < 9) mask[i] = 0;
} else {
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const light = (r + g + b) / 3;
    const fromColour = Math.min(1, Math.max(0, (chroma - 14) / 16));
    const fromDark = Math.min(1, Math.max(0, (150 - light) / 40));
    mask[i] = Math.round(Math.max(fromColour, fromDark) * 255);
  }
}

// 2. Tidy it: drop specks, close pinholes, then pull the edge in a little and soften it so
//    no rim of background is left around the skin.
const tidy = cutOut
  ? mask
  : await sharp(mask, { raw: { width, height, channels: 1 } })
      .median(onBlack ? 3 : 7)
      .blur(onBlack ? 1.1 : 1.6)
      .linear(3.2, -255 * 1.45)
      .blur(0.7)
      .extractChannel(0)
      .raw()
      .toBuffer();

const cut = await sharp(data, { raw: { width, height, channels: 3 } })
  .joinChannel(tidy, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();

// 3. Split at the emptiest column around the middle: the gap between the two fingertips.
const column = (x) => {
  let sum = 0;
  for (let y = 0; y < height; y++) sum += tidy[y * width + x];
  return sum;
};
let split = Math.round(width / 2);
let emptiest = Infinity;
for (let x = Math.round(width * 0.3); x < width * 0.7; x++) {
  const sum = column(x);
  if (sum < emptiest) {
    emptiest = sum;
    split = x;
  }
}

// 4. Keep only the rows the figures use, the same rows for both so they stay level.
const solid = (y) => {
  for (let x = 0; x < width; x++) if (tidy[y * width + x] > 40) return true;
  return false;
};
let top = 0;
let bottom = height - 1;
while (top < bottom && !solid(top)) top++;
while (bottom > top && !solid(bottom)) bottom--;
const rows = bottom - top + 1;

/** How far down the piece its fingertip is: the middle of the solid run in its innermost column. */
function fingertip(from, to, step) {
  for (let x = from; x !== to; x += step) {
    let first = -1;
    let last = -1;
    for (let y = top; y <= bottom; y++) {
      if (tidy[y * width + x] > 128) {
        if (first < 0) first = y;
        last = y;
      }
    }
    if (first >= 0) return ((first + last) / 2 - top) / rows;
  }
  return 0.5;
}

const out = path.resolve('public/hero');
await mkdir(out, { recursive: true });
const pieces = [
  ['hand-left', { left: 0, top, width: split, height: rows }, fingertip(split - 1, -1, -1)],
  ['hand-right', { left: split, top, width: width - split, height: rows }, fingertip(split, width, 1)],
];
for (const [name, region, tip] of pieces) {
  const file = path.join(out, `${name}.webp`);
  const result = await sharp(cut).extract(region).webp({ quality: 84, alphaQuality: 92 }).toFile(file);
  console.log(
    `${name}.webp  ${result.width}×${result.height}  ${(result.size / 1024).toFixed(0)} kB  fingertip ${(tip * 100).toFixed(1)}% down`,
  );
}
console.log(`split at x=${split} of ${width}, rows ${top} to ${bottom}`);
console.log(`the right piece is ${((width - split) / split).toFixed(3)} times as wide as the left`);

if (flag === '--preview' && previewDir) {
  for (const [name, background] of [['night', '#0c0c0d'], ['day', '#f4f0e8']]) {
    await sharp(cut).flatten({ background }).resize(1400).png().toFile(path.join(previewDir, `hands-${name}.png`));
  }
}
