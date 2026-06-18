# Cassette Walkman (WM-F45) Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photo-textured 3D Sony WM-F45 cassette Walkman that replaces the placeholder box when the spawned toolbox player is the `cassette` tool: a clamshell whose front window-lid hinges open, with a real see-through window over a low-poly cassette that spins while playing.

**Architecture:** A `sharp` script crops the user's reference photos into committed `assets/cassette-*.png` face textures (front gets a transparent window punched in). A builder module (`japanjunky-cassette-model.js`) assembles a `THREE.Group` (body box with photo faces via unlit `MeshBasicMaterial` + NearestFilter, a right-hinged lid, a translucent window pane, a spinning cassette mesh). The player module mounts a small WebGL canvas (its own renderer/scene/camera) and renders the model for the `cassette` tool, driving open→insert→close + reel-spin from the existing accept/stop paths. Pure lid-angle/easing helpers are unit-tested.

**Tech Stack:** Node + `sharp` (texture prep), `THREE` r-whatever is vendored in `assets/three.min.js` (global, loaded site-wide), vanilla ES5-style JS, Vitest for the pure helpers.

**Verified facts:**
- Source photos (user's own unit) in `C:\Users\Jacob\Desktop\cassette\`: `front.png` 853×960, `back.png` 760×902, `leftside.png` 958×602, `rightside.png` 956×551, `top.png` 946×692, `opentop.png` 741×960, `openbottom.png` 867×960.
- Real device proportions: 10.6 (W) × 14.0 (H) × 4.3 (D) cm → model units 1.06 × 1.40 × 0.43.
- `THREE` is global (`assets/three.min.js`, `layout/theme.liquid:266`, defer) before `japanjunky-player.js` (line 284). Product-viewer's PS1 shader is private to its IIFE — not reused here.
- Player (`assets/japanjunky-player.js`): IIFE, `spawn(tool,x,y)` builds a `.jj-player` container with a `.jj-player__label`; `tryLoadProduct(product)` accept branch flashes + calls `JJ_PlayerAudio.play`; `despawn()` stops audio + tears down. `currentTool` holds the tool. Physics drives `el.style.transform`; a model render loop must NOT touch that transform (render into a child canvas instead).
- `sharp` is a devDependency; `.gitignore` covers `node_modules`. Vitest config includes `tests/**/*.test.js`.
- BoxGeometry material index order: 0=+x(right) 1=-x(left) 2=+y(top) 3=-y(bottom) 4=+z(front) 5=-z(back).

---

## File Structure

- **Create:** `tools/cassette-textures/build.js` — `sharp` crop/alpha script (reads desktop photos, writes `assets/cassette-*.png`).
- **Create (committed outputs):** `assets/cassette-front.png` (alpha window), `assets/cassette-back.png`, `assets/cassette-left.png`, `assets/cassette-right.png`, `assets/cassette-top.png`, `assets/cassette-deck.png`, `assets/cassette-lid-inner.png`.
- **Create:** `tools/cassette-textures/preview.html` — standalone three.js preview for eyeballing the model without deploying.
- **Create:** `assets/japanjunky-cassette-math.js` — UMD pure helpers (`clamp`, `easeInOut`, `lidAngle`).
- **Create:** `tests/cassette-math.test.js` — unit tests.
- **Create:** `assets/japanjunky-cassette-model.js` — `window.JJ_CassetteModel.build(THREE, assetUrl)`.
- **Modify:** `assets/japanjunky-player.js` — mount WebGL canvas + render the model for `cassette`; wire open/insert/close + reel spin.
- **Modify:** `layout/theme.liquid` — expose `window.JJ_CASSETTE_TEX` (asset URL map) + load the two new scripts.

---

### Task 1: Texture prep

**Files:**
- Create: `tools/cassette-textures/build.js`
- Create (outputs): `assets/cassette-*.png`

- [ ] **Step 1: Write the build script**

Create `tools/cassette-textures/build.js`:

```javascript
/**
 * Crops the WM-F45 reference photos into face textures for the cassette model.
 * Run: node tools/cassette-textures/build.js
 * Source dir defaults to the user's desktop folder; override with $CASSETTE_SRC.
 *
 * Outputs (assets/): cassette-front.png (window punched to alpha), cassette-back,
 * cassette-left, cassette-right, cassette-top, cassette-deck, cassette-lid-inner.
 * Crop boxes are in SOURCE pixels — eyeball the outputs and tune as needed.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = process.env.CASSETTE_SRC || 'C:/Users/Jacob/Desktop/cassette';
const OUT = path.resolve(__dirname, '../../assets');
const MAX = 512; // longest output edge (NPOT ok: model uses NearestFilter + no mipmaps)

// { src, out, crop:{left,top,width,height} }  — crops in source pixels.
const FACES = [
  { src: 'front.png',      out: 'cassette-front.png',     crop: { left: 70,  top: 30,  width: 720, height: 910 } },
  { src: 'back.png',       out: 'cassette-back.png',      crop: { left: 55,  top: 20,  width: 655, height: 870 } },
  { src: 'leftside.png',   out: 'cassette-left.png',      crop: { left: 110, top: 120, width: 770, height: 370 } },
  { src: 'rightside.png',  out: 'cassette-right.png',     crop: { left: 110, top: 80,  width: 770, height: 380 } },
  { src: 'top.png',        out: 'cassette-top.png',       crop: { left: 110, top: 150, width: 730, height: 370 } },
  { src: 'openbottom.png', out: 'cassette-deck.png',      crop: { left: 80,  top: 120, width: 720, height: 720 } },
  { src: 'opentop.png',    out: 'cassette-lid-inner.png', crop: { left: 60,  top: 40,  width: 640, height: 560 } }
];

// Window opening as a fraction of the cropped FRONT output (rounded rect).
const WINDOW = { x: 0.16, y: 0.10, w: 0.68, h: 0.34, r: 0.10 };

function fitSize(w, h) {
  var s = MAX / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function run() {
  if (!fs.existsSync(SRC)) {
    console.error('Source folder not found: ' + SRC + '\nSet CASSETTE_SRC to the reference photo folder.');
    process.exit(1);
  }
  for (const f of FACES) {
    const dim = fitSize(f.crop.width, f.crop.height);
    let img = sharp(path.join(SRC, f.src)).extract(f.crop).resize(dim.w, dim.h);

    if (f.out === 'cassette-front.png') {
      // Punch a transparent rounded-rect window via a dest-out composite.
      const wx = Math.round(WINDOW.x * dim.w), wy = Math.round(WINDOW.y * dim.h);
      const ww = Math.round(WINDOW.w * dim.w), wh = Math.round(WINDOW.h * dim.h);
      const rr = Math.round(WINDOW.r * Math.min(ww, wh));
      const mask = Buffer.from(
        '<svg width="' + dim.w + '" height="' + dim.h + '">' +
        '<rect x="' + wx + '" y="' + wy + '" width="' + ww + '" height="' + wh +
        '" rx="' + rr + '" ry="' + rr + '" fill="#fff"/></svg>'
      );
      img = img.ensureAlpha().composite([{ input: mask, blend: 'dest-out' }]);
    }

    await img.png().toFile(path.join(OUT, f.out));
    console.log('wrote ' + f.out + ' (' + dim.w + 'x' + dim.h + ')');
  }
  console.log('done.');
}

run();
```

- [ ] **Step 2: Run it**

Run: `node tools/cassette-textures/build.js`
Expected: seven `wrote cassette-*.png` lines, `done.`, and the files in `assets/`.

- [ ] **Step 3: Eyeball and tune the crops**

Read each output (`assets/cassette-front.png`, `-back`, `-left`, `-right`, `-top`, `-deck`, `-lid-inner`). For each, confirm the device fills the frame with minimal background. For `cassette-front.png`, confirm the transparent window sits over the cassette-window opening (you'll see a checkerboard/transparent rounded rect there). If any crop is off, adjust that face's `crop` box (and `WINDOW` for the front) in the script and re-run `node tools/cassette-textures/build.js`. Repeat until each face is framed and the window is positioned. (Reading a PNG renders it, so you can inspect directly.)

- [ ] **Step 4: Commit**

```bash
git add tools/cassette-textures/build.js assets/cassette-front.png assets/cassette-back.png assets/cassette-left.png assets/cassette-right.png assets/cassette-top.png assets/cassette-deck.png assets/cassette-lid-inner.png
git commit -m "feat(cassette): face textures from WM-F45 refs + alpha window (model)"
```

---

### Task 2: Lid-angle math (TDD)

**Files:**
- Create: `tests/cassette-math.test.js`
- Create: `assets/japanjunky-cassette-math.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/cassette-math.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import M from '../assets/japanjunky-cassette-math.js';

describe('clamp', () => {
  it('clamps to [0,1] by default', () => {
    expect(M.clamp(-1)).toBe(0);
    expect(M.clamp(0.5)).toBe(0.5);
    expect(M.clamp(2)).toBe(1);
  });
});

describe('easeInOut', () => {
  it('is 0 at 0 and 1 at 1', () => {
    expect(M.easeInOut(0)).toBe(0);
    expect(M.easeInOut(1)).toBe(1);
  });
  it('passes through 0.5 at the midpoint and is monotonic', () => {
    expect(M.easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(M.easeInOut(0.25)).toBeLessThan(M.easeInOut(0.75));
  });
  it('clamps out-of-range input', () => {
    expect(M.easeInOut(-1)).toBe(0);
    expect(M.easeInOut(2)).toBe(1);
  });
});

describe('lidAngle', () => {
  it('is 0 radians fully closed', () => {
    expect(M.lidAngle(0)).toBe(0);
  });
  it('is the open angle (~110deg) fully open', () => {
    expect(M.lidAngle(1)).toBeCloseTo((110 * Math.PI) / 180, 5);
  });
  it('eases (midpoint past linear-half due to easeInOut symmetry = half)', () => {
    expect(M.lidAngle(0.5)).toBeCloseTo(((110 * Math.PI) / 180) * 0.5, 5);
  });
  it('clamps input', () => {
    expect(M.lidAngle(5)).toBeCloseTo((110 * Math.PI) / 180, 5);
    expect(M.lidAngle(-5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot resolve `../assets/japanjunky-cassette-math.js`.

- [ ] **Step 3: Implement**

Create `assets/japanjunky-cassette-math.js`:

```javascript
/**
 * japanjunky-cassette-math.js
 * Pure helpers for the cassette model lid animation. UMD:
 * window.JJ_CassetteMath as a classic <script>, module.exports under Vitest.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_CassetteMath = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPEN_RAD = (110 * Math.PI) / 180; // lid fully-open angle

  function clamp(t, lo, hi) {
    if (lo === undefined) lo = 0;
    if (hi === undefined) hi = 1;
    if (t < lo) return lo;
    if (t > hi) return hi;
    return t;
  }

  // smoothstep ease, clamped to [0,1]
  function easeInOut(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  // open fraction t in [0,1] -> lid rotation in radians
  function lidAngle(t) {
    return easeInOut(t) * OPEN_RAD;
  }

  return { clamp: clamp, easeInOut: easeInOut, lidAngle: lidAngle, OPEN_RAD: OPEN_RAD };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — cassette-math tests + all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/cassette-math.test.js assets/japanjunky-cassette-math.js
git commit -m "feat(cassette): lid-angle/easing helpers with tests (model)"
```

---

### Task 3: Model builder + preview

**Files:**
- Create: `assets/japanjunky-cassette-model.js`
- Create: `tools/cassette-textures/preview.html`

- [ ] **Step 1: Create the builder**

Create `assets/japanjunky-cassette-model.js`:

```javascript
/**
 * japanjunky-cassette-model.js
 * Builds the Sony WM-F45 cassette Walkman as a THREE.Group.
 *
 * window.JJ_CassetteModel.build(THREE, assetUrl) -> {
 *   group, setOpen(t), setPlaying(b), update(dt)
 * }
 * assetUrl(name) resolves e.g. 'cassette-front.png' to a loadable URL.
 * Unlit MeshBasicMaterial + NearestFilter (flat retro; no lighting needed).
 * Depends on window.JJ_CassetteMath for the lid angle.
 */
(function () {
  'use strict';

  // model units: real cm / 10
  var W = 1.06, H = 1.40, D = 0.43;
  var YELLOW = 0xf2c200, BLACK = 0x141414, CYAN = 0x35e0e0;

  function build(THREE, assetUrl) {
    var Math2 = window.JJ_CassetteMath;
    var loader = new THREE.TextureLoader();

    function tex(name) {
      var t = loader.load(assetUrl(name));
      t.generateMipmaps = false;
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }
    function photoMat(name, transparent) {
      return new THREE.MeshBasicMaterial({
        map: tex(name),
        transparent: !!transparent,
        alphaTest: transparent ? 0.5 : 0,
        side: THREE.DoubleSide
      });
    }
    function colorMat(c) { return new THREE.MeshBasicMaterial({ color: c }); }

    var group = new THREE.Group();

    // --- Body: deck on +z (revealed when lid opens), photos on other faces ---
    var bodyMats = [
      photoMat('cassette-right.png'),   // +x
      photoMat('cassette-left.png'),    // -x
      photoMat('cassette-top.png'),     // +y
      colorMat(YELLOW),                 // -y (bottom, unphotographed)
      photoMat('cassette-deck.png'),    // +z (interior deck)
      photoMat('cassette-back.png')     // -z
    ];
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMats);
    group.add(body);

    // --- Cassette in the well (visible through the window) ---
    var cassette = new THREE.Group();
    var shell = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, H * 0.42, 0.04), colorMat(0x2a2a2a));
    cassette.add(shell);
    var reels = [];
    var reelGeo = new THREE.CylinderGeometry(W * 0.11, W * 0.11, 0.02, 16);
    for (var i = 0; i < 2; i++) {
      var reel = new THREE.Mesh(reelGeo, colorMat(0x111111));
      reel.rotation.x = Math.PI / 2;          // face +z
      reel.position.set((i === 0 ? -1 : 1) * W * 0.17, H * 0.06, 0.03);
      cassette.add(reel);
      reels.push(reel);
    }
    cassette.position.set(0, H * 0.12, D / 2 - 0.04); // upper area, just inside front
    group.add(cassette);

    // --- Lid: hinged at the RIGHT vertical edge, front photo with alpha window ---
    var hinge = new THREE.Group();
    hinge.position.set(W / 2, 0, D / 2);        // right edge, front plane
    var lidMats = [
      colorMat(YELLOW), colorMat(YELLOW), colorMat(YELLOW), colorMat(YELLOW),
      photoMat('cassette-front.png', true),     // +z outer (alpha window)
      photoMat('cassette-lid-inner.png')        // -z inner
    ];
    var lid = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), lidMats);
    lid.position.set(-W / 2, 0, 0.025);         // center sits left of the hinge
    hinge.add(lid);
    // translucent cyan pane in the window opening (child of the lid)
    var pane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.66, H * 0.32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22 })
    );
    pane.position.set(0, H * 0.12, 0.03);
    lid.add(pane);
    group.add(hinge);

    var playing = false;

    function setOpen(t) {
      hinge.rotation.y = Math2 ? Math2.lidAngle(t) : 0; // hinge opens toward -? door swing
    }
    function setPlaying(b) { playing = !!b; }
    function update(dt) {
      if (playing) {
        for (var i = 0; i < reels.length; i++) reels[i].rotation.y += dt * 3.0;
      }
    }

    setOpen(0);
    return { group: group, setOpen: setOpen, setPlaying: setPlaying, update: update };
  }

  window.JJ_CassetteModel = { build: build };
})();
```

- [ ] **Step 2: Create the preview page**

Create `tools/cassette-textures/preview.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Cassette model preview</title>
<style>html,body{margin:0;background:#111;height:100%;overflow:hidden}</style></head>
<body>
<canvas id="c" width="600" height="700"></canvas>
<script src="../../assets/three.min.js"></script>
<script src="../../assets/japanjunky-cassette-math.js"></script>
<script src="../../assets/japanjunky-cassette-model.js"></script>
<script>
  var canvas = document.getElementById('c');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x111111, 1);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, 600 / 700, 0.1, 100);
  camera.position.set(0.6, 0.3, 3.0);
  camera.lookAt(0, 0, 0);
  // textures resolve relative to assets/
  var m = JJ_CassetteModel.build(THREE, function (n) { return '../../assets/' + n; });
  scene.add(m.group);
  m.setPlaying(true);
  var open = 0, dir = 1, last = performance.now();
  function loop(now) {
    var dt = (now - last) / 1000; last = now;
    open += dir * dt * 0.4; if (open > 1) { open = 1; dir = -1; } if (open < 0) { open = 0; dir = 1; }
    m.setOpen(open); m.update(dt);
    m.group.rotation.y += dt * 0.3;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
</script>
</body>
</html>
```

- [ ] **Step 3: Manual preview check**

Open `tools/cassette-textures/preview.html` in a browser (file://). Confirm: a yellow Walkman body with the front photo, the lid swinging open about the right edge to reveal the deck, the cassette visible behind the cyan window, and the reels spinning. If the lid swings the wrong way or the cassette/window are misaligned, adjust positions/signs in `japanjunky-cassette-model.js` (`hinge.position`, `lid.position`, `cassette.position`, `pane.position`, or negate `lidAngle` usage) and reload.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-cassette-model.js tools/cassette-textures/preview.html
git commit -m "feat(cassette): WM-F45 model builder + standalone preview (model)"
```

---

### Task 4: Player integration

**Files:**
- Modify: `assets/japanjunky-player.js`
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Expose the texture URL map + load scripts**

In `layout/theme.liquid`, immediately before the `japanjunky-player.js` script tag (line ~284), add:

```liquid
  <script>
    window.JJ_CASSETTE_TEX = {
      'cassette-front.png': "{{ 'cassette-front.png' | asset_url }}",
      'cassette-back.png': "{{ 'cassette-back.png' | asset_url }}",
      'cassette-left.png': "{{ 'cassette-left.png' | asset_url }}",
      'cassette-right.png': "{{ 'cassette-right.png' | asset_url }}",
      'cassette-top.png': "{{ 'cassette-top.png' | asset_url }}",
      'cassette-deck.png': "{{ 'cassette-deck.png' | asset_url }}",
      'cassette-lid-inner.png': "{{ 'cassette-lid-inner.png' | asset_url }}"
    };
  </script>
  <script src="{{ 'japanjunky-cassette-math.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-cassette-model.js' | asset_url }}" defer></script>
```

(The two module scripts must load before `japanjunky-player.js`, which already follows on the next line.)

- [ ] **Step 2: Add the model renderer to the player**

In `assets/japanjunky-player.js`, add these module-level vars alongside the others at the top of the IIFE:

```javascript
  var model = null;       // { group, setOpen, setPlaying, update } or null
  var modelRenderer = null, modelScene = null, modelCamera = null, modelRaf = null;
  var lidT = 0, lidTarget = 0; // current/target open fraction for the tween
```

Add these functions immediately before `function spawn(`:

```javascript
  function mountModel(tool) {
    // Only the cassette model exists today; others keep the placeholder label.
    if (tool !== 'cassette') return false;
    if (typeof THREE === 'undefined' || !window.JJ_CassetteModel) return false;
    var canvas = document.createElement('canvas');
    canvas.className = 'jj-player__canvas';
    canvas.width = 96; canvas.height = 96;
    el.appendChild(canvas);
    try {
      modelRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
    } catch (e) { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); return false; }
    modelRenderer.setClearColor(0x000000, 0);
    modelScene = new THREE.Scene();
    modelCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    modelCamera.position.set(0.45, 0.25, 3.1);
    modelCamera.lookAt(0, 0, 0);
    var tex = function (n) { return (window.JJ_CASSETTE_TEX && window.JJ_CASSETTE_TEX[n]) || n; };
    model = window.JJ_CassetteModel.build(THREE, tex);
    modelScene.add(model.group);
    var last = performance.now();
    function render(now) {
      modelRaf = requestAnimationFrame(render);
      var dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      // ease the lid toward its target
      if (lidT !== lidTarget) {
        var step = dt / 0.5; // ~0.5s open/close
        if (lidT < lidTarget) lidT = Math.min(lidTarget, lidT + step);
        else lidT = Math.max(lidTarget, lidT - step);
        model.setOpen(lidT);
      }
      model.group.rotation.y += dt * 0.4; // gentle idle spin
      model.update(dt);
      modelRenderer.render(modelScene, modelCamera);
    }
    modelRaf = requestAnimationFrame(render);
    return true;
  }

  function unmountModel() {
    if (modelRaf !== null) { cancelAnimationFrame(modelRaf); modelRaf = null; }
    if (modelRenderer) { try { modelRenderer.dispose(); } catch (e) {} }
    model = null; modelRenderer = null; modelScene = null; modelCamera = null;
    lidT = 0; lidTarget = 0;
  }

  // open -> brief hold -> close, used as the "insert tape" beat on accept
  function playInsertBeat() {
    if (!model) return;
    lidTarget = 1;
    setTimeout(function () { lidTarget = 0; }, 650);
  }
```

In `spawn`, replace the placeholder label creation:

```javascript
    var label = document.createElement('span');
    label.className = 'jj-player__label';
    label.textContent = tool;
    el.appendChild(label);
```

with:

```javascript
    if (!mountModel(tool)) {
      var label = document.createElement('span');
      label.className = 'jj-player__label';
      label.textContent = tool;
      el.appendChild(label);
    }
```

In `despawn`, after `stopLoop();` (and the existing audio stop), add:

```javascript
    unmountModel();
```

- [ ] **Step 2b: Drive open/insert/close + reel spin from accept/stop**

In `assets/japanjunky-player.js`, in `tryLoadProduct`, in the accept branch, after the `flashClass('jj-player--accept');` line and the existing `JJ_PlayerAudio.play(...)` call, add:

```javascript
    if (model) { playInsertBeat(); model.setPlaying(true); }
```

And add a stop of the reels when audio stops. In `despawn`, the `unmountModel()` already added handles teardown. Also, when a NEW product is dropped the accept path re-triggers `setPlaying(true)` and a fresh insert beat — which is correct.

- [ ] **Step 3: Add minimal canvas CSS**

Append to the end of `assets/japanjunky-win95.css`:

```css
.jj-player__canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}
.jj-player:has(.jj-player__canvas) {
  background: transparent;
  border: none;
  box-shadow: none;
}
```

- [ ] **Step 4: Manual verification**

In a browser preview (after Task 1 textures are committed and the metafields/products exist from Tranche 5):
1. Open the toolbox, drag the **cassette** tool out → the player shows the 3D yellow Walkman (not the placeholder box), idly rotating, cassette visible through the cyan window.
2. It still falls/bounces/settles on the taskbar and is throwable (physics unaffected — the canvas is a child of the moving container).
3. Drag a **cassette**-format product onto it → lid swings open, holds, closes (insert beat), reels start spinning, audio plays.
4. Drag a **non-cassette** product → reject (no change to play state).
5. Drag out the **record** or **CD** tool → still the placeholder box (no model yet).
6. Despawn / spawn a different tool → model + audio + reels stop and tear down (no leaked WebGL context or rAF).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-player.js layout/theme.liquid assets/japanjunky-win95.css
git commit -m "feat(cassette): render WM-F45 model in the cassette player + insert beat (model)"
```

---

### Task 5: Full regression

**Files:** none (verification only)

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: cassette-math + audio-util + media-format + physics + sanity all pass.

- [ ] **Step 2: Browser checklist**

1. Cassette tool → 3D Walkman renders; window shows the cassette; idle spin.
2. Physics: falls, bounces, never leaves screen, settles on taskbar, throwable.
3. Cassette product drop → open/insert/close + reels spin + audio.
4. Mismatch → reject; record/CD tools → placeholder box.
5. Despawn → clean teardown (no console errors, no runaway rAF/audio).
6. Tranches 1–5 still work (fan, drag-to-spawn, persistence, gating, audio).
7. The `preview.html` still renders the model (sanity for the builder in isolation).

- [ ] **Step 3: Record the result**

If all pass, the cassette model is complete. If any fail, fix inline (model geometry positions, the texture crops, or the renderer mount) and re-verify.

---

## Self-Review

**Spec coverage:**
- Photo-textured clamshell, dims 10.6×14.0×4.3, hinged right-edge lid, see-through window + cassette behind, open-on-load/close-to-play, reel spin, player integration for `cassette` only, placeholder fallback → Tasks 1–4. ✓
- Texture prep via `sharp` with committed outputs + front alpha window → Task 1. ✓
- Pure lid-angle/easing helpers unit-tested → Task 2. ✓
- Reuse product-viewer pipeline: deviation — uses unlit `MeshBasicMaterial` + NearestFilter instead of duplicating the IIFE-private PS1 ShaderMaterial. Equivalent flat/retro look for photo faces, no lighting needed, avoids shader duplication. Flagged. ✓ (documented deviation)
- THREE site-wide confirmed; graceful placeholder fallback retained. ✓
- Physics/drag/gating/audio untouched (canvas is a child of the physics-driven container; model render loop never writes the container transform). ✓

**Placeholder scan:** No TBD/TODO. Crop boxes + WINDOW are initial estimates with an explicit view-and-tune step (Task 1 Step 3) and a model-geometry tune step (Task 3 Step 3) — these are iterative-by-design, not unfinished code.

**Type/name consistency:**
- `window.JJ_CassetteMath.{clamp,easeInOut,lidAngle,OPEN_RAD}` (Task 2) consumed by the model (Task 3). ✓
- `window.JJ_CassetteModel.build(THREE, assetUrl)` → `{group,setOpen,setPlaying,update}` (Task 3) consumed by player `mountModel` (Task 4) and `preview.html`. ✓
- `window.JJ_CASSETTE_TEX` map (theme, Task 4) is the `assetUrl` source in `mountModel`. ✓
- Texture filenames identical across `build.js` outputs, the `JJ_CASSETTE_TEX` map, and the builder's `assetUrl('cassette-*.png')` calls. ✓
- Player vars `model/lidT/lidTarget/modelRaf` defined once; `mountModel`/`unmountModel`/`playInsertBeat` referenced from spawn/despawn/tryLoadProduct. ✓

**Decision to flag:** the `:has()` CSS selector (Task 4 Step 3) hides the placeholder box styling when a canvas is present; `:has` is well-supported in current browsers, but if support is a concern the same effect can be achieved by toggling a `jj-player--model` class in `mountModel`. Noted for the implementer.
```
