import { useMemo } from 'react';
import { BOOKS } from '../data/books';
import { useI18n } from '../i18n';
import { Dialog } from './Dialog';
import { CloseIcon } from './Icons';

const sortKey = (title: string) => title.replace(/^(The|A|An)\s+/i, '');

interface IndexDialogProps {
  /** True while the dialog plays its closing animation. */
  leaving: boolean;
  onClose: () => void;
  onOpenBook: (bookId: string) => void;
}

/** The whole catalogue as a plain alphabetical list, plus a note on where everything comes from. */
export function IndexDialog({ leaving, onClose, onOpenBook }: IndexDialogProps) {
  const { t } = useI18n();
  const books = useMemo(() => [...BOOKS].sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title))), []);

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
          {books.map((book) => (
            <li key={book.id}>
              <button type="button" onClick={() => onOpenBook(book.id)}>
                <span className="index-book">{book.title}</span>
                <span className="index-author">{book.author}</span>
              </button>
            </li>
          ))}
        </ol>
        <section className="about">
          <h2>{t('aboutTitle')}</h2>
          <p>{t('aboutBody')}</p>
        </section>
      </div>
    </Dialog>
  );
}
