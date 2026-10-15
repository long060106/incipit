import { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { fold } from '../lib/match';
import { addOwnBook, removeOwnBook, useOwnBooks } from '../lib/mybooks';
import { useShelf, type Mark } from '../lib/shelf';
import { fileIdOf, fileMarks, LOOSE, type Folder } from '../notes/folders';
import { bookOf, markLine, markUrl, NOTE_TEXT, NoteEntry } from '../notes/notes';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './notebook.css';

/*
  The notebook (/notebook), filed like a drawer of folders (src/notes/folders.ts): a folder
  for each book the reader has marked or written in, and in it a file for each day,
  "<title>_<date>", holding that day's notes. Opening a folder lists its files; opening a file
  shows its notes, each with its ties to others. A tie leads to the folder and file of the note
  at its other end.

  What the reader is reading and the books they added from their own device are on tabs of
  their own, out of sight until asked for. The account and the library card have their own
  page (/signin).
*/

const TEXT = {
  title: { en: 'Notebook', fr: 'Carnet' },
  notes: { en: 'Folders', fr: 'Dossiers' },
  reading: { en: 'Reading', fr: 'En cours' },
  own: { en: 'Your files', fr: 'Vos fichiers' },
  newThought: { en: 'Write a thought', fr: 'Écrire une pensée' },
  search: { en: 'Search every note…', fr: 'Chercher dans toutes les notes…' },
  files: { en: '{n} files', fr: '{n} fichiers' },
  fileCount: { en: '{n} notes', fr: '{n} notes' },
  oneFile: { en: '1 file', fr: '1 fichier' },
  oneNote: { en: '1 note', fr: '1 note' },
  results: { en: '{n} notes found', fr: '{n} notes trouvées' },
  noResults: { en: 'No note has those words.', fr: 'Aucune note ne contient ces mots.' },
  empty: { en: 'Nothing here yet', fr: 'Rien ici pour le moment' },
  emptyWhy: {
    en: 'Open a book and select any words to mark them. Each book you mark gets a folder here, and each day you write in it a file of its own.',
    fr: 'Ouvrez un livre et sélectionnez des mots pour les marquer. Chaque livre marqué reçoit ici un dossier, et chaque jour où vous y écrivez, un fichier à lui.',
  },
  start: { en: 'Find a first page', fr: 'Trouver une première page' },
  readOn: { en: 'Read on', fr: 'Reprendre' },
  noReading: { en: 'No book started yet.', fr: 'Aucun livre commencé.' },
  readingNote: { en: 'Only you see this list.', fr: 'Vous seul voyez cette liste.' },
  percent: { en: '{n}% read', fr: '{n} % lus' },
  addBook: { en: 'Add a book', fr: 'Ajouter un livre' },
  opening: { en: 'Opening…', fr: 'Ouverture…' },
  ownNote: {
    en: 'Add an EPUB or a text file from your device to read it here, with your place, marks and notes. The file stays in this browser: it is not sent anywhere and nobody else can see it.',
    fr: 'Ajoutez un fichier EPUB ou texte de votre appareil pour le lire ici, avec votre page, vos marques et vos notes. Le fichier reste dans ce navigateur : il n’est envoyé nulle part et personne d’autre ne le voit.',
  },
  unsupported: { en: 'Only EPUB and plain-text files can be opened (not PDF, MOBI or protected files).', fr: 'Seuls les fichiers EPUB et texte peuvent être ouverts (ni PDF, ni MOBI, ni fichiers protégés).' },
  addFailed: { en: 'That file could not be opened. It may be damaged or protected.', fr: 'Ce fichier n’a pas pu être ouvert. Il est peut-être endommagé ou protégé.' },
  noOwn: { en: 'No file added yet.', fr: 'Aucun fichier ajouté.' },
  readBook: { en: 'Read the book', fr: 'Lire le livre' },
} satisfies Record<string, L>;

type Tab = 'notes' | 'reading' | 'own';
const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
const count = (template: string, values: Record<string, number>) => Object.entries(values).reduce((text, [key, n]) => text.replace(`{${key}}`, String(n)), template);

export default function Notebook() {
  const { tl } = useI18n();
  const shelf = useShelf();
  useQuickLoader();

  const marks = shelf.marks();
  const looseName = tl(NOTE_TEXT.thoughts);
  const folders = useMemo(() => fileMarks(marks, looseName), [marks, looseName]);
  const [tab, setTab] = useState<Tab>('notes');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const folder = folders.find((entry) => entry.id === folderId) ?? null;
  const file = folder?.files.find((entry) => entry.id === fileId) ?? folder?.files[0] ?? null;

  /** Opens the folder and file a note is kept in, and lights it. */
  const show = (mark: Mark) => {
    setTab('notes');
    setQuery('');
    setFolderId(mark.bookId ?? LOOSE);
    setFileId(fileIdOf(mark));
    setLit(mark.id);
    history.replaceState(history.state, '', `#${mark.id}`);
  };

  // "#<note id>" opens that note where it is filed (the reader's ties lead here).
  useEffect(() => {
    const fromHash = () => {
      // The account and the card used to live here: their old addresses lead to their own page now.
      if (location.hash === '#account') return location.replace(pageUrl('signin'));
      if (location.hash.startsWith('#claim=')) return location.replace(`${pageUrl('signin')}${location.hash}`);
      const id = location.hash.slice(1);
      const mark = id && !id.includes('=') ? shelf.mark(id) : undefined;
      if (mark) show(mark);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The note just lit is brought into view once its file is on the page.
  useEffect(() => {
    if (lit) document.getElementById(`note-${lit}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [lit, fileId]);

  const openFolder = (id: string | null) => {
    setFolderId(id);
    setFileId(null);
    setLit(null);
    history.replaceState(history.state, '', location.pathname);
  };

  const write = () => show(shelf.addMark({}));

  const wanted = fold(query.trim());
  const found = wanted ? marks.filter((mark) => fold(`${mark.quote ?? ''} ${mark.note} ${bookOf(mark)?.title ?? ''} ${bookOf(mark)?.author ?? ''}`).includes(wanted)) : [];

  return (
    <div className="notebook">
      <PageHeader here="notebook" />
      <div className="notebook-body" data-scroll>
        <div className="notebook-top">
          <nav className="notebook-trail" aria-label={tl(TEXT.title)}>
            <button type="button" onClick={() => (setTab('notes'), openFolder(null), setQuery(''))} aria-current={!folder && tab === 'notes' ? 'page' : undefined}>
              {tl(TEXT.title)}
            </button>
            {tab === 'notes' && folder && !wanted && (
              <>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => openFolder(folder.id)}>
                  {folder.title ?? looseName}
                </button>
                {file && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span className="notebook-trail-file">{file.name}</span>
                  </>
                )}
              </>
            )}
          </nav>
          <div className="notebook-tools">
            <div className="notebook-tabs" role="tablist">
              {(['notes', 'reading', 'own'] as Tab[]).map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {tl(TEXT[id])}
                </button>
              ))}
            </div>
            {tab === 'notes' && (
              <>
                <input
                  className="notebook-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tl(TEXT.search)}
                  aria-label={tl(TEXT.search)}
                />
                <button type="button" className="button button-quiet" onClick={write}>
                  + {tl(TEXT.newThought)}
                </button>
              </>
            )}
          </div>
        </div>

        {tab === 'reading' && <ReadingTab />}
        {tab === 'own' && <OwnTab />}
        {tab === 'notes' &&
          (wanted ? (
            <Results found={found} looseName={looseName} show={show} />
          ) : marks.length === 0 ? (
            <div className="notebook-empty">
              <h1>{tl(TEXT.empty)}</h1>
              <p>{tl(TEXT.emptyWhy)}</p>
              <a className="button" href={pageUrl('first-pages')}>
                {tl(TEXT.start)}
              </a>
            </div>
          ) : folder ? (
            <div className="notebook-folder">
              <aside className="notebook-files">
                <FolderHead folder={folder} looseName={looseName} />
                <ul>
                  {folder.files.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-current={entry.id === file?.id ? 'true' : undefined}
                        onClick={() => {
                          setFileId(entry.id);
                          setLit(null);
                        }}
                      >
                        <FileIcon />
                        <span>
                          <strong>{entry.name}</strong>
                          <small>{entry.marks.length === 1 ? tl(TEXT.oneNote) : count(tl(TEXT.fileCount), { n: entry.marks.length })}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <section className="notebook-file" aria-label={file?.name}>
                {file && (
                  <>
                    {file.marks.map((mark) => (
                      <NoteEntry
                        key={mark.id}
                        mark={mark}
                        lit={mark.id === lit}
                        follow={show}
                        place={
                          markUrl(mark) && (
                            <a className="text-link" href={markUrl(mark)!}>
                              {tl(NOTE_TEXT.open)} →
                            </a>
                          )
                        }
                      />
                    ))}
                  </>
                )}
              </section>
            </div>
          ) : (
            <ul className="notebook-drawer">
              {folders.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="folder-tile" onClick={() => openFolder(entry.id)}>
                    <span className="folder-tile-back" aria-hidden="true" />
                    <span className="folder-tile-front">
                      {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span className="folder-tile-mark" aria-hidden="true">{entry.id === LOOSE ? '✎' : '❧'}</span>}
                      <span className="folder-tile-text">
                        <strong>{entry.title ?? looseName}</strong>
                        {entry.author && <small>{entry.author}</small>}
                        <small>
                          {entry.files.length === 1 ? tl(TEXT.oneFile) : count(tl(TEXT.files), { n: entry.files.length })} ·{' '}
                          {entry.count === 1 ? tl(TEXT.oneNote) : count(tl(TEXT.fileCount), { n: entry.count })}
                        </small>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg className="file-icon" viewBox="0 0 16 20" width="13" height="16" aria-hidden="true">
      <path d="M1.5 1.5h8l5 5v12h-13z M9.5 1.5v5h5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function FolderHead({ folder, looseName }: { folder: Folder; looseName: string }) {
  const { tl } = useI18n();
  const book = BY_ID.get(folder.id);
  return (
    <div className="notebook-folder-head">
      {folder.cover && <img src={folder.cover} alt="" width={56} height={84} />}
      <div>
        <p className="page-eyebrow">{folder.author ?? tl(TEXT.notes)}</p>
        <h2>{folder.title ?? looseName}</h2>
        {book && (
          <a className="text-link" href={`${pageUrl('')}read/${book.id}`}>
            {tl(TEXT.readBook)} →
          </a>
        )}
      </div>
    </div>
  );
}

function Results({ found, looseName, show }: { found: Mark[]; looseName: string; show: (mark: Mark) => void }) {
  const { tl } = useI18n();
  if (found.length === 0) return <p className="notebook-quiet">{tl(TEXT.noResults)}</p>;
  return (
    <div className="notebook-results">
      <p className="page-eyebrow">{count(tl(TEXT.results), { n: found.length })}</p>
      <ul>
        {found.map((mark) => (
          <li key={mark.id}>
            <button type="button" onClick={() => show(mark)}>
              <span className={mark.quote ? 'tie-quote' : 'tie-note'}>{markLine(mark, 160) || tl(NOTE_TEXT.write)}</span>
              <small>
                <FileIcon /> {bookOf(mark)?.title ?? looseName}_{fileIdOf(mark).split('/')[1]}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadingTab() {
  const { tl } = useI18n();
  const shelf = useShelf();
  const reading = shelf.reading().filter((entry) => BY_ID.has(entry.bookId));
  if (reading.length === 0) return <p className="notebook-quiet">{tl(TEXT.noReading)}</p>;
  return (
    <div className="notebook-pane">
      <p className="card-note">{tl(TEXT.readingNote)}</p>
      <ul className="notebook-reading">
        {reading.map(({ bookId, place }) => {
          const book = BY_ID.get(bookId)!;
          return (
            <li key={bookId}>
              <a href={`${pageUrl('')}read/${bookId}`}>
                <img src={coverUrl(book, 'sm')} alt="" width={40} height={60} loading="lazy" />
                <span>
                  <strong>{book.title}</strong>
                  <small>
                    {book.author} · {tl(TEXT.percent).replace('{n}', String(Math.round(place.through * 100)))}
                  </small>
                  <i style={{ transform: `scaleX(${place.through})` }} />
                </span>
                <em>{tl(TEXT.readOn)} →</em>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OwnTab() {
  const { tl } = useI18n();
  const shelf = useShelf();
  const own = useOwnBooks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<'busy' | 'unsupported' | 'failed' | null>(null);
  const add = async (picked: File | undefined) => {
    if (!picked) return;
    setAdding('busy');
    try {
      const book = await addOwnBook(picked);
      location.href = `${pageUrl('')}read/${book.id}`;
    } catch (error) {
      setAdding(error instanceof Error && error.message === 'unsupported' ? 'unsupported' : 'failed');
    }
  };
  return (
    <div className="notebook-pane">
      <p className="card-note">{tl(TEXT.ownNote)}</p>
      <div className="card-actions">
        <button type="button" className="button" onClick={() => fileRef.current?.click()} disabled={adding === 'busy'}>
          + {tl(adding === 'busy' ? TEXT.opening : TEXT.addBook)}
        </button>
        <input ref={fileRef} type="file" accept=".epub,.txt,application/epub+zip,text/plain" hidden onChange={(event) => void add(event.target.files?.[0])} />
      </div>
      {(adding === 'unsupported' || adding === 'failed') && <p className="card-problem">{tl(adding === 'unsupported' ? TEXT.unsupported : TEXT.addFailed)}</p>}
      {own.length === 0 ? (
        <p className="notebook-quiet">{tl(TEXT.noOwn)}</p>
      ) : (
        <ul className="notebook-own">
          {own.map((book) => {
            const place = shelf.place(book.id);
            return (
              <li key={book.id}>
                <a href={`${pageUrl('')}read/${book.id}`}>
                  <strong>{book.title}</strong>
                  <small>{[book.author, place && tl(TEXT.percent).replace('{n}', String(Math.round(place.through * 100)))].filter(Boolean).join(' · ')}</small>
                </a>
                <button type="button" className="text-button" onClick={() => void removeOwnBook(book.id)}>
                  {tl(NOTE_TEXT.remove)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
