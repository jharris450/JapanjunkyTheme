/**
 * Japanjunky — Handheld-mode glue (mobile spec Phase 4)
 *
 * Homepage touch scrolling: the desktop homepage scrolls #jj-scroll via
 * wheel events that bubble from whatever layer the cursor is over — the
 * wrapper itself is pointer-events:none so hero clicks reach the bundle
 * panel underneath. Touch has no equivalent: a pan gesture only scrolls
 * an ancestor of the touched element, and hero touches land on fixed
 * layers OUTSIDE the scroll wrapper (bundle panel, scene canvas, body).
 * So: drags that start outside #jj-scroll drive scrollTop manually;
 * touches inside it (the catalog screen's grid) scroll natively and are
 * left alone. Passive listeners — taps/clicks still fire normally.
 */
(function () {
  'use strict';

  if (!window.JJ_MOBILE) return;

  var sc = document.getElementById('jj-scroll');
  if (!sc) return; // homepage only

  var startY = null, startTop = 0;

  document.addEventListener('touchstart', function (e) {
    var t = e.target;
    // Native scroll handles descendants of the wrapper; chrome bars and
    // menus manage their own gestures.
    if (t.closest && t.closest('#jj-scroll, .jj-taskbar, .jj-cmdbar, .jj-start-menu, .jj-vol-popup')) return;
    startY = e.touches[0].clientY;
    startTop = sc.scrollTop;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    sc.scrollTop = startTop + (startY - e.touches[0].clientY);
  }, { passive: true });

  document.addEventListener('touchend', function () {
    startY = null;
  }, { passive: true });
})();
