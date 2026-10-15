/*
  Behind the About page: the first lines of the books, the incipits the site is named after,
  rising slowly up the page in three depths, as if many books lay open one under another.
  They are barely there until a lamp passes over them: the cursor carries it, and where
  there is no cursor (a phone) it wanders by itself. Under the lamp the lines warm to the
  colour of brass.

  The nearer a depth, the larger its letters, the faster it rises, and the more it moves as
  the page is scrolled.
*/

interface Depth {
  size: number;
  italic: boolean;
  light: number; // how clear its lines are away from the lamp
  speed: number; // px a second
  gap: number; // px between two lines
  scroll: number; // how much of the page's scroll it follows
}

const DEPTHS: Depth[] = [
  { size: 12, italic: false, light: 0.032, speed: 5, gap: 64, scroll: 0.06 },
  { size: 16, italic: false, light: 0.042, speed: 8.5, gap: 108, scroll: 0.14 },
  { size: 22, italic: true, light: 0.05, speed: 13, gap: 190, scroll: 0.26 },
];
const LAMP = 250; // px: the lamp's reach
const CLEAR = 72; // px at the top, under the bar of links, where the lines fade out

interface Line {
  depth: number;
  text: string;
  x: number;
  y: number;
  width: number;
}

export function installIncipits(page: HTMLElement, scroller: HTMLElement, lines: string[]): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'page-backdrop incipits';
  canvas.setAttribute('aria-hidden', 'true');
  page.prepend(canvas);
  const pen = canvas.getContext('2d');
  // The lit lines are drawn here, then cut to the round of the lamp.
  const lit = document.createElement('canvas');
  const litPen = lit.getContext('2d');

  let width = 0;
  let height = 0;
  let ratio = 1;
  let shown: Line[] = [];
  const mouse = { x: 0, y: 0, here: false };
  const lamp = { x: 0, y: 0, glow: 0 };
  let colours = { text: '#ece8df', gilt: '#c9a45c' };
  let family = 'Georgia, serif';
  let next = Math.floor(Math.random() * lines.length);

  const readStyle = () => {
    const style = getComputedStyle(document.documentElement);
    colours = { text: style.getPropertyValue('--text').trim() || colours.text, gilt: style.getPropertyValue('--accent').trim() || colours.gilt };
    family = style.getPropertyValue('--font-read').trim() || family;
  };
  const font = (depth: Depth) => `${depth.italic ? 'italic ' : ''}${depth.size}px ${family}`;

  /** A line for a depth, starting at a height: the next incipit, set somewhere along the page. */
  const place = (line: Line, y: number) => {
    const depth = DEPTHS[line.depth];
    line.text = lines[next++ % lines.length];
    line.y = y;
    if (pen) {
      pen.font = font(depth);
      line.width = pen.measureText(line.text).width;
    }
    // Most begin in the left part of the page and run off its right edge, as lines of a page seen close to.
    line.x = -line.width * 0.3 + Math.random() * Math.max(40, width * 0.75);
  };

  /** The height a depth's lines go round in: off the top, on again at the bottom. */
  const span = (depth: Depth) => height + depth.size * 2 + depth.gap;

  const measure = () => {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    for (const target of [canvas, lit]) {
      target.width = Math.round(width * ratio);
      target.height = Math.round(height * ratio);
    }
    pen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    litPen?.setTransform(ratio, 0, 0, ratio, 0, 0);
    shown = [];
    DEPTHS.forEach((depth, at) => {
      for (let y = -depth.size; y < span(depth) - depth.size; y += depth.gap * (0.75 + Math.random() * 0.5)) {
        const line = { depth: at, text: '', x: 0, y: 0, width: 0 };
        place(line, y);
        shown.push(line);
      }
    });
  };


  const draw = (now: number, elapsed: number) => {
    if (!pen || !litPen) return;
    const scrolled = scroller.scrollTop;
    // The lamp: with the cursor, or wandering slowly when there is none.
    const wanderX = width * (0.5 + 0.38 * Math.sin(now / 23_000));
    const wanderY = height * (0.5 + 0.32 * Math.sin(now / 17_000 + 1.3));
    const toX = mouse.here ? mouse.x : wanderX;
    const toY = mouse.here ? mouse.y : wanderY;
    const ease = 1 - Math.pow(0.9, elapsed / 16.7);
    lamp.x += (toX - lamp.x) * ease;
    lamp.y += (toY - lamp.y) * ease;
    lamp.glow += ((mouse.here ? 1 : 0.7) - lamp.glow) * ease * 0.5;

    pen.clearRect(0, 0, width, height);
    litPen.clearRect(0, 0, width, height);
    pen.textBaseline = 'middle';
    litPen.textBaseline = 'middle';
    pen.fillStyle = colours.text;
    litPen.fillStyle = colours.gilt;

    DEPTHS.forEach((depth, at) => {
      pen.font = font(depth);
      litPen.font = font(depth);
      const lift = scrolled * depth.scroll;
      const whole = span(depth);
      for (const line of shown) {
        if (line.depth !== at) continue;
        if (!still) line.y -= (depth.speed * elapsed) / 1000;
        let y = line.y - lift;
        // Gone off the top (or the bottom, scrolling back): round again, with another line.
        const rounds = Math.floor((y + depth.size) / whole);
        if (rounds !== 0) {
          place(line, line.y - rounds * whole);
          y = line.y - lift;
        }
        if (y < -depth.size || y > height + depth.size) continue;
        // Gone by the time they reach the bar of links.
        const under = Math.min(1, Math.max(0, (y - CLEAR) / 110));
        if (under <= 0) continue;
        pen.globalAlpha = depth.light * under;
        pen.fillText(line.text, line.x, y);
        // Under the lamp, the same line again, in brass.
        if (Math.abs(y - lamp.y) < LAMP && line.x < lamp.x + LAMP && line.x + line.width > lamp.x - LAMP) {
          litPen.globalAlpha = Math.min(1, 0.45 + at * 0.15) * under;
          litPen.fillText(line.text, line.x, y);
        }
      }
    });

    // Cut the lit lines to the lamp's round, soft at its edge, and lay them over the rest.
    const glow = litPen.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, LAMP);
    glow.addColorStop(0, `rgba(0,0,0,${0.95 * lamp.glow})`);
    glow.addColorStop(0.45, `rgba(0,0,0,${0.45 * lamp.glow})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    litPen.globalCompositeOperation = 'destination-in';
    litPen.globalAlpha = 1;
    litPen.fillStyle = glow;
    litPen.fillRect(lamp.x - LAMP, lamp.y - LAMP, LAMP * 2, LAMP * 2);
    litPen.globalCompositeOperation = 'source-over';
    // Only the lamp's square holds anything; the rest of the lit page is cleared.
    litPen.clearRect(0, 0, width, Math.max(0, lamp.y - LAMP));
    litPen.clearRect(0, lamp.y + LAMP, width, height);
    litPen.clearRect(0, 0, Math.max(0, lamp.x - LAMP), height);
    litPen.clearRect(lamp.x + LAMP, 0, width, height);
    pen.globalAlpha = 1;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.drawImage(lit, 0, 0);
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  let before = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min(now - before, 70);
    before = now;
    if (!document.hidden) draw(now, elapsed);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (!mouse.here && lamp.glow === 0) {
      lamp.x = mouse.x;
      lamp.y = mouse.y;
    }
    mouse.here = true;
  };
  const onLeave = () => {
    mouse.here = false;
  };

  readStyle();
  measure();
  lamp.x = width * 0.5;
  lamp.y = height * 0.5;
  const themes = new MutationObserver(readStyle);
  themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', measure);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  // The letters' widths are known only once the typeface has come.
  void document.fonts?.ready.then(() => {
    readStyle();
    measure();
  });
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    themes.disconnect();
    window.removeEventListener('resize', measure);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    canvas.remove();
  };
}
