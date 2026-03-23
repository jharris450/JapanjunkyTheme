# Product Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current vertical arc ring carousel + shared-portal 3D viewer with a two-zone layout: radial crescent catalogue (right) + dedicated Three.js viewer with spring physics (left).

**Architecture:** CSS 3D transforms for the catalogue crescent (slot-repositioning, `rotateY/translateZ`). Dedicated Three.js canvas for the product viewer with its own scene/camera/renderer, decoupled from the screensaver portal. Product info panel moves from fixed bottom-left overlay to inline below the viewer canvas.

**Tech Stack:** Liquid (Shopify), CSS 3D transforms, Three.js (ES5, no build step), vanilla JS

**Spec:** `docs/superpowers/specs/2026-03-22-product-page-redesign-design.md`

---

### Task 1: Restructure Layout HTML (theme.liquid)

**Files:**
- Modify: `layout/theme.liquid:130-182`

Replace the viewer interaction overlay (`jj-viewer-interaction`), ring carousel, and product info HUD with the new two-zone layout. The left zone contains the viewer canvas + product info inline. The right zone wraps the existing ring carousel markup.

- [ ] **Step 1: Replace the viewer interaction overlay and add left zone**

In `layout/theme.liquid`, replace lines 133-134 (the `jj-viewer-interaction` div) with the new left zone container. The left zone contains:
- A product title element
- A dedicated `<canvas>` for the 3D viewer
- The product info panel (restructured inline, not a floating overlay)

Replace lines 133-134:
```html
  {%- comment -%} Interaction overlay for 3D viewer drag-to-rotate {%- endcomment -%}
  <div class="jj-viewer-interaction" id="jj-viewer-interaction"></div>
```

With:
```html
  {%- comment -%} Left zone: product viewer + info {%- endcomment -%}
  <div class="jj-product-zone" id="jj-product-zone">
    <canvas id="jj-viewer-canvas" aria-label="3D product viewer"></canvas>
    <div class="jj-product-info" id="jj-product-info" style="display:none;">
      <div class="jj-product-info__title" id="jj-pi-title"></div>
      <div class="jj-product-info__meta" id="jj-pi-meta"></div>
      <div class="jj-product-info__price" id="jj-pi-price"></div>
      <div class="jj-product-info__actions" id="jj-pi-actions">
        <button class="jj-action-btn" id="jj-pi-add-to-cart" disabled>[Add to Cart]</button>
        <a class="jj-action-btn" id="jj-pi-view" href="#" style="display:none;">[View]</a>
        <input type="hidden" id="jj-pi-variant-id" value="">
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Remove the old product info overlay block**

**Note:** Step 1 shifted line numbers. Use content-based matching (the `old_string` block below), not line numbers, to locate this block.

Delete the old `jj-product-info` div (was a fixed bottom-left HUD):
```html
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

- [ ] **Step 3: Verify no duplicate IDs**

Search the file for any duplicate `id="jj-product-info"` or `id="jj-pi-*"` attributes. The old block was removed in step 2 and the new one added in step 1 — confirm there is exactly one of each.

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid
git commit -m "refactor(layout): restructure HTML for two-zone product page layout"
```

---

### Task 2: Rework Ring Carousel CSS for Radial Crescent

**Files:**
- Modify: `assets/japanjunky-ring-carousel.css`

Change the carousel from a vertical arc to a radial crescent. Remove cover labels. Remove the viewer interaction overlay styles (now handled by the dedicated canvas).

- [ ] **Step 1: Update the file header comment**

Replace line 1-4:
```css
/* ============================================
   JAPANJUNKY RING CAROUSEL
   Vertical arc of album covers — right side
   ============================================ */
```

With:
```css
/* ============================================
   JAPANJUNKY RING CAROUSEL
   Radial crescent of album covers — right side
   ============================================ */
```

- [ ] **Step 2: Update the stage to use horizontal centering for a radial arc**

The `.jj-ring__stage` (line 162-172) currently centers covers for a vertical arc. For the radial crescent, the stage perspective origin should center the arc in the right zone. No changes needed to the CSS — `perspective: 800px` and flexbox centering work for both axes. Covers will be positioned by JS transforms.

Verify the stage CSS is:
```css
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
```

No change needed — confirm and move on.

- [ ] **Step 3: Remove cover label styles**

Delete lines 204-224 (`.jj-ring__cover-label` and `.jj-ring__cover--selected .jj-ring__cover-label`):
```css
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
```

Replace with just the selected cover glow (which should remain, minus the label rule):
```css
/* Selected cover glow */
.jj-ring__cover--selected .jj-ring__cover-img-wrap {
  border-color: var(--jj-primary, #e8313a);
  box-shadow: 0 0 8px rgba(232, 49, 58, 0.3);
}
```

- [ ] **Step 4: Remove viewer interaction overlay styles**

Delete lines 275-293 (`.jj-viewer-interaction`, `--active`, `--dragging`):
```css
/* --- Viewer Interaction Overlay (left of ring) --- */
.jj-viewer-interaction {
  position: fixed;
  left: 0;
  top: 0;
  width: 65vw;
  height: calc(100vh - 32px);
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

These are no longer needed — drag interaction moves to the dedicated `<canvas>`.

- [ ] **Step 5: Add left zone and viewer canvas styles**

Add at the end of the file (before the `@media` rules) the new left zone positioning:

```css
/* --- Product Zone (left side) --- */
.jj-product-zone {
  position: fixed;
  left: 0;
  top: 0;
  width: 60vw;
  height: calc(100vh - 32px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

#jj-viewer-canvas {
  width: 100%;
  flex: 1;
  pointer-events: auto;
  cursor: grab;
}

#jj-viewer-canvas.jj-viewer--dragging {
  cursor: grabbing;
}
```

- [ ] **Step 6: Adjust ring container width**

The `.jj-ring` container (line 7-17) is currently `width: 35vw`. Update to `40vw` to match the new layout split (60/40):

Change:
```css
  width: 35vw;
```
To:
```css
  width: 40vw;
```

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-ring-carousel.css
git commit -m "style(ring): rework CSS from vertical arc to radial crescent layout"
```

---

### Task 3: Rework Ring Carousel JS for Radial Crescent

**Files:**
- Modify: `assets/japanjunky-ring-carousel.js`

Change arc math to `rotateY/translateZ`, remap inputs, remove cover labels, add per-cover random jitter.

- [ ] **Step 1: Update the file header comment**

Replace line 3:
```js
 * Full-viewport horizontal arc carousel of album covers.
```
With:
```js
 * Radial crescent carousel of album covers.
```

- [ ] **Step 2: Replace the ARC config array**

Replace lines 23-31 (the current vertical arc config):
```js
  var ARC = [
    { offset: 0,  rotateX: 0,    scale: 1.0,  opacity: 1.0  },
    { offset: 1,  rotateX: -30,  scale: 0.75, opacity: 0.85 },  // below center
    { offset: -1, rotateX: 30,   scale: 0.75, opacity: 0.85 },  // above center
    { offset: 2,  rotateX: -55,  scale: 0.55, opacity: 0.6  },
    { offset: -2, rotateX: 55,   scale: 0.55, opacity: 0.6  },
    { offset: 3,  rotateX: -75,  scale: 0.4,  opacity: 0.35 },
    { offset: -3, rotateX: 75,   scale: 0.4,  opacity: 0.35 }
  ];
```

With the new radial crescent config (increments of ~17deg per slot — within the spec's 15-20deg per-step range, producing ~100deg total spread for the quarter-circle crescent):
```js
  var ARC = [
    { offset: 0,  rotateY: 0,    scale: 1.0,  opacity: 1.0  },
    { offset: 1,  rotateY: 18,   scale: 0.8,  opacity: 0.85 },
    { offset: -1, rotateY: -18,  scale: 0.8,  opacity: 0.85 },
    { offset: 2,  rotateY: 35,   scale: 0.6,  opacity: 0.6  },
    { offset: -2, rotateY: -35,  scale: 0.6,  opacity: 0.6  },
    { offset: 3,  rotateY: 50,   scale: 0.45, opacity: 0.35 },
    { offset: -3, rotateY: -50,  scale: 0.45, opacity: 0.35 }
  ];
```

- [ ] **Step 3: Add random jitter generation**

Add after the `TRANSLATE_Z` line (line 33), a function to generate per-cover jitter:

```js
  // Per-cover random jitter (applied once on creation)
  var coverJitter = {}; // keyed by product handle+variantId

  function getJitter(product) {
    var key = product.handle + ':' + product.variantId;
    if (!coverJitter[key]) {
      coverJitter[key] = {
        rotate: (Math.random() - 0.5) * 5, // ±2.5deg
        tx: (Math.random() - 0.5) * 6,     // ±3px
        ty: (Math.random() - 0.5) * 6      // ±3px
      };
    }
    return coverJitter[key];
  }
```

- [ ] **Step 4: Remove cover label from createCoverEl**

In `createCoverEl` (lines 114-157), remove the label element creation. Delete lines 149-151:
```js
    var label = document.createElement('div');
    label.className = 'jj-ring__cover-label';
    label.textContent = product.title || 'Untitled';
```

And change line 153-154 from:
```js
    div.appendChild(imgWrap);
    div.appendChild(label);
```
To:
```js
    div.appendChild(imgWrap);
```

- [ ] **Step 5: Update positionCovers to use rotateY + jitter**

**Dependency:** This step requires Step 2 (ARC config changed from `rotateX` to `rotateY`). Both must be applied together — the property name in the ARC config must match the property name referenced here.

In `positionCovers` (line 161-210), update the transform line (line 197):

Replace:
```js
      el.style.transform = 'rotateX(' + slot.rotateX + 'deg) translateZ(' + TRANSLATE_Z + 'px) scale(' + slot.scale + ')';
```

With:
```js
      var jit = getJitter(filteredProducts[dIdx]);
      el.style.transform = 'rotateY(' + (slot.rotateY + jit.rotate) + 'deg) translateZ(' + TRANSLATE_Z + 'px) scale(' + slot.scale + ') translate(' + jit.tx + 'px, ' + jit.ty + 'px)';
```

- [ ] **Step 6: Remap keyboard input to Left/Right**

In the keyboard handler (lines 336-355), the current code maps both ArrowDown/ArrowRight to `rotateRight` and ArrowUp/ArrowLeft to `rotateLeft`. This already handles Left/Right, so no change is needed — the existing mapping covers the new key bindings. Verify and move on.

- [ ] **Step 7: Remap wheel to prioritize deltaX**

In the wheel handler (lines 380-394), update the delta check to prefer `deltaX`:

Replace lines 389-393:
```js
    if (e.deltaY > 0 || e.deltaX > 0) {
      rotateRight();
    } else if (e.deltaY < 0 || e.deltaX < 0) {
      rotateLeft();
    }
```

With:
```js
    var delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (delta > 0) {
      rotateRight();
    } else if (delta < 0) {
      rotateLeft();
    }
```

- [ ] **Step 8: Remap touch to horizontal swipe**

In the touch handlers (lines 396-432), change from vertical to horizontal swipe detection.

Replace lines 411-425:
```js
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1 || touchLocked) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    // Only register vertical swipes, one rotation per gesture
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
      touchMoved = true;
      touchLocked = true; // one rotation per swipe gesture
      if (dy > 0) {
        rotateRight(); // swipe down → next item
      } else {
        rotateLeft();  // swipe up → previous item
      }
    }
  }, { passive: true });
```

With:
```js
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1 || touchLocked) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    // Only register horizontal swipes, one rotation per gesture
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      touchMoved = true;
      touchLocked = true;
      if (dx > 0) {
        rotateRight();
      } else {
        rotateLeft();
      }
    }
  }, { passive: true });
```

- [ ] **Step 9: Commit**

```bash
git add assets/japanjunky-ring-carousel.js
git commit -m "feat(ring): radial crescent arc math, horizontal input, random jitter"
```

---

### Task 4: Rework Product Info CSS for Inline Layout

**Files:**
- Modify: `assets/japanjunky-product-info.css`

Change from fixed bottom-left overlay to inline layout inside the left zone. Remove header, description, and variant selector styles. Add meta tag horizontal layout.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `assets/japanjunky-product-info.css` with:

```css
/* ============================================
   JAPANJUNKY PRODUCT INFO
   Inline panel below 3D viewer in left zone
   ============================================ */

.jj-product-info {
  width: 100%;
  max-width: 400px;
  padding: 12px 16px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  pointer-events: auto;
}

.jj-product-info__title {
  font-size: 14px;
  color: var(--jj-accent, #4aa4e0);
  line-height: 1.3;
  min-height: 18px;
  margin-bottom: 6px;
}

.jj-product-info__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 10px;
  margin-bottom: 8px;
}

.jj-product-info__meta .jj-meta-tag {
  color: #999;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #333;
  padding: 1px 6px;
  white-space: nowrap;
}

.jj-product-info__meta .jj-meta-tag--label {
  color: #555;
  text-transform: uppercase;
}

.jj-product-info__price {
  font-size: 14px;
  color: var(--jj-secondary, #f5d742);
  margin-bottom: 8px;
  min-height: 18px;
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
  .jj-product-info__actions .jj-action-btn {
    border-width: 2px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-info.css
git commit -m "style(product-info): inline layout below viewer, horizontal meta tags"
```

---

### Task 5: Rework Product Viewer JS — Dedicated Scene + Spring Physics + Idle Animation

**Files:**
- Modify: `assets/japanjunky-product-viewer.js`

This is the largest task. Decouple rendering from `JJ_Portal`, create own scene/camera/renderer, add spring physics damped oscillator, add idle zero-gravity animation, restructure drag interaction to use the dedicated canvas, update product info panel to match new HTML structure.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `assets/japanjunky-product-viewer.js` with the new implementation. The file is structured as:

1. Scene setup (own renderer, camera, scene)
2. Idle animation state + update function
3. Spring physics state + update function
4. Model creation/removal (same geometry, own shader resolution)
5. Drag interaction on the canvas (not interaction overlay)
6. Screensaver coordination (Tsuno Daishi + parallax, still via `JJ_Portal`)
7. Product info panel (streamlined: title, meta tags, price, actions with View button)
8. Typewriter animation (same system, fewer fields)
9. Add to Cart + View button logic
10. Event listeners (`jj:product-selected`, `jj:product-deselected`)
11. Render loop (`requestAnimationFrame`)

```js
/**
 * japanjunky-product-viewer.js
 * Dedicated 3D product viewer with spring physics + idle animation.
 * Renders to its own canvas, independent from screensaver.
 *
 * Consumes: window.JJ_SCREENSAVER_CONFIG (for shader resolution)
 * Accesses: window.JJ_Portal (only for Tsuno Daishi + parallax coordination)
 * Listens:  jj:product-selected, jj:product-deselected
 */
(function () {
  'use strict';

  // ─── DOM ──────────────────────────────────────────────────────
  var canvas = document.getElementById('jj-viewer-canvas');
  var infoPanel = document.getElementById('jj-product-info');
  if (!canvas) return;

  // ─── Three.js Scene Setup ─────────────────────────────────────
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(1); // Keep pixelated
  renderer.setClearColor(0x000000, 0); // Transparent

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 5);

  var shaderRes = 240;
  if (window.JJ_SCREENSAVER_CONFIG && window.JJ_SCREENSAVER_CONFIG.resolution) {
    shaderRes = parseInt(window.JJ_SCREENSAVER_CONFIG.resolution, 10) || 240;
  }

  // ─── PS1 Shaders ──────────────────────────────────────────────
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

  // ─── State ────────────────────────────────────────────────────
  var currentModel = null;
  var currentData = null;
  var textureLoader = new THREE.TextureLoader();
  var animating = false;

  // ─── Idle Animation ───────────────────────────────────────────
  var idle = {
    rotSpeed: 0.15,       // rad/s Y rotation
    bobAmp: 0.05,         // units vertical
    bobPeriod: 2.5,       // seconds
    tiltXAmp: 0.08,       // rad
    tiltZAmp: 0.08,       // rad
    tiltXFreq: 0.7,       // Hz
    tiltZFreq: 0.5,       // Hz
    time: 0
  };

  // ─── Spring Physics ───────────────────────────────────────────
  var spring = {
    stiffness: 8,
    damping: 0.7,
    // Current angular velocity from drag
    velX: 0,
    velZ: 0,
    active: false
  };

  // ─── Drag State ───────────────────────────────────────────────
  var drag = {
    active: false,
    prevX: 0,
    prevY: 0
  };

  var raycaster = new THREE.Raycaster();

  // ─── Resize ───────────────────────────────────────────────────

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);

  // ─── Model Creation ───────────────────────────────────────────

  function createModel(data) {
    removeModel();

    var geometry;
    if (data.type3d === 'box') {
      geometry = new THREE.BoxGeometry(2.0, 2.0, 0.3);
    } else {
      geometry = new THREE.PlaneGeometry(2.0, 2.0);
    }

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
      var frontMat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.FrontSide
      });
      var backMat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: backTex || frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.FrontSide
      });
      var sideMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

      mesh = new THREE.Mesh(geometry, [
        sideMat, sideMat,
        sideMat, sideMat,
        frontMat, backMat
      ]);
    } else {
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.DoubleSide
      });
      mesh = new THREE.Mesh(geometry, mat);

      if (backTex) {
        var backGeo = new THREE.PlaneGeometry(2.0, 2.0);
        var backPlaneMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: shaderRes },
            uTexture: { value: backTex }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var backMesh = new THREE.Mesh(backGeo, backPlaneMat);
        backMesh.rotation.y = Math.PI;
        backMesh.position.z = -0.01;
        mesh.add(backMesh);
      }
    }

    mesh.position.set(0, 0, 0);
    mesh.userData.isProductModel = true;
    scene.add(mesh);
    currentModel = mesh;
    currentData = data;

    // Reset idle and spring state
    idle.time = 0;
    spring.velX = 0;
    spring.velZ = 0;
    spring.active = false;

    // Initial entrance angle
    mesh.rotation.y = -0.3;

    startAnimating();
  }

  function createFallbackTexture() {
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#333';
    ctx.font = '10px monospace';
    ctx.fillText('NO IMG', 8, 36);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  function removeModel() {
    if (currentModel) {
      scene.remove(currentModel);
      if (currentModel.geometry) currentModel.geometry.dispose();
      if (Array.isArray(currentModel.material)) {
        for (var i = 0; i < currentModel.material.length; i++) {
          currentModel.material[i].dispose();
        }
      } else if (currentModel.material) {
        currentModel.material.dispose();
      }
      var children = currentModel.children.slice();
      for (var j = 0; j < children.length; j++) {
        if (children[j].geometry) children[j].geometry.dispose();
        if (children[j].material) children[j].material.dispose();
      }
      currentModel = null;
      currentData = null;
    }
    stopAnimating();
  }

  // ─── Animation Loop ───────────────────────────────────────────

  var lastTime = 0;
  var rafId = null;

  function startAnimating() {
    if (animating) return;
    animating = true;
    lastTime = performance.now();
    resize();
    rafId = requestAnimationFrame(tick);
  }

  function stopAnimating() {
    animating = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // Clear the canvas
    renderer.clear();
  }

  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);

    var dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt
    lastTime = now;

    if (!currentModel) return;

    if (drag.active) {
      // During drag, don't apply idle or spring — user controls rotation
    } else if (spring.active) {
      // Spring is pulling back to idle orientation
      updateSpring(dt);
    } else {
      // Idle: gentle float
      updateIdle(dt);
    }

    // Bobbing always applies (even during spring settling)
    if (!drag.active) {
      currentModel.position.y = Math.sin(idle.time * (2 * Math.PI / idle.bobPeriod)) * idle.bobAmp;
    }

    renderer.render(scene, camera);
  }

  function updateIdle(dt) {
    idle.time += dt;
    var m = currentModel;
    m.rotation.y += idle.rotSpeed * dt;
    m.rotation.x = Math.sin(idle.time * idle.tiltXFreq * 2 * Math.PI) * idle.tiltXAmp;
    m.rotation.z = Math.sin(idle.time * idle.tiltZFreq * 2 * Math.PI) * idle.tiltZAmp;
  }

  function updateSpring(dt) {
    idle.time += dt;
    var m = currentModel;

    // Target: where idle animation would put the rotation right now
    var targetY = m.rotation.y; // keep current Y, spring only pulls X and Z back
    var targetX = Math.sin(idle.time * idle.tiltXFreq * 2 * Math.PI) * idle.tiltXAmp;
    var targetZ = Math.sin(idle.time * idle.tiltZFreq * 2 * Math.PI) * idle.tiltZAmp;

    // Apply idle Y rotation continuously
    m.rotation.y += idle.rotSpeed * dt;

    // Spring on X axis
    var dx = targetX - m.rotation.x;
    spring.velX += dx * spring.stiffness * dt;
    spring.velX *= Math.pow(1 - spring.damping, dt * 10);
    m.rotation.x += spring.velX * dt;

    // Spring on Z axis (same damped formula as X)
    var dz = targetZ - m.rotation.z;
    spring.velZ += dz * spring.stiffness * dt;
    spring.velZ *= Math.pow(1 - spring.damping, dt * 10);
    m.rotation.z += spring.velZ * dt;

    // Check if spring has settled
    if (Math.abs(dx) < 0.005 && Math.abs(spring.velX) < 0.01 &&
        Math.abs(dz) < 0.005 && Math.abs(spring.velZ) < 0.01) {
      spring.active = false;
    }
  }

  // ─── Drag Interaction (on canvas) ─────────────────────────────

  canvas.addEventListener('mousedown', function (e) {
    if (!currentModel) return;

    var rect = canvas.getBoundingClientRect();
    var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera({ x: mx, y: my }, camera);
    var hits = raycaster.intersectObject(currentModel, true);

    if (hits.length > 0) {
      drag.active = true;
      drag.prevX = e.clientX;
      drag.prevY = e.clientY;
      canvas.classList.add('jj-viewer--dragging');
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', function (e) {
    if (!drag.active || !currentModel) return;
    var dx = e.clientX - drag.prevX;
    var dy = e.clientY - drag.prevY;

    currentModel.rotation.y += dx * 0.01;
    currentModel.rotation.x += dy * 0.01;

    drag.prevX = e.clientX;
    drag.prevY = e.clientY;
  });

  window.addEventListener('mouseup', function () {
    if (drag.active) {
      drag.active = false;
      canvas.classList.remove('jj-viewer--dragging');
      // Activate spring to pull back to idle
      spring.active = true;
      spring.velX = 0;
      spring.velZ = 0;
    }
  });

  // ─── Typewriter Animation ─────────────────────────────────────

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
    function step() {
      if (idx < text.length) {
        idx++;
        textNode.textContent = text.substring(0, idx);
        typeTimer = setTimeout(step, msPerChar);
      } else {
        cursor.remove();
        if (cb) cb();
      }
    }
    step();
  }

  function typeSequence(fields) {
    clearType();
    var i = 0;
    function next() {
      if (i >= fields.length) {
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

  // ─── Product Info Panel ───────────────────────────────────────

  var piTitle = document.getElementById('jj-pi-title');
  var piMeta = document.getElementById('jj-pi-meta');
  var piPrice = document.getElementById('jj-pi-price');
  var piAddToCart = document.getElementById('jj-pi-add-to-cart');
  var piView = document.getElementById('jj-pi-view');
  var piVariantId = document.getElementById('jj-pi-variant-id');

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function buildMetaTag(label, value) {
    return '<span class="jj-meta-tag"><span class="jj-meta-tag--label">' +
           escapeHtml(label) + ':</span> ' + escapeHtml(value) + '</span>';
  }

  function showProductInfo(data) {
    if (!infoPanel) return;

    // Title — will be typed
    if (piTitle) piTitle.textContent = '';

    // Meta tags — horizontal
    if (piMeta) {
      var tags = [];
      if (data.artist) tags.push(buildMetaTag('Artist', data.artist));
      if (data.formatLabel) tags.push(buildMetaTag('Format', data.formatLabel));
      if (data.year) tags.push(buildMetaTag('Year', data.year));
      if (data.label) tags.push(buildMetaTag('Label', data.label));
      if (data.condition) tags.push(buildMetaTag('Condition', data.condition));
      piMeta.innerHTML = tags.join('');
    }

    // Price — will be typed
    if (piPrice) piPrice.textContent = '';

    // Variant ID + ATC button
    if (piVariantId) piVariantId.value = data.variantId;
    if (piAddToCart) {
      piAddToCart.disabled = !data.available;
      piAddToCart.textContent = data.available ? '[Add to Cart]' : '[Unavailable]';
    }

    // View button
    if (piView) {
      piView.href = '/products/' + data.handle;
      piView.style.display = '';
    }

    // Show panel
    infoPanel.style.display = '';
    infoPanel.classList.remove('jj-product-info--entering');
    void infoPanel.offsetHeight;
    infoPanel.classList.add('jj-product-info--entering');

    // Typewriter: title then price
    typeSequence([
      { el: piTitle, text: data.title || '---', ms: 28 },
      { el: piPrice, text: data.price || '---', ms: 22 }
    ]);
  }

  function hideProductInfo() {
    clearType();
    if (infoPanel) infoPanel.style.display = 'none';
    if (piView) piView.style.display = 'none';
  }

  // ─── Add to Cart ──────────────────────────────────────────────

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

  // ─── Screensaver Coordination ─────────────────────────────────

  function coordSelect() {
    var portal = window.JJ_Portal;
    if (!portal) return;
    if (portal.tsuno && portal.tsuno.getState() !== 'orbiting') {
      portal.tsuno.setState('transitioning-out');
    }
    if (portal.setParallaxEnabled) portal.setParallaxEnabled(false);
  }

  function coordDeselect() {
    var portal = window.JJ_Portal;
    if (!portal) return;
    if (portal.tsuno && portal.tsuno.getState() !== 'idle') {
      portal.tsuno.setState('returning');
    }
    if (portal.setParallaxEnabled) portal.setParallaxEnabled(true);
  }

  // ─── Event Listeners ─────────────────────────────────────────

  document.addEventListener('jj:product-selected', function (e) {
    var data = e.detail;
    coordSelect();
    createModel(data);
    showProductInfo(data);
  });

  document.addEventListener('jj:product-deselected', function () {
    removeModel();
    coordDeselect();
    hideProductInfo();
  });
})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-viewer.js
git commit -m "feat(viewer): dedicated scene, spring physics, idle animation, inline info"
```

---

### Task 6: Final Integration Verification

**Files:**
- Read: `layout/theme.liquid`, `assets/japanjunky-ring-carousel.css`, `assets/japanjunky-ring-carousel.js`, `assets/japanjunky-product-viewer.js`, `assets/japanjunky-product-info.css`

- [ ] **Step 1: Verify no stale DOM references**

Check that `japanjunky-product-viewer.js` does not reference any removed element IDs:
- `jj-viewer-interaction` — should NOT appear (removed)
- `jj-pi-header` — should NOT appear (removed)
- `jj-pi-artist` — should NOT appear (removed from panel; artist is now in meta tags)
- `jj-pi-desc` — should NOT appear (removed)
- `jj-pi-variants` — should NOT appear (removed)

Check that `japanjunky-ring-carousel.js` does not reference `rotateX` in transforms (should all be `rotateY`).

- [ ] **Step 2: Verify no orphaned CSS selectors**

Check that `japanjunky-ring-carousel.css` does not contain `.jj-ring__cover-label` or `.jj-viewer-interaction`.
Check that `japanjunky-product-info.css` does not contain `.jj-product-info__header`, `.jj-product-info__artist`, `.jj-product-info__desc`, or `.jj-product-info__variants`.

- [ ] **Step 3: Verify HTML structure consistency**

In `layout/theme.liquid`:
- `jj-product-zone` exists and contains `jj-viewer-canvas` and `jj-product-info`
- `jj-ring` still has `jj-ring-stage` and the filter bar
- No duplicate IDs
- Old `jj-viewer-interaction` div is gone
- Old product info HUD block is gone

- [ ] **Step 4: Manual browser test checklist**

Open the Shopify theme preview and verify:
- [ ] Screensaver portal renders in background
- [ ] CRT overlay visible on top
- [ ] Right zone shows catalogue crescent with album covers in radial arc
- [ ] Covers have slight random jitter (imperfect positioning)
- [ ] No text labels on covers
- [ ] Scroll wheel rotates covers (deltaX preferred, deltaY fallback)
- [ ] Left/Right arrow keys rotate covers
- [ ] Clicking a cover selects it; left side shows 3D model
- [ ] 3D model renders on a dedicated transparent canvas (portal visible behind)
- [ ] Model gently rotates and bobs (zero-gravity idle)
- [ ] Dragging the model rotates it
- [ ] Releasing drag — model springs back to idle orientation
- [ ] Product info appears below viewer: title (cyan), meta tags (horizontal), price, Add to Cart + View buttons
- [ ] Typewriter animation plays on title and price
- [ ] "View" button links to `/products/{handle}`
- [ ] "Add to Cart" works
- [ ] Tsuno Daishi transitions out on selection, returns on deselection
- [ ] Escape key deselects product

- [ ] **Step 5: Commit any fixes from testing**

Review `git status`, then stage only the relevant files:
```bash
git add layout/theme.liquid assets/japanjunky-ring-carousel.css assets/japanjunky-ring-carousel.js assets/japanjunky-product-viewer.js assets/japanjunky-product-info.css
git commit -m "fix: integration fixes from manual testing"
```
