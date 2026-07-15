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
    if (t.closest && t.closest('#jj-scroll, .jj-taskbar, .jj-start-menu, .jj-vol-popup, .jj-calendar-popover')) return;
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

  // ─── Records list: the mobile stand-in for the ring crescent ──
  // bundle-stage.js's mobile path calls populate() when the box opens and
  // clear() when a reroll shuts it. Cards are real grid cards (JJ_GridCard
  // is exported by japanjunky-product-grid.js, which loads before the
  // bundle stage ever deals).
  var recordsEl = document.getElementById('jj-mrecords');
  window.JJ_MobileRecords = {
    populate: function (pool) {
      if (!recordsEl || !window.JJ_GridCard) return;
      recordsEl.innerHTML = '';
      for (var i = 0; i < pool.length; i++) {
        var card = window.JJ_GridCard.createCard(pool[i]);
        card.classList.add('jj-mrecords__card');
        card.style.animationDelay = (i * 120) + 'ms';
        recordsEl.appendChild(card);
      }
    },
    clear: function () {
      if (recordsEl) recordsEl.innerHTML = '';
    }
  };
})();
