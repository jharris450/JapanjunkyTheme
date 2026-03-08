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
  var elTitle = document.getElementById('jj-detail-title');
  var elPrice = document.getElementById('jj-detail-price');
  var elMeta = document.getElementById('jj-detail-meta');
  var elImageContainer = document.getElementById('jj-detail-image-container');
  var elVisual = document.getElementById('jj-detail-visual');
  var elHeader = document.getElementById('jj-detail-header');
  var elAddBtn = document.getElementById('jj-add-to-cart-btn');
  var elVariantId = document.getElementById('jj-variant-id');
  var elCartForm = document.getElementById('jj-detail-cart-form');

  // Reduced motion preference
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pending typewriter timeouts
  var pendingTypes = {};

  // ─── Typewriter Effect ─────────────────────────────────────
  function typeIn(el, text, msPerChar) {
    if (!el || text == null) return;
    var key = el.id || 'el';
    if (pendingTypes[key]) { clearTimeout(pendingTypes[key]); delete pendingTypes[key]; }
    var str = String(text);
    el.textContent = '';
    if (reducedMotion) { el.textContent = str; return; }
    var i = 0;
    function tick() {
      if (i < str.length) {
        el.textContent += str[i++];
        pendingTypes[key] = setTimeout(tick, msPerChar);
      } else {
        delete pendingTypes[key];
      }
    }
    tick();
  }

  // ─── CSS Animation Trigger ─────────────────────────────────
  function triggerClass(el, cls) {
    if (reducedMotion || !el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow
    el.classList.add(cls);
  }

  // ─── Format Money ──────────────────────────────────────────
  function formatMoney(cents) {
    var amount = (cents / 100).toFixed(2);
    if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
      return window.Shopify.currency.active + amount;
    }
    return '$' + amount;
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
    var vendor = row.getAttribute('data-product-vendor') || '';
    var type = row.getAttribute('data-product-type') || '';
    var price = row.getAttribute('data-product-price') || '';
    var sku = row.getAttribute('data-product-sku') || '';
    var condition = row.getAttribute('data-product-condition') || '';
    var imageUrl = row.getAttribute('data-product-image') || '';
    var variantId = row.getAttribute('data-variant-id') || '';
    var available = row.getAttribute('data-product-available') === 'true';

    // Typewriter effects on key fields
    typeIn(elArtist, vendor.toUpperCase(), 24);
    typeIn(elTitle, title, 18);
    typeIn(elPrice, price, 14);

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
        '    │   ' + (sku || '◆◆◆').substring(0, 6).padEnd(6) + '     │\n' +
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

    // Meta block
    if (elMeta) {
      elMeta.innerHTML =
        '<div><span class="jj-meta-label">SKU:</span> <span class="jj-meta-value">' + escapeHtml(sku || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Vendor:</span> <span class="jj-meta-value">' + escapeHtml(vendor) + '</span></div>' +
        '<div><span class="jj-meta-label">Type:</span> <span class="jj-meta-value">' + escapeHtml(type || '---') + '</span></div>' +
        '<div><span class="jj-meta-label">Condition:</span> <span class="jj-meta-value">' + escapeHtml(condition) + '</span>' +
          (condition ? ' <span class="jj-cond-badge">' + escapeHtml(condition) + '</span>' : '') +
        '</div>';
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

    // Fetch full product data for description (optional enhancement)
    if (handle) {
      fetch('/products/' + handle + '.js')
        .then(function (res) {
          if (!res.ok) throw new Error('Not found');
          return res.json();
        })
        .then(function (product) {
          // Update with richer data if available
          if (product.description && elMeta) {
            var descDiv = document.createElement('div');
            descDiv.style.cssText = 'margin-top:6px;font-size:12px;color:#aaa;max-height:80px;overflow-y:auto;line-height:1.4;';
            descDiv.innerHTML = '<span class="jj-meta-label">Notes:</span> <span class="jj-meta-value">' + product.description.substring(0, 200) + '</span>';
            elMeta.appendChild(descDiv);
          }
          // Update variant ID to first available
          if (product.variants && product.variants.length > 0) {
            var firstAvailable = product.variants.find(function (v) { return v.available; });
            if (firstAvailable && elVariantId) {
              elVariantId.value = firstAvailable.id;
            }
          }
        })
        .catch(function () {
          // Silently fail - we already have data from attributes
        });
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

  // ─── Keyboard Support ──────────────────────────────────────
  tbody.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var row = e.target.closest('tr[data-product-handle]');
      if (row) {
        e.preventDefault();
        row.click();
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
