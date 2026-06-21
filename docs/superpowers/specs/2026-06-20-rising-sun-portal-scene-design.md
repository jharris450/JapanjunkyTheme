# Rising Sun over Reflective Water — Scene Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)
**Scope:** Add a portal sky + reflective water composition behind the existing lava-lamp wax. The wax and its physics are unchanged. Splash intro untouched.

## Goal

Turn the lava-lamp background into a Japanese **rising-sun-over-water** scene without changing the wax behaviour:

```
 y=1.0 ┌──────────────────────────┐
       │   ░ PORTAL VORTEX ░      │
       │   spiral, swirls CW      │   SKY  (top 62%)
       │   ◯ rising-sun overlay   │
       │     rotates CCW          │
 y=0.38├════ HORIZON / water ═════┤  reflective surface (ripple + glow)
       │   reflection of the sky  │   WATER (bottom 38%)
       │   (portal+sun mirrored)  │
 y=0.0 └──────────────────────────┘
   the lava wax stays full-screen, rising through the horizon
```

- **Sky** (above the horizon): the portal vortex spiral (recovered from git) with the **rising-sun overlay** composited on top of it; the sun's background is removed and it **rotates counter-clockwise** while the portal swirls clockwise.
- **Horizon** at 38% from the bottom (lower third): the reflective water surface — a glow line + ripple.
- **Water** (below the horizon): a **mirror of the sky** (portal + sun reflected about the horizon), warm-tinted and rippling.
- **Wax orbs**: full-screen, **unchanged** — they keep forming at the bottom pool, rising, cooling, falling, bouncing off the side walls; the ASCII glob and Tsuno carve are unchanged. The wax is the foreground subject; the sky+water is the environment behind it.

## Non-goals

- No change to the wax simulation (`japanjunky-wax-sim.js`) or the wax raymarch/orbs. Convection, wall-bounce, teardrop, pool, ASCII glob, Tsuno reaction all stay exactly as they are.
- No second render target / reflection pass — keep the single-pass pipeline (protects the perf just optimised).
- No new colours — warm palette only (red / gold / orange / portal purple already in the recovered shader). Cyan stays reserved. CRT/monospace styling and the 240p → readPixels → VGA-dither/PS1 pipeline are preserved.
- Splash intro (`japanjunky-splash.js`) untouched.

## Website styling to maintain

- Warm palette; cyan reserved (CD only). The recovered portal shader's warm→purple spiral is kept as-is (purple is already part of the portal, not a new colour).
- The render stays at 240p with the existing VGA dither + PS1 snap — the sky/sun/water all go through it, so they read as part of the same retro scene.
- No rounded-corner / non-CRT motifs introduced; the sun is pixelated by the dither like everything else.

## Architecture — single-pass composite

The wax raymarch shader (`japanjunky-wax-shader.js`) already computes a background colour (currently a flat warm gradient) and then raymarches the wax orbs on top. **Only the background changes**: the flat gradient is replaced by the sky+water composite. The wax orb raymarch is byte-for-byte unchanged.

Per background pixel, by `vUv.y` vs `uHorizon` (0.38):

- **uv.y ≥ horizon (sky):** `skyColor(uvSky)` = portal spiral (procedural) blended with the sun sample.
- **uv.y < horizon (water):** reflect about the horizon → `uvRef = vec2(uv.x, 2*uHorizon - uv.y)`, add a horizontal ripple `uvRef.x += sin(uv.y*FREQ - uTime*SPEED) * AMP * (1 - uv.y/uHorizon)` (amplitude grows toward the bottom), then `skyColor(uvRef)` darkened/warm-tinted for water + a horizon glow band.

`skyColor(uv)` (shared by sky and reflection):
1. **Portal spiral** — ported from the recovered `TUNNEL_FRAG` (commit `35acd2e:assets/japanjunky-screensaver.js`). Evaluated in polar coordinates around a vanishing point on the horizon: `angle = atan(uv.y-horizon, uv.x-0.5)`, `radius = length(...)`; spiral arms `sin(angle*N ± radius*K - uTime*PORTAL_ROT)`; warm→purple palette exactly as recovered. Swirls clockwise (`PORTAL_ROT` sign).
2. **Sun overlay** — sample `uSunTex` (the cut-out PNG, premultiplied alpha) at UV rotated counter-clockwise about the sun centre by `uTime*SUN_ROT` (opposite sign to the portal). Composite over the portal by the sun's alpha. The sun is centred in the sky band.

Then the wax orbs raymarch on top (unchanged), so orbs occlude the sky/water where they are — the wax is the foreground.

## Units (small, isolated)

1. **`tools/risingsun-cutout/build.js`** — Node + `sharp` build script (mirrors `tools/cassette-textures/build.js`). Reads `risingsun.jpg` (source path via arg/env, default the user's Desktop copy), removes the light background (alpha = redness: keep saturated-red sun pixels, drop near-white/grey), trims, and writes **`assets/risingsun.png`** (RGBA, committed). Run once; re-runnable. No runtime chroma-key needed.
2. **`assets/japanjunky-sky.js`** (UMD, returns GLSL string + uniform names; no THREE) — the `skyColor()` GLSL function (portal spiral + sun sample) plus a tiny pure JS helper `reflectUv(uvY, horizon)` and `mirror`/ripple constants, unit-testable. Keeps the portal/sun GLSL out of the already-large wax shader. `japanjunky-wax-shader.js` concatenates this function into its FRAG and calls it for the background.
3. **`assets/japanjunky-wax-shader.js`** — replace the flat-gradient background block with: compute sky (above horizon) / reflected sky (below horizon) via the composed `skyColor()`, horizon glow. New uniforms: `uHorizon`, `uSunTex`, `uSunActive`, `uPortalRot`, `uSunRot`, ripple consts. Orb raymarch unchanged.
4. **`assets/japanjunky-screensaver.js`** — load `risingsun.png` (`THREE.TextureLoader`, NearestFilter), set `uSunTex`/`uSunActive`; pass `uHorizon`; advance `uTime` already drives the rotations in-shader (no per-frame JS needed beyond what exists). If the texture is missing, `uSunActive=0` (portal + water still render).
5. **`layout/theme.liquid`** — add `risingSun: {{ 'risingsun.png' | asset_url | json }}` to `JJ_SCREENSAVER_CONFIG`.

## Sun background removal (the image edit)

Source: `C:\Users\Jacob\Desktop\risingsun.jpg` — saturated red rays + centre disc on a near-white/light-grey background. `build.js` with `sharp`:
- For each pixel, alpha = `clamp((R - max(G,B)) / k, 0, 1)` (or a luminance/whiteness threshold) → red stays opaque, light background → transparent. Tune the threshold so ray edges stay clean.
- Trim transparent margins; output `assets/risingsun.png`. The red is the brand red — on-palette.

## Render order (per frame)

```
clear
→ wax ortho pre-pass: skyColor (sky) / reflected skyColor (water) background,
  THEN raymarch wax orbs on top  (single pass, single shader)
→ scene pass (rising bubble motes, Tsuno, speech bubble)
→ readRenderTargetPixels → VGA dither → blit
```

No extra render target. The reflection is a second `skyColor()` evaluation only in the bottom 38% — modest cost relative to the 40-step orb raymarch.

## Performance

- One `skyColor()` eval per background pixel (sky), two in the water band (the reflection). `skyColor` is a few `sin()` + one texture fetch — cheap next to the raymarch.
- Sun is one texture sample (NearestFilter, small).
- No new passes, no readback changes. Reduced-motion still renders one static frame; high-contrast still disables. If perf regresses on low-end, the ripple/reflection detail and portal arm count are the dials.

## Testing

- Unit tests (vitest) for the pure helpers in `japanjunky-sky.js`: `reflectUv(y, horizon)` mirrors correctly about the horizon; ripple amplitude is zero at the horizon and grows toward the bottom; exported `skyGlsl` string contains `skyColor` and the expected uniform names.
- Wax-shader sanity test: FRAG contains the new uniforms (`uHorizon`, `uSunTex`, `uSunActive`, `uPortalRot`, `uSunRot`).
- **Visual UNVERIFIED** — no headless WebGL. Horizon position, portal/sun rotation feel, ripple strength, sun size/placement, water tint, and the sun cut-out threshold all need a browser pass. All exposed as constants/uniforms. The user can also `/watch`-style screenshot for tuning.

## Open tunables (defaulted, adjustable in the browser pass)

- `uHorizon` 0.38; portal `PORTAL_ROT` (CW) and sun `SUN_ROT` (CCW) speeds; sun size + centre; ripple `FREQ`/`SPEED`/`AMP`; water darken/tint; horizon glow width; sun cut-out alpha threshold (`build.js`).
