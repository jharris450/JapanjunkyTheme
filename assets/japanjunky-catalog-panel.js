/**
 * japanjunky-catalog-panel.js
 * Manages catalog panel: product selection, keyboard navigation,
 * filter toggle, and custom event emission.
 *
 * Emits:
 *   jj:product-selected  — detail: { handle, title, artist, vendor, price,
 *                           code, condition, format, formatLabel, year, label,
 *                           jpName, jpTitle, imageUrl, imageBackUrl, type3d,
 *                           variantId, available, el }
 *   jj:product-deselected — detail: {}
 */
(function () {
  'use strict';

  var list = document.getElementById('jj-inventory-list');
  if (!list) return;

  var filterToggle = document.getElementById('jj-filter-toggle');
  var filterBody = document.getElementById('jj-filter-body');
  var panelStatus = document.getElementById('jj-panel-status');

  // ── Filter toggle ──

  if (filterToggle && filterBody) {
    filterToggle.addEventListener('click', function () {
      var isOpen = filterBody.style.display !== 'none';
      filterBody.style.display = isOpen ? 'none' : '';
      filterToggle.textContent = isOpen ? 'FILTERS' : 'FILTERS [CLOSE]';
    });
  }

  // ── Selection state ──

  var selectedHandle = null;

  function getRows() {
    return list.querySelectorAll('.jj-inventory-row[data-product-handle]:not(.jj-row--hidden)');
  }

  function getAllRows() {
    return list.querySelectorAll('.jj-inventory-row[data-product-handle]');
  }

  function getSelectedIndex(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains('jj-row-selected')) return i;
    }
    return -1;
  }

  function selectRow(row) {
    if (!row) return;

    var handle = row.getAttribute('data-product-handle');

    // Toggle: clicking already-selected row deselects
    if (handle === selectedHandle) {
      deselectAll();
      return;
    }

    // Deselect previous
    var prev = list.querySelector('.jj-inventory-row.jj-row-selected');
    if (prev) {
      prev.classList.remove('jj-row-selected');
      prev.setAttribute('aria-selected', 'false');
    }

    // Select new
    row.classList.add('jj-row-selected');
    row.setAttribute('aria-selected', 'true');
    selectedHandle = handle;

    // Emit selection event
    var detail = {
      handle: handle,
      title: row.getAttribute('data-product-title') || '',
      artist: row.getAttribute('data-product-artist') || '',
      vendor: row.getAttribute('data-product-vendor') || '',
      price: row.getAttribute('data-product-price') || '',
      code: row.getAttribute('data-product-code') || '',
      condition: row.getAttribute('data-product-condition') || '',
      format: row.getAttribute('data-product-format') || '',
      formatLabel: row.getAttribute('data-product-format-label') || '',
      year: row.getAttribute('data-product-year') || '',
      label: row.getAttribute('data-product-label') || '',
      jpName: row.getAttribute('data-product-jp-name') || '',
      jpTitle: row.getAttribute('data-product-jp-title') || '',
      imageUrl: row.getAttribute('data-product-image') || '',
      imageBackUrl: row.getAttribute('data-product-image-back') || '',
      type3d: row.getAttribute('data-product-3d-type') || 'plane',
      variantId: row.getAttribute('data-variant-id') || '',
      available: row.getAttribute('data-product-available') === 'true',
      el: row
    };

    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: detail }));

    // Update status bar
    if (panelStatus) {
      panelStatus.textContent = handle.toUpperCase() + '.DAT';
    }
  }

  function deselectAll() {
    var prev = list.querySelector('.jj-inventory-row.jj-row-selected');
    if (prev) {
      prev.classList.remove('jj-row-selected');
      prev.setAttribute('aria-selected', 'false');
    }
    selectedHandle = null;

    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));

    // Reset status bar
    if (panelStatus) {
      var totalRows = getAllRows().length;
      panelStatus.textContent = totalRows + ' ITEMS';
    }
  }

  // ── Click handler ──

  list.addEventListener('click', function (e) {
    var row = e.target.closest('.jj-inventory-row[data-product-handle]');
    if (!row) return;
    selectRow(row);
  });

  // ── Keyboard navigation ──

  document.addEventListener('keydown', function (e) {
    // Ignore when typing in input fields
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    var rows = getRows();
    if (!rows.length) return;

    var idx = getSelectedIndex(rows);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = (idx < 0) ? 0 : (idx + 1) % rows.length;
      selectRow(rows[next]);
      rows[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = (idx <= 0) ? rows.length - 1 : idx - 1;
      selectRow(rows[prev]);
      rows[prev].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0) {
        // Toggle: re-selecting the same row deselects
        selectRow(rows[idx]);
      } else if (rows.length > 0) {
        selectRow(rows[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      deselectAll();
    }
  });

  // ── Initialize status bar ──

  var initialRows = getAllRows();
  if (panelStatus && initialRows.length > 0) {
    panelStatus.textContent = initialRows.length + ' ITEMS';
  }

})();
