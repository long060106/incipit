import { useEffect, type ReactNode } from 'react';
import { SITE_NAME, useI18n } from '../i18n';
import { runLoader } from '../lib/loader';
import './pages.css';

export type PageId = 'first-pages' | 'globe' | 'notebook';

export const PAGE_LINKS: { id: PageId; label: 'navFirst' | 'navGlobe' | 'navNotebook' }[] = [
  { id: 'first-pages', label: 'navFirst' },
  { id: 'globe', label: 'navGlobe' },
  { id: 'notebook', label: 'navNotebook' },
];

export const pageUrl = (id: PageId | '') => `${import.meta.env.BASE_URL}${id}`;

/** The load screen of index.html, kept short on the inner pages. */
export function useQuickLoader() {
  useEffect(() => runLoader(() => undefined, 450), []);
}

/** The bar across the top of the inner pages: the name leads home, then the other pages. */
export function PageHeader({ here, children }: { here?: PageId; children?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="page-head">
      <a className="page-wordmark" href={pageUrl('')}>
        {SITE_NAME}
      </a>
      <nav className="page-nav">
        {PAGE_LINKS.map((link) => (
          <a key={link.id} href={pageUrl(link.id)} aria-current={link.id === here ? 'page' : undefined}>
            {t(link.label)}
          </a>
        ))}
        {children}
        <div className="lang" role="group" aria-label={t('language')} data-lang={lang}>
          <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
          <button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>
            FR
          </button>
        </div>
      </nav>
    </header>
  );
}
