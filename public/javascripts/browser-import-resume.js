(function() {
  var key = 'applierJobesBrowserImport';
  var hash = sessionStorage.getItem(key);
  if (!hash) return;

  sessionStorage.removeItem(key);
  if (location.pathname !== '/jobs/browser-import' && hash.startsWith('#jobs=') && hash.length <= 800000) {
    location.replace('/jobs/browser-import' + hash);
  }
})();
