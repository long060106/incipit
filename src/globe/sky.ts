/*
  The sky behind the globe (GlobePage.tsx): stars sown as a real sky looks, a great many
  faint and a few bright, with a band of them thicker than the rest crossing the page like
  the Milky Way. The whole sky turns very slowly about a point far off the page.

  The bright stars answer the mouse, as they do behind the page of a book (src/reader/
  ambience.ts): the ones near the cursor brighten, lean a little towards it, and are joined
  to one another by thin lines.

  It is one canvas behind everything on the page. Movement is measured in time, not in
  frames, so that it is as even on a fast screen as on a slow one.
*/

const TURN = (Math.PI * 2) / (150 * 60 * 1000); // once round in two and a half hours
const SKY_TO_A_STAR = 3_400; // px² of sky for each star outside the band
const BRIGHT = 0.9; // px across the middle: from this size up a star has a glow and answers the mouse
const TINTS = ['#c9d8ff', '#dfe8ff', '#f4f6ff', '#ffffff', '#ffffff', '#fff6e4', '#ffe9c4', '#ffd6a8'];
const REACH = 190; // px from the cursor within which the stars answer it
const LINK = 165; // px: the longest line drawn between two stars
const FRAME = 1000 / 60;

interface Star {
  far: number;
  at: number;
  size: number;
  light: number;
  pace: number;
  phase: number;
  tint: string;
  bright: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  near: number;
}

/** A number near 0, most often close to it: the sum of three throws. */
const bell = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

export function installSky(page: HTMLElement): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'globe-sky';
  canvas.setAttribute('aria-hidden', 'true');
  page.prepend(canvas);
  const pen = canvas.getContext('2d');
  const haze = document.createElement('canvas');

  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  let pole = { x: 0, y: 0 };
  let band = { far: 0, wide: 0 };
  const mouse = { x: 0, y: 0, here: false };

  const make = (far: number, faintOnly: boolean): Star => {
    // Most stars are faint points; a star twice as bright is many times as rare.
    const size = 0.3 + Math.random() ** (faintOnly ? 11 : 7) * 1.5;
    const bright = size >= BRIGHT;
    return {
      far,
      at: Math.random() * Math.PI * 2,
      size,
      light: bright ? 0.7 + Math.random() * 0.3 : 0.16 + ((size - 0.3) / (BRIGHT - 0.3)) * 0.4 + Math.random() * 0.14,
      pace: 0.0005 + Math.random() * 0.0014,
      phase: Math.random() * Math.PI * 2,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      bright,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      near: 0,
    };
  };

  const measure = () => {
    const box = page.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    // The sky turns about a point below and to the left of the page, so the stars cross it on a slant.
    pole = { x: -width * 0.25, y: height * 2.1 };
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - pole.x, y - pole.y))) + 40;
    const inner = Math.max(0, Math.hypot(Math.max(0, -pole.x), pole.y - height) - 40);
    const wanted = Math.min(6000, Math.round((Math.PI * (reach * reach - inner * inner)) / SKY_TO_A_STAR));
    stars = Array.from({ length: wanted }, () => make(Math.sqrt(inner * inner + Math.random() * (reach * reach - inner * inner)), false));
    // The band: a ring of the same sky, through the middle of the page, sown thicker and mostly faint.
    band = { far: Math.hypot(width * 0.5 - pole.x, height * 0.45 - pole.y), wide: Math.min(width, height) * 0.11 };
    const more = Math.min(5000, Math.round((Math.PI * 2 * band.far * band.wide * 2.4) / (SKY_TO_A_STAR / 2.6)));
    for (let n = 0; n < more; n++) stars.push(make(band.far + bell() * band.wide * 1.6, true));

    // The haze of the band is the same at every frame (a ring about the point the sky turns
    // on), so it is painted once, small, and laid down stretched: soft, and no work to draw.
    haze.width = Math.max(1, Math.round(width / 4));
    haze.height = Math.max(1, Math.round(height / 4));
    const mist = haze.getContext('2d');
    if (mist) {
      const spread = band.wide * 2.6;
      const ring = mist.createRadialGradient(pole.x / 4, pole.y / 4, Math.max(0, band.far - spread) / 4, pole.x / 4, pole.y / 4, (band.far + spread) / 4);
      for (let at = 0; at <= 10; at++) ring.addColorStop(at / 10, `rgba(157, 179, 234, ${(0.07 * Math.exp(-(((at - 5) / 2.2) ** 2))).toFixed(4)})`);
      mist.fillStyle = ring;
      mist.fillRect(0, 0, haze.width, haze.height);
    }
  };

  let before = performance.now();
  let frame = 0;
  const shown: Star[] = [];
  const woken: Star[] = [];

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!pen || document.hidden) {
      before = now;
      return;
    }
    // How many sixtieths of a second have gone by: the same movement on any screen.
    const k = Math.min((now - before) / FRAME, 4);
    before = now;
    const ease = 1 - Math.pow(0.92, k);
    const keep = Math.pow(0.8, k);
    const turned = still ? 0 : now * TURN;
    const answering = mouse.here && !still;
    pen.clearRect(0, 0, width, height);

    // The haze of the band, behind its stars.
    pen.drawImage(haze, 0, 0, width, height);

    shown.length = 0;
    woken.length = 0;
    for (const star of stars) {
      const angle = star.at + turned;
      const homeX = pole.x + Math.cos(angle) * star.far;
      const homeY = pole.y + Math.sin(angle) * star.far;
      if (homeX < -30 || homeX > width + 30 || homeY < -30 || homeY > height + 30) {
        star.dx = star.dy = star.vx = star.vy = star.near = 0;
        continue;
      }
      let near = 0;
      if (answering) {
        const toX = mouse.x - (homeX + star.dx);
        const toY = mouse.y - (homeY + star.dy);
        const distance = Math.hypot(toX, toY);
        if (distance < REACH) {
          near = 1 - distance / REACH;
          // A bright one leans towards the cursor: a few pixels, never onto it.
          if (star.bright && distance > 1) {
            star.vx += (toX / distance) * near * 0.1 * k;
            star.vy += (toY / distance) * near * 0.1 * k;
          }
        }
      }
      if (star.bright) {
        star.vx = (star.vx - star.dx * 0.02 * k) * keep;
        star.vy = (star.vy - star.dy * 0.02 * k) * keep;
        star.dx += star.vx * k;
        star.dy += star.vy * k;
      }
      star.near += (near - star.near) * ease;
      star.x = homeX + star.dx;
      star.y = homeY + star.dy;
      shown.push(star);
      if (star.bright && star.near > 0.03) woken.push(star);
    }

    // Lines between the stars the cursor has woken, fainter the further apart and the further from it.
    pen.lineWidth = 0.7;
    pen.strokeStyle = '#ead9b0';
    for (let a = 0; a < woken.length; a++) {
      for (let b = a + 1; b < woken.length; b++) {
        const distance = Math.hypot(woken[a].x - woken[b].x, woken[a].y - woken[b].y);
        if (distance > LINK) continue;
        pen.globalAlpha = 0.6 * Math.sqrt(woken[a].near * woken[b].near) * (1 - distance / LINK);
        pen.beginPath();
        pen.moveTo(woken[a].x, woken[a].y);
        pen.lineTo(woken[b].x, woken[b].y);
        pen.stroke();
      }
    }

    for (const star of shown) {
      const depth = star.bright ? 0.3 : 0.1;
      const twinkle = still ? 1 : 1 - depth * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      const light = Math.min(1, star.light * twinkle + star.near * (star.bright ? 0.45 : 0.25));
      const size = star.size * (1 + (star.bright ? star.near * 0.35 : 0));
      pen.fillStyle = star.tint;
      if (star.bright) {
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

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const box = canvas.getBoundingClientRect();
    mouse.x = event.clientX - box.left;
    mouse.y = event.clientY - box.top;
    mouse.here = true;
  };
  const onLeave = () => {
    mouse.here = false;
  };

  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(page);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    canvas.remove();
  };
}
