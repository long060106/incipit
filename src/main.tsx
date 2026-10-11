import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { installInkOrigin } from './lib/ink';
import './styles/tokens.css';
import './styles/base.css';
import './styles/stage.css';
import './styles/panel.css';
import './styles/sheet.css';
import './styles/touch.css';

installInkOrigin();

// The globe is a trial on a page of its own, loaded only there.
const GlobePage = lazy(() => import('./globe/GlobePage'));
const onGlobe = /^\/globe\/?$/.test(location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {onGlobe ? (
        <Suspense fallback={null}>
          <GlobePage />
        </Suspense>
      ) : (
        <App />
      )}
    </I18nProvider>
  </StrictMode>,
);
