# Ring Carousel Catalog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed right 40% catalog panel with a full-viewport CSS 3D horizontal arc carousel of album covers.

**Architecture:** Product data emitted as JSON from Liquid. Ring carousel is a CSS perspective container with `rotateY()/translateZ()` covers. Filter/search logic absorbed into the ring module. Existing `jj:product-selected`/`jj:product-deselected` event contract preserved. Product viewer and screensaver unchanged.

**Tech Stack:** Shopify Liquid, vanilla CSS (3D transforms), vanilla JS (ES5 IIFE pattern), no build tools.

**Spec:** `docs/superpowers/specs/2026-03-20-ring-carousel-catalog-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `assets/japanjunky-ring-carousel.css` | Ring container, perspective, cover positioning, filter/search bar, arc animations, format accent colors |
| `assets/japanjunky-ring-carousel.js` | Ring state, cover lifecycle, arc layout, rotation, keyboard/mouse/scroll/touch input, filter/search logic, 300ms selection delay, event dispatch |

### Modified Files

| File | Changes |
|------|---------|
| `sections/jj-homepage-body.liquid` | Replace HTML inventory rows with `window.JJ_PRODUCTS` JSON array in `<script>` tag |
| `layout/theme.liquid` | Remove `jj-catalog-panel` div + old CSS/JS imports, add ring container + new imports, resize viewer interaction overlay |
| `assets/japanjunky-product-info.css` | Reposition from `bottom: 48px` to `bottom: calc(40vh + 8px)` |
| `assets/japanjunky-product-viewer.js` | Shift `MODEL_POS.y` up to clear the ring area |

### Removed Files

| File | Reason |
|------|--------|
| `assets/japanjunky-catalog-panel.css` | Replaced by ring carousel CSS |
| `assets/japanjunky-catalog-panel.js` | Replaced by ring carousel JS |
| `assets/japanjunky-filter.js` | Absorbed into ring carousel JS |
| `assets/japanjunky-search.js` | Absorbed into ring carousel JS |

**Note:** `snippets/product-inventory-row.liquid` and `snippets/category-list.liquid` are no longer rendered but remain in the repo (Shopify keeps unreferenced snippets harmlessly).

---

## Chunk 1: Data Layer + CSS Foundation

### Task 1: Rewrite Homepage Body to Emit JSON

**Files:**
- Modify: `sections/jj-homepage-body.liquid`

The current file renders HTML inventory rows via `{% render 'product-inventory-row' %}`. Replace ALL of it (except the schema block) with a `<script>` tag that builds a `window.JJ_PRODUCTS` array. This is the sole data source for the ring carousel.

- [ ] **Step 1: Rewrite the section body**

Replace the entire content above `{% schema %}` with:

```liquid
{%- assign featured = section.settings.collection | default: collections['all'] -%}

{%- comment -%} Ring carousel data — consumed by japanjunky-ring-carousel.js {%- endcomment -%}
<script>
window.JJ_PRODUCTS = [
  {%- assign first_item = true -%}
  {%- for product in featured.products limit: section.settings.products_to_show -%}
    {%- for variant in product.variants -%}
      {%- if variant.available -%}
        {%- comment -%} Metafields {%- endcomment -%}
        {%- assign m_artist = product.metafields.custom.artist | default: '' -%}
        {%- assign m_code = product.metafields.custom.code | default: '' -%}
        {%- assign m_year = product.metafields.custom.year | default: '' -%}
        {%- assign m_label = product.metafields.custom.label | default: '' -%}
        {%- assign m_format = product.metafields.custom.format | default: '' -%}
        {%- assign m_jp_name = product.metafields.custom.jp_name | default: '' -%}
        {%- assign m_jp_title = product.metafields.custom.jp_title | default: '' -%}

        {%- comment -%} Normalize format {%- endcomment -%}
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

        {%- comment -%} Normalize condition {%- endcomment -%}
        {%- assign p_condition = variant.option1 | default: 'N/A' | downcase | strip -%}

        {%- comment -%} 3D type {%- endcomment -%}
        {%- assign p_3d_type = 'plane' -%}
        {%- for tag in product.tags -%}
          {%- if tag == '3d-box' -%}{%- assign p_3d_type = 'box' -%}{%- endif -%}
        {%- endfor -%}

        {%- comment -%} Images {%- endcomment -%}
        {%- assign second_image_url = '' -%}
        {%- if product.images.size > 1 -%}
          {%- assign second_image_url = product.images[1] | image_url: width: 480 -%}
        {%- endif -%}

        {%- unless first_item -%},{%- endunless -%}
        {%- assign first_item = false -%}
        {
          "handle": {{ product.handle | json }},
          "id": {{ product.id | json }},
          "title": {{ product.title | json }},
          "artist": {{ m_artist | json }},
          "vendor": {{ product.vendor | json }},
          "code": {{ m_code | json }},
          "condition": {{ p_condition | json }},
          "format": {{ p_format | json }},
          "formatLabel": {{ m_format | json }},
          "year": {{ m_year | json }},
          "label": {{ m_label | json }},
          "jpName": {{ m_jp_name | json }},
          "jpTitle": {{ m_jp_title | json }},
          "image": {%- if product.featured_image -%}{{ product.featured_image | image_url: width: 480 | json }}{%- else -%}""{%- endif -%},
          "imageBack": {{ second_image_url | json }},
          "type3d": {{ p_3d_type | json }},
          "variantId": {{ variant.id | json }},
          "available": {{ variant.available }},
          "price": {{ variant.price | money | json }}
        }
      {%- endif -%}
    {%- endfor -%}
  {%- endfor -%}
];
</script>
```

Keep the `{% schema %}` block exactly as-is (unchanged).

- [ ] **Step 2: Verify JSON output**

Open the Shopify preview. View page source (Ctrl+U). Search for `JJ_PRODUCTS`. Confirm it is a valid JSON array with product objects containing all fields: `handle`, `id`, `title`, `artist`, `vendor`, `code`, `condition`, `format`, `formatLabel`, `year`, `label`, `jpName`, `jpTitle`, `image`, `imageBack`, `type3d`, `variantId`, `available`, `price`.

Open browser console, type `window.JJ_PRODUCTS` and confirm it's a non-empty array.

- [ ] **Step 3: Commit**

```bash
git add sections/jj-homepage-body.liquid
git commit -m "feat(ring): emit product data as JJ_PRODUCTS JSON array"
```

---

### Task 2: Create Ring Carousel CSS

**Files:**
- Create: `assets/japanjunky-ring-carousel.css`

This file styles the ring container, perspective, cover elements, filter/search bar, and animations. Follow the existing codebase conventions: `jj-` prefix, BEM-like naming, monospace fonts, no rounded corners.

- [ ] **Step 1: Create the CSS file**

Create `assets/japanjunky-ring-carousel.css` with the following content:

```css
/* ============================================
   JAPANJUNKY RING CAROUSEL
   Full-viewport horizontal arc of album covers
   ============================================ */

/* --- Ring Container --- */
.jj-ring {
  position: fixed;
  left: 0;
  bottom: 32px; /* above taskbar */
  width: 100vw;
  height: 40vh;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  pointer-events: none;
}

/* --- Filter/Search Bar --- */
.jj-ring__bar {
  width: 100%;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: rgba(10, 10, 10, 0.85);
  border-bottom: 1px solid #222;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
  pointer-events: auto;
  position: relative;
  z-index: 2;
}

.jj-ring__search-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.jj-ring__search-prompt {
  color: var(--jj-secondary, #f5d742);
  font-size: 11px;
}

.jj-ring__search {
  width: 140px;
  height: 22px;
  padding: 0 4px;
  background: #000;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: inherit;
  font-size: 11px;
}

.jj-ring__search:focus {
  border-color: var(--jj-accent, #4aa4e0);
  outline: none;
}

.jj-ring__filter-btn {
  font-family: inherit;
  font-size: 11px;
  color: #888;
  background: none;
  border: 1px solid #333;
  padding: 2px 6px;
  cursor: default;
  position: relative;
}

.jj-ring__filter-btn:hover {
  color: var(--jj-text, #e0d5c0);
  border-color: #555;
}

.jj-ring__filter-btn--active {
  color: var(--jj-secondary, #f5d742);
  border-color: var(--jj-secondary, #f5d742);
}

.jj-ring__filter-badge {
  font-size: 9px;
  color: var(--jj-primary, #e8313a);
  margin-left: 2px;
}

.jj-ring__clear-btn {
  font-family: inherit;
  font-size: 10px;
  color: #555;
  background: none;
  border: none;
  cursor: default;
  display: none;
}

.jj-ring__clear-btn--visible {
  display: inline;
}

.jj-ring__clear-btn:hover {
  color: var(--jj-primary, #e8313a);
}

.jj-ring__count {
  margin-left: auto;
  color: #555;
  font-size: 10px;
  white-space: nowrap;
}

/* --- Filter Dropdown --- */
.jj-ring__dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 160px;
  background: rgba(10, 10, 10, 0.95);
  border: 1px solid #333;
  padding: 4px 0;
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
}

.jj-ring__dropdown--open {
  display: block;
}

.jj-ring__dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
  color: #888;
  cursor: default;
}

.jj-ring__dropdown-item:hover {
  background: #111;
  color: var(--jj-text, #e0d5c0);
}

.jj-ring__dropdown-item--active {
  color: var(--jj-secondary, #f5d742);
}

.jj-ring__dropdown-check {
  width: 10px;
  text-align: center;
}

/* --- Arc Stage --- */
.jj-ring__stage {
  flex: 1;
  width: 100%;
  perspective: 800px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
  position: relative;
}

/* --- Cover Elements --- */
.jj-ring__cover {
  position: absolute;
  width: 180px;
  height: 180px;
  transform-style: preserve-3d;
  transition: transform 0.4s ease-out, opacity 0.3s;
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.jj-ring__cover-img-wrap {
  width: 180px;
  height: 180px;
  overflow: hidden;
  border: 1px solid #333;
  background: #050505;
  flex-shrink: 0;
}

.jj-ring__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  display: block;
}

.jj-ring__cover-label {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 10px;
  color: #888;
  margin-top: 4px;
  text-align: center;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Selected cover glow */
.jj-ring__cover--selected .jj-ring__cover-img-wrap {
  border-color: var(--jj-primary, #e8313a);
  box-shadow: 0 0 8px rgba(232, 49, 58, 0.3);
}

.jj-ring__cover--selected .jj-ring__cover-label {
  color: var(--jj-text, #e0d5c0);
}

/* Format-specific border on selected */
.jj-ring__cover--selected[data-format="vinyl"] .jj-ring__cover-img-wrap {
  border-color: var(--jj-amber, #ffaa00);
  box-shadow: 0 0 8px rgba(255, 170, 0, 0.3);
}

.jj-ring__cover--selected[data-format="cd"] .jj-ring__cover-img-wrap {
  border-color: var(--jj-cyan, #00e5e5);
  box-shadow: 0 0 8px rgba(0, 229, 229, 0.3);
}

.jj-ring__cover--selected[data-format="cassette"] .jj-ring__cover-img-wrap {
  border-color: var(--jj-green, #33ff33);
  box-shadow: 0 0 8px rgba(51, 255, 51, 0.3);
}

.jj-ring__cover--selected[data-format="minidisc"] .jj-ring__cover-img-wrap {
  border-color: var(--jj-magenta, #e040e0);
  box-shadow: 0 0 8px rgba(224, 64, 224, 0.3);
}

.jj-ring__cover--selected[data-format="hardware"] .jj-ring__cover-img-wrap {
  border-color: var(--jj-white, #e0e0e0);
  box-shadow: 0 0 8px rgba(224, 224, 224, 0.3);
}

/* --- Empty State --- */
.jj-ring__empty {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: #555;
  text-align: center;
}

/* --- Reduced Motion --- */
@media (prefers-reduced-motion: reduce) {
  .jj-ring__cover {
    transition: none;
  }
}

/* --- High Contrast --- */
@media (prefers-contrast: more) {
  .jj-ring__cover--selected .jj-ring__cover-img-wrap {
    border-width: 2px;
    border-color: #fff;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-ring-carousel.css
git commit -m "feat(ring): add ring carousel CSS with arc layout and filter bar"
```

---

## Chunk 2: Ring Carousel JavaScript

### Task 3: Create Ring Carousel JS

**Files:**
- Create: `assets/japanjunky-ring-carousel.js`

This is the largest new file. It contains the complete ring carousel module: core arc layout, cover lifecycle, all input handlers (keyboard, mouse, scroll, touch), filter/search logic, 300ms selection delay, and event dispatch. Written as a single ES5 IIFE following the codebase pattern.

- [ ] **Step 1: Create the JS file with core ring logic**

Create `assets/japanjunky-ring-carousel.js`:

```javascript
/**
 * japanjunky-ring-carousel.js
 * Full-viewport horizontal arc carousel of album covers.
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

  // ─── Arc Config ────────────────────────────────────────────────
  var ARC = [
    { offset: 0,  rotateY: 0,    scale: 1.0,  opacity: 1.0  },
    { offset: 1,  rotateY: 30,   scale: 0.75, opacity: 0.85 },
    { offset: -1, rotateY: -30,  scale: 0.75, opacity: 0.85 },
    { offset: 2,  rotateY: 55,   scale: 0.55, opacity: 0.6  },
    { offset: -2, rotateY: -55,  scale: 0.55, opacity: 0.6  },
    { offset: 3,  rotateY: 75,   scale: 0.4,  opacity: 0.35 },
    { offset: -3, rotateY: -75,  scale: 0.4,  opacity: 0.35 }
  ];
  var VISIBLE_RANGE = 3; // covers visible on each side of center
  var TRANSLATE_Z = 280; // depth push in perspective

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

    var label = document.createElement('div');
    label.className = 'jj-ring__cover-label';
    label.textContent = product.title || 'Untitled';

    div.appendChild(imgWrap);
    div.appendChild(label);

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

      el.style.transform = 'rotateY(' + slot.rotateY + 'deg) translateZ(' + TRANSLATE_Z + 'px) scale(' + slot.scale + ')';
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

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      rotateRight();
    } else if (e.key === 'ArrowLeft') {
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

    if (e.deltaY > 0 || e.deltaX > 0) {
      rotateRight();
    } else if (e.deltaY < 0 || e.deltaX < 0) {
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
    // Only register horizontal swipes, one rotation per gesture
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      touchMoved = true;
      touchLocked = true; // one rotation per swipe gesture
      if (dx > 0) {
        rotateLeft();
      } else {
        rotateRight();
      }
    }
  }, { passive: true });

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
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-ring-carousel.js
git commit -m "feat(ring): add ring carousel JS with arc layout, input, filters, selection"
```

---

## Chunk 3: Layout Integration + Cleanup

### Task 4: Update Theme Layout

**Files:**
- Modify: `layout/theme.liquid`

Remove the old catalog panel HTML and script/CSS imports. Add the ring carousel container HTML and new imports. Resize the viewer interaction overlay.

- [ ] **Step 1: Replace the catalog panel div with ring carousel container**

In `layout/theme.liquid`, replace lines 136-147 (the `jj-catalog-panel` block) with:

```liquid
  {%- comment -%} Ring carousel: full-viewport album cover arc {%- endcomment -%}
  <div class="jj-ring" id="jj-ring" role="listbox" aria-roledescription="carousel" aria-label="Product catalog">
    <div class="jj-ring__bar">
      <div class="jj-ring__search-wrap">
        <span class="jj-ring__search-prompt">&gt;</span>
        <input class="jj-ring__search" id="jj-ring-search" type="text" placeholder="SEARCH..." autocomplete="off">
      </div>
      <button class="jj-ring__filter-btn" data-filter-group="format" type="button">
        [FORMAT]<span class="jj-ring__filter-badge"></span>
        <div class="jj-ring__dropdown" id="jj-ring-dropdown-format"></div>
      </button>
      <button class="jj-ring__filter-btn" data-filter-group="decade" type="button">
        [DECADE]<span class="jj-ring__filter-badge"></span>
        <div class="jj-ring__dropdown" id="jj-ring-dropdown-decade"></div>
      </button>
      <button class="jj-ring__filter-btn" data-filter-group="condition" type="button">
        [CONDITION]<span class="jj-ring__filter-badge"></span>
        <div class="jj-ring__dropdown" id="jj-ring-dropdown-condition"></div>
      </button>
      <button class="jj-ring__clear-btn" id="jj-ring-clear" type="button">[CLEAR]</button>
      <span class="jj-ring__count" id="jj-ring-count"></span>
    </div>
    <div class="jj-ring__stage" id="jj-ring-stage"></div>
  </div>

  {%- comment -%} Header group (navigation, store links) — moved out of old catalog panel {%- endcomment -%}
  {% sections 'header-group' %}

  {%- comment -%} Shopify content_for_layout — homepage outputs JJ_PRODUCTS JSON, other pages render normally {%- endcomment -%}
  <main id="MainContent" role="main"{% if template == 'index' %} style="display:none;"{% endif %}>
    {{ content_for_layout }}
  </main>
```

Note: `content_for_layout` is required by Shopify. On the homepage it outputs only the `<script>` tag with JSON data (hidden). On other pages (product, cart, etc.) it renders normally. The `{% sections 'header-group' %}` is moved outside the ring container so it still renders on all pages.

- [ ] **Step 2: Replace CSS imports**

Replace line 32:
```liquid
  {{ 'japanjunky-catalog-panel.css' | asset_url | stylesheet_tag }}
```
with:
```liquid
  {{ 'japanjunky-ring-carousel.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 3: Replace JS imports**

Replace lines 183-185:
```liquid
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-catalog-panel.js' | asset_url }}" defer></script>
```
with:
```liquid
  <script src="{{ 'japanjunky-ring-carousel.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(ring): wire up ring carousel in theme layout, remove old panel"
```

---

### Task 5: Update Viewer Interaction Overlay

**Files:**
- Modify: `assets/japanjunky-ring-carousel.css` (the viewer interaction styles were in catalog-panel.css which is being removed)

The viewer interaction overlay CSS was in `japanjunky-catalog-panel.css` (lines 326-343). Since that file is being removed, we need to move these styles. Add them to the ring carousel CSS, updated for the new layout (upper 60vh, z-index 75).

- [ ] **Step 1: Add viewer interaction styles to ring carousel CSS**

Append to `assets/japanjunky-ring-carousel.css`:

```css
/* --- Viewer Interaction Overlay (moved from catalog-panel.css) --- */
.jj-viewer-interaction {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 60vh;
  z-index: 75;
  pointer-events: none;
}

.jj-viewer-interaction--active {
  pointer-events: auto;
  cursor: grab;
}

.jj-viewer-interaction--dragging {
  cursor: grabbing;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-ring-carousel.css
git commit -m "feat(ring): move viewer interaction overlay styles to ring carousel CSS"
```

---

### Task 6: Reposition Product Info Overlay

**Files:**
- Modify: `assets/japanjunky-product-info.css`

Move the product info panel from `bottom: 48px` to sit above the ring's top edge.

- [ ] **Step 1: Update the positioning**

In `assets/japanjunky-product-info.css`, change line 9:
```css
  bottom: 48px; /* 32px taskbar + 16px gap */
```
to:
```css
  bottom: calc(40vh + 8px); /* above ring carousel top edge */
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-info.css
git commit -m "fix(ring): reposition product info overlay above ring carousel"
```

---

### Task 7: Adjust 3D Model Position

**Files:**
- Modify: `assets/japanjunky-product-viewer.js`

The ring carousel occupies the bottom 40vh. The 3D model should be positioned in the upper 60% of the viewport, shifted up from its current y=0.

- [ ] **Step 1: Shift model position up**

In `assets/japanjunky-product-viewer.js`, change line 47:
```javascript
    var MODEL_POS = { x: 1.0, y: 0, z: 8 };
```
to:
```javascript
    var MODEL_POS = { x: 1.0, y: 1.5, z: 8 };
```

This shifts the model up in the scene to clear the ring area. The exact value may need tuning.

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-viewer.js
git commit -m "fix(ring): shift 3D model up to clear ring carousel area"
```

---

### Task 8: Remove Deprecated Script Tags

**Files:**
- Modify: `layout/theme.liquid` (already partially done in Task 4, but verify)

Confirm that the old `japanjunky-filter.js`, `japanjunky-search.js`, and `japanjunky-catalog-panel.js` script tags are removed. The CSS import for `japanjunky-catalog-panel.css` should also be gone.

This step is a verification — Task 4 should have already handled these removals. If any remain, remove them now.

- [ ] **Step 1: Verify no old imports remain**

Search `layout/theme.liquid` for:
- `japanjunky-catalog-panel.css` — should NOT be present
- `japanjunky-catalog-panel.js` — should NOT be present
- `japanjunky-filter.js` — should NOT be present
- `japanjunky-search.js` — should NOT be present

If any are found, remove the lines.

- [ ] **Step 2: Commit (only if changes were needed)**

```bash
git add layout/theme.liquid
git commit -m "fix(ring): remove remaining deprecated script/css imports"
```

---

### Task 9: Update Tsuno Daishi Idle Position

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

With the ring in the bottom 40%, Tsuno Daishi's idle position should be in the upper viewport area. Shift y up to match the 3D model area.

- [ ] **Step 1: Adjust Tsuno idle position**

Find the `TSUNO_IDLE_POS` variable (currently `{ x: 1.0, y: 0, z: 6 }`) and change to:
```javascript
  var TSUNO_IDLE_POS = { x: 1.0, y: 1.5, z: 6 };
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "fix(ring): shift Tsuno idle position up to clear ring area"
```

---

### Task 10: Browser Verification

This is a manual integration test. Load the Shopify preview and verify everything works.

- [ ] **Step 1: Verify ring renders**

1. Open the Shopify preview in Chrome at 2560x1440
2. Confirm the ring carousel appears in the bottom ~40% of the viewport
3. Confirm album covers are arranged in a horizontal arc — center cover large, sides smaller
4. Confirm the Three.js portal background is visible behind the ring
5. Confirm the CRT overlay scanlines render on top of everything

- [ ] **Step 2: Verify navigation**

1. Press ArrowRight — ring rotates, new cover centers
2. Press ArrowLeft — ring rotates the other direction
3. Scroll wheel over ring area — rotates
4. Click a side cover — it rotates to center
5. Confirm smooth CSS transitions on rotation (0.4s ease-out)

- [ ] **Step 3: Verify selection**

1. Let a cover sit in center for >300ms — confirm `jj:product-selected` fires (3D model appears, product info shows with typewriter animation)
2. Press Enter on center cover — immediate select
3. Click center cover — immediate select
4. Press Escape — model disappears, product info hides
5. Rapidly scroll through 5+ covers — confirm no model loads during rapid scrolling
6. Confirm Tsuno Daishi transitions out when product selected, returns when deselected

- [ ] **Step 4: Verify 3D model positioning**

1. Confirm LP model renders in the upper portion of the viewport, not overlapping the ring
2. Confirm drag-to-rotate works via the interaction overlay (upper 60vh)
3. Confirm the product info panel sits just above the ring's top edge

- [ ] **Step 5: Verify filter/search**

1. Type in search bar — ring filters to matching covers in real-time
2. Click [FORMAT] — dropdown appears with checkbox options
3. Toggle a format filter — ring shows only matching products
4. Confirm count updates: "12 OF 47 ITEMS"
5. Click [CLEAR] — all filters reset, full ring restored
6. Confirm multiple filter groups AND together (e.g., format=vinyl AND decade=1980)

- [ ] **Step 6: Verify no console errors**

1. Open DevTools console
2. Confirm no JS errors from our code (ignore Shopify web-pixels sandbox errors)
3. Confirm no 404s for removed files (filter.js, search.js, catalog-panel.js/css)

- [ ] **Step 7: Push**

```bash
git push
```
