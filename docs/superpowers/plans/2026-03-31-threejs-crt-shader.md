# Three.js CRT Shader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-only CRT overlay with a hybrid SVG barrel distortion + Three.js shader overlay that produces clearly visible, GPU-accelerated CRT effects on all page content.

**Architecture:** Two-layer system. Layer 1: inline SVG `<feDisplacementMap>` filter applied to the page content wrapper for real barrel distortion of DOM elements. Layer 2: Three.js fullscreen canvas overlay with a fragment shader implementing scanlines, aperture grille, chromatic aberration, bloom, vignette, beam scanning, and flicker. CSS fallback preserved for reduced-motion/no-WebGL.

**Tech Stack:** Three.js (already loaded as `three.min.js`), WebGL2, GLSL ES 3.00, SVG filters, vanilla JS (IIFE pattern matching existing codebase)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `assets/japanjunky-crt-shader.js` | Create | SVG displacement map generation, Three.js renderer setup, shader uniforms, animation loop, lifecycle management |
| `assets/japanjunky-crt.css` | Modify | Add `.jj-crt-shader-active` rules to hide CSS overlays when shader is active; add `#jj-crt-content` filter styles |
| `layout/theme.liquid` | Modify | Add `#jj-crt-content` wrapper div, CRT shader canvas, SVG filter element, script config block, script tag |

---

### Task 1: SVG Barrel Distortion — Displacement Map Generator + Filter

**Files:**
- Create: `assets/japanjunky-crt-shader.js`

This task builds the barrel distortion displacement map and injects the SVG filter. The Three.js overlay comes in Task 2.

- [ ] **Step 1: Create `japanjunky-crt-shader.js` with the displacement map generator and SVG filter injection**

```js
/**
 * JapanJunky CRT Shader — Three.js post-processing overlay + SVG barrel distortion
 *
 * Two-layer CRT simulation:
 *   Layer 1: SVG <feDisplacementMap> barrel-distorts all DOM content
 *   Layer 2: Three.js fullscreen quad shader (scanlines, grille, bloom, etc.)
 *
 * Depends on: THREE (global), set by theme.liquid
 */
(function () {
  'use strict';

  /* ── Configuration (overridable via window.JJ_CRT_SHADER_CONFIG) ── */
  var defaults = {
    barrelStrength: 0.12,
    barrelScale: 28,
    displacementSize: 256,
    scanlineIntensity: 0.15,
    scanlinePeriod: 3.0,
    grilleIntensity: 0.12,
    grillePitch: 3.2,
    chromaticAberration: 1.5,
    bloomIntensity: 0.08,
    bloomRadius: 4.0,
    vignetteStart: 0.4,
    vignetteEnd: 1.0,
    vignetteIntensity: 0.45,
    overlayBarrel: 0.03,
    beamScan: false,
    beamWidth: 8.0,
    flickerIntensity: 0.02,
    warmth: 0.02,
    damperWireOpacity: 0.14
  };

  function mergeConfig() {
    var user = window.JJ_CRT_SHADER_CONFIG || {};
    var cfg = {};
    for (var k in defaults) {
      cfg[k] = user.hasOwnProperty(k) ? user[k] : defaults[k];
    }
    return cfg;
  }

  /* ── SVG Barrel Distortion ─────────────────────────────────────── */

  /**
   * Generate a barrel distortion displacement map on a canvas.
   * R channel = horizontal displacement, G channel = vertical displacement.
   * 128 = no displacement.
   */
  function generateDisplacementMap(size, strength) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;
    var half = size / 2;
    var maxR2 = 2.0; // max possible r² at corners (1² + 1²)

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        // Normalize to [-1, 1]
        var nx = (x / (size - 1)) * 2 - 1;
        var ny = (y / (size - 1)) * 2 - 1;

        // Squared distance from center
        var r2 = nx * nx + ny * ny;

        // Barrel distortion displacement
        var dx = nx * strength * r2;
        var dy = ny * strength * r2;

        // Max displacement for encoding range
        var maxDisp = strength * maxR2;

        // Encode to 0-255 (128 = no displacement)
        var idx = (y * size + x) * 4;
        data[idx]     = Math.max(0, Math.min(255, Math.round(128 + (dx / maxDisp) * 127))); // R
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + (dy / maxDisp) * 127))); // G
        data[idx + 2] = 128; // B unused
        data[idx + 3] = 255; // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /**
   * Inject the inline SVG filter into the DOM and apply to #jj-crt-content.
   */
  function initBarrelDistortion(cfg) {
    var dataUrl = generateDisplacementMap(cfg.displacementSize, cfg.barrelStrength);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    var defs = document.createElementNS(svgNS, 'defs');
    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', 'jj-crt-barrel');
    // filterUnits=objectBoundingBox so it scales with the element
    filter.setAttribute('x', '-5%');
    filter.setAttribute('y', '-5%');
    filter.setAttribute('width', '110%');
    filter.setAttribute('height', '110%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    // Load displacement map as filter image
    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttribute('result', 'displacement');
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
    feImage.setAttribute('preserveAspectRatio', 'none');

    // Apply displacement
    var feDisplacement = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisplacement.setAttribute('in', 'SourceGraphic');
    feDisplacement.setAttribute('in2', 'displacement');
    feDisplacement.setAttribute('scale', String(cfg.barrelScale));
    feDisplacement.setAttribute('xChannelSelector', 'R');
    feDisplacement.setAttribute('yChannelSelector', 'G');

    filter.appendChild(feImage);
    filter.appendChild(feDisplacement);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  /* ── Three.js CRT Overlay (placeholder — Task 2) ──────────────── */

  function initShaderOverlay(cfg) {
    // Implemented in Task 2
  }

  /* ── Entry Point ───────────────────────────────────────────────── */

  function init() {
    // Accessibility: high-contrast → no CRT effects
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) return;

    var cfg = mergeConfig();

    // Layer 1: SVG barrel distortion
    initBarrelDistortion(cfg);

    // Mark body so CSS knows shader is active
    document.body.classList.add('jj-crt-shader-active');
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): add SVG barrel distortion displacement map generator"
```

---

### Task 2: Three.js Fullscreen CRT Shader Overlay

**Files:**
- Modify: `assets/japanjunky-crt-shader.js`

Replace the `initShaderOverlay` placeholder with the full Three.js setup and GLSL fragment shader.

- [ ] **Step 1: Add the vertex and fragment shader strings and Three.js renderer setup**

Replace the `initShaderOverlay` placeholder function with the full implementation. Insert these before the `/* ── Entry Point ──` comment:

```js
  /* ── GLSL Shaders ──────────────────────────────────────────────── */

  var CRT_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var CRT_FRAG = [
    'precision highp float;',
    '',
    'varying vec2 vUv;',
    '',
    'uniform float uTime;',
    'uniform vec2  uResolution;',
    'uniform float uScanlineIntensity;',
    'uniform float uScanlinePeriod;',
    'uniform float uGrilleIntensity;',
    'uniform float uGrillePitch;',
    'uniform float uChromaticAberration;',
    'uniform float uBloomIntensity;',
    'uniform float uBloomRadius;',
    'uniform float uVignetteStart;',
    'uniform float uVignetteEnd;',
    'uniform float uVignetteIntensity;',
    'uniform float uBarrelDistortion;',
    'uniform bool  uBeamScan;',
    'uniform float uBeamWidth;',
    'uniform float uFlickerIntensity;',
    'uniform float uWarmth;',
    'uniform float uDamperWireOpacity;',
    '',
    '/* Barrel distortion for overlay UVs */',
    'vec2 barrelUV(vec2 uv, float k) {',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c, c);',
    '  vec2 warped = c * (1.0 + k * r2);',
    '  return warped + 0.5;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 px = uv * uResolution;',
    '',
    '  /* Apply barrel distortion to overlay coordinates */',
    '  vec2 bUv = barrelUV(uv, uBarrelDistortion);',
    '  vec2 bPx = bUv * uResolution;',
    '',
    '  /* ── Scanlines (Gaussian profile) ─────────────────────── */',
    '  float scanY = mod(bPx.y, uScanlinePeriod);',
    '  float scanCenter = uScanlinePeriod * 0.5;',
    '  float scanDist = abs(scanY - scanCenter) / scanCenter;',
    '  /* Gaussian: peak darkness at the gap between lines */',
    '  float scanline = 1.0 - uScanlineIntensity * exp(-scanDist * scanDist * 4.0);',
    '',
    '  /* ── Trinitron Aperture Grille (vertical RGB stripes) ── */',
    '  float grilleX = mod(bPx.x, uGrillePitch);',
    '  float grillePhase = grilleX / uGrillePitch;',
    '  vec3 grille = vec3(1.0);',
    '  /* R stripe: 0.00 - 0.25, G stripe: 0.25 - 0.50, B stripe: 0.50 - 0.75, gap: 0.75 - 1.00 */',
    '  float grilleR = smoothstep(0.0, 0.05, grillePhase) * (1.0 - smoothstep(0.20, 0.25, grillePhase));',
    '  float grilleG = smoothstep(0.25, 0.30, grillePhase) * (1.0 - smoothstep(0.45, 0.50, grillePhase));',
    '  float grilleB = smoothstep(0.50, 0.55, grillePhase) * (1.0 - smoothstep(0.70, 0.75, grillePhase));',
    '  float grilleGap = smoothstep(0.73, 0.75, grillePhase);',
    '  grille.r = mix(1.0, 1.0 + uGrilleIntensity, grilleR);',
    '  grille.g = mix(1.0, 1.0 + uGrilleIntensity, grilleG);',
    '  grille.b = mix(1.0, 1.0 + uGrilleIntensity, grilleB);',
    '  grille *= mix(1.0, 1.0 - uGrilleIntensity * 0.5, grilleGap);',
    '',
    '  /* ── Chromatic Aberration (edge-weighted) ──────────────── */',
    '  vec2 center = bUv - 0.5;',
    '  float caStrength = dot(center, center) * uChromaticAberration;',
    '  vec2 caOffset = center * caStrength / uResolution;',
    '',
    '  /* ── Bloom (simplified single-pass glow) ──────────────── */',
    '  /* Approximate bloom as a soft radial glow from bright center regions */',
    '  float bloomDist = length(center);',
    '  float bloom = uBloomIntensity * exp(-bloomDist * bloomDist * uBloomRadius * uBloomRadius);',
    '',
    '  /* ── Vignette ─────────────────────────────────────────── */',
    '  float vignetteDist = length(center) * 1.414;  /* normalize so corners = 1.0 */',
    '  float vignette = 1.0 - uVignetteIntensity * smoothstep(uVignetteStart, uVignetteEnd, vignetteDist);',
    '',
    '  /* ── Damper Wires (2 horizontal shadows at 1/3 and 2/3) ─ */',
    '  float wire1 = 1.0 - uDamperWireOpacity * (1.0 - smoothstep(0.0, 1.5 / uResolution.y, abs(bUv.y - 0.3333)));',
    '  float wire2 = 1.0 - uDamperWireOpacity * (1.0 - smoothstep(0.0, 1.5 / uResolution.y, abs(bUv.y - 0.6667)));',
    '  float damperWires = wire1 * wire2;',
    '',
    '  /* ── Beam Scanning ────────────────────────────────────── */',
    '  float beamBrightness = 1.0;',
    '  if (uBeamScan) {',
    '    float beamPos = mod(uTime * 60.0, uResolution.y);  /* 60Hz scan */',
    '    float beamDist = abs(bPx.y - beamPos);',
    '    float beamFalloff = uBeamWidth * uScanlinePeriod;',
    '    beamBrightness = 0.85 + 0.15 * exp(-beamDist * beamDist / (beamFalloff * beamFalloff));',
    '  }',
    '',
    '  /* ── Screen Flicker ───────────────────────────────────── */',
    '  float flicker = 1.0 - uFlickerIntensity * sin(uTime * 188.5);  /* ~30Hz */',
    '',
    '  /* ── D65 Warm Tint ────────────────────────────────────── */',
    '  vec3 warmTint = vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.6, 1.0 - uWarmth * 0.4);',
    '',
    '  /* ── Composite ────────────────────────────────────────── */',
    '  /* Base: chromatic aberration produces slight RGB fringing */',
    '  /* We apply fringing as tinted offset regions rather than texture reads */',
    '  /* since we have no underlying texture — content is the DOM beneath us. */',
    '  /* The overlay is transparent black + effects composited via blend modes. */',
    '  float alpha = 0.0;',
    '  vec3 color = vec3(0.0);',
    '',
    '  /* Scanline darkening */',
    '  float scanAlpha = (1.0 - scanline);',
    '',
    '  /* Grille modulation — darken the gaps, tint the stripes */',
    '  vec3 grilleColor = vec3(0.0);',
    '  float grilleAlpha = 0.0;',
    '  /* Gap between phosphor triplets darkens */',
    '  grilleAlpha = (1.0 - min(grille.r, min(grille.g, grille.b)));',
    '  /* Phosphor stripe coloring: tint visible stripes */',
    '  vec3 phosphorTint = vec3(',
    '    grilleR * 0.4,',
    '    grilleG * 0.4,',
    '    grilleB * 0.4',
    '  ) * uGrilleIntensity;',
    '',
    '  /* Chromatic aberration — color fringing at edges */',
    '  /* Offset R and B channels in opposite directions */',
    '  float caR = smoothstep(0.0, 0.003, length(caOffset)) * caStrength * 40.0;',
    '  vec3 caColor = vec3(caR * 0.3, 0.0, caR * 0.3);',
    '  float caAlpha = min(caR * 0.15, 0.08);',
    '',
    '  /* Vignette darkening */',
    '  float vignetteAlpha = (1.0 - vignette);',
    '',
    '  /* Combine all darkening effects */',
    '  float totalDarken = 1.0 - (1.0 - scanAlpha) * (1.0 - grilleAlpha) * (1.0 - vignetteAlpha);',
    '  totalDarken *= damperWires;',
    '  totalDarken *= beamBrightness;',
    '  totalDarken *= flicker;',
    '',
    '  /* Final: dark overlay + additive phosphor/bloom color */',
    '  color = phosphorTint + caColor + vec3(bloom) * warmTint;',
    '  alpha = max(totalDarken, caAlpha);',
    '',
    '  /* Clamp */',
    '  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add the Three.js renderer initialization**

Replace the `initShaderOverlay` placeholder:

```js
  /* ── Three.js CRT Overlay ──────────────────────────────────────── */

  function initShaderOverlay(cfg) {
    if (typeof THREE === 'undefined') return;

    var canvas = document.getElementById('jj-crt-shader-canvas');
    if (!canvas) return;

    // Accessibility: reduced-motion → disable animated effects
    var reducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: false
      });
    } catch (e) {
      return; // WebGL not available
    }

    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var scene = new THREE.Scene();

    var uniforms = {
      uTime:                { value: 0.0 },
      uResolution:          { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uScanlineIntensity:   { value: cfg.scanlineIntensity },
      uScanlinePeriod:      { value: cfg.scanlinePeriod },
      uGrilleIntensity:     { value: cfg.grilleIntensity },
      uGrillePitch:         { value: cfg.grillePitch },
      uChromaticAberration: { value: cfg.chromaticAberration },
      uBloomIntensity:      { value: cfg.bloomIntensity },
      uBloomRadius:         { value: cfg.bloomRadius },
      uVignetteStart:       { value: cfg.vignetteStart },
      uVignetteEnd:         { value: cfg.vignetteEnd },
      uVignetteIntensity:   { value: cfg.vignetteIntensity },
      uBarrelDistortion:    { value: cfg.overlayBarrel },
      uBeamScan:            { value: reducedMotion ? false : cfg.beamScan },
      uBeamWidth:           { value: cfg.beamWidth },
      uFlickerIntensity:    { value: reducedMotion ? 0.0 : cfg.flickerIntensity },
      uWarmth:              { value: cfg.warmth },
      uDamperWireOpacity:   { value: cfg.damperWireOpacity }
    };

    var material = new THREE.ShaderMaterial({
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
      uniforms: uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    var geometry = new THREE.PlaneGeometry(2, 2);
    var mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation loop
    var startTime = performance.now();
    var running = true;

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      uniforms.uTime.value = (performance.now() - startTime) / 1000.0;
      renderer.render(scene, camera);
    }

    // Resize handler
    function onResize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
    }
    window.addEventListener('resize', onResize);

    // Pause when tab is hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        startTime = performance.now() - uniforms.uTime.value * 1000.0;
        animate();
      }
    });

    animate();

    // Expose for debugging / future display mode switching
    window.JJ_CRT_SHADER = {
      uniforms: uniforms,
      renderer: renderer,
      pause: function () { running = false; },
      resume: function () { running = true; animate(); }
    };
  }
```

- [ ] **Step 3: Update the `init()` function to also call `initShaderOverlay`**

Add after `document.body.classList.add('jj-crt-shader-active');`:

```js
    // Layer 2: Three.js shader overlay
    initShaderOverlay(cfg);
```

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): add Three.js fullscreen CRT shader overlay with scanlines, grille, bloom, vignette, chromatic aberration, beam scan"
```

---

### Task 3: Integrate into Theme Layout

**Files:**
- Modify: `layout/theme.liquid:127-142`

Wire up the CRT shader into the Shopify theme: add the content wrapper div, shader canvas, SVG filter placeholder, config block, and script tag.

- [ ] **Step 1: Add `#jj-crt-content` wrapper, shader canvas, and config block to `theme.liquid`**

In `layout/theme.liquid`, make these changes:

**a)** On line 127, wrap `<body>` content in a `#jj-crt-content` div. Replace:
```html
<body class="jj-body">
```
with:
```html
<body class="jj-body">
<div id="jj-crt-content">
```

**b)** Just before the closing `</body>` tag (line 262), close the wrapper and add the shader canvas:
```html
</div><!-- /#jj-crt-content -->

{%- comment -%} CRT Shader: Three.js overlay canvas {%- endcomment -%}
<canvas id="jj-crt-shader-canvas" aria-hidden="true" role="presentation" style="
  position:fixed;inset:0;width:100%;height:100%;
  z-index:10002;pointer-events:none;
"></canvas>
```

**c)** Add the CRT shader config block and script tag. Insert after the existing `<script src="{{ 'japanjunky-holidays.js' | asset_url }}" defer></script>` line (line 258) and before the splash conditional:
```html
  <script src="{{ 'japanjunky-crt-shader.js' | asset_url }}" defer></script>
```

- [ ] **Step 2: Verify the `#jj-crt-content` wrapper encloses all page content but NOT the shader canvas**

The wrapper must contain:
- Splash canvas + enter button + homepage div (if splash enabled)
- Screensaver canvas
- CRT overlay div
- Product zone
- Ring carousel
- Header group
- Main content
- Footer group (taskbar)

The wrapper must NOT contain:
- The CRT shader canvas (`#jj-crt-shader-canvas`) — it sits on top of everything

- [ ] **Step 3: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(crt): integrate Three.js CRT shader into theme layout with content wrapper and canvas"
```

---

### Task 4: CSS Fallback — Hide Old Overlays When Shader Active

**Files:**
- Modify: `assets/japanjunky-crt.css:64-89` and `assets/japanjunky-crt.css:109-176` and `assets/japanjunky-crt.css:185-203`

Add CSS rules to hide the old CSS CRT overlays when the shader is active, and add the SVG filter application to the content wrapper.

- [ ] **Step 1: Add fallback rules at the end of `japanjunky-crt.css`**

Append before the existing `/* ===== HIGH CONTRAST MODE ===== */` section (before line 427):

```css
/* ===== THREE.JS CRT SHADER ACTIVE ===== */
/* When the WebGL shader overlay is running, disable CSS CRT layers
   (they're replaced by the shader). Glow utilities and animations
   remain active — they're element-level, not full-screen overlays. */
.jj-crt-shader-active .jj-crt-overlay::before,
.jj-crt-shader-active .jj-crt-overlay::after,
.jj-crt-shader-active .jj-crt-frame::before,
.jj-crt-shader-active .jj-crt-frame::after,
.jj-crt-shader-active .jj-body::before,
.jj-crt-shader-active .jj-body::after {
  display: none !important;
}

/* SVG barrel distortion on content wrapper */
#jj-crt-content {
  filter: url(#jj-crt-barrel);
}

/* Disable barrel distortion in high contrast or when shader is not active */
@media (prefers-contrast: more) {
  #jj-crt-content {
    filter: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-crt.css
git commit -m "feat(crt): add CSS fallback rules for shader-active state and SVG barrel filter"
```

---

### Task 5: Visual Tuning and Polish

**Files:**
- Modify: `assets/japanjunky-crt-shader.js`

Tune shader parameters for the best visual result. This task adjusts defaults based on how the effects composite over the dark-background site.

- [ ] **Step 1: Tune the default config values**

The initial defaults are conservative. After visual testing, adjust these in the `defaults` object at the top of `japanjunky-crt-shader.js`:

```js
  var defaults = {
    // SVG barrel distortion
    barrelStrength: 0.10,      // reduced slightly — 0.12 may be too strong on wide monitors
    barrelScale: 24,           // pixel displacement at edges
    displacementSize: 256,

    // Scanlines
    scanlineIntensity: 0.12,   // visible but not overpowering on dark bg
    scanlinePeriod: 3.0,       // 3px period at native res

    // Aperture grille
    grilleIntensity: 0.10,     // slightly reduced — site is mostly dark, grille shows more
    grillePitch: 3.2,          // 0.25mm D14H5U pitch

    // Chromatic aberration
    chromaticAberration: 1.2,  // subtle — only visible at screen edges

    // Bloom
    bloomIntensity: 0.06,      // gentle — dark site doesn't need much bloom
    bloomRadius: 3.0,

    // Vignette
    vignetteStart: 0.35,       // start a bit earlier than CSS version
    vignetteEnd: 1.0,
    vignetteIntensity: 0.40,   // slightly less than CSS (0.45) since shader is more precise

    // Overlay barrel
    overlayBarrel: 0.025,      // match the SVG barrel curve

    // Beam scan
    beamScan: false,           // off by default — opt-in
    beamWidth: 6.0,

    // Flicker
    flickerIntensity: 0.015,   // barely perceptible

    // Warmth
    warmth: 0.015,

    // Damper wires
    damperWireOpacity: 0.12
  };
```

- [ ] **Step 2: Add a DPR (device pixel ratio) scaling factor to the shader canvas**

In `initShaderOverlay`, update the renderer size and resize handler to account for high-DPI displays:

Replace the `renderer.setSize` line and `onResize` function:

```js
    var dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    // Resize handler
    function onResize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w * dpr, h * dpr);
    }
```

And update the initial resolution uniform to account for DPR:

```js
      uResolution:          { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "fix(crt): tune shader defaults and add DPR scaling for high-DPI displays"
```

---

### Task 6: Power-On/Off Integration

**Files:**
- Modify: `assets/japanjunky-crt-shader.js`

The existing CSS has `jj-crt-on` and `jj-crt-off` animations. The shader should respond to these: fade the overlay in with a brightness flash on power-on, and vertical collapse + brightness ramp on power-off.

- [ ] **Step 1: Add power-on uniform and animation to the shader**

Add a new uniform to the uniforms object in `initShaderOverlay`:

```js
      uPowerOn:             { value: 0.0 }, // 0.0 = off, 1.0 = fully on
```

Add to the fragment shader, before the `/* ── Composite ──` section:

```glsl
    '  /* ── Power State ──────────────────────────────────────── */',
    '  /* Brightness ramp during power-on (first 0.4s) */',
    '  float powerBright = 1.0;',
    '  if (uTime < 0.4) {',
    '    float t = uTime / 0.4;',
    '    powerBright = mix(3.0, 1.0, smoothstep(0.0, 1.0, t));',
    '  }',
```

And multiply `powerBright` into the final composite:

```glsl
    '  totalDarken *= beamBrightness;',
    '  totalDarken *= flicker;',
    '  totalDarken *= powerBright;',
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-crt-shader.js
git commit -m "feat(crt): add power-on brightness ramp to shader overlay"
```

---

### Task 7: Final Integration Test and Cleanup

**Files:**
- Review: All modified files

- [ ] **Step 1: Verify file loading order in `theme.liquid`**

The script loading order must be:
1. `three.min.js` (line 247, defer) — Three.js library
2. `japanjunky-crt-shader.js` (new, defer) — CRT shader (depends on THREE global)

Both use `defer`, so they execute in document order after parsing. `japanjunky-crt-shader.js` must appear AFTER `three.min.js`.

- [ ] **Step 2: Verify the `#jj-crt-content` wrapper doesn't break existing layout**

Check that:
- `#jj-crt-content` has no unintended styles (it should be unstyled — just a wrapper)
- Fixed-position elements (taskbar, CRT overlay, screensaver) still work correctly
- The SVG filter element is in the DOM but invisible (`width=0, height=0`)

- [ ] **Step 3: Verify CSS fallback works**

Test with the browser's rendering settings:
- Disable JavaScript → CSS CRT overlays should still appear (no `jj-crt-shader-active` class)
- `prefers-contrast: more` → all CRT effects (shader + CSS) should be hidden
- `prefers-reduced-motion: reduce` → beam scan and flicker disabled, static effects remain

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(crt): complete Three.js CRT shader integration with SVG barrel distortion"
```
