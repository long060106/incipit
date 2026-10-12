/*
  The reading room at night (src/reader/ReaderPage.tsx): behind the page a sky of faint stars
  turns slowly, and a lamp follows the cursor down the text.

  The stars are drawn on one canvas, a few times a second; they are faint behind the column
  of text (reader.css masks them there) and clearer in the margins. The lamp is two layers
  that are only ever moved, never repainted: a warm pool of light, and a shade that dims the
  page away from it. The shade is there only while the mouse is in use. When the mouse has
  been still for a few seconds the reader is reading, and the whole page is lit evenly again.
*/

const STILL_AFTER = 3500; // milliseconds without the mouse moving before the shade lifts
const TURN = (Math.PI * 2) / (50 * 60 * 1000); // the sky turns once in fifty minutes
const FRAME = 1000 / 24;

interface Star {
  /** Where it is, from the point the sky turns about: a distance and an angle. */
  far: number;
  at: number;
  size: number;
  light: number;
  /** How it twinkles: how fast, and from where in its cycle. */
  pace: number;
  phase: number;
  warm: boolean;
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

  const measure = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    sky.width = Math.round(width * ratio);
    sky.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    pole = { x: width * 0.5, y: height * 1.9 };
    // Enough stars for the whole ring the screen is a window onto, at one for about every 5000 px² in view.
    const reach = Math.hypot(Math.max(pole.x, width - pole.x), pole.y);
    const near = pole.y - height;
    const wanted = Math.round((Math.PI * (reach * reach - near * near)) / 5200);
    stars = Array.from({ length: Math.min(wanted, 4500) }, () => ({
      far: Math.sqrt(near * near + Math.random() * (reach * reach - near * near)),
      at: Math.random() * Math.PI * 2,
      size: 0.35 + Math.random() ** 3 * 1.15,
      light: 0.26 + Math.random() ** 2 * 0.7,
      pace: 0.0006 + Math.random() * 0.0012,
      phase: Math.random() * Math.PI * 2,
      warm: Math.random() < 0.22,
    }));
    drawn = 0;
  };

  let drawn = 0;
  const draw = (now: number) => {
    if (!pen || now - drawn < FRAME) return;
    drawn = now;
    pen.clearRect(0, 0, width, height);
    const turned = still ? 0 : now * TURN;
    for (const star of stars) {
      const angle = star.at + turned;
      const x = pole.x + Math.cos(angle) * star.far;
      const y = pole.y + Math.sin(angle) * star.far;
      if (x < -2 || x > width + 2 || y < -2 || y > height + 2) continue;
      const twinkle = still ? 1 : 0.72 + 0.28 * Math.sin(now * star.pace + star.phase);
      pen.globalAlpha = star.light * twinkle;
      pen.fillStyle = star.warm ? '#ffe2b0' : '#e9eefc';
      pen.beginPath();
      pen.arc(x, y, star.size, 0, Math.PI * 2);
      pen.fill();
    }
  };

  // The lamp.
  const mouse = { x: 0, y: 0, moved: -Infinity, here: false };
  const lamp = { x: 0, y: 0, lit: 0, shaded: 0 };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (!mouse.here) [lamp.x, lamp.y] = [event.clientX, event.clientY];
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moved = performance.now();
    mouse.here = true;
  };
  const onLeave = () => {
    mouse.here = false;
  };

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
  document.documentElement.addEventListener('pointerleave', onLeave);
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    sky.remove();
    shade.remove();
    glow.remove();
  };
}
