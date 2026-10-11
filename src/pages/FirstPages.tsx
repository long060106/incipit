import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import { OPENINGS } from '../data/openings';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './first-pages.css';

/*
  Choosing a book by its voice (/first-pages). The reader is shown the first lines of a book
  and nothing else: no cover, no title, no author. If the voice holds them they turn the page
  over to see what it is, and can read on from the very next line. Only books out of
  copyright are here, since only their text is on the site.
*/

const TEXT = {
  eyebrow: { en: 'A first page', fr: 'Une première page' },
  turn: { en: 'Turn it over', fr: 'Retourner la page' },
  another: { en: 'Another voice', fr: 'Une autre voix' },
  readOn: { en: 'Read on', fr: 'Lire la suite' },
  about: { en: 'About this book', fr: 'À propos du livre' },
  hint: {
    en: 'No cover, no name. If the voice holds you, turn the page over.',
    fr: 'Ni couverture, ni nom. Si la voix vous retient, retournez la page.',
  },
} satisfies Record<string, L>;

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FirstPages() {
  const { tl } = useI18n();
  useQuickLoader();
  const order = useMemo(() => shuffled(Object.keys(OPENINGS).filter((id) => BY_ID.has(id) && OPENINGS[id].lines.length)), []);
  const [at, setAt] = useState(0);
  const [turned, setTurned] = useState(false);

  const id = order[at % order.length];
  const book = BY_ID.get(id)!;
  const opening = OPENINGS[id];

  // Turned over, the book comes into view below the lines.
  const bookRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (turned) bookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [turned]);

  const another = useCallback(() => {
    setTurned(false);
    setAt((value) => value + 1);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') another();
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) setTurned(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [another]);

  const year = book.year < 0 ? `${-book.year} BC` : String(book.year);

  return (
    <div className="first">
      <PageHeader here="first-pages" />
      <main className="first-stage">
        <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>

        <div className="first-lines" key={id}>
          {opening.lines.map((line, index) => (
            <p key={index} className={line.includes('\n') ? 'is-verse' : undefined}>
              {line}
            </p>
          ))}
        </div>

        {turned ? (
          <section className="first-book" key={`${id}-book`} ref={bookRef}>
            <img src={coverUrl(book, 'md')} alt="" width={132} height={198} />
            <div>
              <h1>{book.title}</h1>
              <p className="first-author">
                {book.author}, {year}
              </p>
              <p className="first-place">{tl(book.setting.place)}</p>
              <div className="first-actions">
                <a className="button" href={`${pageUrl('')}read/${book.id}#${opening.section}:0`}>
                  {tl(TEXT.readOn)}
                </a>
                <a className="button button-quiet" href={`${pageUrl('')}#book=${book.id}`}>
                  {tl(TEXT.about)}
                </a>
              </div>
            </div>
          </section>
        ) : (
          <p className="first-hint">{tl(TEXT.hint)}</p>
        )}

        <div className="first-choice">
          {!turned && (
            <button type="button" className="button" onClick={() => setTurned(true)}>
              {tl(TEXT.turn)}
            </button>
          )}
          <button type="button" className="button button-quiet" onClick={another}>
            {tl(TEXT.another)} →
          </button>
        </div>
      </main>
    </div>
  );
}
