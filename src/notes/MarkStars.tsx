import type { Mark } from '../lib/shelf';
import { starsIn } from '../reader/constellation';
import './notes.css';

/**
 * A book's constellation, small: each passage marked in it is a star, placed where it stands
 * in the margins of the reader (src/reader/constellation.ts), and joined to the next one marked.
 * A star with a note is a little larger. Pressing one opens its note.
 */
export function MarkStars({
  marks,
  width,
  height,
  lit,
  onPick,
  className,
}: {
  marks: Mark[];
  width: number;
  height: number;
  lit?: string | null;
  onPick?: (mark: Mark) => void;
  className?: string;
}) {
  const stars = starsIn(
    marks.filter((mark) => mark.quote),
    width,
    height,
    14,
  );
  if (stars.length === 0) return null;
  const path = stars.map((star, at) => `${at ? 'L' : 'M'}${star.x.toFixed(1)} ${star.y.toFixed(1)}`).join(' ');
  return (
    <svg className={`mark-stars ${className ?? ''}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden={onPick ? undefined : 'true'}>
      {stars.length > 1 && <path className="mark-stars-line" d={path} pathLength={1} />}
      {stars.map((star, at) => (
        <g
          key={star.mark.id}
          className="mark-star"
          data-lit={star.mark.id === lit || undefined}
          style={{
            animationDelay: `${0.25 + at * 0.12}s, ${(at * 0.37) % 3}s`,
          }}
          onClick={onPick ? () => onPick(star.mark) : undefined}
          role={onPick ? 'button' : undefined}
          tabIndex={onPick ? 0 : undefined}
          onKeyDown={onPick ? (event) => event.key === 'Enter' && onPick(star.mark) : undefined}
        >
          <title>{star.mark.quote}</title>
          <circle cx={star.x} cy={star.y} r={star.mark.note ? 9 : 7} className="mark-star-glow" />
          <circle cx={star.x} cy={star.y} r={star.mark.note ? 2.2 : 1.6} className="mark-star-core" />
          {onPick && <circle cx={star.x} cy={star.y} r={12} fill="transparent" />}
        </g>
      ))}
    </svg>
  );
}
