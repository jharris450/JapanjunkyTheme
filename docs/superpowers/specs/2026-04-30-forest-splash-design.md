# Forest Splash Scene — Design Spec

**Date:** 2026-04-30
**Status:** Approved
**Replaces:** Portal vortex (japanjunky-screensaver.js portal-rendering code)
**Approach:** New `japanjunky-forest.js` module + adapter pattern; existing `japanjunky-screensaver.js` retained as adapter owning camera/Tsuno/post-process.

## Overview

The portal vortex feedback was that it felt jarring. This design replaces it with a sacred Japanese forest grove — giant cedars wrapped in shimenawa rope, drifting shide paper streamers, jizo statues, stone lanterns, sotoba grave markers, and a small hokora shrine. POV is from a road, framed so the forest fills most of the frame and only a slice of road is visible bottom-left. Lighting is dawn mist, amber-washed, with god rays piercing through cedar branches.

Aesthetic is **PS1-era 3D** — photo-textured low-poly geometry, vertex-snap wobble, posterized palettes, NEAREST sampling — overlaid with the existing CRT post-process pipeline.

The scene replaces the portal across **every page**, with three per-page camera presets (home / product / login). Tsuno's existing interactions are preserved; only her drift behavior changes — she now navigates between forest anchors (trunks, jizo, lanterns, shrine).

A **two-stage adaptive performance degrade** addresses the Linux scroll-lag complaint. A boot probe picks an initial tier (High / Med / Low) and a runtime watchdog demotes when frame time slips. Mobile forces tier-Low.

Audio gains an **ambient forest bed** plus **interaction accents** (loaded after first user gesture per browser autoplay rules).

## 1. Architecture

```
assets/
  japanjunky-forest.js          NEW — Forest scene module.
                                Owns: geometry, materials, shaders,
                                animations, parallax, god rays, fog,
                                scroll handler, Tsuno anchor exposure.
                                Exports: createForest(scene, camera, clock, tier)
                                  → { update(t, scrollY),
                                      setTier(t),
                                      setCameraPreset(name),
                                      getTsunoAnchors(),
                                      getTrunkColliders(),
                                      dispose() }

  japanjunky-screensaver.js     KEEP — refactored as adapter.
                                Owns: renderer, scene, camera, clock,
                                perf-watchdog, post-process, Tsuno,
                                page-transition dolly.
                                Calls forest.update(t, scrollY) per frame.
                                Forwards cameraPreset → forest.setCameraPreset().
                                Drives Tsuno drift state machine using
                                forest.getTsunoAnchors().

  japanjunky-screensaver-post.js  KEEP — CRT post-process. No change.

  japanjunky-portal.js          NEW — Old portal code extracted for clean
                                rollback. Loaded only when settings.scene_mode
                                === 'portal'.

  japanjunky-audio.js           NEW — WebAudio wrapper for ambient bed +
                                accent triggers.
```

**Module boundaries:**
- forest owns *what's in the world* (geometry, animation, scroll parallax).
- screensaver owns *how it's framed* (camera, post-process, Tsuno, transitions).
- Shared via `THREE.Scene` + `THREE.Clock` references passed at construct.

**Feature flag:** `settings.scene_mode = 'forest' | 'portal'` in theme settings → screensaver picks which module to instantiate. Allows ship-behind-toggle and one-click rollback.

## 2. Scene Composition

World units = Three.js standard meters. Camera at origin facing +Z. Road runs along X axis. Forest extends into +Z.

**Layers (back to front):**

| Layer | Z | Contents | Parallax |
|-------|---|----------|----------|
| 0 — Sky/fog wall | 80 | Single billboard plane, amber gradient (light top → dark bottom), shader-driven fog density | 0 |
| 1 — Distant silhouette ridge | 60 | Single textured plane, near-black trunk silhouettes, fog tint | 0.05x scroll |
| 2 — Mid grove | 30–50 | 6–8 cedar trunks (PS1 cylinders ~12 sides), photo bark, mossy bases | 0.15x scroll |
| 3 — Hero cedars | 8–20 | 3–4 giant cedars (~16 sides), shimenawa rope wraps, shide streamers | 0.40x scroll |
| 4 — Shrine elements | 6–15 | 1 hokora, 3–5 jizo, 4–6 ishidoro, 3–4 sotoba, 2–3 haka, mossy ground | 0.60x scroll |
| 5 — Foreground roots/moss | 2–5 | Bottom edge mossy root flares, frames the shot | 1.0x (locked) |
| 6 — Road slice | 3–8, x = -6 to -3, y = -2 | Asphalt/dirt road, bottom-left ⅓ only, recedes off-screen-left | locked |
| 7 — Particles overlay | varies | Falling needles, drifting fog wisps, distant bird (GPU instanced) | per-particle |

**Mesh budget:** ~30–40 unique meshes. Aggressive instancing for repeated elements (lanterns, jizo, sotoba, needles).

**Hero placements:**
- Biggest cedar with hokora at base — center-right of frame, primary focal.
- Jizo cluster left of hokora, mossy.
- Stone lanterns lining a faint path between layers 3 and 4.
- Sotoba grouped behind hokora, leaning slightly (weathered).

## 3. Asset Pipeline (PS1-textured)

Photo references → posterized, palette-snapped, low-res, nearest-sampled textures.

**Texture targets:**

| Asset | Source | Output res | Notes |
|-------|--------|-----------|-------|
| `cedar_bark.png` | concept2/3 crop | 256×512 | tileable Y |
| `cedar_moss_base.png` | concept1 crop | 256×256 | blended overlay |
| `shimenawa_rope.png` | concept3 crop | 512×128 | tileable X |
| `shide_paper.png` | concept3 crop | 64×128 | alpha cutout |
| `hokora_stone.png` | concept1 crop | 256×256 | weathered |
| `jizo_face.png` | CC photo | 128×256 | billboard |
| `ishidoro_stone.png` | CC photo | 128×256 | tile vertical |
| `sotoba_wood.png` | CC photo | 64×512 | sutra carving |
| `haka_stone.png` | CC photo | 128×128 | cluster |
| `ground_needles.png` | cedar litter | 512×512 | tileable |
| `moss_patch.png` | concept1/2 crop | 256×256 | overlay |
| `silhouette_trunks.png` | concept2 silhouette | 1024×512 | backdrop |
| `fog_gradient.png` | gradient | 512×128 | sky/fog wall |

**Atlasing:** small props (jizo, lanterns, sotoba, haka, shide) packed into `shrine_atlas.png` (1024×1024) — single draw call for instanced placement.

**PS1-ification pipeline (per-texture, offline):**

1. Crop to target aspect.
2. Posterize to 32-color palette per texture.
3. Snap to amber-biased palette (global LUT pulls reds/yellows warmer, cools blues; preserves moss-green).
4. Resize down to target res.
5. Disable mipmaps at runtime (`magFilter: NEAREST`, `minFilter: NEAREST`).
6. Add Bayer 4×4 or Floyd–Steinberg dither.
7. Save PNG (indexed where alpha permits, full RGBA where not).

**Geometry shading (runtime):**

- `MeshBasicMaterial` (no real lighting math — baked-in).
- Vertex affine-projection wobble (PS1 hallmark): shader injection that quantizes vertex output to integer screen pixels.
- Per-vertex color interpolation, no per-pixel light. Trunks get vertex-baked AO darker at base.
- Texture filtering: NEAREST. No anisotropic.

**Total budget:** ~3–4 MB on disk, ~8 MB GPU after decompression.

## 4. Shader & Lighting

Zero global directional/ambient lights at any tier — all base shading is baked into vertex colors + texture multiply. Fog and god-rays are screen-space post-effects, not scene lights. **Lantern point lights are the sole exception**, scoped strictly to zone-tagged receiver meshes (mossy ground patches near lanterns); all other meshes opt out via material flag. See "Lantern flicker" below.

**Pass order per frame:**

1. **Forest pass.** MeshBasicMaterial per object, per-vertex amber tint (warmer near "sun" direction = top-back-left), texture multiply, vertex-snap wobble, distance fog (linear, color `#2a1208`).
2. **God-ray pass.** 3–5 large textured quads, soft amber gradient, additive blend, depthWrite off. Positioned between mid-grove and hero cedars (z ≈ 25), tilted 45° down-right. Slow opacity breathing `sin(t) * 0.04`. NOT raymarched.
3. **Fog wisp pass.** 12–20 instanced billboards drifting through mid-ground, additive, slow x/z drift, alpha pulse.
4. **Particle pass.** Needles (gravity + lateral drift + Y-respawn), distant bird (single-flap path every 30–60s on far silhouette layer). GPU-instanced.
5. **CRT post-process** (existing screensaver-post.js, untouched).

**Phosphor amber wash:**

A **scene-only LUT** before CRT post-process kicks in:

- 1D LUT shader maps RGB → amber-biased phosphor.
- Greens preserved (moss/shide). Reds pulled warm. Whites push to cream. Blacks deep brown.
- Render-to-texture step between scene and post-process.
- Strength uniform `uPhosphorMix` (0.0–1.0, default 0.7).

**Distance fog:**

`THREE.Fog` linear, color `#2a1208`. Per-preset near/far:
- home: near=15 far=70
- product: near=8 far=30
- login: near=20 far=90

**Lantern flicker (only "real" light):**

- 3–4 `THREE.PointLight`, intensity 0.4, color `#ff7820`, range 4 units.
- Affect only mossy ground patches near lanterns (zone-tagged receivers).
- Most scene meshes ignore them via custom material flag.
- Perlin-noise intensity multiplier per frame.
- Tier-Low: replace lights with animated emissive on lantern texture + cheap radial billboard glow underneath.

**Moss glow pulse:**

- Moss textures store glow mask in green channel.
- Shader: `glow * sin(t * 0.5 + offset)`, magnitude 0.15.
- Per-mesh phase offset.
- Tier-Med disables.

**God rays (cheap fake):**

- Texture: 256×512 vertical gradient, edge-soft, amber.
- Plane: 4×12 units, additive, depthWrite off.
- Position: high in scene, angled 45° down, between hero cedars.
- Animation: slow Y-bob `sin(t) * 0.1` + opacity breath.
- Counts: tier-High 5, tier-Med 3, tier-Low 0.

**Phosphor scintillation (grain):**

- Single full-screen quad, additive.
- Tiny tiled noise texture, scrolled 2 axes per frame.
- Amber-tinted, ~3% intensity.
- Tier-Low removes (CRT scanlines remain).

## 5. Tsuno Integration

Existing interactions preserved entirely. Only the **drift behavior** changes — path navigates forest geometry instead of orbiting a void.

**Anchors (forest module exposes):**

```javascript
forest.getTsunoAnchors() → [
  { id: 'hero_cedar_01', pos: [4, 0.5, 12], weight: 1.0, type: 'tree' },
  { id: 'hero_cedar_02', pos: [-2, 0.8, 14], weight: 1.0, type: 'tree' },
  { id: 'hero_cedar_03', pos: [6, 0.3, 18], weight: 0.8, type: 'tree' },
  { id: 'hokora',        pos: [3, 0.2, 10], weight: 1.5, type: 'shrine' },
  { id: 'jizo_cluster',  pos: [1, 0.1, 9],  weight: 1.2, type: 'shrine' },
  { id: 'lantern_01',    pos: [2, 0.0, 11], weight: 0.6, type: 'lantern' },
  { id: 'lantern_02',    pos: [4, 0.0, 14], weight: 0.6, type: 'lantern' },
  { id: 'sotoba_group',  pos: [5, 0.4, 11], weight: 0.9, type: 'grave' },
  { id: 'shide_rope_01', pos: [4, 1.5, 12], weight: 0.7, type: 'rope' }
  // ...
]
```

**Drift state machine** (replaces existing portal-orbit logic):

```
States:
  IDLE_ANCHOR    — hovering near current anchor, micro bob
  TRAVEL         — moving between two anchors via curved path
  PEEK           — half-hidden behind tree trunk (anchor type='tree' only)
  PERCH          — sit on jizo head / hokora roof briefly (type='shrine')
  CONTEMPLATE    — face a sotoba/grave, alpha low, very slow drift

Transitions:
  IDLE_ANCHOR → TRAVEL after 4–8s
  TRAVEL → PEEK | PERCH | CONTEMPLATE | IDLE_ANCHOR
                  (weighted random by anchor type)
  Any → REACT (existing keystroke/cursor/click handlers preempt)
```

**Path planning:**

- Hermite curve from current pos to target pos.
- Mid control point lifted slightly (Tsuno arcs over).
- Avoids passing through trunk colliders (forest exposes simple cylinder collider list via `getTrunkColliders()`).
- Travel time: distance × 0.6 s/unit, min 1.5s, max 4s.

**Visibility behind trunks:**

- Natural depth-test handles partial occlusion.
- For PEEK: explicit position behind trunk's z, clamp x so half-visible.
- Soft alpha fade tied to occlusion percentage (raycast trunk count between Tsuno and camera → reduce alpha 30%). Tier-Med+ only.

**Existing interactions preserved:**

- Cursor proximity → REACT state.
- Keystroke flip (login mode) → unchanged.
- Click/grab → unchanged.
- Mood/personality system → drives state transition weights (e.g., contemplative mood increases CONTEMPLATE weight).
- Speech bubbles → unchanged, position relative to Tsuno.

**Per-camera-preset behavior:**

- `home`: full anchor set, full state machine.
- `product`: subset (closer anchors only), calm mode (existing behavior).
- `login`: existing massive watchful Tsuno fixed-position behavior preserved (no drift).

**Z-order:** Tsuno renders **after** forest, **before** post-process. Above trunks unless explicit PEEK occlusion overrides. CRT post applies to her too.

## 6. Per-Page Camera Presets

```
home         (default — forest edge framed, road slice bottom-left)
  pos      [-1.5, 1.6, -2]
  lookAt   [3,    1.0,  12]
  fog      near=15  far=70
  fov      55
  float    pos±0.04   rot±0.6°   period 4s

product      (deeper into grove, between trunks)
  pos      [2, 1.4, 4]
  lookAt   [4, 1.2, 16]
  fog      near=8   far=30
  fov      48        (tighter, claustrophobic)
  float    pos±0.025  rot±0.4°   period 5s

login        (low-angle up at canopy + god rays)
  pos      [3, 0.6, 8]
  lookAt   [3, 4.5, 14]
  fog      near=20  far=90
  fov      60
  float    pos±0.05   rot±0.5°   period 4.5s
```

**Handheld float math (per frame):**

```
camera.position = preset.pos + vec3(
  perlin(t * 0.25)        * float.pos,
  perlin(t * 0.25 + 100)  * float.pos,
  perlin(t * 0.25 + 200)  * float.pos
)
camera.rotation += vec3(
  perlin(t * 0.3 + 300) * float.rot,
  perlin(t * 0.3 + 400) * float.rot,
  0
)
```

Perlin (not random) gives organic breathing.

**Active preset detection** (unchanged from current portal):

```javascript
config.cameraPreset === 'product' → product
config.cameraPreset === 'login'   → login
default                           → home
```

`theme.liquid` cameraPreset block stays unchanged.

## 7. Page Transition Dolly

**v1 — Fallback flash (low blast radius, full reload):**

```
On link click matching same-origin:
  1. preventDefault
  2. trigger 200ms amber wash overlay + CRT roll
  3. window.location = href (after wash peaks)
```

Wash CSS lives in forest.css. Hides reload jank.

**v2 — SPA-lite intercept + animated dolly (post-launch follow-up):**

```
On link click matching same-origin:
  1. preventDefault
  2. fetch new page HTML
  3. parse, swap <main> content (or designated container)
  4. read new page's cameraPreset from inserted script
  5. animate camera from current → new preset (600ms)
  6. update history.pushState
  7. dispatch custom event so other systems re-init (ring carousel, taskbar, cart)
```

**Dolly animation (when SPA-lite present):**

```javascript
function animateCameraTo(targetPreset, duration = 600) {
  const fromPos = camera.position.clone();
  const fromQuat = camera.quaternion.clone();
  const fromFog = { near: scene.fog.near, far: scene.fog.far };
  const fromFov = camera.fov;
  const startT = performance.now();

  // in update loop:
  const k = clamp((now - startT) / duration, 0, 1);
  const eased = easeInOutCubic(k);

  camera.position.lerpVectors(fromPos, targetPos, eased);
  camera.quaternion.slerpQuaternions(fromQuat, targetQuat, eased);
  scene.fog.near = lerp(fromFog.near, target.fog.near, eased);
  scene.fog.far  = lerp(fromFog.far,  target.fog.far,  eased);
  camera.fov     = lerp(fromFov, target.fov, eased);
  camera.updateProjectionMatrix();
}
```

Handheld float **suspends** during dolly, resumes on completion.

**Tsuno during transition:**

- Drift state machine pauses on transition start.
- Tsuno smoothly translates to nearest anchor in new preset's anchor set.
- Resumes drift on dolly completion.

## 8. Performance Tiers

**Tier matrix:**

| Feature | High | Med | Low |
|---------|------|-----|-----|
| Cedar trunk count | 14 | 10 | 7 |
| Cedar trunk poly sides | 16 | 12 | 8 |
| Mid grove silhouette | yes | yes | yes (lower-res tex) |
| Hero shimenawa rope geo | full | full | flat plane |
| Shide animation | full | full | reduced 50% |
| Stone lanterns | 6 | 4 | 3 |
| Jizo statues | 5 | 3 | 2 |
| Sotoba/haka | full | full | half |
| Mossy ground patches | 12 | 6 | 3 |
| Falling needles | 60 | 30 | 0 |
| Drift fog wisps | 20 | 8 | 0 |
| God rays | 5 | 3 | 0 |
| Distant bird | yes | yes | no |
| Lantern point lights | real | real | fake billboard glow |
| Lantern flicker | per-frame 30Hz | per-frame 30Hz | static |
| Moss glow pulse | yes | no | no |
| Phosphor scintillation | yes | yes | no |
| Phosphor LUT mix | 0.7 | 0.7 | 0.5 |
| Vertex-snap PS1 wobble | yes | yes | yes |
| Distance fog | yes | yes | yes |
| Render scale | 1.0 | 0.85 | 0.6 |
| Pixel ratio cap | 2.0 | 1.5 | 1.0 |
| Tsuno occlusion raycast | yes | no | no |
| Page transition dolly | yes (v2 only) | yes (v2 only) | flash only |

> **v1 shipping note:** v1 ships flash-only across all tiers (per Section 7). The dolly column reflects v2 capability when SPA-lite intercept is added; until then, treat the "yes" cells as "flash only" too.

**Boot probe:**

```javascript
function probeFps(durationMs = 2500) {
  const samples = [];
  let last = performance.now();

  // on each rAF until elapsed > durationMs:
  const now = performance.now();
  samples.push(1000 / (now - last));
  last = now;

  return median(samples);
}

// Initial tier:
//   fps >= 55 → High
//   fps >= 40 → Med
//   else      → Low
```

Probe runs against a **light bootstrap scene** (sky + 3 trunks + fog) to avoid full-load stutter skew. Real scene assembles at chosen tier.

**Runtime watchdog:**

```
Rolling 60-frame median FPS.

tier=High and median < 50 for 2s → demote to Med.
tier=Med  and median < 40 for 2s → demote to Low.
tier=Low  and median < 25 for 5s → blank scene final fallback
                                    (static sky + silhouette + CSS only).

Promotions: only on full page reload (no in-session promote).
```

**Stage 1 / Stage 2 mapping:**

- Stage 1 (quality-first trim) = High → Med transition.
- Stage 2 (conservative baseline) = Med → Low transition.

**Persistence:** chosen tier in `localStorage`. Cleared on theme version bump.

**User override:** `?perf=high|med|low` URL param forces tier. Useful for QA + battery preference.

**Mobile:** UA + `(pointer: coarse)` + `navigator.deviceMemory < 4` → force Low at boot, skip probe.

## 9. Mobile & Scaling

```
Detection:    UA mobile  OR  (pointer: coarse)  OR  innerWidth < 768
              OR  navigator.deviceMemory < 4

Boot:         skip probe, force Low. localStorage tier='low'.
Render scale: 0.6 (renders at 60%, upscaled).
Pixel ratio:  cap at 1.0 regardless of devicePixelRatio.
Camera FOV:   +5° per preset (compensate portrait crop).
Float:        amplitude × 0.5 (gentler).

Tsuno drift:  TRAVEL + IDLE_ANCHOR only. No PEEK / PERCH / CONTEMPLATE.
              Cursor proximity replaced with touch tap reaction.

Audio:        ambient bed disabled by default (battery + autoplay policy).
              Accents play on tap.

Page nav:     flash-only (no dolly, no SPA-lite).

Orientation:  portrait → camera pos.z pulled back per preset for composition.
```

**Touch interaction:**

- Tap on Tsuno → existing grab/react.
- Tap on cedar/jizo/lantern/hokora → small phosphor pulse on tapped mesh, optional accent sound.
- No hover proximity on mobile.

**Battery awareness:**

If `navigator.getBattery()` resolves and `level < 0.2` and not charging:
- Force render scale 0.5.
- Disable ambient audio.
- Halve animation update rate (rAF every other frame).

## 10. Audio

`assets/japanjunky-audio.js` — small WebAudio wrapper, ~150 lines.

**Asset list:**

```
sounds/
  ambient_forest.ogg   ~40s seamless loop, -24 LUFS
                       wind through cedars + distant cicada/bird,
                       faint dripping water, occasional creak
  accent_chime.ogg     ~1.2s, soft wood-block + wind bell
  accent_paper.ogg     ~0.6s, paper rustle (shide)
  accent_stone.ogg     ~0.4s, dry stone tap
  accent_bell.ogg      ~2.0s, distant temple bell
  accent_step.ogg      ~0.3s, gravel/needle crunch
  accent_tsuno.ogg     ~0.8s, breathy whisper
```

Total ~600 KB ogg. Lazy-loaded after first user interaction (autoplay policy). Decoded once, cached.

**Engine:**

```
AudioContext (created on first user gesture)
  ├── masterGain (default 0.6)
  │   ├── ambientBus (gain 0.3, low-pass 1200Hz, slight reverb send)
  │   │   └── ambientLoop (BufferSource, loop=true, fade-in 3s)
  │   └── accentBus (gain 0.8)
  │       └── one-shot players (pooled, 8 simultaneous max)
  └── reverbSend (convolver, short room IR, 8% wet)
```

**Trigger map:**

| Event | Sound |
|-------|-------|
| Tsuno appears / state→PEEK | accent_tsuno (random pitch ±5%) |
| Tsuno PERCH on jizo | accent_stone |
| Tsuno passes near shide | accent_paper (50% prob) |
| Tsuno CONTEMPLATE start | accent_chime (10% prob) |
| Page nav (transition flash) | accent_chime |
| Add-to-cart | accent_bell |
| Hover ring carousel item | accent_paper (light) |
| Click ring carousel item | accent_stone |
| First page load (after gesture) | ambient fade-in |
| Lantern lit zone enter (Tsuno) | accent_chime soft |

**Spatial audio:**

Accents tied to scene positions use `PannerNode` with HRTF. Pan based on x position relative to camera. Volume falloff with distance (max 20 units). Tsuno-triggered accents pan with Tsuno's screen X.

**Mute UI:**

Small toggle in taskbar (`🔊` / `🔇`). Persists in `localStorage`. Default: muted on first visit. Soft prompt on hover.

**Default-muted behavior (clarification):**

- AudioContext is created on the first user gesture (browser autoplay requirement).
- When muted by default, **ambient bed does NOT auto-play** even after the gesture creates the context. Bed only fades in once the user explicitly toggles unmute.
- **Accent sounds still play** on interactions while muted — user-initiated taps imply consent to feedback chimes. (Master mute kills these too; the default mute is a "soft mute" that suppresses ambient only.)
- A small "tap to enable sound" hint shows once on first scene load, then never again.

**Accessibility:**

`prefers-reduced-motion: reduce` → mute by default, accents only.

**Mobile:** ambient disabled by default (Section 9).

## 11. Integration & Loading

**theme.liquid additions:**

```liquid
{% if settings.scene_mode == 'forest' or settings.scene_mode == blank %}
  {{ 'japanjunky-forest.css' | asset_url | stylesheet_tag }}

  <link rel="preload" as="image" href="{{ 'shrine_atlas.png' | asset_url }}">
  <link rel="preload" as="image" href="{{ 'cedar_bark.png'  | asset_url }}">
  <link rel="preload" as="image" href="{{ 'fog_gradient.png' | asset_url }}">
{% endif %}

{% if settings.audio_enabled %}
  <script src="{{ 'japanjunky-audio.js' | asset_url }}" defer></script>
{% endif %}
```

**Theme settings additions (`config/settings_schema.json`):**

```json
{
  "type": "select",
  "id":   "scene_mode",
  "label": "Background scene",
  "options": [
    { "value": "forest", "label": "Forest grove (default)" },
    { "value": "portal", "label": "Portal vortex (legacy)" }
  ],
  "default": "forest"
},
{
  "type": "checkbox",
  "id":   "audio_enabled",
  "label": "Enable ambient audio + interaction accents",
  "default": true
}
```

Theme editor toggle. Ship behind setting + revert via admin UI without redeploy.

**Module loading order:**

```
1. three.module.js                 (existing)
2. japanjunky-screensaver.js       (refactored — adapter)
3. japanjunky-forest.js            (new)   IF scene_mode=forest
4. japanjunky-portal.js            (new)   IF scene_mode=portal
5. japanjunky-screensaver-post.js  (existing, untouched)
6. japanjunky-audio.js             (new, lazy)
```

screensaver.js owns the import branch:

```javascript
const sceneFactory = (config.sceneMode === 'portal')
  ? await import('./japanjunky-portal.js')
  : await import('./japanjunky-forest.js');

const scene = sceneFactory.create(threeScene, camera, clock, tier);
```

**Body class addition:**

```liquid
<body class="jj-body
  {% if template == 'product' %} jj-body--product{% endif %}
  {% if template contains 'page.login' %} jj-body--auth{% endif %}
  jj-body--scene-{{ settings.scene_mode | default: 'forest' }}">
```

**Splash sequence on first load (replaces current portal splash in `japanjunky-splash.js`):**

```
0ms     blank black
80ms    fade-in fog wall (CSS keyframe)
300ms   fog clear → silhouette layer pop
500ms   mid-grove fade-in (300ms)
800ms   hero cedars + shrine elements fade-in (400ms)
1100ms  Tsuno fade-in (existing curtain shader)
1400ms  ambient bed fade-in if audio unlocked
        full scene live, scroll active
```

Same pattern as existing splash, new keyframes + targets.

**Legacy portal cleanup:**

NOT done in this rollout. portal.js extracted but kept. Setting toggle proves forest works in production. Cleanup deferred to follow-up after ~2 weeks of stable forest.

## 12. File Summary

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `assets/japanjunky-forest.js` | Forest scene module: geometry, materials, shaders, animation, parallax, anchors | ~1200 |
| `assets/japanjunky-portal.js` | Extracted legacy portal code for rollback toggle | ~600 |
| `assets/japanjunky-audio.js` | WebAudio wrapper, ambient bed, accent triggers | ~150 |
| `assets/japanjunky-forest.css` | Forest-specific overlay styles, transition flash | ~80 |
| `assets/shrine_atlas.png` | Atlas for shrine props (jizo, lanterns, sotoba, haka, shide) | — |
| `assets/cedar_bark.png` | Cedar trunk texture | — |
| `assets/cedar_moss_base.png` | Mossy base overlay | — |
| `assets/shimenawa_rope.png` | Rope texture | — |
| `assets/shide_paper.png` | Shide alpha cutout | — |
| `assets/silhouette_trunks.png` | Distant silhouette layer | — |
| `assets/fog_gradient.png` | Sky/fog wall gradient | — |
| `assets/ground_needles.png` | Ground tile | — |
| `assets/moss_patch.png` | Moss overlay | — |
| `assets/sounds/ambient_forest.ogg` | Ambient loop | — |
| `assets/sounds/accent_*.ogg` | Six accent sounds | — |

### Modified Files

| File | Changes |
|------|---------|
| `assets/japanjunky-screensaver.js` | Refactor: extract portal code into `japanjunky-portal.js`, add forest module import branch, add Tsuno drift state machine using forest anchors, add page-transition dolly machinery, add adaptive perf tier system + boot probe + watchdog |
| `assets/japanjunky-splash.js` | Replace portal splash sequence keyframes with forest splash sequence |
| `layout/theme.liquid` | Add forest CSS conditional, asset preloads, scene_mode body class, audio script tag |
| `config/settings_schema.json` | Add `scene_mode` select, `audio_enabled` toggle |

### Unchanged

- `assets/japanjunky-screensaver-post.js` — CRT post-process untouched.
- All existing CSS files except `japanjunky-splash.css` (minor flash-overlay addition).
- Splash portal HTML / DOM structure stays the same (hosts a different Three.js scene now).
- Ring carousel, product zone, taskbar, cart, login gateway: untouched.

## 13. Accessibility

- `prefers-reduced-motion: reduce`:
  - Handheld float disabled.
  - God ray opacity breath disabled.
  - Moss glow pulse disabled.
  - Page transitions: instant flash only.
  - Audio: muted by default, accents only.
- All scene elements decorative — `aria-hidden="true"` on canvas.
- Tsuno interactions remain optional (no required engagement for site use).
- Audio has explicit mute toggle in taskbar.
- Color contrast unchanged (text overlays still sit on existing dark UI panels, not on the forest scene directly).

## 14. Open Risks

- **Photo texture sourcing.** Concept images are reference only. CC-licensed source photos for cedar bark / jizo / ishidoro / sotoba / haka must be procured. Plan task should include sourcing step before texture pipeline.
- **PS1 vertex-snap shader.** Requires custom shader injection on `MeshBasicMaterial` (`onBeforeCompile`). Behavior across Three.js versions can drift; test with locked Three version.
- **SPA-lite (v2 transitions).** Ring carousel, taskbar, cart, and any other systems that bind to DOM at load must re-init cleanly on `<main>` swap. Audit needed before v2 rollout.
- **Mobile battery.** Even tier-Low on integrated GPU mobile may struggle; battery-aware throttle may need tuning.
- **Audio licensing.** Ambient + accents must be original or CC0/CC-BY. Temple bell sample especially risky.
- **Boot-probe deferred construction.** The probe scheme (Section 8) requires `forest.create()` to first build only a "light bootstrap" subset (sky + 3 trunks + fog), measure FPS, then assemble the rest at the chosen tier. Forest module API must support this two-phase construction (e.g., `createForest(...).bootstrap()` returns probe scene; `.assembleFull(tier)` finishes). Add to forest module contract during implementation.
- **Tier-promotion under v2 SPA-lite.** Tier promotions only happen on full reload (Section 8). Once SPA-lite ships in v2, navigating in-site never reloads, so a session that demoted (e.g., due to a transient GPU spike from another tab) stays demoted for the full session. Acceptable tradeoff for v1; revisit if user complaints surface in v2.
