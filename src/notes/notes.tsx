import { useMemo, useState, type ReactNode } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { fold } from '../lib/match';
import { ownBook } from '../lib/mybooks';
import { useShelf, type Mark } from '../lib/shelf';
import './notes.css';

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

export const NOTE_TEXT = {
  thought: { en: 'A thought of your own', fr: 'Une pensée à vous' },
  write: { en: 'Write a thought…', fr: 'Écrire une pensée…' },
  tie: { en: 'Tie to another note', fr: 'Relier à une autre note' },
  tied: { en: 'Tied to', fr: 'Relié à' },
  untie: { en: 'Untie', fr: 'Délier' },
  remove: { en: 'Remove', fr: 'Retirer' },
  search: { en: 'Search your notes…', fr: 'Chercher dans vos notes…' },
  nothing: { en: 'Nothing else to tie to yet. Mark another passage first.', fr: 'Rien d’autre à relier pour l’instant. Marquez d’abord un autre passage.' },
  noMatch: { en: 'No note matches.', fr: 'Aucune note ne correspond.' },
  done: { en: 'Done', fr: 'Terminé' },
  open: { en: 'Open in the book', fr: 'Ouvrir dans le livre' },
  thoughts: { en: 'Thoughts', fr: 'Pensées' },
  removeSure: { en: 'Yes, remove it', fr: 'Oui, le retirer' },
  keep: { en: 'Keep it', fr: 'Le garder' },
} satisfies Record<string, L>;

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
