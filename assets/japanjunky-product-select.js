/**
 * Japanjunky - Product Select (Table Row → Detail Pane)
 *
 * Click handler on product table rows.
 * Fetches product data from data attributes + AJAX fallback.
 * Renders detail into right column pane with CRT render-in effects.
 */

(function () {
  'use strict';

  var tbody = document.getElementById('jj-product-tbody');
  var detailPane = document.getElementById('jj-detail-pane');
  if (!tbody || !detailPane) return;

  // Detail pane elements
  var elArtist = document.getElementById('jj-detail-artist');
  var elJpName = document.getElementById('jj-detail-jp-name');
  var elTitle = document.getElementById('jj-detail-title');
  var elJpTitle = document.getElementById('jj-detail-jp-title');
  var elPrice = document.getElementById('jj-detail-price');
  var elMeta = document.getElementById('jj-detail-meta');
  var elImageContainer = document.getElementById('jj-detail-image-container');
  var elVisual = document.getElementById('jj-detail-visual');
  var elHeader = document.getElementById('jj-detail-header');
  var elAddBtn = document.getElementById('jj-add-to-cart-btn');
  var elVariantId = document.getElementById('jj-variant-id');
  var elCartForm = document.getElementById('jj-detail-cart-form');

  // ─── Sequential Typewriter with Block Cursor ─────────────────
  var typeSequenceTimer = null;
  var typeCursorSpan = null;

  function clearTypeSequence() {
    if (typeSequenceTimer) { clearTimeout(typeSequenceTimer); typeSequenceTimer = null; }
    if (typeCursorSpan && typeCursorSpan.parentNode) { typeCursorSpan.parentNode.removeChild(typeCursorSpan); }
    typeCursorSpan = null;
  }

  function typeField(el, text, msPerChar, cb) {
    if (!el || text == null) { if (cb) cb(); return; }
    var str = String(text);
    el.textContent = '';
    // Create cursor span
    var cursor = document.createElement('span');
    cursor.className = 'jj-typing-cursor';
    cursor.textContent = '\u2588'; // █
    cursor.style.color = 'inherit';
    el.appendChild(cursor);
    typeCursorSpan = cursor;
    var i = 0;
    function tick() {
      if (i < str.length) {
        // Insert character before cursor
        el.insertBefore(document.createTextNode(str[i]), cursor);
        i++;
        typeSequenceTimer = setTimeout(tick, msPerChar);
      } else {
        // Typing done — remove cursor from this field
        if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
        typeCursorSpan = null;
        if (cb) cb();
      }
    }
    tick();
  }

  function typeSequence(fields) {
    // fields: [{ el, text, ms }, ...]
    // Types each field in order, 150ms pause between.
    // Final field keeps blinking cursor.
    clearTypeSequence();
    var idx = 0;
    function next() {
      if (idx >= fields.length) return;
      var f = fields[idx];
      var isLast = idx === fields.length - 1;
      idx++;
      typeField(f.el, f.text, f.ms, function () {
        if (isLast) {
          // Re-append cursor to last field, keep blinking
          var cursor = document.createElement('span');
          cursor.className = 'jj-typing-cursor';
          cursor.textContent = '\u2588';
          cursor.style.color = 'inherit';
          f.el.appendChild(cursor);
          typeCursorSpan = cursor;
        } else {
          typeSequenceTimer = setTimeout(next, 150);
        }
      });
    }
    next();
  }

  // ─── CSS Animation Trigger ─────────────────────────────────
  function triggerClass(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow
    el.classList.add(cls);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Row Click Handler ─────────────────────────────────────
  tbody.addEventListener('click', function (e) {
    var row = e.target.closest('tr[data-product-handle]');
    if (!row) return;

    // Highlight selected row
    var allRows = tbody.querySelectorAll('tr');
    allRows.forEach(function (r) { r.classList.remove('jj-row-selected'); });
    row.classList.add('jj-row-selected');

    // Read data from row attributes
    var handle = row.getAttribute('data-product-handle');
    var title = row.getAttribute('data-product-title') || '';
    var artist = row.getAttribute('data-product-artist') || '';
    var vendor = row.getAttribute('data-product-vendor') || '';
    var price = row.getAttribute('data-product-price') || '';
    var code = row.getAttribute('data-product-code') || '';
    var condition = row.getAttribute('data-product-condition') || '';
    var formatLabel = row.getAttribute('data-product-format-label') || '';
    var year = row.getAttribute('data-product-year') || '';
    var label = row.getAttribute('data-product-label') || '';
    var jpName = row.getAttribute('data-product-jp-name') || '';
    var jpTitle = row.getAttribute('data-product-jp-title') || '';
    var imageUrl = row.getAttribute('data-product-image') || '';
    var variantId = row.getAttribute('data-variant-id') || '';
    var available = row.getAttribute('data-product-available') === 'true';

    // Sequential typewriter: Artist → Title → Price (cursor stays on price)
    typeSequence([
      { el: elArtist, text: (artist || vendor).toUpperCase(), ms: 24 },
      { el: elTitle, text: title, ms: 18 },
      { el: elPrice, text: price, ms: 14 }
    ]);

    // JP Name (below artist)
    if (elJpName) {
      elJpName.textContent = jpName;
    }

    // JP Title (below product title)
    if (elJpTitle) {
      elJpTitle.textContent = jpTitle;
    }

    // Container phosphor wake-up
    triggerClass(elImageContainer, 'jj-screen-refresh');

    // Image or ASCII placeholder
    if (imageUrl) {
      if (elVisual && elVisual.tagName === 'PRE') {
        var img = document.createElement('img');
        img.id = 'jj-detail-visual';
        img.src = imageUrl;
        img.alt = title;
        elVisual.parentNode.replaceChild(img, elVisual);
        elVisual = img;
      } else if (elVisual) {
        elVisual.src = imageUrl;
        elVisual.alt = title;
      }
      triggerClass(elVisual, 'jj-img-rendering');
      // Auto-dither the detail image
      if (window.JJ_Dither) {
        window.JJ_Dither.ditherSingle(elVisual);
      }
    } else {
      var asciiPlaceholder =
        '\n    ┌──────────────┐\n' +
        '    │              │\n' +
        '    │   ' + (code || '◆◆◆').substring(0, 6).padEnd(6) + '     │\n' +
        '    │              │\n' +
        '    │   NO IMAGE   │\n' +
        '    │   AVAILABLE  │\n' +
        '    │              │\n' +
        '    └──────────────┘';
      if (elVisual && elVisual.tagName === 'IMG') {
        var pre = document.createElement('pre');
        pre.id = 'jj-detail-visual';
        pre.className = 'jj-ascii-art-large';
        pre.textContent = asciiPlaceholder;
        elVisual.parentNode.replaceChild(pre, elVisual);
        elVisual = pre;
      } else if (elVisual) {
        elVisual.textContent = asciiPlaceholder;
      }
      triggerClass(elVisual, 'jj-text-rendering');
    }

    // Meta block — Code, Label, Format, Year, Condition
    if (elMeta) {
      elMeta.innerHTML =
        '<div><span class="jj-meta-label">Code:</span> <span class="jj-meta-value">' + escapeHtml(code || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Label:</span> <span class="jj-meta-value">' + escapeHtml(label || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Format:</span> <span class="jj-meta-value">' + escapeHtml(formatLabel || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Year:</span> <span class="jj-meta-value">' + escapeHtml(year || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Condition:</span> <span class="jj-meta-value">' + escapeHtml(condition || '---') + '</span></div>';
      triggerClass(elMeta, 'jj-meta-rendering');
    }

    // Update header with terminal path
    if (elHeader) {
      elHeader.textContent = 'C:\\catalog\\' + (handle || 'item') + '.dat';
      // Format color on detail header
      var format = row.getAttribute('data-product-format') || '';
      var formatColors = {
        vinyl: 'var(--jj-amber)',
        cd: 'var(--jj-cyan)',
        cassette: 'var(--jj-green)',
        minidisc: 'var(--jj-magenta)',
        hardware: 'var(--jj-white)'
      };
      elHeader.style.borderLeftColor = formatColors[format] || 'transparent';
    }

    // Update add to cart
    if (elVariantId) {
      elVariantId.value = variantId;
    }
    if (elAddBtn) {
      elAddBtn.disabled = !available;
      elAddBtn.textContent = available ? '[Add to Cart]' : '[Sold Out]';
    }

    // Fetch full product data for description and variant update
    if (handle) {
      fetch('/products/' + handle + '.js')
        .then(function (res) {
          if (!res.ok) throw new Error('Not found');
          return res.json();
        })
        .then(function (product) {
          // Append description as Notes if available
          if (product.description && elMeta) {
            var existingNotes = elMeta.querySelector('.jj-meta-notes');
            if (existingNotes) existingNotes.remove();
            var plainDesc = product.description.replace(/<[^>]*>/g, '').substring(0, 200);
            var descDiv = document.createElement('div');
            descDiv.className = 'jj-meta-notes';
            descDiv.style.cssText = 'margin-top:6px;font-size:12px;color:#aaa;max-height:80px;overflow-y:auto;line-height:1.4;';
            descDiv.innerHTML = '<span class="jj-meta-label">Notes:</span> <span class="jj-meta-value">' + escapeHtml(plainDesc) + '</span>';
            elMeta.appendChild(descDiv);
          }
          // Variant ID is already set from the row's data-variant-id attribute
          // (each row is a specific variant, no need to override)
        })
        .catch(function () {
          // Silently fail - we already have data from attributes
        });
    }

    // On tablet: open detail pane overlay
    if (window.innerWidth <= 960 && detailPane) {
      detailPane.classList.add('jj-detail-open');
    }
  });

  // Close detail pane overlay on tablet when clicking outside
  document.addEventListener('click', function (e) {
    if (window.innerWidth <= 960 && detailPane && detailPane.classList.contains('jj-detail-open')) {
      if (!detailPane.contains(e.target) && !tbody.contains(e.target)) {
        detailPane.classList.remove('jj-detail-open');
      }
    }
  });

  // ─── Add to Cart Button ────────────────────────────────────
  if (elAddBtn && elCartForm) {
    elAddBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (elAddBtn.disabled) return;
      var variantId = elVariantId ? elVariantId.value : '';
      if (!variantId) return;

      elAddBtn.textContent = '[Adding...]';
      elAddBtn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
      })
        .then(function (res) { return res.json(); })
        .then(function () {
          elAddBtn.textContent = '[OK]';
          setTimeout(function () {
            elAddBtn.textContent = '[Add to Cart]';
            elAddBtn.disabled = false;
          }, 1500);
          // Update cart count in nav
          var cartBtns = document.querySelectorAll('.jj-nav-action-btn');
          cartBtns.forEach(function (btn) {
            if (btn.textContent.indexOf('Cart') !== -1) {
              fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
                btn.textContent = '[Cart:' + cart.item_count + ']';
              });
            }
          });
        })
        .catch(function () {
          elAddBtn.textContent = '[ERR]';
          setTimeout(function () {
            elAddBtn.textContent = '[Add to Cart]';
            elAddBtn.disabled = false;
          }, 1500);
        });
    });
  }

  // ─── Keyboard Navigation ──────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

    var rows = Array.from(tbody.querySelectorAll('tr[data-product-handle]'));
    if (!rows.length) return;

    var selectedRow = tbody.querySelector('tr.jj-row-selected');
    var currentIndex = selectedRow ? rows.indexOf(selectedRow) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var nextIndex = currentIndex < rows.length - 1 ? currentIndex + 1 : 0;
      rows[nextIndex].click();
      rows[nextIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prevIndex = currentIndex > 0 ? currentIndex - 1 : rows.length - 1;
      rows[prevIndex].click();
      rows[prevIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selectedRow) {
      e.preventDefault();
      var handle = selectedRow.getAttribute('data-product-handle');
      if (handle) {
        window.location.href = '/products/' + handle;
      }
    }
  });

  // ─── Sort Select ───────────────────────────────────────────
  var sortSelect = document.getElementById('jj-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      var rows = Array.from(tbody.querySelectorAll('tr[data-product-handle]'));
      var sortVal = sortSelect.value;

      rows.sort(function (a, b) {
        switch (sortVal) {
          case 'price-ascending':
            return parseFloat(a.getAttribute('data-product-price').replace(/[^0-9.]/g, '')) -
                   parseFloat(b.getAttribute('data-product-price').replace(/[^0-9.]/g, ''));
          case 'price-descending':
            return parseFloat(b.getAttribute('data-product-price').replace(/[^0-9.]/g, '')) -
                   parseFloat(a.getAttribute('data-product-price').replace(/[^0-9.]/g, ''));
          case 'title-ascending':
            return (a.getAttribute('data-product-title') || '').localeCompare(b.getAttribute('data-product-title') || '');
          case 'title-descending':
            return (b.getAttribute('data-product-title') || '').localeCompare(a.getAttribute('data-product-title') || '');
          default:
            return 0;
        }
      });

      rows.forEach(function (row) { tbody.appendChild(row); });
    });
  }
})();
