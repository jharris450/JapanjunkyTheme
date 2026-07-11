// assets/japanjunky-win95-volume.js
(function () {
  'use strict';
  var V = window.JJ_Volume;
  var tray = document.getElementById('jj-vol-tray');
  var btn = document.getElementById('jj-vol-btn');
  var popup = document.getElementById('jj-vol-popup');
  var slider = document.getElementById('jj-vol-slider');
  var muteCb = document.getElementById('jj-vol-mute-cb');
  if (!V || !tray || !btn || !popup || !slider || !muteCb) return;

  function syncUI() {
    slider.value = String(Math.round(V.getLevel() * 100));
    muteCb.checked = V.isMuted();
    var muted = V.isMuted() || V.getLevel() <= 0;
    btn.classList.toggle('jj-vol-btn--muted', muted); // CSS keys the × glyph off this
  }
  V.subscribe(function () { syncUI(); }); // also fires once immediately

  // Reparent the popup OUT of the taskbar (whose z:10010 stacking context
  // trapped it below the toolbox, 10011) but INTO #jj-crt-content: as a
  // direct wrapper child its z-index beats the toolbox, while staying under
  // the global CRT shader canvas (z 20000) so scanlines/dither cover it.
  // (On <body> it would paint above the canvas — the barrel filter makes
  // the wrapper a stacking context.) CSS positions it fixed; left is
  // anchored to the speaker button at open time.
  (document.getElementById('jj-crt-content') || document.body).appendChild(popup);

  function open() {
    // Only one taskbar panel up at a time — close start menu / calendar / toolbox.
    document.dispatchEvent(new CustomEvent('jj-panel-open', { detail: { id: 'volume' } }));
    var r = btn.getBoundingClientRect();
    // html{zoom:2.5} (japanjunky-base.css) scales rect coords to VISUAL px,
    // but style.left on the popup is CSS px that the zoom multiplies again
    // at paint — divide it back out (same handling as japanjunky-guy.js).
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    popup.style.left = ((r.left + r.width / 2) / zoom) + 'px';
    popup.hidden = false; tray.classList.add('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'true');
  }
  function close() { popup.hidden = true; tray.classList.remove('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'false'); }

  btn.addEventListener('click', function (e) { e.stopPropagation(); if (popup.hidden) open(); else close(); });
  popup.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { if (!popup.hidden) close(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Escape' || e.keyCode === 27) && !popup.hidden) close(); });

  // Another taskbar panel opened — yield to it.
  document.addEventListener('jj-panel-open', function (e) { if (e.detail && e.detail.id !== 'volume' && !popup.hidden) close(); });

  slider.addEventListener('input', function () { V.setLevel(parseInt(slider.value, 10) / 100); });
  muteCb.addEventListener('change', function () { V.setMuted(muteCb.checked); });
})();
