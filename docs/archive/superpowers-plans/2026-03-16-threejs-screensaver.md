# Three.js Lacquer Screensaver Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Three.js low-poly Japanese landscape screensaver as a fixed background canvas on the JapanJunky homepage, with VGA 256-color dithering and PS1-style vertex snapping.

**Architecture:** Three.js renders a scene (Mt. Fuji, wireframe ocean, trees, floating primitives, particle lattices, wireframe shapes) at 320×240 to an offscreen target. A vertex shader snaps positions to a coarse screen-space grid. Each frame, pixels are read back to CPU, quantized to the VGA 256-color palette with Floyd-Steinberg dithering, and drawn to a display canvas scaled up with nearest-neighbor interpolation. The existing CRT overlay CSS sits on top.

**Tech Stack:** Three.js (r160+), vanilla JS (IIFE pattern matching existing codebase), Shopify Liquid, GLSL shaders.

**Spec:** `docs/superpowers/specs/2026-03-16-threejs-screensaver-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `assets/three.min.js` | Vendored Three.js library (r160+) |
| `assets/japanjunky-screensaver-post.js` | VGA 256 palette definition + Floyd-Steinberg dithering on ImageData. Exposes `window.JJ_ScreensaverPost` with `dither(imageData)` method. No Three.js dependency. |
| `assets/japanjunky-screensaver.js` | Scene setup, geometry, custom shader material, camera orbit, mouse interaction, render loop, readPixels pipeline. Depends on `THREE` global and `JJ_ScreensaverPost` global. |
| `layout/theme.liquid` | Modified: add `<canvas>` element, conditional script loading, config injection |
| `config/settings_schema.json` | Modified: add screensaver settings group |

---

## Chunk 1: Foundation & Post-Processor

### Task 1: Theme Integration Scaffold

**Files:**
- Modify: `layout/theme.liquid`
- Modify: `config/settings_schema.json`

- [ ] **Step 1: Add screensaver canvas to theme.liquid**

Insert the canvas element as the first child of `<body>`, before the `.jj-page-wrapper`:

```html
<!-- In layout/theme.liquid, line 130, after <body class="jj-body"> -->
<canvas id="jj-screensaver" aria-hidden="true" tabindex="-1" style="
  position:fixed;top:0;left:0;width:100vw;height:100vh;
  z-index:0;image-rendering:pixelated;image-rendering:crisp-edges;
  pointer-events:none;
"></canvas>
```

Note: `pointer-events:none` so clicks pass through to content. Mouse tracking is handled via `window` mousemove listener in the screensaver script.

- [ ] **Step 2: Add conditional script loading to theme.liquid**

Insert before the existing script tags at the bottom of `<body>` (before line 141), inside a homepage conditional:

```liquid
{%- if request.page_type == 'index' -%}
  <script>
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }}
    };
  </script>
  <script src="{{ 'three.min.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
{%- endif -%}
```

Note: `screensaver-post.js` loads before `screensaver.js` so `JJ_ScreensaverPost` is available when the main script initializes.

- [ ] **Step 3: Add settings to settings_schema.json**

The file currently contains an empty array `[]`. Replace it with the array below. If the file already has settings groups in the future, append this object to the existing array rather than replacing.

```json
[
  {
    "name": "Screensaver",
    "settings": [
      {
        "type": "checkbox",
        "id": "screensaver_enabled",
        "label": "Enable homepage screensaver",
        "default": true
      },
      {
        "type": "select",
        "id": "screensaver_resolution",
        "label": "Render resolution",
        "options": [
          { "value": "240", "label": "240p (fastest)" },
          { "value": "360", "label": "360p" },
          { "value": "480", "label": "480p (sharpest)" }
        ],
        "default": "240"
      },
      {
        "type": "range",
        "id": "screensaver_fps",
        "label": "Target framerate",
        "min": 15,
        "max": 30,
        "step": 1,
        "default": 24,
        "unit": "fps"
      },
      {
        "type": "select",
        "id": "screensaver_orbit_speed",
        "label": "Camera orbit speed",
        "options": [
          { "value": "slow", "label": "Slow" },
          { "value": "medium", "label": "Medium" },
          { "value": "fast", "label": "Fast" }
        ],
        "default": "slow"
      },
      {
        "type": "checkbox",
        "id": "screensaver_mouse",
        "label": "Enable mouse interaction",
        "default": true
      }
    ]
  }
]
```

- [ ] **Step 4: Verify scaffold**

Open the homepage in a browser. Confirm:
- No console errors
- The canvas element exists in the DOM (`document.getElementById('jj-screensaver')`)
- The canvas is invisible (transparent, behind content)
- Existing site layout is unaffected

- [ ] **Step 5: Commit**

```bash
git add layout/theme.liquid config/settings_schema.json
git commit -m "feat(screensaver): add canvas element, script loading, and Shopify settings scaffold"
```

---

### Task 2: VGA 256 Post-Processor

**Files:**
- Create: `assets/japanjunky-screensaver-post.js`

- [ ] **Step 1: Create the post-processor module**

```javascript
/**
 * JapanJunky Screensaver Post-Processor
 *
 * VGA 256-color palette quantization + Floyd-Steinberg dithering.
 * Processes raw ImageData from the WebGL readback and returns
 * dithered ImageData ready for display.
 *
 * Separate from japanjunky-dither.js which uses a 32-color CRT
 * phosphor palette for product images. This uses the standard
 * VGA 256-color palette for the screensaver's "PC rendering" look.
 */
(function () {
  'use strict';

  // ─── Standard VGA 256-Color Palette ──────────────────────────
  // Colors 0-15:   CGA compatibility colors
  // Colors 16-231: 6×6×6 color cube (6 levels: 0,51,102,153,204,255)
  // Colors 232-255: 24-step grayscale ramp
  var PALETTE = [];

  // CGA colors (0-15)
  var CGA = [
    [0,0,0], [0,0,170], [0,170,0], [0,170,170],
    [170,0,0], [170,0,170], [170,85,0], [170,170,170],
    [85,85,85], [85,85,255], [85,255,85], [85,255,255],
    [255,85,85], [255,85,255], [255,255,85], [255,255,255]
  ];
  for (var c = 0; c < CGA.length; c++) {
    PALETTE.push(CGA[c]);
  }

  // 6×6×6 color cube (16-231)
  var LEVELS = [0, 51, 102, 153, 204, 255];
  for (var ri = 0; ri < 6; ri++) {
    for (var gi = 0; gi < 6; gi++) {
      for (var bi = 0; bi < 6; bi++) {
        PALETTE.push([LEVELS[ri], LEVELS[gi], LEVELS[bi]]);
      }
    }
  }

  // Grayscale ramp (232-255)
  for (var g = 0; g < 24; g++) {
    var v = 8 + g * 10; // 8, 18, 28, ..., 238
    PALETTE.push([v, v, v]);
  }

  // ─── Nearest palette color (Euclidean RGB distance) ──────────
  function nearestColor(r, g, b) {
    var minDist = Infinity;
    var best = PALETTE[0];
    for (var i = 0; i < PALETTE.length; i++) {
      var pr = PALETTE[i][0];
      var pg = PALETTE[i][1];
      var pb = PALETTE[i][2];
      var dr = r - pr;
      var dg = g - pg;
      var db = b - pb;
      var dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        best = PALETTE[i];
        if (dist === 0) break;
      }
    }
    return best;
  }

  // ─── Floyd-Steinberg dithering on ImageData ──────────────────
  // Modifies imageData in place. Operates on a float buffer for
  // error accumulation precision.
  //
  // Error distribution:
  //        *    7/16
  //  3/16  5/16  1/16
  //
  function dither(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;

    var buf = new Float32Array(data.length);
    for (var i = 0; i < data.length; i++) {
      buf[i] = data[i];
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;

        var oldR = Math.max(0, Math.min(255, buf[idx]));
        var oldG = Math.max(0, Math.min(255, buf[idx + 1]));
        var oldB = Math.max(0, Math.min(255, buf[idx + 2]));

        var newC = nearestColor(oldR, oldG, oldB);

        buf[idx] = newC[0];
        buf[idx + 1] = newC[1];
        buf[idx + 2] = newC[2];

        var errR = oldR - newC[0];
        var errG = oldG - newC[1];
        var errB = oldB - newC[2];

        if (x + 1 < w) {
          var ri = idx + 4;
          buf[ri]     += errR * 0.4375;
          buf[ri + 1] += errG * 0.4375;
          buf[ri + 2] += errB * 0.4375;
        }
        if (x > 0 && y + 1 < h) {
          var bli = ((y + 1) * w + (x - 1)) * 4;
          buf[bli]     += errR * 0.1875;
          buf[bli + 1] += errG * 0.1875;
          buf[bli + 2] += errB * 0.1875;
        }
        if (y + 1 < h) {
          var bi = idx + w * 4;
          buf[bi]     += errR * 0.3125;
          buf[bi + 1] += errG * 0.3125;
          buf[bi + 2] += errB * 0.3125;
        }
        if (x + 1 < w && y + 1 < h) {
          var bri = idx + (w + 1) * 4;
          buf[bri]     += errR * 0.0625;
          buf[bri + 1] += errG * 0.0625;
          buf[bri + 2] += errB * 0.0625;
        }
      }
    }

    for (var j = 0; j < data.length; j++) {
      data[j] = Math.max(0, Math.min(255, Math.round(buf[j])));
    }

    return imageData;
  }

  // ─── Public API ──────────────────────────────────────────────
  window.JJ_ScreensaverPost = {
    dither: dither,
    PALETTE: PALETTE
  };
})();
```

- [ ] **Step 2: Verify post-processor loads**

Open browser console on homepage and run:
```javascript
console.log(JJ_ScreensaverPost.PALETTE.length); // Should log 256
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver-post.js
git commit -m "feat(screensaver): add VGA 256-color post-processor with Floyd-Steinberg dithering"
```

---

### Task 3: Three.js Vendor + Minimal Scene Proof-of-Life

**Files:**
- Create: `assets/three.min.js` (vendored)
- Create: `assets/japanjunky-screensaver.js` (minimal scaffold)

- [ ] **Step 1: Download and vendor Three.js**

Download Three.js r170 (or latest stable) standalone build:

```bash
curl -L "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js" -o assets/three.min.js
```

Verify the file is present and contains the THREE global:
```bash
head -c 200 assets/three.min.js
```

- [ ] **Step 2: Create minimal screensaver script**

Create `assets/japanjunky-screensaver.js` with a minimal proof-of-life — a single rotating cube rendered to the homepage canvas. This validates the full pipeline: Three.js loads, canvas is acquired, WebGL context works, rendering is visible behind content.

```javascript
/**
 * JapanJunky Screensaver — Three.js Lacquer Landscape
 *
 * Low-poly Japanese landscape (Mt. Fuji, wireframe ocean, trees)
 * with floating geometric primitives, rendered at low resolution
 * with VGA 256-color dithering and PS1-style vertex snapping.
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

  // ─── Resolution ──────────────────────────────────────────────
  var resH = parseInt(config.resolution, 10) || 240;
  var resW = Math.round(resH * (4 / 3)); // 4:3 fixed aspect

  // ─── Renderer ────────────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    // WebGL not available — leave canvas transparent (black bg shows through)
    return;
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0, 0);

  // ─── Proof of life: spinning cube ────────────────────────────
  var geo = new THREE.BoxGeometry(1, 1, 1);
  var mat = new THREE.MeshBasicMaterial({ color: 0xAA5500, wireframe: true });
  var cube = new THREE.Mesh(geo, mat);
  scene.add(cube);

  // ─── Render Loop ─────────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.015;

    renderer.render(scene, camera);
  }

  // ─── Init ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }
})();
```

- [ ] **Step 3: Verify proof of life**

Open the homepage in a browser. Confirm:
- A small wireframe gold cube rotates in the center of the screen, behind all site content
- No console errors
- The cube is visible through the gaps/margins between content panels
- The CRT overlay (scanlines, vignette) renders on top of the cube
- Site content and interactions (clicking products, search, etc.) work normally

- [ ] **Step 4: Commit**

```bash
git add assets/three.min.js assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add Three.js vendor + minimal proof-of-life scene"
```

---

## Chunk 2: Custom Shader & Scene Geometry

### Task 4: Custom Vertex-Snapping Shader Material

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add the custom ShaderMaterial factory**

Replace the proof-of-life cube setup in `japanjunky-screensaver.js` with a reusable shader material factory. Add this after the scene/camera setup, replacing the "Proof of life" section:

```javascript
  // ─── Custom PS1-Style ShaderMaterial ───────────────────────────
  // Vertex shader: snaps positions to a coarse screen-space grid.
  // Fragment shader: simple directional + ambient lighting with flat color.
  var VERT_SHADER = [
    'uniform float uResolution;',
    'varying vec3 vNormal;',
    'varying vec3 vWorldPos;',
    '',
    'void main() {',
    '  vNormal = normalize(normalMatrix * normal);',
    '  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    '',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '',
    '  // PS1-style screen-space vertex snapping',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var FRAG_SHADER = [
    'uniform vec3 uColor;',
    'uniform vec3 uLightDir;',
    'uniform vec3 uAmbient;',
    'varying vec3 vNormal;',
    '',
    'void main() {',
    '  float diff = max(dot(vNormal, uLightDir), 0.0);',
    '  vec3 lit = uColor * (uAmbient + diff * vec3(0.8));',
    '  gl_FragColor = vec4(lit, 1.0);',
    '}'
  ].join('\n');

  // Wireframe variant — no lighting, flat color
  var FRAG_SHADER_WIRE = [
    'uniform vec3 uColor;',
    '',
    'void main() {',
    '  gl_FragColor = vec4(uColor, 1.0);',
    '}'
  ].join('\n');

  // Light direction: from upper-right, matching lacquer reference illumination
  var lightDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

  function makePS1Material(color, wireframe) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uColor: { value: new THREE.Color(color) },
        uLightDir: { value: lightDir },
        uAmbient: { value: new THREE.Vector3(0.25, 0.22, 0.18) }
      },
      vertexShader: VERT_SHADER,
      fragmentShader: wireframe ? FRAG_SHADER_WIRE : FRAG_SHADER,
      wireframe: !!wireframe,
      side: THREE.DoubleSide
    });
  }
```

- [ ] **Step 2: Add a test shape using the new material**

Replace the cube proof-of-life with a test icosahedron using the PS1 material:

```javascript
  // ─── Test: PS1 material on icosahedron ────────────────────────
  var testGeo = new THREE.IcosahedronGeometry(1, 1);
  var testMat = makePS1Material(0xAA5500, false);
  var testMesh = new THREE.Mesh(testGeo, testMat);
  scene.add(testMesh);
```

Update the animate loop to rotate the test mesh:
```javascript
    testMesh.rotation.x += 0.01;
    testMesh.rotation.y += 0.015;
```

- [ ] **Step 3: Verify vertex snapping**

Open homepage. Confirm:
- The icosahedron renders with flat shading and a warm gold color
- As it rotates, vertices visibly "pop" between grid positions (jittery/chunky movement)
- The effect is more pronounced on vertices closer to the camera
- No shader compilation errors in the console

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add PS1-style vertex-snapping shader material"
```

---

### Task 5: Landscape Geometry (Fuji, Ocean, Trees, Sky)

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add sky gradient quad**

Remove the test icosahedron. Add a full-screen background quad behind the scene with a vertical gradient from burnished gold to black. Add this as a scene-building function:

```javascript
  // ─── Sky Gradient ─────────────────────────────────────────────
  // Full-screen quad behind the scene. Vertex colors create a
  // gold-to-black gradient matching the lacquer reference sky.
  function buildSky() {
    var geo = new THREE.PlaneGeometry(80, 60);
    var colors = new Float32Array(geo.attributes.position.count * 3);
    var pos = geo.attributes.position;

    // Gold at top, black at bottom
    var topColor = new THREE.Color(0xAA5500);
    var bottomColor = new THREE.Color(0x0a0800);

    for (var i = 0; i < pos.count; i++) {
      var t = (pos.getY(i) + 30) / 60; // 0 at bottom, 1 at top
      t = Math.max(0, Math.min(1, t));
      var col = new THREE.Color().lerpColors(bottomColor, topColor, t);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.ShaderMaterial({
      vertexShader: [
        'varying vec3 vColor;',
        'void main() {',
        '  vColor = color;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor;',
        'void main() {',
        '  gl_FragColor = vec4(vColor, 1.0);',
        '}'
      ].join('\n'),
      vertexColors: true,
      depthWrite: false
    });

    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 8, -35);
    scene.add(mesh);
  }
```

- [ ] **Step 2: Add Mt. Fuji geometry**

```javascript
  // ─── Mt. Fuji ─────────────────────────────────────────────────
  function buildFuji() {
    // Main peak — low-poly cone
    var fujiGeo = new THREE.ConeGeometry(8, 10, 8);
    var fujiMat = makePS1Material(0x1a1008, false); // dark brown-black
    var fuji = new THREE.Mesh(fujiGeo, fujiMat);
    fuji.position.set(0, 3, -20);
    scene.add(fuji);

    // Snow cap — smaller cone at the peak
    var capGeo = new THREE.ConeGeometry(2.5, 2.5, 8);
    var capMat = makePS1Material(0xAAAA88, false); // cream/snow
    var cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, 7.8, -20);
    scene.add(cap);

    // Foothills
    var hill1Geo = new THREE.ConeGeometry(5, 4, 6);
    var hill1Mat = makePS1Material(0x0f0a05, false);
    var hill1 = new THREE.Mesh(hill1Geo, hill1Mat);
    hill1.position.set(-8, 0.5, -16);
    scene.add(hill1);

    var hill2Geo = new THREE.ConeGeometry(4, 3, 5);
    var hill2Mat = makePS1Material(0x120d06, false);
    var hill2 = new THREE.Mesh(hill2Geo, hill2Mat);
    hill2.position.set(7, 0, -14);
    scene.add(hill2);
  }
```

- [ ] **Step 3: Add wireframe ocean**

```javascript
  // ─── Wireframe Ocean ──────────────────────────────────────────
  var oceanGeo, oceanPositions;

  function buildOcean() {
    oceanGeo = new THREE.PlaneGeometry(40, 30, 30, 30);
    oceanGeo.rotateX(-Math.PI / 2);

    // Store original Y positions for wave animation
    oceanPositions = new Float32Array(oceanGeo.attributes.position.count);
    var pos = oceanGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      oceanPositions[i] = pos.getY(i);
    }

    var mat = makePS1Material(0xAA5522, true); // wireframe amber
    var ocean = new THREE.Mesh(oceanGeo, mat);
    ocean.position.set(0, -1.5, -5);
    scene.add(ocean);
  }

  // Animate waves — called per frame
  function animateOcean(time) {
    if (!oceanGeo) return;
    var pos = oceanGeo.attributes.position;
    var t = time * 0.001;

    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i);

      // Layer 2-3 sine waves at different frequencies
      var wave = Math.sin(x * 0.3 + t * 0.8) * 0.4
               + Math.sin(z * 0.5 + t * 0.5) * 0.3
               + Math.sin((x + z) * 0.2 + t * 1.2) * 0.2;

      pos.setY(i, oceanPositions[i] + wave);
    }
    pos.needsUpdate = true;
  }
```

- [ ] **Step 4: Add low-poly trees**

```javascript
  // ─── Trees ────────────────────────────────────────────────────
  function buildTrees() {
    var treePositions = [
      [-6, -1, -8],
      [-3, -1.2, -10],
      [5, -0.8, -9]
    ];

    for (var i = 0; i < treePositions.length; i++) {
      var p = treePositions[i];

      // Trunk — thin cylinder
      var trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 4);
      var trunkMat = makePS1Material(0x5a3410, false);
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(p[0], p[1] + 0.75, p[2]);
      scene.add(trunk);

      // Canopy — low-poly cone
      var canopyGeo = new THREE.ConeGeometry(1.2, 2.5, 5);
      var canopyMat = makePS1Material(0x005500, false);
      var canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(p[0], p[1] + 2.5, p[2]);
      scene.add(canopy);
    }
  }
```

- [ ] **Step 5: Call all build functions and update animate loop**

```javascript
  // ─── Build Scene ──────────────────────────────────────────────
  buildSky();
  buildFuji();
  buildOcean();
  buildTrees();
```

Update the animate function to call `animateOcean(time)` and remove any test mesh rotation.

- [ ] **Step 6: Verify landscape**

Open homepage. Confirm:
- Gold-to-black sky gradient visible behind content gaps
- Mt. Fuji silhouette with snow cap centered in the scene
- Foothills flanking Fuji
- Wireframe ocean with chunky undulating waves (vertex-snapped)
- 3 low-poly trees placed in the scene
- All geometry has visible PS1-style vertex jitter
- Camera is static at this point (orbit added in Task 7)

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add landscape geometry — Fuji, ocean, trees, sky gradient"
```

---

### Task 6: Floating Objects (Primitives, Lattice, Wireframes)

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add floating geometric primitives**

```javascript
  // ─── Floating Primitives ──────────────────────────────────────
  var floatingObjects = [];

  function buildFloatingPrimitives() {
    var shapes = [
      { geo: new THREE.IcosahedronGeometry(0.4, 0), color: 0xAA5500, wire: false },
      { geo: new THREE.OctahedronGeometry(0.35, 0), color: 0xAA0000, wire: false },
      { geo: new THREE.TetrahedronGeometry(0.5, 0), color: 0xAA5522, wire: true },
      { geo: new THREE.IcosahedronGeometry(0.3, 0), color: 0xFFFF55, wire: false },
      { geo: new THREE.OctahedronGeometry(0.45, 0), color: 0x005500, wire: true },
      { geo: new THREE.TetrahedronGeometry(0.35, 0), color: 0xAA5500, wire: false },
      { geo: new THREE.IcosahedronGeometry(0.5, 0), color: 0x000055, wire: true },
      { geo: new THREE.OctahedronGeometry(0.4, 0), color: 0xAA0000, wire: false }
    ];

    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      var mat = makePS1Material(s.color, s.wire);
      var mesh = new THREE.Mesh(s.geo, mat);

      // Distribute around the scene
      var angle = (i / shapes.length) * Math.PI * 2;
      var radius = 4 + Math.random() * 6;
      var homePos = new THREE.Vector3(
        Math.cos(angle) * radius,
        0.5 + Math.random() * 3,
        Math.sin(angle) * radius - 5
      );
      mesh.position.copy(homePos);

      // Per-object animation params
      mesh.userData = {
        homePos: homePos.clone(),
        displacement: new THREE.Vector3(),
        rotSpeedX: (Math.random() - 0.5) * 0.02,
        rotSpeedY: (Math.random() - 0.5) * 0.03,
        driftFreqX: 0.2 + Math.random() * 0.3,
        driftFreqY: 0.15 + Math.random() * 0.25,
        driftAmpX: 0.3 + Math.random() * 0.5,
        driftAmpY: 0.2 + Math.random() * 0.3,
        driftPhase: Math.random() * Math.PI * 2
      };

      scene.add(mesh);
      floatingObjects.push(mesh);
    }
  }

  function animateFloatingPrimitives(time) {
    var t = time * 0.001;
    for (var i = 0; i < floatingObjects.length; i++) {
      var obj = floatingObjects[i];
      var ud = obj.userData;

      // Rotation
      obj.rotation.x += ud.rotSpeedX;
      obj.rotation.y += ud.rotSpeedY;

      // Sinusoidal drift
      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmpX;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmpY;

      obj.position.x = ud.homePos.x + driftX + ud.displacement.x;
      obj.position.y = ud.homePos.y + driftY + ud.displacement.y;
      obj.position.z = ud.homePos.z + ud.displacement.z;

      // Damp displacement (spring back)
      ud.displacement.multiplyScalar(0.97);
    }
  }
```

- [ ] **Step 2: Add particle lattice clusters**

```javascript
  // ─── Particle Lattice Clusters ────────────────────────────────
  var latticeClusters = [];

  function buildParticleLattices() {
    var clusterConfigs = [
      { center: new THREE.Vector3(6, 3, -3), count: 12, spread: 1.5, color: 0xAA5500 },
      { center: new THREE.Vector3(-5, 4, -7), count: 10, spread: 1.2, color: 0xFFFF55 },
      { center: new THREE.Vector3(3, 2, -12), count: 8, spread: 1.0, color: 0xAA5522 }
    ];

    for (var ci = 0; ci < clusterConfigs.length; ci++) {
      var cfg = clusterConfigs[ci];
      var group = new THREE.Group();
      group.position.copy(cfg.center);

      var points = [];
      for (var i = 0; i < cfg.count; i++) {
        points.push(new THREE.Vector3(
          (Math.random() - 0.5) * cfg.spread * 2,
          (Math.random() - 0.5) * cfg.spread * 2,
          (Math.random() - 0.5) * cfg.spread * 2
        ));
      }

      // Connect nearest neighbors with lines
      var lineGeo = new THREE.BufferGeometry();
      var lineVerts = [];
      var CONNECTION_DIST = cfg.spread * 1.5;

      for (var a = 0; a < points.length; a++) {
        for (var b = a + 1; b < points.length; b++) {
          if (points[a].distanceTo(points[b]) < CONNECTION_DIST) {
            lineVerts.push(points[a].x, points[a].y, points[a].z);
            lineVerts.push(points[b].x, points[b].y, points[b].z);
          }
        }
      }

      lineGeo.setAttribute('position',
        new THREE.Float32BufferAttribute(lineVerts, 3));

      var lineMat = makePS1Material(cfg.color, true); // use PS1 shader for consistent snapping
      lineMat.wireframe = false; // LineSegments doesn't need wireframe mode
      var lines = new THREE.LineSegments(lineGeo, lineMat);
      group.add(lines);

      // Small spheres at each point
      for (var p = 0; p < points.length; p++) {
        var dotGeo = new THREE.SphereGeometry(0.05, 4, 4);
        var dotMat = makePS1Material(cfg.color, false);
        var dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(points[p]);
        group.add(dot);
        group.userData.dotMeshes.push(dot);
      }

      group.userData = {
        homePos: cfg.center.clone(),
        displacement: new THREE.Vector3(),
        rotSpeed: 0.003 + Math.random() * 0.005,
        lineGeo: lineGeo,
        baseLineVerts: new Float32Array(lineVerts),
        points: points.map(function (p) { return p.clone(); }),
        dotMeshes: []
      };

      scene.add(group);
      latticeClusters.push(group);
      floatingObjects.push(group); // Add to floatingObjects for cursor reaction
    }
  }

  function animateLatticeClusters(time) {
    var t = time * 0.001;
    for (var i = 0; i < latticeClusters.length; i++) {
      var cluster = latticeClusters[i];
      var ud = cluster.userData;

      // Rotate cluster as a whole
      cluster.rotation.y += ud.rotSpeed;
      cluster.rotation.x += ud.rotSpeed * 0.3;

      // Per-vertex morphing — drift each point on sine paths
      for (var p = 0; p < ud.points.length; p++) {
        var base = ud.points[p];
        var phase = p * 1.7; // stagger per point
        var dx = Math.sin(t * 0.4 + phase) * 0.15;
        var dy = Math.sin(t * 0.3 + phase * 1.3) * 0.12;
        var dz = Math.sin(t * 0.5 + phase * 0.7) * 0.15;

        // Update dot mesh position
        if (ud.dotMeshes[p]) {
          ud.dotMeshes[p].position.set(
            base.x + dx, base.y + dy, base.z + dz
          );
        }
      }

      // Rebuild line geometry from morphed dot positions
      if (ud.lineGeo && ud.dotMeshes.length > 0) {
        var pos = ud.lineGeo.attributes.position;
        var vertIdx = 0;
        for (var a = 0; a < ud.dotMeshes.length; a++) {
          for (var b = a + 1; b < ud.dotMeshes.length; b++) {
            if (ud.points[a].distanceTo(ud.points[b]) < 2.25) {
              var da = ud.dotMeshes[a].position;
              var db = ud.dotMeshes[b].position;
              pos.setXYZ(vertIdx, da.x, da.y, da.z); vertIdx++;
              pos.setXYZ(vertIdx, db.x, db.y, db.z); vertIdx++;
            }
          }
        }
        pos.needsUpdate = true;
      }
    }
  }
```

- [ ] **Step 3: Add rotating wireframe shapes**

```javascript
  // ─── Rotating Wireframe Shapes ────────────────────────────────
  var wireframeShapes = [];

  function buildWireframeShapes() {
    // Wireframe sphere
    var sphereGeo = new THREE.SphereGeometry(1.2, 8, 6);
    var sphereMat = makePS1Material(0x000055, true); // indigo wireframe
    var sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(-4, 3, -4);
    sphere.userData.rotSpeed = 0.005;
    scene.add(sphere);
    wireframeShapes.push(sphere);

    // Wireframe torus
    var torusGeo = new THREE.TorusGeometry(0.8, 0.3, 6, 8);
    var torusMat = makePS1Material(0x005555, true); // cyan wireframe
    var torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(8, 2, -6);
    torus.userData.rotSpeed = 0.008;
    scene.add(torus);
    wireframeShapes.push(torus);
  }

  function animateWireframeShapes() {
    for (var i = 0; i < wireframeShapes.length; i++) {
      var shape = wireframeShapes[i];
      shape.rotation.y += shape.userData.rotSpeed;
      shape.rotation.x += shape.userData.rotSpeed * 0.7;
    }
  }
```

- [ ] **Step 4: Add build calls and update animate loop**

Add to the build section:
```javascript
  buildFloatingPrimitives();
  buildParticleLattices();
  buildWireframeShapes();
```

Update the animate function to call all animation functions:
```javascript
    animateOcean(time);
    animateFloatingPrimitives(time);
    animateLatticeClusters(time);
    animateWireframeShapes();
```

- [ ] **Step 5: Verify floating objects**

Open homepage. Confirm:
- 8 geometric primitives float around the scene, each rotating at different speeds
- Mix of solid and wireframe primitives visible
- 3 particle lattice clusters with connected points slowly rotating
- 1 wireframe sphere (indigo) and 1 wireframe torus (cyan) rotating
- All objects have vertex-snapping jitter
- Landscape from Task 5 still visible and animating

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add floating primitives, particle lattices, and wireframe shapes"
```

---

## Chunk 3: Camera, Interaction & Post-Processing Pipeline

### Task 7: Camera Orbit + Mouse Parallax

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add camera orbit system**

Replace the static camera position with an orbit system:

```javascript
  // ─── Camera Orbit ─────────────────────────────────────────────
  var ORBIT = {
    radiusX: 14,
    radiusZ: 12,
    baseHeight: 5,
    bobAmount: 0.25,
    lookTarget: new THREE.Vector3(0, 1.5, -10),
    // 2*PI / desired_seconds: slow=~100s, medium=~60s, fast=~40s
    speed: { slow: 0.063, medium: 0.105, fast: 0.157 }
  };
  var orbitSpeed = ORBIT.speed[config.orbitSpeed] || ORBIT.speed.slow;

  function updateCameraOrbit(time) {
    var t = time * 0.001 * orbitSpeed;

    camera.position.x = Math.cos(t) * ORBIT.radiusX;
    camera.position.z = Math.sin(t) * ORBIT.radiusZ;
    camera.position.y = ORBIT.baseHeight
      + Math.sin(t * 0.3) * ORBIT.bobAmount;

    camera.lookAt(ORBIT.lookTarget);
  }
```

- [ ] **Step 2: Add mouse parallax**

```javascript
  // ─── Mouse Parallax ──────────────────────────────────────────
  var mouseNorm = { x: 0, y: 0 };
  var parallaxOffset = { x: 0, y: 0 };
  var MAX_PARALLAX = 0.5; // world units offset on look target
  var PARALLAX_LERP = 0.05;
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  if (config.mouseInteraction !== false && !isMobile) {
    window.addEventListener('mousemove', function (e) {
      mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Ease back when mouse leaves window
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

- [ ] **Step 3: Integrate orbit + parallax into animate loop**

Update the animate function to use the orbit and parallax:

```javascript
    updateCameraOrbit(time);
    updateParallax();

    // Apply parallax offset to look target
    var lookX = ORBIT.lookTarget.x + parallaxOffset.x;
    var lookY = ORBIT.lookTarget.y - parallaxOffset.y;
    camera.lookAt(lookX, lookY, ORBIT.lookTarget.z);
```

Remove any earlier static `camera.position.set(...)` and `camera.lookAt(...)` calls.

- [ ] **Step 4: Verify camera behavior**

Open homepage. Confirm:
- Camera slowly orbits around the scene, keeping Fuji in view
- Moving the mouse gently shifts the view direction (subtle, dreamy)
- Stopping mouse movement causes view to ease back to center
- Orbit speed matches the setting (default: slow, ~90-120s per revolution)
- All scene elements remain visible throughout the orbit

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add camera orbit with mouse parallax"
```

---

### Task 8: Object Cursor Reaction

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add raycaster-based cursor repulsion**

```javascript
  // ─── Object Cursor Reaction ───────────────────────────────────
  var raycaster = new THREE.Raycaster();
  var mouseVec2 = new THREE.Vector2();
  var REACTION_RADIUS = 3;
  var REPULSION_STRENGTH = 0.15;
  var MAX_DISPLACEMENT = 0.5;
  var DAMPING = 0.97;

  // Scratch vectors (reused per frame to avoid GC pressure)
  var _closestPoint = new THREE.Vector3();
  var _pushDir = new THREE.Vector3();

  function updateCursorReaction() {
    if (config.mouseInteraction === false || isMobile) return;

    mouseVec2.set(mouseNorm.x, -mouseNorm.y); // flip Y for Three.js coords
    raycaster.setFromCamera(mouseVec2, camera);

    var ray = raycaster.ray;

    for (var i = 0; i < floatingObjects.length; i++) {
      var obj = floatingObjects[i];
      var ud = obj.userData;
      if (!ud.displacement) continue;

      ray.closestPointToPoint(obj.position, _closestPoint);
      var dist = obj.position.distanceTo(_closestPoint);

      if (dist < REACTION_RADIUS) {
        var force = REPULSION_STRENGTH / (dist * dist + 0.1);
        force = Math.min(force, MAX_DISPLACEMENT);

        _pushDir.subVectors(obj.position, _closestPoint).normalize();
        ud.displacement.add(_pushDir.multiplyScalar(force));

        // Clamp total displacement
        if (ud.displacement.length() > MAX_DISPLACEMENT) {
          ud.displacement.normalize().multiplyScalar(MAX_DISPLACEMENT);
        }
      }
    }
  }
```

- [ ] **Step 2: Add to animate loop**

Insert `updateCursorReaction();` in the animate function, after `updateParallax()`.

- [ ] **Step 3: Verify cursor interaction**

Open homepage. Confirm:
- Moving mouse near floating primitives causes them to drift away
- Moving mouse near particle lattice clusters pushes them away
- Objects "pop" between positions (vertex-snapped displacement)
- Objects drift back to their paths when cursor moves away (~3 seconds)
- Fuji, ocean, trees, and wireframe accents are NOT affected
- No performance degradation

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add cursor-reactive object repulsion"
```

---

### Task 9: Full Render Pipeline (readPixels → Dither → Display)

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Set up offscreen render target + display canvas**

Replace the direct-to-canvas rendering with the offscreen → readback → dither → display pipeline:

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

  // The original #jj-screensaver canvas becomes the offscreen WebGL context
  // holder (hidden). The new display canvas is the visible output.
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

  // ─── Reusable render pipeline ─────────────────────────────────
  // Used by both the animate loop and the reduced-motion static frame.
  function renderOneFrame() {
    // 1. Render scene to offscreen target
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // 2. Read pixels back to CPU
    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    // 3. Copy to ImageData (WebGL reads bottom-up, flip vertically)
    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    // 4. VGA palette quantization + Floyd-Steinberg dither
    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    // 5. Draw dithered frame to display canvas
    displayCtx.putImageData(displayImageData, 0, 0);
  }
```

- [ ] **Step 2: Update render loop for the full pipeline**

Replace the renderer.render call in animate with:

```javascript
    renderOneFrame();
```

- [ ] **Step 3: Verify full pipeline**

Open homepage. Confirm:
- The scene renders with visible VGA 256-color dithering (stipple patterns in gradients)
- The sky gradient shows characteristic banded dithering
- Colors are quantized — limited palette visible (golds, blacks, indigos, greens)
- Chunky pixels visible due to 320×240 nearest-neighbor upscale
- Vertex snapping jitter still present on all geometry
- The CRT overlay (scanlines, aperture grille) renders on top
- Framerate feels smooth at the target (24fps default)

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add full render pipeline — offscreen render, VGA dither, display"
```

---

## Chunk 4: Performance, Accessibility & Final Polish

### Task 10: Performance Safeguards & Accessibility

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

- [ ] **Step 1: Add tab visibility pause**

Add before the animate function:

```javascript
  // ─── Performance Safeguards ───────────────────────────────────
  var pauseReasons = { hidden: false, scrolled: false };

  function isPaused() {
    return pauseReasons.hidden || pauseReasons.scrolled;
  }

  function resumeIfNeeded() {
    if (!isPaused()) {
      lastFrame = performance.now(); // prevent time jump on resume
      requestAnimationFrame(animate);
    }
  }

  document.addEventListener('visibilitychange', function () {
    pauseReasons.hidden = document.hidden;
    resumeIfNeeded();
  });
```

Update the animate function to check pause state:
```javascript
  function animate(time) {
    if (isPaused()) return;
    requestAnimationFrame(animate);
    // ... rest of loop
  }
```

- [ ] **Step 2: Add scroll sentinel pause**

```javascript
  // Scroll sentinel — pause when user scrolls past the fold
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:100vh;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(sentinel);

  if (window.IntersectionObserver) {
    var scrollObserver = new IntersectionObserver(function (entries) {
      // Sentinel is at the fold. When it's NOT intersecting,
      // the user has scrolled past the viewport height.
      pauseReasons.scrolled = !entries[0].isIntersecting;
      resumeIfNeeded();
    }, { threshold: 0 });
    scrollObserver.observe(sentinel);
  }
```

- [ ] **Step 3: Add reduced-motion and high-contrast support**

Add near the top of the IIFE, after the `config.enabled` check:

```javascript
  // Accessibility: respect user preferences
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;

  // High contrast: disable screensaver entirely
  if (prefersHighContrast) return;
```

For reduced motion, after the full pipeline is set up (after Task 9's code), add:

```javascript
  // Reduced motion: render one static frame, then stop
  if (prefersReducedMotion) {
    updateCameraOrbit(0);
    renderOneFrame();
    return; // Don't start the animation loop
  }
```

- [ ] **Step 4: Verify safeguards**

Test each:
- Switch to another tab and back — animation should pause and resume without time jump
- Scroll down on mobile — animation should pause when past the fold
- Set `prefers-reduced-motion: reduce` in browser dev tools — should see a static dithered frame
- Set `prefers-contrast: more` in dev tools — screensaver should not render (plain black bg)
- Disable WebGL in browser settings — no console errors, plain black bg (this tests the fallback from Task 3, confirming it still works with the full pipeline)

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add performance safeguards and accessibility support"
```

---

### Task 11: Final Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Full visual verification**

Open the homepage and verify the complete experience:
- Scene renders behind all content with VGA dithered look
- Mt. Fuji, ocean waves, trees, floating primitives, lattice clusters, wireframe shapes all visible
- Camera orbits slowly, mouse parallax works
- Floating objects react to cursor
- Chunky pixels + dithering + CRT overlay creates the intended late-90s screensaver aesthetic
- Colors match the lacquer reference palette translated through VGA

- [ ] **Step 2: Cross-browser verification**

Test in:
- Chrome/Edge (primary)
- Firefox (verify `image-rendering: crisp-edges` fallback works)
- Safari (if available, verify WebGL context creation)

- [ ] **Step 3: Performance verification**

Open browser dev tools Performance panel:
- Frame time should be under 42ms (24fps target)
- No memory leaks over 60 seconds of running
- CPU usage should be modest (low-res render + dither at 76,800 pixels/frame)

- [ ] **Step 4: Verify site functionality**

Confirm all existing site features work normally:
- Product table selection and detail pane
- Search with glitch effect
- Category filtering
- Start menu open/close
- Custom cursor animation
- Product image dithering (separate pipeline, should be unaffected)

- [ ] **Step 5: Confirm complete**

All tasks verified. The screensaver implementation is complete. No files to commit in this task — all changes were committed in previous tasks.
