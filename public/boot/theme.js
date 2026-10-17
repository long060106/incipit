// Set theme and language before first paint so the page never flashes the wrong one.
// It is a file of its own, not written into index.html, so that the site's rules (public/_headers)
// can forbid every script written into a page.
(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem('incipit:theme');
    if (theme === 'day' || theme === 'night') root.dataset.theme = theme;
    var lang = localStorage.getItem('incipit:lang');
    if (!lang) lang = (navigator.language || 'en').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
    root.lang = lang === 'fr' ? 'fr' : 'en';
  } catch (e) {}
})();
