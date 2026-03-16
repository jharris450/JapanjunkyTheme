/**
 * japanjunky-search.js
 * Live client-side search with CRT materialization effect.
 * Debounced input on the header search bar filters product table rows.
 */
(function () {
  'use strict';

  var searchInput = document.querySelector('.jj-nav-bar__input');
  var tbody = document.getElementById('jj-product-tbody');
  if (!searchInput || !tbody) return;

  // Prevent form submission — search is client-side only
  var form = searchInput.closest('form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
    });
  }

  var debounceTimer = null;

  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 100);
  });

  function runSearch() {
    var query = searchInput.value.trim().toLowerCase();
    var rows = tbody.querySelectorAll('tr[data-product-handle]');

    // Snapshot which rows are currently visible (before this search changes things)
    var wasVisible = new Set();
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].classList.contains('jj-row--hidden')) {
        wasVisible.add(i);
      }
    }

    // Set data-search-match on each row
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (query === '') {
        row.removeAttribute('data-search-match');
      } else {
        var title = (row.getAttribute('data-product-title') || '').toLowerCase();
        var artist = (row.getAttribute('data-product-artist') || '').toLowerCase();
        var matches = title.indexOf(query) !== -1 || artist.indexOf(query) !== -1;
        row.setAttribute('data-search-match', matches ? 'true' : 'false');
      }
    }

    // Apply filters (sidebar + search combined)
    if (typeof window.JJ_applyFilters === 'function') {
      window.JJ_applyFilters();
    }

    // Materialize rows that just became visible
    materializeNewlyVisible(rows, wasVisible);
  }

  // ── Materialization ──

  function materializeNewlyVisible(rows, wasVisible) {
    var staggerIndex = 0;
    var MAX_STAGGER = 500; // ms cap
    var STAGGER_STEP = 30; // ms per row

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var isVisible = !row.classList.contains('jj-row--hidden');
      var wasVis = wasVisible.has(i);

      if (isVisible && !wasVis) {
        // This row just appeared — animate it
        var delay = Math.min(staggerIndex * STAGGER_STEP, MAX_STAGGER);
        applyMaterialization(row, delay);
        staggerIndex++;
      }
    }
  }

  function applyMaterialization(row, delay) {
    // Remove any previous materialization state
    row.classList.remove('jj-row--materializing');

    // Force reflow so re-adding the class restarts the animation
    void row.offsetWidth;

    row.classList.add('jj-row--materializing');

    // Set stagger delay on td cells directly (animation-delay doesn't inherit)
    var cells = row.querySelectorAll('td');
    for (var i = 0; i < cells.length; i++) {
      cells[i].style.animationDelay = delay + 'ms';
    }

    // Cleanup after animation
    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      row.classList.remove('jj-row--materializing');
      for (var i = 0; i < cells.length; i++) {
        cells[i].style.animationDelay = '';
      }
    }

    // Listen for animationend on first cell
    if (cells.length > 0) {
      cells[0].addEventListener('animationend', cleanup, { once: true });
    }

    // Fallback timeout for reduced-motion (animationend won't fire)
    setTimeout(cleanup, delay + 500);
  }

})();
