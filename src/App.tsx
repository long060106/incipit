import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { BookSheet } from './components/BookSheet';
import { Header, type Theme } from './components/Header';
import { IndexDialog } from './components/IndexDialog';
import { Intro } from './components/Intro';
import { Panel } from './components/Panel';
import { Tray } from './components/Tray';
import { WallStage, type WallHandle } from './components/WallStage';
import { BOOKS, BOOKS_BY_ID } from './data/books';
import type { KeywordId, Mood } from './data/types';
import { useI18n } from './i18n';
import { Light } from './lib/light';
import { runLoader } from './lib/loader';
import { EMPTY_FILTERS, matchBooks, type Filters } from './lib/match';
import type { CellState, CoverOrigin } from './lib/wall';

const GUIDE_KEY = 'incipit:wall-guide';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Progress of `p` through the window [from, to], clamped to 0–1. */
const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** True when the reader comes back from one of the site's own pages: the opening is not played again. */
const cameFromInside = () => {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (entry?.type === 'back_forward') return true;
  try {
    return entry?.type === 'navigate' && !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
};

/** How long the glide between the hero and the gallery takes over its full distance. */
const TRAVEL_MS = 5200;
/** How long the page takes to open itself on arrival, if the reader does not scroll first. */
const OPENING_MS = 11000;
/** How many screens of scroll the opening takes (the scroll track in base.css is this much taller). */
const OPENING_SCREENS = 3;
/**
 * How many screens of scroll the open hero then holds still for, so that a scroll through the
 * opening comes to rest on it and does not run on into the intro (also in base.css).
 */
const HOLD_SCREENS = 0.75;
/** How much of the gap to the scroll position the intro closes each 60th of a second. Lower is a longer, softer drift. */
const FOLLOW = 0.085;
/** The same, for a first pass that rounds off each notch of the wheel before the intro follows it. */
const SOFTEN = 0.2;
/** A follow rate per 60th of a second, as the share to close over a frame that took `dt` ms. */
const share = (rate: number, dt: number) => 1 - Math.pow(1 - rate, Math.min(dt, 100) / (1000 / 60));

/**
 * The elements that read each value the scroll writes. The values are registered in stage.css
 * as properties that do not inherit and are written straight onto their readers: written onto
 * the stage, every one of them made the browser restyle every cover on the wall, every frame.
 */
const READERS: Record<string, string> = {
  '--open': '.hero-letter, .hero-def, .hero-actions, .hero-credit',
  '--zoom': '.wall, .glow, .hands',
  '--part': '.hand-rail',
  '--hero': '.hero, .hero-word, .hero-def, .hand, .wordmark, .hero-credit',
  '--wall-opacity': '.wall-plane',
  '--line-1': '.line-1',
  '--line-1-y': '.line-1',
  '--line-2': '.line-2',
  '--line-2-y': '.line-2',
  '--line-3': '.line-3',
  '--line-3-y': '.line-3',
};

/** Below this width the filter panel is a sheet that rises from the bottom edge. */
const NARROW = window.matchMedia('(max-width: 899px)');
/** The sizes the covers of the wall can be hung at, from the usual one to the furthest the reader can stand back. */
const ZOOMS = [1, 0.8, 0.64, 0.5];

function useTheme(): [Theme, (event?: MouseEvent) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'day' ? 'day' : 'night'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'day' ? '#f4f0e8' : '#0c0c0d');
    try {
      localStorage.setItem('incipit:theme', theme);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this visit only.
    }
  }, [theme]);

  const toggle = useCallback(
    (event?: MouseEvent) => {
      const next: Theme = theme === 'night' ? 'day' : 'night';
      const root = document.documentElement;
      const apply = () => {
        root.dataset.theme = next;
        flushSync(() => setTheme(next));
      };
      if (!document.startViewTransition || prefersReducedMotion()) {
        apply();
        return;
      }
      // The other room opens out in a circle from the switch that was pressed.
      const box = event?.currentTarget.getBoundingClientRect();
      const x = box ? box.left + box.width / 2 : window.innerWidth;
      const y = box ? box.top + box.height / 2 : 0;
      root.style.setProperty('--reveal-x', `${x}px`);
      root.style.setProperty('--reveal-y', `${y}px`);
      root.style.setProperty(
        '--reveal-r',
        `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`,
      );
      root.classList.add('is-switching-theme');
      document.startViewTransition(apply).finished.finally(() => root.classList.remove('is-switching-theme'));
    },
    [theme],
  );

  return [theme, toggle];
}

const bookFromHash = () => {
  const id = /^#book=([\w-]+)$/.exec(window.location.hash)?.[1];
  return id && BOOKS_BY_ID.has(id) ? id : null;
};

/** The open book lives in the URL hash, so a book can be linked to and Back closes it. */
function useOpenBook() {
  const [bookId, setBookId] = useState(bookFromHash);

  useEffect(() => {
    const sync = () => setBookId(bookFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const open = useCallback((id: string) => {
    // Going from one open book to another replaces the entry, so Back still closes the sheet.
    if (bookFromHash()) history.replaceState(history.state, '', `#book=${id}`);
    else history.pushState({ sheet: true }, '', `#book=${id}`);
    setBookId(id);
  }, []);

  const close = useCallback(() => {
    if (history.state?.sheet) {
      history.back();
    } else {
      // Arrived straight on a book link: there is no earlier entry of ours to go back to.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setBookId(null);
    }
  }, []);

  return { bookId, open, close };
}

const EXIT_MS = 240;

/**
 * Holds on to a value for a moment after it clears, so whatever showed it can animate out.
 * `leaving` is true during that moment.
 */
function useLingering<T>(value: T | null, ms = EXIT_MS): { shown: T | null; leaving: boolean } {
  const [held, setHeld] = useState(value);
  if (value !== null && value !== held) setHeld(value);

  useEffect(() => {
    if (value !== null) return;
    const id = window.setTimeout(() => setHeld(null), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);

  return { shown: value ?? held, leaving: value === null && held !== null };
}

/** A programmatic glide of the page scroll, eased over time rather than left to the browser. */
interface Travel {
  from: number;
  to: number;
  start: number;
  duration: number;
  /** Shapes the scroll over time; without it the scroll moves at an even pace. */
  ease?: (t: number) => number;
}

export default function App() {
  const { t } = useI18n();
  const [theme, toggleTheme] = useTheme();
  const { bookId, open: openBookById, close: closeBook } = useOpenBook();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [indexOpen, setIndexOpen] = useState(false);
  // On a wide screen the panel starts open and can be minimised to its title bar; on a
  // narrow one it starts as a closed sheet.
  const [panelOpen, setPanelOpen] = useState(() => !NARROW.matches);
  // On a wide screen the page opens through a small window over its first stretch of scroll.
  // Not when the visit starts on a book, or the reader has asked for less motion.
  const [opening] = useState(() => !NARROW.matches && !bookFromHash() && !prefersReducedMotion() && !cameFromInside());
  /** False until that window has opened all the way. */
  const [opened, setOpened] = useState(!opening);
  const [inGallery, setInGallery] = useState(false);
  /** How far the reader stands back from the wall: an index into ZOOMS. */
  const [zoom, setZoom] = useState(0);
  const [inHero, setInHero] = useState(true);
  /** Where the cover of the book being opened was on screen, for its flight into the sheet. */
  const [flight, setFlight] = useState<{ bookId: string; origin: CoverOrigin } | null>(null);

  const stageRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const wallRef = useRef<WallHandle>(null);
  const travel = useRef<Travel | null>(null);
  /** Wheel travel gathered towards the next step of zoom. */
  const pinch = useRef(0);

  const book = bookId ? BOOKS_BY_ID.get(bookId) ?? null : null;
  const dialogOpen = Boolean(book) || indexOpen;
  const live = useRef({ inGallery, inHero, dialogOpen, opened });
  live.current = { inGallery, inHero, dialogOpen, opened };
  // The covers are their full size wherever the wall is not hung as a grid.
  useEffect(() => wallRef.current?.setZoom(inGallery ? ZOOMS[zoom] : 1), [zoom, inGallery]);

  const sheet = useLingering(book);
  const index = useLingering(indexOpen ? true : null);

  const result = useMemo(() => matchBooks(BOOKS, filters), [filters]);

  const states = useMemo(() => {
    if (!result.active) return null;
    const fits = new Set(result.fits.map(({ book: fit }) => fit.id));
    return new Map<string, CellState>(BOOKS.map(({ id }) => [id, fits.has(id) ? 'lit' : 'dim']));
  }, [result]);

  const countLabel = !result.active
    ? t('countAll', { n: BOOKS.length })
    : result.fits.length === 0
      ? t('countNone')
      : result.fits.length === 1
        ? t('countFitOne')
        : t('countFit', { n: result.fits.length });

  // Every visit starts at the top, on the hero, even after a reload. Only a link straight
  // to a book skips the intro.
  useLayoutEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, bookFromHash() ? maxScroll() : 0);
  }, []);

  // The page behind a dialog must not scroll. Nor does it once the wall is hung: scrolling up
  // there would play the whole intro backwards under the finger, so the wall keeps the reader
  // and the button below takes them back to the first page.
  useEffect(() => {
    document.documentElement.classList.toggle('is-locked', dialogOpen || inGallery);
  }, [dialogOpen, inGallery]);
  useEffect(() => {
    if (inGallery && !travel.current) window.scrollTo(0, maxScroll());
  }, [inGallery]);
  // The guide to the wall, shown once to each reader, the first time they reach it.
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    if (!inGallery) return;
    try {
      if (localStorage.getItem(GUIDE_KEY)) return;
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // Nowhere to remember it: it is shown on each visit.
    }
    setGuide(true);
  }, [inGallery]);

  // Crossing between the two layouts puts the panel back in that layout's resting state.
  useEffect(() => {
    const reset = () => setPanelOpen(!NARROW.matches);
    NARROW.addEventListener('change', reset);
    return () => NARROW.removeEventListener('change', reset);
  }, []);

  // Hold the opening sequence until the load screen has counted in the display face and the
  // pictures of the first screen, so the name rises in its real letterforms.
  useEffect(() => {
    let cancelled = false;
    let selfOpen = 0;
    // Through the opening window the covers drift across the middle of the page, behind the
    // two fingertips; they stand back to its edges as the hands draw apart.
    if (opening) wallRef.current?.setClearing(0, true);
    const start = () => {
      if (cancelled || !stageRef.current || stageRef.current.dataset.ready) return;
      stageRef.current.dataset.ready = 'true';
      if (!opening) return;
      // The opening belongs to the scroll, but the page plays it by itself on arrival:
      // unless the reader is already scrolling, it glides down that first stretch.
      selfOpen = window.setTimeout(() => {
        if (window.scrollY > 2 || travel.current) return;
        travel.current = {
          from: 0,
          to: window.innerHeight * OPENING_SCREENS,
          start: performance.now(),
          duration: OPENING_MS,
          // The window has its own easing over the scroll. A soft one here on top of it
          // keeps the opening unhurried from end to end, with no rush in the middle.
          ease: easeInOutSine,
        };
      }, 700);
    };
    const stopLoader = runLoader(start, cameFromInside() ? 450 : undefined);
    return () => {
      cancelled = true;
      stopLoader();
      window.clearTimeout(selfOpen);
    };
  }, [opening]);

  // Scroll position drives the intro. Each frame eases towards it and writes the result
  // to CSS variables on the stage and to the wall.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduced = prefersReducedMotion();
    let progress = -1;
    /** How far the opening window has got, 0 to 1, eased like `progress`. */
    let unveil = -1;
    /** The scroll position the page shows: the real one, softened and then followed. */
    let soft = -1;
    let shown = -1;
    let before = performance.now();
    let applied = '';
    const readers = new Map<string, HTMLElement[]>();
    const written = new Map<string, string>();
    const put = (name: string, value: string) => {
      if (written.get(name) === value) return;
      written.set(name, value);
      const selector = READERS[name];
      if (!selector) return stage.style.setProperty(name, value);
      let elements = readers.get(name);
      if (!elements) readers.set(name, (elements = [...document.querySelectorAll<HTMLElement>(selector)]));
      for (const element of elements) element.style.setProperty(name, value);
    };
    // 1 while the reader scrolls through the intro's three lines; eases to 0 during a glide,
    // which carries the hero straight into the wall without them.
    let lines = 1;
    let frame = 0;
    const light = glowRef.current && wordRef.current ? new Light(glowRef.current, wordRef.current) : null;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const max = maxScroll();
      // The first stretch of scroll opens the window; the intro proper starts below it.
      const lead = opening ? window.innerHeight * OPENING_SCREENS : 0;

      const glide = travel.current;
      if (glide) {
        // Between hero and gallery the scroll moves at an even pace, and the easing lives in
        // the glide's own timeline below. The opening carries its easing in the scroll.
        const elapsed = clamp01((now - glide.start) / glide.duration);
        window.scrollTo(0, glide.from + (glide.to - glide.from) * (glide.ease ? glide.ease(elapsed) : elapsed));
        if (elapsed >= 1) travel.current = null;
      }

      // A glide is already eased, so follow it exactly. Hand scrolling comes in notches: a
      // first pass rounds each one off, and the page follows that with a little lag, at the
      // same pace whatever the frame rate.
      const dt = now - before;
      before = now;
      const y = window.scrollY;
      if (shown < 0 || glide || (Math.abs(y - shown) < 0.4 && Math.abs(y - soft) < 0.4)) soft = shown = y;
      else {
        soft += (y - soft) * share(SOFTEN, dt);
        shown += (soft - shown) * share(FOLLOW, dt);
      }
      const begin = lead + (opening ? window.innerHeight * HOLD_SCREENS : 0);
      progress = reduced || max <= begin + 1 ? 1 : clamp01((shown - begin) / (max - begin));
      unveil = lead ? clamp01(shown / lead) : 1;
      lines += ((glide ? 0 : 1) - lines) * share(0.1, dt);
      if (lines > 0.999) lines = 1;
      else if (lines < 0.001) lines = 0;

      const p = progress;

      // Two timelines over the same scroll. Read by hand, the hero gives way to three lines
      // of text before the wall forms. On a glide there is nothing to read, so the hero
      // dissolves straight into covers that are already on their way. `lines` blends the two.
      const hero = mix(1 - span(p, 0, 0.3), 1 - span(p, 0.03, 0.2), lines);

      // The light moves on its own, whether or not the page is scrolling. Its glow stays on
      // behind the three lines and goes out as the wall closes up.
      light?.step(now, hero, 1 - span(p, 0.5, 0.9));

      const key = `${progress.toFixed(5)}|${lines.toFixed(3)}|${unveil.toFixed(4)}`;
      if (key === applied) return;
      applied = key;

      if (opening) {
        // The window widens from a patch around the two fingertips to the whole page, at the
        // pace the scene behind it pulls back; the two figures draw apart and, in the
        // stylesheet, the name rises between them (--open).
        //
        // Each figure is a cut-out that ends somewhere, and the window must never show that
        // end. Pulling back brings the ends in and parting carries them out, so the parting
        // keeps step with the pull-back, and the ends are past the edges of the page well
        // before the window gets there.
        const widen = easeInOutSine(span(unveil, 0, 0.92));
        const inset = (edge: number) => `${((1 - widen) * edge).toFixed(2)}%`;
        stage.style.clipPath = widen < 1 ? `inset(${inset(26)} ${inset(34)} ${inset(38)} ${inset(34)})` : '';
        put('--open', unveil.toFixed(4));
        put('--zoom', (1.5 - widen * 0.5).toFixed(4));
        put('--part', easeInOutSine(span(unveil, 0.08, 0.9)).toFixed(4));
        wallRef.current?.setClearing(span(unveil, 0.3, 0.85));
        if (unveil > 0.9 !== live.current.opened) setOpened(unveil > 0.9);
      }

      const ui = mix(span(p, 0.84, 1), span(p, 0.93, 1), lines);
      const assemble = mix(easeInOutSine(span(p, 0.04, 0.92)), easeInOut(span(p, 0.26, 0.97)), lines);
      // Each line rises in, holds, then lifts away.
      const windows = [
        [span(p, 0.2, 0.27), span(p, 0.38, 0.44)],
        [span(p, 0.44, 0.51), span(p, 0.6, 0.66)],
        [span(p, 0.66, 0.73), span(p, 0.86, 0.93)],
      ];
      // The wall steps back while the lines are read, then comes forward.
      const veil = span(p, 0.1, 0.22) * (1 - span(p, 0.86, 0.97)) * lines;

      put('--hero', hero.toFixed(3));
      put('--ui', ui.toFixed(3));
      put('--wall-opacity', (1 - veil * 0.8).toFixed(3));
      windows.forEach(([enter, leave], i) => {
        put(`--line-${i + 1}`, (enter * (1 - leave) * lines).toFixed(3));
        put(`--line-${i + 1}-y`, `${((1 - enter) * 28 - leave * 28).toFixed(1)}px`);
      });
      stage.dataset.scene = hero > 0.5 ? 'hero' : ui >= 1 ? 'gallery' : 'lines';
      if (hero > 0.5 !== live.current.inHero) setInHero(hero > 0.5);

      wallRef.current?.setAssemble(assemble);

      const gallery = p > 0.985;
      if (gallery !== live.current.inGallery) setInGallery(gallery);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      light?.destroy();
    };
  }, [opening]);

  useEffect(() => {
    // Any scroll of the reader's own takes over from a glide in progress.
    const stopTravel = () => {
      travel.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopTravel();
    };

    // Once the intro has played out, the wheel moves the wall instead of the page.
    const onWheel = (event: WheelEvent) => {
      stopTravel();
      const { inGallery: gallery, dialogOpen: blocked } = live.current;
      if (blocked || !gallery) return;
      if (event.ctrlKey) {
        // A pinch on a trackpad, or the wheel with Ctrl held: stand back from the wall or step closer.
        if (!(event.target as Element).closest('[data-scroll], .panel, .tray')) {
          event.preventDefault();
          pinch.current += event.deltaY;
          if (Math.abs(pinch.current) > 40) {
            const step = Math.sign(pinch.current);
            pinch.current = 0;
            setZoom((level) => Math.min(ZOOMS.length - 1, Math.max(0, level + step)));
          }
        }
        return;
      }

      const scroller = (event.target as Element).closest<HTMLElement>('[data-scroll]');
      if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) {
        // The tray of results runs sideways: a plain mouse wheel slides it along.
        const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? scroller.clientWidth : 1;
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        scroller.scrollLeft += delta * unit;
        event.preventDefault();
        return;
      }
      if (scroller) {
        // Lists inside the panel scroll themselves, but never pull the page along at their ends.
        const atEnd =
          event.deltaY < 0
            ? scroller.scrollTop <= 0
            : scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        if (atEnd) event.preventDefault();
        return;
      }

      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (wallRef.current?.wheel(event.deltaX * unit, event.deltaY * unit)) event.preventDefault();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', stopTravel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', stopTravel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const scrollPage = useCallback((dy: number) => window.scrollBy(0, dy), []);

  /** Glides the page to `to`, taking time in proportion to the distance. */
  const travelTo = useCallback((to: number) => {
    const max = maxScroll();
    const distance = Math.abs(to - window.scrollY);
    if (prefersReducedMotion() || max <= 1 || distance < 2) {
      window.scrollTo(0, to);
      return;
    }
    travel.current = {
      from: window.scrollY,
      to,
      start: performance.now(),
      duration: Math.max(1100, TRAVEL_MS * (distance / max)),
    };
  }, []);

  const goToGallery = useCallback(() => travelTo(maxScroll()), [travelTo]);
  // Home is the hero with the window open, below the stretch where the opening plays.
  const goToIntro = useCallback(
    () => travelTo(opening ? window.innerHeight * OPENING_SCREENS : 0),
    [travelTo, opening],
  );

  const openBook = useCallback(
    (id: string, origin: CoverOrigin | null = null) => {
      setFlight(origin ? { bookId: id, origin } : null);
      openBookById(id);
    },
    [openBookById],
  );

  const openFromIndex = useCallback(
    (id: string) => {
      setIndexOpen(false);
      openBook(id);
    },
    [openBook],
  );

  const applyMood = useCallback(
    (mood: Mood) => {
      setFilters({ ...EMPTY_FILTERS, mood: { ...mood } });
      closeBook();
    },
    [closeBook],
  );

  const pickTheme = useCallback(
    (theme: KeywordId) => {
      setFilters({ ...EMPTY_FILTERS, keywords: [theme] });
      closeBook();
    },
    [closeBook],
  );

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return (
    <>
      <div className="scroll-track" data-opening={opening ? 'window' : undefined} aria-hidden="true" />
      {/* While the page is still a small window, a word under it says how it opens. Pressing it opens the page. */}
      {opening && (
        <button type="button" className="scroll-cue" data-gone={opened || undefined} onClick={goToIntro} tabIndex={opened ? -1 : 0}>
          <span>{t('scrollCue')}</span>
          <i aria-hidden="true" />
        </button>
      )}

      <main
        className="stage"
        ref={stageRef}
        data-scene="hero"
        data-gallery={inGallery}
        data-opening={opening ? 'window' : undefined}
      >
        {/* The light of the opening page: behind the covers, which stand out against it. */}
        <div className="glow" ref={glowRef} aria-hidden="true">
          <div className="glow-field">
            <i />
            <i />
            <i />
          </div>
        </div>
        <WallStage
          ref={wallRef}
          states={states}
          interactive={inGallery}
          paused={dialogOpen}
          onOpen={openBook}
          onPageScroll={scrollPage}
        />
        <Intro active={inHero && opened && !dialogOpen} onBrowse={goToGallery} wordRef={wordRef} />
        <Header
          theme={theme}
          showHome={!inHero}
          onToggleTheme={toggleTheme}
          onOpenIndex={() => setIndexOpen(true)}
          onHome={goToIntro}
        />

        <Panel
          active={inGallery}
          filters={filters}
          onChange={setFilters}
          countLabel={countLabel}
          open={panelOpen}
          onToggle={() => setPanelOpen((value) => !value)}
        />
        <Tray
          active={inGallery}
          result={result}
          label={countLabel}
          order={filters.sort === 'rating' ? t('sortRating') : filters.sort === 'popular' ? t('sortPopular') : null}
          onOpenBook={openBook}
          onReset={resetFilters}
        />
        <button type="button" className="first-page" onClick={goToIntro} inert={!inGallery}>
          <i aria-hidden="true">↑</i>
          {t('firstPage')}
        </button>
        {/* Standing back from the wall, as far as there are covers to fill it. */}
        <div className="zoom" role="group" inert={!inGallery}>
          <button type="button" onClick={() => setZoom(Math.max(0, zoom - 1))} disabled={zoom === 0} aria-label={t('zoomIn')} title={t('zoomIn')}>
            +
          </button>
          <button type="button" onClick={() => setZoom(Math.min(ZOOMS.length - 1, zoom + 1))} disabled={zoom === ZOOMS.length - 1} aria-label={t('zoomOut')} title={t('zoomOut')}>
            −
          </button>
        </div>
        {!result.active && <p className="hint">{t('dragHint')}</p>}
        {/* A reader's first time at the wall: one card says it moves every way, then goes. */}
        {guide && (
          <div className="wall-guide" role="status" onAnimationEnd={() => setGuide(false)}>
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="M24 5v38M5 24h38M24 5l-6 6M24 5l6 6M24 43l-6-6M24 43l6-6M5 24l6-6M5 24l6 6M43 24l-6-6M43 24l-6 6" />
            </svg>
            <p>{t('wallGuide')}</p>
            <span>{t('wallGuideNote')}</span>
          </div>
        )}

        {sheet.shown && (
          <BookSheet
            book={sheet.shown}
            leaving={sheet.leaving}
            origin={flight?.bookId === sheet.shown.id ? flight.origin : null}
            onClose={closeBook}
            onOpenBook={openBook}
            onUseMood={applyMood}
            onPickTheme={pickTheme}
          />
        )}
        {index.shown && (
          <IndexDialog leaving={index.leaving} onClose={() => setIndexOpen(false)} onOpenBook={openFromIndex} />
        )}
      </main>
    </>
  );
}
