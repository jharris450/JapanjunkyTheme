# Bioluminescent ASCII Background — Design Spec

**Date:** 2026-04-02
**Replaces:** `2026-04-01-ascii-crt-renderer-design.md` (DOM-capture ASCII approach), `2026-03-17-portal-screensaver-design.md` (portal vortex), `2026-03-31-threejs-crt-shader-design.md` (CRT overlay shader)
**Inspired by:** [codetaur/ngwnos BioluminescenceScene.ts](https://github.com/ngwnos/files/blob/main/BioluminescenceScene.ts)

## Goal

Replace the portal vortex screensaver and CRT shader overlay with a reactive bioluminescent particle system rendered as ASCII characters. Particles live in a 2D fluid field, accumulate energy from fluid motion, and fire in neuron-like activation cascades — rendered through a CP437 font atlas with phosphor color quantization and bloom glow.

The existing site layout, product carousel, product viewer, Tsuno bubble, taskbar, search bar, product metatag box, and calendar all remain untouched.

## What Gets Removed

### Deleted Files

| File | Reason |
|------|--------|
| `assets/japanjunky-crt-shader.js` | Three.js scanline/grille/vignette/bloom overlay — replaced by ASCII renderer |
| `assets/japanjunky-screensaver.js` | Portal vortex tunnel — replaced by bioluminescent scene |
| `assets/japanjunky-screensaver-post.js` | VGA 256-color post-processor for screensaver — no longer needed |

### Deleted from theme.liquid

- `#jj-crt-shader-canvas` element
- `#jj-screensaver` canvas element
- `<script>` tags loading the 3 deleted JS files
- `window.JJ_SCREENSAVER_CONFIG` block
- `.jj-crt-overlay` div

### Deleted: japanjunky-crt.css

The entire file is deleted. It contained:
- `.jj-crt-overlay::before/::after` (aperture grille, scanlines, vignette)
- `.jj-body::before` (damper wires)
- `.jj-body::after` (barrel distortion glass depth)
- `html.jj-crt-shader-active` filter rule
- `.jj-crt-shader-active` display overrides
- SVG barrel distortion references
- Reusable utilities (relocated to `japanjunky-base.css` — see below)

### Relocated (not deleted)

These utilities from `japanjunky-crt.css` move to `japanjunky-base.css`:
- Spacing scale CSS variables (`--space-*`)
- Extended phosphor color variables (`--jj-green`, `--jj-amber`, etc.)
- Structural gray variables
- `* { border-radius: 0 !important }` rule
- Text glow utilities (`.jj-glow-*`)
- Box glow utilities (`.jj-glow-box--*`)
- ASCII art color classes (`.ascii-*`)
- Border utilities (`.jj-border-*`)
- CRT animations (`@keyframes jj-crt-on/off`, typing cursor, glow pulse, loading spinner, phosphor decay)
- Phosphor text/status utilities
- Image container styles
- Reduced motion rules
- High contrast overrides

### Kept Untouched

- `japanjunky-dither.js` — Floyd-Steinberg on product images (32-color phosphor palette)
- `japanjunky-product-viewer.js` — PS1 vertex snapping on product 3D viewer
- `japanjunky-splash.js` — Splash portal (own pipeline)
- All UI components (taskbar, carousel, product info, calendar, Tsuno, etc.)

## Architecture: 4-Stage WebGL2 Pipeline

Single fullscreen canvas (`#jj-biolum`), single WebGL2 context.

```
Stage 1: Physics Update (render-to-texture GPGPU)
  ├─ Fluid field step (2D velocity texture, ping-pong)
  ├─ Particle state update (position, velocity, energy, activation)
  └─ Inputs: cursor position, carousel events, autonomous bubbles

Stage 2: Particle Render (offscreen FBO)
  └─ Instanced billboard quads, colored by phosphor ID + activation
  └─ Additive blending → offscreen color buffer

Stage 3: ASCII Conversion (fullscreen quad shader)
  └─ Per-cell: luminance → CP437 glyph, color → 32-color phosphor palette
  └─ Samples font atlas, outputs glyph × color on black

Stage 4: Bloom Post-Process
  └─ Bright ASCII characters bleed phosphor glow
  └─ Output to screen canvas
```

## Particle Simulation

### State Textures

RGBA float32 textures, ping-pong pairs:

| Texture | R | G | B | A |
|---------|---|---|---|---|
| Position | x | y | (unused) | phosphor ID |
| Velocity | vx | vy | energy | activation |

At 50k particles: 224×224 texture (224² = 50,176 particles). 4 FBOs total (2 textures × 2 ping-pong).

### Coordinate Space

Normalized screen space [0, 1] × [0, 1]. Particles live in 2D.

### Physics Per Particle Per Frame

1. **Sample fluid field** at particle position → fluid velocity
2. **Accumulate energy** from fluid speed × accumulation rate × sparkle modifier
3. **Check activation**: energy > threshold AND refractory == 0 → fire (activation = 1.0, energy = 0, set refractory timer)
4. **Decay activation** over configurable duration
5. **Decay refractory** timer
6. **Apply forces**: fluid velocity drag, cursor proximity force, noise perturbation
7. **Update position** from velocity
8. **Boundary wrap**: particles exiting [0,1] wrap to opposite edge

### Phosphor Color Assignment

6 phosphor groups assigned at init via spatial hash:

| ID | Color | Hex |
|----|-------|-----|
| 0 | Red | `#e8313a` |
| 1 | Gold | `#f5d742` |
| 2 | Cyan | `#4aa4e0` |
| 3 | Green | `#33ff33` |
| 4 | Amber | `#ffaa00` |
| 5 | Magenta | `#e040e0` |

Assigned via `hash(position) % 6` creating organic Voronoi-like color regions. At rest: dim phosphor color (10-20% alpha). Activated: full brightness. Spatial clustering means activation waves light up in the dominant color of the region they traverse.

### Activation Model (Neuron-Like)

Ported from Codetaur's BioluminescenceScene:

- **Energy accumulation**: `energy += fluidSpeed × accumulationRate × sparkleModifier × dt`
- **Energy decay**: `energy -= decayRate × dt × (1.0 - fluidSpeed)`
- **Threshold check**: `energy > threshold / sparkleModifier AND refractory == 0`
- **Fire**: `activation = 1.0, energy = 0, refractory = refractoryPeriod`
- **Activation decay**: `activation -= dt / activationDuration`
- **Refractory decay**: `refractory = max(0, refractory - dt)`

The sparkle modifier is a per-particle random value (assigned at init) that makes some particles more sensitive than others, creating organic variation in the wave fronts.

### Initialization

Particles distributed uniformly across [0,1]² with small random jitter. Velocities zeroed. Energy and activation zeroed. Phosphor IDs from spatial hash.

## Fluid Field

### Grid

2D Euler fluid field, 128×64 resolution. Stored as RGBA float texture, ping-pong pair.

| Channel | Value |
|---------|-------|
| R | velocity X |
| G | velocity Y |
| B | (unused) |
| A | 1.0 |

### Per-Frame Update

Single fullscreen quad pass:

1. Sample previous velocity at cell (bilinear filtering provides implicit advection)
2. Apply dissipation: `velocity *= (1.0 - dissipation × dt)`
3. Add injections from interaction sources (summed in a separate injection texture)

No pressure projection — dissipation alone maintains stability at this resolution.

### Injection Sources

All sources write to a per-frame injection texture that gets added to the fluid field.

#### Cursor Interaction

- JS tracks `mousemove`, computes velocity from position delta between frames
- Uniforms: cursor position (vec2), cursor velocity (vec2)
- Injection: Gaussian splat at cursor position, velocity = cursor velocity × strength
- Radius: ~5-8% of screen width
- Feel: dragging hand through water

#### Carousel Interaction

- On product scroll/click: JS emits burst event (origin position on screen, direction from scroll)
- Stored in uniform array (max 4 active bursts with position, velocity, age, strength)
- Injection: Gaussian splat per burst, fading over ~1.5 seconds
- Creates visible wave rippling across the field when browsing products

#### Autonomous Bubbles

- JS manages pool of 8-12 virtual bubbles (CPU-side, trivial at this count)
- Each bubble: position (x, y), rise speed, horizontal drift (sine wave), age
- Spawned at random x along bottom edge, rise to top, despawn
- Positions uploaded as uniform array each frame
- Injection: upward velocity in small radius around bubble, conical wake below
- Spawn rate: ~1 bubble every 2-3 seconds for gentle ambient motion
- Bubbles are invisible — pure force injectors, not rendered

## ASCII Rendering

### Particle Render Pass (offscreen FBO)

- Instanced quads, one per particle
- Vertex shader reads position + activation + phosphor ID from state textures
- Billboard size: ~3-5px, scales up slightly when activated (activationScale: 1.5)
- Color: phosphor color × `mix(baseAlpha, activeAlpha, activation)`
- Additive blending — overlapping particles create natural hotspots
- Output: color buffer representing the raw particle scene

### ASCII Conversion Pass (fullscreen quad)

Grid division:
```
cols = floor(viewportWidth / (8 × displayScale))
rows = floor(viewportHeight / (16 × displayScale))
```

Per cell:
1. **Sample** particle render buffer at cell center UV
2. **Luminance**: BT.709 `L = 0.2126R + 0.7152G + 0.0722B`
3. **Bayer 4×4 dither**: add matrix value × ditherStrength to luminance
4. **Glyph selection**: dithered luminance → index in ramp `[32, 250, 176, 177, 178, 219]` (space → full block)
5. **Color quantization**: sampled RGB → nearest color in 32-color CRT phosphor palette (same palette as `japanjunky-dither.js`)
6. **Atlas lookup**: glyph index → UV in CP437 atlas → sample alpha mask
7. **Output**: `glyphAlpha × quantizedColor` on black background

### Glyph Ramp

| Level | CP437 Index | Character | Description |
|-------|-------------|-----------|-------------|
| 0 | 32 | ` ` | Space (empty) |
| 1 | 250 | `·` | Middle dot |
| 2 | 176 | `░` | Light shade |
| 3 | 177 | `▒` | Medium shade |
| 4 | 178 | `▓` | Dark shade |
| 5 | 219 | `█` | Full block |

### Bayer 4×4 Dither Matrix

```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Normalized: `(value / 16.0) - 0.5` then scaled by `ditherStrength`.

### Font Atlas

- **Source**: Ultimate Oldschool PC Font Pack by VileR
- **License**: CC BY-SA 4.0
- **Character set**: CP437 (256 glyphs)
- **Tile size**: 8×16 pixels per glyph
- **Atlas layout**: 16 columns × 16 rows = 256 glyphs
- **Atlas dimensions**: 128×256 pixels
- **Format**: PNG with alpha channel (white glyph on transparent background)
- **Asset**: `assets/cp437-font-atlas.png`

## Bloom Post-Process

Applied to the ASCII conversion output:

- **Threshold**: 0.15 (activated glyphs bloom, dim ones don't)
- **Strength**: 0.6
- **Radius**: 0.3

Bright ASCII glyphs bleed colored light into surrounding black cells — phosphor glow effect. Implementation: Three.js `UnrealBloomPass` or custom 2-pass Gaussian blur on pixels above threshold.

## Integration

### theme.liquid

New canvas element:
```html
<canvas id="jj-biolum" aria-hidden="true" tabindex="-1" style="
  position:fixed;inset:0;width:100%;height:100%;
  z-index:0;pointer-events:none;
"></canvas>
```

Script loading:
```html
<script src="{{ 'three.min.js' | asset_url }}" defer></script>
<script src="{{ 'japanjunky-biolum.js' | asset_url }}" defer></script>
```

### Configuration

```js
window.JJ_BIOLUM_CONFIG = {
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
```

## Files

### New Files

| File | Purpose |
|------|---------|
| `assets/japanjunky-biolum.js` | Complete bioluminescent ASCII renderer (particle sim + fluid + ASCII + bloom) |
| `assets/cp437-font-atlas.png` | CP437 bitmap font atlas (128×256 PNG) |

### Modified Files

| File | Change |
|------|--------|
| `layout/theme.liquid` | Remove old canvases/scripts/configs, add `#jj-biolum` canvas + script |
| `assets/japanjunky-crt.css` | **Delete entirely** after relocating reusable utilities to `japanjunky-base.css`. Remove its `stylesheet_tag` from theme.liquid. |
| `assets/japanjunky-base.css` | Absorb relocated utilities from crt.css |

### Deleted Files

| File |
|------|
| `assets/japanjunky-crt-shader.js` |
| `assets/japanjunky-crt.css` |
| `assets/japanjunky-screensaver.js` |
| `assets/japanjunky-screensaver-post.js` |

## Performance

| Metric | Target | Mitigation |
|--------|--------|------------|
| Desktop FPS | 60fps | 50k particles, 128×64 fluid — within WebGL2 budget |
| Mobile | Disabled | `mobileEnabled: false`, black background fallback |
| GPU memory | ~30MB | 4 particle FBOs + 2 fluid FBOs + font atlas + bloom buffers |
| CPU overhead | Minimal | Only bubble positions (12 objects) + cursor/carousel events on CPU |
| WebGL2 | Required | 97% browser coverage |

## Accessibility

- `aria-hidden="true"` on canvas
- `prefers-reduced-motion: reduce` → render single static frame, pause animation
- `prefers-contrast: more` → skip initialization, clean black background
- `pointer-events: none` — interaction via document-level `mousemove`, no UI interference
