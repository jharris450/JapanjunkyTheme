# Forest Splash Scene — Baseline Implementation Plan (Sub-Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal vortex background with a sacred Japanese forest grove (PS1-textured 3D, dawn mist, amber phosphor wash). Tsuno keeps her existing orbit logic in this sub-plan; her forest-aware drift ships in sub-plan 2.

**Architecture:** New `assets/japanjunky-forest.js` module exposes `window.JJ_Forest.create(scene, camera, clock, tier)` factory. Existing `assets/japanjunky-screensaver.js` becomes an adapter — its tunnel-rendering code is extracted into `assets/japanjunky-portal.js` for clean rollback. A theme setting `scene_mode = 'forest' | 'portal'` chooses which module to instantiate. Adaptive perf tier system (boot probe + watchdog) addresses Linux scroll-lag complaints.

**Tech Stack:** Three.js (existing global), vanilla ES5 IIFE pattern (no bundler), Liquid (Shopify theme), Node.js + sharp (offline texture pipeline only).

**Spec:** `docs/superpowers/specs/2026-04-30-forest-splash-design.md`

**Sub-plan scope:**
- ✅ Forest module scaffolding, geometry, shaders, animation
- ✅ Camera presets + handheld float
- ✅ Asset pipeline (PS1 textures + atlas)
- ✅ Performance tier system (boot probe + runtime watchdog)
- ✅ Mobile/battery awareness
- ✅ Splash sequence rewrite
- ✅ Portal extraction for rollback
- ❌ Tsuno forest-aware drift (sub-plan 2)
- ❌ Page transition flash + audio (sub-plan 3)

---

## Phase 1 — Plumbing & Rollback Safety

By the end of this phase, `scene_mode='portal'` works exactly as today. `scene_mode='forest'` instantiates an empty forest module that renders nothing. No regressions.

### Task 1: Add `scene_mode` and `audio_enabled` settings

**Files:**
- Modify: `config/settings_schema.json`

- [ ] **Step 1:** Open `config/settings_schema.json`. Locate the first object (the `Screensaver` group, lines 1–50). Inside its `settings` array, after the existing `screensaver_orbit_speed` block, insert two new blocks.

Find:
```json
      {
        "type": "select",
        "id": "screensaver_orbit_speed",
        "label": "Portal swirl speed",
        "options": [
          { "value": "slow", "label": "Slow" },
          { "value": "medium", "label": "Medium" },
          { "value": "fast", "label": "Fast" }
        ],
        "default": "slow"
      },
```

After it, insert:
```json
      {
        "type": "select",
        "id": "scene_mode",
        "label": "Background scene",
        "options": [
          { "value": "forest", "label": "Forest grove (default)" },
          { "value": "portal", "label": "Portal vortex (legacy)" }
        ],
        "default": "forest"
      },
      {
        "type": "checkbox",
        "id": "audio_enabled",
        "label": "Enable ambient audio + interaction accents",
        "default": true
      },
```

- [ ] **Step 2:** Validate JSON.

Run: `python -c "import json; json.load(open('config/settings_schema.json'))"`
Expected: no output (silent success).

- [ ] **Step 3:** Commit.

```bash
git add config/settings_schema.json
git commit -m "feat(settings): add scene_mode + audio_enabled toggles"
```

---

### Task 2: Add `scene_mode` to screensaver config in `theme.liquid`

**Files:**
- Modify: `layout/theme.liquid:232-240` (the `JJ_SCREENSAVER_CONFIG` block)

- [ ] **Step 1:** Find the existing config block (around line 232):

```liquid
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      {%- if template == 'product' -%}cameraPreset: 'product',{%- endif %}
      {%- if template.suffix == 'login' -%}cameraPreset: 'login',{%- endif %}
```

- [ ] **Step 2:** Add `sceneMode` and `audioEnabled` lines. Replace the block with:

```liquid
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      sceneMode: '{{ settings.scene_mode | default: "forest" }}',
      audioEnabled: {{ settings.audio_enabled | default: true }},
      {%- if template == 'product' -%}cameraPreset: 'product',{%- endif %}
      {%- if template.suffix == 'login' -%}cameraPreset: 'login',{%- endif %}
```

- [ ] **Step 3:** Add `jj-body--scene-X` class to `<body>`. Find around line 130:

```liquid
<body class="jj-body{% if template == 'product' %} jj-body--product{% endif %}{% if template.suffix == 'login' %} jj-body--auth{% endif %}">
```

Replace with:

```liquid
<body class="jj-body{% if template == 'product' %} jj-body--product{% endif %}{% if template.suffix == 'login' %} jj-body--auth{% endif %} jj-body--scene-{{ settings.scene_mode | default: 'forest' }}">
```

- [ ] **Step 4:** Smoke-test in dev shell:

```bash
shopify theme dev
```
Open the site, view-source, confirm `<body class="...jj-body--scene-forest">` and that `JJ_SCREENSAVER_CONFIG.sceneMode === 'forest'` in the JS console.

- [ ] **Step 5:** Commit.

```bash
git add layout/theme.liquid
git commit -m "feat(theme): plumb scene_mode + audio_enabled config"
```

---

### Task 3: Extract portal code into `japanjunky-portal.js`

**Files:**
- Create: `assets/japanjunky-portal.js`
- Modify: `assets/japanjunky-screensaver.js` (extract sections, leave a hole)

This is a mechanical move. The portal scene-building code (tunnel mesh, portal rings, swirl texture, fragments-into-portal logic) lives *inline* in screensaver.js today. We extract it into a module exposing `window.JJ_Portal.create(scene, camera, clock)` returning `{ update(t), dispose() }`.

- [ ] **Step 1:** Create `assets/japanjunky-portal.js` with the extracted code. This is a refactor — preserve every shader uniform name and every variable name to minimize risk.

```javascript
/**
 * JapanJunky Portal — Holographic swirling tunnel + portal rings.
 * Extracted from japanjunky-screensaver.js for clean rollback toggle.
 *
 * Depends on: THREE (global)
 * Exposes:    window.JJ_Portal.create(scene, camera, clock, opts)
 *               → { update(t), dispose() }
 */
(function () {
  'use strict';

  function create(scene, camera, clock, opts) {
    opts = opts || {};
    var swirlSpeed = (typeof opts.swirlSpeed === 'number') ? opts.swirlSpeed : 0.3;

    // ─── Tunnel shader ─────────────────────────────────────────
    // (Move TUNNEL_VERT and TUNNEL_FRAG from screensaver.js verbatim,
    // including all helper functions: mhash, mnoise, mfbm.)
    var TUNNEL_VERT = /* paste from screensaver.js current lines 79-91 */ '';
    var TUNNEL_FRAG = /* paste from screensaver.js current lines 93-200 */ '';

    var tunnelMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: 240 },
        uSwirlSpeed: { value: swirlSpeed }
      },
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });

    var tunnelGeo = new THREE.CylinderGeometry(8, 8, 60, 32, 1, true);
    var tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.set(0, 0, 18);
    scene.add(tunnel);

    // ─── Portal rings ──────────────────────────────────────────
    // (Move portalRings array building loop from screensaver.js
    // current lines ~395-430 verbatim, replacing local `scene.add(...)`
    // with the same.)
    var portalRings = [];
    // ... full ring-building code goes here ...

    // ─── Update loop ───────────────────────────────────────────
    function update(t) {
      tunnel.material.uniforms.uTime.value = t;
      for (var ri = 0; ri < portalRings.length; ri++) {
        portalRings[ri].material.uniforms.uTime.value = t;
        portalRings[ri].rotation.z += portalRings[ri].userData.rotSpeed * 0.02;
      }
    }

    // ─── Dispose ───────────────────────────────────────────────
    function dispose() {
      scene.remove(tunnel);
      tunnelMat.dispose();
      tunnelGeo.dispose();
      for (var ri = 0; ri < portalRings.length; ri++) {
        scene.remove(portalRings[ri]);
        portalRings[ri].material.dispose();
        portalRings[ri].geometry.dispose();
      }
    }

    return { update: update, dispose: dispose };
  }

  window.JJ_Portal = { create: create };
})();
```

The block comments tell the implementer **exactly which line ranges** to cut from screensaver.js. Use `Read` with offset/limit to grab them:
- `TUNNEL_VERT` array → screensaver.js lines 79–91
- `TUNNEL_FRAG` array → screensaver.js lines 93–200 (or wherever the array `].join('\n')` closes)
- Portal rings loop → screensaver.js around lines ~395–430 (search `portalRings.push`)
- Per-frame update logic for tunnel/rings → screensaver.js lines 2213–2222

Paste each block verbatim into the matching slot above.

- [ ] **Step 2:** Open `assets/japanjunky-screensaver.js` and **delete** the extracted regions:
  - Delete `TUNNEL_VERT` and `TUNNEL_FRAG` array literals.
  - Delete the `tunnelMat`, `tunnelGeo`, `tunnel` mesh assembly + `scene.add(tunnel)`.
  - Delete the `portalRings = []` block and its push loop.
  - Delete the per-frame `tunnel.material.uniforms.uTime.value = t;` and the `portalRings` rotation loop in the render function.
  - Delete the swirl texture loader (line ~468–474 — the `swirlUrl` + `textureLoader.load(swirlUrl, ...)` block, since portal owns the swirl now).

After deletion the file should still have: WebGL renderer setup, camera, post-process pipeline, Tsuno code, fragment particle system, render loop scaffolding (minus the portal-specific lines).

- [ ] **Step 3:** In `screensaver.js`, immediately after the `scene = new THREE.Scene()` and `camera = new THREE.PerspectiveCamera(...)` block (around line 50), add a hook to call the portal module when in portal mode:

```javascript
  // ─── Background scene module ─────────────────────────────────
  // Owns geometry/animation only. Camera, post-process, Tsuno stay here.
  var sceneModule = null;
  if (config.sceneMode === 'portal' && window.JJ_Portal) {
    sceneModule = window.JJ_Portal.create(scene, camera, clock, {
      swirlSpeed: swirlSpeed
    });
  }
  // (Forest hook added in Task 6.)
```

- [ ] **Step 4:** In the per-frame render loop, replace the deleted tunnel/portal-rings update lines with a single call:

Find the render-loop body. Add at the top of the per-frame work, right after `var t = clock.getElapsedTime();`:

```javascript
    if (sceneModule) sceneModule.update(t);
```

- [ ] **Step 5:** Add `<script>` tag for the portal module in `theme.liquid`. Find around line 257:

```liquid
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
```

Insert *before* the screensaver tag (so portal module is defined first):

```liquid
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  {% if settings.scene_mode == 'portal' %}
  <script src="{{ 'japanjunky-portal.js' | asset_url }}" defer></script>
  {% endif %}
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
```

- [ ] **Step 6:** Test by setting `scene_mode = 'portal'` in the theme editor. Reload. Portal should look exactly like before extraction (no visual diff). Open DevTools, confirm no console errors, and confirm `window.JJ_Portal` is defined.

- [ ] **Step 7:** Commit.

```bash
git add assets/japanjunky-portal.js assets/japanjunky-screensaver.js layout/theme.liquid
git commit -m "refactor(scene): extract portal into japanjunky-portal.js"
```

---

## Phase 2 — Forest Module Skeleton + Sky/Silhouette + Camera

By end of this phase: an empty world with sky, fog wall, distant silhouette ridge, and a working three-preset camera with handheld float. No trees yet.

### Task 4: Create `japanjunky-forest.js` factory skeleton

**Files:**
- Create: `assets/japanjunky-forest.js`

- [ ] **Step 1:** Create the file with the factory skeleton:

```javascript
/**
 * JapanJunky Forest — Sacred grove background scene.
 *
 * Depends on: THREE (global)
 * Exposes:    window.JJ_Forest.create(scene, camera, clock, opts)
 *               → { update(t, scrollY),
 *                   setTier(tier),
 *                   setCameraPreset(name),
 *                   getTsunoAnchors(),
 *                   getTrunkColliders(),
 *                   bootstrap(),     // light scene for FPS probe
 *                   assembleFull(),  // full scene at chosen tier
 *                   dispose() }
 */
(function () {
  'use strict';

  // ─── Camera presets ──────────────────────────────────────────
  var PRESETS = {
    home: {
      pos:  [-1.5, 1.6, -2],
      look: [3,    1.0, 12],
      fog:  { near: 15, far: 70 },
      fov:  55,
      float: { pos: 0.04, rot: 0.6 * Math.PI / 180, period: 4.0 }
    },
    product: {
      pos:  [2, 1.4, 4],
      look: [4, 1.2, 16],
      fog:  { near: 8, far: 30 },
      fov:  48,
      float: { pos: 0.025, rot: 0.4 * Math.PI / 180, period: 5.0 }
    },
    login: {
      pos:  [3, 0.6, 8],
      look: [3, 4.5, 14],
      fog:  { near: 20, far: 90 },
      fov:  60,
      float: { pos: 0.05, rot: 0.5 * Math.PI / 180, period: 4.5 }
    }
  };

  function create(scene, camera, clock, opts) {
    opts = opts || {};
    var currentTier = opts.tier || 'high';
    var currentPreset = PRESETS[opts.cameraPreset] || PRESETS.home;
    var cameraBasePos = new THREE.Vector3();
    var cameraBaseQuat = new THREE.Quaternion();

    // Layer roots — each layer added/removed independently for tier scaling
    var layers = {
      sky:        new THREE.Group(),
      silhouette: new THREE.Group(),
      midGrove:   new THREE.Group(),
      hero:       new THREE.Group(),
      shrine:     new THREE.Group(),
      foreground: new THREE.Group(),
      road:       new THREE.Group(),
      particles:  new THREE.Group(),
      godRays:    new THREE.Group(),
      fogWisps:   new THREE.Group(),
      grain:      new THREE.Group()
    };
    Object.keys(layers).forEach(function (k) { scene.add(layers[k]); });

    // Distance fog
    scene.fog = new THREE.Fog(0x2a1208, currentPreset.fog.near, currentPreset.fog.far);

    // Apply preset to camera
    function applyPreset(p) {
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      camera.lookAt(p.look[0], p.look[1], p.look[2]);
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      cameraBasePos.copy(camera.position);
      cameraBaseQuat.copy(camera.quaternion);
      scene.fog.near = p.fog.near;
      scene.fog.far  = p.fog.far;
    }
    applyPreset(currentPreset);

    function setCameraPreset(name) {
      if (!PRESETS[name]) return;
      currentPreset = PRESETS[name];
      applyPreset(currentPreset);
    }

    // Handheld float (Perlin replacement: smoothed noise from sin sums)
    function smoothNoise(t, seed) {
      return (
        Math.sin(t * 0.73 + seed) * 0.5 +
        Math.sin(t * 1.37 + seed * 2.1) * 0.3 +
        Math.sin(t * 2.11 + seed * 3.7) * 0.2
      );
    }
    // Accessibility: skip handheld float when user prefers reduced motion.
    var prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function applyHandheldFloat(t) {
      if (prefersReducedMotion) {
        camera.position.copy(cameraBasePos);
        camera.quaternion.copy(cameraBaseQuat);
        return;
      }
      var p = currentPreset.float.pos;
      var r = currentPreset.float.rot;
      var w = (2 * Math.PI) / currentPreset.float.period;
      camera.position.x = cameraBasePos.x + smoothNoise(t * w, 0)   * p;
      camera.position.y = cameraBasePos.y + smoothNoise(t * w, 100) * p;
      camera.position.z = cameraBasePos.z + smoothNoise(t * w, 200) * p;
      var rx = smoothNoise(t * w * 1.2, 300) * r;
      var ry = smoothNoise(t * w * 1.2, 400) * r;
      camera.rotation.set(camera.rotation.x + rx, camera.rotation.y + ry, 0);
    }

    // Update loop — called every frame from screensaver.js
    function update(t, scrollY) {
      applyHandheldFloat(t);
      // (geometry/shader/parallax updates added by later tasks)
    }

    // Tier setter (full implementation in perf phase)
    function setTier(tier) { currentTier = tier; }

    // Anchor/collider stubs (implemented in sub-plan 2)
    function getTsunoAnchors() { return []; }
    function getTrunkColliders() { return []; }

    // Two-phase construction stubs
    function bootstrap() { /* implemented in perf-tier task */ }
    function assembleFull() { /* implemented in perf-tier task */ }

    function dispose() {
      Object.keys(layers).forEach(function (k) {
        scene.remove(layers[k]);
        layers[k].traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        });
      });
      scene.fog = null;
    }

    return {
      update: update,
      setTier: setTier,
      setCameraPreset: setCameraPreset,
      getTsunoAnchors: getTsunoAnchors,
      getTrunkColliders: getTrunkColliders,
      bootstrap: bootstrap,
      assembleFull: assembleFull,
      dispose: dispose,
      // Internal handles for later tasks:
      _layers: layers,
      _presets: PRESETS,
      _currentTier: function () { return currentTier; }
    };
  }

  window.JJ_Forest = { create: create };
})();
```

- [ ] **Step 2:** Add `<script>` tag for the forest module in `theme.liquid`. Update the conditional block from Task 3 Step 5:

```liquid
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  {% if settings.scene_mode == 'portal' %}
  <script src="{{ 'japanjunky-portal.js' | asset_url }}" defer></script>
  {% else %}
  <script src="{{ 'japanjunky-forest.js' | asset_url }}" defer></script>
  {% endif %}
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
```

- [ ] **Step 3:** Smoke-test: load the site, open DevTools console. Run `window.JJ_Forest`. Expected: `{ create: ƒ }`.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js layout/theme.liquid
git commit -m "feat(forest): add module skeleton with camera presets + handheld float"
```

---

### Task 5: Wire forest module into `japanjunky-screensaver.js`

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (the `sceneModule = null;` block from Task 3)

- [ ] **Step 1:** Find the block from Task 3 Step 3:

```javascript
  var sceneModule = null;
  if (config.sceneMode === 'portal' && window.JJ_Portal) {
    sceneModule = window.JJ_Portal.create(scene, camera, clock, {
      swirlSpeed: swirlSpeed
    });
  }
  // (Forest hook added in Task 6.)
```

Replace with:

```javascript
  var sceneModule = null;
  if (config.sceneMode === 'portal' && window.JJ_Portal) {
    sceneModule = window.JJ_Portal.create(scene, camera, clock, {
      swirlSpeed: swirlSpeed
    });
  } else if (window.JJ_Forest) {
    sceneModule = window.JJ_Forest.create(scene, camera, clock, {
      cameraPreset: config.cameraPreset,
      tier: 'high'
    });
    // Pass scrollY to update() in the render loop (Task 24 will populate scrollY).
  }
```

- [ ] **Step 2:** In the render loop, change the `sceneModule.update(t)` call to also pass `scrollY` (placeholder for now):

```javascript
    if (sceneModule) sceneModule.update(t, window.scrollY || 0);
```

- [ ] **Step 3:** Remove the hard-coded `cameraPreset` setup that previously lived inline in screensaver.js (lines ~53–72: `CAMERA_PRESETS`, `cameraPreset`, `camera.position.set`, `camera.lookAt`, `isProductPagePreset`, `isLoginPreset`, `mainClearColor`).

The forest module owns camera positioning now. Replace those lines with:

```javascript
  // Camera position + lookAt + fog now owned by the scene module
  // (forest or portal). The scene module sets them on construction
  // and applies handheld float per frame.
  var isProductPagePreset = (config.cameraPreset === 'product');
  var isLoginPreset = (config.cameraPreset === 'login');
  var mainClearColor = (config.sceneMode === 'forest' || !config.sceneMode)
    ? 0x2a1208
    : ((isProductPagePreset || isLoginPreset) ? 0x3a1a08 : 0x000000);
  renderer.setClearColor(mainClearColor, 1);
```

(`isProductPagePreset` / `isLoginPreset` are kept because Tsuno code below still references them. Sub-plan 2 retires them.)

- [ ] **Step 4:** Reload site with `scene_mode='forest'`. Expected: black/dark amber screen (no geometry yet), no console errors. DevTools console: `JJ_SCREENSAVER_CONFIG.sceneMode === 'forest'`.

- [ ] **Step 5:** Commit.

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): wire forest module via sceneModule branch"
```

---

### Task 6: Sky / fog wall (Layer 0)

**Files:**
- Modify: `assets/japanjunky-forest.js` (add to `create()`)

- [ ] **Step 1:** Inside `create()`, after the layer roots are added but before `applyPreset(currentPreset);`, insert a sky-wall builder:

```javascript
    // ─── Layer 0: Sky / fog wall ──────────────────────────────
    // Single billboard plane far behind everything. Vertex shader
    // makes it always face the camera. Fragment shader renders an
    // amber gradient (light top → deep bottom) tinted by fog color.
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:    { value: new THREE.Color(0xc46a28) },
        uBottomColor: { value: new THREE.Color(0x2a1208) }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTopColor;',
        'uniform vec3 uBottomColor;',
        'varying vec2 vUv;',
        'void main() {',
        '  vec3 col = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, vUv.y));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      depthWrite: false,
      depthTest: false,
      fog: false
    });
    var skyGeo = new THREE.PlaneGeometry(200, 100);
    var skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(0, 0, 80);
    skyMesh.renderOrder = -10;
    layers.sky.add(skyMesh);
```

- [ ] **Step 2:** Reload site. Expected: amber gradient fills the screen instead of black. DevTools: no errors.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add sky/fog wall layer"
```

---

### Task 7: Distant silhouette ridge (Layer 1)

**Files:**
- Modify: `assets/japanjunky-forest.js` (add to `create()`)
- Asset: `assets/silhouette_trunks.png` (placeholder for now — Task 19 generates the real asset; this task uses a temporary procedural silhouette generated in code).

- [ ] **Step 1:** After the sky-wall block, add a procedural silhouette plane. We'll swap the texture for a real PNG in Task 19, but a procedural shader-based silhouette unblocks development:

```javascript
    // ─── Layer 1: Distant silhouette ridge ────────────────────
    // Procedural for now. Texture swap-in happens once Task 19 ships.
    var silhouetteMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x1a0a04) },
        uHeight: { value: 0.35 }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uHeight;',
        'varying vec2 vUv;',
        'float noise(float x) {',
        '  return fract(sin(x * 12.9898) * 43758.5453);',
        '}',
        'void main() {',
        '  // Vertical ridge of trunk silhouettes via noise-driven heights',
        '  float trunk = step(0.5, noise(floor(vUv.x * 60.0)));',
        '  float h = noise(floor(vUv.x * 60.0) + 0.7) * 0.4 + uHeight;',
        '  float opaque = (vUv.y < h) ? 1.0 : 0.0;',
        '  // Silhouette only at trunk x-bands; gaps between trunks are clear',
        '  float a = opaque * (0.6 + 0.4 * trunk);',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      fog: false
    });
    var silhouetteGeo = new THREE.PlaneGeometry(160, 30);
    var silhouetteMesh = new THREE.Mesh(silhouetteGeo, silhouetteMat);
    silhouetteMesh.position.set(0, 6, 60);
    silhouetteMesh.renderOrder = -9;
    layers.silhouette.add(silhouetteMesh);
```

- [ ] **Step 2:** Reload. Expected: dark trunk-silhouette band sits in front of the amber sky.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add procedural silhouette ridge layer"
```

---

## Phase 3 — Geometry: Trunks, Rope, Shide, Shrine, Foreground, Road

### Task 8: Cedar trunk geometry helper

**Files:**
- Modify: `assets/japanjunky-forest.js`

The helper builds a single PS1-style cedar — `CylinderGeometry` with low side count, vertex-baked AO darker at base, optional tapered shape.

- [ ] **Step 1:** Add the helper near the top of `create()`, before the layer building (so subsequent tasks can call it):

```javascript
    // ─── Cedar trunk builder ──────────────────────────────────
    // sides: poly count (8/12/16 by tier)
    // height: world units
    // baseRadius/topRadius: tapered trunk shape
    // barkTex: THREE.Texture (cedar bark, NEAREST sampling expected)
    function buildCedar(sides, height, baseRadius, topRadius, barkTex) {
      var geo = new THREE.CylinderGeometry(topRadius, baseRadius, height, sides, 1, true);
      // Per-vertex AO: darken base, lighten top (vertex colors used as multiply)
      var colors = [];
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var y = pos.getY(i);
        var t = (y + height / 2) / height; // 0 = bottom, 1 = top
        var c = 0.45 + 0.55 * t;            // darker at base
        colors.push(c, c, c);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      var mat = new THREE.MeshBasicMaterial({
        map: barkTex,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.isTrunk = true;
      return mesh;
    }
```

- [ ] **Step 2:** Add a placeholder bark texture loader. Task 19 generates the real PNG; for now use a procedural canvas texture so trunks render even before assets ship:

```javascript
    // ─── Texture loader (placeholder until Task 19 ships real PNGs) ──
    function makePlaceholderBark() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      var ctx = c.getContext('2d');
      // Solid dark cedar brown with vertical streaks
      ctx.fillStyle = '#3a2114';
      ctx.fillRect(0, 0, 64, 128);
      ctx.strokeStyle = '#5a3520';
      ctx.lineWidth = 1;
      for (var i = 0; i < 12; i++) {
        var x = Math.floor(Math.random() * 64);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 4, 128);
        ctx.stroke();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var barkTex = (opts.textures && opts.textures.bark) || makePlaceholderBark();
```

- [ ] **Step 3:** Sanity-test by adding **one** test cedar before committing. Insert temporarily after the helper:

```javascript
    // TEMP: test cedar
    var testCedar = buildCedar(12, 12, 1.0, 0.6, barkTex);
    testCedar.position.set(2, 0, 12);
    layers.midGrove.add(testCedar);
    // END TEMP
```

Reload. Expected: a single cedar trunk visible center-screen.

- [ ] **Step 4:** **Remove the TEMP block** before committing (Task 9 places real trunks).

- [ ] **Step 5:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add cedar trunk builder + placeholder bark"
```

---

### Task 9: Mid grove (Layer 2) — 6–8 cedars

**Files:**
- Modify: `assets/japanjunky-forest.js`

- [ ] **Step 1:** After the placeholder bark setup, add a deterministic mid-grove placement. Z range 30–50, x range −15 to +15:

```javascript
    // ─── Layer 2: Mid grove ───────────────────────────────────
    // 6-8 cedars distributed in z=30..50, smaller than hero cedars
    var MID_GROVE_LAYOUT = [
      // [x,    z,    height, baseR, topR]
      [-12, 32, 11, 0.7, 0.4],
      [ -7, 38, 10, 0.6, 0.4],
      [  4, 35, 12, 0.8, 0.5],
      [  9, 42, 11, 0.7, 0.4],
      [ 14, 48, 10, 0.6, 0.4],
      [ -3, 45, 13, 0.8, 0.5],
      [ -9, 50, 11, 0.7, 0.4],
      [  7, 50, 10, 0.6, 0.4]
    ];
    function buildMidGrove(count) {
      for (var i = 0; i < Math.min(count, MID_GROVE_LAYOUT.length); i++) {
        var L = MID_GROVE_LAYOUT[i];
        var sides = 12; // tier-Med default; adjusted in tier system
        var c = buildCedar(sides, L[2], L[3], L[4], barkTex);
        c.position.set(L[0], L[2] / 2 - 0.5, L[1]);
        layers.midGrove.add(c);
      }
    }
    buildMidGrove(8);
```

- [ ] **Step 2:** Reload. Expected: a row of cedars in mid-distance, fading into fog.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): place 8 mid-grove cedars at fixed layout"
```

---

### Task 10: Hero cedars (Layer 3) — 3–4 giants

**Files:**
- Modify: `assets/japanjunky-forest.js`

- [ ] **Step 1:** Add hero placement after `buildMidGrove`:

```javascript
    // ─── Layer 3: Hero cedars (giants near camera) ────────────
    var HERO_LAYOUT = [
      // [x,   z,  height, baseR, topR]
      [ 4,   12, 18, 1.4, 0.7],   // primary focal
      [-2,   14, 16, 1.2, 0.6],
      [ 6,   18, 17, 1.3, 0.7],
      [-5,   20, 15, 1.1, 0.6]
    ];
    function buildHeroCedars(count) {
      var heroes = [];
      for (var i = 0; i < Math.min(count, HERO_LAYOUT.length); i++) {
        var L = HERO_LAYOUT[i];
        var sides = 16; // hero gets more poly than mid
        var c = buildCedar(sides, L[2], L[3], L[4], barkTex);
        c.position.set(L[0], L[2] / 2 - 0.3, L[1]);
        layers.hero.add(c);
        heroes.push({ mesh: c, layout: L });
      }
      return heroes;
    }
    var heroCedars = buildHeroCedars(4);
```

- [ ] **Step 2:** Reload. Expected: 4 large cedars in foreground/midground, dwarfing the mid-grove behind.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): place 4 hero cedars in front of mid grove"
```

---

### Task 11: Shimenawa rope geometry on hero cedars

**Files:**
- Modify: `assets/japanjunky-forest.js`

Build a thick twisted-torus rope that wraps each hero cedar at mid-height. PS1-style: low segment count, photo rope texture, no real lighting.

- [ ] **Step 1:** Add a placeholder rope texture and rope builder near the cedar helper:

```javascript
    // ─── Shimenawa rope ───────────────────────────────────────
    function makePlaceholderRope() {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      var ctx = c.getContext('2d');
      // Twisted-rope diagonal stripes: golden tan
      ctx.fillStyle = '#c19a3a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#a07a1c';
      ctx.lineWidth = 4;
      for (var i = -8; i < 32; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 16, 0);
        ctx.lineTo(i * 16 + 28, 64);
        ctx.stroke();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    }
    var ropeTex = (opts.textures && opts.textures.rope) || makePlaceholderRope();

    // Rope = TorusGeometry sized to wrap a cedar at given Y, inflated slightly
    // beyond trunk radius so it sits visibly off the bark.
    function buildRope(trunkRadius, atY, trunkX, trunkZ) {
      var ropeRadius = trunkRadius + 0.18;
      var tubeRadius = 0.18;
      var radialSegs = 12; // around the trunk
      var tubularSegs = 8; // around the rope cross-section
      var geo = new THREE.TorusGeometry(ropeRadius, tubeRadius, tubularSegs, radialSegs);
      // Tile the rope texture along the length (radial direction)
      ropeTex.repeat.set(4, 1);
      var mat = new THREE.MeshBasicMaterial({ map: ropeTex, fog: true });
      var rope = new THREE.Mesh(geo, mat);
      rope.rotation.x = Math.PI / 2; // lay flat horizontal
      rope.position.set(trunkX, atY, trunkZ);
      return rope;
    }
```

- [ ] **Step 2:** Wrap each hero cedar. After `var heroCedars = buildHeroCedars(4);` add:

```javascript
    // Wrap hero cedars with shimenawa rope at mid-height
    var heroRopes = [];
    for (var hi = 0; hi < heroCedars.length; hi++) {
      var hero = heroCedars[hi];
      var L = hero.layout;
      var ropeY = L[2] * 0.45; // 45% up the trunk
      var avgRadius = (L[3] + L[4]) / 2;
      var rope = buildRope(avgRadius, ropeY, L[0], L[1]);
      layers.hero.add(rope);
      heroRopes.push(rope);
    }
```

- [ ] **Step 3:** Reload. Expected: each hero cedar has a golden-tan rope band wrapped around its middle.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): wrap hero cedars in shimenawa rope"
```

---

### Task 12: Shide paper streamers on each rope

**Files:**
- Modify: `assets/japanjunky-forest.js`

Shide are zig-zag white paper strips hung from the rope. Implement as alpha-cutout planes that animate sway in the wind shader.

- [ ] **Step 1:** Add a shide texture and builder:

```javascript
    // ─── Shide paper streamers ────────────────────────────────
    function makePlaceholderShide() {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 96;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 32, 96);
      // Zig-zag paper strip
      ctx.fillStyle = '#f0e8d8';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(24, 16);
      ctx.lineTo(8, 32);
      ctx.lineTo(24, 48);
      ctx.lineTo(8, 64);
      ctx.lineTo(24, 80);
      ctx.lineTo(8, 96);
      ctx.lineTo(8, 0);
      ctx.fill();
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
    var shideTex = (opts.textures && opts.textures.shide) || makePlaceholderShide();

    // Shide shader: sway uses uTime and the per-instance offset (encoded
    // in vertex attribute "offset") so streamers don't move in lockstep.
    var SHIDE_VERT = [
      'uniform float uTime;',
      'attribute float aSwayPhase;',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec3 p = position;',
      '  // Sway intensity grows with distance from the top (uv.y from 1 down to 0)',
      '  float sway = (1.0 - uv.y) * 0.18;',
      '  p.x += sin(uTime * 1.6 + aSwayPhase) * sway;',
      '  p.z += cos(uTime * 1.1 + aSwayPhase * 1.3) * sway * 0.4;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\n');
    var SHIDE_FRAG = [
      'uniform sampler2D uMap;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 c = texture2D(uMap, vUv);',
      '  if (c.a < 0.5) discard;',
      '  gl_FragColor = c;',
      '}'
    ].join('\n');

    var shideMaterials = []; // for uTime updates
    // Build a shide streamer at an absolute world position. Not parented
    // to the rope (the rope was rotated 90° around X, which would map
    // local-y onto world-z and break the hanging direction).
    function buildShideAt(worldX, worldY, worldZ) {
      var w = 0.18, h = 0.55;
      var geo = new THREE.PlaneGeometry(w, h);
      var phase = Math.random() * 6.28;
      var phases = new Float32Array([phase, phase, phase, phase]);
      geo.setAttribute('aSwayPhase', new THREE.BufferAttribute(phases, 1));
      var mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMap: { value: shideTex } },
        vertexShader: SHIDE_VERT,
        fragmentShader: SHIDE_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        fog: true
      });
      shideMaterials.push(mat);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(worldX, worldY, worldZ);
      mesh.renderOrder = 1;
      layers.hero.add(mesh);
      return mesh;
    }
```

- [ ] **Step 2:** After the rope-wrapping loop, hang 5–7 shide around each rope at world coordinates:

```javascript
    // Hang shide around each rope, distributed around the trunk circumference.
    // ropeY (from Task 11) is the rope's world Y; ropeRadius+0.15 is just
    // outside the rope so streamers hang free.
    for (var ri = 0; ri < heroRopes.length; ri++) {
      var hero = heroCedars[ri];
      var L = hero.layout;
      var trunkX = L[0], trunkZ = L[1];
      var ropeY = L[2] * 0.45;
      var avgRadius = (L[3] + L[4]) / 2 + 0.18; // matches rope offset in Task 11
      var hangBelow = 0.4; // shide hang ~0.4 below the rope center
      var count = 5 + Math.floor(Math.random() * 3); // 5-7
      for (var si = 0; si < count; si++) {
        var angle = (si / count) * Math.PI * 2;
        var sx = trunkX + Math.cos(angle) * avgRadius;
        var sz = trunkZ + Math.sin(angle) * avgRadius;
        var sy = ropeY - hangBelow;
        buildShideAt(sx, sy, sz);
      }
    }
```

- [ ] **Step 3:** Add shide animation to the `update()` function. Find the existing `update(t, scrollY)` function and add inside it (after `applyHandheldFloat`):

```javascript
      for (var i = 0; i < shideMaterials.length; i++) {
        shideMaterials[i].uniforms.uTime.value = t;
      }
```

- [ ] **Step 4:** Reload. Expected: small white zig-zag paper streamers hang from each rope and sway gently.

- [ ] **Step 5:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add animated shide streamers on shimenawa ropes"
```

---

### Task 13: Shrine elements (hokora, jizo, ishidoro, sotoba, haka)

**Files:**
- Modify: `assets/japanjunky-forest.js`

All shrine props are **billboarded planes** with photo textures (placeholders for now). Single instanced atlas in production; for placeholder we use individual canvas textures.

- [ ] **Step 1:** Add placeholder texture generator and prop builder:

```javascript
    // ─── Shrine props (placeholders until Task 19) ────────────
    function makeFlatColorTex(w, h, hex) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      // Add a simple silhouette shape per type for visual differentiation
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, h - 4, w, 4);
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }

    // Each prop: width, height, color (placeholder), worldPos
    var SHRINE_PROPS = [
      // hokora — biggest, at base of primary hero cedar (4, _, 12)
      { type: 'hokora',   w: 1.0, h: 0.9, hex: '#7a6a55', pos: [3.6, 0.45, 10.6] },
      // jizo cluster (left of hokora)
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [1.2, 0.35, 9.0] },
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [0.8, 0.35, 9.3] },
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [1.5, 0.35, 9.4] },
      // ishidoro stone lanterns lining a faint path
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [2.0, 0.7, 11.0] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [4.0, 0.7, 13.5] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [-3.0, 0.7, 14.0] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [5.5, 0.7, 16.0] },
      // sotoba leaning behind hokora
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [4.7, 0.8, 11.0] },
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [4.9, 0.8, 11.2] },
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [5.1, 0.8, 11.1] },
      // haka gravestone clusters
      { type: 'haka',     w: 0.5, h: 0.4, hex: '#7a7060', pos: [-4.2, 0.2, 13.0] },
      { type: 'haka',     w: 0.5, h: 0.4, hex: '#7a7060', pos: [-4.8, 0.2, 13.3] }
    ];

    function buildShrineProps() {
      // Reuse one texture per type for placeholder
      var typeTex = {};
      function getTypeTex(type, hex) {
        if (typeTex[type]) return typeTex[type];
        typeTex[type] = makeFlatColorTex(64, 96, hex);
        return typeTex[type];
      }
      for (var i = 0; i < SHRINE_PROPS.length; i++) {
        var P = SHRINE_PROPS[i];
        var geo = new THREE.PlaneGeometry(P.w, P.h);
        var mat = new THREE.MeshBasicMaterial({
          map: getTypeTex(P.type, P.hex),
          transparent: true,
          side: THREE.DoubleSide,
          fog: true
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(P.pos[0], P.pos[1], P.pos[2]);
        // Always-face-camera billboard: lookAt camera each frame
        mesh.userData.isBillboard = true;
        mesh.userData.propType = P.type;
        layers.shrine.add(mesh);
      }
    }
    buildShrineProps();
```

- [ ] **Step 2:** Add billboard update to `update()`. Inside the existing `update(t, scrollY)` function, after the shide loop:

```javascript
      // Billboards face camera
      for (var bi = 0; bi < layers.shrine.children.length; bi++) {
        var b = layers.shrine.children[bi];
        if (b.userData.isBillboard) b.lookAt(camera.position);
      }
```

- [ ] **Step 3:** Reload. Expected: small color-coded rectangles cluster near the primary hero cedar — these are the placeholder shrine props.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add shrine props (hokora, jizo, ishidoro, sotoba, haka)"
```

---

### Task 14: Foreground roots/moss (Layer 5)

**Files:**
- Modify: `assets/japanjunky-forest.js`

Bottom-edge mossy root flares from off-frame trunks. Frames the shot.

- [ ] **Step 1:** Add foreground builder:

```javascript
    // ─── Layer 5: Foreground roots / moss ─────────────────────
    function makePlaceholderMoss() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#2a4a1c';
      ctx.fillRect(0, 0, 64, 64);
      // Speckle
      for (var i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(60,90,30,0.5)';
        ctx.fillRect(
          Math.floor(Math.random() * 64),
          Math.floor(Math.random() * 64), 2, 2);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var mossTex = (opts.textures && opts.textures.moss) || makePlaceholderMoss();

    // Single low-poly mound at frame edge representing a giant root flare.
    var fgGeo = new THREE.SphereGeometry(2.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    var fgMat = new THREE.MeshBasicMaterial({ map: mossTex, fog: true });
    mossTex.repeat.set(2, 2);
    var fgMound = new THREE.Mesh(fgGeo, fgMat);
    fgMound.position.set(-3, -0.5, 3);
    fgMound.scale.set(1.5, 0.6, 1.0);
    layers.foreground.add(fgMound);
```

- [ ] **Step 2:** Reload. Expected: a green mossy mound bulges from the bottom-left edge of the frame.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add mossy root flare in foreground"
```

---

### Task 15: Road slice (Layer 6)

**Files:**
- Modify: `assets/japanjunky-forest.js`

A narrow asphalt strip along the bottom-left of the frame, receding off-screen-left.

- [ ] **Step 1:** Add road builder:

```javascript
    // ─── Layer 6: Road slice ──────────────────────────────────
    function makePlaceholderRoad() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, 64, 256);
      // Faint center line streak
      ctx.fillStyle = '#4a3e30';
      ctx.fillRect(30, 0, 4, 256);
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var roadTex = (opts.textures && opts.textures.road) || makePlaceholderRoad();
    roadTex.repeat.set(1, 8);

    var roadGeo = new THREE.PlaneGeometry(3, 30);
    var roadMat = new THREE.MeshBasicMaterial({ map: roadTex, fog: true });
    var roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(-4, 0.01, 8);
    layers.road.add(roadMesh);
```

- [ ] **Step 2:** Reload. Expected: a dark asphalt strip runs along the bottom-left, receding into the fog.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add road slice along bottom-left of frame"
```

---

## Phase 4 — Asset Pipeline (Real Textures)

Phase 3 used procedural canvas placeholders. Phase 4 replaces them with PS1-styled photo textures sourced from CC photos. This phase is partly **manual** (sourcing photos), partly **scripted** (PS1-ifying), partly **integration** (wiring real PNGs into the forest module).

### Task 16: Source CC photos for textures

**Files:**
- Create directory: `tools/forest-textures/sources/`
- Create: `tools/forest-textures/SOURCES.md` (provenance log)

This is a manual sourcing task. Track license + URL for every photo.

- [ ] **Step 1:** Create directory.

```bash
mkdir -p tools/forest-textures/sources
```

- [ ] **Step 2:** Source CC0 / CC-BY photos for each asset. Recommended sources: Pexels (CC0), Unsplash (Unsplash License), Wikimedia Commons (CC-BY/CC0). Required photos:

| Filename | What | Min res |
|----------|------|---------|
| `cedar_bark_src.jpg` | Close-up Japanese cedar bark, vertically oriented | 800×1600 |
| `cedar_moss_src.jpg` | Mossy tree base | 800×800 |
| `shimenawa_src.jpg` | Twisted golden rope close-up (concept3 reference) | 1024×512 |
| `shide_src.jpg` | Shide paper streamer (cleaned) | 256×512 |
| `hokora_src.jpg` | Small Shinto stone shrine | 512×512 |
| `jizo_src.jpg` | Stone Jizo statue | 256×512 |
| `ishidoro_src.jpg` | Stone garden lantern | 256×512 |
| `sotoba_src.jpg` | Wooden grave marker plank with sutras | 128×1024 |
| `haka_src.jpg` | Stone gravestone | 256×256 |
| `needles_src.jpg` | Cedar litter on forest floor | 800×800 |
| `moss_src.jpg` | Bright green moss patch | 512×512 |
| `silhouette_src.jpg` | Dense cedar trunks (concept2 vibe), high contrast | 1600×800 |

Save all into `tools/forest-textures/sources/`.

- [ ] **Step 3:** Write `tools/forest-textures/SOURCES.md` with one row per file:

```markdown
# Texture Sources

| File                | Source URL          | License | Author     |
|---------------------|---------------------|---------|------------|
| cedar_bark_src.jpg  | <url>               | CC0     | <author>   |
| ... (one per file)  |                     |         |            |
```

- [ ] **Step 4:** Commit (license tracking is required).

```bash
git add tools/forest-textures/SOURCES.md tools/forest-textures/sources/
git commit -m "feat(forest-textures): source CC-licensed photos for forest scene"
```

---

### Task 17: Build PS1-ification script

**Files:**
- Create: `tools/forest-textures/build.js`
- Create: `tools/forest-textures/package.json`

Node.js script using `sharp` to crop, posterize, palette-snap, and resize.

- [ ] **Step 1:** Create `tools/forest-textures/package.json`:

```json
{
  "name": "jj-forest-textures",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.js"
  },
  "dependencies": {
    "sharp": "^0.33.0"
  }
}
```

- [ ] **Step 2:** Create `tools/forest-textures/build.js`:

```javascript
import sharp from 'sharp';
import { mkdir, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'sources');
const OUT_DIR = path.join(__dirname, '..', '..', 'assets');

// Per-texture spec: src filename → output filename + (w, h) + extra ops
const TEXTURES = [
  { src: 'cedar_bark_src.jpg',  out: 'cedar_bark.png',         w: 256,  h: 512 },
  { src: 'cedar_moss_src.jpg',  out: 'cedar_moss_base.png',    w: 256,  h: 256 },
  { src: 'shimenawa_src.jpg',   out: 'shimenawa_rope.png',     w: 512,  h: 128 },
  { src: 'shide_src.jpg',       out: 'shide_paper.png',        w: 64,   h: 128, alpha: true },
  { src: 'hokora_src.jpg',      out: 'hokora_stone.png',       w: 256,  h: 256, alpha: true },
  { src: 'jizo_src.jpg',        out: 'jizo_face.png',          w: 128,  h: 256, alpha: true },
  { src: 'ishidoro_src.jpg',    out: 'ishidoro_stone.png',     w: 128,  h: 256, alpha: true },
  { src: 'sotoba_src.jpg',      out: 'sotoba_wood.png',        w: 64,   h: 512, alpha: true },
  { src: 'haka_src.jpg',        out: 'haka_stone.png',         w: 128,  h: 128, alpha: true },
  { src: 'needles_src.jpg',     out: 'ground_needles.png',     w: 512,  h: 512 },
  { src: 'moss_src.jpg',        out: 'moss_patch.png',         w: 256,  h: 256 },
  { src: 'silhouette_src.jpg',  out: 'silhouette_trunks.png',  w: 1024, h: 512, alpha: true }
];

// Amber-biased posterize: warm reds/yellows, preserve greens, cool blues, push palette
async function processTexture(t) {
  const src = path.join(SRC_DIR, t.src);
  const out = path.join(OUT_DIR, t.out);

  let pipe = sharp(src)
    .resize(t.w, t.h, { fit: 'cover' })
    // Modulate: saturation up (vivid), brightness up slightly
    .modulate({ saturation: 1.4, brightness: 1.05 })
    // Tint: warm amber bias
    .tint({ r: 255, g: 215, b: 170 })
    // Posterize via reduced bits per channel (gives that PS1 banding)
    .png({ palette: true, colors: 32, dither: 1.0 });

  if (t.alpha) {
    // For props: detect background (assume white-ish) and remove
    pipe = pipe.ensureAlpha();
  }

  await pipe.toFile(out);
  console.log(`✓ ${t.src} → ${t.out} (${t.w}×${t.h})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const t of TEXTURES) {
    try {
      await processTexture(t);
    } catch (e) {
      console.error(`✗ ${t.src}: ${e.message}`);
    }
  }
}

main();
```

- [ ] **Step 3:** Install deps.

```bash
cd tools/forest-textures && npm install
```
Expected: sharp installs without error.

- [ ] **Step 4:** Commit pipeline (don't run yet — Task 18 runs it).

```bash
git add tools/forest-textures/build.js tools/forest-textures/package.json
git commit -m "feat(forest-textures): add PS1-ification build script (sharp)"
```

---

### Task 18: Generate textures + build atlas

**Files:**
- Modify: `tools/forest-textures/build.js` (add atlas step)
- Create (via build): all `assets/*.png` listed in Task 17's `TEXTURES` array
- Create (via build): `assets/shrine_atlas.png`

- [ ] **Step 1:** Append atlas-build logic to `build.js` after the `main()` body but before its invocation:

```javascript
// Atlas: pack jizo, ishidoro, sotoba, haka, shide into a 1024×1024 grid
async function buildAtlas() {
  const ATLAS = path.join(OUT_DIR, 'shrine_atlas.png');
  const slots = [
    { file: 'jizo_face.png',      x: 0,    y: 0,   w: 128, h: 256 },
    { file: 'ishidoro_stone.png', x: 128,  y: 0,   w: 128, h: 256 },
    { file: 'sotoba_wood.png',    x: 256,  y: 0,   w: 64,  h: 512 },
    { file: 'haka_stone.png',     x: 320,  y: 0,   w: 128, h: 128 },
    { file: 'shide_paper.png',    x: 448,  y: 0,   w: 64,  h: 128 }
  ];
  const composite = slots.map(s => ({
    input: path.join(OUT_DIR, s.file),
    left: s.x,
    top:  s.y
  }));
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
  })
    .composite(composite)
    .png()
    .toFile(ATLAS);

  // Write atlas UV map for runtime
  const uv = {};
  for (const s of slots) {
    uv[s.file.replace('.png', '')] = {
      u0: s.x / 1024,
      v0: 1 - (s.y + s.h) / 1024,
      u1: (s.x + s.w) / 1024,
      v1: 1 - s.y / 1024
    };
  }
  const fs = await import('fs/promises');
  await fs.writeFile(
    path.join(OUT_DIR, 'shrine_atlas.json'),
    JSON.stringify(uv, null, 2)
  );
  console.log('✓ shrine_atlas.png + shrine_atlas.json');
}
```

Update `main()`:

```javascript
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const t of TEXTURES) {
    try { await processTexture(t); } catch (e) { console.error(`✗ ${t.src}: ${e.message}`); }
  }
  await buildAtlas();
}
```

- [ ] **Step 2:** Run.

```bash
cd tools/forest-textures && npm run build
```
Expected: ~13 success lines + atlas. All output files appear in `assets/`.

- [ ] **Step 3:** Visually inspect 2-3 generated PNGs (open in image viewer). Confirm posterized/amber-tinted appearance.

- [ ] **Step 4:** Commit generated textures.

```bash
git add tools/forest-textures/build.js assets/cedar_bark.png assets/cedar_moss_base.png assets/shimenawa_rope.png assets/shide_paper.png assets/hokora_stone.png assets/jizo_face.png assets/ishidoro_stone.png assets/sotoba_wood.png assets/haka_stone.png assets/ground_needles.png assets/moss_patch.png assets/silhouette_trunks.png assets/shrine_atlas.png assets/shrine_atlas.json
git commit -m "feat(forest-textures): generate PS1-styled textures + shrine atlas"
```

---

### Task 19: Wire real textures into forest module

**Files:**
- Modify: `assets/japanjunky-forest.js`
- Modify: `layout/theme.liquid` (preload links)

- [ ] **Step 1:** In `theme.liquid`, after the existing CSS block (around line 41 after `splash.css` conditional), add preloads:

```liquid
  {% if settings.scene_mode == 'forest' or settings.scene_mode == blank %}
  <link rel="preload" as="image" href="{{ 'shrine_atlas.png' | asset_url }}">
  <link rel="preload" as="image" href="{{ 'cedar_bark.png' | asset_url }}">
  <link rel="preload" as="image" href="{{ 'silhouette_trunks.png' | asset_url }}">
  {% endif %}
```

- [ ] **Step 2:** In `theme.liquid`, plumb texture URLs to the forest module. Inside the `JJ_SCREENSAVER_CONFIG` block from Task 2, add a `forestTextures` field:

```liquid
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      ...
      sceneMode: '{{ settings.scene_mode | default: "forest" }}',
      audioEnabled: {{ settings.audio_enabled | default: true }},
      forestTextures: {
        bark:        {{ 'cedar_bark.png'        | asset_url | json }},
        mossBase:    {{ 'cedar_moss_base.png'   | asset_url | json }},
        rope:        {{ 'shimenawa_rope.png'    | asset_url | json }},
        shide:       {{ 'shide_paper.png'       | asset_url | json }},
        hokora:      {{ 'hokora_stone.png'      | asset_url | json }},
        ishidoroTex: {{ 'ishidoro_stone.png'    | asset_url | json }},
        jizoTex:     {{ 'jizo_face.png'         | asset_url | json }},
        sotobaTex:   {{ 'sotoba_wood.png'       | asset_url | json }},
        hakaTex:     {{ 'haka_stone.png'        | asset_url | json }},
        moss:        {{ 'moss_patch.png'        | asset_url | json }},
        ground:      {{ 'ground_needles.png'    | asset_url | json }},
        silhouette:  {{ 'silhouette_trunks.png' | asset_url | json }},
        atlas:       {{ 'shrine_atlas.png'      | asset_url | json }}
      },
      ...
```

- [ ] **Step 3:** In `screensaver.js`, pass the textures into the forest factory. Find the forest creation block from Task 5:

```javascript
  } else if (window.JJ_Forest) {
    sceneModule = window.JJ_Forest.create(scene, camera, clock, {
      cameraPreset: config.cameraPreset,
      tier: 'high'
    });
  }
```

Replace with:

```javascript
  } else if (window.JJ_Forest) {
    sceneModule = window.JJ_Forest.create(scene, camera, clock, {
      cameraPreset: config.cameraPreset,
      tier: 'high',
      textureUrls: config.forestTextures || {}
    });
  }
```

- [ ] **Step 4:** In `forest.js`, add a texture loader at the top of `create()` that loads any URLs provided and calls back. Insert right after the `var currentTier = ...` line:

```javascript
    // ─── Texture loader ───────────────────────────────────────
    var textureLoader = new THREE.TextureLoader();
    function loadTex(url, opts) {
      var tex = textureLoader.load(url);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      if (opts && opts.repeat) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(opts.repeat[0], opts.repeat[1]);
      }
      return tex;
    }
    var urls = opts.textureUrls || {};
    var realTextures = {};
    if (urls.bark)        realTextures.bark        = loadTex(urls.bark, { repeat: [1, 4] });
    if (urls.rope)        realTextures.rope        = loadTex(urls.rope, { repeat: [4, 1] });
    if (urls.shide)       realTextures.shide       = loadTex(urls.shide);
    if (urls.hokora)      realTextures.hokora      = loadTex(urls.hokora);
    if (urls.jizoTex)     realTextures.jizo        = loadTex(urls.jizoTex);
    if (urls.ishidoroTex) realTextures.ishidoro    = loadTex(urls.ishidoroTex);
    if (urls.sotobaTex)   realTextures.sotoba      = loadTex(urls.sotobaTex);
    if (urls.hakaTex)     realTextures.haka        = loadTex(urls.hakaTex);
    if (urls.moss)        realTextures.moss        = loadTex(urls.moss, { repeat: [4, 4] });
    if (urls.ground)      realTextures.ground      = loadTex(urls.ground, { repeat: [8, 8] });
    if (urls.silhouette)  realTextures.silhouette  = loadTex(urls.silhouette);
```

- [ ] **Step 5:** Update placeholder fallback chain. In each prior task's `var XTex = (opts.textures && opts.textures.X) || makePlaceholderX();`, change to prefer real textures:

```javascript
    var barkTex = realTextures.bark || makePlaceholderBark();
    var ropeTex = realTextures.rope || makePlaceholderRope();
    var shideTex = realTextures.shide || makePlaceholderShide();
    var mossTex = realTextures.moss || makePlaceholderMoss();
    var roadTex = makePlaceholderRoad(); // road keeps procedural — no real texture in spec
```

- [ ] **Step 6:** Replace the silhouette procedural shader from Task 7 with a textured plane when `realTextures.silhouette` is available. Find the silhouette block and add at the top:

```javascript
    if (realTextures.silhouette) {
      // Use real silhouette photo
      var silhouetteMat = new THREE.MeshBasicMaterial({
        map: realTextures.silhouette,
        transparent: true,
        depthWrite: false,
        fog: false
      });
      var silhouetteGeo = new THREE.PlaneGeometry(160, 30);
      var silhouetteMesh = new THREE.Mesh(silhouetteGeo, silhouetteMat);
      silhouetteMesh.position.set(0, 6, 60);
      silhouetteMesh.renderOrder = -9;
      layers.silhouette.add(silhouetteMesh);
    } else {
      // Procedural fallback (existing code from Task 7 stays here)
      ...
    }
```

- [ ] **Step 7:** Update shrine props to use real textures by mapping `propType` → `realTextures[propType]`:

```javascript
    function buildShrineProps() {
      var typeTex = {};
      function getTypeTex(type, hex) {
        if (typeTex[type]) return typeTex[type];
        var realKey = { jizo: 'jizo', ishidoro: 'ishidoro', hokora: 'hokora', sotoba: 'sotoba', haka: 'haka' }[type];
        if (realKey && realTextures[realKey]) {
          typeTex[type] = realTextures[realKey];
        } else {
          typeTex[type] = makeFlatColorTex(64, 96, hex);
        }
        return typeTex[type];
      }
      // ... rest of buildShrineProps unchanged ...
    }
```

- [ ] **Step 8:** Reload site. Expected: real photo-textured trunks, ropes, shrine props replace the placeholder colored rectangles. Console: no 404s or texture-load errors.

- [ ] **Step 9:** Commit.

```bash
git add assets/japanjunky-forest.js layout/theme.liquid
git commit -m "feat(forest): wire real PS1 textures into scene"
```

---

## Phase 5 — Shaders & Effects

### Task 20: PS1 vertex-snap wobble shader injection

**Files:**
- Modify: `assets/japanjunky-forest.js`

PS1 hallmark: vertex positions quantized to integer pixel coordinates after projection. Inject into every `MeshBasicMaterial` via `onBeforeCompile`.

- [ ] **Step 1:** Add a snap-injector helper near the top of `create()`:

```javascript
    // ─── PS1 vertex-snap shader injection ─────────────────────
    // Quantize clip-space xy to integer pixel grid → wobble effect.
    var SNAP_RES = 240; // matches portal resolution
    function injectVertexSnap(mat) {
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uSnapRes = { value: SNAP_RES };
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          [
            '#include <project_vertex>',
            'uniform float uSnapRes;',
            // Already-defined #include above sets gl_Position. Snap it.
            'gl_Position.xy = floor(gl_Position.xy * uSnapRes / gl_Position.w)',
            '              * gl_Position.w / uSnapRes;'
          ].join('\n')
        );
        // Re-declare uSnapRes uniform in case the include order shadows it.
        shader.vertexShader = 'uniform float uSnapRes;\n' + shader.vertexShader;
      };
      mat.userData.psSnap = true;
    }
```

- [ ] **Step 2:** Apply the injector to every cedar/rope/road/foreground material when they are created. Modify `buildCedar` to apply after creating the material:

```javascript
    function buildCedar(sides, height, baseRadius, topRadius, barkTex) {
      // ... existing geometry + colors setup ...
      var mat = new THREE.MeshBasicMaterial({
        map: barkTex,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true
      });
      injectVertexSnap(mat);
      // ... rest unchanged ...
    }
```

Apply same way in `buildRope`, `buildShrineProps` (per material), `roadMat`, `fgMat`.

- [ ] **Step 3:** Reload. Expected: visible vertex wobble — when camera floats, geometry edges shimmer/snap subtly. Cedars get a PS1-grade jitter.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): apply PS1 vertex-snap shader to all opaque meshes"
```

---

### Task 21: Phosphor amber LUT (RTT pass)

**Files:**
- Modify: `assets/japanjunky-forest.js`

A render-to-texture pass between the scene and CRT post-process applies an amber-biased color LUT.

- [ ] **Step 1:** Phosphor LUT is most cleanly implemented as a `THREE.ShaderPass` on the existing post-process chain. Open `assets/japanjunky-screensaver-post.js` first to confirm composer pattern.

```bash
head -60 assets/japanjunky-screensaver-post.js
```

- [ ] **Step 2:** In `forest.js`, expose a method that returns the LUT shader pass so screensaver.js can insert it into the composer:

```javascript
    // ─── Phosphor LUT shader pass ─────────────────────────────
    var PHOSPHOR_FRAG = [
      'uniform sampler2D tDiffuse;',
      'uniform float uMix;',
      'varying vec2 vUv;',
      'vec3 phosphor(vec3 c) {',
      '  // Amber-bias: pull reds warmer, push whites cream, deepen blacks',
      '  vec3 amber = vec3(',
      '    c.r * 1.05 + c.g * 0.10,',
      '    c.r * 0.20 + c.g * 0.95 + c.b * 0.02,',
      '    c.r * 0.10 + c.g * 0.30 + c.b * 0.80',
      '  );',
      '  // Preserve greens (moss/shide signal color)',
      '  float greenMask = clamp(c.g - max(c.r, c.b), 0.0, 1.0);',
      '  amber = mix(amber, c, greenMask);',
      '  return amber;',
      '}',
      'void main() {',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  vec3 mixed = mix(c.rgb, phosphor(c.rgb), uMix);',
      '  gl_FragColor = vec4(mixed, c.a);',
      '}'
    ].join('\n');

    function getPhosphorPass() {
      // Return a ShaderPass-shaped descriptor that screensaver.js can use
      return {
        uniforms: {
          tDiffuse: { value: null },
          uMix:     { value: 0.7 }
        },
        vertexShader: [
          'varying vec2 vUv;',
          'void main() {',
          '  vUv = uv;',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '}'
        ].join('\n'),
        fragmentShader: PHOSPHOR_FRAG
      };
    }
```

Add `getPhosphorPass: getPhosphorPass` to the returned object at the bottom of `create()`.

- [ ] **Step 3:** In `screensaver.js`, after the composer is set up but before the CRT post-process pass, insert the phosphor pass when scene mode is forest. Locate where the composer is built and append:

```javascript
  if (sceneModule && sceneModule.getPhosphorPass) {
    var phosphor = sceneModule.getPhosphorPass();
    // Wrap as ShaderPass equivalent (the project uses a custom post chain;
    // mimic the existing pattern from screensaver-post.js)
    composer.addPass(new THREE.ShaderPass({
      uniforms: phosphor.uniforms,
      vertexShader: phosphor.vertexShader,
      fragmentShader: phosphor.fragmentShader
    }));
  }
```

(If `THREE.ShaderPass` isn't already imported, look in screensaver-post.js for how passes are constructed — adopt that pattern verbatim.)

- [ ] **Step 4:** Reload. Expected: whole scene gains a subtle amber tint. Greens of moss stay green. Whites push to cream.

- [ ] **Step 5:** Commit.

```bash
git add assets/japanjunky-forest.js assets/japanjunky-screensaver.js
git commit -m "feat(forest): add phosphor amber LUT post-process pass"
```

---

### Task 22: God rays (cheap fake — additive billboards)

**Files:**
- Modify: `assets/japanjunky-forest.js`

- [ ] **Step 1:** Add god-ray builder and 5 instances by default:

```javascript
    // ─── God rays (Layer godRays) ─────────────────────────────
    function makeGodRayTexture() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      var ctx = c.getContext('2d');
      var grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0,    'rgba(255,200,120,0.0)');
      grad.addColorStop(0.45, 'rgba(255,200,120,0.55)');
      grad.addColorStop(1,    'rgba(255,200,120,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 256);
      // Edge-soft horizontal falloff
      var hgrad = ctx.createLinearGradient(0, 0, 64, 0);
      hgrad.addColorStop(0, 'rgba(0,0,0,0.7)');
      hgrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      hgrad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = hgrad;
      ctx.fillRect(0, 0, 64, 256);
      return new THREE.CanvasTexture(c);
    }
    var godRayTex = makeGodRayTexture();
    var godRayMaterials = [];
    function buildGodRay(x, y, z, scaleX, scaleY, rotZ, basePhase) {
      var geo = new THREE.PlaneGeometry(scaleX, scaleY);
      var mat = new THREE.MeshBasicMaterial({
        map: godRayTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.55
      });
      mat.userData.godRayPhase = basePhase;
      godRayMaterials.push(mat);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotZ;
      // Tilt slightly toward camera for downward-angle look
      mesh.rotation.x = -0.4;
      mesh.renderOrder = 5;
      layers.godRays.add(mesh);
      return mesh;
    }
    var GOD_RAY_LAYOUT = [
      // [x, y, z, scaleX, scaleY, rotZ, basePhase]
      [ 2,  6, 14, 4, 12,  0.2, 0.0],
      [-1,  7, 16, 3, 11, -0.1, 1.4],
      [ 5,  6, 18, 4, 12,  0.3, 2.7],
      [-3,  7, 20, 3, 10,  0.0, 4.1],
      [ 1,  8, 22, 4, 14, -0.2, 5.3]
    ];
    function buildGodRays(count) {
      for (var i = 0; i < Math.min(count, GOD_RAY_LAYOUT.length); i++) {
        var L = GOD_RAY_LAYOUT[i];
        buildGodRay(L[0], L[1], L[2], L[3], L[4], L[5], L[6]);
      }
    }
    buildGodRays(5);
```

- [ ] **Step 2:** Add god-ray opacity breath to `update()`. Inside the `update()` body:

```javascript
      // God-ray slow opacity breath
      for (var gi = 0; gi < godRayMaterials.length; gi++) {
        var phase = godRayMaterials[gi].userData.godRayPhase;
        godRayMaterials[gi].opacity = 0.50 + Math.sin(t * 0.4 + phase) * 0.08;
      }
```

- [ ] **Step 3:** Reload. Expected: slanting amber light shafts visible behind the cedars.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add 5 god-ray billboards with opacity breath"
```

---

### Task 23: Drifting fog wisps (instanced billboards)

**Files:**
- Modify: `assets/japanjunky-forest.js`

- [ ] **Step 1:** Add fog-wisp builder using `InstancedMesh`:

```javascript
    // ─── Fog wisps (instanced billboards) ─────────────────────
    function makeFogWispTexture() {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      var ctx = c.getContext('2d');
      var grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 60);
      grad.addColorStop(0,    'rgba(220,180,130,0.6)');
      grad.addColorStop(0.5,  'rgba(180,140,100,0.25)');
      grad.addColorStop(1,    'rgba(180,140,100,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 64);
      return new THREE.CanvasTexture(c);
    }
    var fogWispTex = makeFogWispTexture();
    var FOG_WISP_COUNT = 20;
    var fogWispGeo = new THREE.PlaneGeometry(3, 1.2);
    var fogWispMat = new THREE.MeshBasicMaterial({
      map: fogWispTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    var fogWispMesh = new THREE.InstancedMesh(fogWispGeo, fogWispMat, FOG_WISP_COUNT);
    var fogWispData = []; // per-instance state
    var dummy = new THREE.Object3D();
    for (var fi = 0; fi < FOG_WISP_COUNT; fi++) {
      var x = (Math.random() - 0.5) * 30;
      var y = 0.3 + Math.random() * 1.5;
      var z = 8 + Math.random() * 30;
      fogWispData.push({
        baseX: x, baseY: y, baseZ: z,
        driftPhase: Math.random() * 6.28,
        speed: 0.05 + Math.random() * 0.05
      });
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      fogWispMesh.setMatrixAt(fi, dummy.matrix);
    }
    fogWispMesh.instanceMatrix.needsUpdate = true;
    layers.fogWisps.add(fogWispMesh);
```

- [ ] **Step 2:** Animate in `update()`. Inside:

```javascript
      // Fog wisp drift
      for (var wi = 0; wi < fogWispData.length; wi++) {
        var d = fogWispData[wi];
        dummy.position.set(
          d.baseX + Math.sin(t * d.speed + d.driftPhase) * 1.2,
          d.baseY + Math.sin(t * d.speed * 1.3 + d.driftPhase) * 0.2,
          d.baseZ + Math.cos(t * d.speed + d.driftPhase) * 0.6
        );
        dummy.lookAt(camera.position);
        dummy.updateMatrix();
        fogWispMesh.setMatrixAt(wi, dummy.matrix);
      }
      fogWispMesh.instanceMatrix.needsUpdate = true;
```

- [ ] **Step 3:** Reload. Expected: soft amber wisps drift between trunks at low height.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add 20 drifting fog wisps via InstancedMesh"
```

---

### Task 24: Falling needle particles + distant bird

**Files:**
- Modify: `assets/japanjunky-forest.js`

- [ ] **Step 1:** Add falling needles (60 instances) and a single distant bird:

```javascript
    // ─── Falling needles ──────────────────────────────────────
    var NEEDLE_COUNT = 60;
    var needleGeo = new THREE.PlaneGeometry(0.04, 0.18);
    var needleMat = new THREE.MeshBasicMaterial({
      color: 0x6a4020,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      fog: true
    });
    var needleMesh = new THREE.InstancedMesh(needleGeo, needleMat, NEEDLE_COUNT);
    var needleData = [];
    for (var ni = 0; ni < NEEDLE_COUNT; ni++) {
      needleData.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 14,
        z: 6 + Math.random() * 30,
        rotZ: Math.random() * 6.28,
        vy: -0.03 - Math.random() * 0.04,
        vx: (Math.random() - 0.5) * 0.01,
        spin: (Math.random() - 0.5) * 0.4
      });
    }
    layers.particles.add(needleMesh);

    // ─── Distant bird ─────────────────────────────────────────
    var birdGeo = new THREE.PlaneGeometry(0.5, 0.15);
    var birdMat = new THREE.MeshBasicMaterial({
      color: 0x1a0a04,
      transparent: true,
      opacity: 0.8,
      fog: false
    });
    var birdMesh = new THREE.Mesh(birdGeo, birdMat);
    birdMesh.position.set(-30, 8, 60);
    birdMesh.visible = false;
    layers.particles.add(birdMesh);
    var birdNextStart = 30; // first appearance ~30s in
```

- [ ] **Step 2:** Animate in `update()`:

```javascript
      // Needles
      for (var npi = 0; npi < needleData.length; npi++) {
        var nd = needleData[npi];
        nd.x += nd.vx;
        nd.y += nd.vy;
        nd.rotZ += nd.spin * 0.02;
        if (nd.y < -0.2) {
          nd.y = 14;
          nd.x = (Math.random() - 0.5) * 20;
          nd.z = 6 + Math.random() * 30;
        }
        dummy.position.set(nd.x, nd.y, nd.z);
        dummy.rotation.set(0, 0, nd.rotZ);
        dummy.updateMatrix();
        needleMesh.setMatrixAt(npi, dummy.matrix);
      }
      needleMesh.instanceMatrix.needsUpdate = true;

      // Bird: scripted single flight every 30-60s
      if (t > birdNextStart && !birdMesh.visible) {
        birdMesh.visible = true;
        birdMesh.position.set(-30, 7 + Math.random() * 3, 50 + Math.random() * 15);
        birdMesh.userData.startT = t;
      }
      if (birdMesh.visible) {
        var dt = t - birdMesh.userData.startT;
        birdMesh.position.x = -30 + dt * 6; // crosses screen
        if (birdMesh.position.x > 30) {
          birdMesh.visible = false;
          birdNextStart = t + 30 + Math.random() * 30;
        }
      }
```

- [ ] **Step 3:** Reload. Expected: cedar needles drift down through frame; rare bird silhouette flies left to right far away.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add falling needles + distant bird silhouette"
```

---

### Task 25: Lantern point lights + flicker

**Files:**
- Modify: `assets/japanjunky-forest.js`

Lanterns are zone-tagged: their PointLight only affects mossy ground patches near them. Most meshes opt out via `material.fog = true; material.userData.lantern = false`.

- [ ] **Step 1:** Add lantern lights at each ishidoro position from `SHRINE_PROPS`:

```javascript
    // ─── Lantern point lights ─────────────────────────────────
    // Standard layers/groups: light affects everything by default; we
    // gate by setting Tsuno + non-receiver materials' fog only and
    // adding Lambertian receivers under each lantern as a moss patch.
    var lanternLights = [];
    var lanternMossPatches = [];
    function makeMossPatch(x, z, radius) {
      var geo = new THREE.CircleGeometry(radius, 12);
      var mat = new THREE.MeshLambertMaterial({
        map: realTextures.moss || mossTex,
        side: THREE.DoubleSide,
        fog: true
      });
      injectVertexSnap(mat);
      var patch = new THREE.Mesh(geo, mat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.02, z);
      layers.shrine.add(patch);
      return patch;
    }
    function buildLanterns() {
      for (var i = 0; i < SHRINE_PROPS.length; i++) {
        var P = SHRINE_PROPS[i];
        if (P.type !== 'ishidoro') continue;
        var light = new THREE.PointLight(0xff7820, 0.4, 4.0, 2.0);
        light.position.set(P.pos[0], P.pos[1] + 0.5, P.pos[2]);
        light.userData.basePhase = Math.random() * 6.28;
        light.userData.baseIntensity = 0.4;
        layers.shrine.add(light);
        lanternLights.push(light);
        lanternMossPatches.push(makeMossPatch(P.pos[0], P.pos[2], 1.5));
      }
    }
    buildLanterns();
```

- [ ] **Step 2:** Add flicker to `update()`:

```javascript
      // Lantern flicker (perlin-style noise via sin sums)
      for (var li = 0; li < lanternLights.length; li++) {
        var L = lanternLights[li];
        var n = (
          Math.sin(t * 7.3 + L.userData.basePhase) * 0.5 +
          Math.sin(t * 13.1 + L.userData.basePhase * 2.1) * 0.3
        ) * 0.15;
        L.intensity = L.userData.baseIntensity + n;
      }
```

- [ ] **Step 3:** Reload. Expected: warm orange glow circles under each ishidoro, flickering subtly. Cedars unaffected because they use `MeshBasicMaterial`.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add lantern point lights with flicker + moss receivers"
```

---

### Task 26: Moss glow pulse

**Files:**
- Modify: `assets/japanjunky-forest.js`

Pulse the moss-patch material color with a slow sine.

- [ ] **Step 1:** Animate moss patches in `update()`:

```javascript
      // Moss glow pulse (subtle breathing)
      for (var mpi = 0; mpi < lanternMossPatches.length; mpi++) {
        var mp = lanternMossPatches[mpi];
        var pulse = 1.0 + Math.sin(t * 0.5 + mpi * 1.7) * 0.12;
        mp.material.color.setRGB(pulse, pulse, pulse);
      }
```

- [ ] **Step 2:** Reload. Expected: moss patches under lanterns gently brighten/dim out of phase with each other.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add moss glow pulse on lantern receivers"
```

---

### Task 27: Phosphor scintillation (grain overlay)

**Files:**
- Modify: `assets/japanjunky-forest.js`

A full-screen additive overlay quad with a tiled noise texture scrolled per-frame.

- [ ] **Step 1:** Add scintillation overlay using `OrthographicCamera`-rendered quad. Best implemented as a simple 2D plane fixed to the camera (parented):

```javascript
    // ─── Phosphor scintillation grain ─────────────────────────
    function makeNoiseTexture() {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(128, 128);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.floor(Math.random() * 256);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
    var grainTex = makeNoiseTexture();
    var grainMat = new THREE.MeshBasicMaterial({
      map: grainTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.03,
      color: 0xff9040,
      fog: false
    });
    var grainGeo = new THREE.PlaneGeometry(2, 2);
    var grainQuad = new THREE.Mesh(grainGeo, grainMat);
    grainQuad.frustumCulled = false;
    grainQuad.renderOrder = 999;
    // Parent to camera so it's always full-screen.
    camera.add(grainQuad);
    if (scene.children.indexOf(camera) === -1) scene.add(camera);
    grainQuad.position.set(0, 0, -1);
    // Track in layer for tier control (visibility toggled via setTier).
    // The mesh stays parented to camera; the layer reference is for
    // setTier() lookup only.
    layers.grain.userData.grainQuadRef = grainQuad;
```

- [ ] **Step 2:** Scroll grain UV per frame in `update()`:

```javascript
      // Grain UV scroll
      grainTex.offset.x = (t * 0.7) % 1;
      grainTex.offset.y = (t * 0.43) % 1;
```

- [ ] **Step 3:** Reload. Expected: faint amber sparkle shimmer over the whole scene.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add phosphor scintillation grain overlay"
```

---

## Phase 6 — Scroll Parallax

### Task 28: Per-layer scroll parallax

**Files:**
- Modify: `assets/japanjunky-forest.js`

Per-layer Y-offset on scroll. Uses Section 2 spec ratios.

- [ ] **Step 1:** In `update(t, scrollY)`, compute parallax offsets per layer:

```javascript
      // ─── Scroll parallax ──────────────────────────────────
      // Each layer drifts Y based on scrollY × per-layer ratio.
      // Negative because page scrolling down should move scene up.
      var SCROLL_PIXELS_PER_UNIT = 200; // 200 pixels of scroll = 1 world unit
      var sUnits = -(scrollY || 0) / SCROLL_PIXELS_PER_UNIT;
      layers.silhouette.position.y = sUnits * 0.05;
      layers.midGrove.position.y   = sUnits * 0.15;
      layers.hero.position.y       = sUnits * 0.40;
      layers.shrine.position.y     = sUnits * 0.60;
      layers.foreground.position.y = sUnits * 1.00;
      // Sky / road / particles / godRays / fogWisps / grain stay locked
```

- [ ] **Step 2:** Reload. Scroll the page. Expected: layers slide at different rates — silhouette barely moves, foreground moves most, sky stays fixed.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): add per-layer scroll parallax"
```

---

## Phase 7 — Performance Tiers

### Task 29: Tier matrix data + `setTier()` implementation

**Files:**
- Modify: `assets/japanjunky-forest.js`

`setTier(tier)` reconfigures already-built layers (toggle visibility, count). Cheaper than rebuild.

- [ ] **Step 1:** Add tier matrix as data structure near top of `create()`:

```javascript
    // ─── Tier matrix ──────────────────────────────────────────
    var TIER_MATRIX = {
      high: {
        midGroveCount: 8, midGroveSides: 12,
        heroCount: 4, heroSides: 16,
        ropeFull: true,
        shrineCount: 13,                // all SHRINE_PROPS entries
        mossPatches: 12,
        needles: 60,
        fogWisps: 20,
        godRays: 5,
        bird: true,
        lanternRealLights: true,
        flickerActive: true,
        mossGlow: true,
        scintillation: true,
        phosphorMix: 0.7,
        renderScale: 1.0,
        pixelRatioCap: 2.0,
        vertexSnap: true,
        fog: true
      },
      med: {
        midGroveCount: 8, midGroveSides: 12,
        heroCount: 4, heroSides: 12,
        ropeFull: true,
        shrineCount: 11,
        mossPatches: 6,
        needles: 30,
        fogWisps: 8,
        godRays: 3,
        bird: true,
        lanternRealLights: true,
        flickerActive: true,
        mossGlow: false,
        scintillation: true,
        phosphorMix: 0.7,
        renderScale: 0.85,
        pixelRatioCap: 1.5,
        vertexSnap: true,
        fog: true
      },
      low: {
        midGroveCount: 7, midGroveSides: 8,
        heroCount: 4, heroSides: 8,
        ropeFull: false,
        shrineCount: 8,
        mossPatches: 3,
        needles: 0,
        fogWisps: 0,
        godRays: 0,
        bird: false,
        lanternRealLights: false,
        flickerActive: false,
        mossGlow: false,
        scintillation: false,
        phosphorMix: 0.5,
        renderScale: 0.6,
        pixelRatioCap: 1.0,
        vertexSnap: true,
        fog: true
      }
    };

    // setTier applies a tier descriptor to already-built layers
    function setTier(tier) {
      if (!TIER_MATRIX[tier]) return;
      currentTier = tier;
      var T = TIER_MATRIX[tier];

      // Toggle counts by hiding excess instances
      for (var i = 0; i < layers.midGrove.children.length; i++) {
        layers.midGrove.children[i].visible = i < T.midGroveCount;
      }
      // Hero count rarely changes (always 4) — adjust only if T.heroCount < 4
      for (var hi = 0; hi < layers.hero.children.length; hi++) {
        // Skip ropes (they have isBillboard=undefined and isTrunk=undefined)
        // Trunks come first; only count trunks toward heroCount
      }
      // Shrine props
      for (var si = 0; si < layers.shrine.children.length; si++) {
        var ch = layers.shrine.children[si];
        if (ch.userData.isBillboard) ch.visible = si < T.shrineCount;
      }
      // Needles count
      if (needleMesh) needleMesh.count = T.needles;
      // Fog wisps count
      if (fogWispMesh) fogWispMesh.count = T.fogWisps;
      // God rays
      for (var gi = 0; gi < layers.godRays.children.length; gi++) {
        layers.godRays.children[gi].visible = gi < T.godRays;
      }
      // Bird
      if (birdMesh) birdMesh.visible = T.bird && birdMesh.visible;
      // Lantern real lights
      for (var li2 = 0; li2 < lanternLights.length; li2++) {
        lanternLights[li2].visible = T.lanternRealLights;
      }
      // Scintillation grain
      if (layers.grain.userData.grainQuadRef) {
        layers.grain.userData.grainQuadRef.visible = T.scintillation;
      }
      // Phosphor mix (if pass exists, apply via uniform — screensaver
      // owns the uniform handle. Expose via getter.)
      currentPhosphorMix = T.phosphorMix;
      // Mark current tier flags
      tierFlags = T;
    }
    var currentPhosphorMix = 0.7;
    var tierFlags = TIER_MATRIX.high;
    function getCurrentPhosphorMix() { return currentPhosphorMix; }
```

Add `getCurrentPhosphorMix: getCurrentPhosphorMix` to the returned object.

- [ ] **Step 2:** In `screensaver.js`, after the phosphor pass is created, also wire its uniform from forest:

```javascript
  if (sceneModule && sceneModule.getPhosphorPass) {
    var phosphor = sceneModule.getPhosphorPass();
    var phosphorPass = new THREE.ShaderPass({...});
    composer.addPass(phosphorPass);
    // Update phosphor mix per frame from current tier
    var origUpdate = sceneModule.update;
    sceneModule.update = function (t, scrollY) {
      origUpdate(t, scrollY);
      if (sceneModule.getCurrentPhosphorMix) {
        phosphorPass.uniforms.uMix.value = sceneModule.getCurrentPhosphorMix();
      }
    };
  }
```

- [ ] **Step 3:** Smoke-test: open DevTools, run `window.JJ_SCREENSAVER_DEBUG = sceneModule; sceneModule.setTier('low')`. Expected: visible degrade (fewer needles, no fog wisps, no god rays, no grain).

(Note: `JJ_SCREENSAVER_DEBUG` requires exposing it. Add `window.JJ_SCREENSAVER_DEBUG = sceneModule;` after creation in screensaver.js for testing only — remove before prod, or gate with a debug flag.)

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-forest.js assets/japanjunky-screensaver.js
git commit -m "feat(forest): add tier matrix + setTier() runtime adjustment"
```

---

### Task 30: Boot probe (light bootstrap scene + median FPS)

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

The probe runs **before** the full forest assembles. Approach: build a minimal scene first, sample 2.5s of frame times, then upgrade.

- [ ] **Step 1:** Refactor the forest creation to be **two-phase**: `bootstrap()` builds only sky+silhouette+3 trunks+fog; `assembleFull(tier)` builds the rest. In `forest.js`, restructure so the existing `create()` body is split:

```javascript
    // Move all "buildX()" calls out of immediate execution into
    // assembleFull(). bootstrap() builds only:
    //   - sky/fog wall
    //   - silhouette ridge
    //   - 3 placeholder trunks
    //   - distance fog
    function bootstrap() {
      // (sky + silhouette + 3 cedars + fog - shortened version of
      // existing layer building)
      // Already partially built on construction — for simplicity,
      // mark the 'minimal' subset and call setTier('low') initially.
      setTier('low');
    }

    function assembleFull(tier) {
      // Restore visibility per tier
      setTier(tier || 'high');
    }
```

(For initial implementation, the simpler approach is: build everything on construction at the chosen tier, but **start at `low`** during the probe window, then upgrade. This avoids restructuring all build code.)

- [ ] **Step 2:** In `screensaver.js`, after creating the forest module, run the probe:

```javascript
  if (sceneModule && sceneModule.setTier) {
    // Probe window: start at low, sample frame times, choose tier.
    var probeSamples = [];
    var probeStart = performance.now();
    var probeLastFrame = probeStart;
    var probeDurationMs = 2500;
    var probeActive = true;
    // Force low tier during probe
    sceneModule.setTier('low');

    var origUpdate2 = sceneModule.update;
    sceneModule.update = function (t, scrollY) {
      origUpdate2(t, scrollY);
      if (probeActive) {
        var nowMs = performance.now();
        var dt = nowMs - probeLastFrame;
        probeLastFrame = nowMs;
        if (dt > 0) probeSamples.push(1000 / dt);
        if (nowMs - probeStart > probeDurationMs) {
          probeActive = false;
          probeSamples.sort(function (a, b) { return a - b; });
          var median = probeSamples[Math.floor(probeSamples.length / 2)] || 60;
          var pickedTier;
          if (median >= 55) pickedTier = 'high';
          else if (median >= 40) pickedTier = 'med';
          else pickedTier = 'low';
          // Persist + apply
          try { localStorage.setItem('jj-perf-tier', pickedTier); } catch (e) {}
          sceneModule.setTier(pickedTier);
        }
      }
    };
  }
```

- [ ] **Step 3:** Honor stored tier on subsequent visits (skip probe):

Insert *before* the probe block:

```javascript
  // Skip probe if a tier is already cached
  var cachedTier = null;
  try { cachedTier = localStorage.getItem('jj-perf-tier'); } catch (e) {}
  // Honor `?perf=...` URL override
  var urlParams = new URLSearchParams(window.location.search);
  var urlPerf = urlParams.get('perf');
  if (urlPerf && ['high', 'med', 'low'].indexOf(urlPerf) !== -1) {
    cachedTier = urlPerf;
  }
  if (cachedTier && sceneModule && sceneModule.setTier) {
    sceneModule.setTier(cachedTier);
    // Skip probe block by setting probeActive=false at construction
    var skipProbe = true;
  }
```

Then guard the probe init with `if (!skipProbe)`.

- [ ] **Step 4:** Smoke-test: clear `localStorage`, reload. Expected: scene starts at low quality and upgrades to high after ~2.5s. Check `localStorage.getItem('jj-perf-tier')` after the probe completes.

- [ ] **Step 5:** Commit.

```bash
git add assets/japanjunky-screensaver.js assets/japanjunky-forest.js
git commit -m "feat(forest): add 2.5s boot FPS probe + tier persistence"
```

---

### Task 31: Runtime watchdog + demote

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Rolling 60-frame median FPS. Demote on sustained low FPS.

- [ ] **Step 1:** Add the watchdog after the probe block:

```javascript
  // ─── Runtime perf watchdog ────────────────────────────────────
  if (sceneModule && sceneModule.setTier) {
    var watchdog = {
      buffer: [],
      bufferSize: 60,
      lastFrame: performance.now(),
      lowFpsStart: 0,
      currentTier: cachedTier || 'high'
    };
    var origUpdate3 = sceneModule.update;
    sceneModule.update = function (t, scrollY) {
      origUpdate3(t, scrollY);
      var nowMs = performance.now();
      var dt = nowMs - watchdog.lastFrame;
      watchdog.lastFrame = nowMs;
      if (dt <= 0) return;
      watchdog.buffer.push(1000 / dt);
      if (watchdog.buffer.length > watchdog.bufferSize) watchdog.buffer.shift();
      if (watchdog.buffer.length < watchdog.bufferSize) return;
      var sorted = watchdog.buffer.slice().sort(function (a, b) { return a - b; });
      var median = sorted[Math.floor(sorted.length / 2)];

      var demoteThresholds = {
        high: { fps: 50, durationMs: 2000, next: 'med' },
        med:  { fps: 40, durationMs: 2000, next: 'low' },
        low:  { fps: 25, durationMs: 5000, next: 'blank' }
      };
      var th = demoteThresholds[watchdog.currentTier];
      if (th && median < th.fps) {
        if (watchdog.lowFpsStart === 0) watchdog.lowFpsStart = nowMs;
        else if (nowMs - watchdog.lowFpsStart > th.durationMs) {
          watchdog.currentTier = th.next;
          if (th.next === 'blank') {
            // Hide all forest layers (final fallback)
            Object.keys(sceneModule._layers || {}).forEach(function (k) {
              sceneModule._layers[k].visible = false;
            });
          } else {
            sceneModule.setTier(th.next);
          }
          try { localStorage.setItem('jj-perf-tier', th.next); } catch (e) {}
          watchdog.lowFpsStart = 0;
          watchdog.buffer = [];
        }
      } else {
        watchdog.lowFpsStart = 0;
      }
    };
  }
```

- [ ] **Step 2:** Smoke-test: throttle CPU in DevTools (Performance tab → CPU 6× slowdown). Expected: tier demotes within ~2-5s.

- [ ] **Step 3:** Commit.

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(forest): add runtime FPS watchdog with tier demotion"
```

---

### Task 32: Mobile detection + force Low + battery awareness

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1:** Before the probe block, add mobile detection. Insert at the top of the perf-related section:

```javascript
  // ─── Mobile + battery detection ───────────────────────────────
  var isMobile = (
    /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth < 768 ||
    (navigator.deviceMemory && navigator.deviceMemory < 4)
  );
  if (isMobile && sceneModule && sceneModule.setTier) {
    sceneModule.setTier('low');
    try { localStorage.setItem('jj-perf-tier', 'low'); } catch (e) {}
    skipProbe = true;
    cachedTier = 'low';
  }
```

- [ ] **Step 2:** Add battery awareness after watchdog setup:

```javascript
  if (navigator.getBattery) {
    navigator.getBattery().then(function (battery) {
      function maybeThrottle() {
        if (battery.level < 0.2 && !battery.charging) {
          // Force lowest tier + reduce render scale further
          if (sceneModule.setTier) sceneModule.setTier('low');
          renderer.setPixelRatio(0.5);
        }
      }
      battery.addEventListener('levelchange', maybeThrottle);
      battery.addEventListener('chargingchange', maybeThrottle);
      maybeThrottle();
    });
  }
```

- [ ] **Step 3:** Smoke-test on a mobile device or via DevTools device emulation. Expected: Low tier active immediately, no probe.

- [ ] **Step 4:** Commit.

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(forest): force Low tier on mobile + battery-aware throttle"
```

---

## Phase 8 — Splash Sequence

### Task 33: Replace portal splash sequence with forest sequence

**Files:**
- Modify: `assets/japanjunky-splash.js`
- Modify: `assets/japanjunky-splash.css`

The current splash is a churning mirror portal. Replace with a forest fade-in sequence that matches the new aesthetic.

- [ ] **Step 1:** Read the current splash.js to understand its scene-construction pattern, specifically the portion that builds the splash mirror geometry. Approximately lines 50–250 contain shader/geometry for the mirror. We replace that subset only — the renderer setup, ENTER button handler, and handoff to homepage stay unchanged.

```bash
sed -n '40,260p' assets/japanjunky-splash.js
```

- [ ] **Step 2:** In `splash.js`, replace the mirror-building block with a forest splash. Goal: render a simplified forest (sky + silhouette + 2 hero cedars + fog wall + slowly-moving god ray) for ~2 seconds, then fade out on ENTER.

Locate the section that sets up the splash scene (after renderer/scene/camera). Replace its body with:

```javascript
  // ─── Forest splash scene (replaces portal mirror) ──────────
  // Reuse JJ_Forest.create with a 'splash' preset. We include only
  // a subset for fast load.
  if (window.JJ_Forest) {
    splashScene = new THREE.Scene();
    splashCamera = new THREE.PerspectiveCamera(55, resW / resH, 0.1, 100);
    splashClock = new THREE.Clock();
    splashForest = window.JJ_Forest.create(splashScene, splashCamera, splashClock, {
      cameraPreset: 'home',
      tier: 'low', // splash always Low for fast first paint
      textureUrls: (window.JJ_SCREENSAVER_CONFIG || {}).forestTextures || {}
    });
  } else {
    skipSplash();
    return;
  }
```

- [ ] **Step 3:** Update the splash render loop to call `splashForest.update(t, 0)` and clear with the amber fog color:

```javascript
  function renderSplash() {
    var t = splashClock.getElapsedTime();
    if (splashForest) splashForest.update(t, 0);
    splashRenderer.setClearColor(0x2a1208, 1);
    splashRenderer.render(splashScene, splashCamera);
    // ... existing post-process call ...
    splashRafId = requestAnimationFrame(renderSplash);
  }
```

- [ ] **Step 4:** Update the splash sequence opacity keyframes in `splash.css`. Find the existing splash fade-in CSS rule (likely `@keyframes jj-splash-fadein`) and replace with the forest-specific timing:

```css
/* Forest splash sequence — phased fade-in over 1.4s */
@keyframes jj-splash-fadein {
  0%   { opacity: 0; }
  6%   { opacity: 0.1; }   /* fog wall */
  21%  { opacity: 0.4; }   /* silhouette pop */
  36%  { opacity: 0.7; }   /* mid grove */
  57%  { opacity: 0.9; }   /* hero cedars + shrine */
  79%  { opacity: 1.0; }   /* tsuno fade-in handled by curtain shader */
  100% { opacity: 1.0; }
}
.jj-splash {
  animation: jj-splash-fadein 1.4s ease-out;
}
```

- [ ] **Step 5:** Test by clearing session-storage `jj-splash-seen` and reloading. Expected: brief 1.4s fade-in into a low-tier forest, then ENTER button appears, then click → main scene transitions in.

- [ ] **Step 6:** Commit.

```bash
git add assets/japanjunky-splash.js assets/japanjunky-splash.css
git commit -m "feat(splash): replace portal mirror with forest fade-in sequence"
```

---

## Phase 9 — Final Smoke Test + Default Toggle

### Task 34: Smoke test + ensure forest default

**Files:** None new — verifies prior tasks.

- [ ] **Step 1:** Confirm `config/settings_schema.json` has `scene_mode` default `"forest"` (set in Task 1). Re-check:

```bash
grep -A 2 '"id": "scene_mode"' config/settings_schema.json
```

Expected: `"default": "forest"` line present.

- [ ] **Step 2:** Open the site in a fresh browser window (clear localStorage):

```bash
shopify theme dev
```

In DevTools:
```javascript
localStorage.clear();
location.reload();
```

- [ ] **Step 3:** Verify checklist:

1. Splash forest fades in over ~1.4s.
2. ENTER button appears, click → homepage.
3. Homepage shows forest grove (cedars + ropes + shide + jizo + lanterns + sotoba + haka).
4. Camera floats subtly (handheld float).
5. Shide streamers sway.
6. Fog wisps drift.
7. God rays visible.
8. Cedar needles fall.
9. Lantern glow pulses warm.
10. Scroll the page — silhouette barely moves, foreground moves a lot.
11. Navigate to a product page — camera moves to product preset (deeper into grove).
12. Navigate to login page — camera looks up at canopy.
13. DevTools console: no errors.
14. After 2.5s, `localStorage.getItem('jj-perf-tier')` returns one of `'high'`, `'med'`, `'low'`.

- [ ] **Step 4:** Test rollback. In Shopify theme editor → Theme settings → Background scene → select "Portal vortex (legacy)". Reload. Expected: portal vortex displays exactly as before.

- [ ] **Step 5:** Switch back to forest. No further changes needed.

- [ ] **Step 6:** Final commit (no code change — just a milestone marker).

```bash
git commit --allow-empty -m "feat(forest): forest baseline complete (sub-plan 1)"
```

---

## File Summary

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `assets/japanjunky-forest.js` | Forest scene module | ~1500 |
| `assets/japanjunky-portal.js` | Extracted portal code (rollback) | ~600 |
| `assets/cedar_bark.png` | Cedar trunk texture | — |
| `assets/cedar_moss_base.png` | Mossy base overlay | — |
| `assets/shimenawa_rope.png` | Rope texture | — |
| `assets/shide_paper.png` | Shide alpha cutout | — |
| `assets/hokora_stone.png` | Shrine box | — |
| `assets/jizo_face.png` | Jizo billboard | — |
| `assets/ishidoro_stone.png` | Lantern texture | — |
| `assets/sotoba_wood.png` | Wooden grave marker | — |
| `assets/haka_stone.png` | Stone gravestone | — |
| `assets/ground_needles.png` | Ground tile | — |
| `assets/moss_patch.png` | Moss overlay | — |
| `assets/silhouette_trunks.png` | Silhouette layer | — |
| `assets/shrine_atlas.png` | Atlased shrine props | — |
| `assets/shrine_atlas.json` | Atlas UV map | — |
| `tools/forest-textures/build.js` | Texture build pipeline | ~120 |
| `tools/forest-textures/package.json` | Pipeline deps | — |
| `tools/forest-textures/SOURCES.md` | License provenance | — |
| `tools/forest-textures/sources/*` | Source CC photos | — |

### Modified Files

| File | Changes |
|------|---------|
| `assets/japanjunky-screensaver.js` | Extract portal block, add forest hook, add probe + watchdog + mobile + battery |
| `assets/japanjunky-splash.js` | Replace mirror scene with forest splash via JJ_Forest |
| `assets/japanjunky-splash.css` | New phased fade-in keyframes |
| `layout/theme.liquid` | Add scene_mode + audio_enabled config, body class, conditional script tags, texture preloads, forestTextures URL block |
| `config/settings_schema.json` | Add scene_mode + audio_enabled settings |

### Unchanged

- `assets/japanjunky-screensaver-post.js` — CRT post-process
- All other CSS, Liquid templates, sections, snippets
- Tsuno code in `screensaver.js` (sub-plan 2 modifies this)
- Audio (sub-plan 3)
- Page transitions (sub-plan 3)

---

## Notes for Sub-Plan 2 (Tsuno Forest Drift)

Sub-plan 2 will:
- Replace orbit logic in `screensaver.js` with anchor-based state machine (IDLE_ANCHOR, TRAVEL, PEEK, PERCH, CONTEMPLATE).
- Implement `getTsunoAnchors()` and `getTrunkColliders()` in `forest.js` (currently stubbed).
- Hermite path planning between anchors with trunk avoidance.
- Per-preset Tsuno behavior (home full / product calm / login fixed).

## Notes for Sub-Plan 3 (Audio + Page Transitions)

Sub-plan 3 will:
- Create `assets/japanjunky-audio.js` (WebAudio wrapper, ambient bed, accent triggers).
- Source/produce ogg sound files.
- Add same-origin link interceptor for amber-wash flash on page nav.
- Mute toggle in taskbar.
