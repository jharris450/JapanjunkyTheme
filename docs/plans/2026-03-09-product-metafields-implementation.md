# Product Metafields & Layout Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace tag/vendor-based product data with Shopify metafields, restructure the catalogue title column and detail sidebar layout, eliminate sidebar dead space.

**Architecture:** Metafield values are rendered into `data-*` attributes on table rows by Liquid, then read by JavaScript to populate the detail pane. The detail pane HTML is reordered so artist sits above the image and title sits below. CSS adjustments handle the bigger artist text and tight sidebar stacking.

**Tech Stack:** Shopify Liquid, vanilla JavaScript, CSS

---

### Task 1: Update product-table-row.liquid — Metafield data attributes & title cell

**Files:**
- Modify: `snippets/product-table-row.liquid`

**Step 1: Replace tag-based condition with metafield and add new data attributes**

Replace the entire file content with:

```liquid
{%- comment -%}
  Product table row for the catalog table.
  Usage: {% render 'product-table-row', product: product, index: forloop.index0 %}
{%- endcomment -%}

{%- if product != blank -%}
  {%- comment -%} Read metafields {%- endcomment -%}
  {%- assign m_artist = product.metafields.custom.artist | default: '' -%}
  {%- assign m_condition = product.metafields.custom.condition | default: '' -%}
  {%- assign m_code = product.metafields.custom.code | default: '' -%}
  {%- assign m_year = product.metafields.custom.year | default: '' -%}
  {%- assign m_label = product.metafields.custom.label | default: '' -%}
  {%- assign m_format = product.metafields.custom.format | default: '' -%}
  {%- assign m_jp_name = product.metafields.custom.jp_name | default: '' -%}
  {%- assign m_jp_title = product.metafields.custom.jp_title | default: '' -%}

  {%- comment -%} Condition CSS class {%- endcomment -%}
  {%- assign p_condition = m_condition -%}
  {%- if p_condition == '' -%}
    {%- assign p_condition = 'N/A' -%}
  {%- endif -%}
  {%- assign cond_lower = p_condition | downcase -%}
  {%- assign p_condition_class = 'jj-cond-g' -%}
  {%- if cond_lower contains 'ex' or cond_lower contains 'mint' or cond_lower contains 'new' -%}
    {%- assign p_condition_class = 'jj-cond-ex' -%}
  {%- elsif cond_lower contains 'vg' or cond_lower contains 'very' -%}
    {%- assign p_condition_class = 'jj-cond-vg' -%}
  {%- endif -%}

  {%- comment -%} Normalize format to key {%- endcomment -%}
  {%- assign p_format_lower = m_format | downcase -%}
  {%- assign p_format = '' -%}
  {%- if p_format_lower contains 'vinyl' or p_format_lower contains 'lp' or p_format_lower contains 'record' -%}
    {%- assign p_format = 'vinyl' -%}
  {%- elsif p_format_lower contains 'cd' or p_format_lower contains 'compact disc' -%}
    {%- assign p_format = 'cd' -%}
  {%- elsif p_format_lower contains 'cassette' or p_format_lower contains 'tape' -%}
    {%- assign p_format = 'cassette' -%}
  {%- elsif p_format_lower contains 'minidisc' or p_format_lower contains 'mini disc' or p_format_lower contains 'md' -%}
    {%- assign p_format = 'minidisc' -%}
  {%- elsif p_format_lower contains 'hardware' or p_format_lower contains 'player' or p_format_lower contains 'walkman' or p_format_lower contains 'stereo' -%}
    {%- assign p_format = 'hardware' -%}
  {%- endif -%}

  <tr data-index="{{ index }}"
      data-product-handle="{{ product.handle }}"
      data-product-id="{{ product.id }}"
      data-product-title="{{ product.title | escape }}"
      data-product-artist="{{ m_artist | escape }}"
      data-product-vendor="{{ product.vendor | escape }}"
      data-product-type="{{ product.type | escape }}"
      data-product-price="{{ product.price | money }}"
      data-product-code="{{ m_code | escape }}"
      data-product-condition="{{ p_condition | escape }}"
      data-product-format="{{ p_format }}"
      data-product-format-label="{{ m_format | escape }}"
      data-product-year="{{ m_year | escape }}"
      data-product-label="{{ m_label | escape }}"
      data-product-jp-name="{{ m_jp_name | escape }}"
      data-product-jp-title="{{ m_jp_title | escape }}"
      data-product-image="{%- if product.featured_image -%}{{ product.featured_image | image_url: width: 480 }}{%- endif -%}"
      data-variant-id="{{ product.selected_or_first_available_variant.id }}"
      data-product-available="{{ product.available }}"
  >
    <td class="jj-cell-thumb">
      <div class="jj-thumb-img">
        {%- if product.featured_image -%}
          <img
            src="{{ product.featured_image | image_url: width: 144 }}"
            alt="{{ product.featured_image.alt | escape | default: product.title | escape }}"
            width="72"
            height="72"
            loading="lazy"
          >
        {%- else -%}
          <span style="font-size:10px;color:var(--jj-secondary);white-space:pre;font-family:'VT323',monospace;">&#9670;</span>
        {%- endif -%}
      </div>
    </td>
    <td class="jj-cell-code">{{ m_code | default: product.selected_or_first_available_variant.sku | default: product.handle | truncate: 10, '' }}</td>
    <td class="jj-cell-cat">
      {{ product.vendor | truncate: 12, '' }}<br>
      <span class="jj-cat-label">{{ product.type | default: '---' }}</span>
    </td>
    <td class="jj-cell-condition"><span class="{{ p_condition_class }}">{{ p_condition }}</span></td>
    <td class="jj-cell-format">{%- case p_format -%}{%- when 'vinyl' -%}○ {%- when 'cd' -%}◎ {%- when 'cassette' -%}▭ {%- when 'minidisc' -%}◇ {%- when 'hardware' -%}▪ {%- endcase -%}{{ m_format | default: product.type | default: '---' }}</td>
    <td class="jj-cell-title">
      <div class="jj-cell-name">{{ product.title }}</div>
      <div class="jj-cell-artist">{{ m_artist | default: '---' }}</div>
      <div class="jj-cell-meta">{{ m_label | default: '---' }} &middot; {{ m_year | default: '---' }}</div>
    </td>
    <td class="jj-cell-price">{{ product.price | money }}</td>
  </tr>
{%- else -%}
  <tr>
    <td class="jj-cell-thumb"><div class="jj-thumb-img"><span style="color:var(--jj-secondary);opacity:0.3;">&#9670;</span></div></td>
    <td class="jj-cell-code" style="color:#666;">---</td>
    <td class="jj-cell-cat" style="color:#666;">---</td>
    <td class="jj-cell-condition" style="color:#666;">---</td>
    <td class="jj-cell-format" style="color:#666;">---</td>
    <td class="jj-cell-title"><div class="jj-cell-name" style="color:#666;">Sample Product</div></td>
    <td class="jj-cell-price" style="color:#666;">---</td>
  </tr>
{%- endif -%}
```

**Step 2: Commit**

```bash
git add snippets/product-table-row.liquid
git commit -m "feat: switch product table row to Shopify metafields"
```

---

### Task 2: Update product-detail-pane.liquid — New element order

**Files:**
- Modify: `snippets/product-detail-pane.liquid`

**Step 1: Reorder HTML for new layout**

Replace the entire file content with:

```liquid
{%- comment -%}
  Right sidebar product detail pane — terminal output style.
  Populated dynamically by japanjunky-product-select.js on row click.

  Layout order:
    1. Header (terminal path)
    2. "Recently Added" label
    3. Artist (large, from custom.artist)
    4. JP Name (from custom.jp_name)
    5. Image
    6. Product Title
    7. JP Title (from custom.jp_title)
    8. Meta (Code, Label, Format, Year, Condition)
    9. Price row
   10. Actions
{%- endcomment -%}

<div class="jj-detail-header" id="jj-detail-header">C:\catalog\item.dat</div>
<div class="jj-detail-recently">Recently Added</div>
<div class="jj-detail-artist" id="jj-detail-artist">---</div>
<div class="jj-detail-jp-name" id="jj-detail-jp-name"></div>
<div class="jj-detail-image-wrap">
  <div class="jj-detail-image" id="jj-detail-image-container">
    <pre class="jj-ascii-art-large" id="jj-detail-visual">
    ┌──────────────┐
    │              │
    │   ◆  ◆  ◆   │
    │              │
    │   CLICK A    │
    │   PRODUCT    │
    │   TO VIEW    │
    │              │
    │   ◆  ◆  ◆   │
    │              │
    └──────────────┘</pre>
  </div>
</div>
<div class="jj-detail-item-title" id="jj-detail-title">---</div>
<div class="jj-detail-jp-title" id="jj-detail-jp-title"></div>
<div class="jj-detail-meta" id="jj-detail-meta">
  <div><span class="jj-meta-label">Code:</span> <span class="jj-meta-value">---</span></div>
  <div><span class="jj-meta-label">Label:</span> <span class="jj-meta-value">---</span></div>
  <div><span class="jj-meta-label">Format:</span> <span class="jj-meta-value">---</span></div>
  <div><span class="jj-meta-label">Year:</span> <span class="jj-meta-value">---</span></div>
  <div><span class="jj-meta-label">Condition:</span> <span class="jj-meta-value">---</span></div>
</div>
<div class="jj-detail-price-row">
  <div class="jj-detail-price" id="jj-detail-price">---</div>
  <div class="jj-detail-price-icons">
    <span title="Info">[i]</span><span title="Compare">[=]</span><span title="Share">[^]</span><span title="Zoom">[+]</span>
  </div>
</div>
<div class="jj-detail-actions" id="jj-detail-actions">
  <button class="jj-action-btn" id="jj-add-to-cart-btn" disabled>[Add to Cart]</button>
  <a href="/account" class="jj-action-btn">[Watchlist]</a>
</div>
<form id="jj-detail-cart-form" action="/cart/add" method="post" style="display:none;">
  <input type="hidden" name="id" id="jj-variant-id" value="">
  <input type="hidden" name="quantity" value="1">
</form>
```

**Step 2: Commit**

```bash
git add snippets/product-detail-pane.liquid
git commit -m "feat: reorder detail pane layout, add JP name/title slots"
```

---

### Task 3: Update japanjunky-product-select.js — Wire up new data attributes

**Files:**
- Modify: `assets/japanjunky-product-select.js`

**Step 1: Update element references, data reading, and meta population**

Key changes:
- Add `elJpName` element reference for `jj-detail-jp-name`
- Read new `data-product-*` attributes: artist, code, label, year, format-label, jp-name, jp-title
- Typewriter artist from `data-product-artist` instead of vendor
- Populate `elJpName` with jp-name data
- Populate `elJpTitle` from data attribute instead of AJAX tag parsing
- Update meta block to show Code, Label, Format, Year, Condition
- Remove AJAX-based Japanese title parsing (lines 203-209 of old code)
- Keep AJAX fetch for description notes and variant ID update only

Full replacement for `assets/japanjunky-product-select.js`:

```javascript
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

    // Typewriter effects on key fields
    typeIn(elArtist, (artist || vendor).toUpperCase(), 24);
    typeIn(elTitle, title, 18);
    typeIn(elPrice, price, 14);

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
```

**Step 2: Commit**

```bash
git add assets/japanjunky-product-select.js
git commit -m "feat: wire detail pane to metafield data attributes"
```

---

### Task 4: Update japanjunky-homepage.css — Styling changes

**Files:**
- Modify: `assets/japanjunky-homepage.css`

**Step 1: Update detail-artist to be bigger**

Change `.jj-detail-artist` (line 479) font-size from `14px` to `18px`:

```css
.jj-detail-artist {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--jj-primary);
  padding: 6px 12px 2px;
  text-transform: uppercase;
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.4);
}
```

**Step 2: Add CSS for .jj-detail-jp-name**

Add after `.jj-detail-artist` block (after line 487):

```css
.jj-detail-jp-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--jj-muted);
  padding: 0 12px 4px;
  line-height: 1.4;
  min-height: 0;
}
.jj-detail-jp-name:empty {
  display: none;
}
```

**Step 3: Add bottom padding to detail-actions for spacing before marquee**

Change `.jj-detail-actions` (line 556) padding:

```css
.jj-detail-actions { padding: 8px 12px 16px; display: flex; gap: 4px; }
```

**Step 4: Commit**

```bash
git add assets/japanjunky-homepage.css
git commit -m "feat: style bigger artist, add jp-name, tighten sidebar"
```

---

### Task 5: Visual verification

**Verify on the live dev site:**
1. Product table title column shows: Title / Artist / [Label] · [Year]
2. Detail pane order: Header → Recently Added → Artist (large) → JP Name → Image → Title → JP Title → Meta (Code, Label, Format, Year, Condition) → Price → Actions
3. Artist text is visibly larger than before
4. JP Name appears below artist when populated, hidden when empty
5. JP Title appears below product title when populated, hidden when empty
6. No dead space between actions and bottom of sidebar
7. Marquee bar spans full width below the grid
8. Products without metafield data show `---` placeholders
