# Cassette Walkman (Sony WM-F45) — 3D Model Design

**Date:** 2026-06-17
**Status:** Approved (design)
**Part of:** Toolbox Media Players, Tranche 3 (3D models) — the cassette player specifically.

## Overview

Build a photo-textured 3D model of the Sony Sports Walkman WM-F45 (yellow) for the
toolbox cassette player, replacing the Tranche-2 placeholder box when the spawned
tool is `cassette`. The model is a clamshell: the front window-lid hinges open
(open state) to reveal the cassette deck; closed, a real translucent window shows
a low-poly cassette mesh behind it. The model is rendered in a WebGL canvas inside
the player container, reusing the existing product-viewer PS1 pipeline.

Real dimensions: **10.6 cm (W) × 14.0 cm (H) × 4.3 cm (D)** — used as the body's
proportions (portrait brick).

## Reference material

Seven user-supplied photos in `C:\Users\Jacob\Desktop\cassette\` (the user's own
unit): `front.png`, `back.png`, `leftside.png`, `rightside.png`, `top.png`,
`opentop.png`, `openbottom.png`. Observed features:
- **Front**: glossy yellow face; stadium/pill-shaped clear window with a cyan
  border showing the cassette reels + a teal play-direction triangle; SONY mark
  top-left; "WALKMAN / SPORTS / FM·AM" + orange Sony-Sports square bottom-left.
- **Back**: two large knurled round knobs (top), black ribbed battery panel with a
  screw (center), embossed SONY.
- **Right side**: the hinge; the front lid swings open about the right vertical edge.
- **Left side**: black transport buttons row (STOP / FF / REW / PLAY / RADIO).
- **Top**: FM/AM frequency dial scale; black sports clip/handle; "FM/AM STEREO
  CASSETTE PLAYER WM-F45".
- **Open shots**: lid open, showing the deck/well and the lid's inner face (window
  + reel graphic).

Branding (SONY / WALKMAN wordmarks) is reproduced from the user's photos per the
user's explicit decision; the trademark consideration was raised and accepted.

## Decisions (from brainstorming)

- **Style:** photo-textured box (not procedural), rendered through the PS1 shader.
- **Branding:** reproduced (from the user's own photos).
- **Open trigger:** idle = closed; on accepting a matching product the lid opens,
  the cassette settles in, the lid closes, and audio starts (wired into the
  existing accept path). Reels spin while playing.
- **Scope:** build the model AND wire it into the player for the `cassette` tool.
  Record player + CD Walkman keep their placeholder boxes until their references
  are provided.

## Known technical constraints (called out, accepted)

- **No perspective warp:** `sharp` (the only image tool here) crops/resizes/extracts
  but cannot rectify a tilted photo. Front/back/top are near-straight-on and texture
  cleanly; left/right side and open-shot textures carry mild baked-in perspective
  skew. The front (hero) face is prioritized; thin side faces are low-scrutiny.
- **THREE availability:** the player runs site-wide (taskbar footer). The model
  needs `THREE` (global) + the PS1 shader pipeline on the page. If `THREE` is not
  present on a given page, the player falls back to the Tranche-2 placeholder box
  (graceful, no error).
- The model is visual only. Physics, drag-to-player, format gating, and audio
  (Tranches 2/4/5) are untouched and continue to drive behavior.

## Components

### 1. Texture preprocessing — `tools/cassette-textures/build.js` (+ committed outputs)
- A Node script using `sharp` that reads the 7 source PNGs (path configurable;
  default the user's desktop folder) and writes cropped, power-of-two textures to
  `assets/` (e.g. `cassette-front.png`, `cassette-back.png`, `cassette-left.png`,
  `cassette-right.png`, `cassette-top.png`, `cassette-deck.png` (openbottom),
  `cassette-lid-inner.png` (opentop)).
- The front output additionally has the **window region cut to transparency**
  (alpha) so the window is see-through; the cut rectangle/rounded-rect is a
  constant derived from the front crop.
- Outputs are committed so the build is reproducible without re-running, and so the
  theme works without the source photos present.

### 2. Model builder — `assets/japanjunky-cassette-model.js`
- **Does:** builds and returns a `THREE.Group` for the Walkman.
  - Body box (proportions 10.6 : 14.0 : 4.3), faces = the cropped textures via the
    PS1 `ShaderMaterial` (NearestFilter, matching product-viewer).
  - Lid sub-group (front panel) pivoted at the right vertical edge; front texture
    with the alpha window; a translucent cyan pane in the window opening.
  - Cassette sub-mesh (flat box + two reel hubs/rings) seated in the well behind
    the window.
  - Interior deck + lid-inner textures revealed when open.
- **Interface:**
  - `JJ_CassetteModel.build(THREE, assetUrl)` → `{ group, setOpen(t), setPlaying(b), update(dt) }`.
    - `assetUrl(name)` resolves a texture filename to its Shopify asset URL (the
      theme passes a resolver; tests/preview can pass a stub).
    - `setOpen(t)`: t in [0,1] → lid rotation 0→~110°.
    - `setPlaying(b)`: start/stop reel spin.
    - `update(dt)`: advances reel spin while playing.
- **Depends on:** `THREE` (passed in), the committed textures.
- **Pure-ish seam:** the lid-angle mapping (`t → radians`) and the open/close
  animation easing are small pure functions, unit-testable without WebGL.

### 3. Player integration — `assets/japanjunky-player.js` (+ a thin renderer)
- When `spawn(tool, …)` is called with `tool === 'cassette'` and `THREE` is
  available, mount a `<canvas>` in the player container and render the model via a
  small per-player renderer (reusing the product-viewer PS1 setup: WebGLRenderer
  alpha, PerspectiveCamera, the PS1 vertex/fragment shaders). Otherwise keep the
  placeholder label box.
- Drive `setOpen`/`setPlaying`:
  - On `tryLoadProduct` accept for a cassette: play the open→insert→close beat,
    then call audio (existing `JJ_PlayerAudio.play`). `setPlaying(true)`.
  - On `stop`/despawn/new drop: `setPlaying(false)`, close lid.
- The model render loop is independent of the physics loop (physics moves the
  container; the model just spins/animates inside it).

## Data flow

```
build.js (sharp) --crops/alpha--> assets/cassette-*.png (committed)
player.spawn('cassette') --THREE?--> mount canvas + JJ_CassetteModel.build(THREE, assetUrl)
   render loop: model.update(dt)
tryLoadProduct(accept, cassette) -> model.setOpen(1)->insert->setOpen(0) -> JJ_PlayerAudio.play; model.setPlaying(true)
stop/despawn -> model.setPlaying(false); model.setOpen(0)
```

## Error handling
- Missing texture / load failure → that face falls back to a flat color (yellow body
  / black accents); the model still renders.
- `THREE` absent → placeholder box (graceful).
- WebGL context creation failure → placeholder box.
- `build.js` run without source photos present → clear error listing the expected
  files; committed textures remain the source of truth for the theme.

## Testing
- **Unit (Vitest):** the pure lid-angle/easing helpers (`t → radians`, clamp,
  open/close interpolation) extracted from the builder.
- **Manual (browser):** spawn the cassette player; confirm the yellow body + window;
  cassette visible through the window; drop a matching cassette product → lid opens,
  cassette inserts, lid closes, reels spin, audio plays; mismatch still rejects;
  despawn stops + closes; placeholder box still used for record/CD.
- **Texture build:** run `node tools/cassette-textures/build.js`; confirm the seven
  `assets/cassette-*.png` outputs and the front's transparent window.

## Build tranches (this sub-feature)
1. **Texture prep** — `build.js` + committed `assets/cassette-*.png` (incl. front alpha window).
2. **Model builder** — `japanjunky-cassette-model.js` + unit-tested angle/easing helpers + a standalone preview to eyeball it.
3. **Player integration** — mount the WebGL canvas + render the model for the `cassette` tool; wire open/insert/close + reel spin into the accept/stop paths; placeholder fallback.

## Out of scope
- Record player + CD Walkman models (await their references).
- The cassette drag-ghost graphic (Tranche 4 used a placeholder; the cassette mesh
  built here can be reused for it later).
- Any change to physics, drag, format gating, or audio behavior.
