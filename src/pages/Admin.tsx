import { useEffect, useMemo, useRef, useState } from 'react';
import { Keeper } from '../components/Keeper';
import { BOOKS } from '../data/books';
import type { Book, L } from '../data/types';
import { useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { decide, dropFile, FILE_KINDS, keepFile, keptFiles, MAX_FILE, megabytes, printed, saveFile, useDecided, type Edits, type KeptFile } from '../lib/keeper';
import { bookLinks } from '../lib/links';
import { fold } from '../lib/match';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './admin.css';

/*
  The keeper's desk (/admin), for the card whose role is 'admin': every book of the
  catalogue in one list, with its entry to correct, its download to switch, its articles,
  and a file to put beside it. What a file does follows the book: beside a book out of
  copyright it becomes a download for every reader; beside any other book it stays the
  keeper's own, and the server gives it to no other card.
*/

const TEXT = {
  title: { en: 'Keeper’s desk', fr: 'Bureau du gardien' },
  closed: {
    en: 'This page is for the keeper of the site. Open the notebook with the keeper’s card on this device, then come back.',
    fr: 'Cette page est réservée au gardien du site. Ouvrez le carnet avec la carte du gardien sur cet appareil, puis revenez.',
  },
  toNotebook: { en: 'Go to the notebook', fr: 'Aller au carnet' },
  count: { en: '{all} books · {free} out of copyright · {held} in copyright', fr: '{all} livres · {free} libres de droits · {held} sous droits' },
  kept: { en: '{n} files kept · {size} of 400 MB', fr: '{n} fichiers conservés · {size} sur 400 Mo' },
  search: { en: 'Search a title or an author…', fr: 'Chercher un titre ou un auteur…' },
  all: { en: 'All', fr: 'Tous' },
  free: { en: 'Out of copyright', fr: 'Libres de droits' },
  held: { en: 'In copyright', fr: 'Sous droits' },
  withFile: { en: 'With a file', fr: 'Avec un fichier' },
  entry: { en: 'Entry', fr: 'Notice' },
  bookTitle: { en: 'Title', fr: 'Titre' },
  author: { en: 'Author', fr: 'Auteur' },
  year: { en: 'Year', fr: 'Année' },
  descriptionEn: { en: 'Description (English)', fr: 'Description (anglais)' },
  descriptionFr: { en: 'Description (French)', fr: 'Description (français)' },
  save: { en: 'Save', fr: 'Enregistrer' },
  saved: { en: 'Saved. Every reader sees it now.', fr: 'Enregistré. Tous les lecteurs le voient.' },
  reset: { en: 'Back to the catalogue’s wording', fr: 'Revenir au texte du catalogue' },
  failed: { en: 'Not saved. Check the fields and try again.', fr: 'Non enregistré. Vérifiez les champs et réessayez.' },
  file: { en: 'File', fr: 'Fichier' },
  fileFree: {
    en: 'This book is out of copyright. A file put here becomes a download button on its sheet, for every reader.',
    fr: 'Ce livre est libre de droits. Un fichier déposé ici devient un bouton de téléchargement sur sa fiche, pour tous les lecteurs.',
  },
  fileHeld: {
    en: 'This book is in copyright. A file put here stays yours: only this card can download it, and readers are never shown it.',
    fr: 'Ce livre est sous droits. Un fichier déposé ici reste le vôtre : seule cette carte peut le télécharger, et les lecteurs ne le voient jamais.',
  },
  choose: { en: 'Choose a file', fr: 'Choisir un fichier' },
  replace: { en: 'Replace', fr: 'Remplacer' },
  sending: { en: 'Sending… {n}%', fr: 'Envoi… {n} %' },
  download: { en: 'Download', fr: 'Télécharger' },
  remove: { en: 'Remove', fr: 'Retirer' },
  kinds: { en: 'EPUB, PDF, TXT, MOBI or AZW3, up to 60 MB.', fr: 'EPUB, PDF, TXT, MOBI ou AZW3, jusqu’à 60 Mo.' },
  'bad-name': { en: 'Only EPUB, PDF, TXT, MOBI and AZW3 files can be kept.', fr: 'Seuls les fichiers EPUB, PDF, TXT, MOBI et AZW3 peuvent être conservés.' },
  'too-large': { en: 'That file is over 60 MB.', fr: 'Ce fichier dépasse 60 Mo.' },
  'shelf-full': { en: 'The shelf is full (400 MB). Remove a file first.', fr: 'L’étagère est pleine (400 Mo). Retirez d’abord un fichier.' },
  fileFailed: { en: 'The file was not kept. Try again.', fr: 'Le fichier n’a pas été conservé. Réessayez.' },
  open: { en: 'Open its sheet', fr: 'Ouvrir sa fiche' },
  pdf: { en: 'PDF made by the site', fr: 'PDF fabriqué par le site' },
  yours: { en: 'yours only', fr: 'à vous seul' },
  everyone: { en: 'for every reader', fr: 'pour tous les lecteurs' },
  list: { en: 'List of the books in copyright', fr: 'Liste des livres sous droits' },
} satisfies Record<string, L>;

type Show = 'all' | 'free' | 'held' | 'file';

export default function Admin() {
  const { tl } = useI18n();
  const { card } = useCard();
  useQuickLoader();
  useDecided();
  const [files, setFiles] = useState<Record<string, KeptFile>>({});
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const keeper = card?.role === 'admin' ? card.code : null;

  useEffect(() => {
    if (keeper) keptFiles(keeper).then(setFiles, () => undefined);
  }, [keeper]);

  const wanted = fold(query.trim());
  const shown = useMemo(
    () =>
      [...BOOKS]
        .sort((a, b) => a.title.localeCompare(b.title))
        .filter((book) => (show === 'free' ? book.free : show === 'held' ? !book.free : show === 'file' ? files[book.id] : true))
        .filter((book) => !wanted || fold(`${book.title} ${book.author}`).includes(wanted)),
    [wanted, show, files],
  );

  if (!keeper) {
    return (
      <div className="admin">
        <PageHeader />
        <main className="admin-closed">
          <h1>{tl(TEXT.title)}</h1>
          <p>{tl(TEXT.closed)}</p>
          <a className="button" href={pageUrl('notebook')}>
            {tl(TEXT.toNotebook)}
          </a>
        </main>
      </div>
    );
  }

  const free = BOOKS.filter((book) => book.free).length;
  const keptBytes = Object.values(files).reduce((sum, file) => sum + file.bytes, 0);
  const setFile = (bookId: string, file: KeptFile | null) =>
    setFiles((before) => {
      const next = { ...before };
      if (file) next[bookId] = file;
      else delete next[bookId];
      return next;
    });

  return (
    <div className="admin">
      <PageHeader />
      <main className="admin-body">
        <h1>{tl(TEXT.title)}</h1>
        <p className="admin-count">
          {tl(TEXT.count).replace('{all}', String(BOOKS.length)).replace('{free}', String(free)).replace('{held}', String(BOOKS.length - free))}
          <br />
          {tl(TEXT.kept).replace('{n}', String(Object.keys(files).length)).replace('{size}', megabytes(keptBytes))}
        </p>

        <div className="admin-tools">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tl(TEXT.search)} aria-label={tl(TEXT.search)} />
          <div className="admin-show" role="group">
            {(['all', 'free', 'held', 'file'] as const).map((id) => (
              <button key={id} type="button" className="text-button" aria-pressed={show === id} onClick={() => setShow(id)}>
                {tl(TEXT[id === 'file' ? 'withFile' : id])}
              </button>
            ))}
          </div>
        </div>

        <ul className="admin-list">
          {shown.map((book) => {
            const file = files[book.id];
            return (
              <li key={book.id} data-open={open === book.id || undefined}>
                <button type="button" className="admin-row" aria-expanded={open === book.id} onClick={() => setOpen(open === book.id ? null : book.id)}>
                  <strong>{book.title}</strong>
                  <span>
                    {book.author} · {book.year}
                  </span>
                  <small data-free={book.free ? '' : undefined}>{tl(book.free ? TEXT.free : TEXT.held)}</small>
                  <small>{file ? `${file.name} · ${tl(book.free ? TEXT.everyone : TEXT.yours)}` : ''}</small>
                </button>
                {open === book.id && <Desk book={book} code={keeper} file={file} setFile={(next) => setFile(book.id, next)} />}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function Desk({ book, code, file, setFile }: { book: Book; code: string; file: KeptFile | undefined; setFile: (file: KeptFile | null) => void }) {
  const { tl } = useI18n();
  const first = printed(book.id)!;
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [year, setYear] = useState(String(book.year));
  const [en, setEn] = useState(book.description.en);
  const [fr, setFr] = useState(book.description.fr);
  const [state, setState] = useState<'saved' | 'failed' | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [problem, setProblem] = useState<L | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const links = bookLinks(book);

  const save = async (edits: Edits) => setState((await decide(code, book.id, { edits })) ? 'saved' : 'failed');
  const submit = () => {
    // Only what differs from the catalogue is kept, so the rest follows it if it changes.
    const edits: Edits = {};
    if (title.trim() !== first.title) edits.title = title.trim();
    if (author.trim() !== first.author) edits.author = author.trim();
    if (Number(year) !== first.year) edits.year = Number(year);
    const description: NonNullable<Edits['description']> = {};
    if (en.trim() !== first.description.en) description.en = en.trim();
    if (fr.trim() !== first.description.fr) description.fr = fr.trim();
    if (description.en || description.fr) edits.description = description;
    void save(edits);
  };
  const reset = () => {
    setTitle(first.title);
    setAuthor(first.author);
    setYear(String(first.year));
    setEn(first.description.en);
    setFr(first.description.fr);
    void save({});
  };

  const send = async (chosen: File | undefined) => {
    if (!chosen) return;
    setProblem(null);
    if (!FILE_KINDS.test(chosen.name)) return setProblem(TEXT['bad-name']);
    if (chosen.size > MAX_FILE) return setProblem(TEXT['too-large']);
    setSending(0);
    try {
      setFile(await keepFile(code, book.id, chosen, setSending));
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setProblem(reason === 'bad-name' || reason === 'too-large' || reason === 'shelf-full' ? TEXT[reason] : TEXT.fileFailed);
    }
    setSending(null);
  };

  return (
    <div className="admin-desk">
      <form
        className="admin-entry"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2>{tl(TEXT.entry)}</h2>
        <label>
          {tl(TEXT.bookTitle)}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
        </label>
        <div className="admin-pair">
          <label>
            {tl(TEXT.author)}
            <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={200} required />
          </label>
          <label>
            {tl(TEXT.year)}
            <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" pattern="-?[0-9]{1,4}" required />
          </label>
        </div>
        <label>
          {tl(TEXT.descriptionEn)}
          <textarea value={en} onChange={(event) => setEn(event.target.value)} rows={4} maxLength={1200} required />
        </label>
        <label>
          {tl(TEXT.descriptionFr)}
          <textarea value={fr} onChange={(event) => setFr(event.target.value)} rows={4} maxLength={1200} required />
        </label>
        <div className="admin-actions">
          <button type="submit" className="button">
            {tl(TEXT.save)}
          </button>
          <button type="button" className="text-button" onClick={reset}>
            {tl(TEXT.reset)}
          </button>
          <a className="text-link" href={`${pageUrl('')}#book=${book.id}`}>
            {tl(TEXT.open)} →
          </a>
        </div>
        {state && <p className={state === 'saved' ? 'card-note' : 'card-problem'}>{tl(TEXT[state])}</p>}
      </form>

      <div className="admin-side">
        <section className="admin-file">
          <h2>{tl(TEXT.file)}</h2>
          <p className="card-note">{tl(book.free ? TEXT.fileFree : TEXT.fileHeld)}</p>
          {file && (
            <p className="admin-kept">
              <strong>{file.name}</strong>
              <small>
                {megabytes(file.bytes)} · {tl(book.free ? TEXT.everyone : TEXT.yours)}
              </small>
            </p>
          )}
          <div className="admin-actions">
            <button type="button" className="button button-quiet" disabled={sending !== null} onClick={() => fileRef.current?.click()}>
              {sending !== null ? tl(TEXT.sending).replace('{n}', String(Math.round(sending * 100))) : tl(file ? TEXT.replace : TEXT.choose)}
            </button>
            {file && sending === null && (
              <>
                <button type="button" className="text-button" onClick={() => void saveFile(book.id, file, code)}>
                  {tl(TEXT.download)}
                </button>
                <button type="button" className="text-button" onClick={async () => (await dropFile(code, book.id)) && setFile(null)}>
                  {tl(TEXT.remove)}
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept=".epub,.pdf,.txt,.mobi,.azw3" hidden onChange={(event) => void send(event.target.files?.[0])} />
          </div>
          <p className="card-note">{tl(TEXT.kinds)}</p>
          {problem && <p className="card-problem">{tl(problem)}</p>}
          {links.pdf && (
            <p className="card-note">
              {tl(TEXT.pdf)} · {megabytes(links.pdfBytes)}
            </p>
          )}
        </section>
        <Keeper bookId={book.id} hasPdf={!!links.pdf} />
      </div>
    </div>
  );
}
