/**
 * Chips and option buttons fill with colour from the point where they were pressed, like ink
 * taking to paper. The fill itself is CSS (see `.chip` in base.css); this records the point.
 */
export function installInkOrigin() {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('.chip, .segmented button');
      if (!target) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty('--ink-x', `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`);
      target.style.setProperty('--ink-y', `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`);
    },
    { passive: true },
  );
}
