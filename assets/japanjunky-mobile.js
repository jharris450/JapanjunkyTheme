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

  var startY = null, startTop = 0, lastY = 0, lastT = 0, vel = 0, momentumRaf = null;

  function cancelMomentum() {
    if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = null; }
  }

  document.addEventListener('touchstart', function (e) {
    var t = e.target;
    // Native scroll handles descendants of the wrapper; chrome bars and
    // menus manage their own gestures.
    if (t.closest && t.closest('#jj-scroll, .jj-taskbar, .jj-start-menu, .jj-vol-popup, .jj-calendar-popover')) return;
    cancelMomentum();
    startY = lastY = e.touches[0].clientY;
    lastT = performance.now();
    startTop = sc.scrollTop;
    vel = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    var y = e.touches[0].clientY;
    var now = performance.now();
    var dt = now - lastT;
    if (dt > 0) vel = (lastY - y) / dt; // px/ms, positive = scrolling down
    lastY = y; lastT = now;
    sc.scrollTop = startTop + (startY - y);
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (startY === null) return;
    startY = null;
    // Glide: decay the release velocity like a native fling.
    var v = vel * 16; // px per ~60fps frame
    if (Math.abs(v) < 2) return;
    function glide() {
      sc.scrollTop += v;
      v *= 0.95;
      momentumRaf = Math.abs(v) >= 0.5 ? requestAnimationFrame(glide) : null;
    }
    momentumRaf = requestAnimationFrame(glide);
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
