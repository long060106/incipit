import { ready } from './lib/added';

// The books the keeper has added must be among the others before any page reads the
// catalogue, so the site itself (src/start.tsx) is loaded only once they are in place.
void ready.then(() => import('./start'));
