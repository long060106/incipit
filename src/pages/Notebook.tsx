import { useEffect, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { fold } from '../lib/match';
import { addOwnBook, removeOwnBook, useOwnBooks } from '../lib/mybooks';
import { useShelf, type Mark } from '../lib/shelf';
import { AccountPanel } from '../notes/AccountPanel';
import { CardPanel } from '../notes/CardPanel';
import { bookOf, markLine, markUrl, NOTE_TEXT, TiePicker } from '../notes/notes';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './notebook.css';

/*
  The notebook (/notebook): everything the reader has marked or written, and the ties between
  those notes. On the left, the books being read and the list of notes; on the right, one
  note at a time with what it is tied to. Following a tie moves to that note, so a thought
  can be walked from book to book.
*/

const TEXT = {
  title: { en: 'Notebook', fr: 'Carnet' },
  reading: { en: 'Reading', fr: 'En cours' },
  notes: { en: 'Notes', fr: 'Notes' },
  newThought: { en: 'Write a thought', fr: 'Écrire une pensée' },
  search: { en: 'Search…', fr: 'Chercher…' },
  empty: { en: 'Nothing here yet', fr: 'Rien ici pour le moment' },
  emptyWhy: {
    en: 'Open a book and select any words to mark them. Marked passages gather here, each with room for a thought. Tie two notes together and the thought carries on from one book to the next.',
    fr: 'Ouvrez un livre et sélectionnez des mots pour les marquer. Les passages marqués se rassemblent ici, chacun avec la place d’une pensée. Reliez deux notes, et la pensée se poursuit d’un livre à l’autre.',
  },
  start: { en: 'Find a first page', fr: 'Trouver une première page' },
  choose: { en: 'Choose a note on the left.', fr: 'Choisissez une note à gauche.' },

  percent: { en: '{n}% read', fr: '{n} % lus' },
  own: { en: 'Your own books', fr: 'Vos propres livres' },
  addBook: { en: 'Add a book', fr: 'Ajouter un livre' },
  opening: { en: 'Opening…', fr: 'Ouverture…' },
  ownNote: {
    en: 'Add an EPUB or a text file from your device to read it here, with your place, marks and notes. The file stays in this browser: it is not sent anywhere and nobody else can see it.',
    fr: 'Ajoutez un fichier EPUB ou texte de votre appareil pour le lire ici, avec votre page, vos marques et vos notes. Le fichier reste dans ce navigateur : il n’est envoyé nulle part et personne d’autre ne le voit.',
  },
  unsupported: { en: 'Only EPUB and plain-text files can be opened (not PDF, MOBI or protected files).', fr: 'Seuls les fichiers EPUB et texte peuvent être ouverts (ni PDF, ni MOBI, ni fichiers protégés).' },
  addFailed: { en: 'That file could not be opened. It may be damaged or protected.', fr: 'Ce fichier n’a pas pu être ouvert. Il est peut-être endommagé ou protégé.' },
  ties: { en: '{n} tied', fr: '{n} liées' },
} satisfies Record<string, L>;

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
/** The note the address asks for ("#<id>"); "#claim=…" is the keeper's link, not a note. */
const hashId = () => (location.hash.includes('=') ? null : location.hash.slice(1) || null);

export default function Notebook() {
  const { tl } = useI18n();
  const shelf = useShelf();
  useQuickLoader();
  const [focus, setFocus] = useState<string | null>(hashId);
  const [query, setQuery] = useState('');
  const [tying, setTying] = useState(false);

  useEffect(() => {
    const onHash = () => setFocus(hashId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const marks = shelf.marks();
  const own = useOwnBooks();
  const reading = shelf.reading().filter((entry) => BY_ID.has(entry.bookId));
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<'busy' | 'unsupported' | 'failed' | null>(null);
  const add = async (file: File | undefined) => {
    if (!file) return;
    setAdding('busy');
    try {
      const book = await addOwnBook(file);
      location.href = `${pageUrl('')}read/${book.id}`;
    } catch (error) {
      setAdding(error instanceof Error && error.message === 'unsupported' ? 'unsupported' : 'failed');
    }
  };
  const wanted = fold(query.trim());
  const shown = wanted
    ? marks.filter((mark) => fold(`${mark.quote ?? ''} ${mark.note} ${bookOf(mark)?.title ?? ''} ${bookOf(mark)?.author ?? ''}`).includes(wanted))
    : marks;
  const current = (focus && shelf.mark(focus)) || null;

  const go = (id: string | null) => {
    setTying(false);
    setFocus(id);
    history.replaceState(history.state, '', id ? `#${id}` : location.pathname);
  };

  const write = () => go(shelf.addMark({}).id);

  return (
    <div className="notebook">
      <PageHeader here="notebook" />
      <div className="notebook-body">
        <aside className="notebook-side" data-scroll>
          {reading.length > 0 && (
            <section>
              <p className="page-eyebrow">{tl(TEXT.reading)}</p>
              <ul className="notebook-reading">
                {reading.map(({ bookId, place }) => {
                  const book = BY_ID.get(bookId)!;
                  return (
                    <li key={bookId}>
                      <a href={`${pageUrl('')}read/${bookId}`}>
                        <img src={coverUrl(book, 'sm')} alt="" width={40} height={60} loading="lazy" />
                        <span>
                          <strong>{book.title}</strong>
                          <small>{tl(TEXT.percent).replace('{n}', String(Math.round(place.through * 100)))}</small>
                          <i style={{ transform: `scaleX(${place.through})` }} />
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <div className="notebook-row">
              <p className="page-eyebrow">{tl(TEXT.own)}</p>
              <button type="button" className="text-button" onClick={() => fileRef.current?.click()} disabled={adding === 'busy'}>
                + {tl(adding === 'busy' ? TEXT.opening : TEXT.addBook)}
              </button>
              <input ref={fileRef} type="file" accept=".epub,.txt,application/epub+zip,text/plain" hidden onChange={(event) => void add(event.target.files?.[0])} />
            </div>
            {own.length > 0 && (
              <ul className="notebook-own">
                {own.map((book) => {
                  const place = shelf.place(book.id);
                  return (
                    <li key={book.id}>
                      <a href={`${pageUrl('')}read/${book.id}`}>
                        <strong>{book.title}</strong>
                        <small>
                          {[book.author, place && tl(TEXT.percent).replace('{n}', String(Math.round(place.through * 100)))].filter(Boolean).join(' · ')}
                        </small>
                      </a>
                      <button type="button" className="text-button" onClick={() => void removeOwnBook(book.id)}>
                        {tl(NOTE_TEXT.remove)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {(adding === 'unsupported' || adding === 'failed') && <p className="card-problem">{tl(adding === 'unsupported' ? TEXT.unsupported : TEXT.addFailed)}</p>}
            <p className="card-note">{tl(TEXT.ownNote)}</p>
          </section>

          <section>
            <div className="notebook-row">
              <p className="page-eyebrow">
                {tl(TEXT.notes)} · {marks.length}
              </p>
              <button type="button" className="text-button" onClick={write}>
                + {tl(TEXT.newThought)}
              </button>
            </div>
            {marks.length > 5 && (
              <input
                className="notebook-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tl(TEXT.search)}
                aria-label={tl(TEXT.search)}
              />
            )}
            <ul className="notebook-list">
              {shown.map((mark) => (
                <li key={mark.id}>
                  <button type="button" aria-current={mark.id === focus ? 'true' : undefined} onClick={() => go(mark.id)}>
                    <span className={mark.quote ? 'tie-quote' : 'tie-note'}>{markLine(mark, 110) || tl(NOTE_TEXT.write)}</span>
                    <small>
                      {bookOf(mark)?.title ?? tl(NOTE_TEXT.thought)}
                      {mark.links.length > 0 && ` · ${tl(TEXT.ties).replace('{n}', String(mark.links.length))}`}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <AccountPanel />
          <CardPanel />
        </aside>

        <main className="notebook-main">
          {current ? (
            <NoteCard key={current.id} mark={current} tying={tying} setTying={setTying} go={go} />
          ) : marks.length === 0 ? (
            <div className="notebook-empty">
              <h1>{tl(TEXT.empty)}</h1>
              <p>{tl(TEXT.emptyWhy)}</p>
              <a className="button" href={pageUrl('first-pages')}>
                {tl(TEXT.start)}
              </a>
            </div>
          ) : (
            <div className="notebook-empty">
              <h1>{tl(TEXT.title)}</h1>
              <p>{tl(TEXT.choose)}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function NoteCard({ mark, tying, setTying, go }: { mark: Mark; tying: boolean; setTying: (value: boolean) => void; go: (id: string | null) => void }) {
  const { tl } = useI18n();
  const shelf = useShelf();
  const book = bookOf(mark);
  const url = markUrl(mark);

  return (
    <article className="note-card">
      {book && (
        <p className="page-eyebrow">
          {book.author} · {book.title}
        </p>
      )}
      {mark.quote && <blockquote>{mark.quote}</blockquote>}
      <textarea
        defaultValue={mark.note}
        placeholder={tl(NOTE_TEXT.write)}
        onChange={(event) => shelf.editMark(mark.id, { note: event.target.value })}
        autoFocus={!mark.quote && !mark.note}
        rows={mark.quote ? 3 : 6}
      />

      <section className="note-ties">
        <p className="page-eyebrow">{tl(NOTE_TEXT.tied)}</p>
        {mark.links.length > 0 && (
          <ul>
            {mark.links.map((id) => {
              const other = shelf.mark(id);
              if (!other) return null;
              return (
                <li key={id}>
                  <button type="button" className="note-tie" onClick={() => go(id)}>
                    <span className={other.quote ? 'tie-quote' : 'tie-note'}>{markLine(other, 160)}</span>
                    <small>{bookOf(other)?.title ?? tl(NOTE_TEXT.thought)}</small>
                  </button>
                  <button type="button" className="text-button note-untie" onClick={() => shelf.untie(mark.id, id)}>
                    {tl(NOTE_TEXT.untie)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tying ? (
          <TiePicker markId={mark.id} onPick={(id) => shelf.tie(mark.id, id)} onClose={() => setTying(false)} />
        ) : (
          <button type="button" className="button button-quiet" onClick={() => setTying(true)}>
            + {tl(NOTE_TEXT.tie)}
          </button>
        )}
      </section>

      <div className="note-foot">
        {url && (
          <a className="text-link" href={url}>
            {tl(NOTE_TEXT.open)} →
          </a>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            shelf.removeMark(mark.id);
            go(null);
          }}
        >
          {tl(NOTE_TEXT.remove)}
        </button>
      </div>
    </article>
  );
}
