import { useEffect, useState } from 'react';
import type { Book, L } from '../data/types';
import { useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { essays, essayUrl, isProblem, personUrl, writeUrl, type EssaySummary } from '../lib/people';
import { pageUrl } from '../pages/PageHeader';
import { Avatar } from './Avatar';

/*
  On a book's page (BookSheet.tsx), below what readers say: the essays the keeper approved
  on this book, and a way to write one.
*/

const TEXT = {
  title: { en: 'Essays', fr: 'Essais', ru: 'Эссе', vi: 'Bài luận' },
  none: { en: 'No reader has written an essay on this book yet.', fr: 'Aucun lecteur n’a encore écrit d’essai sur ce livre.', ru: 'Об этой книге ещё никто не написал эссе.', vi: 'Chưa có bạn đọc nào viết bài luận về cuốn sách này.' },
  write: { en: 'Write about this book', fr: 'Écrire sur ce livre', ru: 'Написать об этой книге', vi: 'Viết về cuốn sách này' },
  all: { en: 'Every essay on this book', fr: 'Tous les essais sur ce livre', ru: 'Все эссе об этой книге', vi: 'Mọi bài luận về cuốn sách này' },
} satisfies Record<string, L>;

const SHOWN = 3;

export function BookEssays({ book }: { book: Book }) {
  const { tl, lang } = useI18n();
  const { card: mine } = useCard();
  const [list, setList] = useState<EssaySummary[] | null>(null);

  useEffect(() => {
    setList(null);
    void essays.list({ book: book.id }).then((answer) => setList(isProblem(answer) ? [] : answer.essays));
  }, [book.id]);

  const target = writeUrl({ book: book.id });
  const write = mine?.name ? target : `${pageUrl('signin')}?next=${encodeURIComponent(target)}`;

  return (
    <section className="sheet-section book-essays" aria-labelledby="book-essays-title">
      <h2 id="book-essays-title">{tl(TEXT.title)}</h2>
      {list && list.length === 0 && <p className="book-essays-none">{tl(TEXT.none)}</p>}
      {!!list?.length && (
        <ul>
          {list.slice(0, SHOWN).map((essay) => (
            <li key={essay.id}>
              <a href={essayUrl(essay.id)}>
                <strong>{essay.title}</strong>
                <span className="book-essays-excerpt">{essay.excerpt}</span>
              </a>
              <small>
                <a href={personUrl(essay.author)}>
                  <Avatar name={essay.author} tone={essay.tone} size="sm" />
                  {essay.author}
                </a>
                <time dateTime={new Date(essay.at).toISOString()}>{new Date(essay.at).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>
              </small>
            </li>
          ))}
        </ul>
      )}
      <p className="book-essays-more">
        <a className="text-link" href={write}>
          <span className="u">{tl(TEXT.write)}</span> →
        </a>
        {list && list.length > SHOWN && (
          <a className="text-link" href={`${pageUrl('essays')}?book=${book.id}`}>
            <span className="u">{tl(TEXT.all)}</span>
          </a>
        )}
      </p>
    </section>
  );
}
