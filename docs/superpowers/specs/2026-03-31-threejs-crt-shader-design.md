# Three.js CRT Shader — Design Spec

**Date:** 2026-03-31
**Inspiration:** Codetaur's Three.js/WebGPU CRT shader UI system (@codetaur on X)
**Reference monitor:** Sony BVM-D14H5U 14" HR Trinitron

## Problem

The current CRT filter is pure CSS overlays (gradients for scanlines, aperture grille, vignette, barrel distortion via border trick). While performant and authentic to spec, it has significant limitations:

- No actual content distortion (barrel effect is visual framing only)
- Scanlines barely visible at normal zoom
- No chromatic aberration, bloom, or beam scanning
- Static — doesn't respond to content brightness
- Effects are so subtle most users don't consciously notice them

## Goal

Replace the CSS CRT overlays with a hybrid SVG + Three.js system that produces clearly visible, GPU-accelerated CRT effects with real barrel distortion on DOM content — while preserving Shopify Liquid templating and full page interactivity.

## Architecture: 2-Layer Hybrid

### Layer 1: SVG Barrel Distortion (on the DOM)

An inline SVG `<feDisplacementMap>` filter applied to the page content wrapper. This barrel-distorts all DOM content natively.

**How it works:**
1. On page load, a small JS function generates a barrel distortion displacement map in a 256x256 canvas
   - R channel encodes horizontal displacement (128 = neutral, <128 = shift left, >128 = shift right)
   - G channel encodes vertical displacement (same encoding)
   - Displacement magnitude increases quadratically from center to edges (barrel curve)
2. The canvas is converted to a data URL and injected as the `in2` source of an SVG `<feDisplacementMap>` filter
3. The filter is applied to `#jj-crt-content` wrapper via `filter: url(#jj-crt-barrel)`
4. The `scale` attribute controls distortion intensity (~12-18px at edges)

**Properties:**
- GPU-accelerated by the browser's compositor
- Zero JS cost per frame (declarative filter)
- Full interactivity preserved (DOM elements are still there, just visually displaced)
- Click targets remain accurate (browser maps pointer events through the filter)
- Works on all content: text, images, Liquid-rendered HTML, iframes

### Layer 2: Three.js Fullscreen Shader Overlay

A `<canvas>` element with `pointer-events: none` rendered by Three.js, sitting above all page content. A single fullscreen quad with a fragment shader implements all CRT post-processing effects.

**Shader effects (fragment shader on fullscreen quad):**

1. **Scanlines** — Horizontal lines with Gaussian brightness profile. Much more visible than the current CSS approach. Intensity modulated by vertical position to simulate beam focus variation. Period: ~3-4px at 1080p.

2. **Trinitron aperture grille** — Vertical RGB phosphor stripe pattern. Continuous stripes (not shadow mask dots). 3.2px period matching D14H5U 0.25mm pitch. More visible than current 0.06-opacity CSS gradient.

3. **Chromatic aberration** — RGB channel offset increasing toward screen edges. Simulates convergence error where the three electron beams don't perfectly align at the phosphor surface. Subtle at center, 1-2px offset at extreme edges.

4. **Bloom / phosphor glow** — Bright areas bleed light into surrounding pixels. Two-pass: downsample bright regions, Gaussian blur, composite back additively. Simulates phosphor excitation spreading through the glass.

5. **Vignette + tube depth** — Radial darkening from center to edges, steeper than CSS version. Combined with the barrel-distorted overlay, creates convincing tube depth.

6. **Beam scanning** (optional, toggleable) — Progressive line-by-line paint simulating the electron beam. A horizontal bright band sweeps from top to bottom at ~60Hz. Inspired directly by codetaur's dual-mode approach (beam scan vs. full refresh).

7. **Screen flicker** — Subtle brightness oscillation at ~30Hz (half the "refresh rate"). Amplitude: 1-3% brightness variation. Barely perceptible but adds subconscious CRT feel.

8. **Barrel distortion on overlay** — The shader itself applies barrel distortion to its own effects (scanlines, grille, vignette) so they curve to match the SVG-distorted content beneath.

**Three.js setup:**
- `THREE.WebGLRenderer` (WebGL2, not WebGPU — broader browser support)
- `THREE.OrthographicCamera` + single `THREE.PlaneGeometry` fullscreen quad
- `THREE.ShaderMaterial` with custom vertex/fragment shaders
- `requestAnimationFrame` loop for beam scan + flicker animations
- Canvas sized to viewport, resized on window resize

### Layer 3: CSS Fallback

The existing `japanjunky-crt.css` overlays are preserved but conditionally applied only when:
- WebGL is not available
- `prefers-reduced-motion: reduce` is set
- User explicitly disables the shader (future toggle)

Detection: JS checks for WebGL support on load. If available, it adds a `jj-crt-shader-active` class to `<body>` and the CSS hides the old overlay layers via:
```css
.jj-crt-shader-active .jj-crt-overlay::before,
.jj-crt-shader-active .jj-crt-overlay::after,
.jj-crt-shader-active .jj-body::before,
.jj-crt-shader-active .jj-body::after {
  display: none;
}
```

## File Structure

| File | Purpose |
|------|---------|
| `assets/japanjunky-crt-shader.js` | Main entry: initializes Three.js, generates SVG displacement map, manages lifecycle |
| `assets/japanjunky-crt-shader-vert.js` | Vertex shader source (exported as string) |
| `assets/japanjunky-crt-shader-frag.js` | Fragment shader source (exported as string) |
| `assets/japanjunky-crt.css` | Updated: existing CSS + fallback rules when shader is active |
| `layout/theme.liquid` | Updated: adds `#jj-crt-content` wrapper + shader canvas + script tag |

**Note:** Shaders are embedded as JS string exports (not separate .glsl files) because Shopify's asset pipeline doesn't support raw GLSL imports. The JS files use `export const vertexShader = \`...\`` / `export const fragmentShader = \`...\`` patterns.

**Three.js dependency:** Loaded from CDN (`https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js`) via `<script type="module">` or importmap. No npm build step — this is a Shopify theme, not a bundled app.

## Shader Uniforms

| Uniform | Type | Description |
|---------|------|-------------|
| `uTime` | float | Elapsed time in seconds (for beam scan, flicker) |
| `uResolution` | vec2 | Viewport width/height in pixels |
| `uScanlineIntensity` | float | Scanline darkness (0.0-1.0, default 0.15) |
| `uScanlinePeriod` | float | Scanline spacing in pixels (default 3.0) |
| `uGrilleIntensity` | float | Aperture grille visibility (0.0-1.0, default 0.12) |
| `uGrillePitch` | float | Phosphor stripe period in pixels (default 3.2) |
| `uChromaticAberration` | float | Max RGB offset in pixels at edges (default 1.5) |
| `uBloomIntensity` | float | Bloom brightness (0.0-1.0, default 0.08) |
| `uBloomRadius` | float | Bloom blur spread (default 4.0) |
| `uVignetteStart` | float | Vignette inner radius (0.0-1.0, default 0.4) |
| `uVignetteEnd` | float | Vignette outer radius (0.0-1.0, default 1.0) |
| `uVignetteIntensity` | float | Vignette max darkness (default 0.45) |
| `uBarrelDistortion` | float | Barrel curve strength for overlay effects (default 0.03) |
| `uBeamScan` | bool | Enable beam scanning mode (default false) |
| `uBeamWidth` | float | Beam scan band height in scanlines (default 8.0) |
| `uFlickerIntensity` | float | Brightness oscillation amplitude (default 0.02) |
| `uWarmth` | float | D65 warm tint strength (default 0.02) |

## SVG Displacement Map Generation

```
For each pixel (x, y) in a 256x256 canvas:
  // Normalize to [-1, 1]
  nx = (x / 255) * 2 - 1
  ny = (y / 255) * 2 - 1
  
  // Distance from center (squared for barrel curve)
  r2 = nx * nx + ny * ny
  
  // Barrel distortion factor (k controls strength)
  k = 0.15  // tunable
  factor = 1 + k * r2
  
  // Displacement = distorted position - original position
  dx = nx * factor - nx  // = nx * k * r2
  dy = ny * factor - ny  // = ny * k * r2
  
  // Encode as 8-bit (128 = no displacement)
  R = clamp(128 + dx * 128 / maxDisplacement, 0, 255)
  G = clamp(128 + dy * 128 / maxDisplacement, 0, 255)
  B = 128  // unused
  A = 255
```

The `scale` attribute on `<feDisplacementMap>` then controls the final pixel displacement magnitude.

## Performance Considerations

- **SVG filter**: Composited by the GPU, no per-frame JS cost. May cause initial compositing cost on page load. Should be negligible on modern hardware.
- **Three.js overlay**: Single fullscreen quad = 2 triangles. Fragment shader is the only cost. At 1080p that's ~2M fragment invocations per frame. The shader is simple (no texture lookups except bloom), should run well under 4ms on any discrete/integrated GPU from the last 8 years.
- **Bloom**: Most expensive effect. Uses a simplified single-pass approximation (not multi-pass downsample) to keep cost low. Can be disabled via uniform.
- **Beam scanning**: Adds one conditional per fragment. Negligible cost.
- **requestAnimationFrame**: Only runs when tab is visible. Pauses when tab is backgrounded.
- **Reduced motion**: When `prefers-reduced-motion` is set, beam scan and flicker are disabled. Static effects (scanlines, grille, vignette) remain.

## Accessibility

- `prefers-reduced-motion: reduce` → disable beam scan, flicker, and phosphor animations. Static overlay effects remain.
- `prefers-contrast: more` → disable all shader effects, fall back to high-contrast CSS mode (same as current behavior).
- `<canvas>` has `aria-hidden="true"` and `role="presentation"`.
- SVG filter element is `aria-hidden="true"`.
- All effects are purely cosmetic; no content is lost when disabled.

## Migration from Current CSS

The current CSS CRT layers (aperture grille, scanlines, vignette, damper wires, barrel border trick) are replaced by the shader equivalents but NOT deleted. They serve as the fallback. The `jj-crt-shader-active` body class gates which system is active.

Glow utilities (`.jj-glow-subtle`, `.jj-glow-medium`, `.jj-glow-strong`, color-specific glows) and CRT animations (`jj-crt-on`, `jj-crt-off`, `jj-phosphor-decay`, etc.) remain in CSS — they're element-level effects, not full-screen overlays.

## Damper Wires

The two horizontal damper wire shadows at 1/3 and 2/3 height are added to the fragment shader as a simple step function. Same 0.14 opacity, same multiply-blend behavior (only visible on bright content). This replaces `.jj-body::before`.

## Future Extensions

- **Display mode switching** (STN, TFT, Plasma, PROJ, VLM) — swap shader uniforms/code per mode
- **Interactive bloom** — sample page content brightness (via periodic `html2canvas` snapshot at low res) to drive bloom from actual bright areas rather than a uniform glow
- **Convergence drift** — animate RGB channel misalignment over time, simulating aging tube
- **Degauss effect** — triggered animation showing color distortion then settling (the classic CRT degauss wobble)
