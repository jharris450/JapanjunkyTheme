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

  // ─── Card Rendering ────────────────────────────────────────────

  var filteredProducts = allProducts.slice();

  function textDiv(className, text) {
    var d = document.createElement('div');
    d.className = className;
    d.textContent = text;
    return d;
  }

  function createCard(p) {
    var card = document.createElement('a');
    card.className = 'jj-grid__card';
    card.href = '/products/' + encodeURIComponent(p.handle);
    card.setAttribute('data-format', p.format || '');

    var imgWrap = document.createElement('div');
    imgWrap.className = 'jj-grid__card-img-wrap';
    if (p.image) {
      var img = document.createElement('img');
      img.className = 'jj-grid__card-img';
      img.src = p.image;
      img.alt = (p.artist ? p.artist + ' - ' : '') + p.title;
      img.loading = 'lazy';
      img.width = 180;
      img.height = 180;
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = '<span class="jj-grid__card-noimg">&#9670;</span>';
    }
    card.appendChild(imgWrap);

    if (p.artist) card.appendChild(textDiv('jj-grid__card-artist', p.artist));
    card.appendChild(textDiv('jj-grid__card-title', p.title));

    var row = document.createElement('div');
    row.className = 'jj-grid__card-row';
    row.appendChild(textDiv('jj-grid__card-price', p.price));
    if (p.format) {
      var badge = document.createElement('span');
      badge.className = 'jj-grid__card-format';
      badge.setAttribute('data-format', p.format);
      badge.textContent = p.format.toUpperCase();
      row.appendChild(badge);
    }
    card.appendChild(row);

    if (p.condition && p.condition !== 'n/a') {
      card.appendChild(textDiv('jj-grid__card-cond', p.condition.toUpperCase()));
    }

    return card;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    if (filteredProducts.length === 0) {
      gridEl.innerHTML = '<div class="jj-grid__empty">NO ITEMS FOUND</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < filteredProducts.length; i++) {
      frag.appendChild(createCard(filteredProducts[i]));
    }
    gridEl.appendChild(frag);
  }

  // ─── Init ──────────────────────────────────────────────────────
  renderGrid();

})();
