/**
 * Japanjunky — Handheld-mode glue.
 *
 * Homepage touch scrolling: the DESKTOP homepage keeps #jj-scroll
 * pointer-events:none and drives it with wheel deltas so hero clicks reach
 * the fixed bundle panel behind it. On mobile the whole hero cluster is
 * reparented INTO the scroll flow (bundle-stage initMobile), so there is
 * nothing behind to click through — the mobile CSS flips #jj-scroll (and all
 * its screens) back to pointer-events:auto and lets the browser scroll it
 * natively. No manual scrollTop driver: it fought native momentum and left
 * touches "caught" at the seams between the pointer-events regions. This file
 * now only owns the mobile records list.
 */
(function () {
  'use strict';

  if (!window.JJ_MOBILE) return;

  // ─── Records list: the mobile stand-in for the ring crescent ──
  // bundle-stage.js's mobile path calls populate() when the box opens and
  // clear() when a reroll shuts it. Cards are real grid cards (JJ_GridCard
  // is exported by japanjunky-product-grid.js, which loads before the
  // bundle stage ever deals).
  var recordsEl = document.getElementById('jj-mrecords');
  if (!recordsEl) return; // homepage only

  function makeCard(product) {
    var card = window.JJ_GridCard.createCard(product, 'mhero');
    card.classList.add('jj-mrecords__card');
    return card;
  }

  window.JJ_MobileRecords = {
    // populate() drops all cards at once (fallback / non-animated path).
    populate: function (pool) {
      if (!recordsEl || !window.JJ_GridCard) return;
      recordsEl.innerHTML = '';
      for (var i = 0; i < pool.length; i++) {
        var card = makeCard(pool[i]);
        card.style.animationDelay = (i * 170) + 'ms';
        recordsEl.appendChild(card);
      }
    },
    // append() adds ONE card — the bundle stage calls this per record as the
    // matching 3D record fans out of the box, so each grid card drops in in
    // sync with a record leaving the crate.
    append: function (product) {
      if (!recordsEl || !window.JJ_GridCard) return;
      recordsEl.appendChild(makeCard(product)); // drop-in animation runs on insert
    },
    clear: function () {
      if (recordsEl) recordsEl.innerHTML = '';
    }
  };
})();
