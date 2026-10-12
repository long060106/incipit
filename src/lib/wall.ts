import type { Book } from '../data/types';
import { COVER_WIDTHS, coverUrl, type CoverSize } from './links';

/** How a cover is shown: resting grey, lit (it fits the filters) or dimmed (it doesn't). */
export type CellState = 'rest' | 'lit' | 'dim';

/** Where a cover sat on screen when it was opened, so the book sheet can fly it into place. */
export interface CoverOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  src: string;
  /** Natural width ÷ height of the image. */
  ratio: number;
}

export interface WallCallbacks {
  onOpen: (bookId: string, origin: CoverOrigin | null) => void;
  /**
   * A drag moved vertically while the wall could not take it (it is at its top edge, or the
   * intro is still on screen). The page scrolls by `dy` instead, so the wall and the intro
   * read as one continuous surface.
   */
  onPageScroll: (dy: number) => void;
}

interface Cell {
  el: HTMLDivElement;
  key: string;
  bookId: string;
  col: number;
  row: number;
  /** Centre of the cell in wall coordinates. */
  cx: number;
  cy: number;
  /** Last values written to the element, to skip redundant style writes. */
  near: number;
  z: string;
}

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  time: number;
  vx: number;
  vy: number;
  moved: boolean;
  /** True during the intro: the press can open a cover but never pans the wall. */
  tapOnly: boolean;
  target: HTMLElement | null;
}

const DRAG_THRESHOLD = 6;
/**
 * In the scattered intro layout, cells sit this much further from the centre (1 = twice as
 * far), which also sets how many are left in view.
 */
const SPREAD = 0.62;
/** Idle sideways drift, in px per frame at 60fps. */
const DRIFT = 0.12;
/** A scattered cover starts to wake when the cursor comes within this many px. */
const WAKE_RADIUS = 280;
/**
 * How far, in px, a scattered cover slides when the cursor is at the edge of the screen: the
 * furthest covers move by the first amount, the nearest by both together.
 */
const PARALLAX_FAR = 10;
const PARALLAX_NEAR = 96;

/**
 * The name on the opening page as the stylesheets set it (--hero-size and --font-hero in
 * tokens.css, and the narrow-screen rule in stage.css): its type size as a share of the
 * page's width and height, its least and most in px, and how wide the word is in type sizes.
 */
const NAME = { wide: [0.17, 0.29], narrow: 0.2, least: 60, most: 400, width: 3.84 } as const;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** How much of a figure's height lies above and below its fingertip: Adam, then God. */
const ADAM_BAND = [0.28, 0.3] as const;
const GOD_BAND = [0.56, 0.32] as const;

/** Drawn once per visit, so every visit scatters the covers differently. */
const SEED = Math.random() * 1000;

/** Stable 0–1 noise per cell, so the scattered layout is the same on every frame of a visit. */
function noise(col: number, row: number, salt: number) {
  const s = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7 + SEED) * 43758.5453;
  return s - Math.floor(s);
}

/** Reads where a cover is on screen. `container` holds the cover image. */
export function coverOrigin(container: Element | null): CoverOrigin | null {
  const img = container?.querySelector('img') ?? (container instanceof HTMLImageElement ? container : null);
  if (!container || !img || !img.naturalWidth) return null;
  const rect = container.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    src: img.currentSrc || img.src,
    ratio: img.naturalWidth / img.naturalHeight,
  };
}

/**
 * The cover wall: an endless, draggable grid of book covers.
 *
 * It manages its own DOM instead of going through React because it repositions around a
 * hundred elements per frame while panning or assembling. Only the cells near the viewport
 * exist; they are created and removed as the camera moves.
 *
 * During the intro the covers are scattered and float at different depths: the nearer a
 * cover, the further it slides against the cursor. They wake into colour as the cursor
 * nears. Which book hangs where is shuffled on every visit.
 */
export class Wall {
  private readonly plane = document.createElement('div');
  private readonly glow = document.createElement('div');
  private readonly label = document.createElement('div');
  private readonly labelTitle = document.createElement('span');
  private readonly labelAuthor = document.createElement('span');
  private readonly cells = new Map<string, Cell>();
  private readonly books: Book[];
  private readonly booksById: Map<string, Book>;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Column offset between rows, chosen so repeats of a book land far apart. */
  private readonly rowShift: number;

  private width = 0;
  private height = 0;
  private cellW = 0;
  private cellH = 0;
  private pitchX = 1;
  private pitchY = 1;
  private coverSize: CoverSize = 'sm';
  /** 1 at the usual distance; smaller when the reader stands back to see more covers. */
  private zoom = 1;

  /** Camera: the wall coordinate shown at the centre of the viewport. */
  private camX = 0;
  private camY = 0;
  private targetX = 0;
  private targetY = 0;

  /** 0 = covers scattered for the intro, 1 = hung in the grid. */
  private assemble = 1;
  private scattered = false;
  private states: Map<string, CellState> | null = null;
  private interactive = false;
  private paused = false;
  /**
   * How far the scattered covers have stood back from the middle of the page, 0 to 1. At 0
   * they drift right across it; at 1 they leave the text and the hands clear.
   */
  private clearing = 1;
  private clearingTo = 1;
  private pointerInside = false;
  private drag: Drag | null = null;
  private dirty = true;
  private frame = 0;
  private lastTime = 0;

  /** Mouse position in viewport px, or null when there is no mouse over the page. */
  private pointer: { x: number; y: number } | null = null;
  /** Eased pointer offset from the centre, -1 to 1 on each axis, for parallax. */
  private parallaxX = 0;
  private parallaxY = 0;

  /**
   * The lamp the reader carries along the hung wall: where it is, and how far it is turned
   * up (0 to 1). It trails the cursor, and the covers within its reach come back into colour.
   */
  private lamp = { x: 0, y: 0, lit: 0, shown: false };

  private hoverId: string | null = null;
  private labelX = 0;
  private labelY = 0;
  private labelToX = 0;
  private labelToY = 0;

  constructor(
    private readonly root: HTMLElement,
    books: Book[],
    private readonly callbacks: WallCallbacks,
  ) {
    // A different hanging on every visit.
    this.books = [...books];
    for (let i = this.books.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.books[i], this.books[j]] = [this.books[j], this.books[i]];
    }
    this.booksById = new Map(books.map((book) => [book.id, book]));
    this.rowShift = Math.max(1, Math.round(books.length * 0.4));

    this.glow.className = 'wall-lamp';
    root.append(this.glow);
    this.plane.className = 'wall-plane';
    this.label.className = 'wall-label';
    this.labelTitle.className = 'wall-label-title';
    this.labelAuthor.className = 'wall-label-author';
    this.label.append(this.labelTitle, this.labelAuthor);
    root.append(this.plane, this.label);

    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerUp);
    root.addEventListener('pointerenter', this.onPointerEnter);
    root.addEventListener('pointerleave', this.onPointerLeave);
    // The intro text sits above the wall, so the cursor is tracked on the window instead.
    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onWindowPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(root);
    this.measure();
    this.frame = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const { root } = this;
    root.removeEventListener('pointerdown', this.onPointerDown);
    root.removeEventListener('pointermove', this.onPointerMove);
    root.removeEventListener('pointerup', this.onPointerUp);
    root.removeEventListener('pointercancel', this.onPointerUp);
    root.removeEventListener('pointerenter', this.onPointerEnter);
    root.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    document.documentElement.removeEventListener('pointerleave', this.onWindowPointerLeave);
    root.classList.remove('is-interactive', 'is-dragging');
    this.plane.remove();
    this.glow.remove();
    this.label.remove();
    this.cells.clear();
  }

  /** Lights the given books and dims the rest; `null` returns every cover to rest. */
  setStates(states: Map<string, CellState> | null) {
    this.states = states;
    for (const cell of this.cells.values()) this.applyState(cell, true);
  }

  setAssemble(value: number) {
    const next = this.reducedMotion ? 1 : clamp(value, 0, 1);
    if (next === this.assemble) return;
    this.assemble = next;
    this.dirty = true;
  }

  setInteractive(value: boolean) {
    this.interactive = value;
    // Mid-drag the class stays as it is, so the gesture in progress is not cut off.
    if (!this.drag) this.root.classList.toggle('is-interactive', value);
  }

  /**
   * Stands the reader back from the wall (below 1) or returns them to it (1): the covers are
   * hung again at that size, around the same spot.
   */
  setZoom(value: number) {
    const next = clamp(value, 0.4, 1);
    if (next === this.zoom) return;
    this.root.dataset.zoomed = next < this.zoom ? 'out' : 'in';
    this.zoom = next;
    this.measure();
    window.setTimeout(() => delete this.root.dataset.zoomed, 600);
  }

  /** Stops the idle drift and the hover label, e.g. while a dialog covers the wall. */
  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.hideLabel();
  }

  /**
   * Intro only: lets the covers drift across the middle of the page (0) or sends them back
   * to its edges (1). They ease from one to the other unless `now` is set.
   */
  setClearing(value: number, now = false) {
    this.clearingTo = clamp(value, 0, 1);
    if (now) this.clearing = this.clearingTo;
  }

  /**
   * Feeds a wheel or trackpad scroll to the wall. Returns false when the wall is at its top
   * edge and the scroll points up, so the caller can let the page scroll back to the intro.
   */
  wheel(dx: number, dy: number): boolean {
    this.hideLabel();
    if (dy < 0 && this.targetY <= 0) {
      this.targetX += dx;
      return dx !== 0;
    }
    this.targetX += dx;
    this.targetY = Math.max(0, this.targetY + dy);
    return true;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private measure() {
    // Layout size: the wall is scaled up while the opening window widens.
    const rect = { width: this.root.clientWidth, height: this.root.clientHeight };
    if (!rect.width || !rect.height) return;
    this.width = rect.width;
    this.height = rect.height;

    const cellW = Math.round(clamp(rect.width * 0.105, 104, 172) * this.zoom);
    const gap = Math.round(clamp(rect.width * 0.022, 16, 34) * this.zoom);
    if (cellW !== this.cellW) {
      const scale = this.pitchX > 1 ? (cellW + gap) / this.pitchX : 1;
      this.cellW = cellW;
      this.cellH = Math.round(cellW * 1.5);
      this.pitchX = cellW + gap;
      this.pitchY = this.cellH + Math.round(gap * 1.15);
      this.coverSize = cellW * window.devicePixelRatio > COVER_WIDTHS.sm * 1.15 ? 'md' : 'sm';
      this.root.style.setProperty('--cell-w', `${this.cellW}px`);
      this.root.style.setProperty('--cell-h', `${this.cellH}px`);
      // Keep the same books in view across a resize.
      this.camX *= scale;
      this.camY *= scale;
      this.targetX *= scale;
      this.targetY *= scale;
      for (const cell of this.cells.values()) cell.el.remove();
      this.cells.clear();
    }
    this.dirty = true;
  }

  private bookAt(col: number, row: number): Book {
    return this.books[mod(col + row * this.rowShift, this.books.length)];
  }

  private syncCells() {
    const halfW = this.width / 2 + this.cellW;
    const halfH = this.height / 2 + this.cellH;
    const colMin = Math.floor((this.camX - halfW) / this.pitchX);
    const colMax = Math.ceil((this.camX + halfW) / this.pitchX);
    // Odd columns sit half a row lower, so reach one row further up.
    const rowMin = Math.floor((this.camY - halfH) / this.pitchY) - 1;
    const rowMax = Math.ceil((this.camY + halfH) / this.pitchY);

    for (const [key, cell] of this.cells) {
      if (cell.col < colMin || cell.col > colMax || cell.row < rowMin || cell.row > rowMax) {
        cell.el.remove();
        this.cells.delete(key);
      }
    }
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        const key = `${col},${row}`;
        if (!this.cells.has(key)) this.cells.set(key, this.createCell(key, col, row));
      }
    }
  }

  private createCell(key: string, col: number, row: number): Cell {
    const book = this.bookAt(col, row);
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.id = book.id;

    const cover = document.createElement('div');
    cover.className = 'cell-cover';

    const fallback = document.createElement('div');
    fallback.className = 'cell-fallback';
    const fallbackTitle = document.createElement('span');
    fallbackTitle.textContent = book.title;
    const fallbackAuthor = document.createElement('span');
    fallbackAuthor.textContent = book.author;
    fallback.append(fallbackTitle, fallbackAuthor);

    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.src = coverUrl(book, this.coverSize);

    cover.append(fallback, img);
    el.append(cover);

    const cell: Cell = {
      el,
      key,
      bookId: book.id,
      col,
      row,
      cx: col * this.pitchX,
      cy: row * this.pitchY + (mod(col, 2) ? this.pitchY / 2 : 0),
      near: 0,
      z: '',
    };
    this.placeOnGrid(cell);
    this.applyState(cell, false);
    this.plane.append(el);
    return cell;
  }

  private placeOnGrid(cell: Cell) {
    cell.el.style.transform = `translate3d(${cell.cx - this.cellW / 2}px, ${cell.cy - this.cellH / 2}px, 0)`;
    cell.el.style.opacity = '';
    this.setNear(cell, 0);
    this.setZ(cell, '');
  }

  private setNear(cell: Cell, value: number) {
    if (value === cell.near) return;
    cell.near = value;
    if (value) cell.el.style.setProperty('--near', String(value));
    else cell.el.style.removeProperty('--near');
  }

  private setZ(cell: Cell, value: string) {
    if (value === cell.z) return;
    cell.z = value;
    cell.el.style.zIndex = value;
  }

  /**
   * Intro layout: covers pushed outwards, tilted and adrift, converging as `assemble` rises.
   * While scattered they slide against the cursor by depth and wake as it nears.
   */
  private placeScattered(now: number) {
    const k = 1 - this.assemble;
    this.clearing += (this.clearingTo - this.clearing) * 0.035;
    // How strongly the middle is held clear: fully while scattered, less as the wall forms.
    const hold = k * this.clearing;
    const jitter = Math.min(this.width, this.height) * 0.22;
    // A phone has no room beside the text, so covers stay closer in and frame it above and below.
    const narrow = this.width < 700;
    const spread = narrow ? 0.5 : SPREAD;
    const presence = narrow ? 0.85 : 1;
    // On a phone the covers crowd the text, so they differ less in size.
    const grow = narrow ? 0.5 : 0.8;
    // The size of the name, as the stylesheet sets it (--hero-size in tokens.css).
    const name = narrow ? this.width * NAME.narrow : clamp(Math.min(this.width * NAME.wide[0], this.height * NAME.wide[1]), NAME.least, NAME.most);
    // Half the width of the name is kept clear on either side of the middle.
    const half = (name * NAME.width) / 2;
    const clearX = (narrow ? this.width * 0.3 : half * 1.03) + this.cellW / 2;
    const clearY = this.height * (narrow ? 0.27 : 0.35) + this.cellH / 2;
    // The two figures reach in from the sides: level with the name on a wide screen, above
    // it on a phone. No cover rests behind them: on each side the covers keep above and
    // below the figure there. Where the fingertips sit against the middle of the page is
    // measured from the page; how tall a figure stands follows from the hand rules in
    // stage.css.
    const tipY = narrow ? this.width * -0.52 : name * 0.06 - 66;
    const figure = (narrow ? this.width * 0.5 : this.width * 0.53 - half * 0.871) * 0.974;
    const band = (above: number, below: number) => {
      const top = tipY - (figure * above + this.cellH * 0.6) * this.clearing;
      const bottom = tipY + (figure * below + this.cellH * 0.6) * this.clearing;
      return { mid: (top + bottom) / 2, half: (bottom - top) / 2 };
    };
    const bands = { left: band(...ADAM_BAND), right: band(...GOD_BAND) };
    // The cursor only stirs the covers while they are still loose.
    const stir = Math.min(1, k * 1.6);

    for (const cell of this.cells.values()) {
      const n1 = noise(cell.col, cell.row, 1);
      const n2 = noise(cell.col, cell.row, 2);
      const n3 = noise(cell.col, cell.row, 3);
      const depth = noise(cell.col, cell.row, 4);
      const driftX = Math.sin(now * 0.00035 + n1 * 6.283) * 12;
      const driftY = Math.cos(now * 0.00028 + n2 * 6.283) * 12;
      let offX = (cell.cx - this.camX) * (1 + spread * k) + ((n1 - 0.5) * jitter + driftX) * k;
      let offY = (cell.cy - this.camY) * (1 + spread * k) + ((n2 - 0.5) * jitter + driftY) * k;

      // Hold an oval in the middle clear for the intro text; it closes as the wall assembles.
      const nx = offX / clearX;
      const ny = offY / clearY;
      const reach = Math.hypot(nx, ny);
      if (reach < 0.001) {
        offX = Math.cos(n3 * 6.283) * clearX * hold;
        offY = Math.sin(n3 * 6.283) * clearY * hold;
      } else {
        const push = Math.sqrt(reach * reach + hold * hold) / reach;
        offX *= push;
        offY *= push;
      }

      const { mid, half } = offX < 0 ? bands.left : bands.right;
      if (Math.abs(offY - mid) < half) {
        const edge = mid + (offY >= mid ? half : -half);
        offY += (edge - offY) * stir;
      }

      // Parallax: the far covers barely move, the near (larger) ones slide a long way
      // against the cursor.
      offX -= this.parallaxX * (PARALLAX_FAR + depth * depth * PARALLAX_NEAR) * stir;
      // Less up and down: the text has covers just above and below it.
      offY -= this.parallaxY * (PARALLAX_FAR + depth * depth * PARALLAX_NEAR) * 0.5 * stir;

      const tilt = (n3 - 0.5) * 14 * k;
      let scale = 1 + (depth - 0.45) * grow * k;
      // Depth again: the far covers are faint, the near ones almost solid.
      let opacity = 1 - k * (1 - (0.24 + depth * 0.62) * presence);

      let wake = 0;
      if (this.pointer && !this.paused) {
        const distance = Math.hypot(this.pointer.x - (this.width / 2 + offX), this.pointer.y - (this.height / 2 + offY));
        wake = clamp((WAKE_RADIUS - distance) / (WAKE_RADIUS * 0.62), 0, 1) * stir;
        scale += wake * 0.05;
        opacity += (1 - opacity) * wake;
      }
      // Quantised so the style only changes a few times as the cursor crosses a cover.
      this.setNear(cell, Math.round(wake * 4) / 4);
      this.setZ(cell, wake > 0.5 ? '3' : '');

      cell.el.style.transform =
        `translate3d(${(this.camX + offX - this.cellW / 2).toFixed(1)}px, ${(this.camY + offY - this.cellH / 2).toFixed(1)}px, 0) ` +
        `rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      cell.el.style.opacity = opacity.toFixed(3);
    }
    this.scattered = true;
  }

  private applyState(cell: Cell, ripple: boolean) {
    const state = this.states?.get(cell.bookId) ?? 'rest';
    if (cell.el.dataset.state === state) return;
    // The change spreads outwards from the centre of the view, like a light coming up.
    const distance = Math.hypot(cell.cx - this.camX, cell.cy - this.camY);
    cell.el.style.setProperty('--delay', ripple ? `${Math.min(520, Math.round(distance * 0.45))}ms` : '0ms');
    cell.el.dataset.state = state;
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = this.lastTime ? Math.min(50, now - this.lastTime) : 16.7;
    this.lastTime = now;
    if (!this.width) return;

    this.stepLabel();

    const toX = this.pointer ? clamp((this.pointer.x - this.width / 2) / (this.width / 2), -1, 1) : 0;
    const toY = this.pointer ? clamp((this.pointer.y - this.height / 2) / (this.height / 2), -1, 1) : 0;
    this.parallaxX += (toX - this.parallaxX) * 0.06;
    this.parallaxY += (toY - this.parallaxY) * 0.06;

    const idle = !this.drag && !this.pointerInside && !this.paused && !this.reducedMotion;
    if (idle && this.assemble === 1) this.targetX += DRIFT * (dt / 16.7);

    const ease = this.drag ? 0.4 : 0.12;
    const dx = this.targetX - this.camX;
    const dy = this.targetY - this.camY;
    const moving = Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
    if (moving) {
      this.camX += dx * ease;
      this.camY += dy * ease;
    }

    const lamplit = this.stepLamp(now);
    if (!moving && !this.dirty && this.assemble === 1) {
      if (lamplit) this.shineLamp();
      return;
    }
    this.dirty = false;

    this.plane.style.transform =
      `translate3d(${(this.width / 2 - this.camX).toFixed(2)}px, ${(this.height / 2 - this.camY).toFixed(2)}px, 0)`;
    this.syncCells();

    if (this.assemble < 1) {
      this.placeScattered(now);
    } else if (this.scattered) {
      for (const cell of this.cells.values()) this.placeOnGrid(cell);
      this.scattered = false;
    }
    if (this.assemble === 1) this.shineLamp();
  };

  /**
   * Carries the lamp towards the cursor and turns it up or down. It burns only over the hung
   * wall, with a mouse on the page. Returns true while there is anything for it to light.
   */
  private stepLamp(now: number): boolean {
    const lamp = this.lamp;
    const wanted = this.interactive && this.assemble === 1 && this.pointer && !this.paused ? 1 : 0;
    if (this.pointer && wanted) {
      // The cursor is known by its place in the window; the lamp hangs in the wall's own space.
      const box = this.root.getBoundingClientRect();
      // It is lit where the cursor is, then follows a little behind it.
      const follow = lamp.lit < 0.02 || this.reducedMotion ? 1 : 0.1;
      lamp.x += (this.pointer.x - box.left - lamp.x) * follow;
      lamp.y += (this.pointer.y - box.top - lamp.y) * follow;
    }
    lamp.lit += (wanted - lamp.lit) * 0.05;
    if (Math.abs(wanted - lamp.lit) < 0.004) lamp.lit = wanted;
    if (lamp.lit === 0 && !lamp.shown) return false;

    // A flame is never quite still: it breathes, slowly.
    const breath = this.reducedMotion ? 1 : 0.93 + 0.05 * Math.sin(now / 1900) + 0.02 * Math.sin(now / 730);
    const size = this.lampReach() * 2.5;
    this.glow.style.width = this.glow.style.height = `${size}px`;
    this.glow.style.transform = `translate3d(${(lamp.x - size / 2).toFixed(1)}px, ${(lamp.y - size / 2).toFixed(1)}px, 0)`;
    this.glow.style.opacity = (lamp.lit * breath).toFixed(3);
    return true;
  }

  /** How far from the lamp a cover still catches its light, in px. */
  private lampReach() {
    return clamp(this.width * 0.125, 150, 210);
  }

  /** Brings the covers near the lamp back into colour, more the nearer they hang. */
  private shineLamp() {
    const { x, y, lit, shown } = this.lamp;
    if (lit === 0 && !shown) return;
    const reach = this.lampReach();
    for (const cell of this.cells.values()) {
      const distance = Math.hypot(cell.cx - this.camX + this.width / 2 - x, cell.cy - this.camY + this.height / 2 - y);
      // Gently: the cover under the cursor is woken by the cursor itself, its neighbours only part of the way.
      const near = Math.round(lit * 0.8 * Math.max(0, 1 - distance / reach) ** 1.5 * 10) / 10;
      if (near === cell.near) continue;
      // The light must not wait for the ripple a change of filters left on this cover.
      cell.el.style.setProperty('--delay', '0ms');
      this.setNear(cell, near);
    }
    this.lamp.shown = lit > 0;
  }

  // ── Pointer ───────────────────────────────────────────────────────────────

  private onWindowPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (this.pointer) {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    } else {
      this.pointer = { x: event.clientX, y: event.clientY };
    }
  };

  private onWindowPointerLeave = () => {
    this.pointer = null;
  };

  private onPointerDown = (event: PointerEvent) => {
    if (this.paused || event.button !== 0) return;
    this.pointerInside = true;
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      time: event.timeStamp,
      vx: 0,
      vy: 0,
      moved: false,
      tapOnly: !this.interactive,
      target: (event.target as Element).closest<HTMLElement>('.cell'),
    };
  };

  private onPointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      if (event.pointerType === 'mouse') this.showLabel(event);
      return;
    }

    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      if (drag.tapOnly) return;
      this.root.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
      this.hideLabel();
    }
    if (drag.tapOnly) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const dt = Math.max(1, event.timeStamp - drag.time);
    drag.vx = drag.vx * 0.6 + (dx / dt) * 0.4;
    drag.vy = drag.vy * 0.6 + (dy / dt) * 0.4;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = event.timeStamp;
    this.panFromDrag(-dx, -dy);
  };

  private onPointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    if (event.pointerType !== 'mouse') this.pointerInside = false;
    this.root.classList.remove('is-dragging');
    this.root.classList.toggle('is-interactive', this.interactive);

    if (!drag.moved) {
      const bookId = drag.target?.dataset.id;
      if (bookId && event.type === 'pointerup') {
        this.hideLabel();
        this.callbacks.onOpen(bookId, coverOrigin(drag.target!.querySelector('.cell-cover')));
      }
      return;
    }
    // Carry the wall on a little after a quick release.
    if (!drag.tapOnly && event.timeStamp - drag.time < 80 && this.assemble === 1) {
      this.targetX -= drag.vx * 260;
      this.targetY = Math.max(0, this.targetY - drag.vy * 260);
    }
  };

  private onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.hideLabel();
  };

  private panFromDrag(dx: number, dy: number) {
    if (this.assemble < 1) {
      // The intro is still on screen: vertical movement belongs to the page.
      this.callbacks.onPageScroll(dy);
      return;
    }
    this.targetX += dx;
    const nextY = this.targetY + dy;
    if (nextY < 0) {
      this.callbacks.onPageScroll(nextY);
      this.targetY = 0;
    } else {
      this.targetY = nextY;
    }
  }

  // ── Hover label ───────────────────────────────────────────────────────────

  private showLabel(event: PointerEvent) {
    if (this.paused) return;
    const cell = (event.target as Element).closest<HTMLElement>('.cell');
    const id = cell?.dataset.id ?? null;
    if (!id) {
      this.hideLabel();
      return;
    }
    const rect = this.root.getBoundingClientRect();
    // Keep the label on screen near the right and bottom edges.
    this.labelToX = Math.min(event.clientX - rect.left + 18, this.width - this.label.offsetWidth - 12);
    this.labelToY = Math.min(event.clientY - rect.top + 22, this.height - this.label.offsetHeight - 12);

    if (id !== this.hoverId) {
      const book = this.booksById.get(id);
      if (!book) return;
      const appearing = !this.hoverId;
      this.hoverId = id;
      this.labelTitle.textContent = book.title;
      this.labelAuthor.textContent = book.author;
      this.label.classList.add('is-visible');
      if (appearing) {
        this.labelX = this.labelToX;
        this.labelY = this.labelToY;
      }
    }
  }

  /** The label trails the cursor and leans into its movement, like a tag on a string. */
  private stepLabel() {
    if (!this.hoverId) return;
    const dx = this.labelToX - this.labelX;
    const dy = this.labelToY - this.labelY;
    this.labelX += dx * 0.2;
    this.labelY += dy * 0.2;
    const lean = this.reducedMotion ? 0 : clamp(dx * 0.09, -7, 7);
    this.label.style.transform =
      `translate3d(${this.labelX.toFixed(1)}px, ${this.labelY.toFixed(1)}px, 0) rotate(${lean.toFixed(2)}deg)`;
  }

  private hideLabel() {
    if (!this.hoverId) return;
    this.hoverId = null;
    this.label.classList.remove('is-visible');
  }
}
