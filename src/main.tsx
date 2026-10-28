import { ready } from './lib/added';
import { loadBookWords } from './lib/bookWords';
import type { Lang } from './data/types';

// The books the keeper has added must be among the others before any page reads the
// catalogue, and so must the books' words in the reader's language when it is not English or
// French; the site itself (src/start.tsx) is loaded only once they are in place.
void Promise.all([ready, loadBookWords(document.documentElement.lang as Lang)]).then(() => import('./start'));

// The service worker (public/sw.js) makes the site installable and keeps it for when there is
// no network. Only on the built site: in development it would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
