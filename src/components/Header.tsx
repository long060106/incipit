import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { LANGS } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { PAGE_LINKS, pageUrl } from '../pages/PageHeader';
import { MoonIcon, SunIcon } from './Icons';

export type Theme = 'night' | 'day';

interface HeaderProps {
  theme: Theme;
  /** False while the large hero word is on screen and this small one is still invisible. */
  showHome: boolean;
  onToggleTheme: (event?: MouseEvent) => void;
  onOpenIndex: () => void;
  onHome: () => void;
}

export function Header({ theme, showHome, onToggleTheme, onOpenIndex, onHome }: HeaderProps) {
  const { t, lang, setLang } = useI18n();
  const { card: mine } = useCard();
  // When the links to the other pages do not fit beside the name, they fold into one menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  // The width the bar needs to show every link. Each language has its own, measured with the
  // links out before the page is drawn, and again once the typefaces have come.
  const [need, setNeed] = useState(0);
  const [measuring, setMeasuring] = useState(true);
  const [width, setWidth] = useState(() => window.innerWidth);
  const folded = !measuring && width < need;

  useLayoutEffect(() => setMeasuring(true), [lang, mine?.name]);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!measuring || !bar) return;
    const actions = bar.querySelector('.header-actions')!;
    const mark = bar.querySelector('.wordmark')!;
    const style = getComputedStyle(bar);
    setNeed(actions.scrollWidth + mark.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 16);
    setMeasuring(false);
  }, [measuring]);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    void document.fonts?.ready.then(() => setMeasuring(true));
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const links = (
    <>
      {PAGE_LINKS.map((link) => (
        <a key={link.id} className="header-link" href={pageUrl(link.id)}>
          {t(link.label)}
        </a>
      ))}
      <a className="header-link" href={pageUrl('signin')}>
        {mine?.name ?? t('navSignIn')}
      </a>
      <button
        type="button"
        className="header-link"
        onClick={() => {
          setMenuOpen(false);
          onOpenIndex();
        }}
      >
        {t('index')}
      </button>
    </>
  );

  return (
    <header className="header" ref={barRef} data-folded={folded || undefined}>
      <button type="button" className="wordmark" onClick={onHome} aria-label={t('backToIntro')} inert={!showHome}>
        {SITE_NAME}
      </button>
      <nav className="header-actions">
        <div className="header-links">{links}</div>
        <div className="header-menu" ref={menuRef}>
          <button type="button" className="header-link" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {t('menu')}
          </button>
          {menuOpen && <div className="header-menu-list">{links}</div>}
        </div>
        <div className="lang" role="group" aria-label={t('language')} data-lang={lang}>
          {LANGS.map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleTheme}
          aria-label={theme === 'night' ? t('switchToDay') : t('switchToNight')}
        >
          <span className="theme-icon" key={theme}>
            {theme === 'night' ? <SunIcon /> : <MoonIcon />}
          </span>
        </button>
      </nav>
    </header>
  );
}
