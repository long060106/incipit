/*
  The reading room at night (src/reader/ReaderPage.tsx): behind the page a sky of stars
  turns slowly, and a small lamp follows the cursor down the text.

  The sky is sown as a real one looks: a great many faint points, fewer of middling light,
  and a handful of bright ones with a soft glow about them, in the whites, blues and ambers
  stars have. The faint ones barely flicker; the bright ones scintillate.

  The bright stars answer the mouse, in the way of a graph of notes but quieter. The ones
  near the cursor brighten, lean a little towards it and are joined to one another by thin
  lines. One of them in the margin can be taken hold of and drawn aside; its neighbours
  follow part of the way. Let go, it stays where it was put, and they drift back. The
  stars are drawn on one canvas, which reader.css makes faint behind the column of text.

  The lamp is two layers that are only ever moved, never repainted: a pool of warm light,
  and a shade that dims the page a little away from it. The shade is there only while the
  mouse is in use. When the mouse has been still for a few seconds the reader is reading,
  and the whole page is lit evenly again.
*/

const STILL_AFTER = 3500; // milliseconds without the mouse moving before the shade lifts
const TURN = (Math.PI * 2) / (120 * 60 * 1000); // the sky turns once in two hours: a star crosses a pixel or two in a second
const AT_REST = 1000 / 24; // milliseconds between drawings while nothing answers the mouse
const SKY_TO_A_STAR = 3_600; // px² of sky for each star, faint ones and all
const BRIGHT = 0.9; // px across the middle: from this size up a star has a glow, and answers the mouse
/** The colours of stars, most of them near white: blue-white, white, cream, amber. */
const TINTS = ['#c9d8ff', '#dfe8ff', '#f4f6ff', '#ffffff', '#ffffff', '#fff6e4', '#ffe9c4', '#ffd6a8'];
const REACH = 170; // px from the cursor within which the stars answer it
const LINK = 150; // px: the longest line drawn between two stars
const HOLD = 18; // px: how near a press must be to a star to take hold of it
const HOME = 0.02; // how firmly a star is drawn back to its place
const EASE = 0.8; // how much of its speed a star keeps from one frame to the next

interface Star {
  /** Its place in the sky, from the point the sky turns about: a distance and an angle. */
  far: number;
  at: number;
  size: number;
  light: number;
  /** How it twinkles: how fast, and from where in its cycle. */
  pace: number;
  phase: number;
  tint: string;
  /** How far it wanders about its place, in px, and how slowly. Only the bright ones wander. */
  sway: number;
  drift: number;
  /** One of the few bright ones: it has a glow, is joined to others, and can be taken hold of. */
  bright: boolean;
  /** Where it is on the screen now, and how far that is from its place. */
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

export function installAmbience(host: HTMLElement): () => void {
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
  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  /** The point the sky turns about: below the foot of the page, so the stars cross it in shallow arcs. */
  let pole = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, moved: -Infinity, here: false };
  let held: Held | null = null;

  const measure = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    sky.width = Math.round(width * ratio);
    sky.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    pole = { x: width * 0.5, y: height * 1.9 };
    // The screen is a window onto a ring of sky about that point; the whole ring is sown.
    const reach = Math.hypot(Math.max(pole.x, width - pole.x), pole.y);
    const inner = pole.y - height;
    const wanted = Math.round((Math.PI * (reach * reach - inner * inner)) / SKY_TO_A_STAR);
    stars = Array.from({ length: Math.min(wanted, 7000) }, () => {
      // Most stars are faint points; a star twice as bright is many times as rare.
      const size = 0.3 + Math.random() ** 7 * 1.5;
      const bright = size >= BRIGHT;
      return {
        far: Math.sqrt(inner * inner + Math.random() * (reach * reach - inner * inner)),
        at: Math.random() * Math.PI * 2,
        size,
        light: bright ? 0.7 + Math.random() * 0.3 : 0.16 + ((size - 0.3) / (BRIGHT - 0.3)) * 0.4 + Math.random() * 0.14,
        pace: 0.0005 + Math.random() * 0.0014,
        phase: Math.random() * Math.PI * 2,
        tint: TINTS[Math.floor(Math.random() * TINTS.length)],
        sway: bright ? 8 + Math.random() * 16 : 0,
        drift: 0.00006 + Math.random() * 0.00009,
        bright,
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
        vx: 0,
        vy: 0,
        near: 0,
      };
    });
    held = null;
    drawn = 0;
  };

  let drawn = 0;
  /** How far the sky had turned at the last drawing. */
  let turnedBy = 0;
  /** Stars on the screen at the last drawing, for the mouse to find one among. */
  let shown: Star[] = [];
  const draw = (now: number) => {
    if (!pen) return;
    const awake = held !== null || now - mouse.moved < 2500 || shown.some((star) => star.near > 0.01 || Math.abs(star.dx) + Math.abs(star.dy) > 0.2);
    if (!awake && now - drawn < AT_REST) return;
    drawn = now;
    pen.clearRect(0, 0, width, height);
    const turned = still ? 0 : now * TURN;
    turnedBy = turned;
    const answering = mouse.here && !still;
    shown = [];

    for (const star of stars) {
      const angle = star.at + turned;
      // A bright star does not keep still in the sky: it wanders about its place, each at its own slow pace.
      const wander = star.sway && !still ? now * star.drift + star.phase : 0;
      const homeX = pole.x + Math.cos(angle) * star.far + Math.sin(wander) * star.sway;
      const homeY = pole.y + Math.sin(angle) * star.far + Math.cos(wander * 0.73) * star.sway;
      const away = homeX < -40 || homeX > width + 40 || homeY < -40 || homeY > height + 40;
      if (away && star !== held?.star) {
        star.dx = star.dy = star.vx = star.vy = star.near = 0;
        continue;
      }
      let near = 0;
      if (!star.bright) {
        // A faint star keeps its place; the cursor only lifts its light a little as it passes.
        const distance = answering ? Math.hypot(mouse.x - homeX, mouse.y - homeY) : REACH;
        star.near += ((distance < REACH ? 1 - distance / REACH : 0) - star.near) * 0.08;
        star.x = homeX;
        star.y = homeY;
        shown.push(star);
        continue;
      }
      if (star === held?.star) {
        // In the hand: it goes where the mouse goes.
        star.dx = mouse.x - held.gripX - homeX;
        star.dy = mouse.y - held.gripY - homeY;
        star.vx = star.vy = 0;
        near = 1;
      } else {
        let pullX = -star.dx * HOME;
        let pullY = -star.dy * HOME;
        if (answering) {
          const toX = mouse.x - (homeX + star.dx);
          const toY = mouse.y - (homeY + star.dy);
          const distance = Math.hypot(toX, toY);
          if (distance < REACH) {
            near = 1 - distance / REACH;
            // It leans towards the cursor: a few pixels, never onto it.
            if (distance > 1) {
              pullX += (toX / distance) * near * 0.1;
              pullY += (toY / distance) * near * 0.1;
            }
          }
        }
        star.vx = (star.vx + pullX) * EASE;
        star.vy = (star.vy + pullY) * EASE;
        star.dx += star.vx;
        star.dy += star.vy;
      }
      star.near += (near - star.near) * 0.08;
      star.x = homeX + star.dx;
      star.y = homeY + star.dy;
      shown.push(star);
    }

    // The neighbours of a held star keep something of the distance they stood at from it.
    if (held) {
      for (const friend of held.friends) {
        friend.star.vx += (held.star.x + friend.x - friend.star.x) * 0.012;
        friend.star.vy += (held.star.y + friend.y - friend.star.y) * 0.012;
      }
    }

    // Lines between the stars the cursor has woken, fainter the further apart and the further from it.
    const woken = shown.filter((star) => star.bright && star.near > 0.03);
    pen.lineWidth = 0.7;
    pen.strokeStyle = '#ead9b0';
    for (let a = 0; a < woken.length; a++) {
      for (let b = a + 1; b < woken.length; b++) {
        const distance = Math.hypot(woken[a].x - woken[b].x, woken[a].y - woken[b].y);
        if (distance > LINK) continue;
        pen.globalAlpha = 0.34 * Math.sqrt(woken[a].near * woken[b].near) * (1 - distance / LINK);
        pen.beginPath();
        pen.moveTo(woken[a].x, woken[a].y);
        pen.lineTo(woken[b].x, woken[b].y);
        pen.stroke();
      }
    }

    for (const star of shown) {
      // The air makes the bright ones scintillate; the faint ones hardly change.
      const depth = star.bright ? 0.3 : 0.1;
      const twinkle = still ? 1 : 1 - depth * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      const light = Math.min(1, star.light * twinkle + star.near * (star.bright ? 0.4 : 0.22));
      const size = star.size * (1 + (star.bright ? star.near * 0.3 : 0));
      pen.fillStyle = star.tint;
      if (star.bright) {
        // A soft glow in two rings, widest and faintest outside.
        pen.globalAlpha = light * 0.07;
        pen.beginPath();
        pen.arc(star.x, star.y, size * 4.2, 0, Math.PI * 2);
        pen.fill();
        pen.globalAlpha = light * 0.16;
        pen.beginPath();
        pen.arc(star.x, star.y, size * 2.1, 0, Math.PI * 2);
        pen.fill();
      }
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
    for (const star of shown) {
      if (!star.bright) continue;
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
    const friends = shown
      .filter((other) => other.bright && other !== star && Math.hypot(other.x - star.x, other.y - star.y) < LINK * 1.3)
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
      // The star stays where it was put: that is its place in the sky from now on.
      const { star } = held;
      star.far = Math.hypot(star.x - pole.x, star.y - pole.y);
      star.at = Math.atan2(star.y - pole.y, star.x - pole.x) - turnedBy;
      star.sway = 0;
      star.dx = star.dy = 0;
    }
    held = null;
  };

  // The lamp.
  const lamp = { x: 0, y: 0, lit: 0, shaded: 0 };
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    draw(now);

    const reading = now - mouse.moved > STILL_AFTER;
    lamp.x += (mouse.x - lamp.x) * (still ? 1 : 0.09);
    lamp.y += (mouse.y - lamp.y) * (still ? 1 : 0.09);
    lamp.lit += ((mouse.here ? 1 : 0) - lamp.lit) * 0.04;
    lamp.shaded += ((mouse.here && !reading ? 1 : 0) - lamp.shaded) * (reading ? 0.018 : 0.05);
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
