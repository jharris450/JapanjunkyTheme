# Lava Lamp Background — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)
**Scope:** Replace the portal vortex background in `assets/japanjunky-screensaver.js` with a 3D raymarched lava-lamp wax scene. Splash intro (`japanjunky-splash.js`) untouched.

## Goal

The current persistent background ("Portal Vortex Tunnel") reads as out of place. Replace it with a full-bleed lava-lamp scene: bolus wax blobs that rise, stretch, merge, and split. Tsuno Daishi (the existing roaming ghost character) reacts with the wax — when he moves through it, the wax is pushed aside and/or split around him.

Keep the existing color palette exactly (warm red → orange → gold, with green/magenta/gold phosphor reserved for Tsuno's daily moods; cyan stays reserved for the CD format indicator only).

## Non-goals

- No glass-bottle silhouette. Wax is full-bleed abstract background behind site content.
- No change to the splash intro mirror.
- No true depth-interleaving of Tsuno inside the raymarched volume (Tsuno composites on top; the wax reacts around his projected silhouette).
- No new color palette — reuse current warm tunnel palette.

## Existing pipeline (preserved)

`japanjunky-screensaver.js` renders at low resolution (default 240p, viewport aspect) into a `WebGLRenderTarget`, reads pixels back, applies VGA 256-color Floyd–Steinberg dither + PS1 vertex snapping via `JJ_ScreensaverPost`, and blits to a pixelated display canvas. This pipeline, plus the following, is **kept**:

- Tsuno Daishi ghost plane + full personality/mood system (`TSUNO_MOODS`, behaviors, judging, mouse interaction, product reactions).
- Speech bubble (`drawBubble`, bubble/text meshes, `JJ_Portal.setBubbleText` / `setBubbleVisible`).
- Camera presets (`default` / `product` / `login`), mouse parallax.
- Performance safeguards: pause on `visibilitychange` (hidden) and on scroll-past-fold sentinel; 24fps cap; 18fps product-viewing throttle; reduced-motion → one static frame; high-contrast → disabled.
- Public API surface `window.JJ_Portal` (scene, camera, renderer, tsuno, setParallaxEnabled, setProductViewing, setTalking, setBubbleText, setBubbleVisible, triggerTsunoGrab) — unchanged signatures.
- Config plumbing in `layout/theme.liquid` (`JJ_SCREENSAVER_CONFIG`): `enabled`, `resolution`, `fps`, `orbitSpeed`, `mouseInteraction`, `cameraPreset`, `ghostTexture`. `swirlTexture` becomes unused and is removed from config.

## Cut (portal-specific, all ambiance — verify not load-bearing before deleting)

- Cylinder tunnel mesh + `TUNNEL_VERT`/`TUNNEL_FRAG`.
- Far-end starburst glow plane + `GLOW_FRAG`.
- 10 flame portal rings (`RING_CONFIG`, `RING_FRAG`) + ring backlight glow.
- Vortex swirl backdrop (`swirlTexture`, `BACKDROP_FRAG`).
- Memphis leopard backdrop (`memphisScene`, `MEMPHIS_FRAG`, ortho pre-pass).
- Flying album-cover objects (`spawnObject` / `animateObjects` / object pool, layer-1 fragment compositing if used only for these).
- Memory fragments (`spawnFragment` / `animateFragments` / `fragmentPool`).

Implementation note: confirm none of the above is referenced by product-selection logic, `triggerTsunoGrab`, or the bubble before removal. `GLOW_VERT` (the PS1-snapping vertex shader) is reused by other meshes — keep it if bubble motes or any kept mesh still use it; otherwise fold into the wax/bubble shaders.

## Keep & repurpose

- **Sparkles → rising bubble motes.** Reuse the 30-point sparkle system, recolored to the warm palette (amber/gold), drifting slowly upward through the wax, twinkling. (Default decision; mix is a tunable constant.)

## Architecture — three units

### 1. `assets/japanjunky-wax-sim.js` (pure UMD, no THREE, unit-tested)

`window.JJ_WaxSim.create(opts)` → `{ step(dt, tsuno), blobs, reset(seed) }`.

- `blobs`: fixed-capacity array (`MAX_BLOBS = 8`), each `{ x, y, z, radius, temp, active }`.
- Convection model (slow & syrupy — classic lava lamp, roughly one full rise every several seconds):
  - Heat source at bottom edge raises `temp` for blobs near the floor.
  - Buoyancy force ∝ `temp`; hot blobs rise, lose heat with height, cool blobs sink.
  - Lateral slow drift (per-blob phase) so rise is center-biased and sink is edge-biased.
  - Soft top/bottom bounds (bounce/settle, never leave the field).
  - Per-blob radius wobble for the stretch/bulge look.
  - Merge/split is emergent: the metaball field in the shader fuses centers that approach and necks/splits them as they separate. The sim only owns center positions/radii/temps; it does not hard-merge entities.
- Tsuno input each step: `tsuno = { x, y, vx, vy, radius, active }` in field space. When `active`, apply to blobs within `tsuno.radius`: (a) impulse along `(vx, vy)` (push), and (b) radial impulse away from Tsuno center (split/part). The subtractive carve itself is a shader concern; the sim handles the center displacement so blobs physically move out of his path.
- Deterministic & seedable for tests.

### 2. `assets/japanjunky-wax-shader.js` (UMD, returns GLSL + uniform layout)

`window.JJ_WaxShader` → `{ vert, frag, MAX_BLOBS, uniforms() }`.

- Full-frame raymarch (ortho quad, fills the frame — occupies the slot the memphis pre-pass used).
- Uniforms: `uTime`, `uResolution`, `uAspect`, `uBlobs[8]` (vec4 xyz + radius), `uBlobTemp[8]` (float), `uBlobCount`, `uTsuno` (vec4 xyz + radius), `uTsunoActive`, `uHeatGlow`.
- SDF metaball union (smooth-min) raymarched: ~40–56 steps, early-exit on surface hit, max-distance cutoff. Unused blob slots have radius 0 and contribute nothing.
- Tsuno = **subtractive** metaball (smooth subtraction) → carves a void so wax visibly parts/splits around him.
- Surface normal from SDF gradient → cheap diffuse + specular highlight + Fresnel rim for a glass/wax sheen.
- Color = current warm palette only: `vec3(0.4,0.05,0.02)` → `vec3(0.85,0.35,0.05)` → `vec3(0.95,0.75,0.3)`, mapped by height and `temp` (hot gold at the heated bottom, deep red as it cools near the top). Bottom-edge heat glow (`uHeatGlow`). No cyan; green/magenta/gold phosphor stays Tsuno's mood domain.

### 3. `assets/japanjunky-screensaver.js` (wiring)

- Remove the cut meshes/shaders/spawners and their `animate()` calls.
- Build the wax pre-pass (ortho camera + full-frame quad using `JJ_WaxShader`), rendered first each frame to fill the background.
- Each frame: advance `JJ_WaxSim.step(dt, tsuno)`; copy blob positions/radii/temps into the wax uniforms; project Tsuno's world position to screen/field space and compute his frame-to-frame velocity to build the `tsuno` input.
- Keep the scene pass (bubble motes + Tsuno ghost) composited on top, then readPixels + dither as today.
- Drop `swirlTexture` from config consumption; leave `ghostTexture` as-is.

## Render order (per frame)

```
clear
→ wax ortho pre-pass        (fills frame, raymarched metaballs + Tsuno carve)
→ scene pass                (rising bubble motes, Tsuno ghost, speech bubble)
→ readRenderTargetPixels
→ JJ_ScreensaverPost.dither
→ blit to display canvas
```

Tsuno composites on top of the wax. The carve + center-push in the wax around his projected silhouette sells "moving through" without interleaving him into the raymarch. The sim consumes the previous frame's Tsuno position (one-frame lag) — acceptable at 24fps.

## Performance

Raymarching is the main cost. Budget:

- `MAX_BLOBS = 8`, bounded march steps with early-exit and max-distance cutoff.
- 240p default render resolution; quality scales with `settings.screensaver_resolution`.
- Existing 24fps cap, 18fps product-viewing throttle, pause-on-hidden, pause-on-scroll all retained.
- Reduced-motion: render a single static wax frame (sim stepped once), then stop — reuse the existing static-frame path.
- High-contrast: disabled entirely (existing).
- Optional stretch (not baseline): auto-downgrade march steps / blob count if early frames run slow.

## Testing

- Unit tests (vitest, matching `tests/` conventions for `player-physics` / `cassette-math`):
  - Hot blob near the floor gains buoyancy and rises; cooled blob at the top sinks.
  - Lateral drift biases rise toward center, sink toward edges.
  - Tsuno input displaces in-range blob centers along his velocity and away from his center; out-of-range blobs unaffected; `active=false` is a no-op.
  - Blobs stay within soft bounds.
  - Determinism: same seed + same inputs → identical state.
- **Visual NOT verified** — no headless WebGL. Raymarch surface shading, metaball merge/split feel, Tsuno carve depth, heat-glow balance, and bubble-mote recolor all need a live browser pass (same caveat as the cassette model). Tunable constants (convection speed, blob count, mote color mix, step count) exposed for that pass.

## Open tunables (defaulted, adjustable in the browser pass)

- Bubble-mote color: default warm amber/gold.
- Convection cadence: default slow & syrupy (~one rise per several seconds).
- March step count, smooth-min factor, Fresnel strength, heat-glow height.
