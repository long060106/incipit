import type { CSSProperties } from 'react';
import { toneOf } from '../lib/people';

/**
 * A reader's picture: the first letter of their name, in the capitals of the site's name, on
 * a colour of their choosing (or the one their name gives). Nobody uploads a face.
 */
export function Avatar({ name, tone = -1, size = 'md' }: { name: string; tone?: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="avatar" data-size={size} style={{ '--tone': toneOf(name, tone) } as CSSProperties} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
