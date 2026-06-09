# Game Inventory UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the JapanJunky storefront into a video game-style inventory UI with a fixed catalog panel on the right and a 3D product viewer on the left.

**Architecture:** The viewport splits into a Three.js 3D viewer (left 60%) and a fixed DOM catalog panel (right 40%). Product selection emits custom events that drive a 3D product model in the unified Three.js scene. Tsuno Daishi acts as an idle shopkeeper presence with a four-state machine. The screensaver IIFE exposes `window.JJ_Portal` for cross-module scene access.

**Tech Stack:** Shopify Liquid, vanilla JS (ES5 IIFEs), CSS3, Three.js (r128+), no build tools.

**Spec:** `docs/superpowers/specs/2026-03-19-game-inventory-ui-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `assets/japanjunky-catalog-panel.css` | Right 40% panel: header bar, inventory list rows, selection states, filter toggle, status bar |
| `assets/japanjunky-catalog-panel.js` | Product list selection, keyboard navigation, custom event emission, filter toggle |
| `assets/japanjunky-product-info.css` | Bottom-left HUD overlay: product details, variant selector, ATC button |
| `assets/japanjunky-product-viewer.js` | 3D product model lifecycle, drag-to-rotate, product info overlay population, typewriter animation, variant/ATC logic |
| `snippets/product-inventory-row.liquid` | Simplified single-column product row (thumbnail + title/artist + price) |

### Modified Files
| File | Changes |
|------|---------|
| `layout/theme.liquid` | Remove shell header wrapper + window source wrapper. Add catalog panel container, product info overlay, interaction overlay. Update CSS/JS imports. |
| `sections/jj-homepage-body.liquid` | Replace 3-column grid with single-column inventory list. Move filters to collapsible toggle. Remove right sidebar/detail pane. Remove sort. |
| `assets/japanjunky-screensaver.js` | Expose `window.JJ_Portal` API. Remove tunnel texture + multiple ghosts. Add single Tsuno Daishi with state machine. Add parallax toggle. |
| `assets/japanjunky-filter.js` | Update sidebar selector from `.jj-left-sidebar` to `.jj-catalog-filters`. Remove sort integration. |
| `assets/japanjunky-homepage.css` | Remove 3-column grid, left/right sidebar styles, detail pane styles. Simplify to support inventory list within catalog panel. |

### Removed Files (stop loading, optionally delete)
| File | Reason |
|------|--------|
| `assets/japanjunky-product-select.js` | Superseded by catalog-panel.js + product-viewer.js |
| `assets/japanjunky-wm.js` | Catalog no longer uses window manager |
| `assets/japanjunky-wm.css` | Window manager chrome no longer needed |
| `assets/japanjunky-parallax.js` | DOM-level parallax no longer needed (canvas elements are removed, parallax in screensaver handled by JJ_Portal.setParallaxEnabled) |
| `snippets/product-detail-pane.liquid` | Replaced by product info overlay in product-viewer.js |
| `snippets/product-table-row.liquid` | Replaced by product-inventory-row.liquid |

### Intentionally Removed Features
| Feature | Reason |
|---------|--------|
| `member-login-box` snippet | Left sidebar no longer exists. Can be relocated to taskbar start menu in a future iteration. |
| `marquee_text` schema setting | Marquee bar replaced by catalog panel layout. Can be added to taskbar in a future iteration. |
| Sort functionality | Spec specifies filtering only, no sort. |

---

## Chunk 1: Layout Foundation & Catalog Panel Structure

### Task 1: Restructure theme.liquid

**Files:**
- Modify: `layout/theme.liquid`

This task rewrites the page structure: removes the shell header wrapper and window source wrapper, adds the catalog panel container, product info overlay, and interaction overlay div.

- [ ] **Step 1: Update CSS imports**

In `layout/theme.liquid`, replace the CSS import block (lines 28-34) with:

```liquid
  {{ 'japanjunky-base.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-crt.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-ascii.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-win95.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-catalog-panel.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-product-info.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-calendar.css' | asset_url | stylesheet_tag }}
```

Removed: `japanjunky-homepage.css`, `japanjunky-wm.css`. Added: `japanjunky-catalog-panel.css`, `japanjunky-product-info.css`.

Note: `japanjunky-homepage.css` still exists but we stop loading it. The catalog panel CSS replaces it.

- [ ] **Step 2: Replace body structure**

Replace lines 131-166 (everything from `<body>` through the window source closing `</div>`) with:

```liquid
<body class="jj-body">
<canvas id="jj-screensaver" aria-hidden="true" tabindex="-1" style="
  position:fixed;top:0;left:0;width:100vw;height:100vh;
  z-index:0;image-rendering:pixelated;image-rendering:crisp-edges;
  pointer-events:none;
"></canvas>

  {%- comment -%} CRT overlay: aperture grille + scanlines above all UI {%- endcomment -%}
  <div class="jj-crt-overlay" aria-hidden="true"></div>

  {%- comment -%} Interaction overlay for 3D viewer drag-to-rotate {%- endcomment -%}
  <div class="jj-viewer-interaction" id="jj-viewer-interaction"></div>

  {%- comment -%} Catalog panel: fixed right 40% {%- endcomment -%}
  <div class="jj-catalog-panel" id="jj-catalog-panel">
    <div class="jj-catalog-panel__header">
      {% sections 'header-group' %}
    </div>
    <main id="MainContent" class="jj-catalog-panel__body" role="main">
      {{ content_for_layout }}
    </main>
    <div class="jj-catalog-panel__status">
      <span id="jj-panel-status">READY</span>
    </div>
  </div>

  {%- comment -%} Product info overlay: bottom-left HUD {%- endcomment -%}
  <div class="jj-product-info" id="jj-product-info" style="display:none;">
    <div class="jj-product-info__header" id="jj-pi-header">C:\catalog\item.dat</div>
    <div class="jj-product-info__artist" id="jj-pi-artist"></div>
    <div class="jj-product-info__title" id="jj-pi-title"></div>
    <div class="jj-product-info__price" id="jj-pi-price"></div>
    <div class="jj-product-info__meta" id="jj-pi-meta"></div>
    <div class="jj-product-info__desc" id="jj-pi-desc"></div>
    <div class="jj-product-info__variants" id="jj-pi-variants"></div>
    <div class="jj-product-info__actions" id="jj-pi-actions">
      <button class="jj-action-btn" id="jj-pi-add-to-cart" disabled>[Add to Cart]</button>
      <input type="hidden" id="jj-pi-variant-id" value="">
    </div>
  </div>
```

- [ ] **Step 3: Update script block and footer**

Replace the script/config section (lines 168-204) with:

```liquid
  {%- comment -%} Taskbar (fixed at bottom) {%- endcomment -%}
  {% sections 'footer-group' %}

  <script>
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      swirlTexture: {{ 'vortex-swirl.jpg' | asset_url | json }},
      ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }}
    };
  </script>
  <script src="{{ 'three.min.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-cursor-light.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-dither.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-catalog-panel.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-viewer.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-win95-menu.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-holidays.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-calendar.js' | asset_url }}" defer></script>
</body>
</html>
```

Removed scripts: `japanjunky-wm.js`, `japanjunky-product-select.js`, `japanjunky-parallax.js`. Removed configs: `JJ_WM_CONFIG`, `JJ_PARALLAX_CONFIG`. Removed from screensaver config: `tunnelTexture`, `textures` array. Added scripts: `japanjunky-catalog-panel.js`, `japanjunky-product-viewer.js`.

- [ ] **Step 4: Verify in browser**

Open the site in browser. Expect:
- The Three.js portal background renders (may have errors about missing tunnel texture — that's OK, we'll fix in Task 7)
- No shell header visible (it's now inside the catalog panel — but the catalog panel CSS doesn't exist yet, so it may look broken)
- Taskbar still visible at bottom
- Console may show errors about missing JS files — expected until we create them
- No JS errors from removed scripts (WM, product-select)

- [ ] **Step 5: Commit**

```bash
git add layout/theme.liquid
git commit -m "refactor(layout): restructure theme.liquid for game inventory UI

Remove shell header wrapper, window source wrapper, and WM/parallax scripts.
Add catalog panel container, product info overlay, and viewer interaction div.
Update CSS/JS imports for new architecture."
```

---

### Task 2: Create catalog panel CSS

**Files:**
- Create: `assets/japanjunky-catalog-panel.css`

This CSS styles the right 40% panel: header bar (with nav), scrollable inventory list, filter toggle, selection states, and status bar.

- [ ] **Step 1: Create the CSS file**

Create `assets/japanjunky-catalog-panel.css`:

```css
/* ============================================
   JAPANJUNKY CATALOG PANEL
   Fixed right panel — game inventory UI
   ============================================ */

/* --- Panel Container --- */
.jj-catalog-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 40%;
  height: calc(100vh - 32px);
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 10, 0.95);
  border-left: 1px solid #333;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}

/* --- Header Bar (replaces shell header + window titlebar) --- */
.jj-catalog-panel__header {
  flex-shrink: 0;
  border-bottom: 1px solid #333;
}

/* Restyle the nav bar inside the panel header */
.jj-catalog-panel__header .jj-nav-bar {
  height: 28px;
  padding: 0 8px;
  background: #111;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--jj-text, #e0d5c0);
}

.jj-catalog-panel__header .jj-nav-bar__icon {
  font-size: 10px;
  color: var(--jj-primary, #e8313a);
  flex-shrink: 0;
}

.jj-catalog-panel__header .jj-nav-bar__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  font-size: 12px;
  color: var(--jj-text, #e0d5c0);
}

.jj-catalog-panel__header .jj-nav-bar__input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 4px;
  background: #000;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: inherit;
  font-size: 11px;
}

.jj-catalog-panel__header .jj-nav-bar__input:focus {
  border-color: var(--jj-accent, #4aa4e0);
  outline: none;
}

.jj-catalog-panel__header .jj-nav-bar__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.jj-catalog-panel__header .jj-nav-action-btn {
  font-family: inherit;
  font-size: 11px;
  color: #888;
  text-decoration: none;
  white-space: nowrap;
  padding: 0 2px;
}

.jj-catalog-panel__header .jj-nav-action-btn:hover {
  color: var(--jj-text, #e0d5c0);
}

/* Remove the HR separator from the header section */
.jj-catalog-panel__header .jj-hr-fancy {
  display: none;
}

/* --- Panel Body (scrollable content area) --- */
.jj-catalog-panel__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* --- Catalog Filters (collapsible) --- */
.jj-catalog-filters {
  border-bottom: 1px solid #333;
}

.jj-catalog-filters__toggle {
  display: block;
  width: 100%;
  padding: 4px 8px;
  background: #0a0a0a;
  border: none;
  border-bottom: 1px solid #222;
  color: var(--jj-accent, #4aa4e0);
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
  text-align: left;
  cursor: default;
  text-transform: uppercase;
}

.jj-catalog-filters__toggle:hover {
  background: #111;
  color: var(--jj-text, #e0d5c0);
}

.jj-catalog-filters__toggle::before {
  content: '> ';
  color: var(--jj-secondary, #f5d742);
}

.jj-catalog-filters__body {
  padding: 4px 8px 8px;
  background: #050505;
}

/* Restyle sidebar sections inside catalog filters */
.jj-catalog-filters .jj-sidebar-section {
  margin-bottom: 8px;
}

.jj-catalog-filters .jj-sidebar-section__title {
  font-size: 10px;
  color: #555;
  margin-bottom: 2px;
  text-transform: uppercase;
}

.jj-catalog-filters .jj-filter-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.jj-catalog-filters .jj-filter-list li {
  padding: 2px 4px;
  font-size: 11px;
  color: #888;
  cursor: default;
}

.jj-catalog-filters .jj-filter-list li:hover {
  color: var(--jj-text, #e0d5c0);
  background: #111;
}

.jj-catalog-filters .jj-filter-list li.jj-filter-item--active {
  color: var(--jj-secondary, #f5d742);
}

/* --- Filter Bar (active filter tags) --- */
.jj-catalog-panel .jj-filter-bar {
  padding: 4px 8px;
  border-bottom: 1px solid #222;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  flex-wrap: wrap;
}

.jj-catalog-panel .jj-filter-bar__prompt {
  color: var(--jj-secondary, #f5d742);
}

.jj-catalog-panel .jj-filter-tag {
  color: var(--jj-accent, #4aa4e0);
  padding: 0 4px;
  border: 1px solid #333;
  cursor: default;
  font-size: 10px;
}

.jj-catalog-panel .jj-filter-tag:hover {
  border-color: var(--jj-primary, #e8313a);
  color: var(--jj-primary, #e8313a);
}

.jj-catalog-panel .jj-filter-bar__clear {
  color: #555;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 10px;
  cursor: default;
  margin-left: auto;
}

.jj-catalog-panel .jj-filter-bar__clear:hover {
  color: var(--jj-primary, #e8313a);
}

/* --- Inventory List --- */
.jj-inventory-list {
  width: 100%;
}

.jj-inventory-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.jj-inventory-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid #1a1a1a;
  gap: 8px;
  cursor: default;
  min-height: 48px;
}

.jj-inventory-row:hover {
  background: #111;
  border-color: #333;
}

.jj-inventory-row.jj-row-selected {
  background: #151515;
  border-left: 2px solid var(--jj-primary, #e8313a);
  box-shadow: inset 0 0 8px rgba(232, 49, 58, 0.08);
}

.jj-inventory-row.jj-row--hidden {
  display: none;
}

.jj-inventory-row__thumb {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  overflow: hidden;
  background: #050505;
  border: 1px solid #222;
}

.jj-inventory-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.jj-inventory-row__info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.jj-inventory-row__title {
  font-size: 12px;
  color: var(--jj-text, #e0d5c0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.jj-inventory-row__artist {
  font-size: 10px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.jj-inventory-row__price {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--jj-secondary, #f5d742);
  text-align: right;
  white-space: nowrap;
}

/* Format border color on selected rows */
.jj-inventory-row.jj-row-selected[data-product-format="vinyl"] {
  border-left-color: var(--jj-amber, #ffaa00);
}
.jj-inventory-row.jj-row-selected[data-product-format="cd"] {
  border-left-color: var(--jj-cyan, #00e5e5);
}
.jj-inventory-row.jj-row-selected[data-product-format="cassette"] {
  border-left-color: var(--jj-green, #33ff33);
}
.jj-inventory-row.jj-row-selected[data-product-format="minidisc"] {
  border-left-color: var(--jj-magenta, #e040e0);
}
.jj-inventory-row.jj-row-selected[data-product-format="hardware"] {
  border-left-color: var(--jj-white, #e0e0e0);
}

/* --- Status Bar --- */
.jj-catalog-panel__status {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  background: #0a0a0a;
  border-top: 1px solid #333;
  font-size: 10px;
  color: #555;
}

/* --- Viewer Interaction Overlay --- */
.jj-viewer-interaction {
  position: fixed;
  left: 0;
  top: 0;
  width: 60%;
  height: calc(100vh - 32px);
  z-index: 50;
  pointer-events: none;
}

.jj-viewer-interaction--active {
  pointer-events: auto;
  cursor: grab;
}

.jj-viewer-interaction--dragging {
  cursor: grabbing;
}

/* --- Reduced Motion --- */
@media (prefers-reduced-motion: reduce) {
  .jj-inventory-row {
    transition: none;
  }
}

/* --- High Contrast --- */
@media (prefers-contrast: more) {
  .jj-catalog-panel {
    border-left-width: 2px;
    background: #000;
  }
  .jj-inventory-row.jj-row-selected {
    border-left-width: 3px;
    border-left-color: #fff;
  }
}
```

- [ ] **Step 2: Verify CSS loads**

Open the site. The catalog panel should appear as a dark fixed panel on the right 40% of the screen. The header nav bar should be visible at the top of the panel. Content may not be properly structured yet (that's Task 3).

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-catalog-panel.css
git commit -m "feat(ui): add catalog panel CSS for game inventory layout

Fixed right 40% panel with header bar, scrollable inventory list,
collapsible filters, format-coded selection states, and status bar."
```

---

### Task 3: Restructure homepage body section

**Files:**
- Modify: `sections/jj-homepage-body.liquid`
- Create: `snippets/product-inventory-row.liquid`

Replace the 3-column grid layout with a single-column inventory list for the catalog panel.

- [ ] **Step 1: Create the inventory row snippet**

Create `snippets/product-inventory-row.liquid`:

```liquid
{%- comment -%}
  Inventory row for the catalog panel — simplified single-column layout.
  Renders: thumbnail + title/artist + price.
  All data attributes preserved for filter/selection JS.
  Usage: {% render 'product-inventory-row', product: product, variant: variant, index: row_index %}
{%- endcomment -%}

{%- if product != blank -%}
  {%- assign m_artist = product.metafields.custom.artist | default: '' -%}
  {%- assign m_code = product.metafields.custom.code | default: '' -%}
  {%- assign m_year = product.metafields.custom.year | default: '' -%}
  {%- assign m_label = product.metafields.custom.label | default: '' -%}
  {%- assign m_format = product.metafields.custom.format | default: '' -%}
  {%- assign m_jp_name = product.metafields.custom.jp_name | default: '' -%}
  {%- assign m_jp_title = product.metafields.custom.jp_title | default: '' -%}
  {%- assign m_genre = product.metafields.custom.genre | default: '' -%}

  {%- assign p_condition = variant.option1 | default: 'N/A' -%}
  {%- assign cond_lower = p_condition | downcase | strip -%}

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

  {%- comment -%} Check for 3d-box tag {%- endcomment -%}
  {%- assign p_3d_type = 'plane' -%}
  {%- for tag in product.tags -%}
    {%- if tag == '3d-box' -%}
      {%- assign p_3d_type = 'box' -%}
    {%- endif -%}
  {%- endfor -%}

  {%- comment -%} Second image for back face {%- endcomment -%}
  {%- assign second_image_url = '' -%}
  {%- if product.images.size > 1 -%}
    {%- assign second_image_url = product.images[1] | image_url: width: 480 -%}
  {%- endif -%}

  <div class="jj-inventory-row"
       data-index="{{ index }}"
       data-product-handle="{{ product.handle }}"
       data-product-id="{{ product.id }}"
       data-product-collections="{{ product.collections | map: 'handle' | join: ',' }}"
       data-product-title="{{ product.title | escape }}"
       data-product-artist="{{ m_artist | escape }}"
       data-product-vendor="{{ product.vendor | escape }}"
       data-product-type="{{ product.type | escape }}"
       data-product-price="{{ variant.price | money }}"
       data-product-code="{{ m_code | escape }}"
       data-product-condition="{{ cond_lower }}"
       data-product-format="{{ p_format }}"
       data-product-format-label="{{ m_format | escape }}"
       data-product-year="{{ m_year | escape }}"
       data-product-label="{{ m_label | escape }}"
       data-product-jp-name="{{ m_jp_name | escape }}"
       data-product-jp-title="{{ m_jp_title | escape }}"
       data-product-image="{%- if product.featured_image -%}{{ product.featured_image | image_url: width: 480 }}{%- endif -%}"
       data-product-image-back="{{ second_image_url }}"
       data-product-3d-type="{{ p_3d_type }}"
       data-variant-id="{{ variant.id }}"
       data-product-available="{{ variant.available }}"
       tabindex="0"
       role="option"
  >
    <div class="jj-inventory-row__thumb">
      {%- if product.featured_image -%}
        <img
          src="{{ product.featured_image | image_url: width: 144 }}"
          alt="{{ product.featured_image.alt | escape | default: product.title | escape }}"
          width="40"
          height="40"
          loading="lazy"
        >
      {%- else -%}
        <span style="font-size:10px;color:var(--jj-secondary);display:flex;align-items:center;justify-content:center;height:100%;">&#9670;</span>
      {%- endif -%}
    </div>
    <div class="jj-inventory-row__info">
      <div class="jj-inventory-row__title">{{ product.title }}</div>
      <div class="jj-inventory-row__artist">{{ m_artist | default: product.vendor | default: '---' }}</div>
    </div>
    <div class="jj-inventory-row__price">{{ variant.price | money }}</div>
  </div>
{%- endif -%}
```

Key additions over old row: `data-product-image-back` (second image URL for 3D model back face), `data-product-3d-type` ("plane" or "box" based on product tags), `tabindex="0"` and `role="option"` for keyboard accessibility.

- [ ] **Step 2: Rewrite jj-homepage-body.liquid**

Replace the entire content of `sections/jj-homepage-body.liquid` (lines 1-127) with:

```liquid
{%- assign featured = section.settings.collection | default: collections['all'] -%}

{%- comment -%} COLLAPSIBLE FILTERS {%- endcomment -%}
<div class="jj-catalog-filters" id="jj-catalog-filters">
  <button class="jj-catalog-filters__toggle" id="jj-filter-toggle" type="button">
    FILTERS
  </button>
  <div class="jj-catalog-filters__body" id="jj-filter-body" style="display:none;">
    {% render 'category-list', section: section %}
  </div>
</div>

{%- comment -%} FILTER TAGS BAR {%- endcomment -%}
<div class="jj-filter-bar" id="jj-filter-bar" style="display:none;">
  <span class="jj-filter-bar__prompt">&gt;</span>
  <span class="jj-filter-bar__tags" id="jj-filter-tags"></span>
  <button class="jj-filter-bar__clear" id="jj-filter-clear">[clear all]</button>
</div>

{%- comment -%} INVENTORY LIST {%- endcomment -%}
<div class="jj-inventory-list" id="jj-inventory-list" role="listbox" aria-label="Product inventory">
  {%- assign row_index = 0 -%}
  {%- for product in featured.products limit: section.settings.products_to_show -%}
    {%- for variant in product.variants -%}
      {%- if variant.available -%}
        {% render 'product-inventory-row', product: product, variant: variant, index: row_index %}
        {%- assign row_index = row_index | plus: 1 -%}
      {%- endif -%}
    {%- endfor -%}
  {%- else -%}
    <div class="jj-inventory-list__empty" style="padding:16px 8px;color:#555;font-size:11px;">
      NO ITEMS FOUND
    </div>
  {%- endfor -%}
</div>

{% schema %}
{
  "name": "Homepage Body",
  "settings": [
    {
      "type": "collection",
      "id": "collection",
      "label": "Featured collection"
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

Removed: 3-column grid, left sidebar wrapper, right sidebar/detail pane, sort select, marquee bar, table with colgroup/thead. Added: collapsible filter toggle, simplified inventory list using div-based rows.

- [ ] **Step 3: Verify in browser**

Open the site. Inside the right panel:
- A "FILTERS" toggle button should appear at the top
- Below it, product rows should render as thumbnail + title/artist + price
- The panel should scroll if there are many products
- Status bar at the bottom showing "READY"
- Clicking the FILTERS toggle does nothing yet (JS in Task 5)

- [ ] **Step 4: Commit**

```bash
git add snippets/product-inventory-row.liquid sections/jj-homepage-body.liquid
git commit -m "feat(catalog): single-column inventory list with simplified rows

Replace 3-column grid with collapsible filters + scrollable inventory.
Each row shows thumbnail, title/artist, and price. Preserves all data
attributes for filtering. Adds 3D type and back image data attributes."
```

---

### Task 4: Update filter.js for new DOM structure

**Files:**
- Modify: `assets/japanjunky-filter.js`

The filter JS needs its sidebar selector updated from `.jj-left-sidebar` to `.jj-catalog-filters`, and the row selector updated from `tr[data-product-handle]` to `.jj-inventory-row[data-product-handle]`. The sort integration is removed (no sort in the new UI).

- [ ] **Step 1: Update selectors**

In `assets/japanjunky-filter.js`:

Line 9 — change:
```javascript
var sidebar = document.querySelector('.jj-left-sidebar');
```
to:
```javascript
var sidebar = document.querySelector('.jj-catalog-filters');
```

Line 10 — change:
```javascript
var tbody = document.getElementById('jj-product-tbody');
```
to:
```javascript
var tbody = document.getElementById('jj-inventory-list');
```

Line 58 — change:
```javascript
var rows = tbody.querySelectorAll('tr[data-product-handle]');
```
to:
```javascript
var rows = tbody.querySelectorAll('.jj-inventory-row[data-product-handle]');
```

Line 165 — change:
```javascript
var selectedRow = tbody.querySelector('tr.jj-row-selected');
```
to:
```javascript
var selectedRow = tbody.querySelector('.jj-inventory-row.jj-row-selected');
```

Line 168 — change:
```javascript
var firstVisible = tbody.querySelector('tr[data-product-handle]:not(.jj-row--hidden)');
```
to:
```javascript
var firstVisible = tbody.querySelector('.jj-inventory-row[data-product-handle]:not(.jj-row--hidden)');
```

Also update `checkDetailPane()` (around line 164-173). Replace the entire function:
```javascript
function checkDetailPane() {
  var selectedRow = tbody.querySelector('.jj-inventory-row.jj-row-selected');
  if (selectedRow && selectedRow.classList.contains('jj-row--hidden')) {
    // Currently selected product was filtered out — deselect it
    selectedRow.classList.remove('jj-row-selected');
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }
}
```
This replaces the old behavior (which clicked the first visible row) with a clean deselect that triggers the custom event, letting the product viewer handle the rest.

- [ ] **Step 2: Remove sort integration**

Remove lines 263-272 (the sort select event listener):
```javascript
  // ── Sort integration: reapply filters after sort changes ──

  var sortSelect = document.getElementById('jj-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      // Sort handler in product-select.js fires first (same event).
      // Use setTimeout to let it finish re-ordering rows, then reapply.
      setTimeout(applyFilters, 0);
    });
  }
```

- [ ] **Step 3: Update the row visibility class**

The new inventory rows use `display: flex`, and the `.jj-row--hidden` class already uses `display: none` in the CSS. The filter JS already uses `.jj-row--hidden` class toggling (lines 88, 91). The catalog panel CSS defines `.jj-inventory-row.jj-row--hidden { display: none; }`. This should work.

Verify: no other changes needed. The filter bar IDs (`jj-filter-bar`, `jj-filter-tags`, `jj-filter-clear`) and footer IDs (`jj-footer-count`) are preserved in the new markup. Wait — `jj-footer-count` was in the old table footer but is NOT in the new structure. Update: the filter JS references `footerCount`, `footerSep`, `footerShowing` which no longer exist. These are null-safe (line 149: `if (!footerCount) return;`) so they'll silently skip.

For the panel status bar, we can update the count display to use `jj-panel-status` instead. Add after line 14:

```javascript
var panelStatus = document.getElementById('jj-panel-status');
```

And modify `updateFooterCount` (around lines 148-160) to also update the panel status:

```javascript
  function updateFooterCount(visible, total, isFiltered) {
    if (panelStatus) {
      if (isFiltered) {
        panelStatus.textContent = visible + ' OF ' + total + ' ITEMS';
      } else {
        panelStatus.textContent = total + ' ITEMS';
      }
    }
    if (!footerCount) return;
    // ... rest unchanged
  }
```

- [ ] **Step 4: Verify filters**

Open the site. Click the FILTERS toggle (it won't open yet — that's JS in Task 5). However, the filter JS should initialize without errors. Check the console for any JS errors from `japanjunky-filter.js`.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-filter.js
git commit -m "fix(filter): update selectors for inventory list DOM structure

Change sidebar selector to .jj-catalog-filters, row selector to
.jj-inventory-row. Remove sort integration. Add panel status bar update."
```

---

## Chunk 2: Catalog Panel JS & Product Info CSS

### Task 5: Create catalog panel JS

**Files:**
- Create: `assets/japanjunky-catalog-panel.js`

Handles product row selection, keyboard navigation, custom event emission, and filter toggle.

- [ ] **Step 1: Create the JS file**

Create `assets/japanjunky-catalog-panel.js`:

```javascript
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
```

- [ ] **Step 2: Verify selection**

Open the site:
- Click a product row → it highlights with red left border
- Click it again → deselection (highlight removed)
- Arrow keys navigate up/down through the list
- Enter selects/deselects
- Escape deselects
- FILTERS toggle opens/closes the filter panel
- Console should show no errors
- Check `jj:product-selected` event fires: open console, run `document.addEventListener('jj:product-selected', function(e) { console.log('SELECTED', e.detail); });` then click a row

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-catalog-panel.js
git commit -m "feat(catalog): add catalog panel JS with selection and keyboard nav

Click/keyboard product selection with toggle deselect. Emits
jj:product-selected and jj:product-deselected custom events.
Filter toggle open/close. Status bar updates."
```

---

### Task 6: Create product info overlay CSS

**Files:**
- Create: `assets/japanjunky-product-info.css`

Styles the bottom-left HUD overlay for product details.

- [ ] **Step 1: Create the CSS file**

Create `assets/japanjunky-product-info.css`:

```css
/* ============================================
   JAPANJUNKY PRODUCT INFO OVERLAY
   Bottom-left HUD — game inventory style
   ============================================ */

.jj-product-info {
  position: fixed;
  left: 16px;
  bottom: 48px; /* 32px taskbar + 16px gap */
  max-width: 30vw;
  max-height: 50vh;
  z-index: 100;
  background: rgba(10, 10, 10, 0.92);
  border: 1px solid #333;
  padding: 8px 12px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  overflow-y: auto;
  box-shadow: 2px 2px 0 #000;
}

.jj-product-info__header {
  font-size: 10px;
  color: #555;
  margin-bottom: 4px;
  text-transform: uppercase;
  border-bottom: 1px solid #222;
  padding-bottom: 4px;
}

.jj-product-info__artist {
  font-size: 14px;
  color: var(--jj-primary, #e8313a);
  text-transform: uppercase;
  line-height: 1.3;
  min-height: 18px;
}

.jj-product-info__title {
  font-size: 12px;
  color: var(--jj-text, #e0d5c0);
  line-height: 1.3;
  margin-bottom: 4px;
  min-height: 16px;
}

.jj-product-info__price {
  font-size: 14px;
  color: var(--jj-secondary, #f5d742);
  margin-bottom: 6px;
  min-height: 18px;
}

.jj-product-info__meta {
  font-size: 10px;
  color: #888;
  line-height: 1.5;
  margin-bottom: 6px;
}

.jj-product-info__meta .jj-meta-label {
  color: #555;
  text-transform: uppercase;
}

.jj-product-info__meta .jj-meta-value {
  color: #999;
}

.jj-product-info__desc {
  font-size: 10px;
  color: #666;
  line-height: 1.4;
  margin-bottom: 8px;
  max-height: 80px;
  overflow-y: auto;
}

.jj-product-info__variants {
  margin-bottom: 8px;
}

.jj-product-info__variants select {
  background: #000;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 4px;
  width: 100%;
}

.jj-product-info__variants select:focus {
  border-color: var(--jj-accent, #4aa4e0);
  outline: none;
}

.jj-product-info__actions {
  display: flex;
  gap: 4px;
}

.jj-product-info__actions .jj-action-btn {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: var(--jj-accent, #4aa4e0);
  background: #0a0a0a;
  border: 1px solid #333;
  padding: 4px 8px;
  cursor: default;
  text-decoration: none;
  text-transform: uppercase;
}

.jj-product-info__actions .jj-action-btn:hover {
  border-color: var(--jj-accent, #4aa4e0);
  text-shadow: 0 0 4px rgba(74, 164, 224, 0.4);
}

.jj-product-info__actions .jj-action-btn:disabled {
  color: #555;
  border-color: #222;
}

/* Typing cursor for typewriter animation */
.jj-pi-cursor {
  display: inline-block;
  width: 8px;
  height: 14px;
  background: var(--jj-text, #e0d5c0);
  animation: jj-pi-blink 1.06s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes jj-pi-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* CRT-on flash for overlay appearance */
.jj-product-info--entering {
  animation: jj-crt-on 0.4s ease-out forwards;
}

/* --- High Contrast --- */
@media (prefers-contrast: more) {
  .jj-product-info {
    background: #000;
    border-width: 2px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-info.css
git commit -m "feat(ui): add product info overlay CSS for bottom-left HUD

Terminal-style product detail display with typewriter cursor,
CRT-on entrance animation, and high-contrast support."
```

---

## Chunk 3: Screensaver Refactor

### Task 7: Expose JJ_Portal API and remove tunnel texture

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Refactor the screensaver IIFE to expose `window.JJ_Portal`, remove the tunnel texture (make it procedural), and remove the `sample3.jpg` dependency.

- [ ] **Step 1: Replace the tunnel fragment shader**

In `assets/japanjunky-screensaver.js`, replace the `TUNNEL_FRAG` variable (lines 78-103) with a procedural version that doesn't sample a texture. **Important:** Use the same JS string-array format as the existing code:

```javascript
var TUNNEL_FRAG = [
  'uniform float uTime;',
  'uniform float uSwirlSpeed;',
  'varying vec2 vUv;',
  '',
  'void main() {',
  '  float angle = vUv.x;',
  '  float depth = vUv.y;',
  '',
  '  float twist = angle * 6.2832 - uTime * uSwirlSpeed * 0.08;',
  '  float pull = depth + uTime * 0.15;',
  '',
  '  float band = sin(twist * 3.0 + pull * 8.0) * 0.5 + 0.5;',
  '  float band2 = sin(twist * 5.0 - pull * 12.0 + uTime * 0.5) * 0.5 + 0.5;',
  '  float pattern = band * 0.6 + band2 * 0.4;',
  '',
  '  vec3 c1 = vec3(0.4, 0.05, 0.02);',
  '  vec3 c2 = vec3(0.85, 0.35, 0.05);',
  '  vec3 c3 = vec3(0.95, 0.75, 0.3);',
  '  vec3 color = mix(c1, c2, smoothstep(0.0, 0.5, pattern));',
  '  color = mix(color, c3, smoothstep(0.5, 1.0, pattern));',
  '',
  '  float falloff = smoothstep(0.0, 0.12, depth) * smoothstep(1.0, 0.6, depth);',
  '  color *= 0.4 + 0.6 * falloff;',
  '',
  '  float glow = smoothstep(0.75, 1.0, depth);',
  '  color += vec3(0.95, 0.75, 0.5) * glow * 0.3;',
  '',
  '  gl_FragColor = vec4(color, 1.0);',
  '}'
].join('\n');
```

- [ ] **Step 2: Remove tunnel texture loading**

Remove the tunnel texture loader lines (around lines 108-112):
```javascript
var tunnelTex = textureLoader.load(config.tunnelTexture || 'assets/sample3.jpg');
tunnelTex.wrapS = THREE.RepeatWrapping;
tunnelTex.wrapT = THREE.RepeatWrapping;
tunnelTex.minFilter = THREE.LinearFilter;
tunnelTex.magFilter = THREE.LinearFilter;
```

And update the tunnel material uniforms to remove `uTunnelTex`:
```javascript
// In buildTunnel(), replace the uniforms object:
uniforms: {
  uResolution: { value: parseFloat(resH) },
  uTime: { value: 0.0 },
  uSwirlSpeed: { value: swirlSpeed }
},
```

- [ ] **Step 3: Remove console.log debug statements**

Remove the debug logging on lines 37-41:
```javascript
console.log('[JJ_SS] screen:', screen.width + 'x' + screen.height, ...);
```

- [ ] **Step 4: Expose window.JJ_Portal**

Just before the animation loop starts (before `requestAnimationFrame(animate)`, around line 733-740), add the portal API:

```javascript
  // ─── Public API ──────────────────────────────────────────────
  // Tsuno state machine placeholder — populated by texture load callback,
  // but API object exists immediately so consumers don't need to poll for it.
  var tsunoApi = {
    mesh: null,
    getState: function () { return 'idle'; },
    setState: function () {}
  };

  window.JJ_Portal = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    renderTarget: renderTarget,
    displayCanvas: displayCanvas,
    displayCtx: displayCtx,
    resW: resW,
    resH: resH,
    tsuno: tsunoApi,
    setParallaxEnabled: function (enabled) {
      parallaxEnabled = enabled;
      if (!enabled) {
        parallaxOffset.x = 0;
        parallaxOffset.y = 0;
      }
    }
  };
```

Also add a `parallaxEnabled` flag. Near the parallax state (around line 614), add:
```javascript
var parallaxEnabled = true;
```

And guard the parallax update (around line 634):
```javascript
function updateParallax() {
  if (!parallaxEnabled) return;
  parallaxOffset.x += (mouseNorm.x * MAX_PARALLAX - parallaxOffset.x) * PARALLAX_LERP;
  parallaxOffset.y += (mouseNorm.y * MAX_PARALLAX - parallaxOffset.y) * PARALLAX_LERP;
}
```

- [ ] **Step 5: Verify**

Open the site. The portal vortex should render with a procedural flame pattern (no texture dependency). Check:
- No 404 for sample3.jpg in network tab
- Portal vortex swirls with warm red/orange/gold bands
- `window.JJ_Portal` is accessible in the console
- `window.JJ_Portal.scene` returns the THREE.Scene
- `window.JJ_Portal.setParallaxEnabled(false)` stops parallax movement

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "refactor(screensaver): procedural tunnel shader + JJ_Portal API

Replace texture-sampled tunnel with procedural flame bands.
Remove sample3.jpg dependency. Expose window.JJ_Portal for
cross-module scene access. Add parallax enable/disable toggle.
Remove debug console.log statements."
```

---

### Task 8: Tsuno Daishi state machine

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Replace the 3 ghost instances with a single Tsuno Daishi entity that has a four-state machine (idle, transitioning-out, orbiting, returning).

- [ ] **Step 1: Replace ghost configs and creation**

Replace the ghost configuration array (around lines 370-375) and creation loop (lines 378-411) with a single Tsuno Daishi entity:

```javascript
// ─── Tsuno Daishi — Shopkeeper ──────────────────────────────
var tsunoMesh = null;
var tsunoState = 'idle'; // idle | transitioning-out | orbiting | returning
var tsunoTransition = { progress: 0, startPos: null, endPos: null };

// Idle position: ~30% from left in viewport, vertically centered
// In scene units: x = -1.5 (left of center), y = 0, z = 8
var TSUNO_IDLE_POS = { x: -1.5, y: 0, z: 8 };
// Orbit position: near vortex center
var TSUNO_ORBIT_RADIUS = 2.0;
var TSUNO_ORBIT_SPEED = 0.2;
var TSUNO_ORBIT_Z = 16;
var TSUNO_TRANSITION_DURATION = 1.5; // seconds

var ghostUrl = config.ghostTexture;
if (ghostUrl) {
  textureLoader.load(ghostUrl, function (tex) {
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;

    var ghostGeo = new THREE.PlaneGeometry(1.2, 3.5);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTexture: { value: tex },
        uTime: { value: 0.0 },
        uTint: { value: new THREE.Vector3(0.9, 0.15, 0.05) },
        uAlpha: { value: 0.5 }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: GHOST_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    tsunoMesh = new THREE.Mesh(ghostGeo, mat);
    tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);
    scene.add(tsunoMesh);

    // Update the pre-created tsuno API with real references
    if (window.JJ_Portal && window.JJ_Portal.tsuno) {
      window.JJ_Portal.tsuno.mesh = tsunoMesh;
      window.JJ_Portal.tsuno.getState = function () { return tsunoState; };
      window.JJ_Portal.tsuno.setState = function (state) { setTsunoState(state); };
    }
  });
}

function setTsunoState(newState) {
  if (!tsunoMesh || tsunoState === newState) return;

  var oldState = tsunoState;
  tsunoState = newState;
  tsunoTransition.progress = 0;

  if (newState === 'transitioning-out') {
    tsunoTransition.startPos = {
      x: tsunoMesh.position.x,
      y: tsunoMesh.position.y,
      z: tsunoMesh.position.z
    };
    tsunoTransition.endPos = { x: 0, y: 0, z: TSUNO_ORBIT_Z };
  } else if (newState === 'returning') {
    tsunoTransition.startPos = {
      x: tsunoMesh.position.x,
      y: tsunoMesh.position.y,
      z: tsunoMesh.position.z
    };
    tsunoTransition.endPos = {
      x: TSUNO_IDLE_POS.x,
      y: TSUNO_IDLE_POS.y,
      z: TSUNO_IDLE_POS.z
    };
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateTsuno(t, dt) {
  if (!tsunoMesh) return;

  tsunoMesh.material.uniforms.uTime.value = t;

  if (tsunoState === 'idle') {
    // Gentle bob at idle position
    tsunoMesh.position.x = TSUNO_IDLE_POS.x;
    tsunoMesh.position.y = TSUNO_IDLE_POS.y + Math.sin(t * 0.5) * 0.15;
    tsunoMesh.position.z = TSUNO_IDLE_POS.z;
    tsunoMesh.lookAt(camera.position);

  } else if (tsunoState === 'transitioning-out') {
    tsunoTransition.progress += dt / TSUNO_TRANSITION_DURATION;
    if (tsunoTransition.progress >= 1.0) {
      tsunoTransition.progress = 1.0;
      tsunoState = 'orbiting';
    }
    var ease = easeInOutCubic(tsunoTransition.progress);
    var sp = tsunoTransition.startPos;
    var ep = tsunoTransition.endPos;
    tsunoMesh.position.x = sp.x + (ep.x - sp.x) * ease;
    tsunoMesh.position.y = sp.y + (ep.y - sp.y) * ease;
    tsunoMesh.position.z = sp.z + (ep.z - sp.z) * ease;
    // Face toward vortex center during transition
    tsunoMesh.lookAt(0, 0, 30);

  } else if (tsunoState === 'orbiting') {
    var angle = t * TSUNO_ORBIT_SPEED;
    tsunoMesh.position.x = Math.cos(angle) * TSUNO_ORBIT_RADIUS;
    tsunoMesh.position.y = Math.sin(angle) * TSUNO_ORBIT_RADIUS;
    tsunoMesh.position.z = TSUNO_ORBIT_Z + Math.sin(t * 0.3) * 1.5;
    // Face the user (camera) while orbiting
    tsunoMesh.lookAt(camera.position);

  } else if (tsunoState === 'returning') {
    tsunoTransition.progress += dt / TSUNO_TRANSITION_DURATION;
    if (tsunoTransition.progress >= 1.0) {
      tsunoTransition.progress = 1.0;
      tsunoState = 'idle';
    }
    var ease = easeInOutCubic(tsunoTransition.progress);
    var sp = tsunoTransition.startPos;
    var ep = tsunoTransition.endPos;
    tsunoMesh.position.x = sp.x + (ep.x - sp.x) * ease;
    tsunoMesh.position.y = sp.y + (ep.y - sp.y) * ease;
    tsunoMesh.position.z = sp.z + (ep.z - sp.z) * ease;
    tsunoMesh.lookAt(camera.position);
  }
}
```

- [ ] **Step 2: Update the animation loop**

In the `animate()` function, replace the ghost orbit loop (lines 699-709):
```javascript
for (var gi = 0; gi < ghosts.length; gi++) {
  var ghost = ghosts[gi];
  // ...
}
```

with:
```javascript
updateTsuno(t, targetInterval / 1000);
```

Also remove the `var ghosts = [];` and `var ghostConfigs = [...]` declarations since they're replaced.

- [ ] **Step 3: Verify**

Open the site:
- Only ONE Tsuno Daishi figure visible, floating on the left side of the portal
- He gently bobs up and down
- In console: `window.JJ_Portal.tsuno.getState()` → "idle"
- `window.JJ_Portal.tsuno.setState('transitioning-out')` → Tsuno Daishi drifts to vortex center over 1.5s, then orbits
- `window.JJ_Portal.tsuno.setState('returning')` → drifts back to idle position

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): single Tsuno Daishi with 4-state machine

Replace 3 ghost instances with one Tsuno Daishi shopkeeper.
States: idle (bobbing left-center), transitioning-out (drifts to vortex),
orbiting (faces user, circles vortex), returning (drifts back).
Exposed via JJ_Portal.tsuno API."
```

---

## Chunk 4: Product Viewer & Integration

### Task 9: Create product viewer JS

**Files:**
- Create: `assets/japanjunky-product-viewer.js`

This is the core file: handles 3D product model creation, texture loading, drag-to-rotate interaction, product info overlay population with typewriter animation, variant selection, and Add to Cart.

- [ ] **Step 1: Create the JS file**

Create `assets/japanjunky-product-viewer.js`:

```javascript
/**
 * japanjunky-product-viewer.js
 * 3D product model viewer + product info overlay + typewriter animation.
 *
 * Consumes: window.JJ_Portal (from screensaver)
 * Listens:  jj:product-selected, jj:product-deselected
 */
(function () {
  'use strict';

  // ─── Wait for JJ_Portal ──────────────────────────────────────
  var portal = null;
  var maxWait = 50; // ~5 seconds at 100ms intervals
  var waitCount = 0;

  function waitForPortal(cb) {
    if (window.JJ_Portal) {
      portal = window.JJ_Portal;
      cb();
      return;
    }
    if (++waitCount > maxWait) return; // Give up silently
    setTimeout(function () { waitForPortal(cb); }, 100);
  }

  waitForPortal(init);

  function init() {
    var interactionOverlay = document.getElementById('jj-viewer-interaction');
    var infoPanel = document.getElementById('jj-product-info');
    if (!portal || !portal.scene) return;

    var scene = portal.scene;
    var camera = portal.camera;
    var cssZoom = function () {
      return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    };

    // ─── Product Model State ───────────────────────────────────
    var currentModel = null;
    var currentData = null;
    var textureLoader = new THREE.TextureLoader();
    var isRotating = false;
    var prevMouse = { x: 0, y: 0 };

    // Model position in scene (left-center, where Tsuno Daishi was)
    var MODEL_POS = { x: -1.5, y: 0, z: 8 };

    // PS1 vertex snapping shader
    var PS1_VERT = [
      'uniform float uResolution;',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipPos = projectionMatrix * viewPos;',
      '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
      '             * clipPos.w / uResolution;',
      '  gl_Position = clipPos;',
      '}'
    ].join('\n');

    var PS1_FRAG = [
      'uniform sampler2D uTexture;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 texColor = texture2D(uTexture, vUv);',
      '  gl_FragColor = texColor;',
      '}'
    ].join('\n');

    // ─── Model Creation ────────────────────────────────────────

    function createModel(data) {
      removeModel();

      var geometry;
      if (data.type3d === 'box') {
        geometry = new THREE.BoxGeometry(2.0, 2.8, 0.3);
      } else {
        geometry = new THREE.PlaneGeometry(2.0, 2.8);
      }

      // Load front texture
      var frontTex = null;
      var backTex = null;

      if (data.imageUrl) {
        frontTex = textureLoader.load(data.imageUrl);
        frontTex.minFilter = THREE.NearestFilter;
        frontTex.magFilter = THREE.NearestFilter;
      }
      if (data.imageBackUrl) {
        backTex = textureLoader.load(data.imageBackUrl);
        backTex.minFilter = THREE.NearestFilter;
        backTex.magFilter = THREE.NearestFilter;
      }

      var mesh;

      if (data.type3d === 'box') {
        // Box: 6 faces. Index: +x, -x, +y, -y, +z (front), -z (back)
        var frontMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var backMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: backTex || frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var sideMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        // Box face order: +x, -x, +y, -y, +z, -z
        mesh = new THREE.Mesh(geometry, [
          sideMat, sideMat,     // right, left
          sideMat, sideMat,     // top, bottom
          frontMat, backMat     // front, back
        ]);
      } else {
        // Plane: double-sided with front/back textures
        var mat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(geometry, mat);

        // If back texture, add a second plane slightly behind
        if (backTex) {
          var backGeo = new THREE.PlaneGeometry(2.0, 2.8);
          var backMat = new THREE.ShaderMaterial({
            uniforms: {
              uResolution: { value: parseFloat(portal.resH) },
              uTexture: { value: backTex }
            },
            vertexShader: PS1_VERT,
            fragmentShader: PS1_FRAG,
            side: THREE.FrontSide
          });
          var backMesh = new THREE.Mesh(backGeo, backMat);
          backMesh.rotation.y = Math.PI; // Flip to face backward
          backMesh.position.z = -0.01;   // Slight offset to avoid z-fighting
          mesh.add(backMesh);
        }
      }

      mesh.position.set(MODEL_POS.x, MODEL_POS.y, MODEL_POS.z);
      mesh.userData.isProductModel = true;
      scene.add(mesh);
      currentModel = mesh;
      currentData = data;

      // Initial entrance spin
      mesh.rotation.y = -0.3;

      // Enable interaction overlay
      if (interactionOverlay) {
        interactionOverlay.classList.add('jj-viewer-interaction--active');
      }
    }

    function createFallbackTexture() {
      var canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#333';
      ctx.font = '10px monospace';
      ctx.fillText('NO IMG', 8, 36);
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      return tex;
    }

    function removeModel() {
      if (currentModel) {
        scene.remove(currentModel);
        // Dispose geometry and materials
        if (currentModel.geometry) currentModel.geometry.dispose();
        if (Array.isArray(currentModel.material)) {
          currentModel.material.forEach(function (m) { m.dispose(); });
        } else if (currentModel.material) {
          currentModel.material.dispose();
        }
        // Dispose child meshes (back face plane)
        currentModel.children.forEach(function (child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        currentModel = null;
        currentData = null;
      }

      // Disable interaction overlay
      if (interactionOverlay) {
        interactionOverlay.classList.remove('jj-viewer-interaction--active');
        interactionOverlay.classList.remove('jj-viewer-interaction--dragging');
      }
    }

    // ─── Drag to Rotate ────────────────────────────────────────

    var raycaster = new THREE.Raycaster(); // Reusable instance

    if (interactionOverlay) {
      interactionOverlay.addEventListener('mousedown', function (e) {
        if (!currentModel) return;

        // Raycast to check if clicking on the model
        var z = cssZoom();
        var rect = interactionOverlay.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera({ x: mx, y: my }, camera);

        var intersects = raycaster.intersectObject(currentModel, true);
        if (intersects.length > 0) {
          isRotating = true;
          prevMouse.x = e.clientX / z;
          prevMouse.y = e.clientY / z;
          interactionOverlay.classList.add('jj-viewer-interaction--dragging');
          e.preventDefault();
        }
      });

      window.addEventListener('mousemove', function (e) {
        if (!isRotating || !currentModel) return;
        var z = cssZoom();
        var dx = (e.clientX / z) - prevMouse.x;
        var dy = (e.clientY / z) - prevMouse.y;

        currentModel.rotation.y += dx * 0.01;
        currentModel.rotation.x += dy * 0.01;

        prevMouse.x = e.clientX / z;
        prevMouse.y = e.clientY / z;
      });

      window.addEventListener('mouseup', function () {
        if (isRotating) {
          isRotating = false;
          if (interactionOverlay) {
            interactionOverlay.classList.remove('jj-viewer-interaction--dragging');
          }
        }
      });
    }

    // ─── Typewriter Animation ──────────────────────────────────

    var typeTimer = null;

    function clearType() {
      if (typeTimer) clearTimeout(typeTimer);
      typeTimer = null;
      var cursors = document.querySelectorAll('.jj-pi-cursor');
      for (var i = 0; i < cursors.length; i++) cursors[i].remove();
    }

    function typeField(el, text, msPerChar, cb) {
      if (!el) { if (cb) cb(); return; }
      el.textContent = '';
      var textNode = document.createTextNode('');
      var cursor = document.createElement('span');
      cursor.className = 'jj-pi-cursor';
      el.appendChild(textNode);
      el.appendChild(cursor);

      var idx = 0;
      function tick() {
        if (idx < text.length) {
          idx++;
          textNode.textContent = text.substring(0, idx);
          typeTimer = setTimeout(tick, msPerChar);
        } else {
          cursor.remove();
          if (cb) cb();
        }
      }
      tick();
    }

    function typeSequence(fields) {
      clearType();
      var i = 0;
      function next() {
        if (i >= fields.length) {
          // Keep cursor on last field
          var lastEl = fields[fields.length - 1].el;
          if (lastEl) {
            var cursor = document.createElement('span');
            cursor.className = 'jj-pi-cursor';
            lastEl.appendChild(cursor);
          }
          return;
        }
        var f = fields[i];
        i++;
        typeField(f.el, f.text, f.ms, function () {
          typeTimer = setTimeout(next, 150);
        });
      }
      next();
    }

    // ─── Product Info Overlay ──────────────────────────────────

    var piHeader = document.getElementById('jj-pi-header');
    var piArtist = document.getElementById('jj-pi-artist');
    var piTitle = document.getElementById('jj-pi-title');
    var piPrice = document.getElementById('jj-pi-price');
    var piMeta = document.getElementById('jj-pi-meta');
    var piDesc = document.getElementById('jj-pi-desc');
    var piVariants = document.getElementById('jj-pi-variants');
    var piAddToCart = document.getElementById('jj-pi-add-to-cart');
    var piVariantId = document.getElementById('jj-pi-variant-id');

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    function showProductInfo(data) {
      if (!infoPanel) return;

      // Header
      if (piHeader) piHeader.textContent = 'C:\\catalog\\' + data.handle + '.dat';

      // Clear fields for typewriter
      if (piArtist) piArtist.textContent = '';
      if (piTitle) piTitle.textContent = '';
      if (piPrice) piPrice.textContent = '';

      // Meta
      if (piMeta) {
        piMeta.innerHTML = [
          '<div><span class="jj-meta-label">Code:</span> <span class="jj-meta-value">' + escapeHtml(data.code || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Label:</span> <span class="jj-meta-value">' + escapeHtml(data.label || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Format:</span> <span class="jj-meta-value">' + escapeHtml(data.formatLabel || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Year:</span> <span class="jj-meta-value">' + escapeHtml(data.year || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Condition:</span> <span class="jj-meta-value">' + escapeHtml(data.condition || '---') + '</span></div>'
        ].join('');
      }

      // Description — populated by the variant fetch above (single API call)
      if (piDesc) piDesc.textContent = '';

      // Variant selector — fetch product variants and build dropdown
      if (piVariants && piVariantId) {
        piVariants.innerHTML = '';
        fetch('/products/' + data.handle + '.js')
          .then(function (res) { return res.json(); })
          .then(function (product) {
            if (product.variants && product.variants.length > 1) {
              var sel = document.createElement('select');
              sel.className = 'jj-variant-select';
              for (var vi = 0; vi < product.variants.length; vi++) {
                var v = product.variants[vi];
                var opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.title + ' — ' + (v.price / 100).toFixed(2);
                if (String(v.id) === String(data.variantId)) opt.selected = true;
                if (!v.available) opt.disabled = true;
                sel.appendChild(opt);
              }
              piVariants.appendChild(sel);

              // Variant change: update price, variant ID, and swap model texture
              sel.addEventListener('change', function () {
                var selectedOpt = sel.options[sel.selectedIndex];
                var newVariantId = sel.value;
                piVariantId.value = newVariantId;

                // Find the variant in the fetched data to get its image
                var selectedVariant = null;
                for (var sv = 0; sv < product.variants.length; sv++) {
                  if (String(product.variants[sv].id) === newVariantId) {
                    selectedVariant = product.variants[sv];
                    break;
                  }
                }

                // Update ATC state
                if (piAddToCart) {
                  piAddToCart.disabled = selectedVariant && !selectedVariant.available;
                  piAddToCart.textContent = (selectedVariant && selectedVariant.available) ? '[Add to Cart]' : '[Unavailable]';
                }

                // Swap 3D model texture if variant has a featured image
                if (selectedVariant && selectedVariant.featured_image && currentModel) {
                  var newTexUrl = selectedVariant.featured_image.src;
                  var newTex = textureLoader.load(newTexUrl);
                  newTex.minFilter = THREE.NearestFilter;
                  newTex.magFilter = THREE.NearestFilter;
                  // Update the front face material
                  if (Array.isArray(currentModel.material)) {
                    // Box: front face is index 4
                    if (currentModel.material[4] && currentModel.material[4].uniforms) {
                      currentModel.material[4].uniforms.uTexture.value = newTex;
                    }
                  } else if (currentModel.material && currentModel.material.uniforms) {
                    currentModel.material.uniforms.uTexture.value = newTex;
                  }
                }
              });

              // Also populate description from the same fetch
              if (piDesc && product.description) {
                var text = product.description.replace(/<[^>]*>/g, '').substring(0, 200);
                piDesc.textContent = text;
              }
            }
          })
          .catch(function () {});
      }

      // Variant ID + ATC button (initial state from row data)
      if (piVariantId) piVariantId.value = data.variantId;
      if (piAddToCart) {
        piAddToCart.disabled = !data.available;
        piAddToCart.textContent = data.available ? '[Add to Cart]' : '[Unavailable]';
      }

      // Show panel with CRT-on effect
      infoPanel.style.display = '';
      infoPanel.classList.remove('jj-product-info--entering');
      void infoPanel.offsetHeight; // Force reflow
      infoPanel.classList.add('jj-product-info--entering');

      // Typewriter sequence
      typeSequence([
        { el: piArtist, text: (data.artist || data.vendor || '---').toUpperCase(), ms: 38 },
        { el: piTitle, text: data.title || '---', ms: 28 },
        { el: piPrice, text: data.price || '---', ms: 22 }
      ]);
    }

    function hideProductInfo() {
      clearType();
      if (infoPanel) infoPanel.style.display = 'none';
    }

    // ─── Add to Cart ───────────────────────────────────────────

    if (piAddToCart) {
      piAddToCart.addEventListener('click', function () {
        if (piAddToCart.disabled) return;
        var variantId = piVariantId ? piVariantId.value : '';
        if (!variantId) return;

        piAddToCart.textContent = '[Adding...]';
        piAddToCart.disabled = true;

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Cart error');
            return res.json();
          })
          .then(function () {
            piAddToCart.textContent = '[OK]';
            setTimeout(function () {
              piAddToCart.textContent = '[Add to Cart]';
              piAddToCart.disabled = false;
            }, 1500);

            // Update cart count in header
            fetch('/cart.js')
              .then(function (r) { return r.json(); })
              .then(function (cart) {
                var cartBtns = document.querySelectorAll('.jj-nav-action-btn');
                for (var i = 0; i < cartBtns.length; i++) {
                  if (cartBtns[i].textContent.indexOf('Cart') !== -1) {
                    cartBtns[i].textContent = '[Cart:' + cart.item_count + ']';
                  }
                }
              });
          })
          .catch(function () {
            piAddToCart.textContent = '[ERR]';
            setTimeout(function () {
              piAddToCart.textContent = '[Add to Cart]';
              piAddToCart.disabled = false;
            }, 1500);
          });
      });
    }

    // ─── Event Listeners ───────────────────────────────────────

    document.addEventListener('jj:product-selected', function (e) {
      var data = e.detail;

      // Transition Tsuno Daishi out
      if (portal.tsuno && portal.tsuno.getState() !== 'orbiting') {
        portal.tsuno.setState('transitioning-out');
      }

      // Disable parallax during product viewing
      portal.setParallaxEnabled(false);

      // Create 3D model
      createModel(data);

      // Show product info overlay
      showProductInfo(data);
    });

    document.addEventListener('jj:product-deselected', function () {
      // Remove 3D model
      removeModel();

      // Return Tsuno Daishi
      if (portal.tsuno && portal.tsuno.getState() !== 'idle') {
        portal.tsuno.setState('returning');
      }

      // Re-enable parallax
      portal.setParallaxEnabled(true);

      // Hide product info overlay
      hideProductInfo();
    });
  }
})();
```

- [ ] **Step 2: Verify full flow**

Open the site and test the complete flow:
1. Tsuno Daishi should be floating on the left side
2. Click a product row → Tsuno Daishi drifts to vortex, product model appears, info overlay shows with typewriter
3. Drag on the product model → it rotates
4. Click the same row again → model disappears, Tsuno Daishi returns, info overlay hides
5. Arrow keys navigate, Enter selects, Escape deselects
6. Add to Cart button works (shows [Adding...], [OK], updates cart count)

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-product-viewer.js
git commit -m "feat(viewer): 3D product model viewer with typewriter and ATC

PS1-style vertex-snapped product models (plane or box geometry).
Drag-to-rotate interaction via raycasting. Typewriter animation for
product info overlay. Add to Cart with async cart update.
Integrates with JJ_Portal for scene access and Tsuno Daishi control."
```

---

### Task 10: Cleanup and integration

**Files:**
- Modify: `layout/theme.liquid` (if any final adjustments needed)
- Remove references to deprecated files

- [ ] **Step 1: Remove old files from version control (optional)**

The old files are no longer loaded but still exist in the repo. They can be kept for reference or deleted:

```bash
# Optional: remove deprecated files
git rm assets/japanjunky-wm.js
git rm assets/japanjunky-wm.css
git rm assets/japanjunky-product-select.js
git rm assets/japanjunky-homepage.css
git rm snippets/product-detail-pane.liquid
git rm snippets/product-table-row.liquid
```

If keeping for reference, just don't load them (already handled in Task 1).

- [ ] **Step 2: Remove debug console.log from japanjunky-wm.js (if kept)**

If keeping the WM file, clean up any debug logging.

- [ ] **Step 3: Final browser verification**

Full test checklist:
- [ ] Portal vortex renders with procedural flame bands (no sample3.jpg 404)
- [ ] Tsuno Daishi floats on left, bobs gently
- [ ] Catalog panel is fixed right 40%, scrollable, dark background
- [ ] Header bar shows logo, search, cart buttons
- [ ] FILTERS toggle opens/closes filter panel
- [ ] Filter clicking shows/hides products, filter tags appear
- [ ] Product rows display: thumbnail + title/artist + price
- [ ] Clicking a row: Tsuno Daishi transitions to vortex, product model appears, info overlay shows with typewriter
- [ ] Drag on product model rotates it on X/Y axes
- [ ] Click selected row again: model disappears, Tsuno Daishi returns
- [ ] Arrow keys navigate list, Enter selects, Escape deselects
- [ ] Add to Cart works, cart count updates in header
- [ ] CRT overlay covers entire viewport
- [ ] Taskbar visible at bottom, full width
- [ ] No JS errors in console
- [ ] CSS zoom at 1.5x (screen ≥1600px): everything still works correctly

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: game inventory UI — complete implementation

Desktop OS shell transformed into video game-style inventory UI.
Fixed catalog panel (right 40%), 3D product viewer (left 60%),
Tsuno Daishi shopkeeper with state machine, PS1-style product models,
typewriter animation, drag-to-rotate, and full Shopify cart integration."
```

---

## Dependency Graph

```
Task 1 (theme.liquid) ──┐
Task 2 (panel CSS)  ────┤
Task 3 (homepage body) ─┼── Chunk 1: Layout visible
Task 4 (filter.js)  ────┘
                         │
Task 5 (panel JS)   ────┤── Chunk 2: Selection works
Task 6 (info CSS)   ────┘
                         │
Task 7 (portal API) ────┤── Chunk 3: Screensaver ready
Task 8 (Tsuno state) ───┘
                         │
Task 9 (viewer JS)  ────┤── Chunk 4: Full integration
Task 10 (cleanup)   ────┘
```

Tasks within a chunk can be done in order listed. Chunks must be done sequentially (each builds on the previous).
