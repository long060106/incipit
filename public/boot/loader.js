// The bar creeps forward by itself until the page's code arrives and takes it over (src/lib/loader.ts).
(function () {
  var el = document.getElementById('loader');
  // Not on a page after the first of the visit (the file theme.js has usually hidden it already).
  if (document.documentElement.classList.contains('no-loader')) return;
  try {
    if (sessionStorage.getItem('incipit:arrived')) {
      el.style.display = 'none';
      return;
    }
  } catch (e) {}
  var count = el.querySelector('.loader-count');
  var state = { shown: 0, stop: function () { cancelAnimationFrame(frame); } };
  var frame = 0;
  function tick() {
    frame = requestAnimationFrame(tick);
    state.shown += (0.3 - state.shown) * 0.012;
    el.style.setProperty('--loaded', state.shown.toFixed(4));
    count.textContent = String(Math.round(state.shown * 100));
  }
  document.documentElement.classList.add('is-loading');
  window.__loader = state;
  tick();
})();
