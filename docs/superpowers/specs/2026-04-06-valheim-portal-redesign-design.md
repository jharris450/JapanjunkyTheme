# Valheim Portal Background Redesign — Design Spec

**Date**: 2026-04-06
**Scope**: Modify `assets/japanjunky-screensaver.js` shader code and ring setup
**Approach**: Shader-only rewrite (Approach A) — no new geometry types, particles, or dependencies

## Overview

Merge the existing portal vortex tunnel background with a Valheim-style portal aesthetic. The core change: introduce a warm-to-purple depth gradient across the scene, replace the static portal ring colors with procedural animated flames, and shift the starburst glow to a purple core.

Tsuno Daishi, flying fragments, post-processing, and the config system remain untouched.

## 1. Tunnel Shader — Warm-to-Purple Gradient

**File**: `assets/japanjunky-screensaver.js` — `TUNNEL_FRAG`

The tunnel cylinder geometry stays unchanged (CylinderGeometry, radius 3, length 40, 12x20 segments, BackSide rendering, PS1 vertex snapping).

### Color palette change

The fragment shader currently uses three warm colors mixed by a swirl pattern:
- `c1 = vec3(0.4, 0.05, 0.02)` (dark red)
- `c2 = vec3(0.85, 0.35, 0.05)` (orange)
- `c3 = vec3(0.95, 0.75, 0.3)` (gold)

Replace with a depth-blended dual palette:

**Warm palette** (near camera, low `depth`/`vUv.y`):
- `w1 = vec3(0.4, 0.05, 0.02)` — dark red
- `w2 = vec3(0.85, 0.35, 0.05)` — orange
- `w3 = vec3(0.95, 0.75, 0.3)` — gold

**Purple palette** (far end, high `depth`/`vUv.y`):
- `p1 = vec3(0.25, 0.05, 0.35)` — deep violet
- `p2 = vec3(0.6, 0.2, 0.8)` — bright purple
- `p3 = vec3(0.8, 0.6, 0.95)` — pale lavender

**Blend**: `mix(warmColor, purpleColor, smoothstep(0.2, 0.8, depth))` — the transition happens in the middle third of the tunnel, so the mouth is clearly fiery and the far end is clearly purple.

### Swirl bands

The existing `twist`/`pull`/`band` pattern logic stays. Only the colors it indexes into change based on depth.

### Falloff and glow

The existing `falloff` and `glow` calculations stay. The glow color at the far end shifts from `vec3(0.95, 0.75, 0.5)` to `vec3(0.7, 0.5, 0.95)` (purple), also blended by depth.

## 2. Fire Rings — 6-Layer Procedural Flame Gateway

**File**: `assets/japanjunky-screensaver.js` — `RING_FRAG`, ring build loop

### Ring configuration

Replace the current static `flamePalette` ring shader with a procedural flame shader. Keep 6 rings.

| Ring | Base Color | Description | Size | Z Position | Rotation Speed |
|------|-----------|-------------|------|------------|----------------|
| 1 (front) | `vec3(0.95, 0.7, 0.2)` | Hot orange-gold | 8x8 | 2 | 0.15 (CW) |
| 2 | `vec3(0.85, 0.15, 0.05)` | Deep red-crimson | 7x7 | 7 | -0.25 (CCW) |
| 3 | `vec3(0.8, 0.1, 0.3)` | Red-magenta | 6.2x6.2 | 12 | 0.35 (CW) |
| 4 | `vec3(0.6, 0.1, 0.5)` | Magenta-violet | 5.5x5.5 | 17 | -0.45 (CCW) |
| 5 | `vec3(0.4, 0.15, 0.65)` | Deep purple | 5x5 | 22 | 0.55 (CW) |
| 6 (deepest) | `vec3(0.65, 0.45, 0.85)` | Pale violet/lavender | 4.5x4.5 | 27 | -0.65 (CCW) |

### Procedural flame shader (`RING_FRAG` replacement)

New uniforms:
- `uTime` (float) — animation time
- `uBaseColor` (vec3) — per-ring base color from table above
- `uFlameIntensity` (float) — per-ring intensity (front ring = 1.0, deeper rings decrease: 0.9, 0.8, 0.7, 0.6, 0.5)

Shader logic:
1. Convert UV to polar: `dist = length(uv - 0.5) * 2.0`, `angle = atan(uv.y - 0.5, uv.x - 0.5)`
2. Ring band mask: `smoothstep` pair creating a ring at ~0.7-0.9 radius (same approach as current)
3. Flame noise: Layered `sin()` waves driven by `angle` and `uTime` to create flickering flame heights along the ring perimeter:
   - `flame1 = sin(angle * 8.0 + uTime * 2.5) * 0.5 + 0.5`
   - `flame2 = sin(angle * 13.0 - uTime * 1.8) * 0.5 + 0.5`
   - `flame3 = sin(angle * 21.0 + uTime * 3.2) * 0.5 + 0.5`
   - Combined: `flames = flame1 * 0.5 + flame2 * 0.3 + flame3 * 0.2`
4. Flame extends the ring mask outward: The ring's outer `smoothstep` edge shifts based on `flames`, creating flickering tips
5. Color: `uBaseColor` brightened toward white at flame tips (`mix(uBaseColor, vec3(1.0, 0.9, 0.8), flameIntensity)`)
6. Final: `gl_FragColor = vec4(color * uFlameIntensity, ringMask)`

### Glow plane

One additional `PlaneGeometry(10, 10)` positioned at z 3 (behind front ring), additive blending:
- Soft radial glow in the front ring's orange-gold color
- Simple `1.0 / (1.0 + dist * 4.0)` falloff
- Low intensity (~0.3) — subtle backlight bloom

### Vertex shader

Reuse existing `GLOW_VERT` with PS1 vertex snapping (same as current rings). The glow plane behind ring 1 also uses `GLOW_VERT`. The new `RING_FRAG` receives `vUv` from this vertex shader, same as the current ring shader does.

### Rotation

Each ring rotates around Z at its own speed (from table). Updated in the animation loop:
```
ringMesh.rotation.z += ringData.rotSpeed * deltaTime;
```

## 3. Starburst Glow — Purple Core

**File**: `assets/japanjunky-screensaver.js` — `GLOW_FRAG`

### Color shift

Replace warm colors with purple:
- Current: `mix(vec3(0.8, 0.1, 0.0), vec3(0.95, 0.85, 0.7), glow)`
- New: `mix(vec3(0.3, 0.05, 0.4), vec3(0.7, 0.5, 0.95), glow)`

### Pulse

Add a slow breathing modulation to intensity:
```glsl
float pulse = 1.0 + sin(uTime * 0.8) * 0.15;
intensity *= pulse;
```

### Everything else stays

Ray pattern (`sin(angle * 8.0 + uTime * 0.5)` etc.), geometry, position (z 36), additive blending — all unchanged.

## 4. Sparkles — Depth-Aware Color Tint

**File**: `assets/japanjunky-screensaver.js` — `SPARKLE_FRAG`, `SPARKLE_VERT`

### Change

Pass normalized depth as a varying from vertex to fragment shader:
```glsl
// In vertex shader:
varying float vDepth;
vDepth = clamp(position.z / 35.0, 0.0, 1.0);

// In fragment shader:
vec3 warmColor = vec3(0.95, 0.85, 0.7);
vec3 coolColor = vec3(0.8, 0.7, 0.95);
vec3 sparkleColor = mix(warmColor, coolColor, vDepth);
gl_FragColor = vec4(sparkleColor, glow * vAlpha);
```

### Behavior

All sparkle positions, sizes, phases, twinkle logic — unchanged.

## 5. Unchanged Systems

No modifications to:
- Tsuno Daishi ghost figure (mesh, personality system, moods, orbiting, tints, animations)
- Flying fragments (album cover meshes, spawn/despawn, fragment masks)
- Vortex swirl backdrop (texture plane at z 37)
- Post-processing (240p, VGA dithering, PS1 vertex snapping)
- Config system (`JJ_SCREENSAVER_CONFIG`, swirl speed, resolution, FPS)
- Display canvas and render loop structure

## Performance Notes

- No new geometry types or draw calls beyond the single glow plane addition
- Ring count stays at 6 (same draw call count minus the removed rings plus the glow = net +1)
- Shader complexity increase is minimal (a few extra `sin()` calls for flame noise)
- Stays within the 240p render budget easily
