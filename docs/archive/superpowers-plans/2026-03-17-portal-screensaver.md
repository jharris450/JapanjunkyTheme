# Portal Screensaver Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mt. Fuji/cityscape screensaver with a holographic vortex tunnel portal effect.

**Architecture:** Complete rewrite of `assets/japanjunky-screensaver.js`. The rendering pipeline (dual-canvas, VGA dithering, readPixels readback) is preserved but all scene geometry is replaced with a procedural tunnel shader, vanishing glow, and flying textured objects. Minor updates to preview HTML, settings schema, and theme.liquid config injection.

**Tech Stack:** Three.js r160 (vendored global `THREE`), WebGL, GLSL custom shaders, `JJ_ScreensaverPost` (VGA dithering), vanilla JS (ES5-compatible IIFE)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `assets/japanjunky-screensaver.js` | **Rewrite** | Portal tunnel scene, shaders, flying objects, parallax, render loop, performance safeguards |
| `preview-screensaver.html` | **Modify** | Update description text + add `textures` array to preview config |
| `config/settings_schema.json` | **Modify** | Update orbit speed label to "Portal swirl speed" |
| `layout/theme.liquid` | **Modify** | Add `textures` array to `JJ_SCREENSAVER_CONFIG` |
| `assets/japanjunky-screensaver-post.js` | Unchanged | VGA dithering (no changes) |
| `assets/three.min.js` | Unchanged | Three.js r160 (no changes) |

---

## Chunk 1: Core Portal

### Task 1: Scaffold — IIFE shell, config, renderer, camera

**Files:**
- Rewrite: `assets/japanjunky-screensaver.js` (replace entire contents)

This task creates the empty shell with the boilerplate that every subsequent task builds on: config parsing, WebGL renderer, camera, empty scene, and the accessibility gates.

- [ ] **Step 1: Write the new screensaver IIFE shell**

Replace the entire contents of `assets/japanjunky-screensaver.js` with:

```javascript
/**
 * JapanJunky Screensaver — Portal Vortex Tunnel
 *
 * Holographic swirling portal with flying objects (album covers),
 * rendered at low resolution with VGA 256-color dithering and
 * PS1-style vertex snapping.
 *
 * Depends on: THREE (global), JJ_ScreensaverPost (global),
 *             JJ_SCREENSAVER_CONFIG (global, set by theme.liquid)
 */
(function () {
  'use strict';

  var config = window.JJ_SCREENSAVER_CONFIG || {};
  if (config.enabled === false) return;
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('jj-screensaver');
  if (!canvas) return;

  // Accessibility: high-contrast → disable entirely
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersHighContrast) return;

  // Accessibility: reduced-motion → render one static frame then stop
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Resolution ──────────────────────────────────────────────
  var resH = parseInt(config.resolution, 10) || 240;
  var resW = Math.round(resH * (4 / 3)); // 4:3 fixed aspect

  // ─── Renderer ────────────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    return; // WebGL not available — silent fallback to black bg
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 0, -1);
  camera.lookAt(0, 0, 30);

  // ─── Swirl Speed ─────────────────────────────────────────────
  var SWIRL_SPEEDS = { slow: 0.3, medium: 0.6, fast: 1.0 };
  var swirlSpeed = SWIRL_SPEEDS[config.orbitSpeed] || SWIRL_SPEEDS.slow;

  // === SCENE BUILDING GOES HERE (Tasks 2-4) ===

  // === RENDER PIPELINE + ANIMATION LOOP (Tasks 5-7) ===

})();
```

- [ ] **Step 2: Verify the preview loads without errors**

Open `http://localhost:8080/preview-screensaver.html` in a browser. The canvas should show a black screen (no scene content yet). Open the browser console — there should be no JavaScript errors.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(portal): scaffold IIFE shell with config, renderer, camera"
```

---

### Task 2: Tunnel geometry + holographic shader

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (add tunnel building code after the camera section)

This task creates the cylindrical tunnel with the procedural holographic swirl shader. After this task, the preview should show a swirling rainbow tunnel.

- [ ] **Step 1: Add the tunnel vertex shader, fragment shader, and build function**

Insert after the `// === SCENE BUILDING GOES HERE` comment:

```javascript
  // ─── Portal Tunnel ───────────────────────────────────────────
  var TUNNEL_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var TUNNEL_FRAG = [
    'uniform float uTime;',
    'uniform float uSwirlSpeed;',
    'varying vec2 vUv;',
    '',
    'vec3 hsv2rgb(vec3 c) {',
    '  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);',
    '  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);',
    '  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);',
    '}',
    '',
    'void main() {',
    '  float angle = vUv.x * 6.2832;',
    '  float depth = vUv.y;',
    '  float hue = fract(angle * 2.0 + depth * 4.0 + uTime * uSwirlSpeed);',
    '  float sat = 0.85 + 0.15 * sin(depth * 6.0 + uTime * 2.0);',
    '  float val = 0.6 + 0.3 * sin(depth * 3.0 - uTime * 1.5);',
    '  float falloff = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.7, depth);',
    '  val *= 0.4 + 0.6 * falloff;',
    '  vec3 color = hsv2rgb(vec3(hue, sat, val));',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function buildTunnel() {
    var geo = new THREE.CylinderGeometry(3, 3, 40, 12, 20, true);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 },
        uSwirlSpeed: { value: swirlSpeed }
      },
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    var tunnel = new THREE.Mesh(geo, mat);
    // Rotate so cylinder axis is Z (default is Y)
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.set(0, 0, 18);
    scene.add(tunnel);
    return tunnel;
  }

  var tunnel = buildTunnel();
```

- [ ] **Step 2: Add a temporary render loop to see the tunnel**

Insert after the tunnel code a temporary render loop (will be replaced in Task 5):

```javascript
  // TEMPORARY — replaced in Task 5
  function _tempAnimate(time) {
    requestAnimationFrame(_tempAnimate);
    tunnel.material.uniforms.uTime.value = time * 0.001;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(_tempAnimate);
```

- [ ] **Step 3: Verify the tunnel renders in preview**

Open `http://localhost:8080/preview-screensaver.html`. You should see a swirling holographic rainbow tunnel from inside, looking down the barrel. The colors should churn continuously. The vertex snapping won't be visible yet (no dithering pipeline yet, rendering direct to screen).

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(portal): add tunnel geometry with holographic swirl shader"
```

---

### Task 3: Vanishing point glow

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (add glow after tunnel building)

- [ ] **Step 1: Add the vanishing point glow plane**

Insert after `var tunnel = buildTunnel();`:

```javascript
  // ─── Vanishing Point Glow ────────────────────────────────────
  function buildGlow() {
    var geo = new THREE.PlaneGeometry(1.5, 1.5);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var glow = new THREE.Mesh(geo, mat);
    glow.position.set(0, 0, 36);
    scene.add(glow);
    return glow;
  }

  buildGlow();
```

- [ ] **Step 2: Verify the glow is visible**

Reload the preview. At the center/end of the tunnel, there should be a bright white glow disc. It should appear as a "light at the end of the tunnel" effect with the rainbow swirl around it.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(portal): add vanishing point glow disc"
```

---

### Task 4: Flying objects system

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (add flying objects system)

This task adds the textured shader material for objects, the spawn/despawn/animate system, and texture loading from config.

- [ ] **Step 1: Add the textured PS1 shader material factory**

Insert after the glow code:

```javascript
  // ─── PS1 Textured Material ───────────────────────────────────
  var TEX_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var TEX_FRAG = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  gl_FragColor = texture2D(uTexture, vUv);',
    '}'
  ].join('\n');

  function makeTextureMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTexture: { value: texture }
      },
      vertexShader: TEX_VERT,
      fragmentShader: TEX_FRAG,
      side: THREE.DoubleSide,
      depthWrite: true
    });
  }
```

- [ ] **Step 2: Add the flying objects system**

Insert after the textured material:

```javascript
  // ─── Flying Objects ──────────────────────────────────────────
  var TUNNEL_RADIUS = 3;
  var SPAWN_RADIUS = TUNNEL_RADIUS * 0.7; // 70% to prevent wall clipping
  var SPAWN_Z = -2;
  var DESPAWN_Z = 36;
  var OBJECT_SIZE = 0.4;
  var SPAWN_INTERVAL = 2500; // ms between spawns
  var MAX_OBJECTS = 5;

  var flyingObjects = [];
  var loadedTextures = [];
  var lastSpawnTime = 0;
  var objectGeo = new THREE.PlaneGeometry(OBJECT_SIZE, OBJECT_SIZE);

  // Load textures from config
  var textureUrls = config.textures || [];
  var textureLoader = new THREE.TextureLoader();

  for (var ti = 0; ti < textureUrls.length; ti++) {
    (function (url) {
      textureLoader.load(url, function (tex) {
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        loadedTextures.push(tex);
      });
    })(textureUrls[ti]);
  }

  function spawnObject(time) {
    if (loadedTextures.length === 0) return;
    if (flyingObjects.length >= MAX_OBJECTS) return;
    if (time - lastSpawnTime < SPAWN_INTERVAL) return;

    lastSpawnTime = time;

    var tex = loadedTextures[Math.floor(Math.random() * loadedTextures.length)];
    var mat = makeTextureMaterial(tex);
    var mesh = new THREE.Mesh(objectGeo, mat);

    // Random position within spawn radius
    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * SPAWN_RADIUS;
    mesh.position.set(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      SPAWN_Z
    );

    // Random tumble speeds
    // Velocity tuned for ~4-6s flight at 24fps over 38 units (Z=-2 to Z=36)
    mesh.userData = {
      velZ: 0.2 + Math.random() * 0.1, // base forward speed (~0.2-0.3 units/frame)
      accel: 0.002 + Math.random() * 0.001, // per-frame acceleration
      rotVelX: (Math.random() - 0.5) * 0.08,
      rotVelY: (Math.random() - 0.5) * 0.08,
      rotVelZ: (Math.random() - 0.5) * 0.08,
      driftFreqX: 0.5 + Math.random() * 0.5,
      driftFreqY: 0.4 + Math.random() * 0.4,
      driftAmpX: 0.3 + Math.random() * 0.3,
      driftAmpY: 0.3 + Math.random() * 0.3,
      driftPhase: Math.random() * Math.PI * 2,
      baseX: mesh.position.x,
      baseY: mesh.position.y
    };

    scene.add(mesh);
    flyingObjects.push(mesh);
  }

  function animateObjects(time) {
    var t = time * 0.001;
    var i = flyingObjects.length;

    while (i--) {
      var obj = flyingObjects[i];
      var ud = obj.userData;

      // Accelerate forward (per-frame, independent of fps since loop is throttled)
      ud.velZ += ud.accel;
      obj.position.z += ud.velZ;

      // Sinusoidal lateral drift, clamped to tunnel radius
      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmpX;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmpY;
      obj.position.x = ud.baseX + driftX;
      obj.position.y = ud.baseY + driftY;

      // Clamp to tunnel radius
      var dist = Math.sqrt(obj.position.x * obj.position.x + obj.position.y * obj.position.y);
      if (dist > SPAWN_RADIUS) {
        var scale = SPAWN_RADIUS / dist;
        obj.position.x *= scale;
        obj.position.y *= scale;
      }

      // Tumble
      obj.rotation.x += ud.rotVelX;
      obj.rotation.y += ud.rotVelY;
      obj.rotation.z += ud.rotVelZ;

      // Despawn
      if (obj.position.z > DESPAWN_Z) {
        scene.remove(obj);
        obj.material.dispose();
        flyingObjects.splice(i, 1);
      }
    }
  }
```

- [ ] **Step 3: Update the temporary render loop to include objects**

Replace the temporary `_tempAnimate` function:

```javascript
  // TEMPORARY — replaced in Task 5
  function _tempAnimate(time) {
    requestAnimationFrame(_tempAnimate);
    tunnel.material.uniforms.uTime.value = time * 0.001;
    spawnObject(time);
    animateObjects(time);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(_tempAnimate);
```

- [ ] **Step 4: Add a test texture to the preview config**

In `preview-screensaver.html`, update the config script to include a test texture. Use `glico.png` as a test image (it's already in assets):

Find this in `preview-screensaver.html`:
```javascript
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: true,
      resolution: 240,
      fps: 24,
      orbitSpeed: 'slow',
      mouseInteraction: true
    };
```

Replace with:
```javascript
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: true,
      resolution: 240,
      fps: 24,
      orbitSpeed: 'slow',
      mouseInteraction: true,
      textures: [
        'assets/glico.png'
      ]
    };
```

- [ ] **Step 5: Verify flying objects in preview**

Reload the preview. You should see:
- The holographic tunnel swirling
- Glico Running Man images spawning behind the camera and flying forward into the tunnel
- Objects tumbling freely as they go
- Objects accelerating as they approach the vanishing point
- 3-5 objects visible at a time

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-screensaver.js preview-screensaver.html
git commit -m "feat(portal): add flying objects system with texture loading"
```

---

## Chunk 2: Pipeline, Interaction & Integration

### Task 5: Render pipeline (dual-canvas, dithering, display)

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (replace temp render loop with full pipeline)

This task restores the dual-canvas architecture with VGA dithering. After this task, the output should look properly pixelated and dithered.

- [ ] **Step 1: Remove the temporary render loop and add the full pipeline**

Delete the `_tempAnimate` function and its `requestAnimationFrame` call. Replace with:

```javascript
  // ─── Offscreen Render Target ──────────────────────────────────
  var renderTarget = new THREE.WebGLRenderTarget(resW, resH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat
  });

  // Display canvas (2D) — the visible output
  var displayCanvas = document.createElement('canvas');
  displayCanvas.width = resW;
  displayCanvas.height = resH;
  var displayCtx = displayCanvas.getContext('2d');
  var displayImageData = displayCtx.createImageData(resW, resH);

  // Pixel readback buffer
  var pixelBuffer = new Uint8Array(resW * resH * 4);

  // Hide the WebGL canvas, show the 2D display canvas
  canvas.style.display = 'none';

  displayCanvas.id = 'jj-screensaver-display';
  displayCanvas.setAttribute('aria-hidden', 'true');
  displayCanvas.tabIndex = -1;
  displayCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100vw', 'height:100vh',
    'z-index:0', 'pointer-events:none',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges'
  ].join(';');
  canvas.parentNode.insertBefore(displayCanvas, canvas.nextSibling);

  // ─── Render one frame (reusable) ─────────────────────────────
  function renderOneFrame() {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    // Copy pixels (WebGL reads bottom-up, flip vertically)
    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    // VGA palette quantization + Floyd-Steinberg dither
    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    displayCtx.putImageData(displayImageData, 0, 0);
  }
```

- [ ] **Step 2: Verify the dithered output**

Reload the preview. The tunnel should now appear at 320x240 resolution, pixelated, with VGA 256-color dithering applied. The holographic rainbow should be broken into dithered color bands. Objects should still fly through.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(portal): add dual-canvas render pipeline with VGA dithering"
```

---

### Task 6: Mouse parallax + performance safeguards + animation loop

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (add parallax, pause system, animation loop)

This task adds mouse parallax on the look-target, the pause/resume system (tab visibility + scroll sentinel), reduced-motion support, and the final animation loop.

- [ ] **Step 1: Add mouse parallax**

Insert after the `renderOneFrame` function:

```javascript
  // ─── Mouse Parallax ──────────────────────────────────────────
  var mouseNorm = { x: 0, y: 0 };
  var parallaxOffset = { x: 0, y: 0 };
  var MAX_PARALLAX = 0.5;
  var PARALLAX_LERP = 0.05;
  var LOOK_TARGET = { x: 0, y: 0, z: 30 };
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  if (config.mouseInteraction !== false && !isMobile) {
    window.addEventListener('mousemove', function (e) {
      mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    document.addEventListener('mouseleave', function () {
      mouseNorm.x = 0;
      mouseNorm.y = 0;
    });
  }

  function updateParallax() {
    parallaxOffset.x += (mouseNorm.x * MAX_PARALLAX - parallaxOffset.x) * PARALLAX_LERP;
    parallaxOffset.y += (mouseNorm.y * MAX_PARALLAX - parallaxOffset.y) * PARALLAX_LERP;
  }
```

- [ ] **Step 2: Add performance safeguards**

Insert after the parallax code:

```javascript
  // ─── Performance Safeguards ───────────────────────────────────
  var pauseReasons = { hidden: false, scrolled: false };

  function isPaused() {
    return pauseReasons.hidden || pauseReasons.scrolled;
  }

  function resumeIfNeeded() {
    if (!isPaused()) {
      lastFrame = performance.now();
      requestAnimationFrame(animate);
    }
  }

  document.addEventListener('visibilitychange', function () {
    pauseReasons.hidden = document.hidden;
    resumeIfNeeded();
  });

  // Scroll sentinel — pause when user scrolls past the fold
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:100vh;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(sentinel);

  if (window.IntersectionObserver) {
    var scrollObserver = new IntersectionObserver(function (entries) {
      pauseReasons.scrolled = !entries[0].isIntersecting;
      resumeIfNeeded();
    }, { threshold: 0 });
    scrollObserver.observe(sentinel);
  }
```

- [ ] **Step 3: Add the animation loop**

Insert after the safeguards:

```javascript
  // ─── Animation Loop ──────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    if (isPaused()) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    // Update tunnel shader time
    tunnel.material.uniforms.uTime.value = time * 0.001;

    // Spawn and animate flying objects
    spawnObject(time);
    animateObjects(time);

    // Update parallax
    updateParallax();
    var lookX = LOOK_TARGET.x + parallaxOffset.x;
    var lookY = LOOK_TARGET.y - parallaxOffset.y;
    camera.lookAt(lookX, lookY, LOOK_TARGET.z);

    renderOneFrame();
  }

  // ─── Reduced Motion: Static Frame ─────────────────────────────
  if (prefersReducedMotion) {
    // Render one static dithered frame, then stop
    tunnel.material.uniforms.uTime.value = 0;
    renderOneFrame();
    return; // Exit IIFE — no animation loop
  }

  // ─── Init ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }
```

- [ ] **Step 4: Verify the complete scene**

Reload the preview. Check:
- Holographic tunnel swirls with dithered VGA colors
- Mouse movement tilts the view subtly (parallax)
- Objects fly past with tumbling
- Switching browser tabs pauses the animation
- Scrolling past the viewport pauses the animation

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(portal): add parallax, performance safeguards, animation loop"
```

---

### Task 7: Update preview HTML

**Files:**
- Modify: `preview-screensaver.html`

- [ ] **Step 1: Update the preview panel descriptions**

In `preview-screensaver.html`, replace lines 87-110 (the entire `<div class="preview-overlay">` block and its contents):

```html
  <!-- Simulated site content -->
  <div class="preview-overlay" id="overlay">
    <div class="preview-panel">
      <h2>JapanJunky Portal Screensaver Preview</h2>
      <p>This is a standalone preview of the Three.js portal vortex screensaver background.
         Move your mouse to see the parallax effect on the tunnel view.</p>
    </div>
    <div class="preview-panel">
      <h2>What You're Seeing</h2>
      <p>Holographic vortex tunnel rendered at <code>320x240</code> with PS1-style vertex snapping,
         quantized to the VGA 256-color palette with Floyd-Steinberg dithering,
         nearest-neighbor upscaled. Album covers fly past into the vanishing point.</p>
    </div>
    <div class="preview-panel">
      <h2>Scene Elements</h2>
      <p>Cylindrical tunnel with procedural holographic rainbow shader, vanishing point glow disc,
         flying textured objects (album covers) with full free-tumble rotation.</p>
    </div>
    <div class="preview-panel" style="height: 400px;">
      <h2>Scroll Test</h2>
      <p>Scroll down to test the scroll sentinel pause. The screensaver should pause
         when you scroll past the viewport height.</p>
    </div>
  </div>
```

- [ ] **Step 2: Verify preview text is updated**

Reload the preview. The description panels should reflect the portal screensaver, not the old Mt. Fuji landscape.

- [ ] **Step 3: Commit**

```bash
git add preview-screensaver.html
git commit -m "docs: update preview HTML descriptions for portal screensaver"
```

---

### Task 8: Update settings schema label

**Files:**
- Modify: `config/settings_schema.json`

- [ ] **Step 1: Update the orbit speed label**

In `config/settings_schema.json`, change line 35 from:
```json
        "label": "Camera orbit speed",
```
to:
```json
        "label": "Portal swirl speed",
```

- [ ] **Step 2: Commit**

```bash
git add config/settings_schema.json
git commit -m "chore: rename orbit speed setting to portal swirl speed"
```

---

### Task 9: Update theme.liquid config injection

**Files:**
- Modify: `layout/theme.liquid` (add textures array to screensaver config)

Note: The `textures` array will be empty initially since no album cover images have been added yet. The portal renders fine without textures (just the tunnel, no flying objects). Album cover images will be added by the user later.

- [ ] **Step 1: Find the `JJ_SCREENSAVER_CONFIG` block in theme.liquid and add the textures array**

The existing config block looks like:
```liquid
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }}
    };
```

Add a `textures` array after `mouseInteraction`:
```liquid
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      textures: []
    };
```

The array is empty by default. When the user provides album cover images, they add entries like:
```liquid
      textures: [
        '{{ "album-cover-1.png" | asset_url }}',
        '{{ "album-cover-2.png" | asset_url }}'
      ]
```

- [ ] **Step 2: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(portal): add textures array to screensaver config injection"
```

---

### Task 10: Final integration verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full preview test**

Open `http://localhost:8080/preview-screensaver.html` and verify:

1. Holographic tunnel renders with swirling rainbow colors
2. VGA 256-color dithering is applied (banded, pixelated look)
3. Vanishing point glow is visible at the center/end of the tunnel
4. Flying objects (Glico test image) spawn, fly forward, tumble, despawn
5. Mouse parallax tilts the tunnel view
6. Toggle "VGA dithering" checkbox — disabling shows raw WebGL output, re-enabling reloads with dithering
7. Toggle "Show content overlay" — panels appear/disappear over the portal
8. Scroll down past the viewport — screensaver pauses
9. Scroll back up — screensaver resumes
10. Switch to another browser tab — screensaver pauses
11. Switch back — screensaver resumes
12. No JavaScript errors in the console

- [ ] **Step 2: Verify zero-textures edge case**

In `preview-screensaver.html`, temporarily change `textures: ['assets/glico.png']` to `textures: []`. Reload the preview. The tunnel should render alone with the vanishing glow — no flying objects, no errors in the console. Then change it back to `textures: ['assets/glico.png']`.

- [ ] **Step 3: Verify no old scene code remains**

Open `assets/japanjunky-screensaver.js` and confirm:
- No references to Fuji, cityscape, ocean, trees, trains, Shinkansen, Yamanote
- No `buildSky`, `buildFuji`, `buildCityscape`, `buildOsakaCityscape`, `buildOcean`, `buildTrees`, `buildFloatingPrimitives`, `buildYamanoteTrain`, `buildShinkansen`, `buildParticleLattices`, `buildWireframeShapes` functions
- No orbit camera system (`ORBIT` object, `updateCameraOrbit`)
- No raycaster / cursor repulsion code

- [ ] **Step 4: Check file sizes**

The new `japanjunky-screensaver.js` should be significantly smaller than the old version (~250-300 lines vs ~1400 lines).
