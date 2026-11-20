// Theme of the curve page: the one chosen on the map page.
// (A file of its own, loaded by curve-chart.html: the content security policy of
// the map allows no script written into a page.)

// Apply the same theme the user has chosen on the main microdep page.
// Both pages run on the same origin, so they share localStorage.
(function() {
  try {
    var saved = localStorage.getItem('microdep-theme') || 'auto';
    document.documentElement.setAttribute('data-theme', saved);
  } catch (_) { /* private browsing etc. */ }
  // Re-apply when the parent storage changes. The CSS follows the attribute
  // on its own, but a chart already on screen keeps the colours it was built
  // with, so tell the module layer to repaint them too.
  window.addEventListener('storage', function (e) {
    if (e.key === 'microdep-theme' && e.newValue) {
      document.documentElement.setAttribute('data-theme', e.newValue);
      window.dispatchEvent(new Event('microdep-theme-changed'));
    }
  });
})();
