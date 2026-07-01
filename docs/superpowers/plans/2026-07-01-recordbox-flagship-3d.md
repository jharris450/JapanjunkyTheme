# Recordbox Flagship 3D Product — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the flagship "5 random records" bundle as a floating 3D cardboard box (12×12×3) in the homepage ring, skinned from bundled cardboard textures, reusing the existing product-viewer physics.

**Architecture:** Add a `type3d: 'recordbox'` product type (tag `3d-recordbox`) alongside the existing `box`. A new pure UMD module (`japanjunky-recordbox.js`) owns the geometry ratio, face-mapping order, and front-lid composite layout — unit-tested under vitest. `japanjunky-product-viewer.js` gains a `recordbox` branch in `createModel()` that builds a `BoxGeometry` with six per-face PS1 materials, the front face being a runtime canvas composite of two lid-half textures. Texture URLs are injected as `window.JJ_RECORDBOX_TEX` in `theme.liquid`, mirroring the existing `JJ_CASSETTE_TEX` pattern.

**Tech Stack:** Shopify Liquid, vanilla JS (IIFE + UMD modules), three.js (`assets/three.min.js`), vitest (node env), PS1 shader materials already in the viewer.

## Global Constraints

- **Never hijack generic `box`** — `type3d: 'box'` pulls product images and stays unchanged. Add a separate `recordbox` type.
- **PS1 render aesthetic** — all faces use the existing `PS1_VERT`/`PS1_FRAG` `ShaderMaterial` with `THREE.NearestFilter` on every texture. No new shaders, no linear filtering.
- **Textures are theme assets** — shipped as `assets/recordbox-*.png`; the product's uploaded images are NOT used for the 3D faces.
- **UMD module pattern** — new logic module follows `assets/japanjunky-media-format.js` exactly (browser global + `module.exports`, no DOM access) so vitest can import it.
- **Box dimensions 12:12:3** encoded as `BoxGeometry(2.0, 2.0, 0.5)`.
- **Deploy** — live only after merge to `main` (Shopify GitHub integration syncs `main`); feature branches are not live.

---

### Task 1: Recordbox geometry/mapping module (pure logic + tests)

**Files:**
- Create: `assets/japanjunky-recordbox.js`
- Test: `tests/recordbox.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (browser global `window.JJ_Recordbox`, node `module.exports`):
  - `DIMS: { w: number, h: number, d: number }` — BoxGeometry args, `{ w:2.0, h:2.0, d:0.5 }`.
  - `FACE_ORDER: string[]` — six texture keys in three.js BoxGeometry material order `[+X,-X,+Y,-Y,+Z,-Z]` = `['sideRight','sideLeft','top','bottom','front','back']`.
  - `frontCompositeLayout(size: number): { size, left:{x,y,w,h}, right:{x,y,w,h}, seam:{x,y,w,h} }` — canvas rects for compositing the two lid halves + center seam.

- [ ] **Step 1: Write the failing test**

Create `tests/recordbox.test.js`:

```js
import { describe, it, expect } from 'vitest';
import RB from '../assets/japanjunky-recordbox.js';

describe('recordbox DIMS', () => {
  it('encodes a 12:12:3 ratio', () => {
    expect(RB.DIMS.w).toBe(2.0);
    expect(RB.DIMS.h).toBe(2.0);
    expect(RB.DIMS.d).toBeCloseTo(0.5, 5);
    expect(RB.DIMS.d / RB.DIMS.w).toBeCloseTo(3 / 12, 5); // depth:width == 3:12
  });
});

describe('recordbox FACE_ORDER', () => {
  it('has six faces in BoxGeometry order [+X,-X,+Y,-Y,+Z,-Z]', () => {
    expect(RB.FACE_ORDER).toEqual(['sideRight', 'sideLeft', 'top', 'bottom', 'front', 'back']);
  });
  it('maps the vertical slotted sides to +X/-X', () => {
    expect(RB.FACE_ORDER[0]).toBe('sideRight');
    expect(RB.FACE_ORDER[1]).toBe('sideLeft');
  });
  it('maps +Z to the composited front lid and -Z to back', () => {
    expect(RB.FACE_ORDER[4]).toBe('front');
    expect(RB.FACE_ORDER[5]).toBe('back');
  });
});

describe('frontCompositeLayout', () => {
  it('splits the canvas into equal left/right halves', () => {
    const L = RB.frontCompositeLayout(512);
    expect(L.left).toEqual({ x: 0, y: 0, w: 256, h: 512 });
    expect(L.right).toEqual({ x: 256, y: 0, w: 256, h: 512 });
  });
  it('centers a non-zero seam on the vertical midline', () => {
    const L = RB.frontCompositeLayout(512);
    expect(L.seam.w).toBeGreaterThan(0);
    expect(L.seam.x + L.seam.w / 2).toBeCloseTo(256, 5);
    expect(L.seam.h).toBe(512);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recordbox`
Expected: FAIL — `Failed to resolve import "../assets/japanjunky-recordbox.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `assets/japanjunky-recordbox.js`:

```js
/**
 * japanjunky-recordbox.js
 * Pure geometry + face-mapping logic for the flagship 3D record box.
 *
 * UMD: attaches to window.JJ_Recordbox as a classic <script>, exports via
 * module.exports under Vitest. No DOM access, no three.js dependency.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_Recordbox = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // BoxGeometry args for a 12 x 12 x 3 (L x W x H) box in viewer units.
  // Square face = 2.0; depth = 2.0 * 3 / 12 = 0.5.
  var DIMS = { w: 2.0, h: 2.0, d: 0.5 };

  // three.js BoxGeometry material index order is [+X, -X, +Y, -Y, +Z, -Z].
  // Each entry names a key in window.JJ_RECORDBOX_TEX, except 'front', which
  // is a runtime canvas composite of frontLeft|frontRight (the two lid halves).
  var FACE_ORDER = ['sideRight', 'sideLeft', 'top', 'bottom', 'front', 'back'];

  // Rects for drawing the two lid halves onto one square canvas, with a thin
  // dark seam down the center so the front reads as a two-flap lid.
  function frontCompositeLayout(size) {
    var half = size / 2;
    var seamW = Math.max(1, Math.round(size * 0.006));
    return {
      size: size,
      left:  { x: 0,    y: 0, w: half, h: size },
      right: { x: half, y: 0, w: half, h: size },
      seam:  { x: half - seamW / 2, y: 0, w: seamW, h: size }
    };
  }

  return { DIMS: DIMS, FACE_ORDER: FACE_ORDER, frontCompositeLayout: frontCompositeLayout };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recordbox`
Expected: PASS — all specs in `tests/recordbox.test.js` green.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-recordbox.js tests/recordbox.test.js
git commit -m "feat(recordbox): geometry + face-mapping module with tests"
```

---

### Task 2: Bundle textures + wire Liquid data plumbing

**Files:**
- Create: `assets/recordbox-back.png`, `assets/recordbox-front-left.png`, `assets/recordbox-front-right.png`, `assets/recordbox-side-left.png`, `assets/recordbox-side-right.png`, `assets/recordbox-top-side.png`, `assets/recordbox-bottom-side.png`
- Modify: `snippets/jj-product-json.liquid:44-46` (tag → type3d mapping)
- Modify: `layout/theme.liquid:301-302` (inject `JJ_RECORDBOX_TEX` + module `<script>` before `japanjunky-product-viewer.js`)

**Interfaces:**
- Consumes: `window.JJ_Recordbox` (Task 1) — loaded before the viewer.
- Produces:
  - `type3d: "recordbox"` in each `JJ_FEATURED` / `JJ_PRODUCTS` entry tagged `3d-recordbox`.
  - `window.JJ_RECORDBOX_TEX = { back, frontLeft, frontRight, sideLeft, sideRight, top, bottom }` — each an absolute asset URL string.

- [ ] **Step 1: Copy the seven source textures into the theme assets**

Run (Git Bash):

```bash
cp ~/Desktop/recordbox/back.png        assets/recordbox-back.png
cp ~/Desktop/recordbox/front-left.png  assets/recordbox-front-left.png
cp ~/Desktop/recordbox/front-right.png assets/recordbox-front-right.png
cp ~/Desktop/recordbox/side-left.png   assets/recordbox-side-left.png
cp ~/Desktop/recordbox/side-right.png  assets/recordbox-side-right.png
cp ~/Desktop/recordbox/top-side.png    assets/recordbox-top-side.png
cp ~/Desktop/recordbox/bottom-side.png assets/recordbox-bottom-side.png
ls assets/recordbox-*.png
```

Expected: seven files listed under `assets/`.

- [ ] **Step 2: Add the tag → type3d mapping**

In `snippets/jj-product-json.liquid`, the `3d type` loop currently reads:

```liquid
      {%- comment -%} 3D type {%- endcomment -%}
      {%- assign p_3d_type = 'plane' -%}
      {%- for tag in product.tags -%}
        {%- if tag == '3d-box' -%}{%- assign p_3d_type = 'box' -%}{%- endif -%}
      {%- endfor -%}
```

Change the loop body to also recognize `3d-recordbox`:

```liquid
      {%- comment -%} 3D type {%- endcomment -%}
      {%- assign p_3d_type = 'plane' -%}
      {%- for tag in product.tags -%}
        {%- if tag == '3d-box' -%}{%- assign p_3d_type = 'box' -%}{%- endif -%}
        {%- if tag == '3d-recordbox' -%}{%- assign p_3d_type = 'recordbox' -%}{%- endif -%}
      {%- endfor -%}
```

- [ ] **Step 3: Inject the texture map + load the module in `theme.liquid`**

In `layout/theme.liquid`, the ring/viewer scripts read:

```liquid
  {% endunless %}
  <script src="{{ 'japanjunky-product-viewer.js' | asset_url }}" defer></script>
```

Insert the texture-map block and the module script immediately BEFORE the product-viewer line (the module is `defer`, so document order guarantees it evaluates before the viewer):

```liquid
  {% endunless %}
  <script>
    window.JJ_RECORDBOX_TEX = {
      back:       "{{ 'recordbox-back.png' | asset_url }}",
      frontLeft:  "{{ 'recordbox-front-left.png' | asset_url }}",
      frontRight: "{{ 'recordbox-front-right.png' | asset_url }}",
      sideLeft:   "{{ 'recordbox-side-left.png' | asset_url }}",
      sideRight:  "{{ 'recordbox-side-right.png' | asset_url }}",
      top:        "{{ 'recordbox-top-side.png' | asset_url }}",
      bottom:     "{{ 'recordbox-bottom-side.png' | asset_url }}"
    };
  </script>
  <script src="{{ 'japanjunky-recordbox.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-viewer.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Verify the wiring (no automated Liquid test)**

Run the existing suite to confirm nothing regressed:

Run: `npm test`
Expected: PASS (all suites, including `recordbox` from Task 1).

Manual grep sanity:

Run: `grep -n "recordbox" snippets/jj-product-json.liquid layout/theme.liquid`
Expected: the new `3d-recordbox` mapping line and the seven `recordbox-*.png` asset URLs plus the module `<script>` are present.

- [ ] **Step 5: Commit**

```bash
git add assets/recordbox-*.png snippets/jj-product-json.liquid layout/theme.liquid
git commit -m "feat(recordbox): bundle box textures + wire type3d plumbing"
```

---

### Task 3: Product-viewer recordbox branch

**Files:**
- Modify: `assets/japanjunky-product-viewer.js` (add `buildRecordboxMesh` + `buildRecordboxFrontTexture` helpers; add a `recordbox` branch at the top of `createModel`)

**Interfaces:**
- Consumes: `window.JJ_Recordbox` (`DIMS`, `FACE_ORDER`, `frontCompositeLayout`); `window.JJ_RECORDBOX_TEX`; existing `shaderRes`, `PS1_VERT`, `PS1_FRAG`, `textureLoader`, `createFallbackTexture`, `startAnimating`, `idle`, `spring`, `scene`.
- Produces: a `THREE.Mesh` set as `currentModel` when `data.type3d === 'recordbox'`, disposed by the existing array-material branch of `removeModel()` (no `removeModel` change needed — it already disposes array materials and their `uTexture` values).

- [ ] **Step 1: Add the recordbox mesh builders**

In `assets/japanjunky-product-viewer.js`, immediately AFTER the `createFallbackTexture` function (ends near line 271, before the `// ─── Vinyl Disc ───` block), add:

```js
  // ─── Recordbox (flagship 3D box) ───────────────────────────────

  // Composite the two lid-half textures onto one square canvas, with a
  // center seam, and return a CanvasTexture that refreshes as each half
  // loads. crossOrigin='anonymous' keeps the canvas untainted so WebGL can
  // upload it (Shopify's asset CDN sends permissive CORS headers).
  function buildRecordboxFrontTexture(tex) {
    var RB = window.JJ_Recordbox;
    var size = 512;
    var layout = RB ? RB.frontCompositeLayout(size) : null;

    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8a8a86'; // cardboard grey base (shows until halves load)
    ctx.fillRect(0, 0, size, size);

    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    function drawSeam() {
      if (!layout) return;
      ctx.fillStyle = 'rgba(20,20,20,0.85)';
      ctx.fillRect(layout.seam.x, layout.seam.y, layout.seam.w, layout.seam.h);
    }
    function loadHalf(url, rect) {
      if (!url || !rect) { drawSeam(); texture.needsUpdate = true; return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
        drawSeam();
        texture.needsUpdate = true;
      };
      img.src = url;
    }
    loadHalf(tex.frontLeft, layout && layout.left);
    loadHalf(tex.frontRight, layout && layout.right);
    return texture;
  }

  function buildRecordboxMesh() {
    var RB = window.JJ_Recordbox;
    var TEX = window.JJ_RECORDBOX_TEX || {};
    var dims = (RB && RB.DIMS) || { w: 2.0, h: 2.0, d: 0.5 };
    var order = (RB && RB.FACE_ORDER) ||
                ['sideRight', 'sideLeft', 'top', 'bottom', 'front', 'back'];

    var geometry = new THREE.BoxGeometry(dims.w, dims.h, dims.d);

    function psMat(tex) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: tex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.FrontSide
      });
    }
    function loadFace(url) {
      if (!url) return null;
      var t = textureLoader.load(url);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      return t;
    }

    var materials = order.map(function (key) {
      if (key === 'front') return psMat(buildRecordboxFrontTexture(TEX));
      return psMat(loadFace(TEX[key])); // sideRight, sideLeft, top, bottom, back
    });

    return new THREE.Mesh(geometry, materials);
  }
```

- [ ] **Step 2: Branch `createModel` to the recordbox builder**

In `createModel(data)`, immediately after the opening `removeModel();` line (currently line 158), add the recordbox branch BEFORE the existing `var geometry;` logic:

```js
  function createModel(data) {
    removeModel();

    if (data.type3d === 'recordbox') {
      var box = buildRecordboxMesh();
      box.position.set(0, 0, 0);
      box.userData.isProductModel = true;
      scene.add(box);
      currentModel = box;
      currentData = data;

      idle.time = 0;
      spring.velX = 0;
      spring.velZ = 0;
      spring.active = false;
      box.rotation.y = -0.3; // entrance angle
      startAnimating();
      return;
    }

    var geometry;
    // ...existing plane/box logic unchanged...
```

- [ ] **Step 3: Verify the module suite still passes**

Run: `npm test`
Expected: PASS (no regressions; Task 3 changes are DOM/WebGL code not covered by node tests, so this only guards the pure modules).

- [ ] **Step 4: Manual browser verification**

Prerequisite: a Shopify product tagged `3d-recordbox` exists in the Featured (ring) collection with an uploaded hero image. Load the homepage (dev theme / preview).

Confirm:
- Rotating the ring to the flagship product shows a 3D **box** (not a flat plane), with visible depth.
- Proportions read as a shallow 12×12×3 slab (square face, thin depth), NOT a thick cube.
- Front face shows the two lid halves with a center seam; the two 3-deep vertical sides show the slotted-vent texture; top/bottom edges show the edge texture; back shows the back texture.
- Box drags, flicks, spring-settles, and idle-bobs exactly like a record cover (shared physics).
- Rotate away and back to the box several times — no console errors, no flicker, no memory growth (materials disposed each deselect).

Fallback check (optional): in DevTools set `window.JJ_RECORDBOX_TEX = {}` then reselect the box — it should render a grey "NO IMG" fallback box with no `SecurityError`/console exception.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-product-viewer.js
git commit -m "feat(recordbox): render flagship box in product viewer"
```

---

## Self-Review

**Spec coverage:**
- Theme-asset textures → Task 2 Step 1. ✓
- New `type3d: recordbox` / tag `3d-recordbox` → Task 2 Step 2. ✓
- 12:12:3 `BoxGeometry(2.0,2.0,0.5)` → Task 1 `DIMS`, Task 3 `buildRecordboxMesh`. ✓
- Six-face mapping in `[+X,-X,+Y,-Y,+Z,-Z]` order → Task 1 `FACE_ORDER`, Task 3 `order.map`. ✓
- Front two-flap seam composite → Task 1 `frontCompositeLayout`, Task 3 `buildRecordboxFrontTexture`. ✓
- PS1 material + NearestFilter on all faces → Task 3 `psMat`/`loadFace`. ✓
- Liquid `asset_url` texture map (JS can't hardcode CDN) → Task 2 Step 3. ✓ (Placed in `theme.liquid` beside `JJ_CASSETTE_TEX`, not `jj-homepage-body.liquid` — the established pattern and where the viewer script lives.)
- Inherited drag/flick/idle physics → Task 3 Step 2 reuses shared state. ✓
- Fallback on missing/failed textures → `createFallbackTexture` in `psMat`; grey canvas base in front composite. ✓
- Disposal / no GPU leak → existing `removeModel` array-material branch (confirmed covers ShaderMaterial `uTexture` + CanvasTexture). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `DIMS`/`FACE_ORDER`/`frontCompositeLayout` signatures match between Task 1 (definition), the tests, and Task 3 (consumption). `JJ_RECORDBOX_TEX` keys (`back, frontLeft, frontRight, sideLeft, sideRight, top, bottom`) match between Task 2 injection and Task 3 `TEX[key]` lookups — note `FACE_ORDER` non-front keys (`sideRight, sideLeft, top, bottom, back`) are all present in the injected map. ✓
