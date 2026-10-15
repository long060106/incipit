/**
 * Chips and option buttons fill with colour from the point where they were pressed, like ink
 * taking to paper. The fill itself is CSS (see `.chip` in base.css); this records the point.
 * A button sends out a ring from the same point, which goes when it has spread.
 */
export function installInkOrigin() {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const button = (event.target as Element | null)?.closest<HTMLElement>('.button');
      if (button && !(button as HTMLButtonElement).disabled) ring(button, event);
      const target = (event.target as Element | null)?.closest<HTMLElement>('.chip, .segmented button');
      if (!target) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty('--ink-x', `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`);
      target.style.setProperty('--ink-y', `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`);
    },
    { passive: true },
  );
}

function ring(button: HTMLElement, event: PointerEvent) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = button.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  // Wide enough to reach the farthest corner.
  const reach = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  const ring = document.createElement('span');
  ring.className = 'press-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.setProperty('--grow', ((reach * 2) / 16 + 1).toFixed(2));
  button.append(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}
