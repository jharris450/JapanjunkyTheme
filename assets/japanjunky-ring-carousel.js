/**
 * japanjunky-ring-carousel.js
 * Radial crescent carousel of album covers.
 * Absorbs filter + search logic from removed japanjunky-filter.js / japanjunky-search.js.
 *
 * Consumes: window.JJ_PRODUCTS (from jj-homepage-body.liquid)
 * Emits:    jj:product-selected, jj:product-deselected
 */
(function () {
  'use strict';

  // ─── Data ──────────────────────────────────────────────────────
  var allProducts = window.JJ_PRODUCTS || [];
  if (!allProducts.length) return;

  // ─── DOM ───────────────────────────────────────────────────────
  var ring = document.getElementById('jj-ring');
  var stage = document.getElementById('jj-ring-stage');
  var countEl = document.getElementById('jj-ring-count');
  if (!ring || !stage) return;

  // ─── Arc Config (vertical increscent) ──────────────────────────
  // Covers stacked vertically along an increscent curve (opens left).
  // x: horizontal offset (positive = right, further from viewer)
  // y: vertical offset from center (positive = down)
  // Center cover is largest; covers shrink + shift right toward edges.
  var ARC = [
    { offset: 0,  x: 0,    y: 0,    scale: 1.15, opacity: 1.0  },
    { offset: 1,  x: -18,  y: 75,   scale: 0.88, opacity: 0.85 },
    { offset: -1, x: -18,  y: -75,  scale: 0.88, opacity: 0.85 },
    { offset: 2,  x: -55,  y: 145,  scale: 0.72, opacity: 0.6  },
    { offset: -2, x: -55,  y: -145, scale: 0.72, opacity: 0.6  },
    { offset: 3,  x: -110, y: 210,  scale: 0.58, opacity: 0.35 },
    { offset: -3, x: -110, y: -210, scale: 0.58, opacity: 0.35 }
  ];
  var VISIBLE_RANGE = 3; // covers visible on each side of center

  // Per-cover random jitter (applied once on creation)
  var coverJitter = {}; // keyed by product handle+variantId

  function getJitter(product) {
    var key = product.handle + ':' + product.variantId;
    if (!coverJitter[key]) {
      coverJitter[key] = {
        rotate: (Math.random() - 0.5) * 5, // ±2.5deg
        tx: (Math.random() - 0.5) * 6,     // ±3px
        ty: (Math.random() - 0.5) * 6      // ±3px
      };
    }
    return coverJitter[key];
  }

  // ─── State ─────────────────────────────────────────────────────
  var filteredProducts = allProducts.slice(); // currently visible after filters
  var centerIndex = 0;       // index into filteredProducts
  var coverEls = {};         // keyed by filteredProducts index → DOM element
  var selectedProduct = null; // currently selected product data (after 300ms delay)
  var selectTimer = null;

  // ─── Filter State ──────────────────────────────────────────────
  var activeFilters = {
    format: {},    // value → true (using plain objects as sets for ES5)
    decade: {},
    condition: {}
  };
  var searchQuery = '';

  // ─── Helpers ───────────────────────────────────────────────────

  function setHas(obj, key) { return obj.hasOwnProperty(key); }
  function setAdd(obj, key) { obj[key] = true; }
  function setDel(obj, key) { delete obj[key]; }
  function setSize(obj) { var n = 0; for (var k in obj) { if (obj.hasOwnProperty(k)) n++; } return n; }
  function setKeys(obj) { var a = []; for (var k in obj) { if (obj.hasOwnProperty(k)) a.push(k); } return a; }

  // ─── Filtering ─────────────────────────────────────────────────

  function matchesFilters(product) {
    // Format group
    if (setSize(activeFilters.format) > 0) {
      if (!setHas(activeFilters.format, product.format)) return false;
    }
    // Decade group
    if (setSize(activeFilters.decade) > 0) {
      var year = parseInt(product.year, 10);
      if (isNaN(year)) return false;
      var decade = String(Math.floor(year / 10) * 10);
      if (!setHas(activeFilters.decade, decade)) return false;
    }
    // Condition group
    if (setSize(activeFilters.condition) > 0) {
      if (!setHas(activeFilters.condition, product.condition)) return false;
    }
    // Search
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var title = (product.title || '').toLowerCase();
      var artist = (product.artist || '').toLowerCase();
      if (title.indexOf(q) === -1 && artist.indexOf(q) === -1) return false;
    }
    return true;
  }

  function refilter() {
    var prevSelected = selectedProduct;
    filteredProducts = [];
    for (var i = 0; i < allProducts.length; i++) {
      if (matchesFilters(allProducts[i])) {
        filteredProducts.push(allProducts[i]);
      }
    }
    // Try to keep previous selection centered
    if (prevSelected) {
      var found = -1;
      for (var j = 0; j < filteredProducts.length; j++) {
        if (filteredProducts[j].handle === prevSelected.handle &&
            filteredProducts[j].variantId === prevSelected.variantId) {
          found = j;
          break;
        }
      }
      centerIndex = found >= 0 ? found : 0;
    } else {
      centerIndex = 0;
    }
    renderRing();
    updateCount();
  }

  // ─── Cover Creation ────────────────────────────────────────────

  function createCoverEl(product, idx) {
    var div = document.createElement('div');
    div.className = 'jj-ring__cover';
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', 'false');
    div.setAttribute('data-ring-index', idx);
    div.setAttribute('data-format', product.format || '');
    div.setAttribute('data-handle', product.handle || '');

    var imgWrap = document.createElement('div');
    imgWrap.className = 'jj-ring__cover-img-wrap';

    var img = document.createElement('img');
    img.className = 'jj-ring__cover-img';
    img.alt = (product.artist ? product.artist + ' - ' : '') + product.title;
    img.width = 180;
    img.height = 180;

    // Lazy loading: only eager-load covers within visible range
    var dist = Math.abs(idx - centerIndex);
    if (dist <= VISIBLE_RANGE + 2) {
      img.src = product.image || '';
      img.loading = 'eager';
    } else {
      img.loading = 'lazy';
      img.setAttribute('data-src', product.image || '');
      // Do NOT set img.src — browsers resolve empty src to page URL
    }

    if (!product.image) {
      imgWrap.innerHTML = '<span style="font-size:10px;color:var(--jj-secondary);display:flex;align-items:center;justify-content:center;height:100%;">&#9670;</span>';
    } else {
      imgWrap.appendChild(img);
    }

    div.appendChild(imgWrap);

    return div;
  }

  // ─── Arc Positioning ───────────────────────────────────────────

  function positionCovers() {
    // Remove covers that are out of range
    var keepSet = {};
    for (var a = 0; a < ARC.length; a++) {
      var dataIdx = centerIndex + ARC[a].offset;
      if (dataIdx >= 0 && dataIdx < filteredProducts.length) {
        keepSet[dataIdx] = true;
      }
    }
    for (var key in coverEls) {
      if (!keepSet.hasOwnProperty(key)) {
        if (coverEls[key].parentNode) coverEls[key].parentNode.removeChild(coverEls[key]);
        delete coverEls[key];
      }
    }

    // Create/position covers on the arc
    for (var i = 0; i < ARC.length; i++) {
      var slot = ARC[i];
      var dIdx = centerIndex + slot.offset;
      if (dIdx < 0 || dIdx >= filteredProducts.length) continue;

      var el = coverEls[dIdx];
      if (!el) {
        el = createCoverEl(filteredProducts[dIdx], dIdx);
        coverEls[dIdx] = el;
        stage.appendChild(el);
      }

      // Lazy-load images entering visible range
      var img = el.querySelector('.jj-ring__cover-img');
      if (img && img.getAttribute('data-src')) {
        img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src');
      }

      var jit = getJitter(filteredProducts[dIdx]);
      el.style.transform = 'translate(' + (slot.x + jit.tx) + 'px, ' + (slot.y + jit.ty) + 'px) scale(' + slot.scale + ') rotate(' + jit.rotate + 'deg)';
      el.style.opacity = slot.opacity;
      el.style.zIndex = 10 - Math.abs(slot.offset);

      // Mark center as selected
      if (slot.offset === 0) {
        el.classList.add('jj-ring__cover--selected');
        el.setAttribute('aria-selected', 'true');
      } else {
        el.classList.remove('jj-ring__cover--selected');
        el.setAttribute('aria-selected', 'false');
      }
    }
  }

  function renderRing() {
    // Clear all existing covers
    for (var key in coverEls) {
      if (coverEls[key].parentNode) coverEls[key].parentNode.removeChild(coverEls[key]);
    }
    coverEls = {};

    if (filteredProducts.length === 0) {
      stage.innerHTML = '<div class="jj-ring__empty">NO ITEMS FOUND</div>';
      return;
    }

    // Remove empty state if present
    var empty = stage.querySelector('.jj-ring__empty');
    if (empty) empty.parentNode.removeChild(empty);

    positionCovers();
  }

  // ─── Count Display ─────────────────────────────────────────────

  function updateCount() {
    if (!countEl) return;
    if (filteredProducts.length === allProducts.length) {
      countEl.textContent = allProducts.length + ' ITEMS';
    } else {
      countEl.textContent = filteredProducts.length + ' OF ' + allProducts.length + ' ITEMS';
    }
  }

  // ─── Navigation ────────────────────────────────────────────────

  function rotateTo(newIndex) {
    if (filteredProducts.length === 0) return;
    // Wrap around
    if (newIndex < 0) newIndex = filteredProducts.length - 1;
    if (newIndex >= filteredProducts.length) newIndex = 0;
    // Deselect previous product when rotating away
    if (selectedProduct) {
      var prev = filteredProducts[centerIndex];
      if (!prev || prev.handle !== filteredProducts[newIndex].handle ||
          prev.variantId !== filteredProducts[newIndex].variantId) {
        deselectCurrent();
      }
    }
    centerIndex = newIndex;
    positionCovers();
    startSelectTimer();
  }

  function rotateLeft() {
    rotateTo(centerIndex - 1);
  }

  function rotateRight() {
    rotateTo(centerIndex + 1);
  }

  // ─── Selection Delay (300ms) ───────────────────────────────────

  function startSelectTimer() {
    clearSelectTimer();
    selectTimer = setTimeout(function () {
      selectTimer = null;
      selectCurrent();
    }, 300);
  }

  function clearSelectTimer() {
    if (selectTimer) {
      clearTimeout(selectTimer);
      selectTimer = null;
    }
  }

  function selectCurrent() {
    if (filteredProducts.length === 0) return;
    var product = filteredProducts[centerIndex];
    if (!product) return;

    // Already selected? Skip
    if (selectedProduct &&
        selectedProduct.handle === product.handle &&
        selectedProduct.variantId === product.variantId) return;

    selectedProduct = product;

    // Map JJ_PRODUCTS fields to event detail shape expected by product-viewer.js
    var el = coverEls[centerIndex] || null;
    var detail = {
      handle: product.handle,
      productId: product.id,
      title: product.title,
      artist: product.artist,
      vendor: product.vendor,
      price: product.price,
      code: product.code,
      condition: product.condition,
      format: product.format,
      formatLabel: product.formatLabel,
      year: product.year,
      label: product.label,
      jpName: product.jpName,
      jpTitle: product.jpTitle,
      imageUrl: product.image,       // mapped: image → imageUrl
      imageBackUrl: product.imageBack, // mapped: imageBack → imageBackUrl
      type3d: product.type3d,
      variantId: String(product.variantId),
      available: product.available,
      el: el
    };

    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: detail }));
  }

  function deselectCurrent() {
    clearSelectTimer();
    if (!selectedProduct) return;
    selectedProduct = null;
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }

  // ─── Keyboard Input ────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      rotateRight();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      rotateLeft();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearSelectTimer();
      selectCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearSelectTimer();
      deselectCurrent();
    }
  });

  // ─── Mouse Click on Covers ─────────────────────────────────────

  stage.addEventListener('click', function (e) {
    var cover = e.target.closest('.jj-ring__cover');
    if (!cover) return;

    var idx = parseInt(cover.getAttribute('data-ring-index'), 10);
    if (isNaN(idx)) return;

    if (idx === centerIndex) {
      // Clicking center cover: immediate select
      clearSelectTimer();
      selectCurrent();
    } else {
      // Clicking side cover: rotate it to center
      rotateTo(idx);
    }
  });

  // ─── Scroll Wheel (throttled to prevent rapid-fire) ─────────────

  var wheelCooldown = false;

  ring.addEventListener('wheel', function (e) {
    // Don't capture scroll when a dropdown is open under cursor
    if (e.target.closest('.jj-ring__dropdown--open')) return;

    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(function () { wheelCooldown = false; }, 150);

    var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (delta > 0) {
      rotateRight();
    } else if (delta < 0) {
      rotateLeft();
    }
  }, { passive: false });

  // ─── Touch Swipe ───────────────────────────────────────────────

  var touchStartX = 0;
  var touchStartY = 0;
  var touchMoved = false;
  var touchLocked = false; // prevent multiple rotations per swipe

  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
    touchLocked = false;
  }, { passive: true });

  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1 || touchLocked) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    // Only register vertical swipes, one rotation per gesture
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
      e.preventDefault();
      touchMoved = true;
      touchLocked = true;
      if (dy > 0) {
        rotateRight();
      } else {
        rotateLeft();
      }
    }
  }, { passive: false });

  stage.addEventListener('touchend', function (e) {
    touchLocked = false;
    if (!touchMoved) {
      // Tap: treat as click — handled by click event
    }
  }, { passive: true });

  // ─── Filter Bar UI ─────────────────────────────────────────────

  var searchInput = document.getElementById('jj-ring-search');
  var clearBtn = document.getElementById('jj-ring-clear');
  var debounceTimer = null;

  // Search
  if (searchInput) {
    var form = searchInput.closest('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });

    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        searchQuery = searchInput.value.trim();
        refilter();
      }, 100);
    });
  }

  // Filter buttons
  var filterBtns = ring.querySelectorAll('.jj-ring__filter-btn');
  for (var b = 0; b < filterBtns.length; b++) {
    (function (btn) {
      var group = btn.getAttribute('data-filter-group');
      var dropdown = btn.querySelector('.jj-ring__dropdown');
      if (!group || !dropdown) return;

      // Build dropdown items dynamically from JJ_PRODUCTS
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
        item.className = 'jj-ring__dropdown-item';
        item.setAttribute('data-filter-value', sorted[s]);
        item.setAttribute('role', 'checkbox');
        item.setAttribute('aria-checked', 'false');
        item.setAttribute('tabindex', '0');

        var check = document.createElement('span');
        check.className = 'jj-ring__dropdown-check';
        check.textContent = ' ';

        var lbl = document.createElement('span');
        lbl.textContent = sorted[s].toUpperCase();
        if (group === 'decade') lbl.textContent = sorted[s] + 's';

        item.appendChild(check);
        item.appendChild(lbl);
        dropdown.appendChild(item);
      }

      // Toggle dropdown
      btn.addEventListener('click', function (e) {
        if (e.target.closest('.jj-ring__dropdown')) return; // don't toggle when clicking inside dropdown
        var isOpen = dropdown.classList.contains('jj-ring__dropdown--open');
        closeAllDropdowns();
        if (!isOpen) dropdown.classList.add('jj-ring__dropdown--open');
      });

      // Dropdown item click
      dropdown.addEventListener('click', function (e) {
        var itemEl = e.target.closest('.jj-ring__dropdown-item');
        if (!itemEl) return;
        e.stopPropagation();

        var filterVal = itemEl.getAttribute('data-filter-value');
        if (!filterVal) return;

        if (setHas(activeFilters[group], filterVal)) {
          setDel(activeFilters[group], filterVal);
          itemEl.classList.remove('jj-ring__dropdown-item--active');
          itemEl.querySelector('.jj-ring__dropdown-check').textContent = ' ';
          itemEl.setAttribute('aria-checked', 'false');
        } else {
          setAdd(activeFilters[group], filterVal);
          itemEl.classList.add('jj-ring__dropdown-item--active');
          itemEl.querySelector('.jj-ring__dropdown-check').textContent = 'x';
          itemEl.setAttribute('aria-checked', 'true');
        }

        updateFilterBtnState(btn, group);
        refilter();
      });

      // Keyboard on dropdown items
      dropdown.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          var itemEl = e.target.closest('.jj-ring__dropdown-item');
          if (itemEl) {
            e.preventDefault();
            itemEl.click();
          }
        }
      });
    })(filterBtns[b]);
  }

  function closeAllDropdowns() {
    var open = ring.querySelectorAll('.jj-ring__dropdown--open');
    for (var i = 0; i < open.length; i++) {
      open[i].classList.remove('jj-ring__dropdown--open');
    }
  }

  function updateFilterBtnState(btn, group) {
    var count = setSize(activeFilters[group]);
    var badge = btn.querySelector('.jj-ring__filter-badge');
    if (count > 0) {
      btn.classList.add('jj-ring__filter-btn--active');
      if (badge) badge.textContent = '(' + count + ')';
    } else {
      btn.classList.remove('jj-ring__filter-btn--active');
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
      clearBtn.classList.add('jj-ring__clear-btn--visible');
    } else {
      clearBtn.classList.remove('jj-ring__clear-btn--visible');
    }
  }

  // Clear all filters
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      activeFilters.format = {};
      activeFilters.decade = {};
      activeFilters.condition = {};
      searchQuery = '';
      if (searchInput) searchInput.value = '';

      // Reset all dropdown items
      var items = ring.querySelectorAll('.jj-ring__dropdown-item--active');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('jj-ring__dropdown-item--active');
        items[i].querySelector('.jj-ring__dropdown-check').textContent = ' ';
        items[i].setAttribute('aria-checked', 'false');
      }
      // Reset button states
      for (var b = 0; b < filterBtns.length; b++) {
        filterBtns[b].classList.remove('jj-ring__filter-btn--active');
        var badge = filterBtns[b].querySelector('.jj-ring__filter-badge');
        if (badge) badge.textContent = '';
      }

      updateClearBtn();
      refilter();
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.jj-ring__filter-btn')) {
      closeAllDropdowns();
    }
  });

  // ─── Init ──────────────────────────────────────────────────────
  renderRing();
  updateCount();

})();
