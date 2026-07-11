/**
 * Japanjunky - Win95 Start Menu + JST Clock
 *
 * Start menu toggle, outside click close, submenu cascade
 * JST clock via setInterval with Asia/Tokyo timezone
 */

(function () {
  'use strict';

  // ─── Tsuno mood tint → start-button logo ───────────────────
  // Day-of-week mood colors, mirroring TSUNO_MOODS.tint in
  // japanjunky-screensaver.js (Sun shy … Sat dreamy) — keep in sync.
  var TSUNO_MOOD_HEX = [
    '#ff4d2e', // Sun shy         — soft warm red
    '#ff8029', // Mon curious     — amber-orange
    '#f26b2e', // Tue lazy        — low-energy ember
    '#ff479e', // Wed mischievous — warm magenta
    '#73ff6b', // Thu watchful    — green phosphor
    '#ffcc33', // Fri energetic   — bright gold
    '#b866f2'  // Sat dreamy      — dusk violet
  ];
  document.documentElement.style.setProperty(
    '--jj-tsuno-mood', TSUNO_MOOD_HEX[new Date().getDay()]);

  // ─── Start Menu Toggle ─────────────────────────────────────
  var startBtn = document.getElementById('jj-start-btn');
  var startMenu = document.getElementById('jj-start-menu');

  if (startBtn && startMenu) {
    startBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = startMenu.classList.toggle('jj-start-menu--open');
      startBtn.classList.toggle('jj-start-btn--active', isOpen);
      startBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Only one taskbar panel up at a time — close calendar / volume / toolbox.
      if (isOpen) document.dispatchEvent(new CustomEvent('jj-panel-open', { detail: { id: 'start' } }));
    });

    // Barrel hit-slop: while the CRT shader is on, the wrapper carries an
    // extended invisible hit area (::before, japanjunky-win95.css) covering
    // where the barrel filter actually DRAWS the button. Those clicks target
    // the wrapper (the button's overflow:hidden would clip its own pseudo) —
    // forward them to the button. stopPropagation keeps the original event
    // from reaching the document-level outside-click closer below.
    var startWrap = startBtn.closest('.jj-start-menu-wrapper');
    if (startWrap) {
      startWrap.addEventListener('click', function (e) {
        if (e.target === startWrap) {
          e.stopPropagation();
          startBtn.click();
        }
      });
    }

    // Another taskbar panel opened — yield to it.
    document.addEventListener('jj-panel-open', function (e) {
      if (e.detail && e.detail.id !== 'start' && startMenu.classList.contains('jj-start-menu--open')) {
        startMenu.classList.remove('jj-start-menu--open');
        startBtn.classList.remove('jj-start-btn--active');
        startBtn.setAttribute('aria-expanded', 'false');
      }
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

  // ─── Shutdown Dialog ───────────────────────────────────────
  var shutdownTrigger = document.getElementById('jj-shutdown-trigger');
  var shutdownModal = document.getElementById('jj-shutdown');

  if (shutdownTrigger && shutdownModal) {
    var countEl = document.getElementById('jj-shutdown-count');
    var cancelBtn = document.getElementById('jj-shutdown-cancel');
    var xBtn = document.getElementById('jj-shutdown-x');
    var COUNT_FROM = 5;
    var shutdownTimer = null;
    var bootEl = document.getElementById('jj-shutdown-boot');

    var BOOT_LINES = [
      'JAPANJUNKY BIOS v3.01',
      'Copyright (C) 198X TSUNO Systems',
      '',
      'Memory Test : 640K OK',
      'Detecting drives ...',
      '  CRT-0 : PHOSPHOR DISPLAY UNIT',
      '  SND-0 : PC SPEAKER',
      'Initializing display adapter ... OK',
      'Mounting /store ............... OK',
      'Loading TSUNO kernel .......... OK',
      'Starting portal subsystem ..... OK',
      '',
      'READY.'
    ];

    function isBooting() {
      return shutdownModal.classList.contains('jj-shutdown--booting');
    }

    function abortShutdown() {
      // Once the boot sequence starts the state is terminal — ignore aborts.
      if (isBooting()) return;
      if (shutdownTimer !== null) {
        clearInterval(shutdownTimer);
        shutdownTimer = null;
      }
      shutdownModal.hidden = true;
    }

    function goToSplash() {
      // Clear the "already entered" flag so the splash portal replays, then
      // return to the homepage to "boot back up".
      try { sessionStorage.removeItem('jj-entered'); } catch (e) {}
      window.location.href = '/';
    }

    function runBootSequence() {
      shutdownModal.classList.add('jj-shutdown--booting');
      if (!bootEl) { goToSplash(); return; }
      bootEl.textContent = '';
      var i = 0;
      function nextLine() {
        if (i < BOOT_LINES.length) {
          bootEl.textContent += BOOT_LINES[i] + '\n';
          i++;
          // Blank separators flash by; text lines linger a beat.
          setTimeout(nextLine, BOOT_LINES[i - 1] === '' ? 90 : 230);
        } else {
          setTimeout(goToSplash, 1100);
        }
      }
      // Brief full-black pause before the POST log starts.
      setTimeout(nextLine, 700);
    }

    function beginBoot() {
      if (shutdownTimer !== null) {
        clearInterval(shutdownTimer);
        shutdownTimer = null;
      }
      runBootSequence();
    }

    function startShutdown() {
      // Close the start menu behind the dialog.
      if (startMenu) {
        startMenu.classList.remove('jj-start-menu--open');
        if (startBtn) {
          startBtn.classList.remove('jj-start-btn--active');
          startBtn.setAttribute('aria-expanded', 'false');
        }
      }
      var remaining = COUNT_FROM;
      if (countEl) countEl.textContent = remaining;
      shutdownModal.classList.remove('jj-shutdown--booting');
      if (bootEl) bootEl.textContent = '';
      shutdownModal.hidden = false;
      shutdownTimer = setInterval(function () {
        remaining -= 1;
        if (countEl) countEl.textContent = remaining > 0 ? remaining : 0;
        if (remaining <= 0) beginBoot();
      }, 1000);
    }

    shutdownTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      startShutdown();
    });

    if (cancelBtn) cancelBtn.addEventListener('click', abortShutdown);
    if (xBtn) xBtn.addEventListener('click', abortShutdown);

    // Clicking the dim backdrop (outside the dialog window) aborts.
    shutdownModal.addEventListener('click', function (e) {
      if (e.target === shutdownModal) abortShutdown();
    });

    // Escape aborts while the countdown is running.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !shutdownModal.hidden && !isBooting()) {
        abortShutdown();
      }
    });
  }

  // ─── JST Clock + Retrofuture Date ───────────────────────────
  var clockEl = document.getElementById('jj-clock');

  // Pick a random year between 1970 and current year, fixed for this page load
  var retroYear = 1970 + Math.floor(Math.random() * (new Date().getFullYear() - 1970 + 1));
  window.JJ_RetroYear = retroYear;

  // Start-menu sidebar © year rides the same corrupted clock
  var sidebarYear = document.getElementById('jj-sidebar-year');
  if (sidebarYear) sidebarYear.textContent = String(retroYear);

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
