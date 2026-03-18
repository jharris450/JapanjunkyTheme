# Portal Screensaver — Design Spec

## Overview

A Three.js vortex tunnel rendered as a fixed background canvas on the JapanJunky homepage. The viewer is inside a cylindrical portal looking down the barrel toward a bright vanishing point. Holographic rainbow colors churn and swirl across the tunnel walls. Objects (album covers, later CDs/cassettes/hardware) fly past the viewer from behind, tumbling freely as they're sucked toward the center.

The output is quantized to the VGA 256-color palette with Floyd-Steinberg dithering, rendered at 320x240 and nearest-neighbor scaled up — same pipeline as the previous screensaver. PS1-style vertex snapping is retained.

### Reference

- **Yugioh Flash Fusion / Brilliant Fusion** — holographic rainbow oil-slick energy swirl
- **PS2 insert disc screen** — looking down a tunnel, objects flying past into depth
- Full spectrum iridescence, not constrained to the site's lacquer palette

### Replaces

This completely replaces the previous Mt. Fuji / cityscape / ocean screensaver. All old scene geometry (Fuji, Tokyo cityscape, Osaka cityscape, ocean, trees, floating primitives, particle lattices, wireframe shapes, Yamanote train, Shinkansen) is removed. The rendering pipeline, integration points, and performance safeguards are preserved.

---

## Scene Composition

### Camera

- `THREE.PerspectiveCamera` with FOV 60, near 0.1, far 100
- Fixed position at `(0, 0, -1)`, looking toward `(0, 0, 30)`
- No orbit, no user camera control
- Mouse parallax tilts the look-target slightly (see Interaction section)

### Tunnel

- `THREE.CylinderGeometry(3, 3, 40, 12, 20, true)` — radius 3, length 40, 12 radial segments, 20 length segments, open-ended
- Rotated 90 degrees on X-axis so the cylinder axis aligns with Z (default cylinder axis is Y)
- Positioned at `(0, 0, 18)` so it extends from Z=-2 (behind camera) to Z=38
- `side: THREE.BackSide` so the interior faces are rendered
- `depthWrite: false` on the tunnel material so flying objects inside are never clipped by tunnel walls
- Coarse geometry + vertex snapping = visibly polygonal, chunky shifting walls

### Vanishing Point Glow

- `THREE.PlaneGeometry(1.5, 1.5)` at `(0, 0, 36)` — near the far end of the tunnel
- `THREE.MeshBasicMaterial` with white color (`0xFFFFFF`), no lighting needed
- Additive blending (`blending: THREE.AdditiveBlending`) for a soft glow effect
- `depthWrite: false` so it doesn't occlude objects flying past it

### Flying Objects

- Album covers (later: CDs, cassettes, hardware, Japan-related objects)
- 3-5 visible at a time (sparse density, each clearly readable)
- Full free-tumble rotation on all three axes
- `depthWrite: true` — objects occlude each other naturally
- See Flying Objects section for full behavior

### Nothing Else

No landscape, no buildings, no ocean, no trees, no floating primitives, no particle lattices, no wireframe shapes, no trains. Just tunnel + flying objects + vanishing glow.

---

## Portal Tunnel Shader

The tunnel material uses a custom `ShaderMaterial` with procedural holographic color generation. No textures.

### Vertex Shader

PS1 grid-snapping, passing UVs to fragment shader:

```glsl
uniform float uResolution;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vec4 clipPos = projectionMatrix * viewPos;

  // PS1-style screen-space vertex snapping
  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)
             * clipPos.w / uResolution;

  gl_Position = clipPos;
}
```

### Fragment Shader

Procedural holographic swirl. On a `CylinderGeometry`, `vUv.x` maps to the circumference (0→1 wrapping around the tube) and `vUv.y` maps to the length (0→1 along the axis, which becomes depth after rotation).

```glsl
uniform float uTime;
uniform float uSwirlSpeed;
varying vec2 vUv;

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  // Circumferential angle (wraps around tube)
  float angle = vUv.x * 6.2832; // 0→2π

  // Depth along tunnel (0 = camera end, 1 = vanishing point)
  float depth = vUv.y;

  // Holographic hue: spiral from angle + depth banding + time scroll
  float hue = angle * 2.0 + depth * 4.0 + uTime * uSwirlSpeed;
  hue = fract(hue);

  // High saturation, oscillating brightness for energy pulse
  float sat = 0.85 + 0.15 * sin(depth * 6.0 + uTime * 2.0);
  float val = 0.6 + 0.3 * sin(depth * 3.0 - uTime * 1.5);

  // Brightness falloff: brightest near camera and vanishing point
  float falloff = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.7, depth);
  falloff = 0.4 + 0.6 * falloff;
  val *= falloff;

  vec3 color = hsv2rgb(vec3(hue, sat, val));
  gl_FragColor = vec4(color, 1.0);
}
```

Key visual properties:

- **Spiral pattern** from circumferential angle — colors swirl around the tunnel axis
- **Depth banding** — bands of color recede into the distance
- **Time scroll** — continuous churning/flowing
- **Brightness falloff** — bright at mouth and vanishing point, slightly dimmer in middle
- **High saturation** — full spectrum rainbow, not desaturated

After VGA 256-color dithering, the smooth gradients break into dithered bands — the intended aesthetic.

### Swirl Speed

Controlled by the existing `orbitSpeed` Shopify setting, repurposed:
- `slow`: gentle churning (~0.3 radians/sec)
- `medium`: moderate swirl (~0.6 radians/sec)
- `fast`: aggressive churn (~1.0 radians/sec)

---

## Flying Objects

### Spawning

- Objects spawn behind the camera at Z ≈ -2, at a random XY position within 70% of the tunnel radius (max ~2.1 units from center, preventing wall clipping even with lateral drift)
- One new object every ~2-3 seconds to maintain 3-5 visible at a time
- Random selection from the available texture pool
- **When no textures are available** (initial state before album covers are added): the tunnel renders alone with no flying objects. The portal effect stands on its own. Objects begin spawning once at least one texture is loaded.

### Movement

- Fly forward along Z toward the vanishing point
- Accelerate slightly as they go (simulating gravitational pull toward center)
- Start slow near camera, pick up speed as they shrink into distance
- Total flight time: ~4-6 seconds from spawn to despawn
- Small random sinusoidal drift on X and Y — subtle organic wobble, not a straight line
- Drift is clamped to 70% of tunnel radius to prevent wall clipping

### Tumble

- Random rotation velocities on all three axes assigned at spawn
- Full free-tumble, debris-style
- Vertex snapping makes rotation stutter between grid positions

### Geometry

- `THREE.PlaneGeometry` with album cover texture, `side: THREE.DoubleSide`
- Uses `makePS1TextureMaterial` (textured shader with vertex snapping — already exists in codebase)
- `THREE.NearestFilter` on textures for pixelated look before dithering
- Size: ~0.4 world units (tuned so covers are readable when close to camera)

### Despawn

- When an object passes Z > 36 (vanishing point) or scale factor makes it sub-pixel
- Mesh removed from scene, recycled for next spawn

### Extensibility

The spawn function takes a texture and optional size parameter. Adding new object types (CDs, cassettes, hardware) means:
1. Add image to `assets/`
2. Add URL to the config texture pool (see Texture Loading)

The system doesn't care what's on the texture. Different object types can have different quad dimensions if needed (e.g., square for album covers, rectangular for cassette cases).

### Texture Loading

Album cover URLs are injected by `theme.liquid` into the config object, same pattern used for cursor sets:

```liquid
window.JJ_SCREENSAVER_CONFIG = {
  enabled: {{ settings.screensaver_enabled }},
  resolution: {{ settings.screensaver_resolution | default: 240 }},
  textures: [
    '{{ "album-cover-1.png" | asset_url }}',
    '{{ "album-cover-2.png" | asset_url }}'
  ]
};
```

In the standalone `preview-screensaver.html`, texture paths are plain relative paths (`'assets/album-cover-1.png'`).

Textures are loaded via `THREE.TextureLoader` with `NearestFilter` on both `minFilter` and `magFilter`. Images are degraded naturally by the VGA dithering pipeline — no pre-processing needed.

---

## Camera & Interaction

### Camera Position

- Fixed at `(0, 0, -1)`, looking toward `(0, 0, 30)`
- No orbit system (removed)
- No scroll/zoom/drag

### Mouse Parallax

- Mouse position normalized to [-1, 1] from viewport center
- Offsets camera look-target by max ±0.5 world units in XY (at tunnel radius 3, this is a subtle peek toward the edges)
- Lerp toward target at ~0.05 per frame — slow, dreamy response
- Eases back to center when mouse leaves the window (the lerp naturally returns to (0,0) target)
- Disabled on mobile

### No Object Interaction

No raycasting, no cursor repulsion on flying objects. They're moving too fast for meaningful interaction, and it keeps the code simpler.

---

## Rendering Pipeline

### Dual-Canvas Architecture (inherited)

The existing screensaver uses a dual-canvas setup:
1. The original `#jj-screensaver` canvas element from the HTML is hidden (`display: none`) and used as the WebGL rendering surface
2. A second canvas `#jj-screensaver-display` is dynamically created and made visible — this is the 2D canvas that displays the dithered output

This architecture is inherited from the existing code. The new portal scene renders to the hidden WebGL canvas; the dithered result is drawn to the visible display canvas.

### Frame Pipeline

Each frame:

1. **Three.js scene render** — tunnel + flying objects + glow, rendered to `WebGLRenderTarget` at low resolution
2. **Vertex snapping** — PS1-style grid snap in vertex shader (on tunnel geometry and flying object quads)
3. **Offscreen render** — 320x240 (configurable: 240p / 360p / 480p), fixed 4:3 aspect
4. **readPixels** — GPU to CPU readback (negligible at this resolution)
5. **VGA dithering** — `JJ_ScreensaverPost.dither()` on the ImageData (unchanged)
6. **Display canvas** — `putImageData` to visible 2D canvas, `image-rendering: pixelated` for nearest-neighbor upscale
7. **CRT overlay** — existing aperture grille, scanlines, vignette sit on top (unchanged)

---

## Theme Integration

### Files Changed

| File | Change |
|------|--------|
| `assets/japanjunky-screensaver.js` | **Complete rewrite.** New tunnel + portal shader + flying objects + parallax + render loop. All old scene geometry removed. |
| `preview-screensaver.html` | Update description text in preview panels. |
| `layout/theme.liquid` | Add `textures` array to `JJ_SCREENSAVER_CONFIG` for album cover URLs. |
| `config/settings_schema.json` | Update `screensaver_orbit_speed` label from "Camera orbit speed" to "Portal swirl speed". |
| `assets/album-*.png` (new) | Album cover images (provided by user later). |

### Files Unchanged

| File | Reason |
|------|--------|
| `assets/japanjunky-screensaver-post.js` | VGA dithering pipeline — no changes needed. |
| `assets/three.min.js` | Three.js r160 — no changes needed. |

### Orphaned Assets

`assets/glico.png` will no longer be referenced by the screensaver code. It can remain on disk without harm and be cleaned up at the user's discretion.

### DOM Structure

The HTML structure is unchanged. The dual-canvas setup is created dynamically at runtime:

```html
<!-- In HTML (theme.liquid) -->
<canvas id="jj-screensaver" aria-hidden="true" tabindex="-1"></canvas>

<!-- Created dynamically by JS -->
<!-- #jj-screensaver is hidden, used as WebGL surface -->
<!-- #jj-screensaver-display is created and shown, used as 2D display -->
```

### Shopify Settings

Existing settings, with label update:

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| `screensaver_enabled` | checkbox | true | |
| `screensaver_resolution` | select (240/360/480) | 240 | |
| `screensaver_fps` | range (15-30) | 24 | |
| `screensaver_orbit_speed` | select (slow/medium/fast) | slow | Label updated to "Portal swirl speed" |
| `screensaver_mouse` | checkbox | true | |

---

## Performance

**Significantly lighter than previous scene.** One cylinder mesh + 3-5 textured quads + 1 glow plane vs. hundreds of boxes/cylinders for two cityscapes + trains.

### Safeguards (all retained)

- **defer loading:** Scripts load after HTML parse
- **Tab visibility:** `document.hidden` pauses render loop
- **Scroll pause:** IntersectionObserver on sentinel element
- **WebGL fallback:** Context creation failure = silent black bg
- **prefers-contrast: more:** Disable screensaver entirely

---

## Accessibility

- `<canvas>` has `aria-hidden="true"` — purely decorative
- `prefers-reduced-motion: reduce` — render one static dithered frame, then stop the animation loop. The tunnel is visible as a frozen holographic image but does not animate.
- `prefers-contrast: more` — disable screensaver entirely, fall back to plain black background
- No keyboard focus on canvas
- Does not interfere with keyboard navigation
