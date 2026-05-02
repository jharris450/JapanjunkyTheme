# PS1 Horror Three.js Scene — Authoring Guidelines

**Date:** 2026-05-02
**Source:** transcript of PS1-horror tutorial (transcribe.txt) + concept4.jpg + concept5.jpg
**Replaces:** prior abstract/geometric forest design

These are the rules every Three.js scene in this project must follow when targeting the PS1 horror look (Silent Hill 1, Resident Evil 1, Echo Night).

---

## 1. Geometry — keep it brutally low-poly

| Object class | Triangle budget |
|--------------|-----------------|
| Average scenery prop | 10-500 tris |
| Hero/character mesh | 500-1000 tris |
| Background detail | 50 tris max |

Cylinders, cones, spheres should use **4-6 radial segments**, not 8+.

**Trees, bushes, grass, banners, foliage:** **never use 3D geometry**. Build them as **two flat textured planes crossed orthogonally (X-billboards)**. One plane at 0°, second plane rotated 90° around Y. Both use the same alpha-cutout silhouette texture. This is the PS1 trees rule.

Don't try to model a tree with cone-stack foliage. It looks wrong.

## 2. Textures — small, point-sampled, muted

| Rule | Value |
|------|-------|
| Max texture size | 256×256 |
| Common sizes | 64×64, 128×128 |
| `magFilter` | `THREE.NearestFilter` (always) |
| `minFilter` | `THREE.NearestFilter` |
| Mipmaps | disabled (no anisotropic) |
| Palette | low brightness, desaturated, no pure whites |
| Pixel edges | visible — UV map so individual pixels show |

For horror palette: cool grays, sickly greens, dim umber, muted blue. Avoid vivid saturation. The sky can have a sunset gradient, but the **scene** stays muted — colors come from the sky behind silhouettes, not from the props themselves.

## 3. Affine texture warping (REQUIRED)

PSX had no perspective-correct UV interpolation. Textures wobble across triangle edges as the camera moves. This is a defining look — without it, the scene reads as "cleaned-up retro" not authentic PS1.

**Implementation in WebGL1 (Three.js default-compatible):**

```glsl
// vertex shader — pre-multiply uv by w
varying vec2 vUvAffine;
varying float vWAffine;
void main() {
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clipPos;
  vUvAffine = uv * clipPos.w;
  vWAffine  = clipPos.w;
}

// fragment shader — divide back by interpolated w
varying vec2 vUvAffine;
varying float vWAffine;
void main() {
  vec2 uv = vUvAffine / vWAffine;
  gl_FragColor = texture2D(uTexture, uv);
}
```

The GPU perspective-corrects both varyings; dividing them gives back the affine (non-corrected) UV that PS1 produced.

Apply via `onBeforeCompile` injection on every textured material — same pattern as the existing vertex-snap injection.

## 4. Vertex jitter (REQUIRED — already implemented)

```glsl
gl_Position.xy = floor(gl_Position.xy * uResolution / gl_Position.w)
              * gl_Position.w / uResolution;
```

Quantizes clip-space to integer pixel grid. Models snap as camera moves. Resolution typically 240 (matches our render target).

Combine with affine warp — both injections live in the same `onBeforeCompile` hook.

## 5. Fog — heavy, near, opaque

PS1 hardware couldn't draw far. Fog hid the draw-distance cutoff. For horror this is a **feature**: the fog *is* the dread.

| Preset | near | far | Notes |
|--------|------|-----|-------|
| Hero/home | 4-8 | 18-30 | trees fade by ~20 units |
| Interior/close | 2-5 | 12-20 | very tight |
| Open landscape | 8-15 | 40-60 | rare |

Fog color matches sky horizon color, not the scene's lit color. Use `THREE.Fog` (linear, not exponential — looks more PSX-y).

## 6. No real lighting

PS1 had no per-pixel lights. Vertex-colored geometry + texture multiply only.

- `MeshBasicMaterial` always (no Lambert/Phong).
- Bake AO into vertex colors (darken bottoms, lighten tops).
- A SINGLE point light is acceptable for one specific zone-tagged effect (a lantern flicker, etc.). Don't lean on it.

## 7. Render pipeline — already wired

- Render scene to `WebGLRenderTarget` at 240p (matches PSX framebuffer ratio).
- Apply phosphor LUT pass (RTT, optional).
- Read pixels back to CPU.
- VGA palette quantize + Floyd-Steinberg dither (japanjunky-screensaver-post.js).
- Display on 2D canvas with `image-rendering: pixelated`.
- Browser upscales to viewport.

This pipeline is non-negotiable — the dither is what makes the colors read as PSX.

## 8. Composition — tells a story in two glances

Concept references (concept4.jpg + concept5.jpg) show:
- A **path** receding into mist (vanishing-point composition).
- **Trees flanking the path** (frames the eye toward the vanishing point).
- **Foreground anchors** (rocks, grass, foliage) on left + right sides.
- Sky takes ~30-40% of the frame for atmospheric weight.
- One or two strong silhouette elements (a tree close to camera, a rock outcrop) anchor the foreground.
- Distant **silhouette layer** suggests further forest beyond fog.

Don't scatter random props. Pick a vanishing point and arrange everything to reinforce it.

## 9. Animation — spare and slow

PS1 horror moves at 15-24 FPS. Keep animations:
- **Slow** — wind drift over 4-8s cycles, not 0.5s.
- **Subtle** — small amplitude (0.05-0.2 units), small angles (1-3°).
- **Sparse** — most things motionless. A few drifting elements (fog wisps, falling leaves) carry the whole scene's "alive" feel.

Avoid:
- Fast oscillation
- Large amplitude motion
- Many objects animating in lockstep
- Bouncy / elastic / overshoot eases

## 10. What NOT to include

These break the PS1 look:
- Smooth shading / Gouraud-style gradients on geometry
- Bloom / glow shaders (overused in modern retro tributes)
- Volumetric lighting / true god rays (use a billboard fake at most)
- Soft shadows
- Anti-aliasing
- Particle systems with 100+ particles
- Sub-pixel anti-aliased text
- Modern web typography (use bitmap fonts already in this project)
- Smooth camera motion (PS1 cameras snapped; ours uses subtle handheld float to invoke this)

## 11. Concrete recipe for a forest scene

**Trees:** alpha-cutout PNG of a single conifer silhouette (128×256, dark green/near-black, transparent bg). Two-plane X-billboard per tree. Place ~12-20 trees flanking a path, denser near camera, sparser deeper.

**Path:** flat plane, dirt-gravel texture (64×256), repeats Y, runs from camera into vanishing point.

**Rocks:** `DodecahedronGeometry(1, 0)` with rock texture, scaled non-uniformly. 3-5 max.

**Grass tufts:** 32×32 alpha-cutout, billboard plane. ~6-10 along path edges.

**Distant ridge:** single plane at z=60-80 with conifer-silhouette texture, 1024×512.

**Sky:** gradient billboard plane at z=80, drawn first, fog: false.

**Atmosphere:** 8-12 fog wisp billboards (additive, low opacity, drift slowly). Optional 2 god-ray billboards (additive, opacity breath). Sparse falling leaves (instanced quads, 30-60 count).

**Tsuno (existing entity):** stays as-is — texture-billboard with alpha cutout already.

## 12. Quality bar

If you remove the dither pass, the scene should look noticeably worse, not better. The CPU dither is doing 30% of the heavy lifting. Build with it in mind, not despite it.
