// Set theme and language before first paint so the page never flashes the wrong one.
// It is a file of its own, not written into index.html, so that the site's rules (public/_headers)
// can forbid every script written into a page.
(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem('incipit:theme');
    if (theme === 'day' || theme === 'night') root.dataset.theme = theme;
    var langs = ['en', 'fr', 'ru', 'vi'];
    var lang = localStorage.getItem('incipit:lang');
    if (!lang) lang = (navigator.language || 'en').toLowerCase().slice(0, 2);
    root.lang = langs.indexOf(lang) >= 0 ? lang : 'en';
  } catch (e) {}
  // The load screen is for opening the home page from outside: by its address, a link, or a reload.
  // Not on the pages inside, and not on coming back to the home page from one of them (the same
  // rule as App.tsx has for its opening). See src/lib/loader.ts.
  try {
    var nav = performance.getEntriesByType('navigation')[0];
    var inside =
      !!nav &&
      (nav.type === 'back_forward' ||
        (nav.type === 'navigate' && !!document.referrer && new URL(document.referrer).origin === location.origin));
    var path = location.pathname;
    var home = path === '/' || path.indexOf('/book/') === 0;
    if (!home || inside) root.classList.add('no-loader');
  } catch (e) {}
})();
