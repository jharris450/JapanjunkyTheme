# Tsuno Idle Personality System

## Problem

Tsuno's current idle animation is a fixed-position sine bob (0.5 Hz, amplitude 0.15, period 2s) at `TSUNO_IDLE_POS = {x:4, y:0, z:6}`. This feels mechanical and lifeless — there's no variation, no personality, and no player interaction.

## Solution

A behavior queue system with day-based moods, varied idle behaviors, mouse interactivity, and visual personality cues — all within the 3D screensaver scene. Tsuno never overlays, interrupts, or blocks any UI elements.

## Mood System

7 moods mapped to days of the week via `new Date().getDay()` (browser local timezone). Each mood is a config object (parameter set, not a separate state machine) that sets: movement speed multiplier, behavior weights, mouse sensitivity, glow intensity, and reaction style.

| Day | Mood | Traits |
|-----|------|--------|
| Mon | **Curious** | Favors camera-close positions, leans toward cursor, bright glow |
| Tue | **Lazy** | Slow drifts, long lingers, minimal mouse reaction, dim glow |
| Wed | **Mischievous** | Quick darts between positions, playful wiggles near cursor, tint flickers |
| Thu | **Watchful** | Favors meta box area, tracks cursor closely, steady glow |
| Fri | **Energetic** | Faster transitions, more frequent behavior changes (~10s), scale pulses |
| Sat | **Dreamy** | Slow floaty arcs, gentle sway, barely reacts to cursor, soft glow |
| Sun | **Shy** | Stays further from camera, retreats from cursor, faint tint |

## Behavior Pool

~8 idle behaviors cycled every 10-20s (interval jittered by mood). Each defines a target position, unique idle animation at that position, and linger duration. Selection is weighted random based on current mood.

### Behavior Definitions with Concrete Positions

| Behavior | Description | Target Position |
|----------|-------------|----------------|
| **Hang** | Default gentle bob with subtle horizontal drift | x:4, y:0, z:6 (idle pos) |
| **Peek** | Floats to screen edge, peeks inward with slight tilt | x: computed from frustum edge minus 0.5 at current z (aspect-aware), y:0.5, z:5 |
| **Loom** | Drifts close to camera, gets big, hovers as if judging | x:1.5, y:0.5, z:2.5 |
| **Patrol** | Slow horizontal drift across scene at mid-depth | x:-4 to x:6 sweep, y:0.3, z:10 |
| **Perch** | Floats near product info zone (right side), settles and watches | x:5, y:-1, z:6 |
| **Sink** | Slowly sinks below visible area, pause, rises back | current x, y: computed from camera frustum bottom minus 1 unit, current z |
| **Circle** | Small lazy orbit (radius 1.0) around current position | centered on current pos |
| **Retreat** | Drifts deep into portal tunnel, gets small and distant | x:2, y:0, z:22 |

**Peek x-target**: Computed at runtime from the camera frustum width at z:5: `x = Math.tan(camera.fov * Math.PI / 360) * z_distance * aspect - 0.5`, where `z_distance` is the distance from camera to Tsuno's z, and `aspect` is the viewport aspect ratio. The `-0.5` keeps Tsuno just inside the visible edge.

**Sink y-target**: Computed at runtime from the camera frustum at Tsuno's current z-depth: `y = -(Math.tan(camera.fov * Math.PI / 360) * z_distance) - 1.0` to ensure Tsuno drops fully below the visible area regardless of aspect ratio. Note: `camera.fov` is in degrees (60), so degrees-to-radians conversion is required.

**Patrol**: An animated behavior — Tsuno eases from x:6 to x:-4 (or vice versa) over the linger duration rather than jumping to a static point.

### Mood-Behavior Weights

Default weight for all behaviors is 1.0. Per-mood overrides as multipliers:

| Mood | Hang | Peek | Loom | Patrol | Perch | Sink | Circle | Retreat |
|------|------|------|------|--------|-------|------|--------|---------|
| Curious | 1 | 1 | 3 | 1 | 3 | 1 | 1 | 0.2 |
| Lazy | 3 | 0.5 | 0.5 | 0.3 | 1 | 2 | 0.5 | 1 |
| Mischievous | 0.3 | 3 | 1 | 3 | 1 | 1 | 1 | 0.5 |
| Watchful | 2 | 1 | 1 | 1 | 3 | 0.5 | 1 | 0.3 |
| Energetic | 0.5 | 1 | 1 | 3 | 1 | 0.5 | 3 | 1 |
| Dreamy | 1 | 1 | 0.3 | 0.5 | 1 | 1 | 3 | 2 |
| Shy | 0.5 | 3 | 0.2 | 0.5 | 1 | 1 | 1 | 3 |

Transitions between behaviors use the existing `easeInOutCubic` interpolation.

## Mouse Interaction

Two layers, both within the 3D scene. Reuses existing `mouseNorm` ({x, y} normalized -1..1) from the existing mousemove listener. On mobile (`isMobile === true`), mouse interaction layers are inactive — Tsuno runs the behavior queue only.

### Layer 1: Passive Awareness (constant during idle)

- Tsuno leans toward cursor via a post-`lookAt` local z-rotation offset (~5-10 degrees, proportional to `mouseNorm.x`)
- Glow intensity (`uAlpha`) subtly brightens (+0.1) when cursor is on the screensaver canvas side
- Since Tsuno is a flat PlaneGeometry always facing the camera via `lookAt()`, "awareness" is expressed through tilt and glow, not facing direction

### Layer 2: Proximity Reactions (threshold-based)

To check proximity: project `tsunoMesh.position` to NDC via `THREE.Vector3.project(camera)`, then convert to viewport pixels using `window.innerWidth/Height` (not `renderer.getSize()`, which returns the low-res render target). Two thresholds in viewport pixels: "close" (~150px) and "very close" (~60px).

| Mood type | Close reaction | Very close reaction |
|-----------|---------------|-------------------|
| **Curious/Watchful** | Leans in, glow brightens | Follows cursor slowly, slight scale up |
| **Mischievous/Energetic** | Wiggles, tint flicker | Darts to a new position playfully |
| **Shy/Dreamy** | Drifts away gently | Retreats quickly to a far position |
| **Lazy** | Barely reacts, slow head turn | Reluctant small drift away |

Proximity reactions interrupt the current behavior but don't reset the behavior timer. Once cursor moves away, Tsuno resumes current behavior or picks next if timer elapsed.

### Call Site

`updateTsunoMouse(mouseNorm)` is called from `animate()` after `updateTsuno(dt)` (line ~972), only when `tsunoState === 'idle'` and `!isMobile`. It receives the existing `mouseNorm` object.

## Visual Personality Cues

### Per-mood Visual Parameters

| Parameter | Range | Example |
|-----------|-------|---------|
| **Glow intensity** | 0.5 - 1.2x base alpha (via `uAlpha` uniform) | Lazy=dim, Energetic=bright |
| **Tint warmth** | Shift `uTint` vec3 | Dreamy=cooler (0.8, 0.15, 0.2), Mischievous=warmer (1.0, 0.35, 0.05) |
| **Bob amplitude** | 0.08 - 0.25 | Lazy=small, Energetic=large |
| **Bob frequency** | 0.3 - 0.8 Hz | Dreamy=slow, Mischievous=quick |
| **Sway** | Sinusoidal x-axis oscillation (0 - 0.15 amplitude) | Dreamy=wide, Watchful=none |
| **Tilt** | Post-lookAt local z-rotation, +/-0.09-0.26 rad (~5-15 deg) | Curious=lean in, Shy=lean away |

### Moment Cues (on transitions)

- **Arrival pulse**: scale bump (-1.0 -> -1.05 -> -1.0 on x, 1.0 -> 1.05 -> 1.0 on y, over 0.3s). Note: x-scale stays negative to preserve the horizontal flip (`scale.x = -1` at line 404).
- **Awareness flash**: subtle `uAlpha` spike (+0.15 over 0.15s, ease back) when cursor enters proximity zone
- **Startle shake**: quick position.x jitter (+/-0.05 units over 0.2s) for shy/startled reactions

### Tilt Composition with lookAt

`tsunoMesh.lookAt(camera.position)` is called first (makes the sprite face the camera). Then a local z-axis rotation is applied:

```javascript
tsunoMesh.lookAt(camera.position);
tsunoMesh.rotateZ(tiltAngle); // post-lookAt local rotation
```

This avoids the rotation being overwritten and keeps the sprite camera-facing with an additive lean.

## State Machine Integration

### Idle-Only Activation

The personality system only runs when `tsunoState === 'idle'`. Other states (transitioning-out, orbiting, returning) are untouched.

### Transition Handling

- When Tsuno leaves idle (e.g., `setTsunoState('transitioning-out')`), the personality system's behavior timer is **paused** (store remaining time).
- The transition system reads `tsunoMesh.position` as the start position — this is safe regardless of which behavior position Tsuno is currently at, since `easeInOutCubic` interpolates from any start to the orbit endpoint.
- When Tsuno returns to idle (state becomes `'idle'` after `'returning'` completes), the personality system **picks a fresh behavior** (timer resets, starts from idle pos).

### Tab Hidden / Pause Behavior

The screensaver pauses when tab is hidden or scrolled past. Behavior timers use wall-clock timestamps (`performance.now()`) rather than accumulated `dt`, so a pause/resume gap triggers an immediate behavior transition (Tsuno picks a new behavior on resume). This is acceptable — the user won't see the jump since the tab was hidden.

### Reduced Motion

When `prefers-reduced-motion` is active (already handled by screensaver rendering a single frame), the personality system does not run — Tsuno stays at idle pos with no animation.

## Architecture

All code lives within `assets/japanjunky-screensaver.js`. No new files.

### New Code

- `TSUNO_MOODS` — config object with 7 mood parameter sets (weights, visual params, reaction style)
- `TSUNO_BEHAVIORS` — array of 8 behavior definitions with target positions
- `getTsunoMood()` — returns today's mood via `new Date().getDay()`
- `pickNextBehavior(mood)` — weighted random selection from behavior pool
- `updateTsunoIdle(t)` — replaces current idle block with full personality system. Uses wall-clock `t` (seconds) for behavior timing.
- `updateTsunoMouse(mouseNorm)` — awareness + proximity reactions. Called from `animate()` after `updateTsuno(dt)`, only when idle and not mobile. Receives existing `mouseNorm` object. Uses `THREE.Vector3.project(camera)` for screen-space proximity check.

### Modified Code

- `tsunoState === 'idle'` block in `updateTsuno()` (lines 635-640) — calls `updateTsunoIdle(t)` instead of hardcoded sine bob
- Add `updateTsunoMouse(mouseNorm)` call in `animate()` after `updateTsuno(dt)`

### Untouched

- Bubble system, orbital states, shader code, render pipeline, all UI code
- No new event listeners (reuses existing mouse tracking)
- No DOM changes
- Existing transition/orbit states work exactly as before
