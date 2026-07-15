/**
 * Japanjunky — Explorer window behavior (content pages)
 *
 * The Win98 file-browser chrome rendered by snippets/win98-explorer.liquid:
 *  - drag by the titlebar (translate; html{zoom} divided out, guy.js pattern)
 *  - resize by edges/corners (window is centered with margin:auto, so a
 *    one-sided pull compensates half the delta through the translate)
 *  - minimize -> window hides, a taskbar tab appears; tab click restores
 *  - maximize -> fills the viewport edge-to-edge above the taskbar
 *  - close    -> CRT power-off, then back to the homepage "desktop"
 *  - address bar -> typable; DOS-ish paths route to real pages, misses
 *    raise a Win98 "path not found" message box
 *  - folder view -> C:\JAPANJUNKY listing (Folders tool / address bar);
 *    click selects (panel shows type/size/modified), dblclick opens
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
  var foldersBtn = document.getElementById('jj-explorer-folders');
  var addr = document.getElementById('jj-explorer-address');
  var mainPane = document.getElementById('jj-explorer-main');
  var filesPane = document.getElementById('jj-explorer-files');
  var tabsHost = document.getElementById('jj-taskbar-tabs');
  var statusObjects = document.getElementById('jj-explorer-status-objects');
  var panelTitle = document.getElementById('jj-explorer-panel-title');
  var panelDesc = document.getElementById('jj-explorer-panel-desc');
  var panelHint = document.getElementById('jj-explorer-panel-hint');
  var panelSel = document.getElementById('jj-explorer-panel-sel');
  var selName = document.getElementById('jj-explorer-sel-name');
  var selType = document.getElementById('jj-explorer-sel-type');
  var selSize = document.getElementById('jj-explorer-sel-size');
  var selMod = document.getElementById('jj-explorer-sel-mod');
  var selDesc = document.getElementById('jj-explorer-sel-desc');
  var errBox = document.getElementById('jj-explorer-err');
  var errMsg = document.getElementById('jj-explorer-err-msg');

  var docAddress = addr ? addr.value : 'C:\\JAPANJUNKY';
  var docTitle = win.getAttribute('data-title') || 'Window';
  var docObjects = statusObjects ? statusObjects.textContent : '';

  function zoomOf() {
    return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  }

  // ── Drag ──────────────────────────────────────────────────────
  var tx = 0, ty = 0;
  function applyXf() {
    win.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
  }
  // Handheld mode: windows are always fullscreen (japanjunky-mobile.css)
  // — no drag, no resize. Min/close/address/folder view stay live.
  if (bar && !window.JJ_MOBILE) {
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
  // The window ships centered by margin:auto, but auto margins collapse to
  // 0 once the width outgrows the container, which would make edge math
  // drift. First grab locks the margins to 0 (translate absorbs the jump),
  // then edges move by the full delta: east/south stretch in place,
  // west/north also shift the translate so the far edge stays planted.
  var MIN_W = 360, MIN_H = 240;
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
      if (window.JJ_MOBILE) return; // handheld: fullscreen, no resize
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
        tab.textContent = docTitle;
        tab.addEventListener('click', restore);
        tabsHost.appendChild(tab);
      });
    });
  }

  // ── Maximize toggle ───────────────────────────────────────────
  // Inline width/height from resizing would beat the --max rules, so both
  // get stashed and cleared alongside the drag translate.
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
    });
  }

  // Win98: double-click the titlebar toggles maximize
  if (bar && maxBtn) {
    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('.jj-explorer__ctl')) return;
      maxBtn.click();
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

  // ── Error message box (path not found) ───────────────────────
  function showErr(text) {
    if (!errBox) return;
    errMsg.textContent = text;
    errBox.hidden = false;
    var ok = document.getElementById('jj-explorer-err-ok');
    if (ok) ok.focus();
  }
  function hideErr() {
    if (errBox) errBox.hidden = true;
    if (addr) addr.focus();
  }
  ['jj-explorer-err-ok', 'jj-explorer-err-x'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', hideErr);
  });
  document.addEventListener('keydown', function (e) {
    if (errBox && !errBox.hidden && (e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      hideErr();
    }
  });

  // ── Folder view (C:\JAPANJUNKY) ───────────────────────────────
  var filesOpen = false;
  var selected = null;

  function clearSelection() {
    if (selected) selected.classList.remove('jj-explorer__file--sel');
    selected = null;
    if (panelHint) panelHint.hidden = false;
    if (panelSel) panelSel.hidden = true;
  }

  function openFiles() {
    if (!filesPane || filesOpen) return;
    filesOpen = true;
    win.classList.add('jj-explorer--files');
    filesPane.hidden = false;
    clearSelection();
    if (addr) addr.value = 'C:\\JAPANJUNKY';
    if (panelTitle) panelTitle.textContent = 'JAPANJUNKY';
    if (panelDesc) panelDesc.hidden = true;
    if (statusObjects) {
      statusObjects.textContent =
        filesPane.querySelectorAll('.jj-explorer__file').length + ' object(s)';
    }
  }

  function closeFiles() {
    if (!filesOpen) return;
    filesOpen = false;
    win.classList.remove('jj-explorer--files');
    if (filesPane) filesPane.hidden = true;
    clearSelection();
    if (panelHint) panelHint.hidden = true;
    if (addr) addr.value = docAddress;
    if (panelTitle) panelTitle.textContent = docTitle;
    if (panelDesc) panelDesc.hidden = false;
    if (statusObjects) statusObjects.textContent = docObjects;
  }

  if (foldersBtn) {
    foldersBtn.addEventListener('click', function () {
      filesOpen ? closeFiles() : openFiles();
    });
  }

  if (filesPane) {
    filesPane.querySelectorAll('.jj-explorer__file').forEach(function (f) {
      f.addEventListener('click', function () {
        if (selected) selected.classList.remove('jj-explorer__file--sel');
        selected = f;
        f.classList.add('jj-explorer__file--sel');
        if (panelHint) panelHint.hidden = true;
        if (panelSel) panelSel.hidden = false;
        var label = f.querySelector('.jj-explorer__file-label');
        if (selName) selName.textContent = label ? label.textContent : '';
        if (selType) selType.textContent = f.getAttribute('data-type') || '';
        if (selSize) selSize.textContent = f.getAttribute('data-size') || '';
        if (selMod) selMod.textContent = f.getAttribute('data-mod') || '';
        if (selDesc) selDesc.textContent = f.getAttribute('data-desc') || '';
      });
      f.addEventListener('dblclick', function () {
        var href = f.getAttribute('data-href');
        if (!href) return;
        crtOff(function () { window.location.href = href; });
      });
    });
  }

  // ── Address bar routing ───────────────────────────────────────
  // Known DOS paths come from the folder-view entries; a few aliases on
  // top. Anything else raises the Win98 message box.
  function routeTable() {
    var t = {
      '': '/',
      'DESKTOP': '/',
      'HOME': '/',
      'CATALOG': '/collections/all',
      'COLLECTIONS': '/collections/all',
      'SEARCH': '/search',
      'CART': '/cart'
    };
    if (filesPane) {
      filesPane.querySelectorAll('.jj-explorer__file').forEach(function (f) {
        var dos = (f.getAttribute('data-dos') || '').toUpperCase();
        if (dos) t[dos] = f.getAttribute('data-href');
      });
    }
    return t;
  }

  function navigateAddress() {
    if (!addr) return;
    var raw = addr.value.trim();
    if (!raw) return;
    // real URLs / site-relative paths pass straight through
    if (/^(https?:)?\/\//i.test(raw) || raw.charAt(0) === '/') {
      crtOff(function () { window.location.href = raw; });
      return;
    }
    var norm = raw.toUpperCase().replace(/\//g, '\\')
      .replace(/^C:\\/, '').replace(/^JAPANJUNKY\\?/, '')
      .replace(/\\+$/, '');
    // the drive root / PAGES folder open the folder view in place
    if (norm === '' || norm === 'C:' || norm === 'PAGES' || norm === 'FOLDERS') {
      openFiles();
      return;
    }
    var table = routeTable();
    var href = table[norm] || table['PAGES\\' + norm];
    if (href) {
      // reload if it's the page already on screen, like IE would
      crtOff(function () { window.location.href = href; });
    } else {
      showErr('Cannot find \'C:\\JAPANJUNKY\\' + norm + '\'. Make sure the ' +
        'path is correct, then try again.');
    }
  }

  if (addr) {
    addr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // don't let this same keystroke bubble to the document handler,
        // which would instantly dismiss the error box it just opened
        e.stopPropagation();
        navigateAddress();
      }
    });
  }
  if (goBtn) goBtn.addEventListener('click', navigateAddress);

  // ── Toolbar ───────────────────────────────────────────────────
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      // folder view is a light in-window "location" — Back first leaves it
      if (filesOpen) { closeFiles(); return; }
      window.history.back();
    });
  }
  if (fwdBtn) fwdBtn.addEventListener('click', function () { window.history.forward(); });

  // ── Bone-art watermark (lower-right, behind content) ──────────
  // Each page load draws one of the two Kyosai pieces at random; the
  // modifier class picks which asset vars (set inline by the snippet)
  // the CSS uses. Skeletons variant runs the flame + rim-light sprite
  // animation from japanjunky-content.css.
  var bones = document.getElementById('jj-explorer-bones');
  if (bones) {
    bones.classList.add(Math.random() < 0.5
      ? 'jj-explorer__bones--skulls'
      : 'jj-explorer__bones--skele');
  }
})();
