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

  function open() { popup.hidden = false; tray.classList.add('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'true'); }
  function close() { popup.hidden = true; tray.classList.remove('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'false'); }

  btn.addEventListener('click', function (e) { e.stopPropagation(); if (popup.hidden) open(); else close(); });
  popup.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { if (!popup.hidden) close(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Escape' || e.keyCode === 27) && !popup.hidden) close(); });

  slider.addEventListener('input', function () { V.setLevel(parseInt(slider.value, 10) / 100); });
  muteCb.addEventListener('change', function () { V.setMuted(muteCb.checked); });
})();
