(function() {
  'use strict';

  var preference = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  function applyTheme() {
    document.documentElement.setAttribute('data-theme',
      preference && preference.matches ? 'dark' : 'light');
  }

  // Apply before stylesheets load, then follow browser preference changes.
  applyTheme();
  if (!preference) return;

  if (typeof preference.addEventListener === 'function') {
    preference.addEventListener('change', applyTheme);
  } else if (typeof preference.addListener === 'function') {
    preference.addListener(applyTheme);
  }
})();
