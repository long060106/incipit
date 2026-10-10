import { useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { MatchResult } from '../lib/match';
import { coverOrigin, type CoverOrigin } from '../lib/wall';

interface TrayProps {
  /** False during the intro, when the tray is invisible and must not take focus. */
  active: boolean;
  result: MatchResult;
  onOpenBook: (bookId: string, origin?: CoverOrigin | null) => void;
  onReset: () => void;
}

/** The books that fit, best first, so nobody has to hunt for them on the wall. */
export function Tray({ active, result, onOpenBook, onReset }: TrayProps) {
  const { t } = useI18n();
  // The row can be dragged along with the mouse; a drag must not open the cover under it.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (event: ReactPointerEvent<HTMLUListElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
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
    <div className="tray" inert={!active}>
      {result.closest && <p className="tray-note">{t('closest', { n: result.fits.length })}</p>}
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
          <li key={book.id} style={{ '--i': index } as CSSProperties}>
            <button
              type="button"
              onClick={(event) => onOpenBook(book.id, coverOrigin(event.currentTarget))}
              title={`${book.title}, ${book.author}`}
            >
              <img src={coverUrl(book, 'sm')} alt={`${book.title}, ${book.author}`} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
