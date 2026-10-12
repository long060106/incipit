import { useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { MatchResult } from '../lib/match';
import { coverOrigin, type CoverOrigin } from '../lib/wall';

interface TrayProps {
  /** False during the intro, when the tray is invisible and must not take focus. */
  active: boolean;
  result: MatchResult;
  /** How many fit, in words ("12 fit"), and the order they are in when the reader chose one. */
  label: string;
  order: string | null;
  onOpenBook: (bookId: string, origin?: CoverOrigin | null) => void;
  onReset: () => void;
}

/**
 * The books that fit, best first, so nobody has to hunt for them on the wall. It starts as
 * one row of small covers. The reader can open it into a larger sheet of covers with their
 * titles, hide it down to its bar, and carry it anywhere on the page by that bar.
 */
export function Tray({ active, result, label, order, onOpenBook, onReset }: TrayProps) {
  const { t } = useI18n();
  const [large, setLarge] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const trayRef = useRef<HTMLDivElement>(null);

  // The row can be dragged along with the mouse; a drag must not open the cover under it.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (event: ReactPointerEvent<HTMLUListElement>) => {
    if (large || event.pointerType !== 'mouse' || event.button !== 0) return;
    drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
    dragged.current = false;
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLUListElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) < 5) return;
    if (!state.moved) {
      state.moved = true;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.currentTarget.scrollLeft = state.left - dx;
  };
  const onPointerEnd = () => {
    drag.current = null;
  };

  // Carrying the tray by its bar. It is kept on the page: at least its bar stays in reach.
  const carry = useRef<{ x: number; y: number; from: { x: number; y: number }; box: DOMRect; moved: boolean } | null>(null);
  const onBarDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button') || !trayRef.current) return;
    carry.current = { x: event.clientX, y: event.clientY, from: offset, box: trayRef.current.getBoundingClientRect(), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onBarMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = carry.current;
    if (!state) return;
    const [dx, dy] = [event.clientX - state.x, event.clientY - state.y];
    if (!state.moved && Math.hypot(dx, dy) < 4) return;
    state.moved = true;
    const edge = 8;
    // The header lies over the top of the page: the bar must stay clear of it to be taken hold of again.
    const top = (document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0) + edge;
    const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
    setOffset({
      x: state.from.x + clamp(dx, edge - state.box.left, innerWidth - edge - state.box.right),
      y: state.from.y + clamp(dy, top - state.box.top, innerHeight - edge - state.box.top - 44),
    });
  };
  const onBarEnd = () => {
    carry.current = null;
  };

  if (!result.active) return null;

  if (!result.fits.length) {
    return (
      <div className="tray tray-empty" role="status" inert={!active}>
        <p>
          <strong>{t('noneTitle')}</strong> {t('noneBody')}
        </p>
        <button type="button" className="text-button" onClick={onReset}>
          <span className="u">{t('reset')}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={trayRef}
      className="tray"
      inert={!active}
      data-size={large ? 'large' : 'row'}
      data-hidden={hidden || undefined}
      data-moved={offset.x || offset.y ? '' : undefined}
      style={{ '--tx': `${offset.x}px`, '--ty': `${offset.y}px` } as CSSProperties}
    >
      <div
        className="tray-bar"
        title={t('trayMove')}
        onPointerDown={onBarDown}
        onPointerMove={onBarMove}
        onPointerUp={onBarEnd}
        onPointerCancel={onBarEnd}
        onDoubleClick={(event) => !(event.target as Element).closest('button') && setOffset({ x: 0, y: 0 })}
      >
        <GripIcon />
        <p>
          <strong>{label}</strong>
          {order && <span> · {order}</span>}
        </p>
        <div className="tray-tools">
          {!hidden && (
            <button type="button" onClick={() => setLarge(!large)} aria-pressed={large} aria-label={t(large ? 'trayShrink' : 'trayGrow')} title={t(large ? 'trayShrink' : 'trayGrow')}>
              {large ? <ShrinkIcon /> : <GrowIcon />}
            </button>
          )}
          <button type="button" onClick={() => setHidden(!hidden)} aria-expanded={!hidden} aria-label={t(hidden ? 'trayShow' : 'trayHide')} title={t(hidden ? 'trayShow' : 'trayHide')}>
            <FoldIcon up={hidden} />
          </button>
        </div>
      </div>
      {!hidden && result.closest && <p className="tray-note">{t('closest', { n: result.fits.length })}</p>}
      {!hidden && (
        <ul
          className="tray-list"
          data-scroll
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(event) => {
            if (!dragged.current) return;
            dragged.current = false;
            event.stopPropagation();
            event.preventDefault();
          }}
          onDragStart={(event) => event.preventDefault()}
        >
          {result.fits.map(({ book }, index) => (
            <li key={book.id} style={{ '--i': Math.min(index, 14) } as CSSProperties}>
              <button type="button" onClick={(event) => onOpenBook(book.id, coverOrigin(event.currentTarget))} title={`${book.title}, ${book.author}`}>
                <img src={coverUrl(book, 'sm')} alt={`${book.title}, ${book.author}`} loading="lazy" />
                {/* In a chosen order, each book carries its place in it. */}
                {order && <span className="tray-rank">{index + 1}</span>}
              </button>
              <p className="tray-cap" aria-hidden="true">
                <strong>{book.title}</strong>
                <span>{book.author}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const icon = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const GripIcon = () => (
  <svg {...icon} className="tray-grip" stroke="none" fill="currentColor">
    {[3, 8, 13].flatMap((y) => [5.5, 10.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} />))}
  </svg>
);
const GrowIcon = () => (
  <svg {...icon}>
    <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
  </svg>
);
const ShrinkIcon = () => (
  <svg {...icon}>
    <path d="M13 7H9V3M3 9h4v4M9 7l4.5-4.5M7 9l-4.5 4.5" />
  </svg>
);
const FoldIcon = ({ up }: { up: boolean }) => (
  <svg {...icon}>
    <path d={up ? 'm3.5 10 4.5-4.5 4.5 4.5' : 'm3.5 6 4.5 4.5L12.5 6'} />
  </svg>
);
