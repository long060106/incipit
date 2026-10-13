/*
  The sky behind the globe (GlobePage.tsx), in two depths.

  Far off, a great many faint stars, with a band of them thicker than the rest crossing the
  page like the Milky Way. That whole depth turns very slowly about a point far off the page.

  Nearer, the bright stars. Each goes its own way across the page, slowly, changing course a
  little as it goes, and every one is joined by a thin line to each other bright star near
  it; the lines come and go as the stars pass one another. The ones near the cursor brighten
  and lean a little towards it, and their lines brighten with them.

  It is one canvas behind everything on the page. Movement is measured in time, not in
  frames, so that it is as even on a fast screen as on a slow one.
*/

const TURN = (Math.PI * 2) / (150 * 60 * 1000); // the far depth: once round in two and a half hours
const SKY_TO_A_STAR = 1_500; // px² of sky for each faint star outside the band
const SKY_TO_A_BRIGHT = 5_200; // px² of sky for each bright one
const MOST_BRIGHT = 320;
const TINTS = ['#c9d8ff', '#dfe8ff', '#f4f6ff', '#ffffff', '#ffffff', '#fff6e4', '#ffe9c4', '#ffd6a8'];
const REACH = 200; // px from the cursor within which the stars answer it
const LINK = 132; // px: the longest line drawn between two stars
const FRAME = 1000 / 60;

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

/** A bright star: it goes where it will. */
interface Free {
  /** Where it would be if the cursor were not there, and which way it is going. */
  homeX: number;
  homeY: number;
  heading: number;
  speed: number; // px a second
  /** How its course wanders: how fast, and from where in the cycle. */
  wander: number;
  size: number;
  light: number;
  pace: number;
  phase: number;
  tint: string;
  /** Where it is on the screen, and how far the cursor has drawn it from its course. */
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
const tint = () => TINTS[Math.floor(Math.random() * TINTS.length)];

export function installSky(page: HTMLElement): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'globe-sky';
  canvas.setAttribute('aria-hidden', 'true');
  page.prepend(canvas);
  const pen = canvas.getContext('2d');
  const haze = document.createElement('canvas');

  let faint: Far[] = [];
  let bright: Free[] = [];
  let width = 0;
  let height = 0;
  let pole = { x: 0, y: 0 };
  let band = { far: 0, wide: 0 };
  const mouse = { x: 0, y: 0, here: false };

  const makeFar = (far: number): Far => {
    // Most are the faintest of points; a brighter one is many times as rare.
    const size = 0.28 + Math.random() ** 6 * 0.6;
    return {
      far,
      at: Math.random() * Math.PI * 2,
      size,
      light: 0.16 + ((size - 0.28) / 0.6) * 0.42 + Math.random() * 0.14,
      pace: 0.0005 + Math.random() * 0.0014,
      phase: Math.random() * Math.PI * 2,
      tint: tint(),
    };
  };

  const makeFree = (): Free => ({
    homeX: -LINK + Math.random() * (width + LINK * 2),
    homeY: -LINK + Math.random() * (height + LINK * 2),
    heading: Math.random() * Math.PI * 2,
    speed: 5 + Math.random() * 11,
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
  });

  const measure = () => {
    const box = page.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    // The far depth turns about a point below and to the left of the page, so its stars cross on a slant.
    pole = { x: -width * 0.25, y: height * 2.1 };
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - pole.x, y - pole.y))) + 40;
    const inner = Math.max(0, Math.hypot(Math.max(0, -pole.x), pole.y - height) - 40);
    const wanted = Math.min(13000, Math.round((Math.PI * (reach * reach - inner * inner)) / SKY_TO_A_STAR));
    faint = Array.from({ length: wanted }, () => makeFar(Math.sqrt(inner * inner + Math.random() * (reach * reach - inner * inner))));
    // The band: a ring of the same sky, through the middle of the page, sown thicker.
    band = { far: Math.hypot(width * 0.5 - pole.x, height * 0.45 - pole.y), wide: Math.min(width, height) * 0.11 };
    const more = Math.min(9000, Math.round((Math.PI * 2 * band.far * band.wide * 2.4) / (SKY_TO_A_STAR / 3)));
    for (let n = 0; n < more; n++) faint.push(makeFar(band.far + bell() * band.wide * 1.6));

    bright = Array.from({ length: Math.min(MOST_BRIGHT, Math.round(((width + LINK * 2) * (height + LINK * 2)) / SKY_TO_A_BRIGHT)) }, makeFree);

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

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!pen || document.hidden) {
      before = now;
      return;
    }
    // How many sixtieths of a second have gone by: the same movement on any screen.
    const elapsed = Math.min(now - before, 70);
    const k = elapsed / FRAME;
    before = now;
    const ease = 1 - Math.pow(0.92, k);
    const keep = Math.pow(0.8, k);
    const answering = mouse.here && !still;
    pen.clearRect(0, 0, width, height);
    pen.drawImage(haze, 0, 0, width, height);

    // The far depth.
    const turned = still ? 0 : now * TURN;
    for (const star of faint) {
      const angle = star.at + turned;
      const x = pole.x + Math.cos(angle) * star.far;
      if (x < -4 || x > width + 4) continue;
      const y = pole.y + Math.sin(angle) * star.far;
      if (y < -4 || y > height + 4) continue;
      const twinkle = still ? 1 : 1 - 0.12 * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      pen.globalAlpha = star.light * twinkle;
      pen.fillStyle = star.tint;
      // A point this small is a square to the eye as much as a circle, and far quicker to lay down.
      const side = star.size * 1.8;
      pen.fillRect(x - side / 2, y - side / 2, side, side);
    }

    // The bright stars go their ways.
    const spanX = width + LINK * 2;
    const spanY = height + LINK * 2;
    for (const star of bright) {
      if (!still) {
        star.heading += Math.sin(now * star.wander + star.phase) * 0.0035 * k;
        star.homeX += (Math.cos(star.heading) * star.speed * elapsed) / 1000;
        star.homeY += (Math.sin(star.heading) * star.speed * elapsed) / 1000;
        // Off one edge, on at the other, out of sight both times.
        if (star.homeX < -LINK) star.homeX += spanX;
        else if (star.homeX > width + LINK) star.homeX -= spanX;
        if (star.homeY < -LINK) star.homeY += spanY;
        else if (star.homeY > height + LINK) star.homeY -= spanY;
      }
      let near = 0;
      if (answering) {
        const toX = mouse.x - (star.homeX + star.dx);
        const toY = mouse.y - (star.homeY + star.dy);
        const distance = Math.hypot(toX, toY);
        if (distance < REACH) {
          near = 1 - distance / REACH;
          // It leans towards the cursor: a few pixels, never onto it.
          if (distance > 1) {
            star.vx += (toX / distance) * near * 0.12 * k;
            star.vy += (toY / distance) * near * 0.12 * k;
          }
        }
      }
      star.vx = (star.vx - star.dx * 0.02 * k) * keep;
      star.vy = (star.vy - star.dy * 0.02 * k) * keep;
      star.dx += star.vx * k;
      star.dy += star.vy * k;
      star.near += (near - star.near) * ease;
      star.x = star.homeX + star.dx;
      star.y = star.homeY + star.dy;
    }

    // A line from every bright star to each one near it: faint, fainter the further apart,
    // and clearer about the cursor.
    pen.lineWidth = 0.7;
    pen.strokeStyle = '#e6dcc0';
    for (let a = 0; a < bright.length; a++) {
      const one = bright[a];
      for (let b = a + 1; b < bright.length; b++) {
        const other = bright[b];
        const x = one.x - other.x;
        if (x > LINK || x < -LINK) continue;
        const y = one.y - other.y;
        if (y > LINK || y < -LINK) continue;
        const distance = Math.hypot(x, y);
        if (distance > LINK) continue;
        const close = 1 - distance / LINK;
        pen.globalAlpha = close * (0.13 + 0.5 * Math.max(one.near, other.near));
        pen.beginPath();
        pen.moveTo(one.x, one.y);
        pen.lineTo(other.x, other.y);
        pen.stroke();
      }
    }

    for (const star of bright) {
      const twinkle = still ? 1 : 1 - 0.3 * (0.5 - 0.5 * Math.sin(now * star.pace + star.phase));
      const light = Math.min(1, star.light * twinkle + star.near * 0.45);
      const size = star.size * (1 + star.near * 0.35);
      pen.fillStyle = star.tint;
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
