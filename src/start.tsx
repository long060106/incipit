import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { keepInStep } from './lib/card';
import { installInkOrigin } from './lib/ink';
import { installScramble } from './lib/scramble';
import './styles/tokens.css';
import './styles/base.css';
import './styles/stage.css';
import './styles/panel.css';
import './styles/sheet.css';
import './styles/touch.css';
import './styles/type.css';

installInkOrigin();
installScramble();
keepInStep();

// The inner pages each load on their own, only when visited. Everything else is the main page.
const PAGES = {
  globe: lazy(() => import('./globe/GlobePage')),
  'first-pages': lazy(() => import('./pages/FirstPages')),
  notebook: lazy(() => import('./pages/Notebook')),
  read: lazy(() => import('./reader/ReaderPage')),
  admin: lazy(() => import('./pages/Admin')),
  about: lazy(() => import('./pages/About')),
  signin: lazy(() => import('./pages/SignIn')),
  essays: lazy(() => import('./pages/Essays')),
  write: lazy(() => import('./pages/Write')),
  u: lazy(() => import('./pages/Person')),
  privacy: lazy(() => import('./pages/Legal').then((module) => ({ default: module.Privacy }))),
  terms: lazy(() => import('./pages/Legal').then((module) => ({ default: module.Terms }))),
};
const route = location.pathname.split('/')[1];
const Page = PAGES[route as keyof typeof PAGES];
// The pages share one type (styles/type.css). The reader keeps its own; the first pages keep the type of
// their text but share the bar across the top.
if (route !== 'read') document.documentElement.dataset.type = 'plate';
if (route === 'first-pages') document.documentElement.dataset.keep = 'text';

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
