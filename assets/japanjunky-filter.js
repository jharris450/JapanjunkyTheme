/**
 * japanjunky-filter.js
 * Client-side multi-select filtering for the left sidebar.
 * OR within a group, AND across groups.
 */
(function () {
  'use strict';

  var sidebar = document.querySelector('.jj-left-sidebar');
  var tbody = document.getElementById('jj-product-tbody');
  var filterBar = document.getElementById('jj-filter-bar');
  var filterTags = document.getElementById('jj-filter-tags');
  var filterClear = document.getElementById('jj-filter-clear');
  var footerCount = document.getElementById('jj-footer-count');
  var footerSep = document.getElementById('jj-footer-sep');
  var footerShowing = document.getElementById('jj-footer-showing');

  if (!sidebar || !tbody) return;

  // ── State ──
  var activeFilters = {
    format: new Set(),
    decade: new Set(),
    condition: new Set()
  };

  // Store original footer text for restoring
  var originalCountText = footerCount ? footerCount.textContent : '';

  // ── Matching helpers ──

  // Map filter groups to data attribute names on <tr>
  var groupToAttr = {
    format: 'data-product-format',
    decade: 'data-product-year',
    condition: 'data-product-condition'
  };

  function rowMatchesGroup(row, group, values) {
    var attr = row.getAttribute(groupToAttr[group]) || '';
    if (group === 'decade') {
      // Year attr is e.g. "1978"; decade filter value is e.g. "1970"
      var year = parseInt(attr, 10);
      if (isNaN(year)) return false;
      var decadeBase = Math.floor(year / 10) * 10;
      return values.has(String(decadeBase));
    }
    if (group === 'condition') {
      return values.has(attr.toLowerCase());
    }
    // format: already normalized lowercase in data attr
    return values.has(attr);
  }

  // ── Apply filters ──

  function applyFilters() {
    var rows = tbody.querySelectorAll('tr[data-product-handle]');
    var totalRows = rows.length;
    var visibleCount = 0;

    // Collect groups that have active selections
    var activeGroups = [];
    for (var g in activeFilters) {
      if (activeFilters[g].size > 0) {
        activeGroups.push(g);
      }
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var visible = true;

      for (var j = 0; j < activeGroups.length; j++) {
        var group = activeGroups[j];
        if (!rowMatchesGroup(row, group, activeFilters[group])) {
          visible = false;
          break;
        }
      }

      if (visible) {
        row.classList.remove('jj-row--hidden');
        visibleCount++;
      } else {
        row.classList.add('jj-row--hidden');
      }
    }

    updateFilterBar();
    updateFooterCount(visibleCount, totalRows, activeGroups.length > 0);
    checkDetailPane();
  }

  // ── Filter bar ──

  function updateFilterBar() {
    if (!filterBar || !filterTags) return;

    var hasFilters = false;
    for (var g in activeFilters) {
      if (activeFilters[g].size > 0) { hasFilters = true; break; }
    }

    if (!hasFilters) {
      filterBar.style.display = 'none';
      filterTags.innerHTML = '';
      return;
    }

    filterBar.style.display = '';
    var html = '';

    for (var group in activeFilters) {
      activeFilters[group].forEach(function (value) {
        // Find the sidebar item to get its display text
        var displayName = getDisplayName(group, value);
        html += '<span class="jj-filter-tag" data-tag-group="' + group + '" data-tag-value="' + value + '">' + displayName + '</span>';
      });
    }

    filterTags.innerHTML = html;
  }

  function getDisplayName(group, value) {
    // Find the sidebar <li> with matching group/value and read its text
    var item = sidebar.querySelector('li[data-filter-group="' + group + '"][data-filter-value="' + value + '"]');
    if (item) {
      // Clone and remove count span to get clean display text
      var clone = item.cloneNode(true);
      var countSpan = clone.querySelector('.jj-filter-count');
      if (countSpan) countSpan.remove();
      var text = clone.textContent.replace(/^\s*>\s*/, '').trim();
      return text;
    }
    return value.toUpperCase();
  }

  // ── Footer count ──

  function updateFooterCount(visible, total, isFiltered) {
    if (!footerCount) return;

    if (isFiltered) {
      footerCount.textContent = visible + ' of ' + total + ' items';
      if (footerSep) footerSep.style.display = 'none';
      if (footerShowing) footerShowing.style.display = 'none';
    } else {
      footerCount.textContent = originalCountText;
      if (footerSep) footerSep.style.display = '';
      if (footerShowing) footerShowing.style.display = '';
    }
  }

  // ── Detail pane check ──

  function checkDetailPane() {
    var selectedRow = tbody.querySelector('tr.jj-row-selected');
    if (selectedRow && selectedRow.classList.contains('jj-row--hidden')) {
      // Click the first visible row, or clear the pane
      var firstVisible = tbody.querySelector('tr[data-product-handle]:not(.jj-row--hidden)');
      if (firstVisible) {
        firstVisible.click();
      }
    }
  }

  // ── Click handler (event delegation) ──

  sidebar.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-filter-group]');
    if (!li) return;

    var group = li.getAttribute('data-filter-group');
    var value = li.getAttribute('data-filter-value');
    if (!group || !value || !activeFilters[group]) return;

    // Toggle
    if (activeFilters[group].has(value)) {
      activeFilters[group].delete(value);
      li.classList.remove('jj-filter-item--active');
      li.setAttribute('aria-pressed', 'false');
    } else {
      activeFilters[group].add(value);
      li.classList.add('jj-filter-item--active');
      li.setAttribute('aria-pressed', 'true');
    }

    applyFilters();
  });

  // Keyboard support: Enter/Space to toggle
  sidebar.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var li = e.target.closest('li[data-filter-group]');
      if (li) {
        e.preventDefault();
        li.click();
      }
    }
  });

  // ── Filter tag click (remove individual filter) ──

  if (filterTags) {
    filterTags.addEventListener('click', function (e) {
      var tag = e.target.closest('.jj-filter-tag');
      if (!tag) return;

      var group = tag.getAttribute('data-tag-group');
      var value = tag.getAttribute('data-tag-value');
      if (!group || !value || !activeFilters[group]) return;

      activeFilters[group].delete(value);

      // Deactivate the corresponding sidebar item
      var li = sidebar.querySelector('li[data-filter-group="' + group + '"][data-filter-value="' + value + '"]');
      if (li) {
        li.classList.remove('jj-filter-item--active');
        li.setAttribute('aria-pressed', 'false');
      }

      applyFilters();
    });
  }

  // ── Clear all ──

  if (filterClear) {
    filterClear.addEventListener('click', function () {
      for (var g in activeFilters) {
        activeFilters[g].clear();
      }

      // Remove all active classes
      var activeItems = sidebar.querySelectorAll('.jj-filter-item--active');
      for (var i = 0; i < activeItems.length; i++) {
        activeItems[i].classList.remove('jj-filter-item--active');
        activeItems[i].setAttribute('aria-pressed', 'false');
      }

      applyFilters();
    });
  }

  // ── Sort integration: reapply filters after sort changes ──

  var sortSelect = document.getElementById('jj-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      // Sort handler in product-select.js fires first (same event).
      // Use setTimeout to let it finish re-ordering rows, then reapply.
      setTimeout(applyFilters, 0);
    });
  }

})();
