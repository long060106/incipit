import { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import { useI18n } from '../i18n';
import { Dialog } from './Dialog';
import { CloseIcon } from './Icons';

const sortKey = (title: string) => title.replace(/^(The|A|An)\s+/i, '');
const byName = new Intl.Collator();
/** How many rows are written at a time: the rest follow as the reader nears the end of the list. */
const STEP = 300;

interface IndexDialogProps {
  /** True while the dialog plays its closing animation. */
  leaving: boolean;
  onClose: () => void;
  onOpenBook: (bookId: string) => void;
}

/** The whole catalogue as a plain alphabetical list, plus a note on where everything comes from. */
export function IndexDialog({ leaving, onClose, onOpenBook }: IndexDialogProps) {
  const { t } = useI18n();
  const books = useMemo(() => [...BOOKS].sort((a, b) => byName.compare(sortKey(a.title), sortKey(b.title))), []);
  const [shown, setShown] = useState(STEP);
  const end = useRef<HTMLLIElement>(null);
  const more = shown < books.length;

  useEffect(() => {
    if (!more || !end.current) return;
    const watch = new IntersectionObserver(([seen]) => seen.isIntersecting && setShown((n) => n + STEP), { rootMargin: '800px' });
    watch.observe(end.current);
    return () => watch.disconnect();
  }, [more, shown]);

  return (
    <Dialog onClose={onClose} leaving={leaving} labelledBy="index-title" className="index">
      <button type="button" className="icon-button sheet-close" onClick={onClose} aria-label={t('close')}>
        <CloseIcon />
      </button>
      <div className="index-body" data-scroll>
        <header className="index-head">
          <h1 id="index-title">{t('indexTitle')}</h1>
          <p>{t('indexIntro')}</p>
        </header>
        <ol className="index-list">
          {books.slice(0, shown).map((book) => (
            <li key={book.id}>
              <button type="button" onClick={() => onOpenBook(book.id)}>
                <span className="index-book">{book.title}</span>
                <span className="index-author">{book.author}</span>
              </button>
            </li>
          ))}
          {more && <li ref={end} aria-hidden="true" />}
        </ol>
        <section className="about">
          <h2>{t('aboutTitle')}</h2>
          <p>{t('aboutBody')}</p>
        </section>
      </div>
    </Dialog>
  );
}
