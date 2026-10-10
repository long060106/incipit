// Makes the two hand cursors from one picture of the two hands almost touching, on a flat,
// neutral light background (white, grey, or a "transparency" checkerboard saved into the
// file): God's pointing hand, on the right of the picture, is the cursor; Adam's, on the
// left, is shown over anything that can be pressed.
//
//   node scripts/make-cursor.mjs <picture> [--preview <folder>]
//
// Each hand is cut at the wrist, where it fades out, and turned so its finger points up and
// to the left as a cursor does. Adam's is mirrored first, so that both hands lie on the same
// side of the point they mark. A thin dark rim keeps them readable on a light page. Writes
// public/cursors/hand-{god,adam}[@2x].png and prints each hotspot (the fingertip) for
// src/styles/tokens.css.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [source, flag, previewDir] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node scripts/make-cursor.mjs <picture> [--preview <folder>]');
  process.exit(1);
}

/** The longer side of the cursor in CSS px. Browsers ignore cursor images over 128 px, and the 2x one is twice this. */
const SIZE = 60;
/** How much of the picture's width one hand takes, fingertip to wrist. */
const HAND = 0.2;
/** How far each hand is turned, clockwise, to point up and to the left. */
const TURN = { god: 38, adam: 52 };

const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// A pixel belongs to a hand if it has colour, or is dark; the background has neither.
const rough = Buffer.alloc(width * height);
for (let i = 0; i < width * height; i++) {
  const r = data[i * 3];
  const g = data[i * 3 + 1];
  const b = data[i * 3 + 2];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const light = (r + g + b) / 3;
  rough[i] = Math.round(Math.max(Math.min(1, Math.max(0, (chroma - 14) / 16)), Math.min(1, Math.max(0, (150 - light) / 40))) * 255);
}
const mask = await sharp(rough, { raw: { width, height, channels: 1 } })
  .median(7)
  .blur(1.6)
  .linear(3.2, -255 * 1.45)
  .blur(0.7)
  .extractChannel(0)
  .raw()
  .toBuffer();

const columnSum = (x) => {
  let sum = 0;
  for (let y = 0; y < height; y++) sum += mask[y * width + x];
  return sum;
};
// The gap between the two fingertips: the emptiest column around the middle.
let gap = Math.round(width / 2);
for (let x = Math.round(width * 0.3), emptiest = Infinity; x < width * 0.7; x++) {
  const sum = columnSum(x);
  if (sum < emptiest) {
    emptiest = sum;
    gap = x;
  }
}

/** One hand: from its fingertip, `step` columns at a time (+1 rightwards, -1 leftwards), to the wrist. */
async function hand(step, turn) {
  let tip = gap;
  while (columnSum(tip) < 255 * 2) tip += step;
  const length = Math.round(width * HAND);
  const left = step > 0 ? tip - 2 : tip - length;
  const w = length + 2;
  let top = height;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = left; x < left + w; x++) {
      if (mask[y * width + x] > 40) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }
  const h = bottom - top + 1;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (top + y) * width + left + x;
      // Along the hand, 0 at the fingertip and 1 at the wrist: the last third fades out.
      const along = (step > 0 ? x : w - 1 - x) / w;
      const fade = Math.min(1, Math.max(0, (1 - along) / 0.34));
      const o = (y * w + x) * 4;
      rgba[o] = data[from * 3];
      rgba[o + 1] = data[from * 3 + 1];
      rgba[o + 2] = data[from * 3 + 2];
      rgba[o + 3] = Math.round(mask[from] * fade * fade * (3 - 2 * fade));
    }
  }
  let image = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
  // Adam's fingertip is on the right of his hand; mirrored, it is on the left like God's.
  if (step < 0) image = image.flop();
  const turned = await sharp(await image.png().toBuffer())
    .rotate(turn, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Trim to what is left of the hand, and find the fingertip: the solid pixel furthest
  // along the way the finger now points.
  const tw = turned.info.width;
  const th = turned.info.height;
  const angle = (turn * Math.PI) / 180;
  let box = { x0: tw, y0: th, x1: 0, y1: 0 };
  let hot = { x: 0, y: 0, reach: -Infinity };
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const a = turned.data[(y * tw + x) * 4 + 3];
      if (a > 12) box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
      const reach = -x * Math.cos(angle) - y * Math.sin(angle);
      if (a > 160 && reach > hot.reach) hot = { x, y, reach };
    }
  }
  const region = { left: box.x0, top: box.y0, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 };
  const cut = await sharp(turned.data, { raw: { width: tw, height: th, channels: 4 } }).extract(region).png().toBuffer();
  const scale = SIZE / Math.max(region.width, region.height);
  return { cut, region, scale, hotX: (hot.x - box.x0) * scale, hotY: (hot.y - box.y0) * scale };
}

/** The hand at `k` times its cursor size, on a thin dark rim. */
async function render({ cut, region, scale }, k) {
  const pad = 2 * k;
  const w = Math.round(region.width * scale * k);
  const h = Math.round(region.height * scale * k);
  const small = await sharp(cut).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  const alpha = await sharp(await sharp(small).extractChannel(3).png().toBuffer())
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#000' })
    .blur(0.55 * k + 0.3)
    .linear(2.4, 0)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const rim = await sharp({ create: { width: w + pad * 2, height: h + pad * 2, channels: 3, background: '#17130f' } })
    .joinChannel(Buffer.from(alpha.map((v) => v * 0.5)), { raw: { width: w + pad * 2, height: h + pad * 2, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(rim).composite([{ input: small, left: pad, top: pad }]).png({ compressionLevel: 9 }).toBuffer();
}

const hands = [
  ['hand-god', await hand(1, TURN.god)],
  ['hand-adam', await hand(-1, TURN.adam)],
];

const out = path.resolve('public/cursors');
await mkdir(out, { recursive: true });
for (const [name, piece] of hands) {
  for (const [suffix, k] of [['', 1], ['@2x', 2]]) {
    await sharp(await render(piece, k)).toFile(path.join(out, `${name}${suffix}.png`));
  }
  const meta = await sharp(path.join(out, `${name}.png`)).metadata();
  // The rim adds 2 px on every side.
  console.log(`${name}: ${meta.width}×${meta.height}px, hotspot ${Math.round(piece.hotX) + 2} ${Math.round(piece.hotY) + 2}`);
}

if (flag === '--preview' && previewDir) {
  const tiles = [];
  for (const background of ['#0c0c0d', '#f4f0e8']) {
    for (const [name] of hands) {
      // Once at its real size, once enlarged.
      for (const [file, size] of [[`${name}.png`, null], [`${name}@2x.png`, 300]]) {
        let tile = sharp(path.join(out, file));
        if (size) tile = tile.resize({ height: size, kernel: 'nearest' });
        tiles.push(await tile.flatten({ background }).extend({ top: 20, bottom: 20, left: 24, right: 24, background }).png().toBuffer());
      }
    }
  }
  let left = 0;
  const parts = [];
  for (const input of tiles) {
    parts.push({ input, left, top: 0 });
    left += (await sharp(input).metadata()).width;
  }
  await sharp({ create: { width: left, height: 340, channels: 3, background: '#777' } }).composite(parts).png().toFile(path.join(previewDir, 'hand-cursors.png'));
}
