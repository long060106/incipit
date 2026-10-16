/*
  The reading room at night (src/reader/ReaderPage.tsx): behind the page a sky of stars
  turns slowly, and a small lamp follows the cursor down the text.

  The sky has two depths. Far off, a great many faint points in the whites, blues and
  ambers stars have, which barely flicker and turn all together, very slowly. Nearer, the
  bright stars, each with a soft glow about it. Each of those goes its own way across the
  page, slowly, changing course a little as it goes, and is joined by a thin line to every
  other bright star near it; the lines come and go as the stars pass one another.

  The bright stars answer the mouse. The ones near the cursor brighten and lean a little
  towards it, and their lines brighten with them. One of them in the margin can be taken
  hold of and drawn aside; its neighbours follow part of the way. Let go, it stays where it
  was put, and they go on. The stars are drawn on one canvas.

  Movement is measured in time, not in frames, so that it is as even on a fast screen as on
  a slow one, and the sky is drawn at every frame: nothing starts or stops with the mouse.
  The stars are fainter behind the column of text; that is done as they are drawn, not by a
  mask over the canvas, which would have to be made again at every frame.

  A book with an air of its own (./scenes.ts: snow, rain, the sea, embers, fog, fireflies,
  falling leaves or blossom) has that drawn instead of the sky, on the same canvas.

  The lamp is two layers that are only ever moved, never repainted: a pool of warm light,
  and a shade that dims the page a little away from it. The shade is there only while the
  mouse is in use. When the mouse has been still for a few seconds the reader is reading,
  and the whole page is lit evenly again.
*/

import { makeScene, type Scene, type SceneId } from './scenes';

const STILL_AFTER = 3500; // milliseconds without the mouse moving before the shade lifts
const TURN = (Math.PI * 2) / (120 * 60 * 1000); // the far depth turns once in two hours: a star crosses a pixel or two in a second
const FRAME = 1000 / 60;
const SKY_TO_A_STAR = 1_400; // px² of sky for each faint star
const SKY_TO_A_BRIGHT = 4_200; // px² of sky for each bright one
const MOST_BRIGHT = 420;
/** The colours of stars, most of them near white: blue-white, white, cream, amber. */
const TINTS = ['#c9d8ff', '#dfe8ff', '#f4f6ff', '#ffffff', '#ffffff', '#fff6e4', '#ffe9c4', '#ffd6a8'];
const REACH = 190; // px from the cursor within which the stars answer it
const LINK = 140; // px: the longest line drawn between two stars
const HOLD = 18; // px: how near a press must be to a star to take hold of it
const HOME = 0.02; // how firmly a star is drawn back to its course
const EASE = 0.8; // how much of its speed a star keeps from one frame to the next

/** A faint star of the far depth: a place on the turning sky. */
interface Far {
  far: number;
  at: number;
  size: number;
  light: number;
  pace: number;
  phase: number;
  tint: string;
}

/** A bright star: it goes where it will, is joined to the ones near it, and can be taken hold of. */
interface Star {
  /** Where it would be if nothing drew it aside, and which way it is going. */
  homeX: number;
  homeY: number;
  heading: number;
  speed: number; // px a second
  /** How its course wanders: how fast, and from where in the cycle. */
  wander: number;
  size: number;
  light: number;
  /** How it twinkles: how fast, and from where in its cycle. */
  pace: number;
  phase: number;
  tint: string;
  /** Where it is on the screen now, and how far that is from its course. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  /** How near the cursor it is, 0 to 1, eased. */
  near: number;
}

/** A star held by the mouse, the point of it the mouse has hold of, and the neighbours that follow it. */
interface Held {
  star: Star;
  gripX: number;
  gripY: number;
  moved: boolean;
  friends: { star: Star; x: number; y: number }[];
}

export function installAmbience(host: HTMLElement, sceneId: SceneId = 'night'): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sky = document.createElement('canvas');
  sky.className = 'reader-sky';
  sky.setAttribute('aria-hidden', 'true');
  const shade = document.createElement('div');
  shade.className = 'reader-shade';
  const glow = document.createElement('div');
  glow.className = 'reader-glow';
  host.prepend(sky);
  host.append(shade, glow);

  const pen = sky.getContext('2d');
  let faint: Far[] = [];
  let bright: Star[] = [];
  let width = 0;
  let height = 0;
  /** The point the far depth turns about: below the foot of the page, so its stars cross in shallow arcs. */
  let pole = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, moved: -Infinity, here: false };
  let held: Held | null = null;
  let scene: Scene | null = null;
  const tint = () => TINTS[Math.floor(Math.random() * TINTS.length)];

  const measure = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    sky.width = Math.round(width * ratio);
    sky.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    pole = { x: width * 0.5, y: height * 1.9 };
    held = null;
    scene = makeScene(sceneId, width, height);
    if (scene) {
      faint = [];
      bright = [];
      return;
    }
    // The screen is a window onto a ring of sky about that point; the whole ring is sown.
    const reach = Math.hypot(Math.max(pole.x, width - pole.x), pole.y);
    const inner = pole.y - height;
    const wanted = Math.round((Math.PI * (reach * reach - inner * inner)) / SKY_TO_A_STAR);
    faint = Array.from({ length: Math.min(wanted, 14000) }, () => {
      // Most are the faintest of points; a brighter one is many times as rare.
      const size = 0.28 + Math.random() ** 6 * 0.6;
      return {
        far: Math.sqrt(inner * inner + Math.random() * (reach * reach - inner * inner)),
        at: Math.random() * Math.PI * 2,
        size,
        light: 0.16 + ((size - 0.28) / 0.6) * 0.42 + Math.random() * 0.14,
        pace: 0.0005 + Math.random() * 0.0014,
        phase: Math.random() * Math.PI * 2,
        tint: tint(),
      };
    });
    // The bright ones are sown a little past every edge, so that none appears from nowhere.
    bright = Array.from({ length: Math.min(MOST_BRIGHT, Math.round(((width + LINK * 2) * (height + LINK * 2)) / SKY_TO_A_BRIGHT)) }, () => ({
      homeX: -LINK + Math.random() * (width + LINK * 2),
      homeY: -LINK + Math.random() * (height + LINK * 2),
      heading: Math.random() * Math.PI * 2,
      speed: 4 + Math.random() * 9,
      wander: 0.00012 + Math.random() * 0.00022,
      size: 0.85 + Math.random() ** 2.5 * 1.05,
      light: 0.62 + Math.random() * 0.38,
      pace: 0.0006 + Math.random() * 0.0014,
      phase: Math.random() * Math.PI * 2,
      tint: tint(),
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      near: 0,
    }));
    held = null;
  };

  /** Where the column of text stands, and how wide the margin is over which the sky comes back. */
  let column: { left: number; right: number } | null = null;
  const EDGE = 96;
  const DIM = 0.14;
  const findColumn = () => {
    const box = host.querySelector('.reader-text')?.getBoundingClientRect();
    column = box && box.width > 0 ? { left: box.left - 24, right: box.right + 24 } : null;
  };
  /** How much of a scene stays behind the column of text, where it is all but wiped away after it is drawn. */
  const VEIL = 0.2;
  const whole = () => 1;
  const veilColumn = () => {
    if (!pen || !column) return;
    const span = column.right - column.left + EDGE * 2;
    const shade = pen.createLinearGradient(column.left - EDGE, 0, column.right + EDGE, 0);
    const wipe = `rgba(0,0,0,${1 - VEIL})`;
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(EDGE / span, wipe);
    shade.addColorStop(1 - EDGE / span, wipe);
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    pen.globalCompositeOperation = 'destination-out';
    pen.fillStyle = shade;
    pen.fillRect(column.left - EDGE, 0, span, height);
    pen.globalCompositeOperation = 'source-over';
  };
  /** How much of a star's light is left at this place across the page. */
  const clear = (x: number) => {
    if (!column) return 1;
    const out = x < column.left ? column.left - x : x > column.right ? x - column.right : 0;
    return out >= EDGE ? 1 : DIM + (1 - DIM) * (out / EDGE);
  };

  let before = performance.now();
  let frames = 0;
  const draw = (now: number) => {
    if (!pen) return;
    // How many sixtieths of a second have gone by: the same movement on any screen.
    const elapsed = Math.min(now - before, 70);
    const k = elapsed / FRAME;
    before = now;
    const ease = 1 - Math.pow(0.92, k);
    const keep = Math.pow(EASE, k);
    // The column moves when the reader changes the page's width or the window's.
    if (frames++ % 30 === 0) findColumn();
    pen.clearRect(0, 0, width, height);
    if (scene) {
      scene.draw(pen, { now, dt: still ? 0 : elapsed / 1000, mouse, veil: whole });
      veilColumn();
      return;
    }
    const answering = mouse.here && !still;

    // The far depth.
    const turned = still ? 0 : now * TURN;
    for (const star of faint) {
      const angle = star.at + turned;
      const x = pole.x + Math.cos(angle) * star.far;
      if (x < -4 || x > width + 4) continue;
      const y = pole.y + Math.sin(angle) * star.far;
      if (y < -4 || y > height + 4) continue;
      const twinkle = still ? 1 : 1 - 0.12 * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      pen.globalAlpha = star.light * twinkle * clear(x);
      pen.fillStyle = star.tint;
      // A point this small is a square to the eye as much as a circle, and far quicker to lay down.
      const side = star.size * 1.8;
      pen.fillRect(x - side / 2, y - side / 2, side, side);
    }

    // The bright stars go their ways.
    const spanX = width + LINK * 2;
    const spanY = height + LINK * 2;
    for (const star of bright) {
      if (!still && star.speed) {
        star.heading += Math.sin(now * star.wander + star.phase) * 0.0035 * k;
        star.homeX += (Math.cos(star.heading) * star.speed * elapsed) / 1000;
        star.homeY += (Math.sin(star.heading) * star.speed * elapsed) / 1000;
        // Off one edge, on at the other, out of sight both times.
        if (star !== held?.star) {
          if (star.homeX < -LINK) star.homeX += spanX;
          else if (star.homeX > width + LINK) star.homeX -= spanX;
          if (star.homeY < -LINK) star.homeY += spanY;
          else if (star.homeY > height + LINK) star.homeY -= spanY;
        }
      }
      let near = 0;
      if (star === held?.star) {
        // In the hand: it goes where the mouse goes.
        star.dx = mouse.x - held.gripX - star.homeX;
        star.dy = mouse.y - held.gripY - star.homeY;
        star.vx = star.vy = 0;
        near = 1;
      } else {
        let pullX = -star.dx * HOME * k;
        let pullY = -star.dy * HOME * k;
        if (answering) {
          const toX = mouse.x - (star.homeX + star.dx);
          const toY = mouse.y - (star.homeY + star.dy);
          const distance = Math.hypot(toX, toY);
          if (distance < REACH) {
            near = 1 - distance / REACH;
            // It leans towards the cursor: a few pixels, never onto it.
            if (distance > 1) {
              pullX += (toX / distance) * near * 0.1 * k;
              pullY += (toY / distance) * near * 0.1 * k;
            }
          }
        }
        star.vx = (star.vx + pullX) * keep;
        star.vy = (star.vy + pullY) * keep;
        star.dx += star.vx * k;
        star.dy += star.vy * k;
      }
      star.near += (near - star.near) * ease;
      star.x = star.homeX + star.dx;
      star.y = star.homeY + star.dy;
    }

    // The neighbours of a held star keep something of the distance they stood at from it.
    if (held) {
      for (const friend of held.friends) {
        friend.star.vx += (held.star.x + friend.x - friend.star.x) * 0.012 * k;
        friend.star.vy += (held.star.y + friend.y - friend.star.y) * 0.012 * k;
      }
    }

    // A line from every bright star to each one near it: faint, fainter the further apart,
    // clearer about the cursor, and all but gone behind the text.
    pen.lineWidth = 0.7;
    pen.strokeStyle = '#ead9b0';
    for (let a = 0; a < bright.length; a++) {
      const one = bright[a];
      const oneClear = clear(one.x);
      for (let b = a + 1; b < bright.length; b++) {
        const other = bright[b];
        const x = one.x - other.x;
        if (x > LINK || x < -LINK) continue;
        const y = one.y - other.y;
        if (y > LINK || y < -LINK) continue;
        const distance = Math.hypot(x, y);
        if (distance > LINK) continue;
        pen.globalAlpha = (1 - distance / LINK) * (0.15 + 0.45 * Math.max(one.near, other.near)) * Math.min(oneClear, clear(other.x));
        pen.beginPath();
        pen.moveTo(one.x, one.y);
        pen.lineTo(other.x, other.y);
        pen.stroke();
      }
    }

    for (const star of bright) {
      // The air makes the bright ones scintillate.
      const twinkle = still ? 1 : 1 - 0.3 * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      const light = Math.min(1, star.light * twinkle + star.near * 0.4) * clear(star.x);
      const size = star.size * (1 + star.near * 0.3);
      pen.fillStyle = star.tint;
      // A soft glow in two rings, widest and faintest outside.
      pen.globalAlpha = light * 0.07;
      pen.beginPath();
      pen.arc(star.x, star.y, size * 4.2, 0, Math.PI * 2);
      pen.fill();
      pen.globalAlpha = light * 0.16;
      pen.beginPath();
      pen.arc(star.x, star.y, size * 2.1, 0, Math.PI * 2);
      pen.fill();
      pen.globalAlpha = light;
      pen.beginPath();
      pen.arc(star.x, star.y, size, 0, Math.PI * 2);
      pen.fill();
    }
    pen.globalAlpha = 1;
  };

  /** The star nearest a point, if one is near enough to be taken hold of. */
  const within = (x: number, y: number): Star | null => {
    let best: Star | null = null;
    let least = HOLD;
    for (const star of bright) {
      const distance = Math.hypot(star.x - x, star.y - y);
      if (distance < least) [best, least] = [star, distance];
    }
    return best;
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (!mouse.here) [lamp.x, lamp.y] = [event.clientX, event.clientY];
    if (held && Math.hypot(event.clientX - mouse.x, event.clientY - mouse.y) > 0) held.moved = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moved = performance.now();
    mouse.here = true;
  };
  const onLeave = () => {
    mouse.here = false;
    held = null;
  };

  // Taking hold of a star. Only where a press does nothing else: not on the text (where it
  // begins a selection), not on anything that can be pressed.
  const onDown = (event: PointerEvent) => {
    if (still || event.pointerType !== 'mouse' || event.button !== 0) return;
    if ((event.target as Element).closest?.('a, button, input, textarea, select, .reader-text, .reader-toc, .reader-note, .reader-pick, .reader-bar')) return;
    const star = within(event.clientX, event.clientY);
    if (!star) return;
    const friends = bright
      .filter((other) => other !== star && Math.hypot(other.x - star.x, other.y - star.y) < LINK * 1.3)
      .sort((a, b) => Math.hypot(a.x - star.x, a.y - star.y) - Math.hypot(b.x - star.x, b.y - star.y))
      .slice(0, 3)
      .map((other) => ({ star: other, x: other.x - star.x, y: other.y - star.y }));
    held = { star, gripX: event.clientX - star.x, gripY: event.clientY - star.y, moved: false, friends };
  };
  // While a star is in the hand, the press must not also begin to select the page.
  const onMouseDown = (event: MouseEvent) => {
    if (held) event.preventDefault();
  };
  const onUp = () => {
    if (!held) return;
    // Drawing a star aside is not a click on what lies under it.
    if (held.moved) {
      window.addEventListener('click', (event) => event.stopPropagation(), { capture: true, once: true });
      // The star stays where it was put: it wanders no more.
      const { star } = held;
      star.homeX = star.x;
      star.homeY = star.y;
      star.speed = 0;
      star.dx = star.dy = 0;
    }
    held = null;
  };

  // The lamp.
  const lamp = { x: 0, y: 0, lit: 0, shaded: 0 };
  let frame = 0;
  let lampBefore = performance.now();
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      before = lampBefore = now;
      return;
    }
    draw(now);

    const reading = now - mouse.moved > STILL_AFTER;
    const k = Math.min((now - lampBefore) / FRAME, 4);
    lampBefore = now;
    const toward = (rate: number) => 1 - Math.pow(1 - rate, k);
    lamp.x += (mouse.x - lamp.x) * (still ? 1 : toward(0.09));
    lamp.y += (mouse.y - lamp.y) * (still ? 1 : toward(0.09));
    lamp.lit += ((mouse.here ? 1 : 0) - lamp.lit) * toward(0.04);
    lamp.shaded += ((mouse.here && !reading ? 1 : 0) - lamp.shaded) * toward(reading ? 0.018 : 0.05);
    const breath = still ? 1 : 0.94 + 0.045 * Math.sin(now / 1900) + 0.015 * Math.sin(now / 730);
    const place = `translate3d(${lamp.x.toFixed(1)}px, ${lamp.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    glow.style.transform = place;
    glow.style.opacity = (lamp.lit * breath).toFixed(3);
    shade.style.transform = place;
    shade.style.opacity = lamp.shaded.toFixed(3);
  };

  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  document.documentElement.addEventListener('pointerleave', onLeave);
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    sky.remove();
    shade.remove();
    glow.remove();
  };
}
