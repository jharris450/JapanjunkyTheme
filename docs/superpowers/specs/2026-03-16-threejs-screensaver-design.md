# Three.js Lacquer Screensaver Background — Design Spec

## Overview

A Three.js scene rendered as a fixed background canvas on the JapanJunky homepage. The scene depicts a low-poly Japanese landscape (Mt. Fuji, wireframe ocean, trees) with floating geometric primitives, rotating wireframes, and connected particle lattices. The output is quantized to the VGA 256-color palette with Floyd-Steinberg dithering, rendered at 320×240 and nearest-neighbor scaled up — producing the look of a late-90s Japanese screensaver viewed on a VGA CRT monitor.

### Reference

The color palette is derived from a Japanese lacquerware (makie/蒔絵) panel of Mt. Fuji — deep black, burnished gold, dark indigo, deep green, warm amber, cream — translated through VGA 256-color quantization as if the lacquer art were displayed on a CRT monitor.

### Aesthetic Intent

A sincere late-90s Japanese salaryman's idle screensaver. City pop warmth, not vaporwave irony. **Explicitly not** vaporwave, Tron, or cyberpunk.

---

## Scene Composition

### Mt. Fuji (Background Anchor)
- Low-poly cone/pyramid geometry, ~20-30 faces
- Slight snow cap (cream vertices at peak)
- 2-3 smaller irregular pyramids as foothills flanking the main peak
- Static position — the anchor point of the scene
- Dark silhouette against gold sky, per the lacquer reference

### Wireframe Ocean (Midground)
- Subdivided plane (~30×30 grid) rendered as wireframe
- Vertices displaced by layered sine waves (2-3 frequencies)
- Vertex snapping makes waves "step" between grid positions — chunky undulation
- Extends from Fuji's base toward the camera
- Amber/brown tones near shore, darker toward depth

### Trees (Landmarks)
- 2-3 low-poly trees placed in/near the water at different distances
- Simple geometry construction — ~10-15 faces each, deliberately crude
- Deep green color (mapped to nearest VGA green)
- Static position, subtle vertex jitter from snapping gives them life

### Floating Primitives (Foreground/Midground)
- 6-10 shapes: icosahedrons, octahedrons, tetrahedrons
- Scattered at varying depths around the scene
- Each slowly rotates on 1-2 axes at different speeds
- Drift on gentle sinusoidal paths (organic, not linear)
- React to mouse cursor (see Interaction section)
- Mix of solid and wireframe rendering

### Particle Lattice (Ambient)
- 2-3 small clusters of connected points floating in space
- Each cluster: 8-15 particles connected by thin lines to nearest neighbors
- Clusters slowly rotate and morph (vertices drift on noise paths)
- Wireframe only — no solid faces
- Gold/amber tones — like floating constellations

### Rotating Wireframe Shapes (Accent)
- 1-2 larger wireframe spheres or tori rotating slowly
- Positioned in open space between other elements
- Purely decorative — the "screensaver" signature element
- Indigo/cyan tones for contrast against the warm palette

### Sky / Background
- No skybox or environment map
- Vertical gradient rendered as a full-screen quad behind the scene
- Top: burnished gold → dark amber → deep brown → near-black → bottom: pure black
- Blends with site background at the bottom
- Gets quantized + dithered along with everything else, creating banded sky texture reminiscent of gold leaf clouds in the lacquer reference

---

## Rendering Pipeline

Each frame follows this pipeline:

### 1. Three.js Scene Render (WebGL)
- Scene geometry with lacquer-inspired base colors
- Simple lighting: one directional light + ambient
- Renders to a `WebGLRenderTarget` (offscreen) at low resolution

### 2. Vertex Shader — Grid Snapping
Custom vertex shader snaps transformed positions to a screen-space grid:

```glsl
uniform float resolution; // render height (240.0)

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vec4 clipPos = projectionMatrix * viewPos;

  // Snap to screen-space grid (PS1-style)
  clipPos.xy = floor(clipPos.xy * resolution / clipPos.w)
             * clipPos.w / resolution;

  gl_Position = clipPos;
}
```

This is a simplified excerpt showing only the position snapping. The full implementation uses a custom `ShaderMaterial` that replaces Three.js's built-in materials, handling lighting via a simple directional + ambient calculation in the fragment shader alongside the snapped vertex positions.

Strong/coarse snapping — visible vertex popping as the camera orbits. Closer objects jitter more. Fuji in the background stays relatively stable.

### 3. Render to Offscreen Canvas
- Resolution: 320×240 (configurable: 240p / 360p / 480p)
- Render target uses a fixed 4:3 aspect ratio regardless of viewport — the stretch/squash when mapped to non-4:3 viewports is intentional, matching how VGA content was displayed on various monitors
- Three.js renders to `WebGLRenderTarget`

### 4. Read Pixels to Canvas 2D
- `readPixels()` from WebGL framebuffer to CPU-side `ImageData`
- `readPixels()` is a synchronous GPU stall, but at 320×240 (307KB of pixel data) the cost is negligible — this is orders of magnitude smaller than typical readback bottlenecks at full resolution
- If profiling reveals issues on low-end hardware, fallback option: perform quantization + dithering entirely in a fragment shader (Approach A from brainstorming), eliminating CPU readback

### 5. VGA Palette Quantization
- Map each pixel to nearest color in the standard VGA 256-color palette
- This is a **separate palette** from the site's existing 32-color CRT phosphor palette used in `japanjunky-dither.js` — the screensaver intentionally uses VGA 256 to produce a distinct "PC rendering" look, while the product image dithering uses the CRT phosphor palette for a "monitor displaying" look
- Lacquer colors map to VGA equivalents:
  - Black lacquer → `#000000`
  - Burnished gold → VGA `#AA5500`
  - Gold highlight → VGA `#FFFF55`
  - Deep red → VGA `#AA0000`
  - Dark indigo → VGA `#000055`
  - Deep green → VGA `#005500`
  - Warm amber → VGA `#AA5522` (differentiated from burnished gold)
  - Snow/cream → VGA `#AAAAAA`
- Scene naturally maps to ~20-30 VGA entries across these hue families

### 6. Floyd-Steinberg Dithering
- Reuses the Floyd-Steinberg *algorithm* from `japanjunky-dither.js` but with the VGA 256 palette instead of the CRT phosphor palette
- For each pixel: find nearest VGA color, compute error, distribute to neighbors (7/16 right, 3/16 below-left, 5/16 below, 1/16 below-right)
- At 320×240 = 76,800 pixels per frame. At 24fps target = ~1.8M pixel ops/sec — well within CPU budget

### 7. Display Canvas (Nearest-Neighbor Scale)
```css
canvas.jj-screensaver {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
```
320×240 stretches to viewport. `image-rendering: pixelated` prevents smoothing — chunky VGA pixels for free.

### 8. CRT Overlay (Existing CSS)
- Existing aperture grille, scanlines, vignette on `.jj-crt-frame` pseudo-elements sit on top
- No changes needed to CRT overlay code

---

## Camera & Interaction

### Camera Orbit
- **Path:** Elliptical orbit around Mt. Fuji at ~45° elevation, always keeping Fuji and ocean in view
- **Speed:** One full orbit every ~90-120 seconds
- **Look target:** Fixed point slightly below Fuji's peak
- **Vertical bob:** Gentle sine-wave oscillation (±5% camera height) over ~30 seconds
- **No user camera control:** No click-drag orbit, no scroll zoom. Screensaver, not viewport.

### Mouse Parallax (Camera Offset)
- Mouse position normalized to [-1, 1] from viewport center
- Offsets camera look-target by ±2-3° max in mouse direction
- Lerp toward target at ~0.05 per frame — slow, dreamy response
- Eases back to center over ~2 seconds when mouse leaves or stops
- Disabled on mobile

### Object Cursor Reaction
- **Affected objects:** Floating primitives + particle lattice clusters only. Fuji, ocean, trees are static.
- **Method:** Raycast from mouse into scene each frame. Objects within ~3 world units of the ray receive repulsion force.
- **Repulsion:** Gentle push away from ray, inverse-square falloff. Max displacement ~0.5 world units.
- **Return:** Objects drift back to original orbit path over ~3 seconds (spring-like damping at ~0.97 per frame)
- **Vertex snapping interaction:** Repulsion displacement also gets grid-snapped, so objects "pop" between positions rather than sliding smoothly

---

## Theme Integration

### New Files
| File | Purpose |
|------|---------|
| `assets/three.min.js` | Three.js library (r160+, ~700KB min / ~150KB gzip). Bundled as Shopify asset rather than CDN to avoid external dependency. A custom stripped build excluding unused modules (audio, loaders, animation system) could reduce this. |
| `assets/japanjunky-screensaver.js` | Scene setup, geometry, orbit, interaction, render loop |
| `assets/japanjunky-screensaver-post.js` | VGA quantization + Floyd-Steinberg dithering. Exposes a global `JJ_ScreensaverPost` object with a `dither(imageData)` method. Called by `japanjunky-screensaver.js` after reading pixels from the WebGL framebuffer. |

### Modified Files
| File | Change |
|------|--------|
| `layout/theme.liquid` | Add `<canvas id="jj-screensaver">` as first child of `<body>`, add conditional script loading for homepage |
| `config/settings_schema.json` | Add screensaver settings group |

### DOM Structure
```html
<body class="jj-body">
  <!-- Screensaver layer (behind everything) -->
  <canvas id="jj-screensaver"></canvas>

  <!-- Existing site content (above screensaver) -->
  <div class="jj-crt-frame">
    ...existing header, main, footer...
  </div>
</body>
```

### Z-Index Stack (Back to Front)
| z-index | Element |
|---------|---------|
| 0 | `#jj-screensaver` canvas |
| 1 | `.jj-crt-frame` background |
| auto | Site content (header, columns, footer) |
| 9997 | `.jj-body::before` (damper wires) |
| 9998 | `.jj-crt-frame::before` (aperture grille) |
| 9999 | `.jj-crt-frame::after` (scanlines + vignette) |

### Content Transparency
- Content panels keep opaque black backgrounds
- Screensaver visible through gaps between panels (margins, gutters, page edges)
- Can dial in semi-transparent panels (`rgba(0,0,0,0.85)`) later if desired

### Script Loading
```liquid
{%- if request.page_type == 'index' -%}
  <script>
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }}
    };
  </script>
  <script src="{{ 'three.min.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
{%- endif -%}
```

Homepage only — no performance impact on other pages.

### Shopify Settings
| Setting | Type | Default |
|---------|------|---------|
| `screensaver_enabled` | checkbox | true |
| `screensaver_resolution` | select (240/360/480) | 240 |
| `screensaver_fps` | range (15-30) | 24 |
| `screensaver_orbit_speed` | select (slow/medium/fast) | slow |
| `screensaver_mouse` | checkbox | true |

---

## Performance Safeguards

- **defer loading:** Three.js + screensaver scripts load after HTML parse — no render blocking
- **Tab visibility:** `document.hidden` → pause render loop entirely
- **Scroll pause:** On mobile, observe a sentinel element placed at the fold in the content flow. When the sentinel scrolls out of view (meaning the user has scrolled past the homepage hero area), pause the render loop. The canvas itself is `position: fixed` and never leaves the viewport, so IntersectionObserver targets the sentinel, not the canvas.
- **WebGL fallback:** If context creation fails, silently fall back to plain black bg — no errors, no broken layout
- **prefers-reduced-motion:** Render one static dithered frame, then stop the loop
- **Memory:** At 320×240, offscreen canvas + ImageData is ~300KB

---

## Accessibility

- `<canvas>` gets `aria-hidden="true"` — purely decorative, no semantic content
- `prefers-reduced-motion: reduce` → static frame, no animation
- `prefers-contrast: more` → disable screensaver entirely, fall back to plain black background
- No keyboard focus on the canvas — tab order skips it entirely
- Screensaver does not interfere with existing keyboard navigation
