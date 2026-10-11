import { useEffect, useState } from 'react';
import type { Around as AroundData, WikiPage } from '../data/context';
import { useI18n } from '../i18n';
import type { Article } from '../lib/keeper';
import { ExternalIcon } from './Icons';

/**
 * "Around the book": Wikipedia articles on the book, its author, and the history and places
 * behind the story (src/data/context.ts, written by scripts/fetch-context.mjs). The list is
 * fetched only when a book is opened. Each link goes to the article in the interface
 * language when there is one, otherwise to the other. After them come the articles the
 * keeper of the site has listed for the book.
 */
export function Around({ bookId, articles = [] }: { bookId: string; articles?: Article[] }) {
  const { t, lang } = useI18n();
  const [all, setAll] = useState<Record<string, AroundData> | null>(null);

  useEffect(() => {
    let live = true;
    import('../data/context').then((module) => live && setAll(module.AROUND));
    return () => {
      live = false;
    };
  }, []);

  const around = all?.[bookId];
  if (!around && articles.length === 0) return null;

  const url = (page: WikiPage) => {
    const edition = page[lang] ? lang : page.en ? 'en' : 'fr';
    return `https://${edition}.wikipedia.org/wiki/${encodeURIComponent(page[edition]!.replaceAll(' ', '_'))}`;
  };
  const tidy = (label: string) => label.replace(/ \([^)]*\)$/, '');
  const links = [
    around?.book && { kind: t('wikiBook'), label: tidy(around.book[lang] ?? around.book.en ?? around.book.fr!), href: url(around.book) },
    around?.author && { kind: t('wikiAuthor'), label: tidy(around.author[lang] ?? around.author.en ?? around.author.fr!), href: url(around.author) },
    ...(around?.setting ?? []).map((entry) => ({ kind: t('wikiSetting'), label: tidy(entry.page[lang] ? entry.label[lang] : entry.label.en), href: url(entry.page) })),
    ...articles.map((article) => ({ kind: t('article'), label: article.title, href: article.url })),
  ].filter((link) => !!link);

  return (
    <section className="sheet-section">
      <h2>{t('around')}</h2>
      <ul className="around">
        {links.map((link) => (
          <li key={`${link.kind}-${link.href}`}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" data-outbound="around">
              <span className="around-kind">{link.kind}</span>
              <span className="around-label">{link.label}</span>
              <ExternalIcon />
            </a>
          </li>
        ))}
      </ul>
      {around && <p className="around-note">{t('aroundNote')}</p>}
    </section>
  );
}
