import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { keepInStep } from './lib/card';
import { installInkOrigin } from './lib/ink';
import './styles/tokens.css';
import './styles/base.css';
import './styles/stage.css';
import './styles/panel.css';
import './styles/sheet.css';
import './styles/touch.css';

installInkOrigin();
keepInStep();

// The inner pages each load on their own, only when visited. Everything else is the main page.
const PAGES = {
  globe: lazy(() => import('./globe/GlobePage')),
  'first-pages': lazy(() => import('./pages/FirstPages')),
  notebook: lazy(() => import('./pages/Notebook')),
  read: lazy(() => import('./reader/ReaderPage')),
  admin: lazy(() => import('./pages/Admin')),
  about: lazy(() => import('./pages/About')),
};
const Page = PAGES[location.pathname.split('/')[1] as keyof typeof PAGES];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {Page ? (
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      ) : (
        <App />
      )}
    </I18nProvider>
  </StrictMode>,
);
