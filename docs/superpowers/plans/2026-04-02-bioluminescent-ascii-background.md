# Bioluminescent ASCII Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal vortex screensaver and CRT shader overlay with a reactive bioluminescent particle system rendered as ASCII characters via a WebGL2 GPGPU pipeline.

**Architecture:** Single fullscreen WebGL2 canvas running a 4-stage pipeline: (1) GPU particle physics + 2D fluid field via render-to-texture, (2) instanced particle render to offscreen FBO, (3) ASCII conversion via CP437 font atlas + phosphor palette quantization, (4) bloom post-process. Interaction from cursor, carousel events, and autonomous bubbles inject forces into the fluid field.

**Tech Stack:** Three.js (WebGL2), GLSL shaders, CP437 font atlas PNG

**Spec:** `docs/superpowers/specs/2026-04-02-bioluminescent-ascii-background-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `assets/japanjunky-biolum.js` | Complete bioluminescent ASCII renderer — WebGL2 init, GPGPU particle sim, fluid field, interaction handlers, ASCII shader, bloom, animation loop |
| `assets/cp437-font-atlas.png` | 128×256 PNG, 16×16 grid of CP437 glyphs (8×16 each), white on transparent |

### Modified Files

| File | Changes |
|------|---------|
| `layout/theme.liquid` | Remove old canvases/scripts/configs; add `#jj-biolum` canvas + biolum script tag; remove `japanjunky-crt.css` stylesheet_tag |
| `assets/japanjunky-base.css` | Absorb reusable utilities relocated from `japanjunky-crt.css` |
| `assets/japanjunky-product-viewer.js` | Remove `JJ_SCREENSAVER_CONFIG.resolution` dependency (hardcode 240 default) |
| `assets/japanjunky-tsuno-bubble.js` | Change canvas guard from `#jj-screensaver` to `#jj-biolum` |
| `assets/japanjunky-splash.js` | Remove `JJ_ScreensaverPost.dither()` dependency; change `JJ_Portal_Init` to `JJ_Biolum_Init` |

### Deleted Files

| File |
|------|
| `assets/japanjunky-crt-shader.js` |
| `assets/japanjunky-crt.css` |
| `assets/japanjunky-screensaver.js` |
| `assets/japanjunky-screensaver-post.js` |

---

## Task 1: Relocate CSS Utilities and Delete CRT Files

Move reusable styles from `japanjunky-crt.css` into `japanjunky-base.css`, then delete all CRT/screensaver files.

**Files:**
- Modify: `assets/japanjunky-base.css`
- Delete: `assets/japanjunky-crt.css`
- Delete: `assets/japanjunky-crt-shader.js`
- Delete: `assets/japanjunky-screensaver.js`
- Delete: `assets/japanjunky-screensaver-post.js`

- [ ] **Step 1: Read japanjunky-crt.css and identify all reusable utilities**

The following sections from `japanjunky-crt.css` are reusable and must be preserved:
- Lines 9-34: `:root` variables (spacing scale, phosphor colors, structural grays)
- Lines 36-41: `* { border-radius: 0 !important }` (global no-rounded-corners)
- Lines 205-289: Text glow utilities (`.jj-glow-subtle/medium/strong`, color glows, box glows)
- Lines 281-289: ASCII art color classes (`.ascii-*`)
- Lines 292-297: ASCII art container (`.jj-ascii-art`)
- Lines 299-304: Border utilities (`.jj-border-*`)
- Lines 306-367: CRT animations (`@keyframes jj-crt-on/off`, typing cursor, glow pulse, loading spinner, progress bar)
- Lines 371-384: Phosphor text/status utilities (`.jj-text-*`, `.jj-status-*`)
- Lines 389-406: Image containers + phosphor decay
- Lines 408-424: Reduced motion rules
- Lines 453-471: High contrast overrides

- [ ] **Step 2: Append relocated utilities to japanjunky-base.css**

Add the following after the existing content (line 189) of `japanjunky-base.css`:

```css
/* ============================================
   RELOCATED FROM japanjunky-crt.css
   Phosphor colors, glow utilities, ASCII styles,
   animations, and accessibility overrides.
   ============================================ */

/* --- Spacing Scale (8px grid unit) --- */
:root {
  --jj-zoom: 1;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Extended CRT Phosphor Colors */
  --jj-green:        #33ff33;
  --jj-amber:        #ffaa00;
  --jj-magenta:      #e040e0;
  --jj-cyan:         #00e5e5;
  --jj-white:        #e0e0e0;

  /* Structural Grays */
  --jj-bg-panel:     #0a0a0a;
  --jj-bg-elevated:  #111111;
  --jj-border:       #333333;
  --jj-border-hover: #555555;
  --jj-muted:        #666666;
  --jj-dim:          #444444;
  --jj-subtle:       #1a1a1a;
}

/* --- Global: No Rounded Corners --- */
*,
*::before,
*::after {
  border-radius: 0 !important;
}

/* ===== TEXT GLOW UTILITIES ===== */

.jj-glow-subtle {
  text-shadow: 0 0 4px currentColor;
}

.jj-glow-medium {
  text-shadow:
    0 0 4px currentColor,
    0 0 10px currentColor;
}

.jj-glow-strong {
  text-shadow:
    0 0 4px currentColor,
    0 0 10px currentColor,
    0 0 20px currentColor;
}

.jj-glow--red {
  text-shadow:
    0 0 4px var(--jj-primary),
    0 0 10px rgba(232, 49, 58, 0.4);
}
.jj-glow--gold {
  text-shadow:
    0 0 4px var(--jj-secondary),
    0 0 10px rgba(245, 215, 66, 0.4);
}
.jj-glow--cyan {
  text-shadow:
    0 0 4px var(--jj-accent),
    0 0 10px rgba(74, 164, 224, 0.4);
}
.jj-glow--green {
  text-shadow:
    0 0 4px var(--jj-green),
    0 0 10px rgba(51, 255, 51, 0.4);
}
.jj-glow--amber {
  text-shadow:
    0 0 4px var(--jj-amber),
    0 0 10px rgba(255, 170, 0, 0.4);
}
.jj-glow--magenta {
  text-shadow:
    0 0 4px var(--jj-magenta),
    0 0 10px rgba(224, 64, 224, 0.4);
}

.jj-glow-box--cyan {
  box-shadow:
    0 0 6px rgba(74, 164, 224, 0.3),
    0 0 12px rgba(74, 164, 224, 0.15);
}
.jj-glow-box--green {
  box-shadow:
    0 0 6px rgba(51, 255, 51, 0.3),
    0 0 12px rgba(51, 255, 51, 0.15);
}
.jj-glow-box--amber {
  box-shadow:
    0 0 6px rgba(255, 170, 0, 0.3),
    0 0 12px rgba(255, 170, 0, 0.15);
}
.jj-glow-box--magenta {
  box-shadow:
    0 0 6px rgba(224, 64, 224, 0.3),
    0 0 12px rgba(224, 64, 224, 0.15);
}

/* ===== ASCII ART COLOR CLASSES ===== */
.ascii-red      { color: var(--jj-primary); }
.ascii-gold     { color: var(--jj-secondary); }
.ascii-cyan     { color: var(--jj-accent); }
.ascii-green    { color: var(--jj-green); }
.ascii-amber    { color: var(--jj-amber); }
.ascii-magenta  { color: var(--jj-magenta); }
.ascii-white    { color: var(--jj-white); }
.ascii-dim      { color: var(--jj-muted); }

.jj-ascii-art {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  white-space: pre;
  line-height: 1.2;
  overflow: hidden;
}

/* ===== EXTENDED BORDER UTILITIES ===== */

.jj-border-single { border: 1px solid var(--jj-border); }
.jj-border-double { border: 3px double var(--jj-border); }
.jj-border-thick  { border: 2px solid var(--jj-secondary); }
.jj-border-dashed { border: 1px dashed var(--jj-border); }

/* ===== CRT ANIMATIONS ===== */

@keyframes jj-crt-on {
  0%   { filter: brightness(3) saturate(0); opacity: 0; }
  20%  { filter: brightness(2) saturate(0.3); opacity: 0.5; }
  60%  { filter: brightness(1.3) saturate(0.8); opacity: 0.9; }
  100% { filter: none; opacity: 1; }
}
.jj-crt-on {
  animation: jj-crt-on 0.4s ease-out forwards;
}

@keyframes jj-crt-off {
  0%   { filter: none; opacity: 1; transform: scaleY(1); }
  60%  { filter: brightness(2); opacity: 0.8; transform: scaleY(0.01); }
  100% { filter: brightness(0); opacity: 0; transform: scaleY(0); }
}
.jj-crt-off {
  animation: jj-crt-off 0.3s ease-in forwards;
}

@keyframes jj-type-cursor {
  0%, 100% { border-right-color: var(--jj-text); }
  50%      { border-right-color: transparent; }
}
.jj-typing-cursor {
  border-right: 2px solid var(--jj-text);
  padding-right: 2px;
  animation: jj-type-cursor 1s step-end infinite;
}

@keyframes jj-glow-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.7; }
}
.jj-glow-pulse {
  animation: jj-glow-pulse 2s ease-in-out infinite;
}

@keyframes jj-ascii-spin {
  0%   { content: '|'; }
  25%  { content: '/'; }
  50%  { content: '-'; }
  75%  { content: '\\'; }
}
.jj-loading::after {
  content: '|';
  animation: jj-ascii-spin 0.5s step-end infinite;
  color: var(--jj-accent);
}

.jj-progress {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  color: var(--jj-green);
  letter-spacing: 0;
}
.jj-progress__fill { color: var(--jj-green); }
.jj-progress__empty { color: var(--jj-dim); }

/* ===== PHOSPHOR COLOR TEXT UTILITIES ===== */
.jj-text-green   { color: var(--jj-green); }
.jj-text-amber   { color: var(--jj-amber); }
.jj-text-magenta { color: var(--jj-magenta); }
.jj-text-cyan    { color: var(--jj-cyan); }
.jj-text-white   { color: var(--jj-white); }

/* ===== STATUS INDICATOR COLORS ===== */
.jj-status-online   { color: var(--jj-green); }
.jj-status-warning  { color: var(--jj-amber); }
.jj-status-error    { color: var(--jj-primary); }
.jj-status-info     { color: var(--jj-accent); }
.jj-status-special  { color: var(--jj-magenta); }

/* ===== IMAGE CONTAINERS ===== */

.jj-thumb-img,
.jj-detail-image {
  position: relative;
}

@keyframes jj-phosphor-decay {
  0%   { opacity: 1; filter: brightness(1.15); }
  100% { opacity: 1; filter: brightness(1); }
}

.jj-phosphor-decay {
  animation: jj-phosphor-decay 0.15s ease-out forwards;
}

/* ===== REDUCED MOTION ===== */
@media (prefers-reduced-motion: reduce) {
  .jj-crt-on,
  .jj-crt-off,
  .jj-glow-pulse,
  .jj-loading::after {
    animation: none;
  }

  .jj-phosphor-decay {
    animation: none;
  }
}

/* ===== HIGH CONTRAST MODE ===== */
@media (prefers-contrast: more) {
  :root {
    --jj-border: #555555;
    --jj-muted: #999999;
    --jj-dim: #777777;
    --jj-subtle: #333333;
  }
}
```

- [ ] **Step 3: Delete old files**

```bash
git rm assets/japanjunky-crt.css
git rm assets/japanjunky-crt-shader.js
git rm assets/japanjunky-screensaver.js
git rm assets/japanjunky-screensaver-post.js
```

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-base.css
git commit -m "refactor: relocate CRT utilities to base.css, delete CRT/screensaver files"
```

---

## Task 2: Update theme.liquid — Remove Old, Add New

Strip all references to deleted files and add the bioluminescent canvas + script.

**Files:**
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Remove the japanjunky-crt.css stylesheet tag**

Remove this line:
```liquid
{{ 'japanjunky-crt.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 2: Remove the #jj-screensaver canvas**

Remove these lines (around line 135-139):
```html
<canvas id="jj-screensaver" aria-hidden="true" tabindex="-1" style="
  position:fixed;top:0;left:0;width:40vw;height:40vh;
  z-index:0;image-rendering:pixelated;image-rendering:crisp-edges;
  pointer-events:none;
"></canvas>
```

- [ ] **Step 3: Remove the .jj-crt-overlay div**

Remove this line (around line 142):
```html
<div class="jj-crt-overlay" aria-hidden="true"></div>
```

- [ ] **Step 4: Remove window.JJ_SCREENSAVER_CONFIG block**

Remove the entire `<script>` block (around lines 225-246):
```html
<script>
    window.JJ_SCREENSAVER_CONFIG = {
      ...
    };
  </script>
```

- [ ] **Step 5: Remove old script tags**

Remove these three `<script>` tags:
```html
<script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
<script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
<script src="{{ 'japanjunky-crt-shader.js' | asset_url }}" defer></script>
```

- [ ] **Step 6: Remove #jj-crt-shader-canvas**

Remove these lines (around line 263-267):
```html
<canvas id="jj-crt-shader-canvas" aria-hidden="true" role="presentation" style="
  position:fixed;inset:0;width:100%;height:100%;
  z-index:10002;pointer-events:none;
"></canvas>
```

- [ ] **Step 7: Add the #jj-biolum canvas**

Insert after the `<body>` tag (and after the splash conditional), before the product zone:
```html
<canvas id="jj-biolum" aria-hidden="true" tabindex="-1" style="
  position:fixed;inset:0;width:100%;height:100%;
  z-index:0;pointer-events:none;
"></canvas>
```

- [ ] **Step 8: Add the biolum script tag**

Add after the `three.min.js` script tag, replacing the deleted screensaver/crt scripts:
```html
<script src="{{ 'japanjunky-biolum.js' | asset_url }}" defer></script>
```

- [ ] **Step 9: Commit**

```bash
git add layout/theme.liquid
git commit -m "refactor: replace screensaver/CRT elements with biolum canvas in theme.liquid"
```

---

## Task 3: Fix Cross-Dependencies in Existing Scripts

Update `japanjunky-product-viewer.js`, `japanjunky-tsuno-bubble.js`, and `japanjunky-splash.js` to remove references to deleted screensaver globals and elements.

**Files:**
- Modify: `assets/japanjunky-product-viewer.js:27-30`
- Modify: `assets/japanjunky-tsuno-bubble.js:13-15`
- Modify: `assets/japanjunky-splash.js:6-8, 262-263, 305-310, 378-380`

- [ ] **Step 1: Fix product-viewer.js — remove JJ_SCREENSAVER_CONFIG dependency**

Replace lines 27-30:
```js
  var shaderRes = 240;
  if (window.JJ_SCREENSAVER_CONFIG && window.JJ_SCREENSAVER_CONFIG.resolution) {
    shaderRes = parseInt(window.JJ_SCREENSAVER_CONFIG.resolution, 10) || 240;
  }
```

With:
```js
  var shaderRes = 240;
```

- [ ] **Step 2: Fix tsuno-bubble.js — change canvas guard**

Replace lines 12-15:
```js
  // ─── Guard: need screensaver canvas in DOM ──────────────────
  var ssCanvas = document.getElementById('jj-screensaver') ||
                 document.getElementById('jj-screensaver-display');
  if (!ssCanvas) return;
```

With:
```js
  // ─── Guard: need biolum canvas in DOM ──────────────────────
  var bgCanvas = document.getElementById('jj-biolum');
  if (!bgCanvas) return;
```

- [ ] **Step 3: Fix splash.js — remove JJ_ScreensaverPost dependency**

In the doc comment (line 8), change:
```js
 * Depends on: THREE (global), JJ_ScreensaverPost (global),
```
To:
```js
 * Depends on: THREE (global),
```

Replace the dither call (around line 262-263):
```js
    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
```

With:
```js
    if (false) {
      // Screensaver post-processor removed — splash dithering disabled
```

Note: The splash has its own WebGL pipeline and the dither was optional enhancement. Removing it gracefully with a dead-code path that can be replaced later if needed.

- [ ] **Step 4: Fix splash.js — change JJ_Portal_Init to JJ_Biolum_Init**

Replace all occurrences (lines 307-309 and 378-380):
```js
    if (window.JJ_Portal_Init) {
      window.JJ_Portal_Init();
      delete window.JJ_Portal_Init;
    }
```

With:
```js
    if (window.JJ_Biolum_Init) {
      window.JJ_Biolum_Init();
      delete window.JJ_Biolum_Init;
    }
```

And update the comment on line 305:
```js
    // Start screensaver now so its background renders behind the fading splash.
    // By the time the 2s fade reveals the homepage, the vortex is already running.
```
To:
```js
    // Start bioluminescent background so it renders behind the fading splash.
```

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-product-viewer.js assets/japanjunky-tsuno-bubble.js assets/japanjunky-splash.js
git commit -m "fix: update cross-dependencies to reference biolum instead of screensaver"
```

---

## Task 4: Generate CP437 Font Atlas PNG

Create the 128×256 pixel CP437 bitmap font atlas.

**Files:**
- Create: `assets/cp437-font-atlas.png`

- [ ] **Step 1: Generate the font atlas**

Use a Node.js script (run once, not committed) to generate the atlas from the Ultimate Oldschool PC Font Pack. The atlas is a 16×16 grid of 8×16 glyphs, white pixels on transparent background.

If the font data isn't available locally, create the atlas programmatically using the canvas API with the CP437 characters rendered in a monospace bitmap font. The key glyphs needed for the ramp are:
- Index 32: space
- Index 176: `░` light shade
- Index 177: `▒` medium shade
- Index 178: `▓` dark shade
- Index 219: `█` full block
- Index 250: `·` middle dot

Create a script `_generate-atlas.js` (temporary, not committed):

```js
const { createCanvas } = require('canvas');
const fs = require('fs');

const TILE_W = 8;
const TILE_H = 16;
const COLS = 16;
const ROWS = 16;
const atlas = createCanvas(COLS * TILE_W, ROWS * TILE_H);
const ctx = atlas.getContext('2d');

// CP437 unicode mapping (all 256 characters)
const CP437 = [
  '\u0000','\u263A','\u263B','\u2665','\u2666','\u2663','\u2660','\u2022',
  '\u25D8','\u25CB','\u25D9','\u2642','\u2640','\u266A','\u266B','\u263C',
  '\u25BA','\u25C4','\u2195','\u203C','\u00B6','\u00A7','\u25AC','\u21A8',
  '\u2191','\u2193','\u2192','\u2190','\u221F','\u2194','\u25B2','\u25BC',
  ' ','!','"','#','$','%','&',"'",'(',')','*','+',',','-','.','/',
  '0','1','2','3','4','5','6','7','8','9',':',';','<','=','>','?',
  '@','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  'P','Q','R','S','T','U','V','W','X','Y','Z','[','\\',']','^','_',
  '`','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o',
  'p','q','r','s','t','u','v','w','x','y','z','{','|','}','~','\u2302',
  '\u00C7','\u00FC','\u00E9','\u00E2','\u00E4','\u00E0','\u00E5','\u00E7',
  '\u00EA','\u00EB','\u00E8','\u00EF','\u00EE','\u00EC','\u00C4','\u00C5',
  '\u00C9','\u00E6','\u00C6','\u00F4','\u00F6','\u00F2','\u00FB','\u00F9',
  '\u00FF','\u00D6','\u00DC','\u00A2','\u00A3','\u00A5','\u20A7','\u0192',
  '\u00E1','\u00ED','\u00F3','\u00FA','\u00F1','\u00D1','\u00AA','\u00BA',
  '\u00BF','\u2310','\u00AC','\u00BD','\u00BC','\u00A1','\u00AB','\u00BB',
  '\u2591','\u2592','\u2593','\u2502','\u2524','\u2561','\u2562','\u2556',
  '\u2555','\u2563','\u2551','\u2557','\u255D','\u255C','\u255B','\u2510',
  '\u2514','\u2534','\u252C','\u251C','\u2500','\u253C','\u255E','\u255F',
  '\u255A','\u2554','\u2569','\u2566','\u2560','\u2550','\u256C','\u2567',
  '\u2568','\u2564','\u2565','\u2559','\u2558','\u2552','\u2553','\u256B',
  '\u256A','\u2518','\u250C','\u2588','\u2584','\u258C','\u2590','\u2580',
  '\u03B1','\u00DF','\u0393','\u03C0','\u03A3','\u03C3','\u00B5','\u03C4',
  '\u03A6','\u0398','\u03A9','\u03B4','\u221E','\u03C6','\u03B5','\u2229',
  '\u2261','\u00B1','\u2265','\u2264','\u2320','\u2321','\u00F7','\u2248',
  '\u00B0','\u2219','\u00B7','\u221A','\u207F','\u00B2','\u25A0','\u00A0'
];

ctx.fillStyle = 'rgba(0,0,0,0)';
ctx.clearRect(0, 0, atlas.width, atlas.height);
ctx.fillStyle = '#ffffff';
ctx.textBaseline = 'top';
ctx.font = '16px "Fixedsys Excelsior 3.01", monospace';

for (let i = 0; i < 256; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * TILE_W;
  const y = row * TILE_H;
  if (i === 0 || i === 255) continue; // null + NBSP
  ctx.fillText(CP437[i], x, y);
}

const buffer = atlas.toBuffer('image/png');
fs.writeFileSync('assets/cp437-font-atlas.png', buffer);
console.log('Atlas written: assets/cp437-font-atlas.png');
```

Run: `node _generate-atlas.js`

If the `canvas` npm package or the Fixedsys font isn't available, an alternative approach is to download a pre-rendered CP437 atlas from the Ultimate Oldschool PC Font Pack and resize to 128×256. The critical requirement is: 16×16 grid, 8×16 tiles, white glyphs on transparent background, PNG format.

- [ ] **Step 2: Verify atlas dimensions and key glyphs**

Open the generated PNG and verify:
- Dimensions: 128×256 pixels
- Grid: 16 columns × 16 rows
- Index 32 (row 2, col 0): blank space
- Index 176 (row 11, col 0): light shade `░`
- Index 219 (row 13, col 11): full block `█`
- Index 250 (row 15, col 10): middle dot `·`

- [ ] **Step 3: Commit**

```bash
git add assets/cp437-font-atlas.png
git commit -m "asset: add CP437 font atlas for ASCII renderer"
```

---

## Task 5: Scaffold japanjunky-biolum.js — WebGL2 Init + Config

Create the main file with IIFE structure, config merge, WebGL2 context setup, and the animation loop skeleton.

**Files:**
- Create: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Create the file with IIFE, config, and WebGL2 init**

```js
/**
 * JapanJunky Bioluminescent ASCII Background
 *
 * Reactive particle system with 2D fluid field, neuron-like activation
 * cascades, and CP437 ASCII rendering via WebGL2 GPGPU pipeline.
 *
 * Pipeline:
 *   Stage 1: Physics (render-to-texture GPGPU — fluid + particles)
 *   Stage 2: Particle render (instanced quads → offscreen FBO)
 *   Stage 3: ASCII conversion (CP437 atlas + phosphor palette)
 *   Stage 4: Bloom post-process
 *
 * Config: window.JJ_BIOLUM_CONFIG (optional overrides)
 * Loaded: <script src="{{ 'japanjunky-biolum.js' | asset_url }}" defer></script>
 */
(function () {
  'use strict';

  // ─── Default Configuration ───────────────────────────────────
  var defaults = {
    // Particles
    particleCount: 50000,
    particleSize: 4.0,
    activationScale: 1.5,

    // Activation model
    energyAccumulation: 1.2,
    energyDecay: 0.8,
    activationThreshold: 1.0,
    activationDuration: 1.0,
    refractoryPeriod: 1.5,

    // Fluid
    fluidResX: 128,
    fluidResY: 64,
    fluidDissipation: 0.98,

    // Cursor interaction
    cursorStrength: 1.5,
    cursorRadius: 0.06,

    // Carousel interaction
    carouselBurstStrength: 2.0,
    carouselBurstDuration: 1.5,

    // Bubbles
    bubbleCount: 10,
    bubbleSpawnInterval: 2.5,
    bubbleRiseSpeed: 0.08,
    bubbleWakeStrength: 0.6,

    // ASCII
    displayScale: 1,
    glyphRamp: [32, 250, 176, 177, 178, 219],
    ditherStrength: 1.0,

    // Bloom
    bloomStrength: 0.6,
    bloomRadius: 0.3,
    bloomThreshold: 0.15,

    // Mobile
    mobileEnabled: false
  };

  function mergeConfig() {
    var overrides = window.JJ_BIOLUM_CONFIG || {};
    var cfg = {};
    for (var key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        cfg[key] = overrides.hasOwnProperty(key) ? overrides[key] : defaults[key];
      }
    }
    return cfg;
  }

  // ─── WebGL2 Utilities ────────────────────────────────────────

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    var vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    var frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function createFloatTexture(gl, width, height, data) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0,
                  gl.RGBA, gl.FLOAT, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createFBO(gl, texture) {
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, texture, 0);
    return fbo;
  }

  function createDoubleFBO(gl, width, height) {
    var texA = createFloatTexture(gl, width, height, null);
    var texB = createFloatTexture(gl, width, height, null);
    var fboA = createFBO(gl, texA);
    var fboB = createFBO(gl, texB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      texA: texA, texB: texB,
      fboA: fboA, fboB: fboB,
      read: texA, write: texB,
      readFBO: fboA, writeFBO: fboB,
      swap: function () {
        var tmpTex = this.read;
        var tmpFBO = this.readFBO;
        this.read = this.write;
        this.readFBO = this.writeFBO;
        this.write = tmpTex;
        this.writeFBO = tmpFBO;
      }
    };
  }

  // Fullscreen quad geometry (reused for all fullscreen passes)
  var QUAD_VERTS = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);

  function createQuadVAO(gl) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  function drawQuad(gl, vao) {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ─── Init ────────────────────────────────────────────────────

  function init() {
    // Accessibility: respect high-contrast preference
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
      return;
    }

    var cfg = mergeConfig();

    // Mobile guard
    if (!cfg.mobileEnabled && /Mobi|Android/i.test(navigator.userAgent)) {
      return;
    }

    var canvas = document.getElementById('jj-biolum');
    if (!canvas) return;

    var gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
    if (!gl) return; // WebGL2 not available

    // Check for required extension
    var floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) return; // Can't render to float textures

    // Reduced motion: we'll render one frame then stop
    var reducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ─── Resize ────────────────────────────────────────────────
    function resize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    // ─── Shared Resources ──────────────────────────────────────
    var quadVAO = createQuadVAO(gl);

    // ─── State ─────────────────────────────────────────────────
    var running = true;
    var startTime = performance.now();
    var lastTime = startTime;

    // TODO: Tasks 6-10 will populate these:
    // - Particle state textures (Task 6)
    // - Fluid field textures (Task 7)
    // - Interaction state (Task 8)
    // - ASCII shader + font atlas (Task 9)
    // - Bloom pass (Task 10)

    // ─── Animation Loop ────────────────────────────────────────
    function frame() {
      if (!running) return;

      var now = performance.now();
      var dt = Math.min((now - lastTime) / 1000.0, 0.05); // cap at 50ms
      lastTime = now;

      // Stage 1: Physics update (Tasks 6-7)
      // Stage 2: Particle render (Task 6)
      // Stage 3: ASCII conversion (Task 9)
      // Stage 4: Bloom (Task 10)

      // Placeholder: clear to black
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (reducedMotion) {
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    }

    // Visibility handling — pause when tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        lastTime = performance.now();
        frame();
      }
    });

    frame();

    // ─── Deferred init for splash handoff ──────────────────────
    window.JJ_Biolum_Init = function () {
      if (!running) {
        running = true;
        lastTime = performance.now();
        frame();
      }
    };
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Verify the page loads with a black background canvas**

Open the site in a browser. The canvas should be visible as a solid black fullscreen background behind all UI elements. No errors in the console. All existing UI (carousel, taskbar, product viewer, Tsuno) should work normally.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): scaffold WebGL2 init, config, animation loop"
```

---

## Task 6: GPGPU Particle Simulation

Implement the particle state textures, initialization, and per-frame physics update as render-to-texture passes.

**Files:**
- Modify: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Add particle init shader**

After the `createQuadVAO` function, add the particle initialization shader. This runs once to fill the position and velocity state textures with initial values.

Add these GLSL sources inside the IIFE:

```js
  // ─── GLSL: Particle Init ─────────────────────────────────────
  var PARTICLE_INIT_VERT = '#version 300 es\nin vec2 a_pos;out vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}';

  var PARTICLE_INIT_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'layout(location=0) out vec4 o_position;',
    'layout(location=1) out vec4 o_velocity;',
    '',
    '// Hash function for deterministic randomness',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    'void main() {',
    '  // Position: uniform distribution in [0,1]^2 with jitter',
    '  float jx = (hash(v_uv * 1.0) - 0.5) * 0.01;',
    '  float jy = (hash(v_uv * 2.0) - 0.5) * 0.01;',
    '  vec2 pos = v_uv + vec2(jx, jy);',
    '',
    '  // Phosphor ID: spatial hash → 0-5',
    '  float phosphorId = floor(hash(floor(v_uv * 8.0)) * 6.0);',
    '',
    '  o_position = vec4(pos, 0.0, phosphorId);',
    '  // velocity=0, energy=0, activation=0',
    '  o_velocity = vec4(0.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add particle update shader**

```js
  // ─── GLSL: Particle Update ───────────────────────────────────
  var PARTICLE_UPDATE_VERT = PARTICLE_INIT_VERT; // same passthrough

  var PARTICLE_UPDATE_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_positionTex;',
    'uniform sampler2D u_velocityTex;',
    'uniform sampler2D u_fluidTex;',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform float u_energyAccum;',
    'uniform float u_energyDecay;',
    'uniform float u_activationThreshold;',
    'uniform float u_activationDuration;',
    'uniform float u_refractoryPeriod;',
    'uniform float u_particleDrag;',
    'uniform float u_noiseStrength;',
    'uniform vec2 u_cursorPos;',
    'uniform vec2 u_cursorVel;',
    'uniform float u_cursorStrength;',
    'uniform float u_cursorRadius;',
    '',
    'layout(location=0) out vec4 o_position;',
    'layout(location=1) out vec4 o_velocity;',
    '',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    'void main() {',
    '  vec4 posData = texture(u_positionTex, v_uv);',
    '  vec4 velData = texture(u_velocityTex, v_uv);',
    '',
    '  vec2 pos = posData.xy;',
    '  float phosphorId = posData.a;',
    '  vec2 vel = velData.xy;',
    '  float energy = velData.z;',
    '  float activation = velData.w;',
    '',
    '  // Sparkle modifier — per-particle sensitivity variation',
    '  float sparkle = mix(0.5, 1.5, hash(v_uv * 17.0));',
    '',
    '  // Refractory timer packed into energy when negative',
    '  // Encoding: energy >= 0 = normal energy, energy < 0 = refractory timer',
    '  float refractory = 0.0;',
    '  if (energy < 0.0) {',
    '    refractory = -energy;',
    '    energy = 0.0;',
    '  }',
    '',
    '  // Sample fluid field at particle position',
    '  vec4 fluidSample = texture(u_fluidTex, pos);',
    '  vec2 fluidVel = fluidSample.xy;',
    '  float fluidSpeed = length(fluidVel);',
    '',
    '  // Decay refractory',
    '  refractory = max(0.0, refractory - u_dt);',
    '',
    '  // Energy accumulation from fluid',
    '  energy += fluidSpeed * u_energyAccum * sparkle * u_dt;',
    '  // Energy decay when fluid is calm',
    '  energy -= u_energyDecay * u_dt * (1.0 - fluidSpeed);',
    '  energy = max(0.0, energy);',
    '',
    '  // Activation check',
    '  float threshold = u_activationThreshold / max(sparkle, 0.01);',
    '  if (refractory <= 0.0 && energy > threshold) {',
    '    activation = 1.0;',
    '    energy = 0.0;',
    '    refractory = u_refractoryPeriod;',
    '  }',
    '',
    '  // Activation decay',
    '  activation = max(0.0, activation - u_dt / max(u_activationDuration, 0.01));',
    '',
    '  // Forces: fluid drag',
    '  vec2 accel = (fluidVel - vel) * 2.0;',
    '',
    '  // Forces: cursor proximity',
    '  vec2 toCursor = u_cursorPos - pos;',
    '  float cursorDist = length(toCursor);',
    '  float cursorInfluence = exp(-cursorDist * cursorDist / (u_cursorRadius * u_cursorRadius));',
    '  accel += u_cursorVel * u_cursorStrength * cursorInfluence;',
    '',
    '  // Forces: noise perturbation',
    '  float phase1 = hash(v_uv * 12.98) * 6.283;',
    '  float phase2 = hash(v_uv * 78.23) * 6.283;',
    '  vec2 noise = vec2(',
    '    sin(u_time * 0.6 + phase1),',
    '    cos(u_time * 0.8 + phase2)',
    '  );',
    '  accel += noise * u_noiseStrength;',
    '',
    '  // Integrate',
    '  vel += accel * u_dt;',
    '  vel *= (1.0 / (1.0 + 1.0 * u_dt)); // drag',
    '  pos += vel * u_dt;',
    '',
    '  // Boundary wrap',
    '  pos = fract(pos);',
    '',
    '  // Pack refractory back into energy (negative = refractory)',
    '  float packedEnergy = refractory > 0.0 ? -refractory : energy;',
    '',
    '  o_position = vec4(pos, 0.0, phosphorId);',
    '  o_velocity = vec4(vel, packedEnergy, activation);',
    '}'
  ].join('\n');
```

- [ ] **Step 3: Add particle state setup to init()**

Inside the `init()` function, after `var quadVAO = createQuadVAO(gl);`, add:

```js
    // ─── Particle State ──────────────────────────────────────────
    var texSize = Math.ceil(Math.sqrt(cfg.particleCount));
    var particlePositions = createDoubleFBO(gl, texSize, texSize);
    var particleVelocities = createDoubleFBO(gl, texSize, texSize);

    // Init program (runs once to seed particle positions)
    var particleInitProg = createProgram(gl, PARTICLE_INIT_VERT, PARTICLE_INIT_FRAG);

    // Initialize particle state via MRT render
    (function initParticles() {
      gl.useProgram(particleInitProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                              gl.TEXTURE_2D, particlePositions.read, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                              gl.TEXTURE_2D, particleVelocities.read, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, texSize, texSize);
      drawQuad(gl, quadVAO);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      resize(); // restore viewport
    })();

    // Update program
    var particleUpdateProg = createProgram(gl, PARTICLE_UPDATE_VERT, PARTICLE_UPDATE_FRAG);
```

- [ ] **Step 4: Add particle update function**

```js
    function updateParticles(dt, time, cursorPos, cursorVel) {
      gl.useProgram(particleUpdateProg);

      // Bind read textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, particlePositions.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_positionTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, particleVelocities.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_velocityTex'), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, fluidField.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_fluidTex'), 2);

      // Uniforms
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_dt'), dt);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_time'), time);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_energyAccum'), cfg.energyAccumulation);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_energyDecay'), cfg.energyDecay);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_activationThreshold'), cfg.activationThreshold);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_activationDuration'), cfg.activationDuration);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_refractoryPeriod'), cfg.refractoryPeriod);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_particleDrag'), 1.0);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_noiseStrength'), 0.1);
      gl.uniform2f(gl.getUniformLocation(particleUpdateProg, 'u_cursorPos'), cursorPos[0], cursorPos[1]);
      gl.uniform2f(gl.getUniformLocation(particleUpdateProg, 'u_cursorVel'), cursorVel[0], cursorVel[1]);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_cursorStrength'), cfg.cursorStrength);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_cursorRadius'), cfg.cursorRadius);

      // Render to write textures via MRT
      var updateFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, updateFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                              gl.TEXTURE_2D, particlePositions.write, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                              gl.TEXTURE_2D, particleVelocities.write, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, texSize, texSize);
      drawQuad(gl, quadVAO);
      gl.deleteFramebuffer(updateFBO);

      particlePositions.swap();
      particleVelocities.swap();
      resize(); // restore viewport
    }
```

- [ ] **Step 5: Wire particle update into the animation loop**

Replace the placeholder in the `frame()` function:

```js
      // Stage 1: Physics update
      var time = (now - startTime) / 1000.0;
      updateParticles(dt, time, cursorState.pos, cursorState.vel);
```

Also add cursor state tracking before the animation loop:

```js
    // ─── Cursor State ──────────────────────────────────────────
    var cursorState = {
      pos: [0.5, 0.5],
      vel: [0, 0],
      prevPos: [0.5, 0.5]
    };
```

- [ ] **Step 6: Verify particles update without errors**

Open the site. Console should be clean (no WebGL errors). The screen is still black (particles aren't rendered yet, just simulated). Check for:
- No `GL_INVALID_OPERATION` errors
- No shader compilation errors
- Frame rate stays at 60fps

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): add GPGPU particle simulation (init + update)"
```

---

## Task 7: 2D Fluid Field

Implement the fluid velocity field with dissipation, cursor injection, carousel bursts, and autonomous bubbles.

**Files:**
- Modify: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Add fluid field shaders**

Add after the particle update shader:

```js
  // ─── GLSL: Fluid Injection (writes cursor/bubble/carousel forces) ─
  var FLUID_INJECT_VERT = PARTICLE_INIT_VERT;

  var FLUID_INJECT_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'out vec4 o_color;',
    '',
    '// Cursor',
    'uniform vec2 u_cursorPos;',
    'uniform vec2 u_cursorVel;',
    'uniform float u_cursorStrength;',
    'uniform float u_cursorRadius;',
    '',
    '// Carousel bursts (max 4)',
    'uniform vec4 u_burstPosAge[4];',   // xy=pos, z=age, w=strength
    'uniform vec2 u_burstDir[4];',
    'uniform float u_burstDuration;',
    'uniform int u_burstCount;',
    '',
    '// Autonomous bubbles (max 12)',
    'uniform vec3 u_bubbles[12];',      // xy=pos, z=strength
    'uniform int u_bubbleCount;',
    'uniform float u_bubbleWakeStrength;',
    '',
    'void main() {',
    '  vec2 force = vec2(0.0);',
    '',
    '  // Cursor injection: Gaussian splat',
    '  vec2 toCursor = v_uv - u_cursorPos;',
    '  float cursorDist2 = dot(toCursor, toCursor);',
    '  float cursorR2 = u_cursorRadius * u_cursorRadius;',
    '  force += u_cursorVel * u_cursorStrength * exp(-cursorDist2 / cursorR2);',
    '',
    '  // Carousel burst injection',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= u_burstCount) break;',
    '    vec2 bPos = u_burstPosAge[i].xy;',
    '    float bAge = u_burstPosAge[i].z;',
    '    float bStr = u_burstPosAge[i].w;',
    '    vec2 bDir = u_burstDir[i];',
    '    float fade = max(0.0, 1.0 - bAge / u_burstDuration);',
    '    vec2 toBurst = v_uv - bPos;',
    '    float bDist2 = dot(toBurst, toBurst);',
    '    force += bDir * bStr * fade * exp(-bDist2 / 0.01);',
    '  }',
    '',
    '  // Autonomous bubble injection',
    '  for (int i = 0; i < 12; i++) {',
    '    if (i >= u_bubbleCount) break;',
    '    vec2 bPos = u_bubbles[i].xy;',
    '    float bStr = u_bubbles[i].z;',
    '    vec2 toBubble = v_uv - bPos;',
    '    float bDist2 = dot(toBubble, toBubble);',
    '    float radius2 = 0.002;',
    '    float influence = exp(-bDist2 / radius2);',
    '    // Upward force + conical wake below',
    '    vec2 upForce = vec2(0.0, 1.0) * bStr * u_bubbleWakeStrength;',
    '    float belowFactor = smoothstep(0.0, 0.05, v_uv.y - bPos.y);',
    '    force += upForce * influence * (1.0 - belowFactor * 0.5);',
    '  }',
    '',
    '  o_color = vec4(force, 0.0, 1.0);',
    '}'
  ].join('\n');

  // ─── GLSL: Fluid Step (advection + dissipation + injection) ──
  var FLUID_STEP_VERT = PARTICLE_INIT_VERT;

  var FLUID_STEP_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_velocityTex;',
    'uniform sampler2D u_injectionTex;',
    'uniform float u_dissipation;',
    'uniform float u_dt;',
    'out vec4 o_color;',
    '',
    'void main() {',
    '  vec2 prevVel = texture(u_velocityTex, v_uv).xy;',
    '  vec2 injection = texture(u_injectionTex, v_uv).xy;',
    '  vec2 newVel = prevVel + injection * u_dt;',
    '  newVel *= (1.0 - u_dissipation * u_dt);',
    '  o_color = vec4(newVel, 0.0, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add fluid field state and programs to init()**

After the particle state setup:

```js
    // ─── Fluid Field ─────────────────────────────────────────────
    var fluidField = createDoubleFBO(gl, cfg.fluidResX, cfg.fluidResY);
    // Set fluid textures to LINEAR for smooth interpolation when particles sample
    [fluidField.texA, fluidField.texB].forEach(function (tex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });

    var injectionTex = createFloatTexture(gl, cfg.fluidResX, cfg.fluidResY, null);
    var injectionFBO = createFBO(gl, injectionTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var fluidInjectProg = createProgram(gl, FLUID_INJECT_VERT, FLUID_INJECT_FRAG);
    var fluidStepProg = createProgram(gl, FLUID_STEP_VERT, FLUID_STEP_FRAG);
```

- [ ] **Step 3: Add bubble and burst state management**

Before the animation loop:

```js
    // ─── Autonomous Bubbles ──────────────────────────────────────
    var bubbles = [];
    var bubbleTimer = 0;
    function updateBubbles(dt) {
      bubbleTimer += dt;
      // Spawn new bubble
      if (bubbleTimer >= cfg.bubbleSpawnInterval && bubbles.length < cfg.bubbleCount) {
        bubbles.push({
          x: Math.random(),
          y: 0.0,
          speed: cfg.bubbleRiseSpeed * (0.8 + Math.random() * 0.4),
          drift: Math.random() * 6.283,
          strength: 0.8 + Math.random() * 0.4
        });
        bubbleTimer = 0;
      }
      // Update positions
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var b = bubbles[i];
        b.y += b.speed * dt;
        b.x += Math.sin(b.drift + b.y * 4.0) * 0.02 * dt;
        if (b.y > 1.0) bubbles.splice(i, 1);
      }
    }

    // ─── Carousel Bursts ─────────────────────────────────────────
    var bursts = [];
    function addCarouselBurst(normalizedX, direction) {
      if (bursts.length >= 4) bursts.shift();
      bursts.push({
        x: normalizedX,
        y: 0.5,
        dirX: direction * 0.5,
        dirY: 0,
        age: 0,
        strength: cfg.carouselBurstStrength
      });
    }
    function updateBursts(dt) {
      for (var i = bursts.length - 1; i >= 0; i--) {
        bursts[i].age += dt;
        if (bursts[i].age > cfg.carouselBurstDuration) {
          bursts.splice(i, 1);
        }
      }
    }

    // Listen for carousel events
    document.addEventListener('jj:ring-scroll', function (e) {
      var dir = (e.detail && e.detail.direction) || 1;
      addCarouselBurst(0.5, dir);
    });
    document.addEventListener('jj:product-selected', function () {
      addCarouselBurst(0.5, 0);
    });
```

- [ ] **Step 4: Add fluid update functions**

```js
    function updateFluidInjection(cursorPos, cursorVel) {
      gl.useProgram(fluidInjectProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, injectionFBO);
      gl.viewport(0, 0, cfg.fluidResX, cfg.fluidResY);

      // Cursor uniforms
      gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_cursorPos'), cursorPos[0], cursorPos[1]);
      gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_cursorVel'), cursorVel[0], cursorVel[1]);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_cursorStrength'), cfg.cursorStrength);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_cursorRadius'), cfg.cursorRadius);

      // Burst uniforms
      gl.uniform1i(gl.getUniformLocation(fluidInjectProg, 'u_burstCount'), bursts.length);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_burstDuration'), cfg.carouselBurstDuration);
      for (var i = 0; i < 4; i++) {
        var b = bursts[i] || { x: 0, y: 0, age: 99, strength: 0, dirX: 0, dirY: 0 };
        gl.uniform4f(gl.getUniformLocation(fluidInjectProg, 'u_burstPosAge[' + i + ']'),
                     b.x, b.y, b.age, b.strength);
        gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_burstDir[' + i + ']'),
                     b.dirX, b.dirY);
      }

      // Bubble uniforms
      gl.uniform1i(gl.getUniformLocation(fluidInjectProg, 'u_bubbleCount'), bubbles.length);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_bubbleWakeStrength'), cfg.bubbleWakeStrength);
      for (var j = 0; j < 12; j++) {
        var bb = bubbles[j] || { x: 0, y: 0, strength: 0 };
        gl.uniform3f(gl.getUniformLocation(fluidInjectProg, 'u_bubbles[' + j + ']'),
                     bb.x, bb.y, bb.strength);
      }

      drawQuad(gl, quadVAO);
    }

    function stepFluid(dt) {
      gl.useProgram(fluidStepProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fluidField.writeFBO);
      gl.viewport(0, 0, cfg.fluidResX, cfg.fluidResY);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fluidField.read);
      gl.uniform1i(gl.getUniformLocation(fluidStepProg, 'u_velocityTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, injectionTex);
      gl.uniform1i(gl.getUniformLocation(fluidStepProg, 'u_injectionTex'), 1);

      gl.uniform1f(gl.getUniformLocation(fluidStepProg, 'u_dissipation'), cfg.fluidDissipation);
      gl.uniform1f(gl.getUniformLocation(fluidStepProg, 'u_dt'), dt);

      drawQuad(gl, quadVAO);

      fluidField.swap();
    }
```

- [ ] **Step 5: Wire fluid into animation loop**

Update the `frame()` function to call fluid + bubble updates before particle update:

```js
      var time = (now - startTime) / 1000.0;

      // Update CPU-side state
      updateBubbles(dt);
      updateBursts(dt);

      // Stage 1a: Fluid injection
      updateFluidInjection(cursorState.pos, cursorState.vel);

      // Stage 1b: Fluid step (advection + dissipation)
      stepFluid(dt);

      // Stage 1c: Particle physics
      updateParticles(dt, time, cursorState.pos, cursorState.vel);
```

- [ ] **Step 6: Verify no errors, fluid runs silently**

Open site, check console is clean. Screen still black. CPU usage should be low (only bubble/burst updates on CPU).

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): add 2D fluid field with cursor, carousel, and bubble injection"
```

---

## Task 8: Cursor and Carousel Interaction Wiring

Wire up `mousemove` events and carousel scroll/click to the interaction state.

**Files:**
- Modify: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Add cursor tracking**

After the cursor state initialization, add the mousemove listener:

```js
    document.addEventListener('mousemove', function (e) {
      cursorState.prevPos[0] = cursorState.pos[0];
      cursorState.prevPos[1] = cursorState.pos[1];
      cursorState.pos[0] = e.clientX / window.innerWidth;
      cursorState.pos[1] = 1.0 - (e.clientY / window.innerHeight); // flip Y
    });
```

- [ ] **Step 2: Compute cursor velocity in the animation loop**

Before the fluid update in `frame()`:

```js
      // Cursor velocity (normalized units per second)
      if (dt > 0) {
        cursorState.vel[0] = (cursorState.pos[0] - cursorState.prevPos[0]) / dt;
        cursorState.vel[1] = (cursorState.pos[1] - cursorState.prevPos[1]) / dt;
      }
      // Clamp cursor velocity to avoid huge spikes on tab focus
      var maxVel = 20.0;
      cursorState.vel[0] = Math.max(-maxVel, Math.min(maxVel, cursorState.vel[0]));
      cursorState.vel[1] = Math.max(-maxVel, Math.min(maxVel, cursorState.vel[1]));
      cursorState.prevPos[0] = cursorState.pos[0];
      cursorState.prevPos[1] = cursorState.pos[1];
```

- [ ] **Step 3: Verify cursor interaction in debug**

At this point we can't see particles yet, but cursor events should flow through without errors. Verify in console: no errors on mouse movement.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): wire cursor and carousel interaction to fluid field"
```

---

## Task 9: Particle Render + ASCII Conversion Shader

Render particles to an offscreen FBO as colored billboards, then convert to ASCII glyphs.

**Files:**
- Modify: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Add particle render shaders**

```js
  // ─── GLSL: Particle Render (instanced billboards) ────────────
  var PARTICLE_RENDER_VERT = [
    '#version 300 es',
    'in vec2 a_quad;',            // quad vertex (-1..1)
    'in float a_instanceId;',      // instance index as float
    'uniform sampler2D u_positionTex;',
    'uniform sampler2D u_velocityTex;',
    'uniform float u_texSize;',
    'uniform float u_particleSize;',
    'uniform float u_activationScale;',
    'uniform vec2 u_resolution;',
    '',
    'out float v_activation;',
    'out float v_phosphorId;',
    '',
    'void main() {',
    '  // Decode texel UV from instance ID',
    '  float idx = a_instanceId;',
    '  float row = floor(idx / u_texSize);',
    '  float col = idx - row * u_texSize;',
    '  vec2 texUv = (vec2(col, row) + 0.5) / u_texSize;',
    '',
    '  vec4 posData = texture(u_positionTex, texUv);',
    '  vec4 velData = texture(u_velocityTex, texUv);',
    '',
    '  vec2 pos = posData.xy;',
    '  v_phosphorId = posData.a;',
    '  v_activation = max(0.0, velData.w);',
    '',
    '  float size = u_particleSize * mix(1.0, u_activationScale, v_activation);',
    '  vec2 pixelSize = size / u_resolution;',
    '  vec2 screenPos = pos * 2.0 - 1.0; // [0,1] → [-1,1]',
    '  gl_Position = vec4(screenPos + a_quad * pixelSize, 0.0, 1.0);',
    '}'
  ].join('\n');

  var PARTICLE_RENDER_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in float v_activation;',
    'in float v_phosphorId;',
    'out vec4 o_color;',
    '',
    '// Phosphor colors (6 groups)',
    'const vec3 PHOSPHORS[6] = vec3[6](',
    '  vec3(0.910, 0.192, 0.227),',  // Red #e8313a
    '  vec3(0.961, 0.843, 0.259),',  // Gold #f5d742
    '  vec3(0.290, 0.643, 0.878),',  // Cyan #4aa4e0
    '  vec3(0.200, 1.000, 0.200),',  // Green #33ff33
    '  vec3(1.000, 0.667, 0.000),',  // Amber #ffaa00
    '  vec3(0.878, 0.251, 0.878)',   // Magenta #e040e0
    ');',
    '',
    'void main() {',
    '  int pid = clamp(int(v_phosphorId), 0, 5);',
    '  vec3 color = PHOSPHORS[pid];',
    '  float alpha = mix(0.15, 1.0, v_activation);',
    '  o_color = vec4(color * alpha, alpha);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add ASCII conversion shader**

```js
  // ─── GLSL: ASCII Conversion ──────────────────────────────────
  var ASCII_VERT = PARTICLE_INIT_VERT;

  var ASCII_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_sceneTex;',
    'uniform sampler2D u_fontAtlas;',
    'uniform vec2 u_resolution;',
    'uniform float u_displayScale;',
    'uniform float u_ditherStrength;',
    'uniform int u_glyphRamp[6];',
    'uniform int u_rampLength;',
    '',
    '// 32-color CRT phosphor palette',
    'const vec3 PALETTE[32] = vec3[32](',
    '  vec3(0,0,0), vec3(0.067,0.067,0.067), vec3(0.133,0.133,0.133),',
    '  vec3(0.267,0.267,0.267), vec3(0.400,0.400,0.400), vec3(0.533,0.533,0.533),',
    '  vec3(0.667,0.667,0.667), vec3(0.800,0.800,0.800), vec3(0.910,0.878,0.816),',
    '  vec3(0.961,0.961,0.941),',
    '  vec3(0.392,0.078,0.078), vec3(0.706,0.157,0.157), vec3(0.910,0.192,0.227),',
    '  vec3(0.471,0.353,0.0), vec3(0.784,0.627,0.078), vec3(0.961,0.843,0.259),',
    '  vec3(0.627,0.392,0.0), vec3(1.0,0.667,0.0),',
    '  vec3(0.039,0.235,0.353), vec3(0.290,0.643,0.878), vec3(0.0,0.898,0.898),',
    '  vec3(0.059,0.314,0.059), vec3(0.157,0.627,0.157), vec3(0.200,1.0,0.200),',
    '  vec3(0.353,0.078,0.353), vec3(0.878,0.251,0.878),',
    '  vec3(0.353,0.216,0.118), vec3(0.549,0.353,0.196),',
    '  vec3(0.706,0.510,0.314), vec3(0.824,0.686,0.510),',
    '  vec3(0.078,0.118,0.235), vec3(0.235,0.314,0.549)',
    ');',
    '',
    '// Bayer 4x4 dither matrix',
    'const float BAYER[16] = float[16](',
    '  0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,',
    ' 12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,',
    '  3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,',
    ' 15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0',
    ');',
    '',
    'out vec4 o_color;',
    '',
    'vec3 nearestPaletteColor(vec3 c) {',
    '  float bestDist = 1e10;',
    '  vec3 best = vec3(0.0);',
    '  for (int i = 0; i < 32; i++) {',
    '    vec3 diff = c - PALETTE[i];',
    '    float d = dot(diff, diff);',
    '    if (d < bestDist) { bestDist = d; best = PALETTE[i]; }',
    '  }',
    '  return best;',
    '}',
    '',
    'void main() {',
    '  float tileW = 8.0 * u_displayScale;',
    '  float tileH = 16.0 * u_displayScale;',
    '',
    '  // Which character cell are we in?',
    '  vec2 pixel = v_uv * u_resolution;',
    '  vec2 cell = floor(pixel / vec2(tileW, tileH));',
    '  vec2 cellCenter = (cell + 0.5) * vec2(tileW, tileH) / u_resolution;',
    '',
    '  // Sample scene at cell center',
    '  vec3 sceneColor = texture(u_sceneTex, cellCenter).rgb;',
    '',
    '  // Luminance (BT.709)',
    '  float lum = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));',
    '',
    '  // Bayer dither',
    '  ivec2 cellI = ivec2(cell);',
    '  int bayerIdx = (cellI.y % 4) * 4 + (cellI.x % 4);',
    '  float dither = (BAYER[bayerIdx] - 0.5) * u_ditherStrength;',
    '  float ditheredLum = clamp(lum + dither, 0.0, 1.0);',
    '',
    '  // Glyph selection from ramp',
    '  int glyphIdx = int(ditheredLum * float(u_rampLength - 1) + 0.5);',
    '  glyphIdx = clamp(glyphIdx, 0, u_rampLength - 1);',
    '  int cp437Index = u_glyphRamp[glyphIdx];',
    '',
    '  // Atlas UV: 16 cols x 16 rows, each tile 8x16',
    '  float atlasCol = float(cp437Index % 16);',
    '  float atlasRow = float(cp437Index / 16);',
    '  vec2 subCellUv = fract(pixel / vec2(tileW, tileH));',
    '  vec2 atlasUv = (vec2(atlasCol, atlasRow) + subCellUv) / 16.0;',
    '',
    '  float glyphAlpha = texture(u_fontAtlas, atlasUv).r;',
    '',
    '  // Quantize color to phosphor palette',
    '  vec3 quantized = nearestPaletteColor(sceneColor);',
    '',
    '  o_color = vec4(quantized * glyphAlpha, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 3: Add particle render setup to init()**

After the fluid field setup:

```js
    // ─── Particle Render FBO ─────────────────────────────────────
    var sceneW = canvas.width;
    var sceneH = canvas.height;
    var sceneTex = createFloatTexture(gl, sceneW, sceneH, null);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var sceneFBO = createFBO(gl, sceneTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var particleRenderProg = createProgram(gl, PARTICLE_RENDER_VERT, PARTICLE_RENDER_FRAG);

    // Build instance ID buffer + quad VAO for particle rendering
    var instanceIds = new Float32Array(texSize * texSize);
    for (var i = 0; i < instanceIds.length; i++) instanceIds[i] = i;

    var particleVAO = gl.createVertexArray();
    gl.bindVertexArray(particleVAO);

    // Quad vertices (2 triangles for a small quad)
    var quadData = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance IDs
    var idBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instanceIds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1); // one per instance

    gl.bindVertexArray(null);

    // ─── ASCII Shader ────────────────────────────────────────────
    var asciiProg = createProgram(gl, ASCII_VERT, ASCII_FRAG);

    // ─── Font Atlas ──────────────────────────────────────────────
    var fontAtlasTex = gl.createTexture();
    var fontAtlasLoaded = false;
    var fontImg = new Image();
    fontImg.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, fontAtlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fontImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fontAtlasLoaded = true;
    };
    fontImg.src = (document.querySelector('script[src*="japanjunky-biolum"]') || {}).src
      ? (document.querySelector('script[src*="japanjunky-biolum"]').src.replace(/japanjunky-biolum\.js.*/, 'cp437-font-atlas.png'))
      : 'cp437-font-atlas.png';
```

Note: The font atlas URL is derived from the script's own URL to handle Shopify's asset CDN paths. In Shopify, both assets end up on the same CDN host.

- [ ] **Step 4: Add render functions**

```js
    function renderParticles() {
      // Resize scene FBO if canvas size changed
      if (canvas.width !== sceneW || canvas.height !== sceneH) {
        sceneW = canvas.width;
        sceneH = canvas.height;
        gl.deleteTexture(sceneTex);
        gl.deleteFramebuffer(sceneFBO);
        sceneTex = createFloatTexture(gl, sceneW, sceneH, null);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        sceneFBO = createFBO(gl, sceneTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.viewport(0, 0, sceneW, sceneH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive

      gl.useProgram(particleRenderProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, particlePositions.read);
      gl.uniform1i(gl.getUniformLocation(particleRenderProg, 'u_positionTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, particleVelocities.read);
      gl.uniform1i(gl.getUniformLocation(particleRenderProg, 'u_velocityTex'), 1);

      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_texSize'), texSize);
      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_particleSize'), cfg.particleSize);
      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_activationScale'), cfg.activationScale);
      gl.uniform2f(gl.getUniformLocation(particleRenderProg, 'u_resolution'), sceneW, sceneH);

      gl.bindVertexArray(particleVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, texSize * texSize);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
    }

    function renderASCII() {
      if (!fontAtlasLoaded) return;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(asciiProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_sceneTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fontAtlasTex);
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_fontAtlas'), 1);

      gl.uniform2f(gl.getUniformLocation(asciiProg, 'u_resolution'), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(asciiProg, 'u_displayScale'), cfg.displayScale);
      gl.uniform1f(gl.getUniformLocation(asciiProg, 'u_ditherStrength'), cfg.ditherStrength);
      gl.uniform1iv(gl.getUniformLocation(asciiProg, 'u_glyphRamp'), cfg.glyphRamp);
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_rampLength'), cfg.glyphRamp.length);

      drawQuad(gl, quadVAO);
    }
```

- [ ] **Step 5: Wire render stages into animation loop**

Replace the placeholder clear in `frame()`:

```js
      // Stage 2: Particle render
      renderParticles();

      // Stage 3: ASCII conversion
      renderASCII();

      // Stage 4: Bloom (Task 10 — skip for now, direct to screen)
```

Remove the old placeholder `gl.bindFramebuffer / gl.clear` block.

- [ ] **Step 6: Verify particles appear as ASCII characters**

Open the site. You should see:
- Black background with dim colored ASCII characters (light shades, dots)
- Characters should slowly shift as autonomous bubbles rise and inject fluid forces
- Moving the cursor should create visible disturbance — characters near cursor brighten and activate
- Activation cascades should propagate through the field as colored wave fronts

If characters appear but are too dim/bright, adjust `particleSize` and activation parameters.

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): add particle render + ASCII conversion shader"
```

---

## Task 10: Bloom Post-Process

Add a 2-pass Gaussian blur bloom applied to bright ASCII characters.

**Files:**
- Modify: `assets/japanjunky-biolum.js`

- [ ] **Step 1: Add bloom shaders**

```js
  // ─── GLSL: Bloom Threshold + Downsample ──────────────────────
  var BLOOM_THRESHOLD_VERT = PARTICLE_INIT_VERT;

  var BLOOM_THRESHOLD_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform float u_threshold;',
    'out vec4 o_color;',
    'void main() {',
    '  vec3 c = texture(u_tex, v_uv).rgb;',
    '  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  o_color = lum > u_threshold ? vec4(c, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  // ─── GLSL: Gaussian Blur (separable) ─────────────────────────
  var BLUR_VERT = PARTICLE_INIT_VERT;

  var BLUR_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_direction;',  // (1/w, 0) or (0, 1/h)
    'uniform float u_radius;',
    'out vec4 o_color;',
    '',
    'void main() {',
    '  vec3 result = vec3(0.0);',
    '  float weights[5] = float[5](0.227, 0.194, 0.122, 0.054, 0.016);',
    '  result += texture(u_tex, v_uv).rgb * weights[0];',
    '  for (int i = 1; i < 5; i++) {',
    '    vec2 off = u_direction * float(i) * u_radius;',
    '    result += texture(u_tex, v_uv + off).rgb * weights[i];',
    '    result += texture(u_tex, v_uv - off).rgb * weights[i];',
    '  }',
    '  o_color = vec4(result, 1.0);',
    '}'
  ].join('\n');

  // ─── GLSL: Bloom Composite ──────────────────────────────────
  var BLOOM_COMPOSITE_VERT = PARTICLE_INIT_VERT;

  var BLOOM_COMPOSITE_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_sceneTex;',
    'uniform sampler2D u_bloomTex;',
    'uniform float u_bloomStrength;',
    'out vec4 o_color;',
    'void main() {',
    '  vec3 scene = texture(u_sceneTex, v_uv).rgb;',
    '  vec3 bloom = texture(u_bloomTex, v_uv).rgb;',
    '  o_color = vec4(scene + bloom * u_bloomStrength, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add bloom resources to init()**

After the ASCII shader setup:

```js
    // ─── Bloom ───────────────────────────────────────────────────
    // Render ASCII to an offscreen FBO first, then apply bloom
    var asciiTex = createFloatTexture(gl, sceneW, sceneH, null);
    gl.bindTexture(gl.TEXTURE_2D, asciiTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var asciiFBO = createFBO(gl, asciiTex);

    // Half-res bloom buffers
    var bloomW = Math.max(1, Math.floor(sceneW / 2));
    var bloomH = Math.max(1, Math.floor(sceneH / 2));
    var bloomTexA = createFloatTexture(gl, bloomW, bloomH, null);
    var bloomTexB = createFloatTexture(gl, bloomW, bloomH, null);
    [bloomTexA, bloomTexB].forEach(function (t) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });
    var bloomFBO_A = createFBO(gl, bloomTexA);
    var bloomFBO_B = createFBO(gl, bloomTexB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var bloomThresholdProg = createProgram(gl, BLOOM_THRESHOLD_VERT, BLOOM_THRESHOLD_FRAG);
    var blurProg = createProgram(gl, BLUR_VERT, BLUR_FRAG);
    var bloomCompositeProg = createProgram(gl, BLOOM_COMPOSITE_VERT, BLOOM_COMPOSITE_FRAG);
```

- [ ] **Step 3: Add bloom render function**

```js
    function renderBloom() {
      // Resize bloom buffers if needed
      var newBloomW = Math.max(1, Math.floor(canvas.width / 2));
      var newBloomH = Math.max(1, Math.floor(canvas.height / 2));
      if (newBloomW !== bloomW || newBloomH !== bloomH) {
        bloomW = newBloomW;
        bloomH = newBloomH;
        gl.deleteTexture(bloomTexA);
        gl.deleteTexture(bloomTexB);
        gl.deleteFramebuffer(bloomFBO_A);
        gl.deleteFramebuffer(bloomFBO_B);
        bloomTexA = createFloatTexture(gl, bloomW, bloomH, null);
        bloomTexB = createFloatTexture(gl, bloomW, bloomH, null);
        [bloomTexA, bloomTexB].forEach(function (t) {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        });
        bloomFBO_A = createFBO(gl, bloomTexA);
        bloomFBO_B = createFBO(gl, bloomTexB);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      // Pass 1: Threshold extract to bloom buffer A
      gl.useProgram(bloomThresholdProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, asciiTex);
      gl.uniform1i(gl.getUniformLocation(bloomThresholdProg, 'u_tex'), 0);
      gl.uniform1f(gl.getUniformLocation(bloomThresholdProg, 'u_threshold'), cfg.bloomThreshold);
      drawQuad(gl, quadVAO);

      // Pass 2: Horizontal blur → B
      gl.useProgram(blurProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_B);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexA);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'u_tex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), 1.0 / bloomW, 0);
      gl.uniform1f(gl.getUniformLocation(blurProg, 'u_radius'), cfg.bloomRadius);
      drawQuad(gl, quadVAO);

      // Pass 3: Vertical blur → A
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexB);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), 0, 1.0 / bloomH);
      drawQuad(gl, quadVAO);

      // Pass 4: Composite — ASCII + bloom → screen
      gl.useProgram(bloomCompositeProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, asciiTex);
      gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_sceneTex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexA);
      gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_bloomTex'), 1);
      gl.uniform1f(gl.getUniformLocation(bloomCompositeProg, 'u_bloomStrength'), cfg.bloomStrength);
      drawQuad(gl, quadVAO);
    }
```

- [ ] **Step 4: Update renderASCII to render to offscreen FBO instead of screen**

Change `renderASCII()` to render to `asciiFBO` instead of null:

Replace:
```js
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
```

With:
```js
      // Resize ASCII FBO if canvas changed
      if (canvas.width !== sceneW || canvas.height !== sceneH) {
        gl.deleteTexture(asciiTex);
        gl.deleteFramebuffer(asciiFBO);
        asciiTex = createFloatTexture(gl, canvas.width, canvas.height, null);
        gl.bindTexture(gl.TEXTURE_2D, asciiTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        asciiFBO = createFBO(gl, asciiTex);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, asciiFBO);
      gl.viewport(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 5: Wire bloom into animation loop**

Update `frame()`:

```js
      // Stage 2: Particle render
      renderParticles();

      // Stage 3: ASCII conversion (to offscreen FBO)
      renderASCII();

      // Stage 4: Bloom composite → screen
      renderBloom();
```

- [ ] **Step 6: Verify bloom effect**

Open the site. Activated ASCII characters (bright glyphs from the ramp — `▓` and `█`) should have a visible colored glow bleeding into surrounding dark cells. The effect should be subtle but noticeable, especially when cursor interaction triggers activation waves.

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-biolum.js
git commit -m "feat(biolum): add bloom post-process on ASCII output"
```

---

## Task 11: Visual Tuning and Verification

Final pass to verify everything works together, tune parameters, and clean up.

**Files:**
- Modify: `assets/japanjunky-biolum.js` (parameter tuning only)
- Verify: `layout/theme.liquid`
- Verify: `assets/japanjunky-base.css`

- [ ] **Step 1: Full visual verification checklist**

Open the site and verify each behavior:

1. **Background**: Black canvas with dim colored ASCII characters across the full viewport
2. **Phosphor regions**: Different areas of the screen show different dominant phosphor colors (red, gold, cyan, green, amber, magenta)
3. **Cursor interaction**: Moving the mouse creates visible fluid disturbance — nearby particles brighten and activate
4. **Activation cascades**: When particles activate, the activation wave propagates through neighboring particles via the fluid field, creating chain-reaction light-ups
5. **Autonomous bubbles**: Without any interaction, gentle upward disturbances occasionally trigger soft activation waves from the bottom of the screen
6. **Carousel interaction**: Scrolling through products sends visible ripples through the particle field
7. **ASCII rendering**: Characters range from space (dark) through `·`, `░`, `▒`, `▓`, `█` (bright)
8. **Bloom**: Bright characters have a soft colored glow
9. **All UI above background**: Product carousel, viewer, info panel, Tsuno bubble, taskbar, search bar, calendar all render above the ASCII background and function normally
10. **No console errors**
11. **Reduced motion**: With `prefers-reduced-motion`, one static frame renders then animation stops
12. **High contrast**: With `prefers-contrast: more`, canvas stays black (not initialized)

- [ ] **Step 2: Tune parameters if needed**

Likely adjustments:
- `particleSize`: If characters are too sparse, increase. If too dense, decrease.
- `energyAccumulation` / `energyDecay`: If activations are too frequent, lower accumulation or raise decay. If too rare, do the opposite.
- `bloomStrength`: If glow is too intense or washes out characters, reduce. If invisible, increase.
- `cursorRadius`: If cursor effect is too localized, increase. If too wide, decrease.

- [ ] **Step 3: Commit final tuning**

```bash
git add assets/japanjunky-biolum.js
git commit -m "fix(biolum): tune visual parameters for balanced activation and readability"
```

- [ ] **Step 4: Final commit — push**

```bash
git push
```
