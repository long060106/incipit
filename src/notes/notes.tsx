import { useMemo, useState, type ReactNode } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { fold } from '../lib/match';
import { ownBook } from '../lib/mybooks';
import { showable, usePassages } from '../lib/passages';
import { useShelf, type Mark } from '../lib/shelf';
import './notes.css';

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

export const NOTE_TEXT = {
  thought: { en: 'A thought of your own', fr: 'Une pensée à vous', ru: 'Ваша собственная мысль', vi: 'Một ý nghĩ của riêng bạn' },
  write: { en: 'Write a thought…', fr: 'Écrire une pensée…', ru: 'Запишите мысль…', vi: 'Viết một ý nghĩ…' },
  tie: { en: 'Tie to another note', fr: 'Relier à une autre note', ru: 'Связать с другой заметкой', vi: 'Nối với ghi chú khác' },
  tied: { en: 'Tied to', fr: 'Relié à', ru: 'Связано с', vi: 'Đã nối với' },
  untie: { en: 'Untie', fr: 'Délier', ru: 'Развязать', vi: 'Tháo nối' },
  remove: { en: 'Remove', fr: 'Retirer', ru: 'Убрать', vi: 'Gỡ' },
  search: { en: 'Search your notes…', fr: 'Chercher dans vos notes…', ru: 'Искать в заметках…', vi: 'Tìm trong ghi chú…' },
  nothing: { en: 'Nothing else to tie to yet. Mark another passage first.', fr: 'Rien d’autre à relier pour l’instant. Marquez d’abord un autre passage.', ru: 'Пока не с чем связать. Сначала отметьте другой отрывок.', vi: 'Chưa có gì để nối. Hãy đánh dấu một đoạn khác trước.' },
  noMatch: { en: 'No note matches.', fr: 'Aucune note ne correspond.', ru: 'Ни одна заметка не подходит.', vi: 'Không có ghi chú nào khớp.' },
  done: { en: 'Done', fr: 'Terminé', ru: 'Готово', vi: 'Xong' },
  open: { en: 'Open in the book', fr: 'Ouvrir dans le livre', ru: 'Открыть в книге', vi: 'Mở trong sách' },
  thoughts: { en: 'Thoughts', fr: 'Pensées', ru: 'Мысли', vi: 'Suy nghĩ' },
  removeSure: { en: 'Yes, remove it', fr: 'Oui, le retirer', ru: 'Да, убрать', vi: 'Vâng, gỡ đi' },
  keep: { en: 'Keep it', fr: 'Le garder', ru: 'Оставить', vi: 'Giữ lại' },
  show: { en: 'Show on my page', fr: 'Montrer sur ma page', ru: 'Показать на моей странице', vi: 'Hiện trên trang của tôi' },
  shown: { en: 'On your page', fr: 'Sur votre page', ru: 'На вашей странице', vi: 'Trên trang của bạn' },
  full: { en: 'Your page shows twelve already', fr: 'Votre page en montre déjà douze', ru: 'На вашей странице их уже двенадцать', vi: 'Trang của bạn đã hiện đủ mười hai' },
  notSaved: { en: 'Not saved. Try again.', fr: 'Non enregistré. Réessayez.', ru: 'Не сохранено. Попробуйте снова.', vi: 'Chưa lưu được. Thử lại nhé.' },
} satisfies Record<string, L>;

/**
 * The star that shows a marked passage on the reader's own page, for a reader with an account,
 * and only for the words of a book out of copyright. Lit, it is on their page.
 */
function ShowStar({ mark }: { mark: Mark }) {
  const { tl } = useI18n();
  const passages = usePassages();
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  if (!passages.ready || !showable(mark)) return null;
  const on = passages.has(mark.id);
  const blocked = !on && passages.full;
  return (
    <button
      type="button"
      className="text-button note-star"
      aria-pressed={on}
      disabled={blocked}
      title={blocked ? tl(NOTE_TEXT.full) : undefined}
      onClick={async () => {
        setFailed(false);
        if (!on) setBurst((count) => count + 1);
        setFailed(!!(await passages.toggle(mark)));
      }}
    >
      <span className="note-star-glyph" aria-hidden="true" key={burst} data-burst={burst > 0 || undefined}>
        {on ? '★' : '☆'}
      </span>
      {failed ? tl(NOTE_TEXT.notSaved) : tl(on ? NOTE_TEXT.shown : blocked ? NOTE_TEXT.full : NOTE_TEXT.show)}
    </button>
  );
}

/** The book a mark was made in: one of the catalogue's, or one of the reader's own. */
export const bookOf = (mark: Mark): { title: string; author: string } | undefined =>
  mark.bookId ? BY_ID.get(mark.bookId) ?? ownBook(mark.bookId) : undefined;

/** Where a mark is in its book: the address the reader opens at that passage. */
export const markUrl = (mark: Mark) =>
  mark.bookId ? `${import.meta.env.BASE_URL}read/${mark.bookId}#${mark.section ?? 0}:${mark.start ?? 0}` : null;

/** A few words that stand for a mark in a list. */
export const markLine = (mark: Mark, length = 120) => {
  const text = mark.quote || mark.note;
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
};

/** A list of the reader's other marks to choose one from, with a search field. */
export function TiePicker({ markId, onPick, onClose }: { markId: string; onPick: (id: string) => void; onClose: () => void }) {
  const { tl } = useI18n();
  const shelf = useShelf();
  const [query, setQuery] = useState('');
  const self = shelf.mark(markId);
  const others = useMemo(
    () => shelf.marks().filter((mark) => mark.id !== markId && !self?.links.includes(mark.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markId, self?.links.length, shelf.marks().length],
  );
  const wanted = fold(query.trim());
  const shown = wanted
    ? others.filter((mark) => fold(`${mark.quote ?? ''} ${mark.note} ${bookOf(mark)?.title ?? ''} ${bookOf(mark)?.author ?? ''}`).includes(wanted))
    : others;

  return (
    <div className="tie-picker">
      <div className="tie-picker-head">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tl(NOTE_TEXT.search)}
          aria-label={tl(NOTE_TEXT.search)}
          autoFocus
        />
        <button type="button" className="text-button" onClick={onClose}>
          {tl(NOTE_TEXT.done)}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="tie-empty">{tl(others.length ? NOTE_TEXT.noMatch : NOTE_TEXT.nothing)}</p>
      ) : (
        <ul className="tie-list" data-scroll>
          {shown.map((mark) => (
            <li key={mark.id}>
              <button type="button" onClick={() => onPick(mark.id)}>
                <span className={mark.quote ? 'tie-quote' : 'tie-note'}>{markLine(mark)}</span>
                <small>{bookOf(mark)?.title ?? tl(NOTE_TEXT.thought)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One note as it is kept in a file of the notebook: the marked words, the reader's own words
 * under them, and what it is tied to. Shared by the notebook (/notebook) and the reader's
 * notebook drawer. `follow` is what a tie leads to; `place` is the link back into the book.
 */
export function NoteEntry({ mark, follow, place, lit }: { mark: Mark; follow: (other: Mark) => void; place?: ReactNode; lit?: boolean }) {
  const { tl, lang } = useI18n();
  const shelf = useShelf();
  const [tying, setTying] = useState(false);
  const [sure, setSure] = useState(false);
  const time = new Date(mark.created).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  return (
    <article className="note-entry" id={`note-${mark.id}`} data-lit={lit || undefined}>
      <p className="note-entry-head">
        <time dateTime={new Date(mark.created).toISOString()}>{time}</time>
        {place}
      </p>
      {mark.quote && <blockquote className="note-entry-quote">{mark.quote}</blockquote>}
      <textarea
        className="note-entry-text"
        defaultValue={mark.note}
        placeholder={tl(NOTE_TEXT.write)}
        onChange={(event) => shelf.editMark(mark.id, { note: event.target.value })}
        autoFocus={!mark.quote && !mark.note}
        rows={mark.quote ? 2 : 4}
      />
      {mark.links.length > 0 && (
        <ul className="note-entry-ties" aria-label={tl(NOTE_TEXT.tied)}>
          {mark.links.map((id) => {
            const other = shelf.mark(id);
            if (!other) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => follow(other)}>
                  <span className={other.quote ? 'tie-quote' : 'tie-note'}>{markLine(other, 90)}</span>
                  <small>{bookOf(other)?.title ?? tl(NOTE_TEXT.thoughts)}</small>
                </button>
                <button type="button" className="text-button" onClick={() => shelf.untie(mark.id, id)} aria-label={tl(NOTE_TEXT.untie)} title={tl(NOTE_TEXT.untie)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tying ? (
        <TiePicker markId={mark.id} onPick={(id) => shelf.tie(mark.id, id)} onClose={() => setTying(false)} />
      ) : (
        <div className="note-entry-actions">
          <button type="button" className="text-button" onClick={() => setTying(true)}>
            + {tl(NOTE_TEXT.tie)}
          </button>
          <ShowStar mark={mark} />
          {sure ? (
            <>
              <button type="button" className="text-button note-entry-remove" onClick={() => shelf.removeMark(mark.id)}>
                {tl(NOTE_TEXT.removeSure)}
              </button>
              <button type="button" className="text-button" onClick={() => setSure(false)}>
                {tl(NOTE_TEXT.keep)}
              </button>
            </>
          ) : (
            <button type="button" className="text-button" onClick={() => setSure(true)}>
              {tl(NOTE_TEXT.remove)}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
