/*
  Behind the sign-in page: threads of gilt drifting on a slow current, like the silk marker of
  a book let go in water. Each thread is a point that the current carries, with the way it
  came drawn behind it, fainter the further back. The current itself changes, very slowly,
  so the threads never settle into one pattern.

  Near the cursor the threads turn about it. A press anywhere sends a ring out from that
  point and the threads near it drift away from it for a moment, as a press on a button does.

  One canvas behind everything on the page. Movement is measured in time, not in frames.
*/

const TAIL = 34; // points kept behind each thread
const STEP = 95; // milliseconds between two of them
const SKY_PER_THREAD = 6_800; // px² of page for each thread
const MOST = 230;
const REACH = 190; // px from the cursor within which the threads turn about it
const PUSH = 280; // px from a press within which they are pushed away

interface Thread {
  x: number;
  y: number;
  tail: number[]; // x, y, x, y… the oldest first
  since: number; // ms since the last point was kept
  age: number;
  life: number;
  speed: number; // px a second
  width: number;
  gilt: boolean; // the accent, or the colour of the text
  kx: number; // the push of a press, in px a second, dying away
  ky: number;
}

interface Ring {
  x: number;
  y: number;
  born: number;
}

export function installThreads(page: HTMLElement): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'page-backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  page.prepend(canvas);
  const pen = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let threads: Thread[] = [];
  const rings: Ring[] = [];
  const mouse = { x: 0, y: 0, here: false };
  let colours = { gilt: '#c9a45c', text: '#ece8df', night: true };

  const readColours = () => {
    const style = getComputedStyle(document.documentElement);
    colours = {
      gilt: style.getPropertyValue('--accent').trim() || colours.gilt,
      text: style.getPropertyValue('--text').trim() || colours.text,
      night: document.documentElement.dataset.theme !== 'day',
    };
  };

  const born = (thread?: Thread): Thread => {
    const next: Thread = thread ?? ({} as Thread);
    next.x = Math.random() * width;
    next.y = Math.random() * height;
    next.tail = [];
    next.since = 0;
    next.age = 0;
    next.life = 9_000 + Math.random() * 11_000;
    next.speed = 11 + Math.random() * 15;
    next.width = 0.55 + Math.random() ** 2 * 0.95;
    next.gilt = Math.random() < 0.78;
    next.kx = 0;
    next.ky = 0;
    return next;
  };

  const measure = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    const wanted = Math.min(MOST, Math.max(50, Math.round((width * height) / SKY_PER_THREAD)));
    while (threads.length < wanted) {
      const thread = born();
      // Not all born at once, so they do not all fade together.
      thread.age = Math.random() * thread.life;
      threads.push(thread);
    }
    threads = threads.slice(0, wanted);
  };

  /** Which way the current runs at a point and a time: three slow waves laid over one another. */
  const current = (x: number, y: number, t: number) =>
    (Math.sin(x * 0.0017 + t * 0.000045) + Math.sin(y * 0.0023 - t * 0.000037) * 0.9 + Math.sin((x - y) * 0.0011 + t * 0.000028) * 0.7) * 1.25 - 0.6;

  const move = (thread: Thread, elapsed: number, now: number) => {
    const seconds = elapsed / 1000;
    const angle = current(thread.x, thread.y, now);
    let vx = Math.cos(angle) * thread.speed;
    let vy = Math.sin(angle) * thread.speed;
    if (mouse.here) {
      const dx = thread.x - mouse.x;
      const dy = thread.y - mouse.y;
      const distance = Math.hypot(dx, dy);
      if (distance < REACH && distance > 1) {
        const near = (1 - distance / REACH) ** 2;
        // Round the cursor, and a little away from it.
        vx += (-dy / distance) * near * 70 + (dx / distance) * near * 22;
        vy += (dx / distance) * near * 70 + (dy / distance) * near * 22;
      }
    }
    const fade = Math.pow(0.18, seconds);
    thread.kx *= fade;
    thread.ky *= fade;
    thread.x += (vx + thread.kx) * seconds;
    thread.y += (vy + thread.ky) * seconds;
    thread.age += elapsed;
    thread.since += elapsed;
    if (thread.since >= STEP) {
      thread.since = 0;
      thread.tail.push(thread.x, thread.y);
      if (thread.tail.length > TAIL * 2) thread.tail.splice(0, 2);
    }
    const gone = thread.x < -60 || thread.x > width + 60 || thread.y < -60 || thread.y > height + 60;
    if (thread.age > thread.life || gone) born(thread);
  };

  const draw = (now: number) => {
    if (!pen) return;
    pen.clearRect(0, 0, width, height);
    const strength = colours.night ? 0.62 : 0.5;
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    for (const thread of threads) {
      const points = thread.tail.length / 2;
      if (points < 2) continue;
      // In over a second and a half, out over the last two.
      const life = Math.min(1, thread.age / 1500, (thread.life - thread.age) / 2000);
      if (life <= 0) continue;
      pen.strokeStyle = thread.gilt ? colours.gilt : colours.text;
      pen.lineWidth = thread.width;
      // The tail in three lengths, each clearer than the one behind it.
      const third = Math.ceil(points / 3);
      for (let part = 0; part < 3; part++) {
        const from = part * third;
        const to = Math.min(points - 1, (part + 1) * third);
        if (to <= from) continue;
        pen.globalAlpha = life * strength * (thread.gilt ? 1 : 0.45) * [0.16, 0.42, 0.85][part];
        pen.beginPath();
        pen.moveTo(thread.tail[from * 2], thread.tail[from * 2 + 1]);
        for (let at = from + 1; at <= to; at++) pen.lineTo(thread.tail[at * 2], thread.tail[at * 2 + 1]);
        if (part === 2) pen.lineTo(thread.x, thread.y);
        pen.stroke();
      }
      // Its head, a grain of light.
      pen.globalAlpha = life * strength * (thread.gilt ? 0.9 : 0.4);
      pen.fillStyle = thread.gilt ? colours.gilt : colours.text;
      pen.beginPath();
      pen.arc(thread.x, thread.y, thread.width * 1.15, 0, Math.PI * 2);
      pen.fill();
    }
    // The rings sent out by presses.
    for (let at = rings.length - 1; at >= 0; at--) {
      const ring = rings[at];
      const t = (now - ring.born) / 1600;
      if (t >= 1) {
        rings.splice(at, 1);
        continue;
      }
      const eased = 1 - (1 - t) ** 3;
      pen.globalAlpha = (1 - t) * 0.32 * strength;
      pen.strokeStyle = colours.gilt;
      pen.lineWidth = 1;
      pen.beginPath();
      pen.arc(ring.x, ring.y, 12 + eased * PUSH, 0, Math.PI * 2);
      pen.stroke();
    }
    pen.globalAlpha = 1;
  };

  let before = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min(now - before, 70);
    before = now;
    if (document.hidden) return;
    for (const thread of threads) move(thread, elapsed, now);
    draw(now);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.here = true;
  };
  const onLeave = () => {
    mouse.here = false;
  };
  const onPress = (event: PointerEvent) => {
    if (still) return;
    rings.push({ x: event.clientX, y: event.clientY, born: performance.now() });
    if (rings.length > 6) rings.shift();
    for (const thread of threads) {
      const dx = thread.x - event.clientX;
      const dy = thread.y - event.clientY;
      const distance = Math.hypot(dx, dy);
      if (distance > PUSH || distance < 1) continue;
      const push = (1 - distance / PUSH) * 150;
      thread.kx += (dx / distance) * push;
      thread.ky += (dy / distance) * push;
    }
  };

  readColours();
  measure();
  const themes = new MutationObserver(() => {
    readColours();
    if (still) draw(performance.now());
  });
  themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', measure);

  if (still) {
    // Without movement: the threads as they would be after a while, laid down once.
    const t = performance.now();
    for (let step = 0; step < 200; step++) for (const thread of threads) move(thread, 60, t + step * 60);
    draw(t);
    const redraw = () => draw(performance.now());
    window.addEventListener('resize', redraw);
    return () => {
      themes.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('resize', redraw);
      canvas.remove();
    };
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onPress, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    themes.disconnect();
    window.removeEventListener('resize', measure);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onPress);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    canvas.remove();
  };
}
