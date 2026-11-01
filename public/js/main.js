(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileToggle = document.querySelector('.mobile-nav-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (mobileToggle && mainNav) {
      mobileToggle.addEventListener('click', function() {
        const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
        mobileToggle.setAttribute('aria-expanded', String(!isExpanded));
        mainNav.classList.toggle('nav-open');
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mainNav.classList.contains('nav-open')) {
          mainNav.classList.remove('nav-open');
          mobileToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Flash message auto-dismiss and close buttons
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function(alert) {
      const closeBtn = alert.querySelector('.alert-close, .close-alert');
      if (closeBtn) {
        closeBtn.addEventListener('click', function() {
          alert.style.opacity = '0';
          setTimeout(function() {
            if (alert.parentNode) alert.parentNode.removeChild(alert);
          }, 300);
        });
      }

      // Auto dismiss success alerts after 6 seconds
      if (alert.classList.contains('alert-success')) {
        setTimeout(function() {
          alert.style.transition = 'opacity 0.4s ease';
          alert.style.opacity = '0';
          setTimeout(function() {
            if (alert.parentNode) alert.parentNode.removeChild(alert);
          }, 400);
        }, 6000);
      }
    });

    // Thumbnail switcher on product pages
    const mainProductImg = document.getElementById('main-product-image');
    const thumbButtons = document.querySelectorAll('.thumb-btn');

    if (mainProductImg && thumbButtons.length > 0) {
      thumbButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          const targetSrc = this.getAttribute('data-img-src');
          if (targetSrc) {
            mainProductImg.src = targetSrc;
            thumbButtons.forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
          }
        });
      });
    }

    // Demo account autofill
    document.addEventListener('click', function(e) {
      const demoBtn = e.target.closest ? e.target.closest('[data-demo-email]') : null;
      if (demoBtn) {
        e.preventDefault();
        const email = demoBtn.getAttribute('data-demo-email') || '';
        const password = demoBtn.getAttribute('data-demo-password') || '';
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        if (emailInput) {
          emailInput.value = email;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (passwordInput) {
          passwordInput.value = password;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // Register role tabs
    document.addEventListener('click', function(e) {
      const roleBtn = e.target.closest ? e.target.closest('[data-register-role]') : null;
      if (roleBtn) {
        e.preventDefault();
        const role = roleBtn.getAttribute('data-register-role');
        const roleInput = document.getElementById('roleInput');
        const artisanSection = document.getElementById('artisanFields');
        const submitBtn = document.getElementById('submitBtn');
        const tabs = document.querySelectorAll('[data-register-role]');

        if (roleInput) {
          roleInput.value = role;
          roleInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        tabs.forEach(function(tab) {
          const isMatch = tab.getAttribute('data-register-role') === role;
          tab.classList.toggle('active', isMatch);
          tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });

        if (artisanSection) {
          artisanSection.hidden = (role !== 'artisan');
        }

        if (submitBtn) {
          submitBtn.textContent = (role === 'artisan')
            ? 'Đăng ký hồ sơ Nghệ nhân'
            : 'Đăng ký tài khoản Người mua';
        }
      }
    });

    // Generic form submit confirmation
    document.addEventListener('submit', function(e) {
      const form = e.target && e.target.matches && e.target.matches('form') ? e.target : (e.target.closest ? e.target.closest('form') : null);
      if (form && form.hasAttribute('data-confirm')) {
        const msg = form.getAttribute('data-confirm');
        if (msg && !window.confirm(msg)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    });

    // Stop propagation on elements with data-stop-propagation
    document.addEventListener('click', function(e) {
      const stopTarget = e.target.closest ? e.target.closest('[data-stop-propagation]') : null;
      if (stopTarget) {
        e.stopPropagation();
      }
    });
    document.querySelectorAll('[data-stop-propagation]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    });

    // Page action buttons: back, reload, print
    document.addEventListener('click', function(e) {
      const actionEl = e.target.closest ? e.target.closest('[data-page-action]') : null;
      if (!actionEl) return;

      const action = actionEl.getAttribute('data-page-action');
      if (action === 'back') {
        e.preventDefault();
        if (window.history && window.history.length > 1) {
          window.history.back();
        } else {
          const fallback = actionEl.getAttribute('href');
          window.location.href = (fallback && fallback !== '#' && !fallback.startsWith('javascript:')) ? fallback : '/';
        }
      } else if (action === 'reload') {
        e.preventDefault();
        window.location.reload();
      } else if (action === 'print') {
        e.preventDefault();
        window.print();
      }
    });

    // Live image URL preview for form inputs with data-image-preview-target
    function isUnsafeScriptUrl(url) {
      const lower = (url || '').toLowerCase();
      return lower.startsWith('javascript:') ||
             lower.startsWith('vbscript:') ||
             (lower.startsWith('data:') && !lower.startsWith('data:image/'));
    }

    function bindImagePreviewListeners(container, img) {
      if (!img || img._previewBound) return;

      img.addEventListener('load', function() {
        container.classList.remove('image-preview-error');
        img.classList.remove('image-preview-error');
      });

      img.addEventListener('error', function() {
        if (img.getAttribute('src') && !container.hidden) {
          container.classList.add('image-preview-error');
          img.classList.add('image-preview-error');
        }
      });

      img._previewBound = true;

      if (img.getAttribute('src') && !container.hidden) {
        if (img.complete) {
          if (img.naturalWidth === 0) {
            container.classList.add('image-preview-error');
            img.classList.add('image-preview-error');
          } else {
            container.classList.remove('image-preview-error');
            img.classList.remove('image-preview-error');
          }
        }
      }
    }

    function updateImagePreview(input) {
      if (!input || !input.getAttribute) return;
      const targetId = input.getAttribute('data-image-preview-target');
      if (!targetId) return;

      const container = document.getElementById(targetId);
      if (!container) return;

      const img = container.querySelector('img');
      if (!img) return;

      bindImagePreviewListeners(container, img);

      const rawUrl = (input.value || '').trim();

      if (!rawUrl) {
        container.hidden = true;
        container.classList.remove('image-preview-error');
        img.classList.remove('image-preview-error');
        img.removeAttribute('src');
        return;
      }

      if (isUnsafeScriptUrl(rawUrl)) {
        container.hidden = false;
        container.classList.add('image-preview-error');
        img.classList.add('image-preview-error');
        img.removeAttribute('src');
        return;
      }

      container.classList.remove('image-preview-error');
      img.classList.remove('image-preview-error');
      container.hidden = false;
      img.src = rawUrl;
    }

    function handlePreviewTargetEvent(e) {
      const input = e.target && e.target.matches && e.target.matches('[data-image-preview-target]')
        ? e.target
        : (e.target && e.target.closest ? e.target.closest('[data-image-preview-target]') : null);
      if (input) {
        updateImagePreview(input);
      }
    }

    document.addEventListener('input', handlePreviewTargetEvent);
    document.addEventListener('change', handlePreviewTargetEvent);

    document.querySelectorAll('[data-image-preview-target]').forEach(function(input) {
      const targetId = input.getAttribute('data-image-preview-target');
      if (!targetId) return;
      const container = document.getElementById(targetId);
      if (!container) return;
      const img = container.querySelector('img');
      if (img) {
        bindImagePreviewListeners(container, img);
      }
    });
  });
})();

