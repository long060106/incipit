import { ready } from './lib/added';

// The books the keeper has added must be among the others before any page reads the
// catalogue, so the site itself (src/start.tsx) is loaded only once they are in place.
void ready.then(() => import('./start'));

// The service worker (public/sw.js) makes the site installable and keeps it for when there is
// no network. Only on the built site: in development it would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
