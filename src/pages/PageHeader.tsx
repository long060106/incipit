import { useEffect, useRef, type ReactNode } from 'react';
import { LANGS } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { runLoader } from '../lib/loader';
import './pages.css';

export type PageId = 'first-pages' | 'daily' | 'globe' | 'notebook' | 'essays' | 'about' | 'signin';

export const PAGE_LINKS: { id: Exclude<PageId, 'signin'>; label: 'navFirst' | 'navDaily' | 'navGlobe' | 'navNotebook' | 'navEssays' | 'navAbout' }[] = [
  { id: 'first-pages', label: 'navFirst' },
  { id: 'daily', label: 'navDaily' },
  { id: 'globe', label: 'navGlobe' },
  { id: 'essays', label: 'navEssays' },
  { id: 'notebook', label: 'navNotebook' },
  { id: 'about', label: 'navAbout' },
];

export const pageUrl = (id: PageId | 'privacy' | 'terms' | '') => `${import.meta.env.BASE_URL}${id}`;

/** The load screen of index.html is not shown on the inner pages: this takes it off at once. */
export function useQuickLoader() {
  useEffect(() => runLoader(() => undefined), []);
}

/** The bar across the top of the inner pages: the name leads home, then the other pages. */
export function PageHeader({ here, children }: { here?: PageId; children?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { card: mine } = useCard();
  const navRef = useRef<HTMLElement>(null);
  // Where the links scroll sideways (a phone), the page's own link is brought into view.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += current.getBoundingClientRect().left - nav.getBoundingClientRect().left - 24;
  }, [here]);
  return (
    <header className="page-head">
      <a className="page-wordmark" href={pageUrl('')}>
        {SITE_NAME}
      </a>
      <nav className="page-nav" ref={navRef}>
        {PAGE_LINKS.map((link) => (
          <a key={link.id} href={pageUrl(link.id)} aria-current={link.id === here ? 'page' : undefined}>
            {t(link.label)}
          </a>
        ))}
        <a className="page-account" href={pageUrl('signin')} aria-current={here === 'signin' ? 'page' : undefined}>
          {mine?.name ?? t('navSignIn')}
        </a>
        {children}
        <div className="lang" role="group" aria-label={t('language')} data-lang={lang}>
          {LANGS.map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
