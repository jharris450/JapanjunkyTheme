/**
 * japanjunky-product-grid.js
 * Screen-2 product grid: wheel paging from hero, hero UI fade,
 * card rendering + search/filter bar (relocated from ring carousel).
 *
 * Consumes: window.JJ_PRODUCTS (from jj-homepage-body.liquid)
 */
(function () {
  'use strict';

  var allProducts = window.JJ_PRODUCTS || [];

  var scroll = document.getElementById('jj-scroll');
  var gridEl = document.getElementById('jj-grid');
  if (!scroll || !gridEl) return;

  // ─── Wheel Paging (hero → grid) ────────────────────────────────
  // Grid → hero and intra-grid scrolling are native: wheel events over
  // screen 2 target elements inside the scrollable wrapper. Over the hero
  // the wrapper is pointer-events:none, so we page via this listener.

  function toGrid() {
    scroll.scrollTo({ top: scroll.clientHeight, behavior: 'smooth' });
  }

  var indicator = document.getElementById('jj-scroll-indicator');
  if (indicator) indicator.addEventListener('click', toGrid);

  document.addEventListener('wheel', function (e) {
    if (scroll.scrollTop > 1) return;                          // already past hero
    if (e.deltaY <= 0) return;                                 // downward only
    if (e.target.closest('#jj-ring')) return;                  // ring rotation owns this
    if (e.target.closest('.jj-scroll__screen--grid')) return;  // native scroll
    if (e.target.closest('.jj-taskbar') || e.target.closest('.jj-start-menu')) return;
    toGrid();
  }, { passive: true });

  // ─── Hero UI Fade ──────────────────────────────────────────────
  scroll.addEventListener('scroll', function () {
    var active = scroll.scrollTop > scroll.clientHeight * 0.5;
    document.body.classList.toggle('jj-grid-active', active);
  }, { passive: true });

})();
