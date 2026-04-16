/**
 * JapanJunky Auth — Screen-swap, keystroke dispatch, error handling
 *
 * Manages the login/register/reset screen-swap within the jj-auth panel.
 * Dispatches 'jj-auth-keystroke' custom events on document for the
 * screensaver's Tsuno eye-tracking behavior.
 */
(function () {
  'use strict';

  var panel = document.getElementById('jj-auth');
  if (!panel) return;

  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Screen Swap ───────────────────────────────────────────
  function swapScreen(targetId) {
    var screens = panel.querySelectorAll('.jj-auth__screen');

    if (prefersReducedMotion) {
      for (var i = 0; i < screens.length; i++) {
        screens[i].style.display = 'none';
      }
      var target = document.getElementById(targetId);
      target.style.display = 'block';
      var firstInput = target.querySelector('input:not([type="hidden"])');
      if (firstInput) firstInput.focus();
      return;
    }

    panel.classList.add('jj-auth--flash');

    setTimeout(function () {
      for (var i = 0; i < screens.length; i++) {
        screens[i].style.display = 'none';
      }
      var target = document.getElementById(targetId);
      target.style.display = 'block';
      panel.classList.remove('jj-auth--flash');

      var firstInput = target.querySelector('input:not([type="hidden"])');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // ─── Swap Link Handlers ────────────────────────────────────
  var swapLinks = [
    { id: 'jj-auth-to-register',          target: 'jj-auth-register' },
    { id: 'jj-auth-to-login',             target: 'jj-auth-login' },
    { id: 'jj-auth-forgot-link',          target: 'jj-auth-reset' },
    { id: 'jj-auth-to-login-from-reset',  target: 'jj-auth-login' }
  ];

  for (var i = 0; i < swapLinks.length; i++) {
    (function (link) {
      var el = document.getElementById(link.id);
      if (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          swapScreen(link.target);
        });
      }
    })(swapLinks[i]);
  }

  // ─── Keystroke Dispatch (for Tsuno eye-tracking) ───────────
  var authInputs = panel.querySelectorAll('input:not([type="hidden"])');
  var keystrokeEvent = new CustomEvent('jj-auth-keystroke');

  for (var j = 0; j < authInputs.length; j++) {
    authInputs[j].addEventListener('keydown', function () {
      document.dispatchEvent(keystrokeEvent);
    });
  }

  // ─── Error Handling ────────────────────────────────────────
  // Shopify password recovery redirects to /account/login#recover
  if (window.location.hash === '#recover') {
    swapScreen('jj-auth-reset');
  }

  // Focus first visible input on load
  var visibleScreen = panel.querySelector('.jj-auth__screen[style=""]') ||
                      panel.querySelector('.jj-auth__screen:not([style*="display:none"])');
  if (visibleScreen) {
    var firstInput = visibleScreen.querySelector('input:not([type="hidden"])');
    if (firstInput) firstInput.focus();
  }

})();
