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

  // ─── JST Clock + Retrofuture Date ───────────────────────────
  var clockEl = document.getElementById('jj-clock');

  // Pick a random year between 1970 and current year, fixed for this page load
  var retroYear = 1970 + Math.floor(Math.random() * (new Date().getFullYear() - 1970 + 1));
  window.JJ_RetroYear = retroYear;

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
        clockEl.textContent = jstString + ' \u6771\u4EAC';
      } catch (e) {
        // Fallback if Intl not supported
        var now = new Date();
        var utc = now.getTime() + now.getTimezoneOffset() * 60000;
        var jst = new Date(utc + 9 * 3600000);
        var h = jst.getHours().toString().padStart(2, '0');
        var m = jst.getMinutes().toString().padStart(2, '0');
        clockEl.textContent = h + ':' + m + ' \u6771\u4EAC';
      }
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  // ─── Clock Date Popover ───────────────────────────────────
  var clockTray = document.getElementById('jj-clock-tray');
  var clockPopover = document.getElementById('jj-clock-popover');
  var popoverDateEl = document.getElementById('jj-popover-date');

  if (clockTray && popoverDateEl) {
    // Populate date on hover (CSS handles show/hide via :hover)
    clockTray.addEventListener('mouseenter', function () {
      try {
        var now = new Date();
        var dayName = now.toLocaleDateString('en-US', {
          timeZone: 'Asia/Tokyo',
          weekday: 'long'
        });
        var month = now.toLocaleDateString('en-US', {
          timeZone: 'Asia/Tokyo',
          month: 'long'
        });
        var day = now.toLocaleDateString('en-US', {
          timeZone: 'Asia/Tokyo',
          day: 'numeric'
        });
        popoverDateEl.textContent = dayName + ', ' + month + ' ' + day + ', ' + retroYear;
      } catch (err) {
        popoverDateEl.textContent = retroYear;
      }
    });
  }

  // ─── Window Manager Integration ───────────────────────────
  // If a start menu link points to the current page, restore/focus the window
  // instead of triggering a page reload.
  var menuLinks = document.querySelectorAll('.jj-start-menu__item[href], .jj-start-submenu__item[href]');
  for (var i = 0; i < menuLinks.length; i++) {
    (function (link) {
      link.addEventListener('click', function (e) {
        if (link.pathname === window.location.pathname && window.JJ_WM) {
          e.preventDefault();
          window.JJ_WM.open('catalog');
          // Close start menu
          if (startMenu) {
            startMenu.classList.remove('jj-start-menu--open');
            startBtn.classList.remove('jj-start-btn--active');
            startBtn.setAttribute('aria-expanded', 'false');
          }
        }
        // Otherwise, let normal navigation happen
      });
    })(menuLinks[i]);
  }
})();
