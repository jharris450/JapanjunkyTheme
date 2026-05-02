# ASCII Character-Grid CRT Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CRT overlay shader with a full ASCII character-grid renderer — procedural noise source rendered through a CP437-style glyph grid with Bayer dithering, configurable phosphor tint, multi-pass bloom, and SVG barrel distortion.

**Architecture:** Fullscreen Three.js WebGL quad renders an ASCII character grid from a procedural noise source. Multi-pass bloom (threshold → Gaussian blur → additive composite) creates phosphor glow. SVG barrel distortion on `<html>` root curves the entire viewport. Interactive UI elements float above the opaque ASCII canvas as exempt DOM.

**Tech Stack:** Three.js (r150, already loaded as global), GLSL ES 1.0, SVG filters, CSS

**Spec:** `docs/superpowers/specs/2026-04-01-ascii-crt-renderer-design.md`

---

## Design Refinements from Spec

The spec described html2canvas for DOM capture and a pre-built CP437 PNG atlas. During planning, these were simplified:

1. **No html2canvas** — Procedural noise source instead of DOM capture. The ASCII grid is atmospheric background; all readable content is exempt DOM above it. This avoids a 400KB+ dependency and DOM capture perf overhead. The shader accepts any source texture, so DOM capture can be added later if needed.

2. **No font atlas PNG** — Glyph patterns (space, dot, ░, ▒, ▓, █) are computed procedurally in the fragment shader. Mathematically identical to CP437 block elements, zero texture overhead, resolution-independent.

3. **No VGA palette texture** — Color comes from a configurable phosphor tint uniform multiplied by source luminance. Simpler and gives the authentic single-phosphor CRT look. Color modes (green/amber/color) are shader uniforms.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `assets/japanjunky-crt-shader.js` | **Rewrite** | Complete ASCII renderer: config, barrel distortion, Three.js setup, GLSL shaders, bloom pipeline, animation loop, exempt element tagging |
| `assets/japanjunky-crt.css` | **Modify** lines 426-451 | Update `.jj-crt-shader-active` rules: canvas z-index, exempt element positioning, remove old overlay-specific shader styles |
| `layout/theme.liquid` | **Modify** lines 263-267 | Remove z-index from canvas inline style, update config variable name |

## Z-Index Strategy

When `.jj-crt-shader-active` is set on `<html>`:

| Layer | Z-Index | Element |
|-------|---------|---------|
| ASCII canvas | 100 | `#jj-crt-shader-canvas` — opaque, covers viewport |
| Win95 taskbar | 1000 | `.jj-win95-taskbar` — already above 100 |
| Win95 start menu | 2000 | `.jj-start-menu` — already above 100 |
| Ring carousel | 200 | `.jj-ring` — bumped via CSS |
| Product zone | 200 | `.jj-product-zone` — bumped via CSS |
| Tsuno bubble | 200 | `#jj-tsuno-bubble` — bumped via CSS |
| Barrel border | 10001 | `.jj-body::after` — structural, stays on top |

---

### Task 1: IIFE Scaffold + Config + SVG Barrel Distortion

**Files:**
- Rewrite: `assets/japanjunky-crt-shader.js`

This task creates the foundation file with the IIFE wrapper, configuration system, and SVG barrel distortion (ported from the current implementation). After this task, the barrel distortion works identically to before — no Three.js rendering yet.

- [ ] **Step 1: Write the IIFE scaffold with config defaults and merge function**

```js
/**
 * JapanJunky ASCII CRT Renderer
 *
 * Full-viewport ASCII character-grid renderer:
 *   - Procedural noise → luminance → CP437-style glyph grid
 *   - Bayer 4×4 ordered dithering for glyph selection
 *   - Configurable phosphor tint (green / amber / color)
 *   - Multi-pass bloom (threshold → Gaussian blur → composite)
 *   - SVG barrel distortion on <html> root
 *   - Exempt DOM elements float above for interactivity
 *
 * Inspired by vibe-coded.com (codetaur's ASCII renderer).
 *
 * Config: window.JJ_ASCII_CRT_CONFIG (optional overrides)
 * Depends: THREE (global, loaded via three.min.js)
 */
(function () {
  'use strict';

  // ─── Default Configuration ───────────────────────────────────
  var defaults = {
    // Grid
    displayScale: 1,           // tile size multiplier (larger = fewer, bigger cells)

    // Shader
    glyphLevels: 6,            // brightness levels: space, dot, ░, ▒, ▓, █
    ditherStrength: 1.0,       // Bayer dither intensity (0 = off)
    noiseScale: 3.0,           // noise texture UV multiplier
    noiseSpeed: 0.015,         // noise scroll speed
    baseBrightness: 0.25,      // source brightness multiplier

    // Color
    colorMode: 'green',        // 'green' | 'amber' | 'cyan' | 'red'
    tintR: 0.2,                // custom tint (used when colorMode = 'custom')
    tintG: 1.0,
    tintB: 0.3,

    // Bloom
    bloomStrength: 0.8,
    bloomRadius: 4.0,          // blur kernel spread in pixels
    bloomThreshold: 0.15,

    // Barrel distortion (SVG)
    barrelStrength: 0.08,
    barrelScale: 18,
    displacementSize: 256,

    // Mobile
    mobileEnabled: false
  };

  // ─── Config Merge ────────────────────────────────────────────
  function mergeConfig() {
    var overrides = window.JJ_ASCII_CRT_CONFIG || {};
    var cfg = {};
    var key;
    for (key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        cfg[key] = overrides.hasOwnProperty(key) ? overrides[key] : defaults[key];
      }
    }
    return cfg;
  }

  // ... (barrel distortion, shaders, renderer — added in subsequent steps)

  // ─── Init ────────────────────────────────────────────────────
  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) return;

    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var cfg = mergeConfig();
    if (isMobile && !cfg.mobileEnabled) return;

    initBarrelDistortion(cfg);
    document.documentElement.classList.add('jj-crt-shader-active');
    tagExemptElements();
    initRenderer(cfg);
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
```

- [ ] **Step 2: Add the displacement map generator and SVG barrel distortion init**

Insert these two functions above the `init()` function. This is ported directly from the current `japanjunky-crt-shader.js` with no changes.

```js
  // ─── Displacement Map Generator ──────────────────────────────
  function generateDisplacementMap(size, strength) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;

    var maxR2 = 2.0;
    var maxDisp = strength * maxR2;
    var x, y, idx, nx, ny, r2, dx, dy, rVal, gVal;

    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        idx = (y * size + x) * 4;
        nx = (x / (size - 1)) * 2 - 1;
        ny = (y / (size - 1)) * 2 - 1;
        r2 = nx * nx + ny * ny;
        dx = nx * strength * r2;
        dy = ny * strength * r2;
        rVal = 128 + (dx / maxDisp) * 127;
        gVal = 128 + (dy / maxDisp) * 127;
        rVal = rVal < 0 ? 0 : rVal > 255 ? 255 : rVal;
        gVal = gVal < 0 ? 0 : gVal > 255 ? 255 : gVal;
        data[idx]     = rVal;
        data[idx + 1] = gVal;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // ─── SVG Barrel Distortion Filter ────────────────────────────
  function initBarrelDistortion(cfg) {
    var mapUrl = generateDisplacementMap(cfg.displacementSize, cfg.barrelStrength);
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';

    var defs = document.createElementNS(svgNS, 'defs');
    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', 'jj-crt-barrel');
    filter.setAttribute('x', '-5%');
    filter.setAttribute('y', '-5%');
    filter.setAttribute('width', '110%');
    filter.setAttribute('height', '110%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttribute('result', 'displacementMap');
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', mapUrl);
    feImage.setAttribute('preserveAspectRatio', 'none');

    var feFlood = document.createElementNS(svgNS, 'feFlood');
    feFlood.setAttribute('flood-color', '#000000');
    feFlood.setAttribute('flood-opacity', '1');
    feFlood.setAttribute('result', 'blackFill');

    var feDisplace = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisplace.setAttribute('in', 'SourceGraphic');
    feDisplace.setAttribute('in2', 'displacementMap');
    feDisplace.setAttribute('scale', String(cfg.barrelScale));
    feDisplace.setAttribute('xChannelSelector', 'R');
    feDisplace.setAttribute('yChannelSelector', 'G');
    feDisplace.setAttribute('result', 'displaced');

    var feComposite = document.createElementNS(svgNS, 'feComposite');
    feComposite.setAttribute('in', 'displaced');
    feComposite.setAttribute('in2', 'blackFill');
    feComposite.setAttribute('operator', 'over');

    filter.appendChild(feImage);
    filter.appendChild(feFlood);
    filter.appendChild(feDisplace);
    filter.appendChild(feComposite);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
```

- [ ] **Step 3: Add the exempt element tagging function**

Insert above `init()`:

```js
  // ─── Exempt Element Tagging ──────────────────────────────────
  var EXEMPT_SELECTORS = [
    '.jj-win95-taskbar',
    '.jj-start-menu',
    '.jj-ring__bar',
    '.jj-product-info',
    '#jj-viewer-canvas',
    '#jj-screensaver',
    '#jj-tsuno-bubble',
    '#jj-splash',
    '#jj-splash-enter',
    '#jj-crt-shader-canvas'
  ];

  function tagExemptElements() {
    EXEMPT_SELECTORS.forEach(function (sel) {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        els[i].setAttribute('data-jj-ascii-exempt', '');
      }
    });
  }
```

- [ ] **Step 4: Add stub `initRenderer` function**

Insert above `init()`. This is a placeholder that will be replaced in Task 2:

```js
  // ─── Three.js ASCII Renderer (placeholder) ──────────────────
  function initRenderer(cfg) {
    // Implemented in Task 2
  }
```

- [ ] **Step 5: Verify barrel distortion works**

Open the theme in a browser. The SVG barrel distortion should curve the viewport edges. The `jj-crt-shader-active` class should be on `<html>`. The ASCII canvas will be blank (renderer not implemented yet).

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): scaffold ASCII renderer with config + SVG barrel distortion"
```

---

### Task 2: Noise/Bayer Textures + ASCII GLSL Shader + Three.js Renderer

**Files:**
- Modify: `assets/japanjunky-crt-shader.js`

This task adds the core ASCII rendering: noise texture generation, Bayer dither texture, GLSL shaders, Three.js WebGL setup, and basic animation loop. After this task, the ASCII character grid is visible on screen (no bloom yet).

- [ ] **Step 1: Add noise texture generator**

Insert above `initRenderer`:

```js
  // ─── Noise Texture Generator ─────────────────────────────────
  function generateNoiseTexture(size) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;

    // Value noise with bilinear interpolation for smooth organic look
    var grid = 16;
    var base = [];
    var i, x, y, fx, fy, ix, iy, fracX, fracY, a, b, c, d, v, idx;
    for (i = 0; i < grid * grid; i++) base.push(Math.random());

    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        fx = (x / size) * grid;
        fy = (y / size) * grid;
        ix = Math.floor(fx) % grid;
        iy = Math.floor(fy) % grid;
        fracX = fx - Math.floor(fx);
        fracY = fy - Math.floor(fy);

        a = base[iy * grid + ix];
        b = base[iy * grid + (ix + 1) % grid];
        c = base[((iy + 1) % grid) * grid + ix];
        d = base[((iy + 1) % grid) * grid + (ix + 1) % grid];

        v = a * (1 - fracX) * (1 - fracY) + b * fracX * (1 - fracY) +
            c * (1 - fracX) * fracY + d * fracX * fracY;

        idx = (y * size + x) * 4;
        var byte = Math.floor(v * 255);
        data[idx] = byte;
        data[idx + 1] = byte;
        data[idx + 2] = byte;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
```

- [ ] **Step 2: Add Bayer dither texture generator**

Insert below `generateNoiseTexture`:

```js
  // ─── Bayer 4×4 Dither Texture ────────────────────────────────
  function generateBayerTexture() {
    // Bayer 4×4 ordered dither matrix, values 0-15 mapped to 0-255
    var matrix = [
       0, 128,  32, 160,
     192,  64, 224,  96,
      48, 176,  16, 144,
     240, 112, 208,  80
    ];
    var rgba = new Uint8Array(16 * 4);
    for (var i = 0; i < 16; i++) {
      rgba[i * 4]     = matrix[i];
      rgba[i * 4 + 1] = matrix[i];
      rgba[i * 4 + 2] = matrix[i];
      rgba[i * 4 + 3] = 255;
    }
    var tex = new THREE.DataTexture(rgba, 4, 4, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }
```

- [ ] **Step 3: Add the vertex shader string**

Insert below the Bayer function:

```js
  // ─── GLSL Shaders ────────────────────────────────────────────
  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 4: Add the ASCII fragment shader string**

Insert below `VERT`:

```js
  var ASCII_FRAG = [
    'precision highp float;',
    '',
    'varying vec2 vUv;',
    '',
    'uniform float uTime;',
    'uniform vec2  uResolution;',
    'uniform sampler2D uNoise;',
    'uniform sampler2D uBayer;',
    'uniform float uDisplayScale;',
    'uniform float uGlyphLevels;',
    'uniform float uDitherStrength;',
    'uniform float uNoiseScale;',
    'uniform float uNoiseSpeed;',
    'uniform float uBaseBrightness;',
    'uniform vec3  uTintColor;',
    '',
    '/* Tile dimensions — VGA text mode proportions */',
    'const float TILE_W = 8.0;',
    'const float TILE_H = 16.0;',
    '',
    '/* Procedural glyph pattern — returns alpha for brightness level at sub-cell pos */',
    'float getGlyph(float level, vec2 sc) {',
    '  if (level < 0.5) return 0.0;',                           // space
    '  if (level > 4.5) return 1.0;',                            // full block
    '  vec2 p = floor(sc * vec2(TILE_W, TILE_H));',
    '  if (level < 1.5) {',                                      // middle dot
    '    return (p.x >= 3.0 && p.x <= 4.0 && p.y >= 7.0 && p.y <= 8.0) ? 1.0 : 0.0;',
    '  }',
    '  if (level < 2.5) {',                                      // light shade ░ — 25%
    '    return (mod(p.x, 2.0) < 1.0 && mod(p.y, 4.0) < 1.0) ? 1.0 : 0.0;',
    '  }',
    '  if (level < 3.5) {',                                      // medium shade ▒ — 50%
    '    return mod(p.x + p.y, 2.0) < 1.0 ? 1.0 : 0.0;',
    '  }',
    '  return (mod(p.x, 2.0) < 1.0 || mod(p.y, 4.0) >= 1.0) ? 1.0 : 0.0;', // dark shade ▓ — 75%
    '}',
    '',
    'void main() {',
    '  float cellW = TILE_W * uDisplayScale;',
    '  float cellH = TILE_H * uDisplayScale;',
    '',
    '  vec2 px = vUv * uResolution;',
    '  vec2 cell = floor(px / vec2(cellW, cellH));',
    '  vec2 cellCount = floor(uResolution / vec2(cellW, cellH));',
    '  vec2 subCell = fract(px / vec2(cellW, cellH));',
    '  vec2 cellCenterUV = (cell + 0.5) / cellCount;',
    '',
    '  /* Sample noise source with time-based scroll */',
    '  vec2 noiseUV = cellCenterUV * uNoiseScale + vec2(uTime * uNoiseSpeed, uTime * uNoiseSpeed * 0.7);',
    '  float srcLum = texture2D(uNoise, noiseUV).r * uBaseBrightness;',
    '',
    '  /* Bayer dither */',
    '  vec2 bayerUV = (mod(cell, 4.0) + 0.5) / 4.0;',
    '  float dither = texture2D(uBayer, bayerUV).r - 0.5;',
    '  float ditheredLum = clamp(srcLum + dither * uDitherStrength * 0.15, 0.0, 1.0);',
    '',
    '  /* Map luminance to glyph level */',
    '  float level = floor(ditheredLum * uGlyphLevels);',
    '  level = min(level, uGlyphLevels - 1.0);',
    '',
    '  /* Get glyph alpha and output */',
    '  float alpha = getGlyph(level, subCell);',
    '  vec3 color = alpha * ditheredLum * uTintColor * 2.5;',
    '',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 5: Replace the `initRenderer` stub with the full Three.js setup**

Replace the stub `initRenderer` function with:

```js
  // ─── Three.js ASCII Renderer ─────────────────────────────────
  function initRenderer(cfg) {
    if (typeof THREE === 'undefined') return;

    var canvas = document.getElementById('jj-crt-shader-canvas');
    if (!canvas) return;

    var reducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Resolve tint color from colorMode
    var tint;
    switch (cfg.colorMode) {
      case 'green': tint = [0.2, 1.0, 0.3]; break;
      case 'amber': tint = [1.0, 0.7, 0.0]; break;
      case 'cyan':  tint = [0.3, 0.8, 1.0]; break;
      case 'red':   tint = [1.0, 0.2, 0.15]; break;
      default:      tint = [cfg.tintR, cfg.tintG, cfg.tintB];
    }

    // Renderer
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: false,
        antialias: false,
        premultipliedAlpha: false
      });
    } catch (e) { return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 1);

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var scene = new THREE.Scene();

    // Textures
    var noiseCanvas = generateNoiseTexture(128);
    var noiseTex = new THREE.CanvasTexture(noiseCanvas);
    noiseTex.wrapS = THREE.RepeatWrapping;
    noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearFilter;

    var bayerTex = generateBayerTexture();

    // ASCII material
    var asciiUniforms = {
      uTime:            { value: 0.0 },
      uResolution:      { value: new THREE.Vector2(w * dpr, h * dpr) },
      uNoise:           { value: noiseTex },
      uBayer:           { value: bayerTex },
      uDisplayScale:    { value: cfg.displayScale },
      uGlyphLevels:     { value: cfg.glyphLevels },
      uDitherStrength:  { value: cfg.ditherStrength },
      uNoiseScale:      { value: cfg.noiseScale },
      uNoiseSpeed:      { value: cfg.noiseSpeed },
      uBaseBrightness:  { value: cfg.baseBrightness },
      uTintColor:       { value: new THREE.Vector3(tint[0], tint[1], tint[2]) }
    };

    var asciiMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: ASCII_FRAG,
      uniforms: asciiUniforms,
      depthTest: false,
      depthWrite: false
    });

    var geometry = new THREE.PlaneGeometry(2, 2);
    var quad = new THREE.Mesh(geometry, asciiMaterial);
    scene.add(quad);

    // Animation loop
    var startTime = performance.now();
    var running = true;

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      asciiUniforms.uTime.value = (performance.now() - startTime) / 1000.0;
      renderer.render(scene, camera);
    }

    // Resize handler
    function onResize() {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      asciiUniforms.uResolution.value.set(w * dpr, h * dpr);
    }
    window.addEventListener('resize', onResize);

    // Visibility change — pause when tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        startTime = performance.now() - asciiUniforms.uTime.value * 1000.0;
        animate();
      }
    });

    // Reduced motion: render one frame then stop
    if (reducedMotion) {
      asciiUniforms.uTime.value = 0;
      renderer.render(scene, camera);
    } else {
      animate();
    }

    // Public API
    window.JJ_CRT_SHADER = {
      uniforms: asciiUniforms,
      renderer: renderer,
      pause: function () { running = false; },
      resume: function () { running = true; animate(); }
    };
  }
```

- [ ] **Step 6: Verify ASCII grid renders**

Open the theme in a browser. You should see:
- A black background filled with an ASCII character grid
- Characters should be dim green (default tint) with varying brightness from the noise source
- Characters should be block-element patterns (dots, ░, ▒, ▓, █)
- The grid should scroll subtly over time
- Barrel distortion should curve the edges
- No bloom glow yet (characters are flat-lit)

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): ASCII character-grid shader with procedural noise source"
```

---

### Task 3: Multi-Pass Bloom Post-Processing

**Files:**
- Modify: `assets/japanjunky-crt-shader.js`

This task adds the phosphor bloom glow: threshold extraction, two-pass Gaussian blur, and additive composite. Uses Three.js WebGLRenderTarget for multi-pass rendering (no external EffectComposer dependency).

- [ ] **Step 1: Add the threshold fragment shader**

Insert below `ASCII_FRAG`:

```js
  var THRESHOLD_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform float uThreshold;',
    '',
    'void main() {',
    '  vec4 color = texture2D(tDiffuse, vUv);',
    '  float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));',
    '  float contrib = max(0.0, brightness - uThreshold);',
    '  gl_FragColor = vec4(color.rgb * contrib / max(brightness, 0.001), 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add the Gaussian blur fragment shader**

Insert below `THRESHOLD_FRAG`:

```js
  var BLUR_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uDirection;',
    'uniform vec2 uResolution;',
    '',
    'void main() {',
    '  vec2 texel = uDirection / uResolution;',
    '  vec3 result = texture2D(tDiffuse, vUv).rgb * 0.227027;',
    '',
    '  vec2 o1 = texel * 1.0;',
    '  vec2 o2 = texel * 2.0;',
    '  vec2 o3 = texel * 3.0;',
    '  vec2 o4 = texel * 4.0;',
    '',
    '  result += (texture2D(tDiffuse, vUv + o1).rgb + texture2D(tDiffuse, vUv - o1).rgb) * 0.1945946;',
    '  result += (texture2D(tDiffuse, vUv + o2).rgb + texture2D(tDiffuse, vUv - o2).rgb) * 0.1216216;',
    '  result += (texture2D(tDiffuse, vUv + o3).rgb + texture2D(tDiffuse, vUv - o3).rgb) * 0.054054;',
    '  result += (texture2D(tDiffuse, vUv + o4).rgb + texture2D(tDiffuse, vUv - o4).rgb) * 0.016216;',
    '',
    '  gl_FragColor = vec4(result, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 3: Add the composite fragment shader**

Insert below `BLUR_FRAG`:

```js
  var COMPOSITE_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tBase;',
    'uniform sampler2D tBloom;',
    'uniform float uBloomStrength;',
    '',
    'void main() {',
    '  vec3 base = texture2D(tBase, vUv).rgb;',
    '  vec3 bloom = texture2D(tBloom, vUv).rgb;',
    '  gl_FragColor = vec4(base + bloom * uBloomStrength, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 4: Add render target creation helper**

Insert below the composite shader:

```js
  // ─── Render Target Helper ────────────────────────────────────
  function createRT(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
  }
```

- [ ] **Step 5: Update `initRenderer` to add bloom pipeline**

Replace the renderer setup, animation loop, and resize handler sections inside `initRenderer` with the version below. The key changes are: (a) render targets for multi-pass, (b) additional shader materials, (c) 5-pass render loop.

Replace the full `initRenderer` function body from `// Renderer` through the end with:

```js
    // Renderer
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: false,
        antialias: false,
        premultipliedAlpha: false
      });
    } catch (e) { return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setPixelRatio(1); // we manage resolution manually via render targets
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var scene = new THREE.Scene();

    // Textures
    var noiseCanvas = generateNoiseTexture(128);
    var noiseTex = new THREE.CanvasTexture(noiseCanvas);
    noiseTex.wrapS = THREE.RepeatWrapping;
    noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearFilter;

    var bayerTex = generateBayerTexture();

    // Render targets
    var fullW = Math.floor(w * dpr);
    var fullH = Math.floor(h * dpr);
    var bloomW = Math.max(1, Math.floor(fullW / 2));
    var bloomH = Math.max(1, Math.floor(fullH / 2));

    var rtMain = createRT(fullW, fullH);
    var rtBloomA = createRT(bloomW, bloomH);
    var rtBloomB = createRT(bloomW, bloomH);

    // Shared geometry and quad
    var geometry = new THREE.PlaneGeometry(2, 2);
    var quad = new THREE.Mesh(geometry);
    scene.add(quad);

    // ASCII material
    var asciiUniforms = {
      uTime:            { value: 0.0 },
      uResolution:      { value: new THREE.Vector2(fullW, fullH) },
      uNoise:           { value: noiseTex },
      uBayer:           { value: bayerTex },
      uDisplayScale:    { value: cfg.displayScale },
      uGlyphLevels:     { value: cfg.glyphLevels },
      uDitherStrength:  { value: cfg.ditherStrength },
      uNoiseScale:      { value: cfg.noiseScale },
      uNoiseSpeed:      { value: cfg.noiseSpeed },
      uBaseBrightness:  { value: cfg.baseBrightness },
      uTintColor:       { value: new THREE.Vector3(tint[0], tint[1], tint[2]) }
    };

    var asciiMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: ASCII_FRAG,
      uniforms: asciiUniforms,
      depthTest: false,
      depthWrite: false
    });

    // Threshold material
    var thresholdMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: THRESHOLD_FRAG,
      uniforms: {
        tDiffuse:    { value: null },
        uThreshold:  { value: cfg.bloomThreshold }
      },
      depthTest: false,
      depthWrite: false
    });

    // Blur material
    var blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse:     { value: null },
        uDirection:   { value: new THREE.Vector2(1, 0) },
        uResolution:  { value: new THREE.Vector2(bloomW, bloomH) }
      },
      depthTest: false,
      depthWrite: false
    });

    // Composite material
    var compositeMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tBase:          { value: null },
        tBloom:         { value: null },
        uBloomStrength: { value: cfg.bloomStrength }
      },
      depthTest: false,
      depthWrite: false
    });

    // Animation loop — 5-pass bloom pipeline
    var startTime = performance.now();
    var running = true;

    function renderFrame() {
      var time = (performance.now() - startTime) / 1000.0;
      asciiUniforms.uTime.value = time;

      // Pass 1: ASCII → rtMain (full res)
      quad.material = asciiMat;
      renderer.setRenderTarget(rtMain);
      renderer.clear();
      renderer.render(scene, camera);

      // Pass 2: threshold → rtBloomA (half res)
      thresholdMat.uniforms.tDiffuse.value = rtMain.texture;
      quad.material = thresholdMat;
      renderer.setRenderTarget(rtBloomA);
      renderer.clear();
      renderer.render(scene, camera);

      // Pass 3: horizontal blur → rtBloomB
      blurMat.uniforms.tDiffuse.value = rtBloomA.texture;
      blurMat.uniforms.uDirection.value.set(cfg.bloomRadius, 0);
      quad.material = blurMat;
      renderer.setRenderTarget(rtBloomB);
      renderer.clear();
      renderer.render(scene, camera);

      // Pass 4: vertical blur → rtBloomA
      blurMat.uniforms.tDiffuse.value = rtBloomB.texture;
      blurMat.uniforms.uDirection.value.set(0, cfg.bloomRadius);
      renderer.setRenderTarget(rtBloomA);
      renderer.clear();
      renderer.render(scene, camera);

      // Pass 5: composite → screen
      compositeMat.uniforms.tBase.value = rtMain.texture;
      compositeMat.uniforms.tBloom.value = rtBloomA.texture;
      quad.material = compositeMat;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, camera);
    }

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      renderFrame();
    }

    // Resize handler
    function onResize() {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      fullW = Math.floor(w * dpr);
      fullH = Math.floor(h * dpr);
      bloomW = Math.max(1, Math.floor(fullW / 2));
      bloomH = Math.max(1, Math.floor(fullH / 2));

      renderer.setSize(w, h, false);
      asciiUniforms.uResolution.value.set(fullW, fullH);

      rtMain.setSize(fullW, fullH);
      rtBloomA.setSize(bloomW, bloomH);
      rtBloomB.setSize(bloomW, bloomH);
      blurMat.uniforms.uResolution.value.set(bloomW, bloomH);
    }
    window.addEventListener('resize', onResize);

    // Visibility change — pause when tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        startTime = performance.now() - asciiUniforms.uTime.value * 1000.0;
        animate();
      }
    });

    // Reduced motion: render one frame then stop
    if (reducedMotion) {
      asciiUniforms.uTime.value = 0;
      renderFrame();
    } else {
      animate();
    }

    // Public API
    window.JJ_CRT_SHADER = {
      uniforms: asciiUniforms,
      renderer: renderer,
      pause: function () { running = false; },
      resume: function () { running = true; animate(); }
    };
```

- [ ] **Step 6: Verify bloom glow**

Open the theme in a browser. You should see:
- ASCII character grid with a soft phosphor glow around bright characters
- The bloom should make lit characters bleed green (or configured tint) light into dark areas
- Adjusting `bloomStrength` in the config should make the glow stronger/weaker
- The overall look should resemble CRT phosphor persistence

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): multi-pass bloom for ASCII phosphor glow"
```

---

### Task 4: CSS Updates + Theme.liquid + Final Integration

**Files:**
- Modify: `assets/japanjunky-crt.css` (lines 426-451)
- Modify: `layout/theme.liquid` (lines 263-267)

This task updates CSS rules for the new ASCII renderer (canvas z-index, exempt element positioning) and updates theme.liquid (config variable name, canvas inline style).

- [ ] **Step 1: Update CSS shader-active rules**

In `assets/japanjunky-crt.css`, replace lines 426-451 (the `THREE.JS CRT SHADER ACTIVE` section) with:

```css
/* ===== ASCII CRT RENDERER ACTIVE ===== */
/* When the ASCII character-grid renderer is running, disable CSS CRT
   layers (replaced by the shader). Barrel border (body::after) stays
   for tube edge effect. Glow utilities and animations remain active. */

/* Canvas positioning — behind exempt UI, above page content */
#jj-crt-shader-canvas {
  z-index: -1;
  pointer-events: none;
}
.jj-crt-shader-active #jj-crt-shader-canvas {
  z-index: 100;
}

/* Hide CSS CRT overlay layers (replaced by ASCII shader) */
.jj-crt-shader-active .jj-crt-overlay::before,
.jj-crt-shader-active .jj-crt-overlay::after,
.jj-crt-shader-active .jj-crt-frame::before,
.jj-crt-shader-active .jj-crt-frame::after,
.jj-crt-shader-active .jj-body::before {
  display: none !important;
}
/* body::after (barrel border) intentionally NOT hidden — tube edge effect */

/* Exempt elements — positioned above the ASCII canvas */
.jj-crt-shader-active .jj-ring {
  position: relative;
  z-index: 200;
}
.jj-crt-shader-active .jj-product-zone {
  position: relative;
  z-index: 200;
}
.jj-crt-shader-active #jj-tsuno-bubble {
  z-index: 200;
}

/* SVG barrel distortion on root element */
html.jj-crt-shader-active {
  filter: url(#jj-crt-barrel);
}

@media (prefers-contrast: more) {
  html.jj-crt-shader-active {
    filter: none;
  }
  #jj-crt-shader-canvas {
    display: none;
  }
}
```

- [ ] **Step 2: Update theme.liquid canvas inline style**

In `layout/theme.liquid`, replace lines 263-267:

```html
{%- comment -%} CRT Shader: Three.js ASCII renderer canvas {%- endcomment -%}
<canvas id="jj-crt-shader-canvas" aria-hidden="true" role="presentation" style="
  position:fixed;inset:0;width:100%;height:100%;
"></canvas>
```

The change: removed `z-index:10002;pointer-events:none;` from inline styles (now managed by CSS).

- [ ] **Step 3: Update theme.liquid config variable name**

No change needed — the script reads `window.JJ_ASCII_CRT_CONFIG` which doesn't exist in the current theme.liquid. The existing `JJ_CRT_SHADER_CONFIG` block (if present from the old implementation) can be removed or left as-is (ignored). If the user wants to add config overrides, they add a `<script>` block setting `window.JJ_ASCII_CRT_CONFIG = { ... }` before the CRT shader script tag.

- [ ] **Step 4: Verify end-to-end**

Open the theme in a browser and verify:

1. **ASCII grid visible**: Full-viewport ASCII character grid with green phosphor tint
2. **Bloom glow**: Bright characters have soft glow bleed
3. **Barrel distortion**: Viewport edges curve inward
4. **Tube border**: Dark frame with inset shadow visible around edges
5. **Taskbar**: Win95 taskbar visible and clickable above the ASCII canvas
6. **Start menu**: Opens and is interactive
7. **Ring carousel**: Search bar and filter buttons visible and interactive
8. **Product viewer**: Three.js canvas renders normally (not ASCII-ified)
9. **Product info**: Text readable, buttons clickable
10. **Screensaver**: Renders in its own canvas (not affected)
11. **Resize**: ASCII grid recomputes on window resize
12. **Tab switching**: Animation pauses when tab hidden, resumes on focus
13. **High contrast**: ASCII renderer disabled when `prefers-contrast: more`
14. **Reduced motion**: Single frame rendered, no animation

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-crt.css layout/theme.liquid
git commit -m "feat(crt): CSS + theme.liquid updates for ASCII renderer"
```

---

## Complete File Reference

After all 4 tasks, `assets/japanjunky-crt-shader.js` should be structured as:

```
(function () {
  'use strict';

  // ─── Default Configuration ─────────────────────
  var defaults = { ... };
  function mergeConfig() { ... }

  // ─── Displacement Map Generator ────────────────
  function generateDisplacementMap(size, strength) { ... }

  // ─── SVG Barrel Distortion Filter ──────────────
  function initBarrelDistortion(cfg) { ... }

  // ─── Noise Texture Generator ───────────────────
  function generateNoiseTexture(size) { ... }

  // ─── Bayer 4×4 Dither Texture ──────────────────
  function generateBayerTexture() { ... }

  // ─── GLSL Shaders ─────────────────────────────
  var VERT = ...;
  var ASCII_FRAG = ...;
  var THRESHOLD_FRAG = ...;
  var BLUR_FRAG = ...;
  var COMPOSITE_FRAG = ...;

  // ─── Render Target Helper ─────────────────────
  function createRT(width, height) { ... }

  // ─── Exempt Element Tagging ───────────────────
  var EXEMPT_SELECTORS = [...];
  function tagExemptElements() { ... }

  // ─── Three.js ASCII Renderer ──────────────────
  function initRenderer(cfg) { ... }

  // ─── Init ─────────────────────────────────────
  function init() { ... }

  // ─── Bootstrap ────────────────────────────────
  if (document.readyState === 'loading') { ... } else { ... }

})();
```
