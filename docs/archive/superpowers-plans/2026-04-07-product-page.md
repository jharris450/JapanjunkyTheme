# Product Page Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Shopify product page template with cinematic View Transitions API page transitions, a 3D product viewer with procedural vinyl disc, and terminal-styled product info panel.

**Architecture:** Real Shopify product template (`product.json` + `sections/jj-product.liquid`) with View Transitions API for cross-document page transitions. The portal screensaver (in `theme.liquid`) renders on both pages — homepage uses centered camera, product page uses offset camera preset. A dedicated product page JS file handles entrance animations, variant selection, thumbnails, and vinyl disc creation. The existing product viewer JS is extended with a product-page mode for different idle parameters and vinyl support.

**Tech Stack:** Three.js (global), GLSL ES 1.0, Shopify Liquid, View Transitions API, vanilla JS

**Spec:** `docs/superpowers/specs/2026-04-07-product-page-design.md`

---

### Task 1: View Transitions API — Meta Tag + Transition CSS

**Files:**
- Modify: `layout/theme.liquid:6` — add meta tag
- Create: `assets/japanjunky-transitions.css` — transition keyframes and view-transition-name assignments

- [ ] **Step 1: Add View Transition meta tag to theme.liquid**

In `layout/theme.liquid`, after line 6 (`<meta http-equiv="X-UA-Compatible" content="IE=edge">`), add:

```html
<meta name="view-transition" content="same-origin">
```

- [ ] **Step 2: Create the transitions CSS file**

Create `assets/japanjunky-transitions.css`:

```css
/* ============================================
   VIEW TRANSITIONS — Cross-page animations
   ============================================ */

/* --- Transition Names — Homepage elements --- */
.jj-ring__bar {
  view-transition-name: catalog-bar;
}
.jj-ring__stage {
  view-transition-name: catalog-stage;
}
.jj-product-info {
  view-transition-name: product-info;
}
#jj-viewer-canvas {
  view-transition-name: product-canvas;
}
#jj-screensaver {
  view-transition-name: portal;
}

/* --- Transition Names — Product page elements --- */
.jj-pdp-info {
  view-transition-name: product-info;
}
#jj-pdp-viewer-canvas {
  view-transition-name: product-canvas;
}

/* --- Keyframes --- */
@keyframes jj-fly-up {
  from { transform: translateY(0); opacity: 1; }
  to   { transform: translateY(-120%); opacity: 0; }
}

@keyframes jj-fly-down {
  from { transform: translateY(0); opacity: 1; }
  to   { transform: translateY(120%); opacity: 0; }
}

@keyframes jj-slide-out-left {
  from { transform: translateX(0); opacity: 1; }
  to   { transform: translateX(-120%); opacity: 0; }
}

@keyframes jj-slide-in-left {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

@keyframes jj-fade-scale-in {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

@keyframes jj-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes jj-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* --- Outgoing (homepage → product page) --- */
::view-transition-old(catalog-bar) {
  animation: jj-fly-up 0.5s ease-in forwards;
}
::view-transition-old(catalog-stage) {
  animation: jj-fly-down 0.6s ease-in forwards;
}
::view-transition-old(product-info) {
  animation: jj-slide-out-left 0.4s ease-in forwards;
}
::view-transition-old(product-canvas) {
  animation: jj-fade-out 0.3s ease-in forwards;
}
::view-transition-old(portal) {
  animation: jj-fade-out 0.3s ease-out forwards;
}

/* --- Incoming (product page appears) --- */
::view-transition-new(product-info) {
  animation: jj-slide-in-left 0.4s ease-out;
}
::view-transition-new(product-canvas) {
  animation: jj-fade-scale-in 0.4s ease-out 0.1s both;
}
::view-transition-new(portal) {
  animation: jj-fade-in 0.3s ease-in 0.1s both;
}
::view-transition-new(catalog-bar) {
  animation: jj-fade-in 0.3s ease-out;
}
::view-transition-new(catalog-stage) {
  animation: jj-fade-in 0.3s ease-out;
}

/* --- Back navigation (product page → homepage) --- */
/* Reverse: product info slides out left, catalog flies back in */
```

- [ ] **Step 3: Include the CSS in theme.liquid**

In `layout/theme.liquid`, after the line `{{ 'japanjunky-calendar.css' | asset_url | stylesheet_tag }}` (if it exists, otherwise after the last CSS stylesheet_tag before the splash conditional), add:

```liquid
{{ 'japanjunky-transitions.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid assets/japanjunky-transitions.css
git commit -m "feat(transitions): View Transitions API meta tag + cross-page keyframes"
```

---

### Task 2: Screensaver Camera Presets + Tsuno Idle State

**Files:**
- Modify: `assets/japanjunky-screensaver.js:49-53` — camera setup
- Modify: `assets/japanjunky-screensaver.js:1860` — LOOK_TARGET

- [ ] **Step 1: Add camera presets after scene/camera creation**

In `assets/japanjunky-screensaver.js`, replace lines 49-53:

```javascript
  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 0, -1);
  camera.lookAt(0, 0, 30);
```

With:

```javascript
  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);

  var CAMERA_PRESETS = {
    default: { pos: [0, 0, -1], look: [0, 0, 30] },
    product: { pos: [-3, 0.5, -1], look: [2, 0, 30] }
  };
  var cameraPreset = CAMERA_PRESETS[config.cameraPreset] || CAMERA_PRESETS.default;
  camera.position.set(cameraPreset.pos[0], cameraPreset.pos[1], cameraPreset.pos[2]);
  camera.lookAt(cameraPreset.look[0], cameraPreset.look[1], cameraPreset.look[2]);
```

- [ ] **Step 2: Update LOOK_TARGET to use preset**

In `assets/japanjunky-screensaver.js`, replace line 1860:

```javascript
  var LOOK_TARGET = { x: 0, y: 0, z: 30 };
```

With:

```javascript
  var LOOK_TARGET = { x: cameraPreset.look[0], y: cameraPreset.look[1], z: cameraPreset.look[2] };
```

- [ ] **Step 3: Add Tsuno product-page idle behavior**

In `assets/japanjunky-screensaver.js`, find the Tsuno idle position constants (around line 449):

```javascript
  var TSUNO_IDLE_POS = { x: 4.0, y: 0.0, z: 6 };
```

After that line, add:

```javascript
  // Product page: Tsuno starts in a calm resting position near portal edge
  var tsunoProductPageMode = config.cameraPreset === 'product';
  var TSUNO_PRODUCT_POS = { x: 2.5, y: -0.5, z: 8 };
```

Then find the Tsuno mesh creation section where `tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);` is set (around line 945). Replace:

```javascript
      tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);
```

With:

```javascript
      var tsunoStartPos = tsunoProductPageMode ? TSUNO_PRODUCT_POS : TSUNO_IDLE_POS;
      tsunoMesh.position.set(tsunoStartPos.x, tsunoStartPos.y, tsunoStartPos.z);
```

- [ ] **Step 4: Skip personality system on product page**

In the `tsunoOnProductSelected` function (around line 837), add an early return for product page mode. At the top of the function, after `if (!tsunoMesh || tsunoState !== 'idle') return;`, add:

```javascript
    if (tsunoProductPageMode) return; // Product page: Tsuno stays calm
```

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): camera presets + Tsuno product-page idle mode"
```

---

### Task 3: Shopify Product Template + Section (Liquid)

**Files:**
- Create: `templates/product.json`
- Create: `sections/jj-product.liquid`

- [ ] **Step 1: Create the JSON template**

Create `templates/product.json`:

```json
{
  "sections": {
    "product": {
      "type": "jj-product",
      "settings": {}
    }
  },
  "order": ["product"]
}
```

- [ ] **Step 2: Create the product section**

Create `sections/jj-product.liquid`:

```liquid
{%- comment -%}
  JapanJunky Product Page — Terminal-styled product detail
  with 3D viewer, vinyl disc, and View Transitions entrance.
{%- endcomment -%}

{%- assign p = product -%}
{%- assign current_variant = p.selected_or_first_available_variant -%}

{%- comment -%} Product data for JS {%- endcomment -%}
<script>
  window.JJ_SCREENSAVER_CONFIG = window.JJ_SCREENSAVER_CONFIG || {};
  window.JJ_SCREENSAVER_CONFIG.cameraPreset = 'product';

  window.JJ_PRODUCT_DATA = {
    handle: {{ p.handle | json }},
    title: {{ p.title | json }},
    artist: {{ p.metafields.custom.artist | default: p.vendor | json }},
    jpName: {{ p.metafields.custom.jp_name | default: '' | json }},
    jpTitle: {{ p.metafields.custom.jp_title | default: '' | json }},
    code: {{ p.metafields.custom.code | default: '' | json }},
    label: {{ p.metafields.custom.label | default: '' | json }},
    formatLabel: {{ p.metafields.custom.format | default: '' | json }},
    year: {{ p.metafields.custom.year | default: '' | json }},
    description: {{ p.description | json }},
    images: [
      {%- for image in p.images -%}
        {%- unless forloop.first -%},{%- endunless -%}
        {{ image | image_url: width: 800 | json }}
      {%- endfor -%}
    ],
    variants: [
      {%- for variant in p.variants -%}
        {%- unless forloop.first -%},{%- endunless -%}
        {
          "id": {{ variant.id }},
          "title": {{ variant.title | json }},
          "price": {{ variant.price | money | json }},
          "available": {{ variant.available }},
          "option1": {{ variant.option1 | json }}
        }
      {%- endfor -%}
    ],
    currentVariantId: {{ current_variant.id }},
    currentPrice: {{ current_variant.price | money | json }},
    available: {{ current_variant.available }}
  };
</script>

{%- comment -%} Product page layout {%- endcomment -%}
<div class="jj-pdp" id="jj-pdp">

  {%- comment -%} Left: Product info panel {%- endcomment -%}
  <div class="jj-pdp-info" id="jj-pdp-info">

    <a href="/" class="jj-pdp-back" id="jj-pdp-back">[&larr; Catalog]</a>

    <div class="jj-pdp-artist" id="jj-pdp-artist">{{ p.metafields.custom.artist | default: p.vendor }}</div>

    {%- if p.metafields.custom.jp_name != blank -%}
    <div class="jj-pdp-jp-name">{{ p.metafields.custom.jp_name }}</div>
    {%- endif -%}

    <div class="jj-pdp-title" id="jj-pdp-title">{{ p.title }}</div>

    {%- if p.metafields.custom.jp_title != blank -%}
    <div class="jj-pdp-jp-title">{{ p.metafields.custom.jp_title }}</div>
    {%- endif -%}

    <div class="jj-pdp-meta">
      {%- if p.metafields.custom.code != blank -%}
      <div class="jj-meta-row"><span class="jj-meta-row__label">Code:</span> <span class="jj-meta-row__value">{{ p.metafields.custom.code }}</span></div>
      {%- endif -%}
      {%- if p.metafields.custom.label != blank -%}
      <div class="jj-meta-row"><span class="jj-meta-row__label">Label:</span> <span class="jj-meta-row__value">{{ p.metafields.custom.label }}</span></div>
      {%- endif -%}
      {%- if p.metafields.custom.format != blank -%}
      <div class="jj-meta-row"><span class="jj-meta-row__label">Format:</span> <span class="jj-meta-row__value">{{ p.metafields.custom.format }}</span></div>
      {%- endif -%}
      {%- if p.metafields.custom.year != blank -%}
      <div class="jj-meta-row"><span class="jj-meta-row__label">Year:</span> <span class="jj-meta-row__value">{{ p.metafields.custom.year }}</span></div>
      {%- endif -%}
      {%- if current_variant.option1 != blank -%}
      <div class="jj-meta-row"><span class="jj-meta-row__label">Condition:</span> <span class="jj-meta-row__value">{{ current_variant.option1 }}</span></div>
      {%- endif -%}
    </div>

    <div class="jj-pdp-price" id="jj-pdp-price">{{ current_variant.price | money }}</div>

    {%- if p.variants.size > 1 -%}
    <div class="jj-pdp-variants" id="jj-pdp-variants">
      {%- for variant in p.variants -%}
      <button class="jj-pdp-variant-btn{% if variant == current_variant %} jj-pdp-variant-btn--active{% endif %}"
              data-variant-id="{{ variant.id }}"
              data-variant-price="{{ variant.price | money }}"
              data-variant-available="{{ variant.available }}"
              data-variant-option1="{{ variant.option1 }}"
              type="button">
        [{{ variant.option1 }}]
      </button>
      {%- endfor -%}
    </div>
    {%- endif -%}

    <div class="jj-pdp-actions">
      <form id="jj-pdp-cart-form" action="/cart/add" method="post">
        <input type="hidden" name="id" id="jj-pdp-variant-id" value="{{ current_variant.id }}">
        <input type="hidden" name="quantity" value="1">
        <button type="submit" class="jj-action-btn" id="jj-pdp-add-to-cart"
                {% unless current_variant.available %}disabled{% endunless %}>
          {{ current_variant.available | default: false | ternary: '[Add to Cart]', '[Unavailable]' }}
          [Add to Cart]
        </button>
      </form>
    </div>

    {%- if p.images.size > 0 -%}
    <div class="jj-pdp-thumbs" id="jj-pdp-thumbs">
      {%- for image in p.images limit: 4 -%}
      <button class="jj-pdp-thumb{% if forloop.first %} jj-pdp-thumb--active{% endif %}"
              data-thumb-index="{{ forloop.index0 }}"
              data-image-url="{{ image | image_url: width: 800 }}"
              type="button">
        <img src="{{ image | image_url: width: 80 }}" alt="{{ image.alt | escape }}" loading="lazy" width="80" height="80">
      </button>
      {%- endfor -%}
    </div>
    {%- endif -%}

    {%- if p.description != blank -%}
    <div class="jj-pdp-description">
      {{ p.description }}
    </div>
    {%- endif -%}

  </div>

  {%- comment -%} Right: 3D product viewer canvas {%- endcomment -%}
  <div class="jj-pdp-viewer" id="jj-pdp-viewer">
    <canvas id="jj-pdp-viewer-canvas" aria-label="3D product viewer"></canvas>
  </div>

</div>

{%- comment -%} No-JS fallback: static image + standard form {%- endcomment -%}
<noscript>
  <style>.jj-pdp { display: none; }</style>
  <div style="padding: 20px; color: #e0d5c0; font-family: monospace;">
    <h1>{{ p.title }}</h1>
    {%- if p.featured_image -%}
    <img src="{{ p.featured_image | image_url: width: 400 }}" alt="{{ p.featured_image.alt | escape }}">
    {%- endif -%}
    <p>{{ current_variant.price | money }}</p>
    <p>{{ p.description }}</p>
    <form action="/cart/add" method="post">
      <input type="hidden" name="id" value="{{ current_variant.id }}">
      <button type="submit">Add to Cart</button>
    </form>
  </div>
</noscript>

{% schema %}
{
  "name": "Product Page",
  "settings": []
}
{% endschema %}
```

- [ ] **Step 3: Fix the Add to Cart button Liquid logic**

The ternary filter doesn't exist in Liquid. Replace the button line:

```liquid
        <button type="submit" class="jj-action-btn" id="jj-pdp-add-to-cart"
                {% unless current_variant.available %}disabled{% endunless %}>
          {{ current_variant.available | default: false | ternary: '[Add to Cart]', '[Unavailable]' }}
          [Add to Cart]
        </button>
```

With:

```liquid
        <button type="submit" class="jj-action-btn" id="jj-pdp-add-to-cart"
                {% unless current_variant.available %}disabled{% endunless %}>
          {%- if current_variant.available -%}[Add to Cart]{%- else -%}[Unavailable]{%- endif -%}
        </button>
```

- [ ] **Step 4: Commit**

```bash
git add templates/product.json sections/jj-product.liquid
git commit -m "feat(product): Shopify product template + section with Liquid data"
```

---

### Task 4: Product Page CSS

**Files:**
- Create: `assets/japanjunky-product-page.css`
- Modify: `layout/theme.liquid` — include the CSS

- [ ] **Step 1: Create the product page stylesheet**

Create `assets/japanjunky-product-page.css`:

```css
/* ============================================
   JAPANJUNKY PRODUCT PAGE
   Terminal-styled product detail — extends
   jj-product-info visual language.
   ============================================ */

/* --- Layout: full viewport, two-zone overlay --- */
.jj-pdp {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: stretch;
  pointer-events: none;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}

/* --- Left: Product info panel --- */
.jj-pdp-info {
  width: 360px;
  max-width: 40vw;
  padding: 16px 20px 20px;
  background: rgba(0, 0, 0, 0.75);
  overflow-y: auto;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 2;
}

/* --- Back button --- */
.jj-pdp-back {
  font-family: inherit;
  font-size: 11px;
  color: var(--jj-accent, #33cccc);
  text-decoration: none;
  margin-bottom: 12px;
  display: inline-block;
}
.jj-pdp-back:hover {
  text-shadow: 0 0 6px rgba(51, 204, 204, 0.5);
}

/* --- Artist --- */
.jj-pdp-artist {
  font-size: 16px;
  font-weight: 700;
  color: var(--jj-primary, #e04040);
  line-height: 1.3;
  text-shadow: 0 0 8px rgba(224, 64, 64, 0.4);
  text-transform: uppercase;
}

/* --- JP Name --- */
.jj-pdp-jp-name {
  font-size: 12px;
  color: var(--jj-muted, #666);
  line-height: 1.4;
  padding-top: 2px;
  padding-bottom: 6px;
  margin-bottom: 6px;
  background-image: linear-gradient(#333, #333);
  background-size: 25% 1px;
  background-position: left bottom;
  background-repeat: no-repeat;
}

/* --- Title --- */
.jj-pdp-title {
  font-size: 14px;
  color: var(--jj-text, #e0d5c0);
  line-height: 1.3;
  text-shadow: 0 0 6px rgba(224, 213, 192, 0.5);
  margin-bottom: 2px;
}

/* --- JP Title --- */
.jj-pdp-jp-title {
  font-size: 12px;
  color: var(--jj-muted, #666);
  line-height: 1.4;
  padding-top: 2px;
  margin-bottom: 6px;
}

/* --- Meta rows --- */
.jj-pdp-meta {
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 8px;
}

/* Reuse existing .jj-meta-row styles from product-info.css */

/* --- Price --- */
.jj-pdp-price {
  font-size: 14px;
  color: var(--jj-secondary, #f5d742);
  margin-bottom: 8px;
  text-shadow: 0 0 6px rgba(245, 215, 66, 0.4);
}

/* --- Variant selector --- */
.jj-pdp-variants {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.jj-pdp-variant-btn {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: #666;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  padding: 4px 8px;
  cursor: pointer;
  text-transform: uppercase;
}

.jj-pdp-variant-btn:hover {
  border-color: #555;
  color: var(--jj-text, #e0d5c0);
}

.jj-pdp-variant-btn--active {
  color: var(--jj-primary, #e04040);
  border-color: var(--jj-primary, #e04040);
  text-shadow: 0 0 4px rgba(224, 64, 64, 0.4);
}

/* --- Actions --- */
.jj-pdp-actions {
  margin-bottom: 12px;
}

.jj-pdp-actions .jj-action-btn {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: var(--jj-primary, #e04040);
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  padding: 4px 8px;
  cursor: pointer;
  text-transform: uppercase;
}
.jj-pdp-actions .jj-action-btn:hover {
  border-color: var(--jj-primary, #e04040);
  text-shadow: 0 0 4px rgba(224, 64, 64, 0.4);
}
.jj-pdp-actions .jj-action-btn:disabled {
  color: #555;
  border-color: #222;
  cursor: default;
}

/* --- Thumbnail strip --- */
.jj-pdp-thumbs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.jj-pdp-thumb {
  width: 60px;
  height: 60px;
  border: 1px solid #333;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px;
  cursor: pointer;
  flex-shrink: 0;
}
.jj-pdp-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}
.jj-pdp-thumb:hover {
  border-color: #555;
}
.jj-pdp-thumb--active {
  border-color: var(--jj-primary, #e04040);
}

/* --- Description --- */
.jj-pdp-description {
  font-size: 11px;
  color: var(--jj-muted, #888);
  line-height: 1.5;
  padding-top: 8px;
  border-top: 1px solid #222;
}

/* --- Right: Viewer canvas zone --- */
.jj-pdp-viewer {
  flex: 1;
  position: relative;
  pointer-events: auto;
}

#jj-pdp-viewer-canvas {
  position: absolute;
  top: 50%;
  right: 10%;
  width: 500px;
  height: 500px;
  transform: translateY(-50%);
  pointer-events: auto;
  cursor: grab;
}

/* --- Entrance animation --- */
.jj-pdp-info--entering {
  animation: jj-slide-in-left 0.4s ease-out;
}
.jj-pdp-viewer--entering #jj-pdp-viewer-canvas {
  animation: jj-fade-scale-in 0.4s ease-out 0.1s both;
}

/* --- High Contrast --- */
@media (prefers-contrast: more) {
  .jj-pdp-info {
    background: rgba(0, 0, 0, 0.95);
  }
  .jj-pdp-variant-btn--active {
    border-width: 2px;
  }
}
```

- [ ] **Step 2: Include CSS in theme.liquid**

In `layout/theme.liquid`, after the transitions CSS include, add:

```liquid
{{ 'japanjunky-product-page.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-product-page.css layout/theme.liquid
git commit -m "feat(product): product page CSS — terminal-styled layout"
```

---

### Task 5: Product Page JS — Core (Variants, Add-to-Cart, Thumbnails, Entrance)

**Files:**
- Create: `assets/japanjunky-product-page.js`
- Modify: `layout/theme.liquid` — include the script

- [ ] **Step 1: Create the product page JavaScript**

Create `assets/japanjunky-product-page.js`:

```javascript
/**
 * japanjunky-product-page.js
 * Product page logic: entrance animations, variant selector,
 * thumbnail strip, add-to-cart, back button transition.
 *
 * Consumes: window.JJ_PRODUCT_DATA (set by jj-product.liquid)
 */
(function () {
  'use strict';

  var data = window.JJ_PRODUCT_DATA;
  if (!data) return;

  // ─── DOM ──────────────────────────────────────────────────────
  var infoPanel = document.getElementById('jj-pdp-info');
  var priceEl = document.getElementById('jj-pdp-price');
  var variantIdInput = document.getElementById('jj-pdp-variant-id');
  var addToCartBtn = document.getElementById('jj-pdp-add-to-cart');
  var cartForm = document.getElementById('jj-pdp-cart-form');
  var variantsContainer = document.getElementById('jj-pdp-variants');
  var thumbsContainer = document.getElementById('jj-pdp-thumbs');
  var backBtn = document.getElementById('jj-pdp-back');

  // ─── Entrance Animation ───────────────────────────────────────
  if (infoPanel) {
    infoPanel.classList.add('jj-pdp-info--entering');
  }
  var viewerWrap = document.getElementById('jj-pdp-viewer');
  if (viewerWrap) {
    viewerWrap.classList.add('jj-pdp-viewer--entering');
  }

  // ─── Variant Selector ─────────────────────────────────────────
  if (variantsContainer) {
    var variantBtns = variantsContainer.querySelectorAll('.jj-pdp-variant-btn');

    for (var i = 0; i < variantBtns.length; i++) {
      variantBtns[i].addEventListener('click', function () {
        var btn = this;
        var vid = btn.getAttribute('data-variant-id');
        var vprice = btn.getAttribute('data-variant-price');
        var vavail = btn.getAttribute('data-variant-available') === 'true';
        var voption1 = btn.getAttribute('data-variant-option1');

        // Update active state
        for (var j = 0; j < variantBtns.length; j++) {
          variantBtns[j].classList.remove('jj-pdp-variant-btn--active');
        }
        btn.classList.add('jj-pdp-variant-btn--active');

        // Update price
        if (priceEl) priceEl.textContent = vprice;

        // Update hidden input
        if (variantIdInput) variantIdInput.value = vid;

        // Update button state
        if (addToCartBtn) {
          addToCartBtn.disabled = !vavail;
          addToCartBtn.textContent = vavail ? '[Add to Cart]' : '[Unavailable]';
        }

        // Update condition in meta
        var conditionEl = document.querySelector('.jj-pdp-meta .jj-meta-row:last-child .jj-meta-row__value');
        if (conditionEl && voption1) conditionEl.textContent = voption1;

        // Update URL without reload
        var url = new URL(window.location);
        url.searchParams.set('variant', vid);
        history.replaceState(null, '', url);

        // Dispatch event for product viewer to pick up
        document.dispatchEvent(new CustomEvent('jj:pdp-variant-changed', {
          detail: { variantId: vid, option1: voption1, price: vprice, available: vavail }
        }));
      });
    }
  }

  // ─── Add to Cart (AJAX) ────────────────────────────────────────
  if (cartForm) {
    cartForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (addToCartBtn.disabled) return;

      var vid = variantIdInput ? variantIdInput.value : '';
      if (!vid) return;

      addToCartBtn.textContent = '[Adding...]';
      addToCartBtn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(vid, 10), quantity: 1 })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Cart error');
          return res.json();
        })
        .then(function () {
          addToCartBtn.textContent = '[OK]';
          setTimeout(function () {
            addToCartBtn.textContent = '[Add to Cart]';
            addToCartBtn.disabled = false;
          }, 1500);
        })
        .catch(function () {
          addToCartBtn.textContent = '[ERR]';
          setTimeout(function () {
            addToCartBtn.textContent = '[Add to Cart]';
            addToCartBtn.disabled = false;
          }, 1500);
        });
    });
  }

  // ─── Thumbnail Strip ───────────────────────────────────────────
  if (thumbsContainer) {
    var thumbBtns = thumbsContainer.querySelectorAll('.jj-pdp-thumb');

    for (var ti = 0; ti < thumbBtns.length; ti++) {
      thumbBtns[ti].addEventListener('click', function () {
        var btn = this;
        var idx = parseInt(btn.getAttribute('data-thumb-index'), 10);

        // Update active state
        for (var tj = 0; tj < thumbBtns.length; tj++) {
          thumbBtns[tj].classList.remove('jj-pdp-thumb--active');
        }
        btn.classList.add('jj-pdp-thumb--active');

        // Dispatch event for product viewer
        document.dispatchEvent(new CustomEvent('jj:pdp-thumb-selected', {
          detail: { index: idx, imageUrl: btn.getAttribute('data-image-url') }
        }));
      });
    }
  }

  // ─── Back Button ───────────────────────────────────────────────
  if (backBtn) {
    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      // Store flag so homepage knows this is a back navigation
      try { sessionStorage.setItem('jj-back-nav', '1'); } catch (err) {}
      window.location.href = '/';
    });
  }
})();
```

- [ ] **Step 2: Include the script in theme.liquid**

In `layout/theme.liquid`, before the closing `</body>` tag area (near the other script includes), add:

```liquid
<script src="{{ 'japanjunky-product-page.js' | asset_url }}" defer></script>
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-product-page.js layout/theme.liquid
git commit -m "feat(product): product page JS — variants, cart, thumbs, entrance"
```

---

### Task 6: Homepage [View] Click — Tsuno Grab + Navigation

**Files:**
- Modify: `assets/japanjunky-product-viewer.js:596-601` — intercept [View] click
- Modify: `assets/japanjunky-screensaver.js` — add Tsuno grab API

- [ ] **Step 1: Add Tsuno grab method to screensaver public API**

In `assets/japanjunky-screensaver.js`, find the `window.JJ_Portal = {` block (around line 1977). After the `setBubbleVisible` method, add:

```javascript
    ,
    triggerTsunoGrab: function (cb) {
      if (!tsunoMesh || tsunoProductPageMode) { if (cb) cb(); return; }
      // Move Tsuno toward the product viewer area (right side, close to camera)
      tsunoTransitioning = true;
      var t = performance.now() * 0.001;
      tsunoTransStart = t;
      tsunoTransDuration = 0.5;
      tsunoTransFrom.x = tsunoMesh.position.x;
      tsunoTransFrom.y = tsunoMesh.position.y;
      tsunoTransFrom.z = tsunoMesh.position.z;
      // Target: near the product viewer canvas position (left side, close)
      tsunoTransTo.x = 1.0;
      tsunoTransTo.y = 0.0;
      tsunoTransTo.z = 3.0;
      // Callback after grab completes
      if (cb) setTimeout(cb, 550);
    }
```

- [ ] **Step 2: Intercept [View] button click for transition**

In `assets/japanjunky-product-viewer.js`, find the section where `piView.href` is set (around lines 598-601):

```javascript
    // View button
    if (piView) {
      piView.href = '/products/' + encodeURIComponent(data.handle);
      piView.style.display = '';
    }
```

After line 601 (closing brace of the `if (piView)` block), and before the `// Show info panel` comment, add the click interceptor. Find the end of the `showProductInfo` function (after the `typeSequence` call, around line 619), and after the closing brace of `showProductInfo`, add:

```javascript
  // ─── [View] Button — Cinematic Transition ─────────────────────
  if (piView) {
    piView.addEventListener('click', function (e) {
      var href = piView.href;
      if (!href) return; // fallback: normal navigation

      // If View Transitions API not supported, just navigate
      if (!document.startViewTransition) return;

      e.preventDefault();

      // Trigger Tsuno grab animation, then navigate
      var portal = window.JJ_Portal;
      if (portal && portal.triggerTsunoGrab) {
        portal.triggerTsunoGrab(function () {
          window.location.href = href;
        });
      } else {
        // No portal — navigate after short delay
        setTimeout(function () {
          window.location.href = href;
        }, 200);
      }
    });
  }
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-product-viewer.js assets/japanjunky-screensaver.js
git commit -m "feat(transitions): Tsuno grab animation + [View] click interceptor"
```

---

### Task 7: Product Viewer — Product Page Mode + Vinyl Disc

**Files:**
- Modify: `assets/japanjunky-product-viewer.js` — detect product page, create vinyl, different idle

- [ ] **Step 1: Add product page mode detection at the top of the IIFE**

In `assets/japanjunky-product-viewer.js`, after the existing canvas/infoPanel DOM lookups (lines 14-15), add product page detection:

```javascript
  // Product page mode: uses a different canvas and data source
  var pdpCanvas = document.getElementById('jj-pdp-viewer-canvas');
  var pdpData = window.JJ_PRODUCT_DATA;
  var isProductPage = !!pdpCanvas && !!pdpData;

  // Use product page canvas if on product page
  if (isProductPage) {
    canvas = pdpCanvas;
    infoPanel = null; // product page has its own info panel
  }

  if (!canvas) return;
```

Note: this replaces the existing `if (!canvas) return;` on line 16. The existing line should be removed since the new block handles both cases.

- [ ] **Step 2: Add product-page idle parameters**

After the existing `idle` object (around line 71), add:

```javascript
  // Product page: calmer float, less rotation
  var idlePdp = {
    rotSpeed: 0.06,
    bobAmp: 0.03,
    bobPeriod: 3.5,
    tiltXAmp: 0.04,
    tiltZAmp: 0.04,
    tiltXFreq: 0.4,
    tiltZFreq: 0.3,
    time: 0
  };

  if (isProductPage) {
    idle.rotSpeed = idlePdp.rotSpeed;
    idle.bobAmp = idlePdp.bobAmp;
    idle.bobPeriod = idlePdp.bobPeriod;
    idle.tiltXAmp = idlePdp.tiltXAmp;
    idle.tiltZAmp = idlePdp.tiltZAmp;
    idle.tiltXFreq = idlePdp.tiltXFreq;
    idle.tiltZFreq = idlePdp.tiltZFreq;
  }
```

- [ ] **Step 3: Add vinyl disc creation function**

After the `createFallbackTexture` function (around line 233), add the vinyl disc builder:

```javascript
  // ─── Vinyl Disc ─────────────────────────────────────────────────
  var vinylMesh = null;
  var vinylIdleTime = 0;
  var vinylSlideProgress = -1; // -1 = not started, 0→1 = sliding out

  var VINYL_FRAG = [
    'uniform sampler2D uLabel;',
    'uniform float uHasLabel;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv) * 2.0;',
    '',
    '  // Disc shape',
    '  if (dist > 1.0) discard;',
    '',
    '  // Center hole',
    '  if (dist < 0.04) discard;',
    '',
    '  // Label area (40% of radius)',
    '  if (dist < 0.4 && uHasLabel > 0.5) {',
    '    // Map to label texture',
    '    vec2 labelUv = (uv / 0.4) * 0.5 + 0.5;',
    '    gl_FragColor = texture2D(uLabel, labelUv);',
    '    return;',
    '  }',
    '',
    '  // Grooves: concentric rings',
    '  float groove = sin(dist * 200.0) * 0.5 + 0.5;',
    '  float base = 0.02 + groove * 0.03;',
    '  // Slight sheen based on angle',
    '  float angle = atan(uv.y, uv.x);',
    '  float sheen = pow(abs(sin(angle * 2.0 + 1.0)), 8.0) * 0.04;',
    '  vec3 color = vec3(base + sheen);',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function createVinylDisc(labelAUrl, labelBUrl) {
    if (vinylMesh) {
      scene.remove(vinylMesh);
      if (vinylMesh.geometry) vinylMesh.geometry.dispose();
      if (vinylMesh.material) {
        disposeTextures(vinylMesh.material);
        vinylMesh.material.dispose();
      }
      vinylMesh = null;
    }

    var geo = new THREE.CylinderGeometry(0.9, 0.9, 0.02, 32);
    // Rotate so the flat face is visible (face camera)
    geo.rotateX(Math.PI / 2);

    var labelTexA = null;
    var labelTexB = null;
    var hasLabel = 0.0;

    if (labelAUrl) {
      labelTexA = textureLoader.load(labelAUrl);
      labelTexA.minFilter = THREE.NearestFilter;
      labelTexA.magFilter = THREE.NearestFilter;
      hasLabel = 1.0;
    }
    if (labelBUrl) {
      labelTexB = textureLoader.load(labelBUrl);
      labelTexB.minFilter = THREE.NearestFilter;
      labelTexB.magFilter = THREE.NearestFilter;
    }

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: shaderRes },
        uLabel: { value: labelTexA || createFallbackTexture() },
        uHasLabel: { value: hasLabel }
      },
      vertexShader: PS1_VERT,
      fragmentShader: VINYL_FRAG,
      side: THREE.DoubleSide,
      transparent: true
    });

    vinylMesh = new THREE.Mesh(geo, mat);
    // Start hidden behind album cover
    vinylMesh.position.set(0, 0, -0.02);
    vinylMesh.visible = false;
    vinylMesh.userData.labelTexA = labelTexA;
    vinylMesh.userData.labelTexB = labelTexB;
    vinylMesh.userData.currentSide = 'A';
    scene.add(vinylMesh);

    // Start slide-out after a delay
    vinylSlideProgress = 0;
    vinylIdleTime = 0;

    return vinylMesh;
  }

  function updateVinyl(dt) {
    if (!vinylMesh) return;

    // Slide-out animation
    if (vinylSlideProgress >= 0 && vinylSlideProgress < 1) {
      vinylMesh.visible = true;
      vinylSlideProgress += dt / 0.6; // 0.6s duration
      if (vinylSlideProgress > 1) vinylSlideProgress = 1;
      var ease = 1 - Math.pow(1 - vinylSlideProgress, 3); // ease-out cubic
      vinylMesh.position.x = ease * 1.1; // slide right to 50% pulled out
      return;
    }

    // Idle: slow rotation + gentle bob
    vinylIdleTime += dt;
    vinylMesh.rotation.z += dt * (2 * Math.PI / 9); // ~9s per revolution
    vinylMesh.position.y = Math.sin(vinylIdleTime * 0.8) * 0.02; // gentle bob
  }

  function swapVinylLabel(side) {
    if (!vinylMesh) return;
    var mat = vinylMesh.material;
    if (side === 'B' && vinylMesh.userData.labelTexB) {
      mat.uniforms.uLabel.value = vinylMesh.userData.labelTexB;
      vinylMesh.userData.currentSide = 'B';
    } else if (vinylMesh.userData.labelTexA) {
      mat.uniforms.uLabel.value = vinylMesh.userData.labelTexA;
      vinylMesh.userData.currentSide = 'A';
    }
  }
```

- [ ] **Step 4: Call updateVinyl in the animation tick**

In the `tick` function (around line 332), before `renderer.render(scene, camera);`, add:

```javascript
    // Vinyl disc animation (product page only)
    if (isProductPage && vinylMesh) {
      updateVinyl(dt);
    }
```

- [ ] **Step 5: Auto-create model on product page**

At the bottom of the IIFE, before the closing `})();`, add the product page auto-initialization:

```javascript
  // ─── Product Page: Auto-Init ──────────────────────────────────
  if (isProductPage) {
    var frontUrl = pdpData.images[0] || null;
    var backUrl = pdpData.images[1] || null;
    var labelAUrl = pdpData.images[2] || null;
    var labelBUrl = pdpData.images[3] || null;

    createModel({
      title: pdpData.title,
      handle: pdpData.handle,
      imageUrl: frontUrl,
      imageBackUrl: backUrl,
      type3d: 'box',
      available: pdpData.available
    });

    // Create vinyl disc after a short delay (entrance animation)
    if (frontUrl) {
      setTimeout(function () {
        createVinylDisc(labelAUrl, labelBUrl);
      }, 500);
    }

    // Listen for thumbnail clicks
    document.addEventListener('jj:pdp-thumb-selected', function (e) {
      var idx = e.detail.index;
      if (idx === 0 && currentModel) {
        // Flip to front
        currentModel.rotation.y = 0;
        swapVinylLabel('A');
      } else if (idx === 1 && currentModel) {
        // Flip to back
        currentModel.rotation.y = Math.PI;
        swapVinylLabel('B');
      } else if (idx === 2) {
        swapVinylLabel('A');
      } else if (idx === 3) {
        swapVinylLabel('B');
      }
    });
  }
```

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-product-viewer.js
git commit -m "feat(product): product page mode + procedural vinyl disc in viewer"
```

---

### Task 8: Wire Everything in theme.liquid

**Files:**
- Modify: `layout/theme.liquid` — conditional CSS/JS includes, hide homepage-only elements on product page

- [ ] **Step 1: Add product page conditional to hide homepage UI**

In `layout/theme.liquid`, find the product zone div (around line 145):

```html
  {%- comment -%} Left zone: product viewer + info {%- endcomment -%}
  <div class="jj-product-zone" id="jj-product-zone">
```

Wrap the product zone, ring carousel, and header group in a template check. Replace lines 144-194:

```liquid
  {% unless template == 'product' %}
  {%- comment -%} Left zone: product viewer + info (homepage only) {%- endcomment -%}
  <div class="jj-product-zone" id="jj-product-zone">
    <canvas id="jj-viewer-canvas" aria-label="3D product viewer"></canvas>
    <div class="jj-product-info" id="jj-product-info" data-parallax-layer style="display:none;">
      <div class="jj-product-info__artist" id="jj-pi-artist"></div>
      <div class="jj-product-info__jp-name" id="jj-pi-jp-name"></div>
      <div class="jj-product-info__title" id="jj-pi-title"></div>
      <div class="jj-product-info__jp-title" id="jj-pi-jp-title"></div>
      <div class="jj-product-info__meta" id="jj-pi-meta"></div>
      <div class="jj-product-info__price" id="jj-pi-price"></div>
      <div class="jj-product-info__actions" id="jj-pi-actions">
        <button class="jj-action-btn" id="jj-pi-add-to-cart" disabled>[Add to Cart]</button>
        <a class="jj-action-btn" id="jj-pi-view" href="#" style="display:none;">[View]</a>
        <input type="hidden" id="jj-pi-variant-id" value="">
      </div>
    </div>
    {%- comment -%} Tsuno Daishi greeting bubble {%- endcomment -%}
    <div id="jj-tsuno-bubble" class="jj-tsuno-bubble" aria-hidden="true"
         data-audio-src="{{ 'tsunogreetings.mp3' | asset_url }}">
      <span class="jj-tsuno-bubble__text"></span>
    </div>
  </div>

  {%- comment -%} Ring carousel: full-viewport album cover arc {%- endcomment -%}
  <div class="jj-ring" id="jj-ring" role="listbox" aria-roledescription="carousel" aria-label="Product catalog">
    <div class="jj-ring__bar" data-parallax-layer>
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

  {%- comment -%} Header group (navigation, store links) {%- endcomment -%}
  {% sections 'header-group' %}
  {% endunless %}
```

- [ ] **Step 2: Conditionally load homepage-only scripts**

Find the script includes for `japanjunky-ring-carousel.js` and `japanjunky-product-viewer.js`. Wrap the homepage-only scripts:

The ring carousel should only load on the homepage. Find:

```liquid
  <script src="{{ 'japanjunky-ring-carousel.js' | asset_url }}" defer></script>
```

Replace with:

```liquid
  {% unless template == 'product' %}
  <script src="{{ 'japanjunky-ring-carousel.js' | asset_url }}" defer></script>
  {% endunless %}
```

The product viewer JS loads on both pages (it handles both homepage and product page mode), so leave it unchanged.

- [ ] **Step 3: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(product): conditional homepage/product page UI in theme.liquid"
```

---

### Task 9: Visual Tuning + Integration Test

**Files:**
- Modify: any file as needed for visual adjustments

- [ ] **Step 1: Test homepage → product page transition**

Open the site. Select a product from the ring carousel. Click [View]. Verify:
1. Tsuno moves toward the product viewer area
2. After ~0.5s, browser navigates to `/products/{handle}`
3. View Transitions API animates the page change (catalog bar flies up, carousel flies down, info panel slides out left)
4. Product page loads with portal at shifted camera angle
5. Info panel slides in from left
6. Product viewer canvas fades in with product graphic
7. Vinyl disc slides out to the right after ~0.5s delay

- [ ] **Step 2: Test product page functionality**

On the product page, verify:
1. Variant buttons switch and update price/availability/condition
2. Add to Cart works (AJAX, shows [OK])
3. Thumbnail strip — clicking image 1 flips cover to front, image 2 flips to back
4. Thumbnail strip — clicking image 3/4 swaps vinyl label
5. Product graphic is draggable/flippable (same as homepage)
6. Vinyl rotates slowly with gentle bob
7. Back button [← Catalog] navigates home

- [ ] **Step 3: Test Firefox fallback**

Open in Firefox. Click [View]. Verify:
1. Instant navigation (no exit animation)
2. Product page entrance animations still play
3. All product page functionality works

- [ ] **Step 4: Test no-JS fallback**

Disable JavaScript. Navigate to a product URL directly. Verify:
1. Static product info renders (title, image, price, description)
2. Standard add-to-cart form works

- [ ] **Step 5: Tune camera preset if needed**

If the portal angle on the product page doesn't look right, adjust the `CAMERA_PRESETS.product` values in `japanjunky-screensaver.js`:

```javascript
    product: { pos: [-3, 0.5, -1], look: [2, 0, 30] }
```

Try variations:
- More offset: `pos: [-4, 0.5, -1]`
- Less offset: `pos: [-2, 0.3, -1]`
- Different look: `look: [1.5, 0, 28]`

- [ ] **Step 6: Tune vinyl disc appearance if needed**

If the vinyl grooves are too dense/sparse, adjust `dist * 200.0` in `VINYL_FRAG`. If the label is too small/large, adjust the `0.4` radius in the label check.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(product): product page template — complete"
```

---
