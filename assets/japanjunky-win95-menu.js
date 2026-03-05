/**
 * Japanjunky - Win95 Start Menu + JST Clock
 *
 * Start menu toggle, outside click close, submenu cascade
 * JST clock via setInterval with Asia/Tokyo timezone
 */

(function () {
  'use strict';

  // ─── Start Menu Toggle ─────────────────────────────────────
  var startBtn = document.getElementById('jj-start-btn');
  var startMenu = document.getElementById('jj-start-menu');

  if (startBtn && startMenu) {
    startBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = startMenu.classList.toggle('jj-start-menu--open');
      startBtn.classList.toggle('jj-start-btn--active', isOpen);
      startBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!startMenu.contains(e.target) && !startBtn.contains(e.target)) {
        startMenu.classList.remove('jj-start-menu--open');
        startBtn.classList.remove('jj-start-btn--active');
        startBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && startMenu.classList.contains('jj-start-menu--open')) {
        startMenu.classList.remove('jj-start-menu--open');
        startBtn.classList.remove('jj-start-btn--active');
        startBtn.setAttribute('aria-expanded', 'false');
        startBtn.focus();
      }
    });
  }

  // ─── JST Clock ─────────────────────────────────────────────
  var clockEl = document.getElementById('jj-clock');

  if (clockEl) {
    function updateClock() {
      try {
        var now = new Date();
        var jstString = now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Tokyo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        clockEl.textContent = jstString;
      } catch (e) {
        // Fallback if Intl not supported
        var now = new Date();
        var utc = now.getTime() + now.getTimezoneOffset() * 60000;
        var jst = new Date(utc + 9 * 3600000);
        var h = jst.getHours().toString().padStart(2, '0');
        var m = jst.getMinutes().toString().padStart(2, '0');
        clockEl.textContent = h + ':' + m;
      }
    }

    updateClock();
    setInterval(updateClock, 1000);
  }
})();
