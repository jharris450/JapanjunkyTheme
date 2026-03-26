# Memory Fragments System

## Problem

The portal tunnel currently has a flying objects system (`flyingObjects`, `spawnObject`, `animateObjects`) with no textures configured — nothing flies through the wormhole. The tunnel feels empty and static beyond the tunnel/glow/sparkle effects.

## Solution

A "memory fragments" system: animated clips from Japanese music videos, concerts, and commercials fly through the tunnel as glowing shards of irregular shape, creating the illusion of traveling through a wormhole of musical history. Fragments are sprite-sheet-animated textures masked to jagged polygon shapes, split across three depth layers for parallax.

## Constraints

- **Additive only.** The existing tunnel, portal rings, glow, sparkles, vortex backdrop, Tsuno, bubble system, and current flying objects system are completely untouched. The fragments system is a separate pool, spawn loop, and animation loop that shares the same `scene` and `camera`.
- **ES5 only.** No `const`, `let`, arrow functions, or template literals — matches the rest of the screensaver codebase.
- **No new libraries.** All animation is UV-offset sprite sheet stepping, no GIF decoding libraries.

## Asset Pipeline

### Source

50-100+ GIFs, 64-128px, 1-3 second loops, created by the user from Japanese music/media footage spanning decades.

### Conversion

A standalone conversion script (Node.js or bash, not part of the Shopify theme) processes each GIF:

1. Extract frames via ffmpeg: `ffmpeg -i input.gif -vsync 0 frame_%03d.png`
2. Read the GIF's frame delay via `ffprobe` and compute average FPS (GIFs have per-frame delay values; average them for a single playback rate)
3. Assemble frames into a grid PNG via ImageMagick: `montage frame_*.png -tile {cols}x{rows} -geometry {w}x{h}+0+0 spritesheet.png`
4. Generate companion JSON metadata:
   ```json
   {
     "name": "akb48-concert-2008",
     "frameCount": 24,
     "columns": 6,
     "rows": 4,
     "fps": 10,
     "width": 128,
     "height": 96
   }
   ```
5. Output: one PNG sprite sheet + one JSON per source GIF

### Delivery

- Sprite sheet PNGs uploaded to Shopify `assets/` folder
- Fragment manifest passed via `JJ_SCREENSAVER_CONFIG.fragments` array in `theme.liquid`:
  ```javascript
  window.JJ_SCREENSAVER_CONFIG = {
    // ... existing config ...
    fragments: [
      { url: {{ 'frag-akb48-2008.png' | asset_url | json }}, frames: 24, cols: 6, rows: 4, fps: 10, w: 128, h: 96 },
      { url: {{ 'frag-perfume-2012.png' | asset_url | json }}, frames: 18, cols: 6, rows: 3, fps: 8, w: 128, h: 128 },
      // ... 50-100+ entries
    ]
  };
  ```

## Fragment Shapes (Mask System)

Fragments are not rectangles — they're irregular polygons like shattered glass or cracked screen pieces. This is achieved with alpha masks.

### Mask Atlas

A single PNG (`frag-masks.png`) containing 6-8 irregular polygon shapes arranged in a grid. Each shape is a white polygon on a transparent black background. The fragment shader samples the mask atlas at the correct cell and multiplies the clip's alpha by the mask alpha, cutting the visible area into the shard shape. The mask atlas texture must use the Three.js default `texture.flipY = true`.

### Mask Selection

At spawn time, each fragment is assigned a random mask index (0 to mask count - 1). The mask UV offset is computed from the index and atlas grid dimensions, same as the sprite sheet frame stepping.

### Mask Atlas Config

Passed via config:
```javascript
fragmentMasks: {
  url: {{ 'frag-masks.png' | asset_url | json }},
  count: 8,
  columns: 4,
  rows: 2
}
```

## Visual Treatment

### Ghost-Tinted (80% of fragments)

The fragment shader applies:
- **Color tint**: warm amber wash — multiply RGB by a tint vector (e.g., `vec3(1.0, 0.7, 0.4)`). Configurable uniform `uFragTint`.
- **Reduced alpha**: 0.4-0.7 base opacity via `uFragAlpha` uniform
- **Additive blending**: `THREE.AdditiveBlending` so fragments glow against the dark tunnel, consistent with the portal's existing visual language

### Vivid (20% of fragments)

- **No color tint**: tint uniform set to `vec3(1.0, 1.0, 1.0)` (passthrough)
- **Higher alpha**: 0.8-0.9
- **Additive blending**: same as ghost-tinted, but the higher alpha and neutral tint make them pop

### Vivid Selection

At spawn time, `Math.random() < 0.2` determines vivid vs ghost. No state tracking needed — purely random per spawn.

### Shaders

#### Vertex Shader

Matches the existing PS1-style vertex snapping pattern used throughout the screensaver:

```glsl
uniform float uResolution;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vec4 clipPos = projectionMatrix * viewPos;
  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)
             * clipPos.w / uResolution;
  gl_Position = clipPos;
}
```

#### Fragment Shader

```glsl
uniform sampler2D uSpriteSheet;
uniform sampler2D uMaskAtlas;
uniform float uFrameIndex;    // current frame (float, floored in shader)
uniform float uSheetCols;     // sprite sheet columns
uniform float uSheetRows;     // sprite sheet rows
uniform float uMaskIndex;     // which mask shape to use
uniform float uMaskCols;      // mask atlas columns
uniform float uMaskRows;      // mask atlas rows
uniform vec3 uFragTint;       // color tint (1,1,1 for vivid)
uniform float uFragAlpha;     // base opacity

varying vec2 vUv;

void main() {
  // Sprite sheet UV
  float frame = floor(uFrameIndex);
  float col = mod(frame, uSheetCols);
  float row = floor(frame / uSheetCols);
  vec2 cellSize = vec2(1.0 / uSheetCols, 1.0 / uSheetRows);
  vec2 spriteUV = vec2(col, row) * cellSize + vUv * cellSize;

  // Mask UV
  float mCol = mod(uMaskIndex, uMaskCols);
  float mRow = floor(uMaskIndex / uMaskCols);
  vec2 mCellSize = vec2(1.0 / uMaskCols, 1.0 / uMaskRows);
  vec2 maskUV = vec2(mCol, mRow) * mCellSize + vUv * mCellSize;

  vec4 sprite = texture2D(uSpriteSheet, spriteUV);
  float mask = texture2D(uMaskAtlas, maskUV).a;

  gl_FragColor = vec4(sprite.rgb * uFragTint, sprite.a * mask * uFragAlpha);
}
```

#### Material Settings

```javascript
{
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide
}
```

`depthWrite: false` prevents additive-blended transparent fragments from occluding each other. `depthTest: true` ensures they still render behind opaque geometry if any exists.

#### Texture flipY

All sprite sheet textures and the mask atlas texture must use the Three.js default `texture.flipY = true`. This ensures row 0 maps to the top of the image (matching the montage output where frame 0 is top-left). The UV computation in the shader assumes this orientation.

## Depth Layers & Behavior

Three layers with distinct visual and motion characteristics. Each fragment is randomly assigned a layer at spawn time.

### Layer Definitions

| Property | Background | Mid | Foreground |
|----------|-----------|-----|------------|
| **Spawn interval** | ~2000ms (±30% jitter) | ~3000ms (±30%) | ~5000ms (±30%) |
| **Spawn radius** | 0.5-0.7 of tunnel radius (near walls) | 0.3-0.5 (between) | 0.0-0.3 (near center) |
| **Z velocity** | 0.05-0.1 units/frame | 0.15-0.25 | 0.3-0.5 |
| **Z acceleration** | 0.0005 units/frame^2 | 0.001 | 0.002 |
| **Mesh scale** | 0.3-0.5 units | 0.5-0.8 | 0.8-1.2 |
| **Lateral drift amplitude** | 0.1 | 0.2 | 0.3 |
| **Z-tilt wobble** | ±0.087 rad (~5 deg) | ±0.175 rad (~10 deg) | ±0.262 rad (~15 deg) |
| **Alpha multiplier** | 0.6 | 0.8 | 1.0 |
| **Max count** | 5 | 3 | 2 |

Each layer has its own independent spawn timer and max count. A layer's timer fires at its interval (jittered ±30%), and a fragment is spawned only if the layer hasn't reached its max count. Total active fragments across all layers: up to 10.

### Motion

All motion (Z velocity, acceleration, drift) is **frame-based** (units/frame), matching the existing `animateObjects` convention. The `dt` parameter passed to `animateFragments` is only used for sprite sheet frame stepping (time-based accumulator in seconds).

- **Billboard facing**: all fragments face the camera via `lookAt(camera.position)`, then a gentle z-axis tilt wobble is applied as `rotateZ(wobbleAmp * Math.sin(t * wobbleFreq))` where `wobbleFreq` is a per-fragment random value (0.3-0.8 Hz) and `t` is time in seconds. No tumbling or heavy rotation — the animation must be readable.
- **Lateral drift**: sinusoidal x/y drift with per-fragment random frequency and phase, same technique as existing flying objects but gentler.
- **Constrained to tunnel**: fragments that drift beyond tunnel radius are clamped back, same as existing flying objects.
- **Aspect ratio via scale**: all fragments share a single 1×1 `PlaneGeometry`. Aspect ratio and layer-appropriate size are applied via `mesh.scale.set(scaleX, scaleY, 1)` where `scaleX = layerScale * (w / maxDim)` and `scaleY = layerScale * (h / maxDim)` (preserving the source clip's aspect ratio from metadata `w` and `h`).

### Spawn Logic

- Spawn zone: far end of tunnel at `z = SPAWN_Z` (-2)
- Despawn: when `z > DESPAWN_Z` (36), past the camera
- Each layer has its own spawn timer (in milliseconds, matching `requestAnimationFrame` time units). Timer comparison: `time - layer.lastSpawnTime >= layer.interval`
- Spawn intervals jittered: after each spawn, the next interval is `baseInterval * (0.7 + Math.random() * 0.6)` for ±30% variation

### Mesh Recycling

Instead of creating/destroying meshes, despawned fragments are recycled:
1. On despawn, the mesh is removed from the active pool and added to a recycle pool
2. On next spawn, check the recycle pool first. If a mesh is available, reuse it:
   - Swap the sprite sheet texture via `mesh.material.uniforms.uSpriteSheet.value = newTex`
   - Update all uniforms (sheet cols/rows, mask index, tint, alpha)
   - Update `mesh.scale` for the new texture's aspect ratio and layer size
   - Reset position to spawn zone, assign new drift/wobble params in `userData`
3. If no recycled mesh is available, create a new one
4. This avoids GC pressure from repeated mesh/material/geometry allocation

## Texture Loading

Not all 50-100+ sprite sheets are loaded at once.

### Loading Strategy

- **Initial load**: load 15-20 random sprite sheets from the manifest on page load
- **Texture cache**: `fragmentTextures[]` array holds loaded `THREE.Texture` objects alongside their metadata (frames, cols, rows, fps, w, h)
- **Rotation**: every 10 recycles, evict the oldest texture from the cache and load a new random one from the manifest that isn't already cached
- **Loading is async**: `textureLoader.load()` with callback. If a new texture isn't ready yet, reuse a cached one
- **Texture settings**: `tex.minFilter = THREE.NearestFilter`, `tex.magFilter = THREE.NearestFilter`, `tex.flipY = true` (default)

### Memory Budget

- 15-20 sprite sheets at ~128px × (6×4 grid) = ~768×512px each
- At RGBA 8-bit: ~1.5MB per texture, ~22-30MB total GPU memory for the cache
- This is well within budget for a WebGL scene

## Sprite Sheet Animation

### Frame Stepping

Each fragment mesh stores animation state in `userData`:
- `frameFps`: target playback fps from metadata
- `frameCount`: total frames
- `frameAccum`: time accumulator (seconds)
- `currentFrame`: integer frame index

In the animation loop, the `dt` parameter (seconds, `targetInterval / 1000`) drives frame stepping:
```javascript
ud.frameAccum += dt;
var frameDuration = 1.0 / ud.frameFps;
if (ud.frameAccum >= frameDuration) {
  ud.frameAccum -= frameDuration;
  ud.currentFrame = (ud.currentFrame + 1) % ud.frameCount;
}
mesh.material.uniforms.uFrameIndex.value = ud.currentFrame;
```

This loops the animation continuously, independent of the screensaver's render fps.

## Architecture

### New Code (all in `japanjunky-screensaver.js`)

- `FRAG_LAYERS` — config object with 3 layer parameter sets (speed range, size range, drift, count limits, spawn intervals)
- `FRAG_SHADER_VERT` — vertex shader string (PS1-style snapping, passes `vUv`)
- `FRAG_SHADER_FRAG` — fragment shader string (sprite sheet UV + mask atlas + tint)
- `fragmentPool[]` — array of active fragment meshes
- `fragmentRecyclePool[]` — array of despawned meshes available for reuse
- `fragmentTextures[]` — loaded texture cache (15-20 entries, each with texture + metadata)
- `fragmentManifest` — reference to `config.fragments` array
- `fragmentMaskTex` — loaded mask atlas texture
- `fragmentGeo` — single shared `PlaneGeometry(1, 1)` used by all fragments
- `makeFragmentMaterial(spriteTex, maskTex, meta)` — creates ShaderMaterial with all uniforms, `transparent: true`, `depthWrite: false`, `blending: THREE.AdditiveBlending`
- `spawnFragment(time)` — checks each layer's timer and max count, picks texture from cache, creates or recycles mesh, assigns random params
- `animateFragments(time, dt)` — updates positions (frame-based), UV frame stepping (dt-based), drift, wobble, despawn/recycle
- `loadFragmentBatch(count)` — async-loads a batch of sprite sheet textures into the cache

### Modified Code

- `theme.liquid`: add `fragments` and `fragmentMasks` to `JJ_SCREENSAVER_CONFIG`
- `animate()` function: add `spawnFragment(time)` and `animateFragments(time, targetInterval / 1000)` calls after the existing `spawnObject`/`animateObjects` calls

### Untouched

- Tunnel, glow, sparkles, portal rings, vortex backdrop — all untouched
- Tsuno personality system, bubble system — untouched
- Existing flying objects system (`flyingObjects`, `spawnObject`, `animateObjects`, `loadedTextures`) — untouched
- All shaders except new fragment shader — untouched
- All CSS, Liquid templates (except config addition in theme.liquid) — untouched
- Product viewer, cursor light, dither, all other JS — untouched

## Conversion Script

A standalone tool (not part of the Shopify theme) for the asset pipeline:

### Input
A directory of GIF files.

### Output
For each GIF:
- `frag-{name}.png` — sprite sheet PNG
- `frag-{name}.json` — metadata JSON

Plus a generated Liquid snippet for pasting into `theme.liquid`.

### Usage
```bash
node convert-fragments.js ./gifs ./output
```

### Process per GIF
1. `ffmpeg -i input.gif -vsync 0 /tmp/frames/frame_%03d.png` — extract frames
2. Read GIF frame delays via `ffprobe -v quiet -print_format json -show_entries frame=duration_time input.gif` and compute average FPS from the per-frame delays
3. Count frames, compute optimal grid (e.g., 24 frames → 6×4)
4. `montage /tmp/frames/frame_*.png -tile 6x4 -geometry {w}x{h}+0+0 frag-name.png` — assemble sheet
5. Write JSON with computed FPS: `{ "name": "...", "frameCount": 24, "columns": 6, "rows": 4, "fps": <computed>, "width": <w>, "height": <h> }`
6. Append to a `fragments-config.liquid` output file with the `{{ asset_url }}` template for each entry
