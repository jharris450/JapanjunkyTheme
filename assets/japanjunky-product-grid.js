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


  // ─── Filter State ──────────────────────────────────────────────
  var activeFilters = {
    format: {},    // value → true (plain objects as sets for ES5)
    decade: {},
    condition: {}
  };
  var searchQuery = '';

  function setHas(obj, key) { return obj.hasOwnProperty(key); }
  function setAdd(obj, key) { obj[key] = true; }
  function setDel(obj, key) { delete obj[key]; }
  function setSize(obj) { var n = 0; for (var k in obj) { if (obj.hasOwnProperty(k)) n++; } return n; }

  // ─── Filtering ─────────────────────────────────────────────────

  function matchesFilters(product) {
    if (setSize(activeFilters.format) > 0) {
      if (!setHas(activeFilters.format, product.format)) return false;
    }
    if (setSize(activeFilters.decade) > 0) {
      var year = parseInt(product.year, 10);
      if (isNaN(year)) return false;
      var decade = String(Math.floor(year / 10) * 10);
      if (!setHas(activeFilters.decade, decade)) return false;
    }
    if (setSize(activeFilters.condition) > 0) {
      if (!setHas(activeFilters.condition, product.condition)) return false;
    }
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var title = (product.title || '').toLowerCase();
      var artist = (product.artist || '').toLowerCase();
      if (title.indexOf(q) === -1 && artist.indexOf(q) === -1) return false;
    }
    return true;
  }

  function refilter() {
    filteredProducts = [];
    for (var i = 0; i < allProducts.length; i++) {
      if (matchesFilters(allProducts[i])) {
        filteredProducts.push(allProducts[i]);
      }
    }
    renderGrid();
    updateCount();
    updateClearBtn(); // covers every state source, incl. search-only
  }

  // ─── Count Display ─────────────────────────────────────────────

  var countEl = document.getElementById('jj-grid-count');

  function updateCount() {
    if (!countEl) return;
    if (filteredProducts.length === allProducts.length) {
      countEl.textContent = allProducts.length + ' ITEMS';
    } else {
      countEl.textContent = filteredProducts.length + ' OF ' + allProducts.length + ' ITEMS';
    }
  }

  // ─── Filter Bar UI ─────────────────────────────────────────────

  var searchInput = document.getElementById('jj-grid-search');
  var clearBtn = document.getElementById('jj-grid-clear');
  var debounceTimer = null;

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        searchQuery = searchInput.value.trim();
        refilter();
      }, 100);
    });
  }

  var filterBtns = document.querySelectorAll('.jj-grid__filter-btn');
  for (var b = 0; b < filterBtns.length; b++) {
    (function (btn) {
      var group = btn.getAttribute('data-filter-group');
      var dropdown = btn.querySelector('.jj-grid__dropdown');
      if (!group || !dropdown) return;

      // Build dropdown items from the catalog
      var values = {};
      for (var p = 0; p < allProducts.length; p++) {
        var val = '';
        if (group === 'format') {
          val = allProducts[p].format;
        } else if (group === 'decade') {
          var yr = parseInt(allProducts[p].year, 10);
          if (!isNaN(yr) && yr >= 1900) val = String(Math.floor(yr / 10) * 10);
        } else if (group === 'condition') {
          val = allProducts[p].condition;
        }
        if (val) values[val] = true;
      }

      var sorted = [];
      for (var v in values) { if (values.hasOwnProperty(v)) sorted.push(v); }
      sorted.sort();

      dropdown.innerHTML = '';
      for (var s = 0; s < sorted.length; s++) {
        var item = document.createElement('div');
        item.className = 'jj-grid__dropdown-item';
        item.setAttribute('data-filter-value', sorted[s]);
        item.setAttribute('role', 'checkbox');
        item.setAttribute('aria-checked', 'false');
        item.setAttribute('tabindex', '0');

        var check = document.createElement('span');
        check.className = 'jj-grid__dropdown-check';
        check.textContent = ' ';

        var lbl = document.createElement('span');
        lbl.textContent = sorted[s].toUpperCase();
        if (group === 'decade') lbl.textContent = sorted[s] + 's';

        item.appendChild(check);
        item.appendChild(lbl);
        dropdown.appendChild(item);
      }

      btn.addEventListener('click', function (e) {
        if (e.target.closest('.jj-grid__dropdown')) return;
        var isOpen = dropdown.classList.contains('jj-grid__dropdown--open');
        closeAllDropdowns();
        if (!isOpen) dropdown.classList.add('jj-grid__dropdown--open');
      });

      dropdown.addEventListener('click', function (e) {
        var itemEl = e.target.closest('.jj-grid__dropdown-item');
        if (!itemEl) return;
        e.stopPropagation();
        e.preventDefault();

        var filterVal = itemEl.getAttribute('data-filter-value');
        if (!filterVal) return;

        if (setHas(activeFilters[group], filterVal)) {
          setDel(activeFilters[group], filterVal);
          itemEl.classList.remove('jj-grid__dropdown-item--active');
          itemEl.querySelector('.jj-grid__dropdown-check').textContent = ' ';
          itemEl.setAttribute('aria-checked', 'false');
        } else {
          setAdd(activeFilters[group], filterVal);
          itemEl.classList.add('jj-grid__dropdown-item--active');
          itemEl.querySelector('.jj-grid__dropdown-check').textContent = 'x';
          itemEl.setAttribute('aria-checked', 'true');
        }

        updateFilterBtnState(btn, group);
        refilter();
      });

      dropdown.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          var itemEl = e.target.closest('.jj-grid__dropdown-item');
          if (itemEl) {
            e.preventDefault();
            itemEl.click();
          }
        }
      });
    })(filterBtns[b]);
  }

  function closeAllDropdowns() {
    var open = document.querySelectorAll('.jj-grid__dropdown--open');
    for (var i = 0; i < open.length; i++) {
      open[i].classList.remove('jj-grid__dropdown--open');
    }
  }

  function updateFilterBtnState(btn, group) {
    var count = setSize(activeFilters[group]);
    var badge = btn.querySelector('.jj-grid__filter-badge');
    if (count > 0) {
      btn.classList.add('jj-grid__filter-btn--active');
      if (badge) badge.textContent = '(' + count + ')';
    } else {
      btn.classList.remove('jj-grid__filter-btn--active');
      if (badge) badge.textContent = '';
    }
    updateClearBtn();
  }

  function updateClearBtn() {
    if (!clearBtn) return;
    var hasFilters = setSize(activeFilters.format) > 0 ||
                     setSize(activeFilters.decade) > 0 ||
                     setSize(activeFilters.condition) > 0 ||
                     searchQuery !== '';
    if (hasFilters) {
      clearBtn.classList.add('jj-grid__clear-btn--visible');
    } else {
      clearBtn.classList.remove('jj-grid__clear-btn--visible');
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      activeFilters.format = {};
      activeFilters.decade = {};
      activeFilters.condition = {};
      searchQuery = '';
      if (searchInput) searchInput.value = '';

      var items = document.querySelectorAll('.jj-grid__dropdown-item--active');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('jj-grid__dropdown-item--active');
        items[i].querySelector('.jj-grid__dropdown-check').textContent = ' ';
        items[i].setAttribute('aria-checked', 'false');
      }
      for (var b = 0; b < filterBtns.length; b++) {
        filterBtns[b].classList.remove('jj-grid__filter-btn--active');
        var badge = filterBtns[b].querySelector('.jj-grid__filter-badge');
        if (badge) badge.textContent = '';
      }

      updateClearBtn();
      refilter();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.jj-grid__filter-btn')) {
      closeAllDropdowns();
    }
  });

  // ─── Init ──────────────────────────────────────────────────────
  renderGrid();
  updateCount();

})();
