/**
 * japanjunky-viewer-window.js
 * Standalone Win98 viewer window (product page 3D cover + vinyl) — a SECOND
 * window beside the spec-sheet explorer. Drag / resize / min / max / close,
 * reusing the explorer's translate-relative mechanics but scoped to its own
 * ids so the shared japanjunky-explorer.js (id #jj-explorer) is untouched.
 * Also owns click-to-focus z-index raising for BOTH windows on the page.
 */
(function () {
  'use strict';

  var win = document.getElementById('jj-viewerwin');
  if (!win) return;

  var bar = document.getElementById('jj-viewerwin-titlebar');
  var minBtn = document.getElementById('jj-viewerwin-min');
  var maxBtn = document.getElementById('jj-viewerwin-max');
  var closeBtn = document.getElementById('jj-viewerwin-close');
  var tabsHost = document.getElementById('jj-taskbar-tabs');
  var specWin = document.getElementById('jj-explorer');
  var docTitle = win.getAttribute('data-title') || '3D Viewer';

  function zoomOf() {
    return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  }

  // ── Click-to-focus: raise the clicked window above the other ──
  function raise(el) {
    if (specWin) specWin.style.zIndex = (el === specWin) ? '2' : '1';
    win.style.zIndex = (el === win) ? '2' : '1';
  }
  [win, specWin].forEach(function (el) {
    if (el) el.addEventListener('pointerdown', function () { raise(el); }, true);
  });
  raise(win); // graphic window starts on top

  // ── Drag ──────────────────────────────────────────────────────
  var tx = 0, ty = 0;
  function applyXf() { win.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; }

  if (bar && !window.JJ_MOBILE) {
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.jj-explorer__ctl')) return;
      if (win.classList.contains('jj-explorer--max')) return;
      var z = zoomOf();
      var sx = e.clientX, sy = e.clientY, ox = tx, oy = ty;
      function move(ev) {
        // clientX/Y are visual px under html{zoom}; translate px are CSS px
        // the zoom re-scales at paint — divide the zoom back out.
        tx = ox + (ev.clientX - sx) / z;
        ty = oy + (ev.clientY - sy) / z;
        applyXf();
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

  // ── Resize (edges + corners) ──────────────────────────────────
  var MIN_W = 300, MIN_H = 260;
  var rsLocked = false;
  function lockLayout() {
    if (rsLocked) return;
    rsLocked = true;
    var prev = win.offsetLeft;
    win.style.marginLeft = '0';
    win.style.marginRight = '0';
    tx += prev - win.offsetLeft;
    applyXf();
  }
  win.querySelectorAll('.jj-explorer__rs').forEach(function (h) {
    h.addEventListener('pointerdown', function (e) {
      if (window.JJ_MOBILE) return;
      if (win.classList.contains('jj-explorer--max')) return;
      lockLayout();
      var dir = h.getAttribute('data-rs');
      var z = zoomOf();
      var sx = e.clientX, sy = e.clientY;
      var w0 = win.offsetWidth, h0 = win.offsetHeight, ox = tx, oy = ty;
      function move(ev) {
        var dx = (ev.clientX - sx) / z;
        var dy = (ev.clientY - sy) / z;
        if (dir.indexOf('e') !== -1) {
          win.style.width = Math.max(MIN_W, w0 + dx) + 'px';
          win.style.maxWidth = 'none';
        }
        if (dir.indexOf('w') !== -1) {
          var ww = Math.max(MIN_W, w0 - dx);
          win.style.width = ww + 'px';
          win.style.maxWidth = 'none';
          tx = ox - (ww - w0); // grow leftward, keep east edge planted
        }
        if (dir.indexOf('s') !== -1) {
          win.style.height = Math.max(MIN_H, h0 + dy) + 'px';
        }
        if (dir.indexOf('n') !== -1) {
          var hn = Math.max(MIN_H, h0 - dy);
          win.style.height = hn + 'px';
          ty = oy - (hn - h0); // grow upward, keep south edge planted
        }
        applyXf();
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      e.preventDefault();
    });
  });

  // ── CRT off helper ────────────────────────────────────────────
  function crtOff(fn) {
    win.classList.add('jj-explorer--off');
    setTimeout(function () {
      win.classList.remove('jj-explorer--off');
      fn();
    }, 280); // jj-crt-off runs 0.3s ease-in
  }

  // ── Minimize / Close -> taskbar tab (recoverable) ─────────────
  var tab = null;
  function restore() {
    if (tab) { tab.remove(); tab = null; }
    win.style.display = '';
    win.classList.remove('jj-explorer--on');
    void win.offsetWidth;
    win.classList.add('jj-explorer--on');
    raise(win);
  }
  function hideToTab() {
    crtOff(function () {
      win.style.display = 'none';
      if (!tabsHost || tab) return;
      tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'jj-taskbar-tab';
      tab.textContent = docTitle;
      tab.addEventListener('click', restore);
      tabsHost.appendChild(tab);
    });
  }
  if (minBtn) minBtn.addEventListener('click', hideToTab);
  if (closeBtn) closeBtn.addEventListener('click', hideToTab);

  // ── Maximize toggle ───────────────────────────────────────────
  var preMax = null;
  if (maxBtn) {
    maxBtn.addEventListener('click', function () {
      var max = win.classList.toggle('jj-explorer--max');
      if (max) {
        preMax = {
          transform: win.style.transform,
          width: win.style.width,
          height: win.style.height,
          maxWidth: win.style.maxWidth,
          marginLeft: win.style.marginLeft,
          marginRight: win.style.marginRight
        };
        win.style.transform = '';
        win.style.width = '';
        win.style.height = '';
        win.style.maxWidth = '';
        win.style.marginLeft = '';
        win.style.marginRight = '';
      } else if (preMax) {
        win.style.transform = preMax.transform;
        win.style.width = preMax.width;
        win.style.height = preMax.height;
        win.style.maxWidth = preMax.maxWidth;
        win.style.marginLeft = preMax.marginLeft;
        win.style.marginRight = preMax.marginRight;
      }
      raise(win);
    });
  }
  if (bar && maxBtn) {
    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('.jj-explorer__ctl')) return;
      maxBtn.click();
    });
  }
})();
