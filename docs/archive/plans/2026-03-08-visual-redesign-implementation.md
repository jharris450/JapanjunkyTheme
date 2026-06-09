# Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform JapanJunky from a generic retro terminal store into a purpose-built catalog application with authentic CRT display characteristics, format-coded phosphor colors, auto-dithered product images, and restrained Japanese data elements.

**Architecture:** Shopify theme (Liquid + CSS + JS). All changes are to existing theme files in `assets/`, `snippets/`, `sections/`, `layout/`, `config/`, and `templates/`. One new JS file (`japanjunky-dither.js`) for client-side image dithering. No build tools, no npm — all vanilla JS/CSS served as Shopify assets.

**Tech Stack:** Liquid templates, vanilla CSS (no preprocessor), vanilla JS (ES5-compatible IIFEs), Shopify theme architecture.

**Design doc:** `docs/plans/2026-03-08-visual-redesign-design.md`

---

## Task 1: Remove Matrix Rain

Strip the matrix rain canvas, its JS, configuration, and Shopify settings. Replace with pure black void.

**Files:**
- Modify: `layout/theme.liquid` (lines 58-73, 77-79, 91)
- Modify: `assets/japanjunky-base.css` (lines 83-93)
- Modify: `config/settings_data.json` (lines 9-11, 13)
- Modify: `assets/japanjunky-parallax.js` (entire file — matrix rain portion lines 11-87)

**Step 1: Remove matrix rain from theme.liquid**

In `layout/theme.liquid`, remove the matrix rain config block (lines 58-65):

```liquid
  {% if settings.matrix_rain_enabled %}
    <script>
      window.JJ_MATRIX_CONFIG = {
        speed: {{ settings.matrix_rain_speed }},
        opacity: {{ settings.matrix_rain_opacity | divided_by: 100.0 }}
      };
    </script>
  {% endif %}
```

Remove the canvas element (lines 77-79):

```liquid
  {% if settings.matrix_rain_enabled %}
    <canvas id="jj-matrix-canvas" aria-hidden="true"></canvas>
  {% endif %}
```

Remove the `--jj-matrix-opacity` CSS variable from the `:root` style block (line 24):

```css
      --jj-matrix-opacity: {{ settings.matrix_rain_opacity | divided_by: 100.0 }};
```

**Step 2: Remove matrix canvas CSS**

In `assets/japanjunky-base.css`, remove the `#jj-matrix-canvas` rule block (lines 83-93):

```css
#jj-matrix-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  opacity: var(--jj-matrix-opacity, 0.15);
}
```

**Step 3: Strip matrix rain from parallax JS**

In `assets/japanjunky-parallax.js`, remove the entire `initMatrixRain` function and its invocation (lines 11-87). Keep only the parallax section (lines 89-142) plus the IIFE wrapper. The file becomes parallax-only.

**Step 4: Clean up settings_data.json**

In `config/settings_data.json`, remove:
- `"matrix_rain_enabled": true,`
- `"matrix_rain_opacity": 15,`
- `"matrix_rain_speed": 50,`

**Step 5: Verify and commit**

Open the site in browser. Confirm: pure black background, no canvas element in DOM, no JS errors in console, parallax still works if enabled.

```bash
git add layout/theme.liquid assets/japanjunky-base.css assets/japanjunky-parallax.js config/settings_data.json
git commit -m "Remove matrix rain canvas for pure CRT black void"
```

---

## Task 2: Strengthen CRT Vignette

Deepen the vignette to make the "tube shape" more present.

**Files:**
- Modify: `assets/japanjunky-crt.css` (lines 43-62)

**Step 1: Adjust vignette gradient**

In `assets/japanjunky-crt.css`, in the `.jj-crt-frame::after` rule, change the radial-gradient from `transparent 55%` to `transparent 50%`:

```css
/* Before */
transparent 55%,
rgba(0, 0, 0, 0.35) 100%

/* After */
transparent 50%,
rgba(0, 0, 0, 0.4) 100%
```

**Step 2: Verify and commit**

Open browser. Confirm: corners/edges are slightly darker, center content unaffected, no readability impact.

```bash
git add assets/japanjunky-crt.css
git commit -m "Strengthen CRT vignette for deeper tube shape"
```

---

## Task 3: Phosphor Dot Overlay on Product Images

Add a faint RGB subpixel grid pattern over product thumbnails and detail images via CSS pseudo-elements.

**Files:**
- Modify: `assets/japanjunky-crt.css` (append new rules)
- Modify: `assets/japanjunky-homepage.css` (`.jj-thumb-img` needs `position: relative` — already has it implicitly via flex)

**Step 1: Add phosphor dot pattern CSS**

Append to `assets/japanjunky-crt.css`, before the `/* ===== REDUCED MOTION ===== */` section:

```css
/* ===== PHOSPHOR DOT OVERLAY (product images only) ===== */

.jj-thumb-img,
.jj-detail-image {
  position: relative;
}

.jj-thumb-img::after,
.jj-detail-image::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(
      to right,
      rgba(255, 0, 0, 0.03) 0px,
      rgba(255, 0, 0, 0.03) 1px,
      rgba(0, 255, 0, 0.03) 1px,
      rgba(0, 255, 0, 0.03) 2px,
      rgba(0, 0, 255, 0.03) 2px,
      rgba(0, 0, 255, 0.03) 3px
    );
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: screen;
}
```

**Step 2: Add chromatic aberration on image borders**

Append to the same section in `assets/japanjunky-crt.css`:

```css
/* Chromatic aberration — subtle color fringe on image containers */
.jj-thumb-img {
  box-shadow:
    -1px 0 0 rgba(255, 0, 0, 0.15),
     1px 0 0 rgba(0, 0, 255, 0.15);
}

.jj-detail-image {
  box-shadow:
    -1px 0 0 rgba(255, 0, 0, 0.12),
     1px 0 0 rgba(0, 0, 255, 0.12);
}
```

**Step 3: Ensure detail-image ::after doesn't conflict**

In `assets/japanjunky-homepage.css`, the existing `.jj-detail-image::after` rule (line 532-534) is set to `content: none`. Remove that rule so the new phosphor overlay can work:

```css
/* Remove this block */
.jj-detail-image::after {
  content: none;
}
```

**Step 4: Verify and commit**

Open browser. Inspect a product thumbnail closely — you should see very faint vertical RGB stripes. On the detail pane image, same effect. Both containers should show a subtle red/blue color shift at left/right edges. Effect should be barely perceptible at normal viewing distance.

```bash
git add assets/japanjunky-crt.css assets/japanjunky-homepage.css
git commit -m "Add phosphor dot overlay and chromatic aberration on product images"
```

---

## Task 4: Phosphor Decay Transitions

Add a 0.15s ease-out phosphor decay when deselecting table rows and transitioning detail pane content.

**Files:**
- Modify: `assets/japanjunky-homepage.css` (table row styles around lines 394-402)
- Modify: `assets/japanjunky-crt.css` (append phosphor decay keyframes)

**Step 1: Add phosphor decay keyframe**

Append to `assets/japanjunky-crt.css`, before the reduced motion section:

```css
/* Phosphor decay — afterglow fade on deselection */
@keyframes jj-phosphor-decay {
  0%   { opacity: 1; filter: brightness(1.15); }
  100% { opacity: 1; filter: brightness(1); }
}

.jj-phosphor-decay {
  animation: jj-phosphor-decay 0.15s ease-out forwards;
}
```

**Step 2: Add transition to table row selection**

In `assets/japanjunky-homepage.css`, modify the existing `tbody tr` rule (line 397) to add a transition on box-shadow and border:

```css
/* Before */
.jj-product-table tbody tr {
  border-bottom: 1px solid #1a1a1a;
  cursor: default;
  transition: background 0.06s;
  height: 86px;
}

/* After */
.jj-product-table tbody tr {
  border-bottom: 1px solid #1a1a1a;
  cursor: default;
  transition: background 0.06s, box-shadow 0.15s ease-out, border-left-color 0.15s ease-out;
  height: 86px;
  border-left: 2px solid transparent;
}
```

**Step 3: Update reduced motion section**

In `assets/japanjunky-crt.css`, inside the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
  .jj-phosphor-decay {
    animation: none;
  }
```

**Step 4: Verify and commit**

Open browser. Click a row to select it, then click a different row. The previous row's highlight should fade out smoothly (0.15s) rather than snapping off. No jank.

```bash
git add assets/japanjunky-homepage.css assets/japanjunky-crt.css
git commit -m "Add phosphor decay transitions on row deselection"
```

---

## Task 5: Format-Coded Phosphor Colors — CSS

Set up the format-to-color mapping as CSS data-attribute selectors on table rows.

**Files:**
- Modify: `assets/japanjunky-homepage.css` (append format color rules)

**Step 1: Add format color rules**

Append to `assets/japanjunky-homepage.css`, after the existing table row styles:

```css
/* ===== FORMAT-CODED PHOSPHOR COLORS ===== */

/* Left border by format — data-product-format set via Liquid */
.jj-product-table tbody tr[data-product-format="vinyl"] {
  border-left-color: var(--jj-amber);
}
.jj-product-table tbody tr[data-product-format="cd"] {
  border-left-color: var(--jj-cyan);
}
.jj-product-table tbody tr[data-product-format="cassette"] {
  border-left-color: var(--jj-green);
}
.jj-product-table tbody tr[data-product-format="minidisc"] {
  border-left-color: var(--jj-magenta);
}
.jj-product-table tbody tr[data-product-format="hardware"] {
  border-left-color: var(--jj-white);
}

/* Format cell text tint */
tr[data-product-format="vinyl"] .jj-cell-format { color: var(--jj-amber); }
tr[data-product-format="cd"] .jj-cell-format { color: var(--jj-cyan); }
tr[data-product-format="cassette"] .jj-cell-format { color: var(--jj-green); }
tr[data-product-format="minidisc"] .jj-cell-format { color: var(--jj-magenta); }
tr[data-product-format="hardware"] .jj-cell-format { color: var(--jj-white); }

/* Selected row — intensify format glow */
.jj-product-table tbody tr[data-product-format="vinyl"].jj-row-selected {
  box-shadow: inset 3px 0 0 var(--jj-amber), 0 0 8px rgba(255, 170, 0, 0.1);
}
.jj-product-table tbody tr[data-product-format="cd"].jj-row-selected {
  box-shadow: inset 3px 0 0 var(--jj-cyan), 0 0 8px rgba(0, 229, 229, 0.1);
}
.jj-product-table tbody tr[data-product-format="cassette"].jj-row-selected {
  box-shadow: inset 3px 0 0 var(--jj-green), 0 0 8px rgba(51, 255, 51, 0.1);
}
.jj-product-table tbody tr[data-product-format="minidisc"].jj-row-selected {
  box-shadow: inset 3px 0 0 var(--jj-magenta), 0 0 8px rgba(224, 64, 224, 0.1);
}
.jj-product-table tbody tr[data-product-format="hardware"].jj-row-selected {
  box-shadow: inset 3px 0 0 var(--jj-white), 0 0 8px rgba(224, 224, 224, 0.1);
}

/* Hover — brief format color flash on left border */
.jj-product-table tbody tr[data-product-format]:hover {
  border-left-width: 2px;
}
```

**Step 2: Update existing selected row rule**

In `assets/japanjunky-homepage.css`, modify the existing `.jj-row-selected` rule (line 401) to remove the hardcoded red box-shadow (the format-specific rules above take over):

```css
/* Before */
.jj-product-table tbody tr.jj-row-selected { background: #111; box-shadow: inset 3px 0 0 var(--jj-primary), 0 0 8px rgba(232, 49, 58, 0.1); }

/* After — fallback for rows without a format */
.jj-product-table tbody tr.jj-row-selected { background: #111; box-shadow: inset 3px 0 0 var(--jj-primary), 0 0 8px rgba(232, 49, 58, 0.1); }
```

Keep the existing rule as-is — it acts as the default fallback. The `[data-product-format]` attribute selectors are more specific and will override when a format is present.

**Step 3: Verify and commit**

No visual change yet — the `data-product-format` attribute doesn't exist on rows. This just lays the CSS groundwork. Verify no CSS errors.

```bash
git add assets/japanjunky-homepage.css
git commit -m "Add format-coded phosphor color CSS rules for table rows"
```

---

## Task 6: Format-Coded Phosphor Colors — Liquid Data Attributes

Add `data-product-format` attribute to product table rows. The format is derived from the product type, normalized to lowercase.

**Files:**
- Modify: `snippets/product-table-row.liquid` (line 27, add attribute)

**Step 1: Add format detection logic and data attribute**

In `snippets/product-table-row.liquid`, after the condition extraction block (after line 25), add format normalization:

```liquid
  {%- comment -%} Normalize product type to format key {%- endcomment -%}
  {%- assign p_type_lower = product.type | downcase -%}
  {%- assign p_format = '' -%}
  {%- if p_type_lower contains 'vinyl' or p_type_lower contains 'lp' or p_type_lower contains 'record' -%}
    {%- assign p_format = 'vinyl' -%}
  {%- elsif p_type_lower contains 'cd' or p_type_lower contains 'compact disc' -%}
    {%- assign p_format = 'cd' -%}
  {%- elsif p_type_lower contains 'cassette' or p_type_lower contains 'tape' -%}
    {%- assign p_format = 'cassette' -%}
  {%- elsif p_type_lower contains 'minidisc' or p_type_lower contains 'mini disc' or p_type_lower contains 'md' -%}
    {%- assign p_format = 'minidisc' -%}
  {%- elsif p_type_lower contains 'hardware' or p_type_lower contains 'player' or p_type_lower contains 'walkman' or p_type_lower contains 'stereo' -%}
    {%- assign p_format = 'hardware' -%}
  {%- endif -%}
```

Then on the `<tr>` tag (line 27), add the attribute:

```liquid
      data-product-format="{{ p_format }}"
```

**Step 2: Add format glyph to the format cell**

In `snippets/product-table-row.liquid`, replace the format cell (line 61):

```liquid
    <!-- Before -->
    <td class="jj-cell-format">{{ product.type | default: '---' }}</td>

    <!-- After -->
    <td class="jj-cell-format">
      {%- case p_format -%}
        {%- when 'vinyl' -%}○
        {%- when 'cd' -%}◎
        {%- when 'cassette' -%}▭
        {%- when 'minidisc' -%}◇
        {%- when 'hardware' -%}▪
      {%- endcase -%}
      {{ product.type | default: '---' }}
    </td>
```

**Step 3: Verify and commit**

Open browser. Product rows should now have colored left borders matching their format. The format column should show the appropriate glyph + text in the matching phosphor color. Rows without a recognized format fall back to transparent left border and white text.

```bash
git add snippets/product-table-row.liquid
git commit -m "Add format detection, data attributes, and glyphs to product rows"
```

---

## Task 7: Tighten Table Density

Reduce row height from 86px to ~64px and thumbnails from 80x80 to 56x56. Drop product name bold weight.

**Files:**
- Modify: `assets/japanjunky-homepage.css` (lines 398, 416, 419-420, 427, 438)
- Modify: `snippets/product-table-row.liquid` (lines 44, 47-48 for img dimensions)

**Step 1: Update CSS dimensions**

In `assets/japanjunky-homepage.css`:

Change row height (line 398):
```css
/* Before */
height: 86px;
/* After */
height: 64px;
```

Change thumbnail size (lines 419-420):
```css
/* Before */
  width: 80px;
  height: 80px;
/* After */
  width: 56px;
  height: 56px;
```

Change product name weight (line 438):
```css
/* Before */
.jj-cell-name { ... font-weight: 700; ... }
/* After */
.jj-cell-name { ... font-weight: 400; ... }
```

**Step 2: Update Liquid image dimensions**

In `snippets/product-table-row.liquid`, update the image tag (lines 44, 47-48):

```liquid
<!-- Before -->
src="{{ product.featured_image | image_url: width: 160 }}"
width="80"
height="80"

<!-- After -->
src="{{ product.featured_image | image_url: width: 112 }}"
width="56"
height="56"
```

**Step 3: Update colgroup in homepage body**

In `sections/jj-homepage-body.liquid`, update the first col width (line 17):

```liquid
<!-- Before -->
<col style="width:86px;">
<!-- After -->
<col style="width:62px;">
```

**Step 4: Verify and commit**

Open browser. Rows should be noticeably denser — more products visible in the viewport. Thumbnails smaller but still clear. Product names should be normal weight, relying on cream color for readability against black.

```bash
git add assets/japanjunky-homepage.css snippets/product-table-row.liquid sections/jj-homepage-body.liquid
git commit -m "Tighten table density: 64px rows, 56px thumbs, normal-weight names"
```

---

## Task 8: Auto-Dithering JS Pipeline

Create the client-side canvas dithering system that processes all product images uniformly.

**Files:**
- Create: `assets/japanjunky-dither.js`
- Modify: `layout/theme.liquid` (add script tag)

**Step 1: Write the dithering module**

Create `assets/japanjunky-dither.js`:

```javascript
/**
 * Japanjunky - Auto-Dither Pipeline
 *
 * Client-side ordered (Bayer) dithering for product images.
 * Applied to all images inside .jj-thumb-img and .jj-detail-image containers.
 * Uses offscreen canvas to process, replaces src with data URL.
 */

(function () {
  'use strict';

  // 4x4 Bayer threshold matrix (normalized to 0-255)
  var BAYER_4x4 = [
    [  0, 128,  32, 160],
    [192,  64, 224,  96],
    [ 48, 176,  16, 144],
    [240, 112, 208,  80]
  ];

  var MATRIX_SIZE = 4;
  var COLOR_LEVELS = 4; // Number of quantization levels per channel

  /**
   * Apply ordered dithering to an image element.
   * Draws to offscreen canvas, processes pixels, writes back as data URL.
   */
  function ditherImage(img) {
    if (!img || !img.naturalWidth || img.dataset.dithered === 'true') return;

    var w = img.naturalWidth;
    var h = img.naturalHeight;

    // Cap processing size for performance
    var maxDim = 480;
    var scale = 1;
    if (w > maxDim || h > maxDim) {
      scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, w, h);

    var imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      // CORS — can't dither cross-origin images without proxy
      // Mark as attempted so we don't retry
      img.dataset.dithered = 'failed';
      return;
    }

    var data = imageData.data;
    var step = 256 / COLOR_LEVELS;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var threshold = BAYER_4x4[y % MATRIX_SIZE][x % MATRIX_SIZE];
        var bias = (threshold / 255 - 0.5) * step;

        for (var c = 0; c < 3; c++) {
          var val = data[idx + c] + bias;
          data[idx + c] = Math.round(Math.max(0, Math.min(255, val)) / step) * step;
        }
        // Alpha stays unchanged
      }
    }

    ctx.putImageData(imageData, 0, 0);

    img.src = canvas.toDataURL('image/png');
    img.dataset.dithered = 'true';
  }

  /**
   * Process all product images currently in the DOM.
   */
  function ditherAll() {
    var containers = document.querySelectorAll('.jj-thumb-img img, .jj-detail-image img');
    containers.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        ditherImage(img);
      } else {
        img.addEventListener('load', function () {
          ditherImage(img);
        }, { once: true });
      }
    });
  }

  /**
   * Dither a single image element (called from product-select.js
   * when the detail pane image changes).
   */
  function ditherSingle(img) {
    if (!img) return;
    img.dataset.dithered = '';
    if (img.complete && img.naturalWidth > 0) {
      ditherImage(img);
    } else {
      img.addEventListener('load', function () {
        ditherImage(img);
      }, { once: true });
    }
  }

  // Expose for use by product-select.js
  window.JJ_Dither = {
    ditherAll: ditherAll,
    ditherSingle: ditherSingle
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ditherAll);
  } else {
    ditherAll();
  }

  // Observe for dynamically added images (lazy load, AJAX)
  if (window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      var needsDither = false;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG' && node.closest('.jj-thumb-img, .jj-detail-image')) {
              needsDither = true;
            } else if (node.querySelector && node.querySelector('.jj-thumb-img img, .jj-detail-image img')) {
              needsDither = true;
            }
          }
        });
      });
      if (needsDither) ditherAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
```

**Step 2: Add script to theme.liquid**

In `layout/theme.liquid`, add the dither script BEFORE the product-select script (so `JJ_Dither` is available). Add after the cursor-light script (line 91):

```liquid
  <script src="{{ 'japanjunky-dither.js' | asset_url }}" defer></script>
```

The script order should be:
1. `japanjunky-cursor-light.js`
2. `japanjunky-dither.js`
3. `japanjunky-parallax.js`
4. `japanjunky-product-select.js`
5. `japanjunky-win95-menu.js`

**Step 3: Hook dithering into product-select.js**

In `assets/japanjunky-product-select.js`, after the image is set in the detail pane (around line 120, after `triggerClass(elVisual, 'jj-img-rendering');`), add:

```javascript
      // Auto-dither the detail image
      if (window.JJ_Dither) {
        window.JJ_Dither.ditherSingle(elVisual);
      }
```

Also after `elVisual.src = imageUrl;` on line 117, add the same call.

**Step 4: Verify and commit**

Open browser. Product thumbnails should show ordered dithering (visible banding/pattern in gradients, reduced color palette). When clicking a product, the detail pane image should also get dithered after loading. Console should show no errors. Images from Shopify CDN may hit CORS — if so, the dither gracefully skips (marked `failed`).

```bash
git add assets/japanjunky-dither.js layout/theme.liquid assets/japanjunky-product-select.js
git commit -m "Add client-side auto-dithering pipeline for product images"
```

---

## Task 9: Win95 Titlebar Text

Change the window titlebar to display the application name.

**Files:**
- Modify: `sections/jj-header.liquid`

**Step 1: Update the nav bar label**

In `sections/jj-header.liquid`, the nav bar currently shows `C:\>` icon + `find` label. The titlebar concept should appear in the store header or as a window frame. The simplest approach: update the store header to include the application name.

Actually, looking at the existing structure, the `jj-nav-bar` functions as the window titlebar (topmost bar). Change the label text (line 4):

```liquid
<!-- Before -->
<span class="jj-nav-bar__label">find</span>

<!-- After -->
<span class="jj-nav-bar__label">JAPANJUNKY — Catalog</span>
```

And change the prompt to not duplicate (line 3):

```liquid
<!-- Before -->
<span class="jj-nav-bar__icon jj-glow--green">C:\&gt;</span>

<!-- After -->
<span class="jj-nav-bar__icon jj-glow--green">&gt;_</span>
```

Remove the `/i` separator since the search bar stands on its own (line 5):

```liquid
<!-- Before -->
<span class="jj-nav-bar__sep">/i</span>

<!-- After (remove this line entirely) -->
```

**Step 2: Verify and commit**

Open browser. Top bar should read `>_ JAPANJUNKY — Catalog` followed by the search input and action buttons.

```bash
git add sections/jj-header.liquid
git commit -m "Update titlebar to show JAPANJUNKY — Catalog application name"
```

---

## Task 10: Clock Date Popover

Add a clickable date popover to the taskbar clock, Win95-style.

**Files:**
- Modify: `snippets/win95-clock.liquid`
- Modify: `assets/japanjunky-win95.css` (append popover styles)
- Modify: `assets/japanjunky-win95-menu.js` (add popover toggle logic)

**Step 1: Update clock markup**

Replace the contents of `snippets/win95-clock.liquid`:

```liquid
{%- comment -%}
  JST clock display for the Win95 taskbar tray.
  Time is updated by japanjunky-win95-menu.js
  Click clock to show date popover.
{%- endcomment -%}

<div class="jj-clock-tray" id="jj-clock-tray">
  <span class="jj-clock-tray__time" id="jj-clock">--:--</span>
  <div class="jj-clock-popover" id="jj-clock-popover">
    <div class="jj-clock-popover__date" id="jj-popover-date">--/--/----</div>
  </div>
</div>
```

**Step 2: Add popover CSS**

Append to `assets/japanjunky-win95.css`:

```css
/* --- Clock Date Popover --- */
.jj-clock-tray {
  position: relative;
  cursor: default;
}

.jj-clock-popover {
  display: none;
  position: absolute;
  bottom: 100%;
  right: 0;
  background: var(--jj-bg-panel, #0a0a0a);
  border: 1px solid #444;
  padding: 6px 12px;
  margin-bottom: 4px;
  white-space: nowrap;
  z-index: 2000;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--jj-text);
}

.jj-clock-popover--open {
  display: block;
}

.jj-clock-popover__date {
  text-align: center;
}
```

**Step 3: Add popover JS logic**

In `assets/japanjunky-win95-menu.js`, after the clock `setInterval` call (after line 87), add the popover toggle:

```javascript
  // ─── Clock Date Popover ───────────────────────────────────
  var clockTray = document.getElementById('jj-clock-tray');
  var clockPopover = document.getElementById('jj-clock-popover');
  var popoverDateEl = document.getElementById('jj-popover-date');

  if (clockTray && clockPopover) {
    clockTray.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = clockPopover.classList.toggle('jj-clock-popover--open');

      if (isOpen && popoverDateEl) {
        try {
          var now = new Date();
          var dayName = now.toLocaleDateString('en-US', {
            timeZone: 'Asia/Tokyo',
            weekday: 'long'
          });
          var month = now.toLocaleDateString('en-US', {
            timeZone: 'Asia/Tokyo',
            month: 'long'
          });
          var day = now.toLocaleDateString('en-US', {
            timeZone: 'Asia/Tokyo',
            day: 'numeric'
          });
          popoverDateEl.textContent = dayName + ', ' + month + ' ' + day + ', ' + retroYear;
        } catch (err) {
          popoverDateEl.textContent = retroYear;
        }
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!clockTray.contains(e.target)) {
        clockPopover.classList.remove('jj-clock-popover--open');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        clockPopover.classList.remove('jj-clock-popover--open');
      }
    });
  }
```

**Step 4: Update the clock display to remove inline date**

In `assets/japanjunky-win95-menu.js`, in the `updateClock` function, remove the date display from the clock tray itself. The date now only shows in the popover. Remove lines 62-68 (the `if (dateEl)` blocks) and the `dateEl` variable (line 45).

The clock tray should just show time: `14:35`

**Step 5: Verify and commit**

Open browser. Click the clock in the taskbar. A small popover should appear above it showing something like `Saturday, March 8, 2003` (with randomized year). Click outside or press Escape to dismiss. Click clock again to toggle.

```bash
git add snippets/win95-clock.liquid assets/japanjunky-win95.css assets/japanjunky-win95-menu.js
git commit -m "Add clock date popover with randomized retrofuture year"
```

---

## Task 11: Active Tab Glow

Add subtle text glow to the active taskbar tab.

**Files:**
- Modify: `assets/japanjunky-win95.css` (lines 102-107, the `.jj-taskbar-tab--active` rule)

**Step 1: Update active tab style**

In `assets/japanjunky-win95.css`, modify the `.jj-taskbar-tab--active` rule:

```css
/* Before */
.jj-taskbar-tab--active {
  background: #111;
  border-color: #444;
  color: var(--jj-text);
  text-shadow: 0 0 4px rgba(212, 201, 168, 0.3);
}

/* After */
.jj-taskbar-tab--active {
  background: #111;
  border-color: #555;
  color: var(--jj-text);
  text-shadow: 0 0 4px rgba(212, 201, 168, 0.4), 0 0 8px rgba(212, 201, 168, 0.15);
}
```

**Step 2: Verify and commit**

Open browser. The active taskbar tab should have a slightly more visible warm glow compared to inactive tabs. Subtle but distinguishable.

```bash
git add assets/japanjunky-win95.css
git commit -m "Add phosphor glow to active taskbar tab"
```

---

## Task 12: Format Color in Detail Pane Header

When a product is selected, the detail pane header border picks up the format's phosphor color.

**Files:**
- Modify: `assets/japanjunky-product-select.js` (in the row click handler)
- Modify: `assets/japanjunky-homepage.css` (add detail header border-left rule)

**Step 1: Add CSS for detail header format border**

Append to `assets/japanjunky-homepage.css`:

```css
/* Detail pane header picks up format color */
.jj-detail-header {
  border-left: 2px solid transparent;
  transition: border-left-color 0.15s ease-out;
}
```

**Step 2: Update product-select.js to set format color on header**

In `assets/japanjunky-product-select.js`, inside the row click handler, after the header text update (around line 158), add:

```javascript
    // Format color on detail header
    if (elHeader) {
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
```

**Step 3: Verify and commit**

Open browser. Click a product. The detail pane header should show a 2px left border in the product's format color. Switching between products of different formats should transition smoothly.

```bash
git add assets/japanjunky-homepage.css assets/japanjunky-product-select.js
git commit -m "Detail pane header picks up format phosphor color on selection"
```

---

## Task 13: Keyboard Navigation for Product Table

Arrow keys move selection up/down, Enter opens product page.

**Files:**
- Modify: `assets/japanjunky-product-select.js` (replace existing limited keydown handler)

**Step 1: Replace keyboard handler**

In `assets/japanjunky-product-select.js`, replace the existing keyboard handler (lines 242-251) with:

```javascript
  // ─── Keyboard Navigation ──────────────────────────────────
  document.addEventListener('keydown', function (e) {
    // Only handle arrow keys and Enter when no input/textarea is focused
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
```

**Step 2: Verify and commit**

Open browser. Press Arrow Down — first product should select. Continue pressing — selection moves through rows. Arrow Up goes backwards. Wraps around at ends. Enter on a selected row navigates to product page. Typing in search input does NOT trigger navigation.

```bash
git add assets/japanjunky-product-select.js
git commit -m "Add arrow key navigation and Enter-to-open for product table"
```

---

## Task 14: Filter Sidebar — Format Section with Phosphor Colors

Restyle the format filter section to use phosphor-colored labels.

**Files:**
- Modify: `snippets/category-list.liquid` (the format section, lines 30-51)

**Step 1: Update format filter section**

In `snippets/category-list.liquid`, replace the "dir /format" section (lines 30-51) with phosphor-colored format items:

```liquid
{%- comment -%} FORMAT with phosphor colors {%- endcomment -%}
<div class="jj-sidebar-section">
  <div class="jj-sidebar-section__title">dir /format</div>
  <ul class="jj-filter-list">
    {%- assign types_seen = '' -%}
    {%- assign featured = section.settings.collection | default: collections['all'] -%}
    {%- for product in featured.products limit: 50 -%}
      {%- if product.type != blank -%}
        {%- unless types_seen contains product.type -%}
          {%- assign types_seen = types_seen | append: product.type | append: '|' -%}
          {%- assign type_lower = product.type | downcase -%}
          {%- if type_lower contains 'vinyl' or type_lower contains 'lp' or type_lower contains 'record' -%}
            <li><span style="color:var(--jj-amber);">○</span> {{ product.type | upcase }}</li>
          {%- elsif type_lower contains 'cd' or type_lower contains 'compact disc' -%}
            <li><span style="color:var(--jj-cyan);">◎</span> {{ product.type | upcase }}</li>
          {%- elsif type_lower contains 'cassette' or type_lower contains 'tape' -%}
            <li><span style="color:var(--jj-green);">▭</span> {{ product.type | upcase }}</li>
          {%- elsif type_lower contains 'minidisc' or type_lower contains 'mini disc' or type_lower contains 'md' -%}
            <li><span style="color:var(--jj-magenta);">◇</span> {{ product.type | upcase }}</li>
          {%- elsif type_lower contains 'hardware' or type_lower contains 'player' or type_lower contains 'walkman' or type_lower contains 'stereo' -%}
            <li><span style="color:var(--jj-white);">▪</span> {{ product.type | upcase }}</li>
          {%- else -%}
            <li>&gt; {{ product.type | upcase }}</li>
          {%- endif -%}
        {%- endunless -%}
      {%- endif -%}
    {%- endfor -%}
    {%- if types_seen == '' -%}
      <li><span style="color:var(--jj-amber);">○</span> VINYL</li>
      <li><span style="color:var(--jj-cyan);">◎</span> CD</li>
      <li><span style="color:var(--jj-green);">▭</span> CASSETTE</li>
      <li><span style="color:var(--jj-magenta);">◇</span> MINIDISC</li>
      <li><span style="color:var(--jj-white);">▪</span> HARDWARE</li>
    {%- endif -%}
  </ul>
</div>
```

**Step 2: Verify and commit**

Open browser. Left sidebar format section should show each format with its phosphor-colored glyph prefix instead of the generic `>` arrow.

```bash
git add snippets/category-list.liquid
git commit -m "Add phosphor-colored format glyphs to sidebar filter section"
```

---

## Task 15: Japanese Title in Detail Pane

Add an original Japanese title field below the romanized product title in the detail pane.

**Files:**
- Modify: `snippets/product-detail-pane.liquid` (after line 25)
- Modify: `assets/japanjunky-homepage.css` (add style for Japanese title)
- Modify: `assets/japanjunky-product-select.js` (populate from product metafield or tag)

**Step 1: Add Japanese title element to markup**

In `snippets/product-detail-pane.liquid`, after the title div (line 25), add:

```liquid
<div class="jj-detail-jp-title" id="jj-detail-jp-title"></div>
```

**Step 2: Add CSS**

Append to `assets/japanjunky-homepage.css`:

```css
/* Japanese original title — data, not decoration */
.jj-detail-jp-title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--jj-muted);
  padding: 0 12px 4px;
  line-height: 1.4;
  min-height: 0;
}
.jj-detail-jp-title:empty {
  display: none;
}
```

**Step 3: Populate from product data**

In `assets/japanjunky-product-select.js`, add a reference to the new element at the top with the other element references (around line 18):

```javascript
  var elJpTitle = document.getElementById('jj-detail-jp-title');
```

Then in the row click handler, after the title typeIn call, populate the Japanese title from product tags. Products can use a tag format like `jp:原題テキスト`:

```javascript
    // Japanese original title from tags
    if (elJpTitle) {
      elJpTitle.textContent = '';
    }
```

And in the fetch callback (inside the `.then(function (product) {` block, around line 177), extract from tags:

```javascript
          // Japanese original title from tags
          if (elJpTitle && product.tags) {
            var jpTag = product.tags.find(function (t) { return t.indexOf('jp:') === 0; });
            if (jpTag) {
              elJpTitle.textContent = '原題: ' + jpTag.substring(3);
            }
          }
```

**Step 4: Verify and commit**

Open browser. Click a product. If the product has a `jp:` tag, the original Japanese title should appear below the romanized title in muted gray. If not, the element stays hidden. No decorative Japanese text anywhere.

```bash
git add snippets/product-detail-pane.liquid assets/japanjunky-homepage.css assets/japanjunky-product-select.js
git commit -m "Add Japanese original title field to detail pane (from product tags)"
```

---

## Task 16: Active Filter Query Display

Add a filter query bar above the product table that shows active filters.

**Files:**
- Modify: `sections/jj-homepage-body.liquid` (add filter bar markup above table)
- Modify: `assets/japanjunky-homepage.css` (add filter bar styles)

**Step 1: Add filter bar markup**

In `sections/jj-homepage-body.liquid`, inside `.jj-center-content` (after line 13), before the table wrap div, add:

```liquid
    <div class="jj-filter-bar" id="jj-filter-bar" style="display:none;">
      <span class="jj-filter-bar__prompt">&gt;</span>
      <span class="jj-filter-bar__tags" id="jj-filter-tags"></span>
      <button class="jj-filter-bar__clear" id="jj-filter-clear">[clear all]</button>
    </div>
```

**Step 2: Add filter bar CSS**

Append to `assets/japanjunky-homepage.css`:

```css
/* ===== ACTIVE FILTER QUERY BAR ===== */
.jj-filter-bar {
  background: var(--jj-bg-panel, #0a0a0a);
  border-bottom: 1px solid #222;
  padding: 4px 12px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--jj-accent);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.jj-filter-bar__prompt {
  color: var(--jj-green);
  text-shadow: 0 0 4px rgba(51, 255, 51, 0.4);
  flex-shrink: 0;
}

.jj-filter-bar__tags {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.jj-filter-tag {
  color: var(--jj-accent);
  cursor: default;
  padding: 0 2px;
}
.jj-filter-tag:hover {
  color: var(--jj-primary);
  text-decoration: line-through;
}

.jj-filter-bar__clear {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--jj-muted);
  cursor: default;
  flex-shrink: 0;
}
.jj-filter-bar__clear:hover {
  color: var(--jj-primary);
}
```

**Step 3: Verify and commit**

The filter bar is hidden by default (`display:none`). It will be shown via JS when client-side filtering is implemented. This task lays the markup and styling groundwork.

```bash
git add sections/jj-homepage-body.liquid assets/japanjunky-homepage.css
git commit -m "Add active filter query bar markup and styles above product table"
```

---

## Task 17: ASCII Art — Empty State

Create an ASCII art empty state for when filters return zero results.

**Files:**
- Create: `snippets/ascii-empty-state.liquid`

**Step 1: Create the snippet**

Create `snippets/ascii-empty-state.liquid`:

```liquid
{%- comment -%}
  ASCII art empty state — shown when no products match filters.
  Western box-drawing characters only. Block chars for shading.
{%- endcomment -%}

<div class="jj-empty-state" aria-label="No results found">
  <pre class="jj-ascii-art" style="color:var(--jj-muted);text-align:center;padding:40px 0;">
   ┌──────────────────────────┐
   │                          │
   │    ░░░░░░░░░░░░░░░░░░    │
   │    ░                  ░    │
   │    ░   ┌──┐  ┌──┐    ░    │
   │    ░   │  │  │  │    ░    │
   │    ░   └──┘  └──┘    ░    │
   │    ░                  ░    │
   │    ░░░░░░░░░░░░░░░░░░    │
   │                          │
   │     NO ITEMS FOUND       │
   │     refine your query    │
   │                          │
   └──────────────────────────┘</pre>
</div>
```

**Step 2: Verify and commit**

This snippet will be rendered dynamically by JS when filter results are empty. For now, just verify the file exists and the ASCII art renders correctly if included manually.

```bash
git add snippets/ascii-empty-state.liquid
git commit -m "Add ASCII art empty state for zero filter results"
```

---

## Task 18: ASCII Art — 404 Page

Create a dedicated 404 page with an expressive ASCII art scene.

**Files:**
- Create: `templates/404.liquid`

**Step 1: Create the 404 template**

Create `templates/404.liquid`:

```liquid
<div class="jj-center-content" style="flex:1;display:flex;align-items:center;justify-content:center;overflow-y:auto;">
  <div style="text-align:center;padding:32px 16px;">
    <pre class="jj-ascii-art" style="color:var(--jj-muted);display:inline-block;text-align:left;" aria-hidden="true">
        ┌────────────────────────────────────┐
        │                                    │
        │   ▓▓▓▓▓▓    ▓▓▓▓▓    ▓▓▓▓▓▓       │
        │   ▓    ▓    ▓   ▓    ▓    ▓       │
        │   ▓▓▓▓▓▓    ▓   ▓    ▓▓▓▓▓▓       │
        │        ▓    ▓   ▓         ▓       │
        │   ▓▓▓▓▓▓    ▓▓▓▓▓    ▓▓▓▓▓▓       │
        │                                    │
        │   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │
        │                                    │
        │   FILE NOT FOUND                   │
        │                                    │
        │   The requested path does not      │
        │   exist in this catalog.           │
        │                                    │
        │   ┌────────────────────────────┐   │
        │   │ > cd /                     │   │
        │   └────────────────────────────┘   │
        │                                    │
        └────────────────────────────────────┘</pre>

    <div style="margin-top:24px;">
      <a href="/" class="jj-win95-btn-sm" style="display:inline-block;">[ Return to Catalog ]</a>
    </div>
  </div>
</div>
```

**Step 2: Verify and commit**

Navigate to a nonexistent URL on the store. Should see the ASCII 404 art centered in the content area, within the Win95 shell frame (taskbar still visible at bottom). The "Return to Catalog" button links home.

```bash
git add templates/404.liquid
git commit -m "Add ASCII art 404 page"
```

---

## Task 19: Responsive — Tablet Layout

Implement the tablet breakpoint: sidebar filters move to start menu, detail pane becomes slide-in overlay.

**Files:**
- Modify: `assets/japanjunky-homepage.css` (update `@media (max-width: 960px)` block)

**Step 1: Update tablet media query**

In `assets/japanjunky-homepage.css`, replace the existing tablet media query (lines 190-193):

```css
/* Before */
@media (max-width: 960px) {
  .jj-catalog-layout { grid-template-columns: 1fr; }
  .jj-left-sidebar, .jj-right-sidebar { border-right: none !important; border-left: none !important; border-bottom: 1px solid #333; }
}

/* After */
@media (max-width: 960px) {
  .jj-catalog-layout {
    grid-template-columns: 1fr;
    position: relative;
  }

  .jj-left-sidebar {
    display: none;
  }

  .jj-right-sidebar {
    position: fixed;
    top: 0;
    right: -320px;
    width: 300px;
    height: 100vh;
    z-index: 500;
    border-left: 1px solid #444;
    background: #000;
    transition: right 0.2s ease-out;
  }

  .jj-right-sidebar.jj-detail-open {
    right: 0;
  }

  /* Hide CAT# and CONDITION columns */
  .jj-product-table th:nth-child(3),
  .jj-product-table td:nth-child(3),
  .jj-product-table th:nth-child(4),
  .jj-product-table td:nth-child(4) {
    display: none;
  }
}
```

**Step 2: Add close button for detail pane overlay**

This needs a small JS addition in `assets/japanjunky-product-select.js`. At the end of the row click handler, after all detail updates, add:

```javascript
    // On tablet: open detail pane overlay
    if (window.innerWidth <= 960 && detailPane) {
      detailPane.classList.add('jj-detail-open');
    }
```

And add a click handler to close the detail pane when clicking outside it on tablet:

```javascript
  // Close detail pane overlay on tablet when clicking outside
  document.addEventListener('click', function (e) {
    if (window.innerWidth <= 960 && detailPane && detailPane.classList.contains('jj-detail-open')) {
      if (!detailPane.contains(e.target) && !tbody.contains(e.target)) {
        detailPane.classList.remove('jj-detail-open');
      }
    }
  });
```

**Step 3: Verify and commit**

Resize browser to <960px. Left sidebar should disappear. Product table fills width. Clicking a row should slide the detail pane in from the right as an overlay. Clicking outside the pane closes it.

```bash
git add assets/japanjunky-homepage.css assets/japanjunky-product-select.js
git commit -m "Tablet layout: hide sidebar, slide-in detail pane overlay"
```

---

## Task 20: Responsive — Mobile Layout

Implement mobile compact list view with full-screen detail panel.

**Files:**
- Modify: `assets/japanjunky-homepage.css` (add `@media (max-width: 600px)` block)

**Step 1: Add mobile media query**

Append to `assets/japanjunky-homepage.css`:

```css
@media (max-width: 600px) {
  /* Compact list: thumbnail + title + format glyph + price */
  .jj-product-table th:nth-child(2),
  .jj-product-table td:nth-child(2),
  .jj-product-table th:nth-child(3),
  .jj-product-table td:nth-child(3),
  .jj-product-table th:nth-child(4),
  .jj-product-table td:nth-child(4),
  .jj-product-table th:nth-child(5),
  .jj-product-table td:nth-child(5) {
    display: none;
  }

  .jj-product-table tbody tr {
    height: 48px;
  }

  .jj-thumb-img {
    width: 40px;
    height: 40px;
  }

  .jj-cell-title { min-width: 0; }
  .jj-cell-artist, .jj-cell-meta { display: none; }

  .jj-product-table colgroup { display: none; }
  .jj-product-table { table-layout: auto; }

  /* Detail pane is full screen on mobile */
  .jj-right-sidebar {
    width: 100vw;
    right: -100vw;
  }

  .jj-right-sidebar.jj-detail-open {
    right: 0;
  }

  /* Filter bar wraps more tightly */
  .jj-filter-bar {
    font-size: 11px;
    padding: 3px 8px;
  }
}
```

**Step 2: Verify and commit**

Resize browser to <600px. Table should show only thumbnail, title, and price columns in a compact layout. Tapping a row opens full-screen detail panel from right. Taskbar stays at bottom.

```bash
git add assets/japanjunky-homepage.css
git commit -m "Mobile layout: compact list view with full-screen detail panel"
```

---

## Summary of Commits

| # | Commit Message |
|---|---|
| 1 | Remove matrix rain canvas for pure CRT black void |
| 2 | Strengthen CRT vignette for deeper tube shape |
| 3 | Add phosphor dot overlay and chromatic aberration on product images |
| 4 | Add phosphor decay transitions on row deselection |
| 5 | Add format-coded phosphor color CSS rules for table rows |
| 6 | Add format detection, data attributes, and glyphs to product rows |
| 7 | Tighten table density: 64px rows, 56px thumbs, normal-weight names |
| 8 | Add client-side auto-dithering pipeline for product images |
| 9 | Update titlebar to show JAPANJUNKY — Catalog application name |
| 10 | Add clock date popover with randomized retrofuture year |
| 11 | Add phosphor glow to active taskbar tab |
| 12 | Detail pane header picks up format phosphor color on selection |
| 13 | Add arrow key navigation and Enter-to-open for product table |
| 14 | Add phosphor-colored format glyphs to sidebar filter section |
| 15 | Add Japanese original title field to detail pane (from product tags) |
| 16 | Add active filter query bar markup and styles above product table |
| 17 | Add ASCII art empty state for zero filter results |
| 18 | Add ASCII art 404 page |
| 19 | Tablet layout: hide sidebar, slide-in detail pane overlay |
| 20 | Mobile layout: compact list view with full-screen detail panel |

Tasks are ordered for clean dependency flow — each builds on the previous. Tasks 1-4 are foundational visual changes. Tasks 5-7 are the table/color system. Task 8 is the dithering pipeline. Tasks 9-11 are Win95 chrome. Tasks 12-16 are detail pane and filtering. Tasks 17-18 are ASCII art. Tasks 19-20 are responsive.
