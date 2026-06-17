# Toolbox Media Players — Design

**Date:** 2026-06-17
**Status:** Approved (design); implementation planned tranche-by-tranche

## Overview

A bottom-right **toolbox** button opens a **fan menu** of three tools: a record
player, a cassette Walkman, and a CD Walkman. The user drags a tool onto the
screen to spawn a physics-driven 3D player (three.js). The player falls under
gravity, bounces off the viewport edges, can never leave the screen, and settles
on top of the taskbar. The user can grab and throw it with the cursor.

The user drags a product onto a player. If the product's format matches the
player type, the player plays the product's audio through an "old speaker" audio
chain. Mismatched format is rejected. Missing or broken audio plays static.

State (which tool is out, and where it rests) persists across page navigations
via `sessionStorage`.

## Goals

- A discoverable, tactile "desktop toy" that reinforces the Win95/CRT aesthetic.
- Reuse existing 3D infrastructure (`japanjunky-product-viewer.js` patterns: per-
  canvas `WebGLRenderer`, PS1 vertex/fragment shaders, transparent clear).
- Format-correct playback: records→record player, cassettes→cassette Walkman,
  CDs→CD Walkman.
- Old-speaker audio character via a real Web Audio distortion chain where we host
  the audio; a crackle/hum overlay where we can only embed YouTube.

## Non-Goals (v1)

- Multiple players on screen at once. **One player at a time.** Dragging out a
  new tool replaces the existing player.
- Touch / mobile. **Desktop-first** (mouse/Pointer Events for mouse). Touch is a
  later follow-up.
- Resuming audio across page navigation. Audio stops on page unload; only the
  player's presence and position are restored.
- Inter-player collisions (only one player exists).

## Decisions (from brainstorming)

- **Audio:** Hybrid. Prefer a self-hosted, rights-cleared `audio_url` played with
  a genuine distortion chain; fall back to a `youtube_url` played clean with a
  crackle/hum bed; fall back to generated static. (Legal note below.)
- **Concurrency:** One player at a time.
- **Persistence:** Persist across pages via `sessionStorage`.
- **Input:** Desktop-first.

## Legal note (audio)

Distortion and anti-scraping obfuscation do **not** change copyright liability:
hosting/streaming a copyrighted recording without a license is infringement
regardless of audio quality or how well the file is hidden. The hybrid design
exists to manage this:

- Use **`youtube_url`** for licensed/commercial catalog (liability sits with
  YouTube/uploader; we only embed).
- Use **`audio_url`** (self-hosted + real distortion) **only** for tracks we hold
  rights to: our own recordings, public-domain, Creative Commons, or licensed.

This is not legal advice; catalog-wide use should be reviewed by a lawyer.

## Components

Each component is a separate file with one clear responsibility.

### 1. Toolbox + fan menu — `snippets/win95-toolbox.liquid` + CSS in `japanjunky-win95.css`

- **Does:** Renders a fixed toolbox button anchored bottom-right, above the
  taskbar. Click toggles a radial "fan" of three tool icons (record player,
  cassette Walkman, CD Walkman). Icons are small CSS/sprite/ASCII glyphs — no 3D
  in the menu itself.
- **Interface:** Each fan item carries `data-tool="record|cassette|cd"` and is a
  drag source (`draggable` semantics via Pointer Events). Emits a "spawn intent"
  the player module listens for.
- **Depends on:** Nothing beyond the taskbar layout (z-index above taskbar at
  10010). Closes on outside click / Escape, mirroring the start menu.

### 2. Player spawn + 3D render — `assets/japanjunky-player.js`

- **Does:** Owns the single active player. On spawn intent (drag a tool out),
  creates a floating, fixed-position canvas sized to the model, sets up a
  three.js scene reusing the product-viewer WebGL + PS1 shader pattern, and loads
  the model for the chosen tool. Drives the render loop and the idle animation
  (e.g. slow rotation, platter spin when playing).
- **Interface:**
  - `JJ_Player.spawn(tool, x, y)` — create/replace the active player.
  - `JJ_Player.despawn()` — tear down canvas, scene, audio.
  - `JJ_Player.getType()` — `'record'|'cassette'|'cd'|null`.
  - `JJ_Player.tryLoadProduct(product)` — called by the drag system on drop;
    runs the format gate then hands off to the audio engine; returns a result
    (`played|rejected|static`).
  - Emits `jj:player-spawned`, `jj:player-despawned`.
- **Depends on:** THREE (global), the physics module, the audio engine, the model
  assets.

### 3. Physics engine — module inside `japanjunky-player.js`

- **Does:** 2D screen-space physics for the player element's position.
  - Gravity accelerates the body downward each frame.
  - Velocity integrates position (semi-implicit Euler).
  - **Floor** = top edge of the taskbar; the body rests there at idle.
  - **Walls/ceiling** = viewport edges; the body bounces with restitution
    (< 1, so it loses energy) and is **clamped** so no part leaves the viewport.
  - **Grab:** while dragging, position follows the cursor and velocity is tracked
    (last-frame delta). On release, that velocity is imparted (throw).
  - **Rest:** below a velocity threshold on the floor, the body sleeps (settles).
- **Interface:** `Physics.update(dt)`, `Physics.grab(x,y)`, `Physics.move(x,y)`,
  `Physics.release()`, `Physics.setBounds(rect)`, `Physics.getPosition()`.
- **Depends on:** Viewport + taskbar height (recomputed on resize).

### 4. Product drag system — `assets/japanjunky-media-drag.js`

- **Does:** Click-and-hold on a product (grid card on home/collection/search,
  and the PDP main product) starts a drag. A 3D "ghost" graphic follows the
  cursor. Releasing over the active player calls
  `JJ_Player.tryLoadProduct(product)`; releasing elsewhere cancels.
- **Interface:** Reads product data from the card's dataset / `window.JJ_PRODUCTS`
  (grid) or `window.JJ_PRODUCT_DATA` (PDP). Hit-tests the player's screen rect on
  release.
- **Depends on:** The drag graphics, the player module.
- **Note:** Must coexist with existing card click/navigation — a hold threshold
  (small movement or time) distinguishes drag from click so normal clicks still
  navigate.

### 5. Drag graphics — `assets/japanjunky-media-drag.js` (rendering) + assets

- **Does:** The cursor "ghost" while dragging a product.
  - **Record:** reuse the existing spinning record-disc three.js graphic from
    `product-viewer.js` (extract/share the disc builder).
  - **Cassette:** new mini three.js graphic (cassette shell + reels).
  - **CD:** new mini three.js graphic (disc with iridescent sheen).
- **Interface:** `DragGhost.show(format, x, y)`, `DragGhost.move(x,y)`,
  `DragGhost.hide()`.

### 6. Audio engine — `assets/japanjunky-player-audio.js`

- **Does:** Hybrid playback through a shared `AudioContext`, format-gated.
  - **Format gate (caller-side in player):** product.format must equal player
    type, else `rejected` (no audio; player triggers a buzz + visual shove).
  - **Path A — `audio_url` present:** `fetch` → `decodeAudioData` →
    `AudioBufferSourceNode` → **distortion chain** → destination.
  - **Path B — else `youtube_url`:** hidden **YouTube IFrame Player API** plays
    the track clean; a looping **crackle/hum bed** (Web Audio) plays through the
    distortion chain for the old-speaker character. (We cannot process the
    YouTube stream itself.)
  - **Path C — else / fetch or decode fails / broken link:** generated **static**
    (noise buffer) through the distortion chain.
  - **Distortion chain:** `BiquadFilter` (lowpass ~3–4kHz) → `WaveShaper`
    (soft clip) → bitcrush (AudioWorklet preferred; `ScriptProcessor` fallback)
    → `GainNode` → destination. Tunable constants.
- **Interface:** `JJ_PlayerAudio.play({format, audioUrl, youtubeUrl})`,
  `.stop()`, `.playStatic()`, `.playRejectBuzz()`. Returns the resolved path.
- **Depends on:** Web Audio API; YouTube IFrame API (loaded lazily only when a
  YouTube path is first needed).

### 7. Metafields — `snippets/jj-product-json.liquid`, `sections/jj-product.liquid`

- Add to grid product JSON and PDP data:
  - `audioUrl`: `product.metafields.custom.audio_url`
  - `youtubeUrl`: `product.metafields.custom.youtube_url`
- **Admin setup (documented, done by user):** create two product metafield
  definitions under namespace `custom`:
  - `audio_url` — type: URL (or File reference), rights-cleared audio only.
  - `youtube_url` — type: URL, the YouTube watch/share link.

### 8. Persistence — within `japanjunky-player.js`

- On spawn/move/despawn, write `sessionStorage['jj-player'] =
  {tool, x, y}` (or remove on despawn).
- On page load, if a record exists, re-spawn that player at the saved position
  (at rest). Audio is **not** restored.

## Data flow

```
Fan tool (data-tool) --drag--> JJ_Player.spawn(tool,x,y)
   -> 3D model + physics body + sessionStorage write

Product card / PDP --hold+drag--> DragGhost(format) follows cursor
   --drop on player--> JJ_Player.tryLoadProduct(product)
       -> format gate
            mismatch -> reject buzz + shove
            match    -> JJ_PlayerAudio.play({format, audioUrl, youtubeUrl})
                          -> Path A file+distortion
                          -> Path B youtube+crackle
                          -> Path C static
```

## Error handling

- **No THREE / WebGL fails:** toolbox still renders; spawning no-ops gracefully
  (or shows a static 2D fallback icon). Never throws into the page.
- **decodeAudioData / fetch failure or broken URL:** fall through to static
  (Path C). Log once; no user-facing error dialog.
- **AudioContext suspended (autoplay policy):** resume on the drop gesture (user
  interaction), which is always present.
- **AudioWorklet unsupported:** bitcrush falls back to `ScriptProcessorNode`.
- **Resize:** physics bounds + player clamp recomputed; player kept on-screen.
- **sessionStorage unavailable / malformed:** ignore, start fresh.

## Testing

- **Physics (unit-testable):** pure functions for integrate/bounce/clamp/rest
  given a bounds rect — assert never-escapes, bounce loses energy, settles on
  floor. No DOM/WebGL needed.
- **Format gate (unit-testable):** `(playerType, productFormat) -> match?`.
- **Audio path selection (unit-testable):** `({audioUrl, youtubeUrl}) -> A|B|C`.
- **Manual (browser):** spawn each tool; throw and confirm bounce + taskbar
  settle + never escapes; drag matching/mismatching products; missing-link
  static; persistence across navigation; resize behavior.

## Build tranches

1. **T1 — Toolbox + fan menu.** DOM/CSS, placeholder icons, open/close. Standalone.
2. **T2 — Spawn + physics + persistence.** Placeholder block (cube) that falls,
   bounces, settles on the taskbar, is throwable, and restores across pages.
3. **T3 — 3D player models.** Record player, cassette Walkman, CD Walkman.
   **⛔ Blocked on user-provided reference images.** Swaps placeholders.
4. **T4 — Product drag + ghost graphics + format gating.** Hold-drag from cards
   and PDP; record ghost (reused) + new cassette/CD ghosts; drop hit-test +
   reject/accept. (Cassette/CD ghost art may also reference T3 modeling.)
5. **T5 — Audio engine + metafields.** Hybrid playback, distortion chain, static,
   crackle bed; `audio_url` + `youtube_url` wired through product data.

Everything except T3 (and the cassette/CD ghost art in T4) can be built before
the reference images arrive. Each tranche gets its own implementation plan.

## Open dependencies

- **Reference images** for the three player models (T3) and for the cassette/CD
  drag ghosts (T4) — to be provided by the user.
- **Metafield definitions** `custom.audio_url` and `custom.youtube_url` created
  in Shopify admin (T5).
