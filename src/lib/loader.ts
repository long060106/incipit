/** The least time the bar takes from 0 to 100, so it reads as a bar even when everything is cached. */
const MIN_MS = 1900;
/** After this long the page opens with whatever has arrived. */
const MAX_MS = 9000;
/** How long the load screen takes to fade (loader styles in index.html). */
const FADE_MS = 900;

type Handoff = { shown: number; stop: () => void };

/** Set by public/boot/theme.js on the pages that go without the load screen. */
const skipped = () => document.documentElement.classList.contains('no-loader');

/**
 * The load screen in index.html: a bar that fills as the fonts and the pictures of the first
 * screen arrive. `onDone` is called as it starts to fade. Returns a cleanup. The screen is shown
 * when the home page is opened from outside; every other page opens at once, as soon as the
 * fonts are in.
 */
export function runLoader(onDone: () => void, least = MIN_MS): () => void {
  const el = document.getElementById('loader');
  if (!el) {
    onDone();
    return () => {};
  }
  if (skipped()) {
    (window as unknown as { __loader?: Handoff }).__loader?.stop();
    el.remove();
    document.documentElement.classList.remove('is-loading');
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) onDone();
    });
    return () => {
      cancelled = true;
    };
  }
  const count = el.querySelector('.loader-count');
  // The script in index.html has been creeping the bar forward while this code was on its way.
  const handoff = (window as unknown as { __loader?: Handoff }).__loader;
  handoff?.stop();
  let shown = handoff?.shown ?? 0;
  const base = shown;

  let total = 1;
  let loaded = 0;
  const arrive = () => {
    loaded += 1;
  };
  document.fonts.ready.then(arrive);

  let frame = 0;
  let fade = 0;
  let collected = false;
  let last = performance.now();
  const began = last;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (!collected) {
      // One frame in, the hands and the covers of the wall are in the document.
      collected = true;
      for (const img of document.querySelectorAll<HTMLImageElement>('.stage img:not([loading="lazy"])')) {
        total += 1;
        if (img.complete) arrive();
        else {
          img.addEventListener('load', arrive, { once: true });
          img.addEventListener('error', arrive, { once: true });
        }
      }
    }
    const target = now - began > MAX_MS ? 1 : base + (1 - base) * (loaded / total);
    shown = Math.min(target, shown + (now - last) / least);
    last = now;
    el.style.setProperty('--loaded', shown.toFixed(4));
    if (count) count.textContent = String(Math.round(shown * 100));
    if (shown < 1) return;
    cancelAnimationFrame(frame);
    document.documentElement.classList.remove('is-loading');
    el.dataset.done = 'true';
    onDone();
    fade = window.setTimeout(() => el.remove(), FADE_MS + 100);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(fade);
  };
}
