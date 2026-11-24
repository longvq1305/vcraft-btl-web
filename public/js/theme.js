(function() {
  'use strict';

  var STORAGE_KEY = 'vcraft-theme';
  var DEFAULT_THEME = 'light';

  function readStoredTheme() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch (err) {
      // Ignore storage access errors in restricted/private environments
    }
    return null;
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      // Ignore storage write errors
    }
  }

  function getActiveTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    return current === 'dark' ? 'dark' : DEFAULT_THEME;
  }

  function syncToggleButtons(theme) {
    var isDark = theme === 'dark';
    var nextActionLabel = isDark
      ? 'Chuyển sang giao diện Giấy dó (Sáng)'
      : 'Chuyển sang giao diện Sơn mài (Tối)';
    var modeStatusLabel = isDark
      ? 'Giao diện: Sơn mài (Tối)'
      : 'Giao diện: Giấy dó (Sáng)';

    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('aria-label', nextActionLabel);
      btn.setAttribute('title', nextActionLabel);

      var textEl = btn.querySelector('[data-theme-label]');
      if (textEl) {
        textEl.textContent = modeStatusLabel;
      }
    }
  }

  function applyTheme(theme, persist) {
    var normalized = theme === 'dark' ? 'dark' : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', normalized);
    if (persist) {
      saveTheme(normalized);
    }
    syncToggleButtons(normalized);
  }

  // Default strictly to Light Mode ("Giấy dó") unless user explicitly chose Dark Mode ("Sơn mài")
  var initialTheme = readStoredTheme() || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', initialTheme);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      syncToggleButtons(getActiveTheme());
    });
  } else {
    syncToggleButtons(initialTheme);
  }

  document.addEventListener('click', function(event) {
    var toggleBtn = event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
    if (!toggleBtn) return;

    event.preventDefault();
    var nextTheme = getActiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
  });

  window.addEventListener('storage', function(event) {
    if (event.key === STORAGE_KEY) {
      var updated = event.newValue === 'dark' ? 'dark' : DEFAULT_THEME;
      applyTheme(updated, false);
    }
  });
})();
