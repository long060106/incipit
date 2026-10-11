import { useEffect, useState } from 'react';
import type { Around as AroundData, WikiPage } from '../data/context';
import { useI18n } from '../i18n';
import { ExternalIcon } from './Icons';

/**
 * "Around the book": Wikipedia articles on the book, its author, and the history and places
 * behind the story (src/data/context.ts, written by scripts/fetch-context.mjs). The list is
 * fetched only when a book is opened. Each link goes to the article in the interface
 * language when there is one, otherwise to the other.
 */
export function Around({ bookId }: { bookId: string }) {
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
  if (!around) return null;

  const url = (page: WikiPage) => {
    const edition = page[lang] ? lang : page.en ? 'en' : 'fr';
    return `https://${edition}.wikipedia.org/wiki/${encodeURIComponent(page[edition]!.replaceAll(' ', '_'))}`;
  };
  const links = [
    around.book && { kind: t('wikiBook'), label: around.book[lang] ?? around.book.en ?? around.book.fr!, page: around.book },
    around.author && { kind: t('wikiAuthor'), label: around.author[lang] ?? around.author.en ?? around.author.fr!, page: around.author },
    ...(around.setting ?? []).map((entry) => ({ kind: t('wikiSetting'), label: entry.page[lang] ? entry.label[lang] : entry.label.en, page: entry.page })),
  ].filter((link) => !!link);

  return (
    <section className="sheet-section">
      <h2>{t('around')}</h2>
      <ul className="around">
        {links.map((link) => (
          <li key={`${link.kind}-${link.label}`}>
            <a href={url(link.page)} target="_blank" rel="noopener noreferrer" data-outbound="wikipedia">
              <span className="around-kind">{link.kind}</span>
              <span className="around-label">{link.label.replace(/ \([^)]*\)$/, '')}</span>
              <ExternalIcon />
            </a>
          </li>
        ))}
      </ul>
      <p className="around-note">{t('aroundNote')}</p>
    </section>
  );
}
