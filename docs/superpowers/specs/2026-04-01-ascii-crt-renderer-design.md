# ASCII Character-Grid CRT Renderer — Design Spec

**Date:** 2026-04-01
**Replaces:** `docs/superpowers/specs/2026-03-31-threejs-crt-shader-design.md` (overlay approach)
**Inspired by:** [vibe-coded.com](https://vibe-coded.com) (codetaur's ASCII renderer)

## Goal

Replace the current CRT overlay shader with a full ASCII character-grid renderer that converts the Shopify DOM into a CP437 bitmap font grid with VGA color, ordered dithering, bloom glow, and SVG barrel distortion — while preserving interactive UI elements and the product Three.js viewer as real DOM above the ASCII canvas.

## Architecture: 4-Layer Stack

```
Layer 4 (top)     │ Exempt DOM — buttons, menus, text, product viewer
                  │ Real DOM, pointer-events, z-index above ASCII canvas
──────────────────┤
Layer 3           │ SVG barrel distortion filter on <html> root
                  │ Curves everything (ASCII canvas + exempt elements)
──────────────────┤
Layer 2           │ ASCII Canvas — fullscreen Three.js WebGL quad
                  │ CP437 font atlas, luminance→glyph, Bayer dither
                  │ VGA color gradient, UnrealBloomPass phosphor glow
──────────────────┤
Layer 1 (bottom)  │ Hidden DOM — Shopify page rendered offscreen
                  │ Captured to texture via html2canvas (debounced)
```

## Capture Pipeline

1. The Shopify DOM renders normally but is hidden from view (the hidden layer sits behind the ASCII canvas).
2. `html2canvas` captures the visible page area to an offscreen `<canvas>` element.
   - Capture is debounced/throttled: max 5 FPS, ~200ms between captures.
   - Resolution reduced to `captureScale` (default 0.5×) of viewport dimensions.
   - Elements with `data-jj-ascii-exempt` attribute are excluded from capture (hidden before capture, restored after).
   - Product images (`<img>` tags) inside product zones are excluded — they will be replaced by the Three.js product viewer and should not waste GPU cycles being ASCII-ified.
3. The capture canvas is uploaded as a Three.js `CanvasTexture` and fed to the ASCII shader as the source texture.
4. On scroll, resize, or DOM mutation (observed via `MutationObserver` on body subtree), a new capture is scheduled (debounced).

## ASCII Shader (GLSL Fragment)

### Grid Division

The viewport is divided into a grid of `cols × rows` character cells:

```
cols = floor(viewportWidth / (tileWidth * displayScale))
rows = floor(viewportHeight / (tileHeight * displayScale))
```

Where `tileWidth = 8`, `tileHeight = 16` (standard VGA text mode CP437 proportions).

### Per-Cell Processing

For each cell at grid position `(cx, cy)`:

1. **Sample source**: Read the corresponding pixel from the captured DOM texture at the cell's center UV.
2. **Compute luminance**: BT.709 formula: `L = 0.2126 * R + 0.7152 * G + 0.0722 * B`
3. **Apply Bayer dither**: Add the Bayer 4×4 matrix value (normalized to [-0.5, 0.5] × ditherStrength) to the luminance. Matrix position = `(cx % 4, cy % 4)`.
4. **Select glyph**: Map the dithered luminance to a glyph index via the glyph ramp (6-8 brightness levels from space/empty to full block).
5. **Quantize color**: The source pixel color is quantized to the nearest color in the VGA 256-color gradient palette.
6. **Atlas lookup**: The selected glyph index maps to UV coordinates in the CP437 font atlas texture (16×16 grid of 256 glyphs). Sample the atlas at the sub-cell UV offset to get the glyph alpha mask.
7. **Output**: `finalColor = glyphAlpha * quantizedColor` on a black background.

### Glyph Ramp (Default)

CP437 character indices from darkest to brightest:

| Level | CP437 Index | Character | Description |
|-------|-------------|-----------|-------------|
| 0     | 32          | ` `       | Space (empty) |
| 1     | 250         | `·`       | Middle dot |
| 2     | 176         | `░`       | Light shade |
| 3     | 177         | `▒`       | Medium shade |
| 4     | 178         | `▓`       | Dark shade |
| 5     | 219         | `█`       | Full block |

### Bayer 4×4 Dither Matrix

```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Normalized: `(value / 16.0) - 0.5` then scaled by `ditherStrength`.

### VGA Color Quantization

The standard VGA 256-color palette is baked into a 1D gradient texture (256×1 pixels). Source color is matched to the nearest palette entry by Euclidean distance in RGB space. This gives the authentic CRT phosphor color reproduction.

Color modes:
- `vga` — Full VGA 256-color palette (default)
- `mono-green` — Single green phosphor channel (P1 phosphor)
- `mono-amber` — Single amber phosphor channel (P3 phosphor)

## Bloom Post-Processing

Three.js `UnrealBloomPass` applied after the ASCII render pass in the EffectComposer chain:

- **strength**: 0.8 (how bright the glow is)
- **radius**: 0.4 (how far the glow spreads)
- **threshold**: 0.1 (minimum brightness to bloom)

This creates the phosphor glow effect where lit characters bleed light into surrounding dark areas, matching the CRT aesthetic.

## SVG Barrel Distortion

Retained from the current implementation. An SVG `<filter>` element with `feDisplacementMap` applied to the `<html>` root element via CSS `filter: url(#jj-crt-barrel)`.

- Root element is exempt from creating a new containing block per CSS Filter Effects spec, so `position:fixed` descendants are unaffected.
- The displacement map is generated programmatically on a canvas (R channel = horizontal displacement, G channel = vertical displacement, 128 = neutral).
- `feFlood` (black) + `feComposite` prevents white edges at barrel boundaries.
- Default `barrelStrength: 0.08`.

## Exempt Elements

These elements are rendered as real DOM above the ASCII canvas. They are interactive, readable, and unaffected by the ASCII shader. They ARE affected by the SVG barrel distortion (since it's on `<html>` root).

| Element | Selector | Reason |
|---------|----------|--------|
| Taskbar | `.jj-win95-taskbar` | Interactive menu, clickable |
| Start menu | `.jj-start-menu` | Dropdown menus |
| Ring carousel bar | `.jj-ring__bar` | Search input, filter buttons |
| Product info panel | `.jj-product-info` | Readable text, clickable buttons |
| Product viewer canvas | `#jj-viewer-canvas` | Three.js 3D graphics pipeline |
| Screensaver canvas | `#jj-screensaver` | Own WebGL render pipeline |
| Tsuno bubble | `#jj-tsuno-bubble` | Interactive greeting |
| Splash canvas + button | `#jj-splash, #jj-splash-enter` | Own render pipeline |
| CRT shader canvas | `#jj-crt-shader-canvas` | The ASCII renderer itself |

Implementation:
- Each exempt element gets `data-jj-ascii-exempt` attribute (added by JS on init).
- During html2canvas capture, exempt elements are temporarily hidden (`visibility: hidden`).
- Exempt elements have `position` + `z-index` values that place them above the ASCII canvas (`z-index: 10002`+ or via stacking context).

## What Gets ASCII-ified

Everything NOT in the exempt list:
- Page background and layout chrome
- Ring carousel album covers (the `.jj-ring__stage` area)
- Section headers, decorative elements
- Non-product page content (About, FAQ, policy pages, etc.)
- The old `.jj-crt-overlay` div — entirely replaced by the ASCII shader

## What Does NOT Get ASCII-ified

- Product images — will be replaced by Three.js product viewer, no resources wasted
- Product Three.js canvas — own render pipeline
- Screensaver canvas — own WebGL pipeline
- Splash portal canvas — own render pipeline
- All interactive UI elements listed in the exempt table above

## Font Atlas

- **Source**: Ultimate Oldschool PC Font Pack by VileR
- **License**: CC BY-SA 4.0
- **Character set**: CP437 (256 glyphs)
- **Tile size**: 8×16 pixels per glyph
- **Atlas layout**: 16 columns × 16 rows = 256 glyphs
- **Atlas dimensions**: 128×256 pixels (16×8 wide, 16×16 tall)
- **Format**: PNG with alpha channel (white glyph on transparent background)
- **Asset**: `assets/cp437-font-atlas.png`

## Performance

| Concern | Mitigation |
|---------|------------|
| html2canvas cost | Throttled to max 5 FPS, reduced resolution (0.5×), debounced on events |
| GPU shader cost | Single fullscreen quad, simple texture lookups per cell — lightweight |
| Bloom cost | Single UnrealBloomPass — standard Three.js overhead |
| Texture upload | Only on new capture (max 5/sec), small texture at 0.5× resolution |
| Memory | One capture canvas + one ASCII render target + bloom buffers |
| Mobile | Disabled by default (`mobileEnabled: false`). When enabled: fewer cells, no bloom, lower capture rate |

**Target**: 30 FPS minimum on mid-range desktop hardware (GTX 1060 / M1 equivalent).

## Configuration

```js
window.JJ_ASCII_CRT_CONFIG = {
  // Grid
  displayScale: 1,                              // multiplier on tile size (larger = fewer, bigger cells)

  // Shader
  glyphRamp: [32, 250, 176, 177, 178, 219],    // CP437 indices: space → full block
  ditherStrength: 1.0,                           // Bayer dither intensity (0 = off)

  // Color
  colorMode: 'vga',                              // 'vga' | 'mono-green' | 'mono-amber'

  // Bloom
  bloomStrength: 0.8,
  bloomRadius: 0.4,
  bloomThreshold: 0.1,

  // Barrel distortion (SVG)
  barrelStrength: 0.08,
  barrelScale: 18,
  displacementSize: 256,

  // Capture
  captureScale: 0.5,                             // resolution reduction (0.5 = half viewport)
  captureMaxFPS: 5,                              // max captures per second

  // Mobile
  mobileEnabled: false                           // disable on mobile by default
};
```

Overrides via `window.JJ_ASCII_CRT_CONFIG` object set before the script loads, same pattern as the existing shader.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `assets/japanjunky-crt-shader.js` | **Rewrite** | New ASCII character-grid renderer (replaces overlay shader) |
| `assets/japanjunky-crt.css` | **Update** | Exempt element positioning, remove old overlay-specific styles |
| `assets/cp437-font-atlas.png` | **New** | CP437 bitmap font atlas (128×256 PNG) |
| `layout/theme.liquid` | **Update** | Add html2canvas script tag, update config block name |

## Dependencies

- **Three.js** — already loaded (`three.min.js`), used for WebGL rendering + EffectComposer + UnrealBloomPass
- **html2canvas** — new dependency, vendored as `assets/html2canvas.min.js` (loaded with `defer` before the ASCII renderer script). Source: [html2canvas npm package](https://www.npmjs.com/package/html2canvas), MIT license.
- **CP437 font atlas** — pre-generated PNG committed as `assets/cp437-font-atlas.png`. Generated once from Ultimate Oldschool PC Font Pack glyphs, not a build step. White glyphs on transparent background, 128×256px.

## Migration from Current Shader

The current `japanjunky-crt-shader.js` is completely replaced. The SVG barrel distortion logic is preserved (moved into the new file). The old GLSL CRT fragment shader (scanlines, aperture grille, chromatic aberration, damper wires, vignette) is removed entirely — the ASCII renderer replaces all of that visual character.

The CSS class `jj-crt-shader-active` behavior changes: instead of hiding CSS CRT overlays and enabling the old shader canvas, it now activates the ASCII rendering pipeline and positions exempt elements.

The canvas element `#jj-crt-shader-canvas` is reused for the ASCII renderer output.
