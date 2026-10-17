/*
  The service worker: what lets the site be installed as an app and opened with no network.

  It keeps three kinds of thing:
  - the page itself, always asked of the network first, and served from the copy kept here
    only when the network does not answer;
  - the site's own files, which never change under the same name (the built code in /assets,
    covers, cursors, the pictures of the first page): kept on first use and served from here after;
  - the text of a book once it has been opened, so a book begun can be read on with no network.

  Anything under /api is never touched: cards, notebooks and the keeper's desk always go to
  the server. Nor are the PDFs under /books, which are downloads and far too large to keep.
*/
const VERSION = 'incipit-1';
const KEPT = ['/assets/', '/covers/', '/cursors/', '/hero/', '/geo/', '/icons/', '/texts/'];
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
/** The two small scripts every page runs before its code (public/boot): they may change under the same name. */
const BOOT = ['/boot/theme.js', '/boot/loader.js'];
/** The built code and styles of every page. The build writes the list in (vite.config.ts). */
const BUILT = /*BUILT*/ [];
/** The covers of the catalogue, written in the same way. */
const COVERS = /*COVERS*/ [];
/** A file kept is the same file whoever asks for it: a script tag and a fetch send different headers. */
const SAME = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        await cache.add(new Request('/', { cache: 'reload' }));
        await Promise.all(BOOT.map((path) => cache.add(new Request(path, { cache: 'reload' })).catch(() => {})));
        // Every page's code, so a page not yet visited opens with no network too. One that
        // fails to arrive is fetched when it is wanted.
        await Promise.all(BUILT.map(async (path) => (await cache.match(path, SAME)) ?? cache.add(path).catch(() => {})));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name))))
      .then(async () => {
        // The code of earlier builds is of no more use.
        if (!BUILT.length) return;
        const cache = await caches.open(VERSION);
        for (const request of await cache.keys()) {
          const { pathname } = new URL(request.url);
          if (pathname.startsWith('/assets/') && !BUILT.includes(pathname)) await cache.delete(request);
        }
      })
      .then(() => self.clients.claim()),
  );
  // The covers are fetched afterwards, a few at a time, so the wall is whole with no network.
  // It is no loss if the worker is stopped before the end: the rest are kept as they are seen.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      for (let at = 0; at < COVERS.length; at += 6) {
        await Promise.all(COVERS.slice(at, at + 6).map(async (path) => (await cache.match(path, SAME)) ?? cache.add(path).catch(() => {})));
      }
    })(),
  );
});

const keep = async (request, response) => {
  // Only whole, good answers are kept: not a part of a file, and not an error.
  if (response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
};

const keptFirst = async (request) => (await caches.match(request, SAME)) ?? keep(request, await fetch(request));

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    // Every page of the site is the same shell, so one copy under "/" serves them all.
    if (response.ok) await keep('/', response);
    return response;
  } catch {
    return (await caches.match('/', SAME)) ?? Response.error();
  }
};

const keptWhileFresher = async (request) => {
  const kept = await caches.match(request, SAME);
  const fresh = fetch(request)
    .then((response) => keep(request, response))
    .catch(() => kept ?? Response.error());
  return kept ?? fresh;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (FONTS.includes(url.origin)) return event.respondWith(keptWhileFresher(request));
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
  if (BOOT.includes(url.pathname)) return event.respondWith(keptWhileFresher(request));
  if (KEPT.some((prefix) => url.pathname.startsWith(prefix))) return event.respondWith(keptFirst(request));
});
