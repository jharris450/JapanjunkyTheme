/**
 * Japanjunky — Explorer window behavior (content pages)
 *
 * The Win98 file-browser chrome rendered by snippets/win98-explorer.liquid:
 *  - drag by the titlebar (translate; html{zoom} divided out, guy.js pattern)
 *  - minimize -> window hides, a taskbar tab appears; tab click restores
 *  - maximize -> toggles a fill-the-screen state
 *  - close    -> CRT power-off, then back to the homepage "desktop"
 */
(function () {
  'use strict';

  var win = document.getElementById('jj-explorer');
  if (!win) return;

  var bar = document.getElementById('jj-explorer-titlebar');
  var minBtn = document.getElementById('jj-explorer-min');
  var maxBtn = document.getElementById('jj-explorer-max');
  var closeBtn = document.getElementById('jj-explorer-close');
  var backBtn = document.getElementById('jj-explorer-back');
  var fwdBtn = document.getElementById('jj-explorer-fwd');
  var goBtn = document.getElementById('jj-explorer-go');
  var tabsHost = document.getElementById('jj-taskbar-tabs');

  function zoomOf() {
    return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  }

  // ── Drag ──────────────────────────────────────────────────────
  var tx = 0, ty = 0;
  if (bar) {
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.jj-explorer__ctl')) return;
      if (win.classList.contains('jj-explorer--max')) return;
      var z = zoomOf();
      var sx = e.clientX, sy = e.clientY, ox = tx, oy = ty;
      function move(ev) {
        // clientX/Y are visual px under html{zoom}; translate px are CSS px
        // that the zoom re-scales at paint — divide the zoom back out.
        tx = ox + (ev.clientX - sx) / z;
        ty = oy + (ev.clientY - sy) / z;
        win.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  // ── CRT off helper: play the power-off, then run fn ──────────
  function crtOff(fn) {
    win.classList.add('jj-explorer--off');
    setTimeout(function () {
      win.classList.remove('jj-explorer--off');
      fn();
    }, 280); // jj-crt-off runs 0.3s ease-in
  }

  // ── Minimize -> taskbar tab ───────────────────────────────────
  var tab = null;
  function restore() {
    if (tab) { tab.remove(); tab = null; }
    win.style.display = '';
    // replay the power-on flash
    win.classList.remove('jj-explorer--on');
    void win.offsetWidth;
    win.classList.add('jj-explorer--on');
  }

  if (minBtn) {
    minBtn.addEventListener('click', function () {
      crtOff(function () {
        win.style.display = 'none';
        if (!tabsHost || tab) return;
        tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'jj-taskbar-tab';
        tab.textContent = win.getAttribute('data-title') || 'Window';
        tab.addEventListener('click', restore);
        tabsHost.appendChild(tab);
      });
    });
  }

  // ── Maximize toggle ───────────────────────────────────────────
  var preMaxTransform = '';
  if (maxBtn) {
    maxBtn.addEventListener('click', function () {
      var max = win.classList.toggle('jj-explorer--max');
      if (max) {
        preMaxTransform = win.style.transform;
        win.style.transform = '';
      } else {
        win.style.transform = preMaxTransform;
      }
    });
  }

  // ── Close -> power off -> homepage desktop ───────────────────
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      crtOff(function () {
        win.style.display = 'none';
        window.location.href = '/';
      });
    });
  }

  // ── Toolbar ───────────────────────────────────────────────────
  if (backBtn) backBtn.addEventListener('click', function () { window.history.back(); });
  if (fwdBtn) fwdBtn.addEventListener('click', function () { window.history.forward(); });
  if (goBtn) goBtn.addEventListener('click', function () { window.location.reload(); });
})();
