import { StrictMode } from 'react';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
