import type { ReactNode } from 'react';

/**
 * Button label that rolls up to an identical copy of itself when its button is hovered.
 * The copy is a text-shadow, so the markup stays a single run of text.
 */
export function Roll({ children }: { children: ReactNode }) {
  return (
    <span className="roll">
      <span>{children}</span>
    </span>
  );
}
