/** How quickly the light closes on where it is headed, per frame. */
const EASE = 0.05;

/** Position of `el` inside `ancestor`, ignoring transforms. `ancestor` must be positioned. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement | null) {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

/**
 * The light on the opening page.
 *
 * One eased point stands for where the light is. It follows the mouse; with no mouse (a
 * phone, or the cursor outside the window) it wanders slowly on its own. Two things read it:
 * the glow behind the covers leans towards it, and the gradient that fills the letters of
 * the name is centred on it, so the letters nearest the light are the brightest.
 *
 * It has no frame loop of its own: the page's loop calls `step`.
 */
export class Light {
  private readonly field: HTMLElement | null;
  private readonly glyphs: HTMLElement[];
  private readonly observer: ResizeObserver;

  private mouse: { x: number; y: number } | null = null;
  private x = window.innerWidth / 2;
  private y = window.innerHeight * 0.44;
  /** Top-left corner of the word in the viewport, before it leans. */
  private wordX = 0;
  private wordY = 0;
  private applied = '';
  private presence = -1;

  constructor(
    private readonly glow: HTMLElement,
    private readonly word: HTMLElement,
  ) {
    this.field = glow.firstElementChild as HTMLElement | null;
    this.glyphs = [...word.querySelectorAll<HTMLElement>('.hero-glyph')];

    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('resize', this.measure);
    document.documentElement.addEventListener('pointerleave', this.onLeave);
    // The word changes size when its face loads, and moves when the text under it reflows.
    this.observer = new ResizeObserver(this.measure);
    this.observer.observe(word);
    if (word.parentElement) this.observer.observe(word.parentElement);
    this.measure();
  }

  destroy() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('resize', this.measure);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    this.observer.disconnect();
  }

  /**
   * Advances the light by one frame. `hero` and `glow` say how present the name and the
   * glow are, 0 to 1; with both gone, nothing is computed.
   */
  step(now: number, hero: number, glow: number) {
    if (glow !== this.presence) {
      this.presence = glow;
      this.glow.style.opacity = glow.toFixed(3);
      this.glow.hidden = glow < 0.004;
    }
    if (glow < 0.004 && hero < 0.004) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const toX = this.mouse ? this.mouse.x : width * (0.5 + Math.sin(now / 5200) * 0.2);
    const toY = this.mouse ? this.mouse.y : height * (0.44 + Math.cos(now / 7400) * 0.07);
    this.x += (toX - this.x) * EASE;
    this.y += (toY - this.y) * EASE;

    // Whole pixels are fine enough, and a light at rest then costs nothing.
    const key = `${Math.round(this.x)},${Math.round(this.y)}`;
    if (key === this.applied) return;
    this.applied = key;

    const nx = (this.x / width) * 2 - 1;
    const ny = (this.y / height) * 2 - 1;
    const { style } = this.word;
    style.setProperty('--lx', `${Math.round(this.x - this.wordX)}px`);
    style.setProperty('--ly', `${Math.round(this.y - this.wordY)}px`);
    style.setProperty('--lean-x', nx.toFixed(3));
    style.setProperty('--lean-y', ny.toFixed(3));
    if (this.field) {
      this.field.style.transform = `translate3d(${(nx * width * 0.11).toFixed(1)}px, ${(ny * height * 0.09).toFixed(1)}px, 0)`;
    }
  }

  private measure = () => {
    const place = offsetWithin(this.word, null);
    this.wordX = place.x;
    this.wordY = place.y;
    // Each letter paints its own piece of the one gradient, so it needs to know where it sits.
    for (const glyph of this.glyphs) {
      const at = offsetWithin(glyph, this.word);
      glyph.style.setProperty('--ox', `${at.x}px`);
      glyph.style.setProperty('--oy', `${at.y}px`);
    }
    this.applied = '';
  };

  private onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (this.mouse) {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    } else {
      this.mouse = { x: event.clientX, y: event.clientY };
    }
  };

  private onLeave = () => {
    this.mouse = null;
  };
}
