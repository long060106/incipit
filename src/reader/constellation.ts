/*
  The reader's own stars (src/reader/ReaderPage.tsx). Each passage marked in a book becomes
  a star in the margins beside the page: when the words are marked, a spark leaves them,
  rises in an arc and settles in the margin, where a star opens. The stars of one book are
  joined, in the order they were marked, into that book's constellation.

  A star keeps its place: it is found from the mark's id, so the constellation is the same
  at every visit. Pointing at a star shows the words it stands for; pressing it goes to them.
  Where the margins are too narrow (a phone), the spark rises and fades, and no stars stay.

  The same places serve the notebook, which draws a book's constellation small
  (src/pages/Notebook.tsx), through `starPlace`.
*/

import type { Mark } from '../lib/shelf';

const FLIGHT = 1600; // ms for a spark to reach its place
const OPEN = 1400; // ms for a new star to open
const MARGIN = 72; // px: the narrowest margin that holds stars
const TAU = Math.PI * 2;

/** A number from a mark's id, the same at every visit. */
function hash(text: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** Where a mark's star stands in a box: which side, and how far across and down it, each 0 to 1. */
export function starPlace(id: string) {
  return { left: hash(id, 1) < 0.5, across: hash(id, 2), down: hash(id, 3) };
}

/** A small constellation, for the notebook: the stars of some marks, placed in a box and joined in order. */
export function starsIn(marks: Mark[], width: number, height: number, pad = 10) {
  const ordered = [...marks].sort((a, b) => a.created - b.created);
  return ordered.map((mark) => {
    const place = starPlace(mark.id);
    // The two margins side by side: the left half of the box, then the right.
    const half = (width - pad * 2) / 2;
    return {
      mark,
      x: pad + (place.left ? 0 : half) + place.across * half,
      y: pad + place.down * (height - pad * 2),
    };
  });
}

interface Spark {
  id: string;
  from: { x: number; y: number };
  started: number;
  trail: { x: number; y: number }[];
}

export interface Constellation {
  /** A mark was just made from these words: send a spark from them to its star. */
  launch: (id: string, from: { x: number; y: number }) => void;
  remove: () => void;
}

export function installConstellation(host: HTMLElement, marks: () => Mark[], onPick: (mark: Mark) => void): Constellation {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'reader-mine';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const tip = document.createElement('div');
  tip.className = 'reader-star-tip';
  tip.setAttribute('aria-hidden', 'true');
  host.append(tip);
  const pen = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let gilt = '201,164,92';
  const sparks: Spark[] = [];
  /** When each star opened, for those opened during this visit. */
  const opened = new Map<string, number>();
  const mouse = { x: -1, y: -1 };
  let pointed: Mark | null = null;

  const readStyle = () => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(accent)?.[1];
    if (hex) gilt = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(',');
  };
  const measure = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  /** The margins either side of the column of text, or null where one is too narrow to hold stars. */
  const margins = () => {
    const box = host.querySelector('.reader-text')?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const left = { from: 18, to: box.left - 36 };
    const right = { from: box.right + 36, to: width - 18 };
    return {
      left: left.to - left.from >= MARGIN ? left : null,
      right: right.to - right.from >= MARGIN ? right : null,
    };
  };

  /** Where a mark's star stands on the screen now. */
  const placeOf = (id: string, sides: ReturnType<typeof margins>) => {
    if (!sides || (!sides.left && !sides.right)) return null;
    const place = starPlace(id);
    const side = (place.left ? sides.left : sides.right) ?? sides.left ?? sides.right!;
    return {
      x: side.from + place.across * (side.to - side.from),
      y: height * (0.14 + place.down * 0.72),
    };
  };

  const glow = (x: number, y: number, reach: number, alpha: number) => {
    if (!pen) return;
    const light = pen.createRadialGradient(x, y, 0, x, y, reach);
    light.addColorStop(0, `rgba(${gilt},${alpha})`);
    light.addColorStop(1, `rgba(${gilt},0)`);
    pen.fillStyle = light;
    pen.fillRect(x - reach, y - reach, reach * 2, reach * 2);
  };

  const draw = (now: number) => {
    if (!pen) return;
    pen.clearRect(0, 0, width, height);
    const sides = margins();
    const flying = new Set(sparks.map((spark) => spark.id));
    const stars = [...marks()]
      .filter((mark) => mark.quote && !flying.has(mark.id))
      .sort((a, b) => a.created - b.created)
      .map((mark) => ({
        mark,
        at: placeOf(mark.id, sides),
        left: starPlace(mark.id).left,
      }))
      .filter(
        (
          star,
        ): star is {
          mark: Mark;
          at: { x: number; y: number };
          left: boolean;
        } => !!star.at,
      );

    // Under the cursor, a star is pointed at.
    pointed = null;
    for (const star of stars) if (Math.hypot(star.at.x - mouse.x, star.at.y - mouse.y) < 14) pointed = star.mark;

    // The lines first, star to star in the order they were marked, each side on its own.
    pen.lineWidth = 0.8;
    for (const left of [true, false]) {
      const side = stars.filter((star) => star.left === left || !(sides?.left && sides?.right));
      for (let at = 1; at < side.length; at++) {
        const [a, b] = [side[at - 1], side[at]];
        // A new line draws itself from the old star to the new one.
        const grown = Math.min(1, (now - (opened.get(b.mark.id) ?? -Infinity)) / 900);
        const lit = pointed === a.mark || pointed === b.mark;
        pen.strokeStyle = `rgba(${gilt},${lit ? 0.6 : 0.28})`;
        pen.beginPath();
        pen.moveTo(a.at.x, a.at.y);
        pen.lineTo(a.at.x + (b.at.x - a.at.x) * grown, a.at.y + (b.at.y - a.at.y) * grown);
        pen.stroke();
      }
      if (!(sides?.left && sides?.right)) break;
    }

    for (const star of stars) {
      const age = now - (opened.get(star.mark.id) ?? -Infinity);
      const opening = Math.min(1, age / OPEN);
      const twinkle = still ? 1 : 0.82 + 0.18 * Math.sin(now * 0.0013 + hash(star.mark.id, 4) * TAU);
      const lit = star.mark === pointed ? 1.5 : 1;
      const { x, y } = star.at;
      glow(x, y, (17 + (star.mark.note ? 6 : 0)) * lit * (0.6 + 0.4 * opening), 0.38 * twinkle * lit);
      pen.globalAlpha = Math.min(1, twinkle * lit) * (0.3 + 0.7 * opening);
      pen.fillStyle = '#fff6e2';
      pen.beginPath();
      pen.arc(x, y, (star.mark.note ? 2.6 : 2) * (star.mark === pointed ? 1.3 : 1), 0, TAU);
      pen.fill();
      // The ring a star sends out as it opens.
      if (age < OPEN) {
        pen.globalAlpha = (1 - opening) * 0.7;
        pen.strokeStyle = `rgb(${gilt})`;
        pen.lineWidth = 1;
        pen.beginPath();
        pen.arc(x, y, 3 + opening * 30, 0, TAU);
        pen.stroke();
      }
      pen.globalAlpha = 1;
    }

    // The sparks on their way, each with a tail.
    for (let at = sparks.length - 1; at >= 0; at--) {
      const spark = sparks[at];
      const target = placeOf(spark.id, sides) ?? {
        x: spark.from.x + (spark.from.x < width / 2 ? -60 : 60),
        y: -40,
      };
      const t = Math.min(1, (now - spark.started) / FLIGHT);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const bend = {
        x: (spark.from.x + target.x) / 2,
        y: Math.min(spark.from.y, target.y) - 140,
      };
      const u = 1 - ease;
      const x = u * u * spark.from.x + 2 * u * ease * bend.x + ease * ease * target.x;
      const y = u * u * spark.from.y + 2 * u * ease * bend.y + ease * ease * target.y;
      spark.trail.push({ x, y });
      if (spark.trail.length > 22) spark.trail.shift();
      spark.trail.forEach((point, n) => {
        const part = n / spark.trail.length;
        pen.globalAlpha = part * 0.55;
        pen.fillStyle = '#ffe2a8';
        pen.beginPath();
        pen.arc(point.x, point.y, 0.4 + part * 1.6, 0, TAU);
        pen.fill();
      });
      pen.globalAlpha = 1;
      glow(x, y, 16, 0.85);
      pen.fillStyle = '#fffaf0';
      pen.beginPath();
      pen.arc(x, y, 1.8, 0, TAU);
      pen.fill();
      if (t >= 1) {
        sparks.splice(at, 1);
        opened.set(spark.id, now);
      }
    }

    // The words of the star pointed at.
    if (pointed && pointed.quote) {
      const quote = pointed.quote.length > 120 ? `${pointed.quote.slice(0, 118).trimEnd()}…` : pointed.quote;
      if (tip.textContent !== quote) tip.textContent = `“${quote}”`;
      const onLeft = mouse.x < width / 2;
      tip.style.transform = `translate(${onLeft ? mouse.x + 18 : mouse.x - 18}px, ${mouse.y - 12}px) translate(${onLeft ? 0 : -100}%, -100%)`;
      tip.dataset.shown = 'true';
      document.documentElement.style.cursor = 'pointer';
    } else if (tip.dataset.shown) {
      delete tip.dataset.shown;
      document.documentElement.style.cursor = '';
    }
  };

  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (!document.hidden) draw(now);
  };

  const onMove = (event: PointerEvent) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  };
  const onLeave = () => {
    mouse.x = mouse.y = -1;
  };
  // Pressing a star goes to its words. Nothing else is under a star but the margin.
  const onClick = (event: MouseEvent) => {
    if (!pointed || (event.target as Element).closest?.('a, button, input, textarea, .reader-text, .reader-note, .reader-pick, .reader-bar, .reader-drawer, .reader-toc')) return;
    onPick(pointed);
  };

  readStyle();
  measure();
  const themes = new MutationObserver(readStyle);
  themes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.addEventListener('resize', measure);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('click', onClick);
  document.documentElement.addEventListener('pointerleave', onLeave);
  frame = requestAnimationFrame(tick);

  return {
    launch(id, from) {
      if (still) opened.set(id, performance.now() - OPEN);
      else sparks.push({ id, from, started: performance.now(), trail: [] });
    },
    remove() {
      cancelAnimationFrame(frame);
      themes.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.documentElement.style.cursor = '';
      canvas.remove();
      tip.remove();
    },
  };
}
