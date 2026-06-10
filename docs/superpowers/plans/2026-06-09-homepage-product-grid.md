# Homepage Product Grid + Featured Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two scroll-snapped homepage screens — existing scene + ring (now a curated featured showcase) on screen 1, a traditional filterable product grid on screen 2.

**Architecture:** A homepage-only fixed scroll wrapper (`#jj-scroll`, `pointer-events:none`) overlays the existing no-scroll app shell. Screen 1 is a transparent spacer; screen 2 is a solid panel holding the grid. The ring's search/filter bar relocates to the grid header; the ring consumes a new `JJ_FEATURED` array. Hero→grid transition is JS wheel paging; grid→hero and intra-grid scrolling are native (wheel targets land inside the wrapper there).

**Tech Stack:** Shopify Liquid, vanilla ES5 JS (matches existing assets), plain CSS. No test infra exists in this theme — every task ends with manual verification via `shopify theme dev` preview.

**Spec:** `docs/superpowers/specs/2026-06-09-homepage-product-grid-design.md`

**Key existing facts (verified):**
- `html`/`body` are `overflow:hidden` — homepage never scrolls today (`assets/japanjunky-base.css:21`)
- Ring + product zone: `position:fixed`, `z-index:50`. Start menu: 2000. CRT overlay: 10000. Taskbar: 10010. Scroll wrapper uses **100**.
- Ring markup: `layout/theme.liquid:175-198`. Ring bar (search/filters) is lines 177-196.
- `JJ_PRODUCTS` JSON built in `sections/jj-homepage-body.liquid` (one entry per **available variant**, so one product can appear multiple times with different conditions — this is intentional, keep it).
- Ring JS owns all filter/search logic today (`assets/japanjunky-ring-carousel.js:450-631`).
- Ring's wheel handler rotates the carousel and only listens on `#jj-ring` (24vw top-right region).
- `image-rendering:pixelated`, monospace only, no rounded corners, CRT-style animations only (steps/blink).

---

### Task 1: Extract product JSON snippet, output two arrays

**Files:**
- Create: `snippets/jj-product-json.liquid`
- Modify: `sections/jj-homepage-body.liquid`

- [ ] **Step 1: Create the snippet**

Create `snippets/jj-product-json.liquid` containing the serialization loop currently in `sections/jj-homepage-body.liquid:6-74`, parameterized. Exact content:

```liquid
{%- comment -%}
  Serializes a collection's products to comma-separated JSON objects
  (no surrounding brackets). One entry per available variant.
  Usage: {% render 'jj-product-json', items: collection.products, limit: 20 %}
{%- endcomment -%}
{%- assign first_item = true -%}
{%- for product in items limit: limit -%}
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
```

- [ ] **Step 2: Rewrite the section to use the snippet and emit both arrays**

Replace the **entire** contents of `sections/jj-homepage-body.liquid` (everything before `{% schema %}`) with:

```liquid
{%- assign catalog = section.settings.collection | default: collections['all'] -%}
{%- assign featured = section.settings.featured_collection -%}

{%- comment -%}
  JJ_PRODUCTS: full catalog — consumed by japanjunky-product-grid.js
  JJ_FEATURED: curated ring items — consumed by japanjunky-ring-carousel.js
{%- endcomment -%}
<script>
window.JJ_PRODUCTS = [
  {% render 'jj-product-json', items: catalog.products, limit: section.settings.products_to_show %}
];
{%- if featured != blank and featured.products.size > 0 %}
window.JJ_FEATURED = [
  {% render 'jj-product-json', items: featured.products, limit: 10 %}
];
{%- else %}
window.JJ_FEATURED = window.JJ_PRODUCTS.slice(0, 8);
{%- endif %}
</script>
```

And replace the schema block with:

```liquid
{% schema %}
{
  "name": "Homepage Body",
  "settings": [
    {
      "type": "collection",
      "id": "collection",
      "label": "Catalog collection (grid)"
    },
    {
      "type": "collection",
      "id": "featured_collection",
      "label": "Featured collection (ring)",
      "info": "Curated picks for the ring carousel, max 10. Falls back to first 8 catalog items."
    },
    {
      "type": "range",
      "id": "products_to_show",
      "label": "Products to show",
      "min": 4,
      "max": 50,
      "step": 2,
      "default": 20
    }
  ],
  "presets": [
    {
      "name": "Homepage Body"
    }
  ]
}
{% endschema %}
```

- [ ] **Step 3: Verify in preview**

Run: `shopify theme dev` (or use the already-running preview), open the homepage, open devtools console.
Expected: `window.JJ_PRODUCTS.length` > 0, `window.JJ_FEATURED.length` between 1 and 10, both arrays' first item has `handle`, `price`, `format` keys. Ring still renders (it still reads `JJ_PRODUCTS` until Task 2 — that's fine).

- [ ] **Step 4: Commit**

```bash
git add snippets/jj-product-json.liquid sections/jj-homepage-body.liquid
git commit -m "feat(homepage): emit JJ_FEATURED + JJ_PRODUCTS via shared JSON snippet"
```

---

### Task 2: Ring becomes pure featured showcase

**Files:**
- Modify: `assets/japanjunky-ring-carousel.js`
- Modify: `layout/theme.liquid:175-198` (ring block)
- Modify: `assets/japanjunky-ring-carousel.css`

- [ ] **Step 1: Point ring at JJ_FEATURED and strip filter/search/count code**

In `assets/japanjunky-ring-carousel.js`:

1. Update the header comment: `Consumes: window.JJ_FEATURED (from jj-homepage-body.liquid)` and delete the line `Absorbs filter + search logic...`.
2. Line 13: `var allProducts = window.JJ_PRODUCTS || [];` → `var allProducts = window.JJ_FEATURED || [];`
3. Delete line 19 (`var countEl = document.getElementById('jj-ring-count');`).
4. Delete the `─── Filter State ───` block (lines 60-66: `activeFilters`, `searchQuery`).
5. Delete the set helpers (lines 70-74: `setHas`, `setAdd`, `setDel`, `setSize`, `setKeys`) — only filter code used them.
6. Delete the entire `─── Filtering ───` section (lines 76-128: `matchesFilters`, `refilter`).
7. Delete the entire `─── Count Display ───` section (lines 245-254: `updateCount`).
8. In the wheel handler, delete the dropdown guard lines:
```js
    // Don't capture scroll when a dropdown is open under cursor
    if (e.target.closest('.jj-ring__dropdown--open')) return;
```
9. Delete the entire `─── Filter Bar UI ───` section (lines 450-631: search input wiring, `filterBtns` loop, `closeAllDropdowns`, `updateFilterBtnState`, `updateClearBtn`, clear button handler, and the document-level outside-click dropdown closer).
10. Change the init block at the bottom from:
```js
  // ─── Init ──────────────────────────────────────────────────────
  renderRing();
  updateCount();
```
to:
```js
  // ─── Init ──────────────────────────────────────────────────────
  renderRing();
```

`filteredProducts` stays (initialized `allProducts.slice()` at line 54) — it is now never re-filtered; all render/rotate/select code that reads it keeps working unchanged.

- [ ] **Step 2: Remove the bar markup from the ring block in theme.liquid**

In `layout/theme.liquid`, replace lines 175-198 (the whole `jj-ring` div) with:

```liquid
  {%- comment -%} Ring carousel: featured picks arc {%- endcomment -%}
  <div class="jj-ring" id="jj-ring" role="listbox" aria-roledescription="carousel" aria-label="Featured products">
    <div class="jj-ring__stage" id="jj-ring-stage"></div>
  </div>
```

- [ ] **Step 3: Remove bar styles from ring CSS**

In `assets/japanjunky-ring-carousel.css`, delete the `--- Filter/Search Bar ---` and `--- Filter Dropdown ---` blocks — everything from `.jj-ring__bar {` (line 21) through the end of `.jj-ring__dropdown-check { ... }` (line 183). Keep `--- Arc Stage ---` onward. (These styles reappear renamed `jj-grid__*` in Task 4.)

- [ ] **Step 4: Verify in preview**

Homepage: ring renders featured items only (count = featured collection size or 8 fallback), no search bar / filter buttons top-right, wheel-over-ring still rotates, arrow keys rotate, clicking a side cover centers it, centering for 300ms fires product info panel on the left, add-to-cart button enables. Console: zero errors.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-ring-carousel.js layout/theme.liquid assets/japanjunky-ring-carousel.css
git commit -m "feat(ring): consume JJ_FEATURED, drop filter/search bar"
```

---

### Task 3: Scroll wrapper, screens, indicator, fade + wheel paging

**Files:**
- Modify: `layout/theme.liquid` (markup after ring block + asset tags)
- Create: `assets/japanjunky-product-grid.css` (wrapper/screens/indicator/fade portion)
- Create: `assets/japanjunky-product-grid.js` (paging/fade portion)

- [ ] **Step 1: Add scroll wrapper markup**

In `layout/theme.liquid`, immediately after the ring block's closing `</div>` (still inside the `{% unless template == 'product' or template.suffix == 'login' %}` guard), add:

```liquid
  {%- comment -%} Scroll wrapper: screen 1 = scene/ring hero, screen 2 = product grid {%- endcomment -%}
  {% if template == 'index' %}
  <div class="jj-scroll" id="jj-scroll">
    <div class="jj-scroll__screen jj-scroll__screen--hero">
      <button class="jj-scroll__indicator" id="jj-scroll-indicator" type="button" aria-label="Scroll to catalog">&#9660; CATALOG</button>
    </div>
    <div class="jj-scroll__screen jj-scroll__screen--grid">
      <div class="jj-grid" id="jj-grid"></div>
    </div>
  </div>
  {% endif %}
```

(The grid header bar is added in Task 5; `#jj-grid` stays empty until Task 4's JS fills it.)

- [ ] **Step 2: Add asset tags**

In `layout/theme.liquid` head, after line 33 (`japanjunky-ring-carousel.css`):

```liquid
  {{ 'japanjunky-product-grid.css' | asset_url | stylesheet_tag }}
```

After the ring carousel script (line 267, inside the same `{% unless %}`):

```liquid
  <script src="{{ 'japanjunky-product-grid.js' | asset_url }}" defer></script>
```

- [ ] **Step 3: Create grid CSS (wrapper portion)**

Create `assets/japanjunky-product-grid.css`:

```css
/* ============================================
   JAPANJUNKY PRODUCT GRID
   Scroll-snap catalog below the hero screen
   ============================================ */

/* --- Scroll Wrapper --- */
/* pointer-events:none so hero-screen input reaches the fixed ring /
   product zone underneath; screen 2 + indicator re-enable events.
   Hero→grid scrolling is JS wheel paging (japanjunky-product-grid.js). */
.jj-scroll {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  z-index: 100; /* above ring/product zone (50), below start menu (2000) */
  pointer-events: none;
  scrollbar-width: none;
}

.jj-scroll::-webkit-scrollbar {
  display: none;
}

.jj-scroll__screen {
  position: relative;
  scroll-snap-align: start;
}

.jj-scroll__screen--hero {
  height: 100%;
  pointer-events: none;
}

.jj-scroll__screen--grid {
  min-height: 100%;
  background: #000;
  border-top: 1px solid var(--jj-primary, #e8313a);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 40px; /* clear fixed taskbar */
}

/* --- Scroll Indicator --- */
.jj-scroll__indicator {
  position: absolute;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: var(--jj-secondary, #f5d742);
  background: rgba(10, 10, 10, 0.7);
  border: 1px solid #333;
  padding: 4px 10px;
  animation: jj-indicator-blink 1.2s steps(2, start) infinite;
}

.jj-scroll__indicator:hover {
  color: var(--jj-text, #e0d5c0);
  border-color: #555;
}

@keyframes jj-indicator-blink {
  50% { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .jj-scroll__indicator { animation: none; }
}

/* --- Hero UI fade when grid is in view --- */
#jj-ring,
.jj-product-zone {
  transition: opacity 0.25s steps(3, end);
}

.jj-grid-active #jj-ring,
.jj-grid-active .jj-product-zone {
  opacity: 0;
  visibility: hidden;
}
```

- [ ] **Step 4: Create grid JS (paging/fade portion)**

Create `assets/japanjunky-product-grid.js`:

```js
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

})();
```

- [ ] **Step 5: Verify in preview**

Homepage:
1. `▼ CATALOG` blinks bottom-center; scene, ring, product zone all still interactive.
2. Wheel-down over the scene (left/center of screen) → smooth-snaps to an empty black panel with red top border; ring + product zone fade out.
3. Wheel-over-ring still rotates carousel, does NOT page down.
4. Click `▼ CATALOG` → same page-down.
5. Wheel-up on the black panel → back to hero; ring fades back in, still interactive (rotate + select).
6. Taskbar visible and clickable on both screens. Console: zero errors.
7. Non-index page (e.g. a product page): no wrapper markup, no errors.

- [ ] **Step 6: Commit**

```bash
git add layout/theme.liquid assets/japanjunky-product-grid.css assets/japanjunky-product-grid.js
git commit -m "feat(homepage): scroll-snap wrapper with catalog screen + hero fade"
```

---

### Task 4: Grid cards

**Files:**
- Modify: `assets/japanjunky-product-grid.js`
- Modify: `assets/japanjunky-product-grid.css`

- [ ] **Step 1: Add card rendering to grid JS**

In `assets/japanjunky-product-grid.js`, insert between the Hero UI Fade block and the closing `})();`:

```js
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
    card.href = '/products/' + p.handle;
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
```

- [ ] **Step 2: Add card styles to grid CSS**

Append to `assets/japanjunky-product-grid.css`:

```css
/* --- Grid --- */
.jj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 16px 8px;
  padding: 16px;
}

@media (max-width: 600px) {
  .jj-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* --- Card --- */
.jj-grid__card {
  display: block;
  padding: 8px;
  border: 1px solid #222;
  background: #050505;
  color: var(--jj-text, #e0d5c0);
  text-decoration: none;
}

.jj-grid__card:hover {
  text-decoration: none;
  color: var(--jj-text, #e0d5c0);
  border-color: var(--jj-primary, #e8313a);
  box-shadow: 0 0 8px rgba(232, 49, 58, 0.3);
}

/* Format-specific hover glow (mirrors ring selected treatment) */
.jj-grid__card[data-format="vinyl"]:hover {
  border-color: var(--jj-amber, #ffaa00);
  box-shadow: 0 0 8px rgba(255, 170, 0, 0.3);
}

.jj-grid__card[data-format="cd"]:hover {
  border-color: var(--jj-cyan, #00e5e5);
  box-shadow: 0 0 8px rgba(0, 229, 229, 0.3);
}

.jj-grid__card[data-format="cassette"]:hover {
  border-color: var(--jj-green, #33ff33);
  box-shadow: 0 0 8px rgba(51, 255, 51, 0.3);
}

.jj-grid__card[data-format="minidisc"]:hover {
  border-color: var(--jj-magenta, #e040e0);
  box-shadow: 0 0 8px rgba(224, 64, 224, 0.3);
}

.jj-grid__card[data-format="hardware"]:hover {
  border-color: var(--jj-white, #e0e0e0);
  box-shadow: 0 0 8px rgba(224, 224, 224, 0.3);
}

.jj-grid__card-img-wrap {
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid #333;
  background: #050505;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.jj-grid__card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  display: block;
}

.jj-grid__card-noimg {
  font-size: 14px;
  color: var(--jj-secondary, #f5d742);
}

.jj-grid__card-artist {
  font-size: 10px;
  color: #888;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.jj-grid__card-title {
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.jj-grid__card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 4px;
}

.jj-grid__card-price {
  font-size: 12px;
  color: var(--jj-secondary, #f5d742);
}

.jj-grid__card-format {
  font-size: 9px;
  padding: 1px 4px;
  border: 1px solid #555;
  color: #888;
  white-space: nowrap;
}

.jj-grid__card-format[data-format="vinyl"] { color: var(--jj-amber, #ffaa00); border-color: var(--jj-amber, #ffaa00); }
.jj-grid__card-format[data-format="cd"] { color: var(--jj-cyan, #00e5e5); border-color: var(--jj-cyan, #00e5e5); }
.jj-grid__card-format[data-format="cassette"] { color: var(--jj-green, #33ff33); border-color: var(--jj-green, #33ff33); }
.jj-grid__card-format[data-format="minidisc"] { color: var(--jj-magenta, #e040e0); border-color: var(--jj-magenta, #e040e0); }
.jj-grid__card-format[data-format="hardware"] { color: var(--jj-white, #e0e0e0); border-color: var(--jj-white, #e0e0e0); }

.jj-grid__card-cond {
  font-size: 9px;
  color: #555;
  margin-top: 2px;
}

/* --- Empty State --- */
.jj-grid__empty {
  grid-column: 1 / -1;
  padding: 48px 0;
  text-align: center;
  font-size: 12px;
  color: #555;
}
```

- [ ] **Step 3: Verify in preview**

Scroll to grid: cards render for every `JJ_PRODUCTS` entry — square pixelated cover (or gold `◆` if no image), artist (grey), title (cream), price (gold) with format badge in its format color, condition tag. Hover any card → border + glow in the card's format color. Click a card → lands on that product's page. Back → homepage hero again. Console: zero errors.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-product-grid.js assets/japanjunky-product-grid.css
git commit -m "feat(grid): render product cards with format-coded styling"
```

---

### Task 5: Filter/search bar on grid

**Files:**
- Modify: `layout/theme.liquid` (bar markup into grid screen)
- Modify: `assets/japanjunky-product-grid.js` (filter logic)
- Modify: `assets/japanjunky-product-grid.css` (bar styles)

- [ ] **Step 1: Add bar markup**

In `layout/theme.liquid`, inside `.jj-scroll__screen--grid`, **before** `<div class="jj-grid" id="jj-grid">`:

```liquid
      <div class="jj-grid__bar">
        <div class="jj-grid__search-wrap">
          <span class="jj-grid__search-prompt">&gt;</span>
          <input class="jj-grid__search" id="jj-grid-search" type="text" placeholder="SEARCH..." autocomplete="off">
        </div>
        <button class="jj-grid__filter-btn" data-filter-group="format" type="button">
          [FORMAT]<span class="jj-grid__filter-badge"></span>
          <div class="jj-grid__dropdown" id="jj-grid-dropdown-format"></div>
        </button>
        <button class="jj-grid__filter-btn" data-filter-group="decade" type="button">
          [DECADE]<span class="jj-grid__filter-badge"></span>
          <div class="jj-grid__dropdown" id="jj-grid-dropdown-decade"></div>
        </button>
        <button class="jj-grid__filter-btn" data-filter-group="condition" type="button">
          [CONDITION]<span class="jj-grid__filter-badge"></span>
          <div class="jj-grid__dropdown" id="jj-grid-dropdown-condition"></div>
        </button>
        <button class="jj-grid__clear-btn" id="jj-grid-clear" type="button">[CLEAR]</button>
        <span class="jj-grid__count" id="jj-grid-count"></span>
      </div>
```

- [ ] **Step 2: Add filter logic to grid JS**

In `assets/japanjunky-product-grid.js`, insert between the Card Rendering block and the `// ─── Init` line (the logic is the ring's former filter code with `jj-ring__` → `jj-grid__` and a count/refilter wired to `renderGrid`):

```js
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
```

Then change the Init block at the bottom from `renderGrid();` to:

```js
  // ─── Init ──────────────────────────────────────────────────────
  renderGrid();
  updateCount();
```

**Note:** the dropdown click handler is inside the card-link-free bar (buttons, not `<a>`), so no `preventDefault` interplay with card links. The dropdown lives inside a `<button>`; the added `e.preventDefault()` guards against double-toggle on some browsers' button-child click synthesis.

- [ ] **Step 3: Add bar styles**

Append to `assets/japanjunky-product-grid.css` (ring bar styles renamed, sticky positioning added):

```css
/* --- Filter/Search Bar (relocated from ring carousel) --- */
.jj-grid__bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 8px;
  padding: 4px 8px;
  background: rgba(10, 10, 10, 0.95);
  border-bottom: 1px solid #222;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
}

.jj-grid__search-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 1 auto;
}

.jj-grid__search-prompt {
  color: var(--jj-secondary, #f5d742);
  font-size: 11px;
}

.jj-grid__search {
  width: 120px;
  min-width: 30px;
  height: 22px;
  padding: 0 4px;
  background: #000;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: inherit;
  font-size: 11px;
}

.jj-grid__search:focus {
  border-color: var(--jj-primary, #e8313a);
  box-shadow: 0 0 6px rgba(232, 49, 58, 0.3);
  outline: none;
}

.jj-grid__filter-btn {
  font-family: inherit;
  font-size: 11px;
  color: #888;
  background: none;
  border: 1px solid #333;
  padding: 2px 6px;
  cursor: default;
  position: relative;
  flex-shrink: 0;
  white-space: nowrap;
}

.jj-grid__filter-btn:hover {
  color: var(--jj-text, #e0d5c0);
  border-color: #555;
}

.jj-grid__filter-btn--active {
  color: var(--jj-secondary, #f5d742);
  border-color: var(--jj-secondary, #f5d742);
}

.jj-grid__filter-badge {
  font-size: 9px;
  color: var(--jj-primary, #e8313a);
  margin-left: 2px;
}

.jj-grid__clear-btn {
  font-family: inherit;
  font-size: 10px;
  color: #555;
  background: none;
  border: none;
  cursor: default;
  display: none;
}

.jj-grid__clear-btn--visible {
  display: inline;
}

.jj-grid__clear-btn:hover {
  color: var(--jj-primary, #e8313a);
}

.jj-grid__count {
  margin-left: auto;
  margin-right: 8px;
  color: #555;
  font-size: 10px;
  white-space: nowrap;
}

/* --- Filter Dropdown --- */
.jj-grid__dropdown {
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

.jj-grid__dropdown--open {
  display: block;
}

.jj-grid__dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
  color: #888;
  cursor: default;
}

.jj-grid__dropdown-item:hover {
  background: #111;
  color: var(--jj-text, #e0d5c0);
}

.jj-grid__dropdown-item--active {
  color: var(--jj-secondary, #f5d742);
}

.jj-grid__dropdown-check {
  width: 10px;
  text-align: center;
}

@media (max-width: 600px) {
  .jj-grid__bar {
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 4: Verify in preview**

On the grid screen:
1. Count shows `N ITEMS` matching card count.
2. Type in search → cards filter live (100ms debounce), count becomes `M OF N ITEMS`, `[CLEAR]` appears.
3. Each dropdown lists real values (FORMAT shows formats, DECADE shows `1980s`-style entries, CONDITION shows conditions); checking entries filters cards, badge shows `(n)`, button turns gold.
4. Combined search + filters intersect.
5. Filters matching nothing → `NO ITEMS FOUND`.
6. `[CLEAR]` resets everything.
7. Bar stays stuck to top when grid content scrolls.
8. Ring on screen 1 is unaffected by any filtering.
9. Console: zero errors.

- [ ] **Step 5: Commit**

```bash
git add layout/theme.liquid assets/japanjunky-product-grid.js assets/japanjunky-product-grid.css
git commit -m "feat(grid): search + format/decade/condition filter bar"
```

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Walk the spec's test list in preview**

1. Screen 1 unchanged: scene renders, ring rotates (wheel/arrows/click/touch), product info panel + add-to-cart work.
2. Wheel-down outside ring → snaps to grid; `▼ CATALOG` click does the same.
3. Ring + product zone fade when grid in view; restored on return.
4. Search + each filter group; CLEAR; count updates; empty state.
5. Card click → product page; product page itself unaffected (no wrapper).
6. Wheel-up at grid top → back to hero.
7. Narrow viewport (devtools responsive ~400px): 2-column grid, bar wraps.
8. Login page + product page: no console errors, no layout change.
9. Splash flow (fresh sessionStorage): splash → enter → hero works, grid reachable after.

- [ ] **Step 2: Fix anything found, commit fixes individually**

Each fix: smallest change, verify again, then:

```bash
git add -A
git commit -m "fix(grid): <issue>"
```
