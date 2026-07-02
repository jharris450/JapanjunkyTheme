# Bundle Hero: Mystery-Box Fold-Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the homepage `jj-ring` into a 3D mystery-box hero: a closed box opens on click, fans 5 random 3D record meshes down the crescent for preview, and a Reroll button reshuffles them; a persistent button buys the bundle.

**Architecture:** Three pure UMD modules (shared PS1 shader, random-pool picker, open/reroll state machine) are unit-tested, then consumed by one new `japanjunky-bundle-stage.js` that owns a single three.js scene (box body + two hinged front flaps + 5 record planes) and all interaction. Liquid emits `JJ_BUNDLE` and the hero markup; `product-viewer.js` gains a preview mode.

**Tech Stack:** Shopify Liquid, vanilla JS (IIFE + UMD modules), three.js (`assets/three.min.js`), vitest (node env). Box textures + `japanjunky-recordbox.js` from the prior recordbox feature are reused.

## Global Constraints

- **PS1 render aesthetic** — every mesh uses the shared `PS1_VERT`/`PS1_FRAG` GLSL with `THREE.NearestFilter` on all textures. No new shaders, no linear filtering.
- **UMD pure modules** — `bundle-pool`, `bundle-fsm`, `ps1-shader` follow `assets/japanjunky-media-format.js` exactly (browser global + `module.exports`, NO DOM, NO three.js).
- **5 records are illustrative** — client-side random from `JJ_PRODUCTS`, records-only, distinct, excluding the bundle. Re-picked each load/reroll. No backend.
- **Records are preview-only** — clicking a record fills the info panel with Add-to-Cart suppressed. The only purchase is the bundle button.
- **Crescent layout** reuses the `ARC` offsets from `assets/japanjunky-ring-carousel.js` (lines 25–33) as 3D slot targets.
- **Box** is body (5 faces) + two front-flap meshes hinged on their outer vertical edges, textured from `window.JJ_RECORDBOX_TEX` (keys: back, frontLeft, frontRight, sideLeft, sideRight, top, bottom); dims from `window.JJ_Recordbox.DIMS` = `{w:2.0,h:2.0,d:0.5}`.
- **Input lock** — pointer input is ignored whenever `JJ_BundleFSM.isLocked(state)` is true (any state except `closed`/`open`).
- **`JJ_BUNDLE` shape:** `{ handle, productId, variantId, price, priceCents, available, title }`.
- **Deploy** — live only after merge to `main` (Shopify GitHub integration syncs `main`).

---

### Task 1: Shared PS1 shader module

**Files:**
- Create: `assets/japanjunky-ps1-shader.js`
- Test: `tests/ps1-shader.test.js`
- Modify: `assets/japanjunky-product-viewer.js:44-65` (consume the module instead of inline strings)

**Interfaces:**
- Produces: `window.JJ_PS1` / `module.exports` = `{ vert: string, frag: string }`. `vert` floors clip-space to `uResolution` (PS1 vertex snapping) and passes `vUv`; `frag` samples `uTexture` at `vUv`.

- [ ] **Step 1: Write the failing test**

Create `tests/ps1-shader.test.js`:

```js
import { describe, it, expect } from 'vitest';
import PS1 from '../assets/japanjunky-ps1-shader.js';

describe('PS1 shader module', () => {
  it('exports vert and frag as strings', () => {
    expect(typeof PS1.vert).toBe('string');
    expect(typeof PS1.frag).toBe('string');
  });
  it('vert snaps to uResolution and passes vUv', () => {
    expect(PS1.vert).toContain('uniform float uResolution;');
    expect(PS1.vert).toContain('varying vec2 vUv;');
    expect(PS1.vert).toContain('floor(');
    expect(PS1.vert).toContain('gl_Position');
  });
  it('frag samples uTexture at vUv', () => {
    expect(PS1.frag).toContain('uniform sampler2D uTexture;');
    expect(PS1.frag).toContain('texture2D(uTexture, vUv)');
    expect(PS1.frag).toContain('gl_FragColor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ps1-shader`
Expected: FAIL — cannot resolve `../assets/japanjunky-ps1-shader.js`.

- [ ] **Step 3: Write the module**

Create `assets/japanjunky-ps1-shader.js` (GLSL copied verbatim from the current `product-viewer.js` PS1 strings):

```js
/**
 * japanjunky-ps1-shader.js
 * Shared PS1 vertex-snapping shader (vert) + textured passthrough (frag).
 * UMD: window.JJ_PS1 as a classic <script>, module.exports under Vitest.
 * No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_PS1 = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var vert = [
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

  var frag = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  gl_FragColor = texColor;',
    '}'
  ].join('\n');

  return { vert: vert, frag: frag };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ps1-shader`
Expected: PASS.

- [ ] **Step 5: Consume the module in product-viewer.js**

In `assets/japanjunky-product-viewer.js`, replace the inline `PS1_VERT`/`PS1_FRAG` definitions (currently lines 44–65) with a reference to the shared module, keeping the same variable names so the rest of the file is untouched:

```js
  // ─── PS1 Shaders (shared module, with inline fallback) ────────
  var _PS1 = (typeof window !== 'undefined' && window.JJ_PS1) || null;
  var PS1_VERT = _PS1 ? _PS1.vert : [
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
  var PS1_FRAG = _PS1 ? _PS1.frag : [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  gl_FragColor = texColor;',
    '}'
  ].join('\n');
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS (all suites).

```bash
git add assets/japanjunky-ps1-shader.js tests/ps1-shader.test.js assets/japanjunky-product-viewer.js
git commit -m "refactor(shader): extract shared PS1 shader module"
```

---

### Task 2: Random-pool picker module

**Files:**
- Create: `assets/japanjunky-bundle-pool.js`
- Test: `tests/bundle-pool.test.js`

**Interfaces:**
- Produces: `window.JJ_BundlePool.pickRecords(products, n, excludeId, rng)`.
  - `products`: array of `JJ_PRODUCTS`-shaped entries (`{ id, format, available, ... }`). Note `JJ_PRODUCTS` is variant-expanded, so the same product `id` may appear multiple times.
  - Returns up to `n` **distinct-by-`id`** entries where `format === 'record'` and `available === true`, `id !== excludeId`.
  - `rng`: optional `() => number` in `[0,1)` (defaults to `Math.random`) — injectable for deterministic tests.

- [ ] **Step 1: Write the failing test**

Create `tests/bundle-pool.test.js`:

```js
import { describe, it, expect } from 'vitest';
import Pool from '../assets/japanjunky-bundle-pool.js';

function seqRng(values) {
  var i = 0;
  return function () { return values[i++ % values.length]; };
}

var sample = [
  { id: 1, format: 'record', available: true },
  { id: 1, format: 'record', available: true }, // dup product id (2nd variant)
  { id: 2, format: 'record', available: true },
  { id: 3, format: 'cd', available: true },      // wrong format
  { id: 4, format: 'record', available: false }, // unavailable
  { id: 5, format: 'record', available: true },
  { id: 6, format: 'record', available: true },
  { id: 99, format: 'record', available: true }  // the bundle itself
];

describe('pickRecords', () => {
  it('returns n distinct-by-id available records, excluding the bundle', () => {
    var out = Pool.pickRecords(sample, 3, 99, seqRng([0]));
    expect(out.length).toBe(3);
    var ids = out.map(function (r) { return r.id; });
    expect(new Set(ids).size).toBe(3);          // distinct
    expect(ids).not.toContain(99);              // excluded bundle
    expect(ids).not.toContain(3);               // no CDs
    expect(ids).not.toContain(4);               // no unavailable
  });
  it('caps at the number of eligible products when fewer than n', () => {
    var few = [
      { id: 1, format: 'record', available: true },
      { id: 2, format: 'record', available: true }
    ];
    expect(Pool.pickRecords(few, 5, 99).length).toBe(2);
  });
  it('returns empty array when nothing is eligible', () => {
    expect(Pool.pickRecords([{ id: 3, format: 'cd', available: true }], 5, 99)).toEqual([]);
    expect(Pool.pickRecords([], 5, 99)).toEqual([]);
  });
  it('is deterministic given a seeded rng', () => {
    var a = Pool.pickRecords(sample, 3, 99, seqRng([0.1, 0.9, 0.3, 0.7]));
    var b = Pool.pickRecords(sample, 3, 99, seqRng([0.1, 0.9, 0.3, 0.7]));
    expect(a.map(function (r) { return r.id; })).toEqual(b.map(function (r) { return r.id; }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bundle-pool`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the module**

Create `assets/japanjunky-bundle-pool.js`:

```js
/**
 * japanjunky-bundle-pool.js
 * Random-sample selection for the mystery-box hero.
 * UMD: window.JJ_BundlePool / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundlePool = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Up to n distinct-by-id available record products, excluding excludeId.
  function pickRecords(products, n, excludeId, rng) {
    rng = rng || Math.random;
    var seen = {};
    var eligible = [];
    for (var i = 0; i < (products || []).length; i++) {
      var p = products[i];
      if (!p || p.format !== 'record' || !p.available) continue;
      if (p.id === excludeId) continue;
      if (seen[p.id]) continue;
      seen[p.id] = true;
      eligible.push(p);
    }
    // Fisher–Yates shuffle using the injected rng, then take the first n.
    for (var j = eligible.length - 1; j > 0; j--) {
      var k = Math.floor(rng() * (j + 1));
      var tmp = eligible[j];
      eligible[j] = eligible[k];
      eligible[k] = tmp;
    }
    return eligible.slice(0, Math.max(0, n));
  }

  return { pickRecords: pickRecords };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bundle-pool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-pool.js tests/bundle-pool.test.js
git commit -m "feat(bundle): random-pool picker module with tests"
```

---

### Task 3: Open/reroll state machine module

**Files:**
- Create: `assets/japanjunky-bundle-fsm.js`
- Test: `tests/bundle-fsm.test.js`

**Interfaces:**
- Produces:
  - `window.JJ_BundleFSM.STATES` = `['closed','opening','open','retracting','closing','shaking']`.
  - `next(state, event)`: returns the next state, or the same state if the event is illegal. Events: `open` (closed→opening), `opened` (opening→open, shaking→opening handled via `open`), `reroll` (open→retracting), `retracted` (retracting→closing), `closed` (closing→shaking), `shaken` (shaking→opening).
  - `isLocked(state)`: `true` for every state except `closed` and `open`.

- [ ] **Step 1: Write the failing test**

Create `tests/bundle-fsm.test.js`:

```js
import { describe, it, expect } from 'vitest';
import FSM from '../assets/japanjunky-bundle-fsm.js';

describe('bundle FSM transitions', () => {
  it('opens from closed', () => {
    expect(FSM.next('closed', 'open')).toBe('opening');
    expect(FSM.next('opening', 'opened')).toBe('open');
  });
  it('runs the reroll cycle back to open', () => {
    expect(FSM.next('open', 'reroll')).toBe('retracting');
    expect(FSM.next('retracting', 'retracted')).toBe('closing');
    expect(FSM.next('closing', 'closed')).toBe('shaking');
    expect(FSM.next('shaking', 'shaken')).toBe('opening');
    expect(FSM.next('opening', 'opened')).toBe('open');
  });
  it('ignores illegal events (no-op)', () => {
    expect(FSM.next('closed', 'reroll')).toBe('closed');
    expect(FSM.next('open', 'open')).toBe('open');
    expect(FSM.next('opening', 'reroll')).toBe('opening');
  });
});

describe('bundle FSM isLocked', () => {
  it('is unlocked only in closed and open', () => {
    expect(FSM.isLocked('closed')).toBe(false);
    expect(FSM.isLocked('open')).toBe(false);
    ['opening', 'retracting', 'closing', 'shaking'].forEach(function (s) {
      expect(FSM.isLocked(s)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bundle-fsm`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the module**

Create `assets/japanjunky-bundle-fsm.js`:

```js
/**
 * japanjunky-bundle-fsm.js
 * Open/reroll state machine for the mystery-box hero.
 * UMD: window.JJ_BundleFSM / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundleFSM = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATES = ['closed', 'opening', 'open', 'retracting', 'closing', 'shaking'];

  // transition[state][event] = nextState
  var TRANSITIONS = {
    closed:     { open: 'opening' },
    opening:    { opened: 'open' },
    open:       { reroll: 'retracting' },
    retracting: { retracted: 'closing' },
    closing:    { closed: 'shaking' },
    shaking:    { shaken: 'opening' }
  };

  function next(state, event) {
    var row = TRANSITIONS[state];
    if (row && row[event]) return row[event];
    return state; // illegal event → no-op
  }

  function isLocked(state) {
    return state !== 'closed' && state !== 'open';
  }

  return { STATES: STATES, next: next, isLocked: isLocked };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bundle-fsm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-fsm.js tests/bundle-fsm.test.js
git commit -m "feat(bundle): open/reroll state machine with tests"
```

---

### Task 4: Liquid data, hero markup, script loading

**Files:**
- Modify: `sections/jj-homepage-body.liquid` (emit `JJ_BUNDLE`, drop featured-ring wiring)
- Modify: `layout/theme.liquid:181-207` (hero markup), `:298-311` (script loading)

**Interfaces:**
- Consumes: `JJ_BundlePool`, `JJ_BundleFSM`, `JJ_PS1`, `JJ_Recordbox` (must all load before `bundle-stage`).
- Produces:
  - `window.JJ_BUNDLE = { handle, productId, variantId, price, priceCents, available, title }` (or `null` if the bundle product isn't found).
  - `window.JJ_PRODUCTS` unchanged (the random pool).
  - DOM: `#jj-bundle-canvas`, `#jj-bundle-reroll`, `#jj-bundle-add` inside `#jj-ring`.

- [ ] **Step 1: Emit `JJ_BUNDLE` and drop the featured ring in `jj-homepage-body.liquid`**

Replace the `JJ_FEATURED` block (the `{%- if featured != blank ... %}` … `{%- endif %}` that assigns `window.JJ_FEATURED`) with a bundle lookup. The section currently begins:

```liquid
{%- assign catalog = section.settings.collection | default: collections['all'] -%}
{%- assign featured = section.settings.featured_collection -%}
```

Change to look up the bundle product and emit `JJ_BUNDLE` (keep `JJ_PRODUCTS` exactly as-is):

```liquid
{%- assign catalog = section.settings.collection | default: collections['all'] -%}
{%- assign bundle_handle = section.settings.bundle_handle | default: 'five-random-records' -%}
{%- assign bundle = all_products[bundle_handle] -%}
```

Then replace the `window.JJ_FEATURED = …` lines with:

```liquid
{%- if bundle != blank -%}
  {%- assign bundle_variant = bundle.selected_or_first_available_variant | default: bundle.variants.first -%}
window.JJ_BUNDLE = {
  "handle": {{ bundle.handle | json }},
  "productId": {{ bundle.id | json }},
  "variantId": {{ bundle_variant.id | json }},
  "price": {{ bundle_variant.price | money | json }},
  "priceCents": {{ bundle_variant.price | json }},
  "available": {{ bundle_variant.available }},
  "title": {{ bundle.title | json }}
};
{%- else -%}
window.JJ_BUNDLE = null;
{%- endif -%}
```

Also add a `bundle_handle` setting to the section `{% schema %}` settings array (so it's editable), and remove the now-unused `featured_collection` setting:

```json
{
  "type": "text",
  "id": "bundle_handle",
  "label": "Bundle product handle (ring hero)",
  "default": "five-random-records",
  "info": "The flagship bundle shown as the 3D mystery box."
}
```

- [ ] **Step 2: Add hero markup in `theme.liquid`**

In `layout/theme.liquid`, replace the ring container (lines 205–207):

```liquid
  {%- comment -%} Ring carousel: featured picks arc {%- endcomment -%}
  <div class="jj-ring" id="jj-ring" role="listbox" aria-roledescription="carousel" aria-label="Featured products">
    <div class="jj-ring__stage" id="jj-ring-stage"></div>
  </div>
```

with the bundle hero markup:

```liquid
  {%- comment -%} Mystery-box bundle hero {%- endcomment -%}
  <div class="jj-ring jj-ring--bundle" id="jj-ring" aria-label="Five Random Records bundle">
    <div class="jj-ring__stage" id="jj-ring-stage">
      <canvas id="jj-bundle-canvas" aria-label="3D mystery box with sample records"></canvas>
    </div>
    <div class="jj-bundle-controls">
      <button class="jj-action-btn" id="jj-bundle-reroll" type="button">[Reroll]</button>
      <button class="jj-action-btn" id="jj-bundle-add" type="button" disabled>[Add to Cart]</button>
    </div>
  </div>
```

- [ ] **Step 3: Update script loading in `theme.liquid`**

The homepage-gated block currently loads the ring carousel (lines 298–301):

```liquid
  {% unless template == 'product' or template.suffix == 'login' %}
  <script src="{{ 'japanjunky-ring-carousel.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-grid.js' | asset_url }}" defer></script>
  {% endunless %}
```

Replace the ring-carousel line with the bundle module chain (pure modules first, stage last; product-grid stays):

```liquid
  {% unless template == 'product' or template.suffix == 'login' %}
  <script src="{{ 'japanjunky-bundle-pool.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-fsm.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-stage.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-grid.js' | asset_url }}" defer></script>
  {% endunless %}
```

Then add the shared shader module load just before the existing `japanjunky-recordbox.js` line (so both are available to the stage and the viewer). The current lines read:

```liquid
  <script src="{{ 'japanjunky-recordbox.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-viewer.js' | asset_url }}" defer></script>
```

Change to:

```liquid
  <script src="{{ 'japanjunky-ps1-shader.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-recordbox.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-viewer.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Verify wiring**

Run: `npm test`
Expected: PASS (guards the pure modules; Liquid has no automated test).

Run: `grep -n "JJ_BUNDLE\|jj-bundle-canvas\|bundle-stage\|ps1-shader" layout/theme.liquid sections/jj-homepage-body.liquid`
Expected: the `JJ_BUNDLE` emit, the three `jj-bundle-*` DOM ids, and the new `<script>` includes all present; no remaining `window.JJ_FEATURED` or `ring-carousel.js` reference.

Run: `grep -c "JJ_FEATURED\|ring-carousel" layout/theme.liquid sections/jj-homepage-body.liquid`
Expected: `0` for both files.

- [ ] **Step 5: Commit**

```bash
git add sections/jj-homepage-body.liquid layout/theme.liquid
git commit -m "feat(bundle): emit JJ_BUNDLE, add hero markup, wire scripts"
```

---

### Task 5: Bundle stage — scene, box, open/close

**Files:**
- Create: `assets/japanjunky-bundle-stage.js`
- Create: `assets/japanjunky-bundle.css`
- Modify: `layout/theme.liquid` (load `japanjunky-bundle.css` near the other stylesheet tags, e.g. after `japanjunky-ring-carousel.css` at line 33)

**Interfaces:**
- Consumes: `THREE`, `window.JJ_PS1`, `window.JJ_Recordbox`, `window.JJ_RECORDBOX_TEX`, `window.JJ_BundleFSM`, DOM `#jj-bundle-canvas`.
- Produces (module-internal, referenced by Tasks 6–8): a scene with `boxGroup` (containing `leftFlap`, `rightFlap` pivots), functions `setState(s)`, `openFlaps(t)`, `closeFlaps(t)`, a `tick` rAF loop, and `state` (current FSM state). The IIFE exposes nothing globally except it self-initializes on DOMContentLoaded.

- [ ] **Step 1: Add the stylesheet**

Create `assets/japanjunky-bundle.css`:

```css
/* Mystery-box bundle hero */
.jj-ring--bundle { position: relative; }
#jj-bundle-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.jj-bundle-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 5;
}
@media (max-width: 640px) {
  .jj-bundle-controls { bottom: 8px; }
}
```

In `layout/theme.liquid`, after line 33 (`japanjunky-ring-carousel.css`), add:

```liquid
  {{ 'japanjunky-bundle.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 2: Write the stage scaffold + box builder + open/close**

Create `assets/japanjunky-bundle-stage.js`:

```js
/**
 * japanjunky-bundle-stage.js
 * 3D mystery-box hero: box (body + two hinged flaps) + 5 sample record meshes.
 * Consumes: THREE, JJ_PS1, JJ_Recordbox, JJ_RECORDBOX_TEX, JJ_BundleFSM,
 *           JJ_BundlePool, JJ_BUNDLE, JJ_PRODUCTS.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('jj-bundle-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var TEX = window.JJ_RECORDBOX_TEX || {};
  var DIMS = (window.JJ_Recordbox && window.JJ_Recordbox.DIMS) || { w: 2.0, h: 2.0, d: 0.5 };
  var PS1 = window.JJ_PS1 || { vert: '', frag: '' };
  var FSM = window.JJ_BundleFSM;
  var shaderRes = 240;

  // ─── Renderer / scene / camera ───────────────────────────────
  var renderer, scene, camera, rafId = null, animating = false, lastTime = 0;
  var webglOK = true;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
  } catch (e) { webglOK = false; }

  if (!webglOK) { canvas.classList.add('jj-bundle--nowebgl'); return; }

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  var textureLoader = new THREE.TextureLoader();
  function loadTex(url) {
    if (!url) return null;
    var t = textureLoader.load(url);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    return t;
  }
  function fallbackTex() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var x = c.getContext('2d'); x.fillStyle = '#8a8a86'; x.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
  }
  function psMat(tex) {
    return new THREE.ShaderMaterial({
      uniforms: { uResolution: { value: shaderRes }, uTexture: { value: tex || fallbackTex() } },
      vertexShader: PS1.vert, fragmentShader: PS1.frag, side: THREE.DoubleSide
    });
  }

  // ─── Box: body (5 faces) + two hinged front flaps ────────────
  var boxGroup = new THREE.Group();
  var leftFlap, rightFlap; // pivot Object3Ds

  function buildBox() {
    var w = DIMS.w, h = DIMS.h, d = DIMS.d;

    // Body: BoxGeometry with the front (+Z) face transparent; other 5 faces textured.
    var bodyGeo = new THREE.BoxGeometry(w, h, d);
    var invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    // BoxGeometry face order [+X,-X,+Y,-Y,+Z,-Z]:
    var bodyMats = [
      psMat(loadTex(TEX.sideRight)), // +X
      psMat(loadTex(TEX.sideLeft)),  // -X
      psMat(loadTex(TEX.top)),       // +Y
      psMat(loadTex(TEX.bottom)),    // -Y
      invisible,                     // +Z front (covered by flaps)
      psMat(loadTex(TEX.back))       // -Z
    ];
    var body = new THREE.Mesh(bodyGeo, bodyMats);
    boxGroup.add(body);

    // Two front flaps, each a half-width plane hinged on its OUTER vertical edge.
    var halfW = w / 2;
    var frontZ = d / 2 + 0.001;

    // Left flap: pivot at the box's left edge (x = -w/2); plane spans pivot→center.
    leftFlap = new THREE.Object3D();
    leftFlap.position.set(-halfW, 0, frontZ);
    var lGeo = new THREE.PlaneGeometry(halfW, h);
    var lMesh = new THREE.Mesh(lGeo, psMat(loadTex(TEX.frontLeft)));
    lMesh.position.set(halfW / 2, 0, 0); // shift so inner edge meets center
    leftFlap.add(lMesh);
    boxGroup.add(leftFlap);

    // Right flap: pivot at the box's right edge (x = +w/2); plane spans center→pivot.
    rightFlap = new THREE.Object3D();
    rightFlap.position.set(halfW, 0, frontZ);
    var rGeo = new THREE.PlaneGeometry(halfW, h);
    var rMesh = new THREE.Mesh(rGeo, psMat(loadTex(TEX.frontRight)));
    rMesh.position.set(-halfW / 2, 0, 0);
    rightFlap.add(rMesh);
    boxGroup.add(rightFlap);

    scene.add(boxGroup);
  }

  // ─── Flap open/close (t: 0 closed → 1 open) ──────────────────
  var OPEN_ANGLE = 1.92; // ~110deg
  function setFlaps(t) {
    // Left flap swings to +Y (opens to the left), right flap to -Y.
    if (leftFlap) leftFlap.rotation.y = OPEN_ANGLE * t;
    if (rightFlap) rightFlap.rotation.y = -OPEN_ANGLE * t;
  }

  // Generic eased tween driver (0→1) used by open/close/slide.
  function tween(durationMs, onUpdate, onDone) {
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / durationMs, 1);
      var e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      onUpdate(e);
      if (p < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  var state = 'closed';
  function setState(s) { state = s; }

  function openFlaps(done) {
    setState(FSM.next(state, 'open')); // → opening
    tween(600, function (e) { setFlaps(e); }, function () {
      setState(FSM.next(state, 'opened')); // → open
      if (done) done();
    });
  }
  function closeFlaps(done) {
    tween(500, function (e) { setFlaps(1 - e); }, function () { if (done) done(); });
  }

  // ─── Resize + loop ───────────────────────────────────────────
  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    try { new ResizeObserver(resize).observe(canvas); } catch (e) {}
  }

  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);
    lastTime = now;
    renderer.render(scene, camera);
  }
  function startLoop() {
    if (animating) return;
    animating = true; lastTime = performance.now(); resize();
    rafId = requestAnimationFrame(tick);
  }

  // ─── Init ────────────────────────────────────────────────────
  buildBox();
  setFlaps(0); // closed
  startLoop();

  // Temporary wiring so open is testable in-browser this task; refined in Task 7.
  canvas.addEventListener('click', function () {
    if (FSM.isLocked(state)) return;
    if (state === 'closed') openFlaps();
  });

  // Expose internals for later tasks in this same file (they extend this IIFE).
  window.__JJ_BUNDLE_STAGE__ = {
    scene: scene, camera: camera, renderer: renderer, boxGroup: boxGroup,
    psMat: psMat, loadTex: loadTex, tween: tween,
    getState: function () { return state; }, setState: setState,
    openFlaps: openFlaps, closeFlaps: closeFlaps, startLoop: startLoop
  };
})();
```

> Note: `window.__JJ_BUNDLE_STAGE__` is an internal handle used only to keep Tasks 6–8 appending to the same module cleanly; it is not a public API. Tasks 6–8 add their functions inside this IIFE and reference these locals directly, not through the global.

- [ ] **Step 3: Verify (browser)**

Prerequisite: homepage loads with the Task 4 markup + scripts. Load the homepage.
Confirm:
- The closed box renders in the hero with correct face textures (front = two flaps flush, slotted sides, top/bottom, back on rotate — box faces camera).
- Clicking the box swings both front flaps open (~110°) revealing the dark interior; no console errors.
- No WebGL context errors; `npm test` still green (pure modules unaffected).

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-bundle-stage.js assets/japanjunky-bundle.css layout/theme.liquid
git commit -m "feat(bundle): 3D box scene with hinged flap open/close"
```

---

### Task 6: Bundle stage — record fold-out + crescent + idle

**Files:**
- Modify: `assets/japanjunky-bundle-stage.js` (add record building, slide-out to crescent, idle bob; call from open flow)

**Interfaces:**
- Consumes: Task 5 internals (`scene`, `psMat`, `loadTex`, `tween`, `boxGroup`, `openFlaps`), `window.JJ_BundlePool`, `window.JJ_BUNDLE`, `window.JJ_PRODUCTS`.
- Produces: `records` array (each `{ mesh, slot, data }`), `dealRecords()`, `slideOut(done)`, `slideIn(done)`, `updateRecords(dt)` idle bob, `ARC_TARGETS` (3D crescent positions). Records are children of `scene`, hidden at box center until slid out.

- [ ] **Step 1: Add crescent targets + record builder**

In `assets/japanjunky-bundle-stage.js`, add these before the `// ─── Init ───` block. `ARC_TARGETS` mirrors the `ARC` offsets from `assets/japanjunky-ring-carousel.js:25-33`, converted from px to scene units (divide px by ~90 to land in view; center slot omitted since the box sits there):

```js
  // ─── Sample records (crescent fold-out) ──────────────────────
  // 5 slots down a vertical crescent to the box's right, mirroring the
  // ring-carousel ARC (px offsets / 90 → scene units).
  var ARC_TARGETS = [
    { x: 2.0, y: 0.83,  scale: 0.98 },
    { x: 2.0, y: 0.28,  scale: 0.98 },
    { x: 2.4, y: -0.28, scale: 0.86 },
    { x: 2.4, y: -0.83, scale: 0.86 },
    { x: 2.9, y: -1.38, scale: 0.72 }
  ];

  var records = []; // { mesh, slot, data, phase }
  var RECORD_SIZE = 1.4;

  function clearRecords() {
    for (var i = 0; i < records.length; i++) {
      var m = records[i].mesh;
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (m.material.uniforms && m.material.uniforms.uTexture && m.material.uniforms.uTexture.value) {
          m.material.uniforms.uTexture.value.dispose();
        }
        m.material.dispose();
      }
    }
    records = [];
  }

  function buildRecordMesh(data) {
    var geo = new THREE.PlaneGeometry(RECORD_SIZE, RECORD_SIZE);
    var mesh = new THREE.Mesh(geo, psMat(loadTex(data.image)));
    // Start hidden at the box's front-center (inside the box mouth).
    mesh.position.set(0, 0, 0.1);
    mesh.scale.setScalar(0.2);
    mesh.visible = false;
    mesh.userData.isRecord = true;
    scene.add(mesh);
    return mesh;
  }

  function dealRecords() {
    clearRecords();
    var pool = (window.JJ_BundlePool && window.JJ_PRODUCTS)
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (window.JJ_BUNDLE && window.JJ_BUNDLE.productId))
      : [];
    for (var i = 0; i < pool.length && i < ARC_TARGETS.length; i++) {
      records.push({ mesh: buildRecordMesh(pool[i]), slot: ARC_TARGETS[i], data: pool[i], phase: Math.random() * Math.PI * 2 });
    }
  }
```

- [ ] **Step 2: Add slide-out / slide-in / idle**

Add after `dealRecords`:

```js
  var recordsOut = false;

  function slideOut(done) {
    recordsOut = true;
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        rec.mesh.visible = true;
        var sx = 0, sy = 0, ss = 0.2;
        var tx = rec.slot.x, ty = rec.slot.y, ts = rec.slot.scale;
        setTimeout(function () {
          tween(500, function (e) {
            rec.mesh.position.x = sx + (tx - sx) * e;
            rec.mesh.position.y = sy + (ty - sy) * e;
            var s = ss + (ts - ss) * e;
            rec.mesh.scale.setScalar(s);
          }, function () { pending--; if (pending === 0 && done) done(); });
        }, idx * 90); // staggered deal
      })(records[i], i);
    }
  }

  function slideIn(done) {
    recordsOut = false;
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var sx = rec.mesh.position.x, sy = rec.mesh.position.y, ss = rec.mesh.scale.x;
        tween(360, function (e) {
          rec.mesh.position.x = sx * (1 - e);
          rec.mesh.position.y = sy * (1 - e);
          rec.mesh.scale.setScalar(ss + (0.2 - ss) * e);
        }, function () { rec.mesh.visible = false; pending--; if (pending === 0 && done) done(); });
      })(records[i]);
    }
  }

  function updateRecords(dt, now) {
    if (!recordsOut) return;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      rec.mesh.position.y = rec.slot.y + Math.sin(now * 0.001 + rec.phase) * 0.04;
    }
  }
```

- [ ] **Step 3: Wire records into the open flow + loop**

Change the `tick` loop to advance idle bob — replace the `tick` body's render line with a dt-aware version:

```js
  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);
    var dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    updateRecords(dt, now);
    renderer.render(scene, camera);
  }
```

Replace the temporary click handler from Task 5 with one that also deals + slides records after the flaps open:

```js
  canvas.addEventListener('click', function () {
    if (FSM.isLocked(state)) return;
    if (state === 'closed') {
      dealRecords();
      openFlaps(function () { slideOut(); });
    }
  });
```

- [ ] **Step 4: Verify (browser)**

Load the homepage. Click the closed box.
Confirm: flaps open, then 5 record covers slide out one-by-one and settle into a vertical crescent to the right of the box, each gently bobbing. Covers show real product art. If the catalog has fewer than 5 available records, fewer appear with no error/gap crash. No console errors.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-stage.js
git commit -m "feat(bundle): deal 5 sample records into the crescent on open"
```

---

### Task 7: Bundle stage — record preview (raycast) + product-viewer preview mode

**Files:**
- Modify: `assets/japanjunky-bundle-stage.js` (raycast pick → focus + dispatch preview select/deselect)
- Modify: `assets/japanjunky-product-viewer.js` (honor `detail.preview`)

**Interfaces:**
- Consumes: Task 6 internals (`records`, `camera`, `scene`), the `jj:product-selected` / `jj:product-deselected` contract from `japanjunky-ring-carousel.js` (detail fields: `handle, title, artist, vendor, price, code, condition, format, formatLabel, year, label, jpName, jpTitle, imageUrl, imageBackUrl, type3d, variantId, available` + new `preview: true`).
- Produces: focus behavior (selected record eases to front-center, enlarges, slow-spins), deselect returns it to slot.

- [ ] **Step 1: Add raycast picking + focus/deselect to the stage**

In `assets/japanjunky-bundle-stage.js`, add a raycaster and focus state near the record functions:

```js
  // ─── Preview selection (raycast) ─────────────────────────────
  var raycaster = new THREE.Raycaster();
  var focused = null; // { rec, homeX, homeY, homeScale }

  function recordDetail(data) {
    return {
      handle: data.handle, title: data.title, artist: data.artist, vendor: data.vendor,
      price: data.price, code: data.code, condition: data.condition, format: data.format,
      formatLabel: data.formatLabel, year: data.year, label: data.label,
      jpName: data.jpName, jpTitle: data.jpTitle, imageUrl: data.image,
      imageBackUrl: data.imageBack, type3d: data.type3d, variantId: String(data.variantId),
      available: data.available, preview: true
    };
  }

  function focusRecord(rec) {
    if (focused && focused.rec === rec) return;
    deselect();
    focused = { rec: rec, homeX: rec.slot.x, homeY: rec.slot.y, homeScale: rec.slot.scale };
    tween(300, function (e) {
      rec.mesh.position.x = focused.homeX * (1 - e) + 0 * e;
      rec.mesh.position.y = focused.homeY * (1 - e) + 0 * e;
      rec.mesh.position.z = 0.1 + 1.4 * e; // pull toward camera
      rec.mesh.scale.setScalar(focused.homeScale + (1.3 - focused.homeScale) * e);
    });
    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: recordDetail(rec.data) }));
  }

  function deselect() {
    if (!focused) return;
    var rec = focused.rec, hx = focused.homeX, hy = focused.homeY, hs = focused.homeScale;
    var sx = rec.mesh.position.x, sy = rec.mesh.position.y, sz = rec.mesh.position.z, ss = rec.mesh.scale.x;
    focused = null;
    tween(280, function (e) {
      rec.mesh.position.x = sx + (hx - sx) * e;
      rec.mesh.position.y = sy + (hy - sy) * e;
      rec.mesh.position.z = sz + (0.1 - sz) * e;
      rec.mesh.scale.setScalar(ss + (hs - ss) * e);
    });
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }
```

Add slow-spin for the focused record inside `updateRecords` (append before its closing brace):

```js
    if (focused) focused.rec.mesh.rotation.y += dt * 0.6;
```

- [ ] **Step 2: Replace the click handler with pointer picking**

Replace the Task 6 click handler with one that raycasts records first, then falls back to box-open on empty space:

```js
  canvas.addEventListener('click', function (e) {
    if (FSM.isLocked(state)) return;
    var r = canvas.getBoundingClientRect();
    var mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var my = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera({ x: mx, y: my }, camera);

    if (state === 'open' && records.length) {
      var meshes = records.map(function (rec) { return rec.mesh; });
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        var hitMesh = hits[0].object;
        for (var i = 0; i < records.length; i++) {
          if (records[i].mesh === hitMesh) { focusRecord(records[i]); return; }
        }
      }
      deselect(); // clicked empty space while open
      return;
    }
    if (state === 'closed') {
      dealRecords();
      openFlaps(function () { slideOut(); });
    }
  });
```

- [ ] **Step 3: Honor `preview` in product-viewer.js**

In `assets/japanjunky-product-viewer.js`, the `jj:product-selected` handler currently reads:

```js
  document.addEventListener('jj:product-selected', function (e) {
    var data = e.detail;
    coordSelect();
    createModel(data);
    showProductInfo(data);
  });
```

Change it to skip 3D + screensaver coordination in preview mode and suppress Add-to-Cart:

```js
  document.addEventListener('jj:product-selected', function (e) {
    var data = e.detail;
    if (data.preview) {
      showProductInfo(data);
      if (piAddToCart) { piAddToCart.style.display = 'none'; }
      return;
    }
    if (piAddToCart) { piAddToCart.style.display = ''; }
    coordSelect();
    createModel(data);
    showProductInfo(data);
  });
```

- [ ] **Step 4: Verify (browser)**

Load the homepage, open the box. Click a record in the crescent.
Confirm: it eases to front-center, enlarges, and slow-spins; the info panel fills with that record's artist/title/meta/price and shows **no Add-to-Cart** button; the `[View]` link (if present) still points to the product. Click empty space → record returns to its slot and the panel deselects. No duplicate 3D model appears over the info panel. No console errors.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-stage.js assets/japanjunky-product-viewer.js
git commit -m "feat(bundle): record preview focus + product-viewer preview mode"
```

---

### Task 8: Bundle stage — reroll, bundle cart button, edge cases

**Files:**
- Modify: `assets/japanjunky-bundle-stage.js` (reroll sequence via FSM, box shake, bundle add-to-cart button, reduced-motion, `JJ_BUNDLE` absent/unavailable)

**Interfaces:**
- Consumes: Task 5–7 internals (`state`, `FSM`, `slideIn`, `slideOut`, `closeFlaps`, `openFlaps`, `dealRecords`, `deselect`, `boxGroup`, `tween`), DOM `#jj-bundle-reroll`, `#jj-bundle-add`, `window.JJ_BUNDLE`, `window.jjRefreshCart`.
- Produces: full reroll cycle, working bundle purchase button, graceful degraded states.

- [ ] **Step 1: Add box shake + reroll orchestration**

In `assets/japanjunky-bundle-stage.js`, add a shake and the reroll sequence:

```js
  // ─── Reroll ──────────────────────────────────────────────────
  function shakeBox(done) {
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / 420, 1);
      boxGroup.rotation.z = Math.sin(p * Math.PI * 6) * 0.12 * (1 - p);
      if (p < 1) requestAnimationFrame(step);
      else { boxGroup.rotation.z = 0; if (done) done(); }
    }
    requestAnimationFrame(step);
  }

  function reroll() {
    if (state !== 'open') return;
    deselect();
    setState(FSM.next(state, 'reroll')); // → retracting
    slideIn(function () {
      setState(FSM.next(state, 'retracted')); // → closing
      closeFlaps(function () {
        setState(FSM.next(state, 'closed')); // → shaking
        shakeBox(function () {
          setState(FSM.next(state, 'shaken')); // → opening
          dealRecords();
          tween(600, function (e) { setFlaps(e); }, function () {
            setState(FSM.next(state, 'opened')); // → open
            slideOut();
          });
        });
      });
    });
  }
```

- [ ] **Step 2: Wire the Reroll + bundle Add-to-Cart buttons**

Add near Init:

```js
  // ─── Controls ────────────────────────────────────────────────
  var rerollBtn = document.getElementById('jj-bundle-reroll');
  if (rerollBtn) {
    rerollBtn.addEventListener('click', function () {
      if (FSM.isLocked(state) || state !== 'open') return;
      reroll();
    });
  }

  var addBtn = document.getElementById('jj-bundle-add');
  var BUNDLE = window.JJ_BUNDLE || null;
  if (addBtn) {
    if (!BUNDLE) {
      addBtn.style.display = 'none';
    } else if (!BUNDLE.available) {
      addBtn.textContent = '[Unavailable]';
      addBtn.disabled = true;
    } else {
      addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
      addBtn.disabled = false;
      addBtn.addEventListener('click', function () {
        if (addBtn.disabled) return;
        addBtn.textContent = '[Adding...]';
        addBtn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parseInt(BUNDLE.variantId, 10), quantity: 1 })
        }).then(function (res) {
          if (!res.ok) throw new Error('cart');
          return res.json();
        }).then(function () {
          addBtn.textContent = '[OK]';
          if (window.jjRefreshCart) window.jjRefreshCart();
          setTimeout(function () {
            addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
            addBtn.disabled = false;
          }, 1500);
        }).catch(function () {
          addBtn.textContent = '[ERR]';
          setTimeout(function () {
            addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
            addBtn.disabled = false;
          }, 1500);
        });
      });
    }
  }
```

- [ ] **Step 3: Honor reduced motion**

Add near the top of the IIFE (after `shaderRes` is defined) and use it to shorten tweens:

```js
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Then in `tween`, collapse duration when reduced motion is on — change the `tween` signature body's first line:

```js
  function tween(durationMs, onUpdate, onDone) {
    if (reduceMotion) durationMs = Math.min(durationMs, 80);
    var start = performance.now();
    // ...unchanged...
```

- [ ] **Step 4: Verify (browser)**

Load the homepage.
Confirm the full flow:
- Closed box → click → flaps open, 5 records deal out.
- Click a record → preview (front-center, info panel, no ATC). Click empty → deselect.
- **Reroll** → records slide back in → flaps close → box shakes → flaps reopen → a *fresh* random 5 deal out. Rapid Reroll clicks during the animation are ignored (input lock).
- Bundle button: with the product priced+available, reads `[Add 5 Random Records — $X]` and adds to cart (cart count updates); with it unavailable, reads `[Unavailable]` disabled; with no bundle product, the button is hidden.
- Toggle OS "reduce motion" → animations collapse to quick fades, same end states.
- Mobile width → box + crescent + controls fit and are usable.
- `npm test` still green.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-stage.js
git commit -m "feat(bundle): reroll cycle, bundle add-to-cart, edge cases"
```

---

## Self-Review

**Spec coverage:**
- Repurpose hero / remove featured collection → Task 4 (drops `JJ_FEATURED`, retires ring-carousel). ✓
- Closed box on load, click to open → Task 5. ✓
- 5 simultaneous 3D records fold out into crescent → Task 6 (`ARC_TARGETS`, `slideOut`). ✓
- Illustrative random, records-only, distinct, exclude bundle → Task 2 (`pickRecords`) consumed in Task 6. ✓
- Record click = preview only, no ATC → Task 7 (focus + `preview:true`; viewer hides ATC). ✓
- Reroll: retract→close→shake→reopen→re-deal → Task 8 (`reroll`, `shakeBox`) via FSM (Task 3). ✓
- Dedicated persistent bundle button → Task 8 (`#jj-bundle-add`). ✓
- Box = body + two hinged flaps from recordbox textures → Task 5 (`buildBox`, `setFlaps`). ✓
- Shared PS1 shader → Task 1. ✓
- Input lock during animation → Task 3 `isLocked`, enforced in Tasks 5–8 handlers. ✓
- Edge cases (<5, 0, unavailable, missing bundle, reduced-motion, no-WebGL, texture 404) → Tasks 2/5/6/8 + fallback textures. ✓
- Unit tests for pool + fsm + shader → Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Browser-verification steps are concrete (exact expected behavior). ✓

**Type consistency:** `pickRecords(products, n, excludeId, rng)` used consistently (Task 2 def, Task 6 call with `JJ_BUNDLE.productId`). FSM events (`open/opened/reroll/retracted/closed/shaken`) match between Task 3 table and Tasks 5/8 callers. `JJ_BUNDLE` fields (`productId, variantId, price, available`) consistent across Task 4 emit and Tasks 6/8 use. `JJ_PS1.{vert,frag}` consistent across Tasks 1/5. Record detail fields mirror the existing `jj:product-selected` contract with `preview:true` added (Task 7), honored in the viewer (Task 7). ✓

**Note on stage-file tasks (5–8):** all four modify the single `japanjunky-bundle-stage.js` IIFE and are verified in-browser (WebGL animation isn't unit-testable in node). The unit-testable logic was deliberately extracted into Tasks 1–3 so the untested surface is confined to rendering/animation glue. Animation constants (durations, `OPEN_ANGLE`, `ARC_TARGETS`, camera distance) are starting values expected to be tuned during the Task 5–8 browser checks.
