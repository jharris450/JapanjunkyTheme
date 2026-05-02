# Splash Portal Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-viewport enchanted mirror splash screen that plays before the homepage, with a churning GLSL shader, faint Tsuno silhouette, and a ~2s "pulled through the mirror" enter transition.

**Architecture:** Separate `japanjunky-splash.js` with its own Three.js renderer and 240p VGA dither pipeline. The screensaver is deferred via `JJ_SPLASH_ACTIVE` flag — it stores its init function instead of self-starting. On transition complete, the splash disposes its renderer, calls `JJ_Portal_Init()`, and reveals the homepage. Session-gated via sessionStorage.

**Tech Stack:** Three.js (existing global), custom GLSL ES1.0 shaders, `JJ_ScreensaverPost.dither` (existing), Shopify Liquid, vanilla JS/CSS

**Spec:** `docs/superpowers/specs/2026-03-26-splash-portal-design.md`

---

### Task 1: Add Shopify Theme Setting + Session Flag

**Files:**
- Modify: `config/settings_schema.json` — add `splash_enabled` checkbox in Screensaver section
- Modify: `layout/theme.liquid:193-214` — add session check + `JJ_SPLASH_ACTIVE` flag + `JJ_SPLASH_CONFIG`

- [ ] **Step 1: Add theme setting**

In `config/settings_schema.json`, find the `"Screensaver"` section and add a splash toggle as the first setting:

```json
{
  "type": "checkbox",
  "id": "splash_enabled",
  "label": "Enable splash screen (once per session)",
  "default": true
}
```

- [ ] **Step 2: Add session flag and splash config in theme.liquid**

In `layout/theme.liquid`, immediately before the `JJ_SCREENSAVER_CONFIG` script block (line 193), add:

```liquid
{% if settings.splash_enabled %}
<script>
  {% if request.page_type == 'index' %}
  try {
    if (!sessionStorage.getItem('jj-entered')) {
      window.JJ_SPLASH_ACTIVE = true;
    }
  } catch (e) {}
  window.JJ_SPLASH_CONFIG = {
    ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }},
    swirlSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
    resolution: {{ settings.screensaver_resolution | default: 240 }},
    fps: {{ settings.screensaver_fps | default: 24 }}
  };
  {% endif %}
</script>
{% endif %}
```

Note: Both `JJ_SPLASH_ACTIVE` and `JJ_SPLASH_CONFIG` are only set on the index page. On other pages, neither flag exists, so the screensaver self-starts normally.

- [ ] **Step 3: Commit**

```bash
git add config/settings_schema.json layout/theme.liquid
git commit -m "feat(splash): add theme setting and session flag"
```

---

### Task 2: Defer Screensaver Initialization

**Files:**
- Modify: `assets/japanjunky-screensaver.js:11-19` — wrap IIFE body in `init()`, conditionally defer
- Modify: `assets/japanjunky-screensaver.js:1940-1949` — adjust init section

The screensaver IIFE currently runs all setup immediately. We need to make it defer when `JJ_SPLASH_ACTIVE` is set.

- [ ] **Step 1: Wrap the IIFE body in a callable init function**

Replace the opening of the IIFE (lines 11-19):

```javascript
// Current:
(function () {
  'use strict';

  var config = window.JJ_SCREENSAVER_CONFIG || {};
  if (config.enabled === false) return;
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('jj-screensaver');
  if (!canvas) return;
```

With:

```javascript
(function () {
  'use strict';

  function init() {
  var config = window.JJ_SCREENSAVER_CONFIG || {};
  if (config.enabled === false) return;
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('jj-screensaver');
  if (!canvas) return;
```

- [ ] **Step 2: Replace the closing init/IIFE section**

Replace the end of the file (lines 1940-1949):

```javascript
// Current:
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

With:

```javascript
  // ─── Init ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }

  } // end init()

  // If splash is active, defer initialization; otherwise start immediately
  if (window.JJ_SPLASH_ACTIVE) {
    window.JJ_Portal_Init = init;
  } else {
    init();
  }
})();
```

- [ ] **Step 3: Verify the screensaver still works without splash**

Load the site with splash disabled (or in a session where `jj-entered` is already set). The screensaver should behave exactly as before — `JJ_SPLASH_ACTIVE` is not set, so `init()` runs immediately.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(splash): defer screensaver init when splash is active"
```

---

### Task 3: Add Splash Canvas + Homepage Wrapper to theme.liquid

**Files:**
- Modify: `layout/theme.liquid:125` — add splash canvas before screensaver canvas
- Modify: `layout/theme.liquid:125-191` — wrap homepage elements in `#jj-homepage` div
- Modify: `layout/theme.liquid:215-227` — add splash script + CSS tags

- [ ] **Step 1: Add splash canvas element**

In `layout/theme.liquid`, immediately before the screensaver canvas (line 125), add:

```liquid
{% if settings.splash_enabled %}
<canvas id="jj-splash" aria-hidden="true" tabindex="-1" style="display:none;"></canvas>
<button id="jj-splash-enter" class="jj-splash-enter" style="display:none;">[ENTER]</button>
{% endif %}
```

- [ ] **Step 2: Wrap homepage elements in conditional div**

Wrap all elements from the screensaver canvas (`<canvas id="jj-screensaver">`, line 125) through the footer-group sections (line 191) in a homepage container:

```liquid
{% if settings.splash_enabled %}
<div id="jj-homepage">
{% endif %}

<canvas id="jj-screensaver" ...></canvas>
... (all existing body content through footer-group) ...
{% sections 'footer-group' %}

{% if settings.splash_enabled %}
</div>
{% endif %}
```

- [ ] **Step 3: Add splash CSS and script tags**

After the existing CSS tags (line 35, after `japanjunky-calendar.css`) add:

```liquid
{% if settings.splash_enabled %}
  {{ 'japanjunky-splash.css' | asset_url | stylesheet_tag }}
{% endif %}
```

After the existing script tags (line 226, after `japanjunky-calendar.js`) add:

```liquid
{% if settings.splash_enabled %}
  <script src="{{ 'japanjunky-splash.js' | asset_url }}" defer></script>
{% endif %}
```

The splash script must load AFTER `three.min.js` and `japanjunky-screensaver-post.js` (it depends on both).

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(splash): add splash DOM elements and script tags"
```

---

### Task 4: Create Splash CSS

**Files:**
- Create: `assets/japanjunky-splash.css`

- [ ] **Step 1: Write the splash stylesheet**

```css
/* ===== SPLASH PORTAL SCREEN ===== */

/* Homepage hidden during splash */
#jj-homepage.jj-splash-active {
  opacity: 0;
  pointer-events: none;
}

#jj-homepage.jj-splash-fadein {
  opacity: 1;
  transition: opacity 0.4s ease-out;
  pointer-events: auto;
}

/* ENTER button */
.jj-splash-enter {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 11;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 14px;
  color: var(--jj-text, #f0e6d2);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--jj-primary, #e8313a);
  padding: 6px 20px;
  cursor: default;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 0 0 6px rgba(232, 49, 58, 0.4);
  box-shadow: 0 0 12px rgba(232, 49, 58, 0.15);
  opacity: 0;
  transition: opacity 1s ease-in;
}

.jj-splash-enter--visible {
  opacity: 1;
}

.jj-splash-enter--fadeout {
  opacity: 0;
  transition: opacity 0.3s ease-out;
  pointer-events: none;
}

.jj-splash-enter:hover {
  border-color: var(--jj-accent, #00d4ff);
  color: var(--jj-accent, #00d4ff);
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
  box-shadow: 0 0 16px rgba(0, 212, 255, 0.2);
}

.jj-splash-enter:focus-visible {
  outline: 1px solid var(--jj-accent, #00d4ff);
  outline-offset: 2px;
}

/* Reduced motion / high contrast: splash hidden entirely */
@media (prefers-reduced-motion: reduce) {
  .jj-splash-enter { display: none !important; }
}

@media (prefers-contrast: more) {
  .jj-splash-enter { display: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-splash.css
git commit -m "feat(splash): add splash screen styles"
```

---

### Task 5: Create Splash JS — Renderer + Dither Pipeline

**Files:**
- Create: `assets/japanjunky-splash.js` (partial — renderer setup only in this task)

This task builds the scaffolding: session check, accessibility check, WebGL renderer, 240p dither pipeline (mirroring the screensaver's approach), and the animation loop shell.

- [ ] **Step 1: Write the renderer scaffolding**

Create `assets/japanjunky-splash.js`:

```javascript
/**
 * JapanJunky Splash Portal — Enchanted Mirror
 *
 * Full-viewport churning mirror surface shown once per session
 * before the homepage. Uses its own WebGL renderer + 240p VGA
 * dither pipeline, then hands off to the screensaver on ENTER.
 *
 * Depends on: THREE (global), JJ_ScreensaverPost (global),
 *             JJ_SPLASH_CONFIG (global, set by theme.liquid)
 */
(function () {
  'use strict';

  // ─── Gate checks ───────────────────────────────────────────
  var config = window.JJ_SPLASH_CONFIG;
  if (!config) return;                          // not on index, or splash disabled
  if (!window.JJ_SPLASH_ACTIVE) return;         // already entered this session
  if (typeof THREE === 'undefined') return;

  // Accessibility: skip splash entirely
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersReducedMotion || prefersHighContrast) {
    skipSplash();
    return;
  }

  // ─── Resolution (matches screensaver) ──────────────────────
  var configRes = parseInt(config.resolution, 10) || 240;
  var resH = configRes;
  var viewportAspect = (window.innerWidth && window.innerHeight)
    ? window.innerWidth / window.innerHeight : 4 / 3;
  var resW = Math.round(resH * viewportAspect);

  // ─── DOM references ────────────────────────────────────────
  var splashCanvas = document.getElementById('jj-splash');
  var enterBtn = document.getElementById('jj-splash-enter');
  var homepageDiv = document.getElementById('jj-homepage');
  if (!splashCanvas || !enterBtn || !homepageDiv) { skipSplash(); return; }

  // Hide homepage during splash
  homepageDiv.classList.add('jj-splash-active');

  // ─── WebGL Renderer ────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: splashCanvas, antialias: false });
  } catch (e) {
    skipSplash();
    return;
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  // ─── Offscreen Render Target ───────────────────────────────
  var renderTarget = new THREE.WebGLRenderTarget(resW, resH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat
  });

  // ─── Display Canvas (2D — visible output) ──────────────────
  var displayCanvas = document.createElement('canvas');
  displayCanvas.width = resW;
  displayCanvas.height = resH;
  var displayCtx = displayCanvas.getContext('2d');
  var displayImageData = displayCtx.createImageData(resW, resH);
  var pixelBuffer = new Uint8Array(resW * resH * 4);

  // Hide WebGL canvas, show display canvas
  splashCanvas.style.display = 'none';

  displayCanvas.id = 'jj-splash-display';
  displayCanvas.setAttribute('aria-hidden', 'true');
  displayCanvas.tabIndex = -1;
  var cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var canvasW = Math.round(window.innerWidth / cssZoom);
  var canvasH = Math.round(window.innerHeight / cssZoom);
  displayCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:' + canvasW + 'px',
    'height:' + canvasH + 'px',
    'z-index:10', 'pointer-events:none',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges'
  ].join(';');
  document.body.insertBefore(displayCanvas, document.body.firstChild);

  // ─── Render one frame ──────────────────────────────────────
  function renderOneFrame() {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    displayCtx.putImageData(displayImageData, 0, 0);
  }

  // ─── Animation Loop ────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;
  var running = true;
  var transitioning = false;
  var transitionStart = 0;

  function animate(time) {
    if (!running) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    var t = time * 0.001;

    // TODO: update shader uniforms (Task 6)
    // TODO: update transition (Task 7)

    renderOneFrame();
  }

  // ─── Skip splash (accessibility, error, or session) ────────
  function skipSplash() {
    delete window.JJ_SPLASH_ACTIVE;
    var hp = document.getElementById('jj-homepage');
    if (hp) {
      hp.classList.remove('jj-splash-active');
      hp.classList.add('jj-splash-fadein');
    }
    var btn = document.getElementById('jj-splash-enter');
    if (btn) btn.style.display = 'none';
    var sc = document.getElementById('jj-splash');
    if (sc) sc.style.display = 'none';
    // Start screensaver immediately
    if (window.JJ_Portal_Init) {
      window.JJ_Portal_Init();
      delete window.JJ_Portal_Init;
    }
  }

  // ─── Start ─────────────────────────────────────────────────
  enterBtn.style.display = '';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }

})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-splash.js
git commit -m "feat(splash): scaffold renderer, dither pipeline, and animation loop"
```

---

### Task 6: Add Mirror Shader + Tsuno Silhouette

**Files:**
- Modify: `assets/japanjunky-splash.js` — add shader definitions, mirror plane mesh, texture loading, uniform updates in animate loop

- [ ] **Step 1: Add the mirror shader and mesh**

In `japanjunky-splash.js`, after the Scene + Camera section and before the Offscreen Render Target section, add:

```javascript
  // ─── Swirl Speed ───────────────────────────────────────────
  var SWIRL_SPEEDS = { slow: 0.3, medium: 0.6, fast: 1.0 };
  var swirlSpeed = SWIRL_SPEEDS[config.swirlSpeed] || SWIRL_SPEEDS.slow;

  // ─── Mirror Shader ─────────────────────────────────────────
  var MIRROR_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var MIRROR_FRAG = [
    'uniform float uTime;',
    'uniform float uSwirlSpeed;',
    'uniform float uTransition;',
    'uniform vec2 uRippleOrigin;',
    'uniform float uRippleTime;',
    'uniform sampler2D uGhostTex;',
    'uniform float uGhostLoaded;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 center = uv - 0.5;',
    '  float dist = length(center);',
    '  float angle = atan(center.y, center.x);',
    '',
    '  // ── Swirl distortion ──',
    '  float swirlAmt = uSwirlSpeed * (1.0 + uTransition * 3.0);',
    '  float twist = angle + uTime * swirlAmt * 0.3 + dist * 3.0;',
    '  float twist2 = angle - uTime * swirlAmt * 0.5 + dist * 5.0;',
    '',
    '  // Displaced UVs for color sampling',
    '  vec2 swirled = vec2(',
    '    cos(twist) * dist + cos(twist2) * dist * 0.3,',
    '    sin(twist) * dist + sin(twist2) * dist * 0.3',
    '  ) + 0.5;',
    '',
    '  // ── Ripple distortion ──',
    '  float rippleAge = uTime - uRippleTime;',
    '  float rippleActive = step(0.0, rippleAge) * (1.0 - smoothstep(0.0, 1.5, rippleAge));',
    '  vec2 rippleDelta = uv - uRippleOrigin;',
    '  float rippleDist = length(rippleDelta);',
    '  float rippleWave = sin(rippleDist * 30.0 - rippleAge * 8.0) * 0.02;',
    '  rippleWave *= rippleActive * (1.0 - smoothstep(0.0, 0.5, rippleDist));',
    '  swirled += normalize(rippleDelta + 0.001) * rippleWave;',
    '',
    '  // ── Auto-ripple from center ──',
    '  float autoRipple = sin(dist * 20.0 - uTime * 2.5) * 0.008;',
    '  autoRipple += sin(dist * 12.0 - uTime * 1.8 + 1.0) * 0.005;',
    '  swirled += normalize(center + 0.001) * autoRipple;',
    '',
    '  // ── Color palette (tunnel-matching) ──',
    '  float pattern = sin(swirled.x * 6.0 + swirled.y * 8.0 + uTime * 0.5) * 0.5 + 0.5;',
    '  float pattern2 = sin(swirled.x * 10.0 - swirled.y * 6.0 + uTime * 0.3) * 0.5 + 0.5;',
    '  float p = pattern * 0.6 + pattern2 * 0.4;',
    '',
    '  vec3 c1 = vec3(0.4, 0.05, 0.02);',    // deep red
    '  vec3 c2 = vec3(0.85, 0.35, 0.05);',   // burnt orange
    '  vec3 c3 = vec3(0.95, 0.75, 0.3);',    // gold
    '  vec3 color = mix(c1, c2, smoothstep(0.0, 0.5, p));',
    '  color = mix(color, c3, smoothstep(0.5, 1.0, p));',
    '',
    '  // ── Surface sheen (Fresnel-like edge glow) ──',
    '  float sheen = smoothstep(0.3, 0.6, dist);',
    '  color += vec3(0.95, 0.75, 0.5) * sheen * 0.15;',
    '',
    '  // ── Tsuno silhouette ──',
    '  if (uGhostLoaded > 0.5) {',
    '    vec2 ghostUV = (swirled - 0.5) * 2.0 + 0.5;',
    '    ghostUV = clamp(ghostUV, 0.0, 1.0);',
    '    vec4 ghostTex = texture2D(uGhostTex, ghostUV);',
    '    float lum = dot(ghostTex.rgb, vec3(0.299, 0.587, 0.114));',
    '    float ghostMask = (1.0 - lum) * 0.1;',
    '    color += vec3(1.0, 0.2, 0.08) * ghostMask * (1.0 - uTransition);',
    '  }',
    '',
    '  // ── Transition: pull-through + vignette ──',
    '  if (uTransition > 0.0) {',
    '    // Radial zoom pull (Phase 2)',
    '    float pullPhase = smoothstep(0.2, 0.75, uTransition);',
    '    color *= 1.0 + pullPhase * 0.5;',
    '',
    '    // Vignette closing to black (Phase 3)',
    '    float vignettePhase = smoothstep(0.5, 1.0, uTransition);',
    '    float vignette = 1.0 - smoothstep(0.0, 0.5 - vignettePhase * 0.5, dist);',
    '    color *= 1.0 - vignette;',
    '  }',
    '',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  // ─── Mirror Mesh ───────────────────────────────────────────
  var mirrorGeo = new THREE.PlaneGeometry(4, 4);
  var mirrorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uSwirlSpeed: { value: swirlSpeed },
      uTransition: { value: 0.0 },
      uRippleOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleTime: { value: -10.0 },
      uGhostTex: { value: null },
      uGhostLoaded: { value: 0.0 }
    },
    vertexShader: MIRROR_VERT,
    fragmentShader: MIRROR_FRAG,
    side: THREE.FrontSide
  });
  var mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorMesh.position.set(0, 0, 0);
  scene.add(mirrorMesh);

  // ─── Ghost Texture (Tsuno) ─────────────────────────────────
  var textureLoader = new THREE.TextureLoader();
  if (config.ghostTexture) {
    textureLoader.load(config.ghostTexture, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      mirrorMat.uniforms.uGhostTex.value = tex;
      mirrorMat.uniforms.uGhostLoaded.value = 1.0;
    });
  }
```

- [ ] **Step 2: Update the animate loop to pass uniforms**

In the `animate` function, replace the TODO comments with:

```javascript
    // Update shader uniforms
    mirrorMat.uniforms.uTime.value = t;

    // Update transition if active
    if (transitioning) {
      updateTransition(t);
    }
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-splash.js
git commit -m "feat(splash): add mirror shader with swirl, ripple, and Tsuno silhouette"
```

---

### Task 7: Add Mouse/Touch Ripple Interaction

**Files:**
- Modify: `assets/japanjunky-splash.js` — add event listeners for mousemove and touch events

- [ ] **Step 1: Add ripple interaction**

In `japanjunky-splash.js`, after the Ghost Texture section and before the Offscreen Render Target section, add:

```javascript
  // ─── Mouse / Touch Ripple ──────────────────────────────────
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  function onRipple(clientX, clientY) {
    // Convert screen coords to 0..1 UV space
    var nx = clientX / window.innerWidth;
    var ny = 1.0 - (clientY / window.innerHeight); // flip Y for GL
    mirrorMat.uniforms.uRippleOrigin.value.set(nx, ny);
    mirrorMat.uniforms.uRippleTime.value = performance.now() * 0.001;
  }

  function onMouseRipple(e) { onRipple(e.clientX, e.clientY); }
  function onTouchRipple(e) {
    if (e.touches.length > 0) {
      onRipple(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  if (!isMobile) {
    window.addEventListener('mousemove', onMouseRipple);
  }
  window.addEventListener('touchstart', onTouchRipple, { passive: true });
  window.addEventListener('touchmove', onTouchRipple, { passive: true });
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-splash.js
git commit -m "feat(splash): add mouse and touch ripple interaction"
```

---

### Task 8: Add ENTER Button + Transition Logic

**Files:**
- Modify: `assets/japanjunky-splash.js` — add button fade-in, click handler, 3-phase transition, cleanup, and homepage reveal

- [ ] **Step 1: Add transition state and update function**

In `japanjunky-splash.js`, after the animation loop section (before the `skipSplash` function), add:

```javascript
  // ─── Transition ────────────────────────────────────────────
  var TRANSITION_DURATION = 2.0; // seconds

  function startTransition() {
    if (transitioning) return;
    transitioning = true;
    transitionStart = performance.now() * 0.001;

    // Phase 1: Ripple burst from center
    mirrorMat.uniforms.uRippleOrigin.value.set(0.5, 0.5);
    mirrorMat.uniforms.uRippleTime.value = transitionStart;

    // Fade out button
    enterBtn.classList.remove('jj-splash-enter--visible');
    enterBtn.classList.add('jj-splash-enter--fadeout');
  }

  function updateTransition(t) {
    var elapsed = t - transitionStart;
    var progress = Math.min(1.0, elapsed / TRANSITION_DURATION);

    mirrorMat.uniforms.uTransition.value = progress;

    // Phase 3 complete — hand off
    if (progress >= 1.0) {
      completeSplash();
    }
  }

  function completeSplash() {
    running = false;

    // Mark session
    try { sessionStorage.setItem('jj-entered', '1'); } catch (e) {}

    // Remove event listeners
    if (!isMobile) window.removeEventListener('mousemove', onMouseRipple);
    window.removeEventListener('touchstart', onTouchRipple);
    window.removeEventListener('touchmove', onTouchRipple);

    // Dispose WebGL resources
    renderTarget.dispose();
    renderer.dispose();
    mirrorGeo.dispose();
    mirrorMat.dispose();

    // Remove splash DOM
    if (displayCanvas.parentNode) displayCanvas.parentNode.removeChild(displayCanvas);
    if (splashCanvas.parentNode) splashCanvas.parentNode.removeChild(splashCanvas);
    if (enterBtn.parentNode) enterBtn.parentNode.removeChild(enterBtn);

    // Null references for GC
    renderer = null;
    renderTarget = null;
    displayCanvas = null;
    displayCtx = null;

    // Clear flag
    delete window.JJ_SPLASH_ACTIVE;

    // Initialize screensaver (now safe — our context is gone)
    if (window.JJ_Portal_Init) {
      window.JJ_Portal_Init();
      delete window.JJ_Portal_Init;
    }

    // Reveal homepage with fade
    homepageDiv.classList.remove('jj-splash-active');
    // Force reflow before adding transition class
    void homepageDiv.offsetHeight;
    homepageDiv.classList.add('jj-splash-fadein');
  }
```

- [ ] **Step 2: Add ENTER button activation and click handler**

In the `Start` section at the bottom of the IIFE, replace the existing content with:

```javascript
  // ─── Start ─────────────────────────────────────────────────
  // Show ENTER button with fade-in after 1 second
  enterBtn.style.display = '';
  setTimeout(function () {
    enterBtn.classList.add('jj-splash-enter--visible');
  }, 1000);

  // Click / keyboard handler
  enterBtn.addEventListener('click', function () {
    startTransition();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-splash.js
git commit -m "feat(splash): add enter transition, cleanup, and homepage handoff"
```

---

### Task 9: Visual Tuning + Integration Test

**Files:**
- Modify: `assets/japanjunky-splash.js` — tune shader constants if needed after visual testing

- [ ] **Step 1: Push all changes and test on live site**

```bash
git push
```

- [ ] **Step 2: Test the full lifecycle**

1. Open the site in an incognito/private window (fresh session)
2. Verify the splash screen appears with the churning mirror effect
3. Move the mouse — verify ripples appear at cursor position
4. Verify the ENTER button fades in after ~1 second
5. Click ENTER — verify the ~2s transition plays (ripple burst → pull → blackout)
6. Verify the homepage appears with the screensaver running normally
7. Refresh the page — verify the splash is SKIPPED (session storage)
8. Open a new incognito window — verify splash appears again

- [ ] **Step 3: Test edge cases**

1. Disable the splash in Shopify theme customizer → verify homepage loads normally
2. Test with keyboard: Tab to ENTER button, press Enter → verify transition works
3. Test on mobile (or DevTools mobile emulation) → verify touch ripples work
4. Set `prefers-reduced-motion: reduce` in DevTools → verify splash is skipped

- [ ] **Step 4: Tune shader values if needed**

Common adjustments:
- Swirl speed: `uTime * swirlAmt * 0.3` — adjust the `0.3` multiplier
- Ripple intensity: `rippleWave` `* 0.02` — increase for stronger ripples
- Tsuno opacity: `ghostMask` `* 0.1` — adjust visibility
- Vignette speed: `smoothstep(0.5, 1.0, uTransition)` — adjust when blackout begins
- Auto-ripple: `sin(dist * 20.0 - uTime * 2.5) * 0.008` — adjust amplitude and frequency

- [ ] **Step 5: Commit any tuning changes**

```bash
git add assets/japanjunky-splash.js
git commit -m "feat(splash): visual tuning after live testing"
```
