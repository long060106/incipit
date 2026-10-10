import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The last element outside any dialog that had focus when a dialog opened. When one dialog
 * opens from inside another (Index, then a book), the inner opener is gone by the time the
 * second closes, so focus goes back here instead.
 */
let pageOpener: HTMLElement | null = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  onClose: () => void;
  /** True while the dialog plays its closing animation; it no longer takes input. */
  leaving?: boolean;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

/** Modal shell: dimmed backdrop, Escape and backdrop-click to close, focus kept inside. */
export function Dialog({ onClose, leaving = false, labelledBy, className = '', children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef({ onClose, leaving });
  live.current = { onClose, leaving };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    if (previous && previous !== document.body && !previous.closest('.scrim')) pageOpener = previous;
    node.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (live.current.leaving) return;
      if (event.key === 'Escape') {
        live.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Hand focus back, unless another dialog opened meanwhile and already holds it.
      const active = document.activeElement;
      if (!active || active === document.body || node.contains(active)) {
        (previous?.isConnected && !previous.closest('[inert]') ? previous : pageOpener)?.focus?.();
      }
    };
  }, []);

  return (
    <div
      className={`scrim ${leaving ? 'is-leaving' : ''}`}
      inert={leaving}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
