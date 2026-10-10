import type { MouseEvent } from 'react';
import { SITE_NAME, useI18n } from '../i18n';
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

  return (
    <header className="header">
      <button type="button" className="wordmark" onClick={onHome} aria-label={t('backToIntro')} inert={!showHome}>
        {SITE_NAME}
      </button>
      <nav className="header-actions">
        <button type="button" className="header-link" onClick={onOpenIndex}>
          {t('index')}
        </button>
        <div className="lang" role="group" aria-label={t('language')} data-lang={lang}>
          <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
          <button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>
            FR
          </button>
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
