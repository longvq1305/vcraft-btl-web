(function() {
  'use strict';

  var STORAGE_KEY = 'vcraft_theme';

  var SUN_SVG = '<svg class="theme-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

  var MOON_SVG = '<svg class="theme-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  function getStoredTheme() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var value = window.localStorage.getItem(STORAGE_KEY);
        if (value === 'light' || value === 'dark') {
          return value;
        }
      }
    } catch (err) {
      // Storage access denied or restricted
    }
    return null;
  }

  function setStoredTheme(theme) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch (err) {
      // Storage access denied or quota exceeded
    }
  }

  function getSystemTheme() {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch (err) {
      // matchMedia not supported
    }
    return 'light';
  }

  var explicitTheme = getStoredTheme();

  function resolveTheme() {
    return explicitTheme || getSystemTheme();
  }

  function updateToggleButton(btn, theme) {
    var isDark = theme === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    var actionText = isDark ? 'Nền sáng' : 'Nền tối';
    var titleText = isDark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối';
    btn.setAttribute('title', titleText);
    btn.setAttribute('aria-label', titleText);

    var label = btn.querySelector('.theme-toggle-label');
    if (label) {
      label.textContent = actionText;
    }

    var iconEl = btn.querySelector('.theme-toggle-icon');
    if (iconEl) {
      if (iconEl.tagName.toLowerCase() === 'svg') {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = isDark ? SUN_SVG : MOON_SVG;
        var newSvg = wrapper.firstElementChild;
        if (newSvg && iconEl.parentNode) {
          iconEl.parentNode.replaceChild(newSvg, iconEl);
        }
      } else {
        iconEl.innerHTML = isDark ? SUN_SVG : MOON_SVG;
      }
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      updateToggleButton(buttons[i], theme);
    }
  }

  function onToggleClick(e) {
    e.preventDefault();
    var current = document.documentElement.getAttribute('data-theme') || resolveTheme();
    var nextTheme = current === 'dark' ? 'light' : 'dark';
    explicitTheme = nextTheme;
    setStoredTheme(nextTheme);
    applyTheme(nextTheme);
  }

  function initToggle() {
    var current = document.documentElement.getAttribute('data-theme') || resolveTheme();
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      updateToggleButton(buttons[i], current);
      buttons[i].removeEventListener('click', onToggleClick);
      buttons[i].addEventListener('click', onToggleClick);
    }
  }

  // 1. Immediately set theme on root before first paint to prevent FOUC
  var initialTheme = resolveTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // 2. Listen for OS theme changes when no explicit choice is stored
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var handleMediaChange = function(e) {
        if (!explicitTheme) {
          var systemTheme = e.matches ? 'dark' : 'light';
          applyTheme(systemTheme);
        }
      };
      if (mql.addEventListener) {
        mql.addEventListener('change', handleMediaChange);
      } else if (mql.addListener) {
        mql.addListener(handleMediaChange);
      }
    }
  } catch (err) {
    // Ignore matchMedia listener failure
  }

  // 3. Bind and sync toggle buttons when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggle);
  } else {
    initToggle();
  }
})();
