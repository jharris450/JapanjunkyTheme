# Forest — Tsuno Drift Implementation Plan (Sub-Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tsuno aware of the forest grove. Replace ad-hoc orbit/idle positions with anchor-based drift that navigates between cedar trunks, jizo statues, lanterns, sotoba, and the hokora shrine. Preserves existing personality/mood system; only swaps position selection and adds three forest-specific states.

**Architecture:** Forest module exposes `getTsunoAnchors()` and `getTrunkColliders()`. `screensaver.js`'s existing `TSUNO_BEHAVIORS` array gets forest-aware position functions. Three new behavior IDs (`PEEK_TREE`, `PERCH_SHRINE`, `CONTEMPLATE`) replace orbit-style behaviors when forest mode is active. Path planning swaps from linear ease to Hermite curves with trunk avoidance.

**Tech Stack:** Vanilla ES5 IIFE pattern, Three.js (existing).

**Spec:** `docs/superpowers/specs/2026-04-30-forest-splash-design.md` (Section 5).

**Prerequisite:** Sub-plan 1 (forest baseline) merged. `window.JJ_Forest.create()` factory + layers + geometry must exist.

**Sub-plan scope:**
- ✅ Forest anchor exposure
- ✅ Trunk collider list for path planning
- ✅ Anchor-aware behavior position functions
- ✅ Three new behavior states (PEEK_TREE, PERCH_SHRINE, CONTEMPLATE)
- ✅ Hermite curve path planning + trunk avoidance
- ✅ Per-preset Tsuno behavior (home full / product calm / login fixed)
- ❌ Audio + page transitions (sub-plan 3)
- ❌ Splash sequence rewrite (sub-plan 1 Phase 8)

---

## Phase 1 — Forest Anchor Exposure

### Task 1: Implement `forest.getTsunoAnchors()`

**Files:**
- Modify: `assets/japanjunky-forest.js`

The forest module currently returns an empty array from `getTsunoAnchors()`. Replace with real anchor data derived from the geometry that was placed in sub-plan 1 (HERO_LAYOUT, MID_GROVE_LAYOUT, SHRINE_PROPS, heroRopes).

- [ ] **Step 1:** Find the stub in `assets/japanjunky-forest.js`:

```javascript
    function getTsunoAnchors() { return []; }
```

- [ ] **Step 2:** Replace with a builder that returns derived anchor data:

```javascript
    var tsunoAnchors = null;
    function getTsunoAnchors() {
      if (tsunoAnchors) return tsunoAnchors;
      tsunoAnchors = [];

      // Tree anchors — one per hero cedar (positions just to the side of trunk)
      for (var hi = 0; hi < heroCedars.length; hi++) {
        var L = heroCedars[hi].layout;
        tsunoAnchors.push({
          id: 'hero_cedar_' + hi,
          pos: [L[0] + (L[3] + 0.3), L[2] * 0.5, L[1]],
          weight: 1.0,
          type: 'tree',
          trunkX: L[0],
          trunkZ: L[1],
          trunkRadius: L[3]
        });
      }

      // Shrine anchors — derived from SHRINE_PROPS
      for (var pi = 0; pi < SHRINE_PROPS.length; pi++) {
        var P = SHRINE_PROPS[pi];
        var atype, weight;
        if (P.type === 'hokora')   { atype = 'shrine';  weight = 1.5; }
        else if (P.type === 'jizo')     { atype = 'shrine';  weight = 1.2; }
        else if (P.type === 'ishidoro') { atype = 'lantern'; weight = 0.6; }
        else if (P.type === 'sotoba')   { atype = 'grave';   weight = 0.9; }
        else if (P.type === 'haka')     { atype = 'grave';   weight = 0.8; }
        else continue;
        tsunoAnchors.push({
          id: P.type + '_' + pi,
          pos: [P.pos[0], P.pos[1] + P.h * 0.7, P.pos[2]], // slightly above prop
          weight: weight,
          type: atype
        });
      }

      // Rope anchors — one per hero rope (positions floating just outside the rope)
      for (var ri = 0; ri < heroCedars.length; ri++) {
        var rL = heroCedars[ri].layout;
        var ropeY = rL[2] * 0.45;
        tsunoAnchors.push({
          id: 'shide_rope_' + ri,
          pos: [rL[0] + 0.6, ropeY, rL[1] + 0.6],
          weight: 0.7,
          type: 'rope'
        });
      }

      return tsunoAnchors;
    }
```

- [ ] **Step 3:** Validate JS:

```bash
node -c assets/japanjunky-forest.js
```

Expected: silent success.

- [ ] **Step 4:** Smoke-test (browser): open DevTools console with site loaded:

```javascript
window.JJ_FOREST_DEBUG?.getTsunoAnchors()
// or via screensaver's sceneModule reference
```

Expected: array of ~21 anchors. (To enable the debug handle, add `window.JJ_FOREST_DEBUG = sceneModule;` after creation in screensaver.js — only for testing.)

- [ ] **Step 5:** Commit:

```bash
git add assets/japanjunky-forest.js
git commit -m "feat(forest): implement getTsunoAnchors()"
```

---

### Task 2: Implement `forest.getTrunkColliders()`

**Files:**
- Modify: `assets/japanjunky-forest.js`

For path planning, Tsuno needs a list of trunk colliders to avoid clipping through.

- [ ] **Step 1:** Find the stub:

```javascript
    function getTrunkColliders() { return []; }
```

- [ ] **Step 2:** Replace with collider builder:

```javascript
    var trunkColliders = null;
    function getTrunkColliders() {
      if (trunkColliders) return trunkColliders;
      trunkColliders = [];
      // Hero cedars (priority — closest to camera, most visible occlusion)
      for (var hi = 0; hi < heroCedars.length; hi++) {
        var L = heroCedars[hi].layout;
        trunkColliders.push({
          x: L[0], z: L[1],
          radius: L[3] + 0.15, // small buffer past actual trunk
          height: L[2]
        });
      }
      // Mid-grove cedars (less critical but Tsuno does drift back there)
      for (var mi = 0; mi < MID_GROVE_LAYOUT.length; mi++) {
        var ML = MID_GROVE_LAYOUT[mi];
        trunkColliders.push({
          x: ML[0], z: ML[1],
          radius: ML[3] + 0.15,
          height: ML[2]
        });
      }
      return trunkColliders;
    }
```

- [ ] **Step 3:** Validate + commit:

```bash
node -c assets/japanjunky-forest.js
git add assets/japanjunky-forest.js
git commit -m "feat(forest): implement getTrunkColliders() for Tsuno pathfinding"
```

---

## Phase 2 — Anchor-Aware Behavior Position Functions

### Task 3: Add anchor accessor in screensaver.js

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Add helpers that read forest anchors safely (returns null when forest module isn't active or anchors aren't loaded yet).

- [ ] **Step 1:** Find the existing Tsuno setup section (around line 770, just before `var TSUNO_IDLE_POS`). Insert helper block:

```javascript
  // ─── Forest anchor accessors ─────────────────────────────────
  // These return null when sceneModule is portal mode or forest hasn't
  // exposed anchors yet. Behavior pos() functions fall back to existing
  // hardcoded positions in that case.
  function getForestAnchors() {
    if (!sceneModule || !sceneModule.getTsunoAnchors) return null;
    var a = sceneModule.getTsunoAnchors();
    return (a && a.length > 0) ? a : null;
  }
  function pickAnchorByType(type) {
    var anchors = getForestAnchors();
    if (!anchors) return null;
    var pool = [];
    var totalW = 0;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].type === type) {
        pool.push(anchors[i]);
        totalW += anchors[i].weight;
      }
    }
    if (pool.length === 0) return null;
    var roll = Math.random() * totalW;
    var acc = 0;
    for (var j = 0; j < pool.length; j++) {
      acc += pool[j].weight;
      if (roll <= acc) return pool[j];
    }
    return pool[pool.length - 1];
  }
  function pickAnyAnchor() {
    var anchors = getForestAnchors();
    if (!anchors) return null;
    var totalW = 0;
    for (var i = 0; i < anchors.length; i++) totalW += anchors[i].weight;
    var roll = Math.random() * totalW;
    var acc = 0;
    for (var k = 0; k < anchors.length; k++) {
      acc += anchors[k].weight;
      if (roll <= acc) return anchors[k];
    }
    return anchors[anchors.length - 1];
  }
```

- [ ] **Step 2:** Validate + commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add forest anchor accessors"
```

---

### Task 4: Anchor-aware position functions for `hang`, `peek`, `loom`, `patrol`, `perch`, `circle`, `retreat`

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Existing `TSUNO_BEHAVIORS` (around line 845) has hardcoded `pos()` returns. When forest is active, prefer anchor positions. When forest not active, fall back to existing logic.

- [ ] **Step 1:** Find the `TSUNO_BEHAVIORS` array around line 845. Replace each behavior's `pos:` with a forest-aware version. Full replacement:

```javascript
  var TSUNO_BEHAVIORS = [
    {
      name: 'hang',
      pos: function () {
        var a = pickAnchorByType('rope');
        if (a) return { x: a.pos[0], y: a.pos[1], z: a.pos[2] };
        return { x: 4.0, y: 0.0, z: 6 };
      }
    },
    {
      name: 'peek',
      pos: function () {
        // Forest: hide BEHIND a tree (shifted to occluded side)
        var a = pickAnchorByType('tree');
        if (a) {
          // Place Tsuno on the far side of the trunk relative to camera
          var camX = camera.position.x;
          var dx = a.trunkX - camX;
          var sign = dx >= 0 ? 1 : -1;
          return {
            x: a.trunkX + sign * (a.trunkRadius + 0.4),
            y: a.pos[1] - 0.2,
            z: a.trunkZ
          };
        }
        // Fallback (legacy)
        var zDist = 5 - camera.position.z;
        var halfW = Math.tan(camera.fov * Math.PI / 360) * zDist * (camera.aspect || viewportAspect);
        return { x: halfW - 0.5, y: 0.5, z: 5 };
      }
    },
    {
      name: 'loom',
      pos: function () {
        var a = pickAnchorByType('shrine');
        if (a) return { x: a.pos[0], y: a.pos[1] + 0.6, z: a.pos[2] - 1.2 };
        return { x: 1.5, y: 0.5, z: 2.5 };
      }
    },
    {
      name: 'patrol',
      pos: function () {
        var a = pickAnchorByType('lantern');
        if (a) return { x: a.pos[0], y: a.pos[1] + 0.4, z: a.pos[2] };
        return { x: 6.0, y: 0.3, z: 10 };
      },
      animated: true,
      endX: -4.0
    },
    {
      name: 'perch',
      pos: function () {
        // Forest: perch on hokora roof or jizo head
        var a = pickAnchorByType('shrine');
        if (a) return { x: a.pos[0], y: a.pos[1] + 0.3, z: a.pos[2] };
        return { x: 5.0, y: -1.0, z: 6 };
      }
    },
    {
      name: 'sink',
      pos: function () {
        var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
        var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
        var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
        return { x: cx, y: cy, z: cz };
      },
      bottomY: function () {
        var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
        var zDist = cz - camera.position.z;
        var halfH = Math.tan(camera.fov * Math.PI / 360) * zDist;
        return -halfH - 1.0;
      }
    },
    {
      name: 'circle',
      pos: function () {
        // Forest: circle around a hero cedar
        var a = pickAnchorByType('tree');
        if (a) return { x: a.trunkX + a.trunkRadius + 1.0, y: a.pos[1], z: a.trunkZ };
        var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
        var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
        var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
        return { x: cx, y: cy, z: cz };
      },
      orbital: true,
      radius: 1.0
    },
    {
      name: 'retreat',
      pos: function () {
        // Forest: retreat to a distant grave marker (sotoba/haka)
        var a = pickAnchorByType('grave');
        if (a) return { x: a.pos[0], y: a.pos[1], z: a.pos[2] };
        return { x: 2.0, y: 0.0, z: 22 };
      }
    }
  ];
```

- [ ] **Step 2:** Validate + commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): forest-aware behavior position functions"
```

---

## Phase 3 — Hermite Path Planning + Trunk Avoidance

### Task 5: Hermite curve interpolation helper

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

The existing transition uses linear `tsunoTransFrom` → `tsunoTransTo` interpolation in `updateTsunoIdle`. Replace with a Hermite curve that arcs over a control point — gives Tsuno a more "drifting" feel.

- [ ] **Step 1:** Find `updateTsunoIdle` (around line 940). Locate the section that interpolates position during a transition (search for `tsunoTransFrom` and `tsunoTransTo`). It probably looks like:

```javascript
    if (tsunoTransitioning) {
      var k = clamp((t - tsunoTransStart) / tsunoTransDuration, 0, 1);
      var eased = easeOut(k); // or similar
      tsunoMesh.position.x = lerp(tsunoTransFrom.x, tsunoTransTo.x, eased);
      tsunoMesh.position.y = lerp(tsunoTransFrom.y, tsunoTransTo.y, eased);
      tsunoMesh.position.z = lerp(tsunoTransFrom.z, tsunoTransTo.z, eased);
      ...
    }
```

(The exact code may differ — read what's there before editing.)

- [ ] **Step 2:** Above the transition block, add a Hermite control point computed when transition starts. Find `startBehavior(t, behaviorIdx)` (around line 920). After it computes `tsunoTransTo`, add:

```javascript
    // Compute Hermite midpoint — arcs over halfway between from/to
    var midX = (tsunoTransFrom.x + tsunoTransTo.x) * 0.5;
    var midY = Math.max(tsunoTransFrom.y, tsunoTransTo.y) + 0.6; // lift midpoint
    var midZ = (tsunoTransFrom.z + tsunoTransTo.z) * 0.5;
    tsunoTransMid = { x: midX, y: midY, z: midZ };
```

Add `var tsunoTransMid = { x: 0, y: 0, z: 0 };` near the other `tsunoTrans*` vars.

- [ ] **Step 3:** Replace the linear interp in the transition block with a quadratic Bezier (which approximates Hermite for our needs):

```javascript
    if (tsunoTransitioning) {
      var k = clamp((t - tsunoTransStart) / tsunoTransDuration, 0, 1);
      var eased = easeInOutCubic(k);
      // Quadratic Bezier: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      var u = 1 - eased;
      tsunoMesh.position.x = u*u * tsunoTransFrom.x + 2*u*eased * tsunoTransMid.x + eased*eased * tsunoTransTo.x;
      tsunoMesh.position.y = u*u * tsunoTransFrom.y + 2*u*eased * tsunoTransMid.y + eased*eased * tsunoTransTo.y;
      tsunoMesh.position.z = u*u * tsunoTransFrom.z + 2*u*eased * tsunoTransMid.z + eased*eased * tsunoTransTo.z;
      // ... rest of existing transition code ...
    }
```

If `easeInOutCubic` doesn't exist, add it near other helpers:

```javascript
    function easeInOutCubic(k) {
      return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    }
```

- [ ] **Step 4:** Commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): Hermite-style arcing path between behaviors"
```

---

### Task 6: Trunk avoidance in path planning

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

If the straight-line path from `tsunoTransFrom` to `tsunoTransTo` passes through a trunk collider, raise the Hermite midpoint or shift it sideways.

- [ ] **Step 1:** Add a helper that checks line-vs-cylinder collision in 2D (xz plane):

```javascript
  function pathCollidesTrunk(fromX, fromZ, toX, toZ) {
    if (!sceneModule || !sceneModule.getTrunkColliders) return null;
    var colliders = sceneModule.getTrunkColliders();
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      // Distance from line segment (from→to) to point (c.x, c.z)
      var dx = toX - fromX, dz = toZ - fromZ;
      var len2 = dx * dx + dz * dz;
      if (len2 < 0.0001) continue;
      var u = ((c.x - fromX) * dx + (c.z - fromZ) * dz) / len2;
      u = Math.max(0, Math.min(1, u));
      var px = fromX + dx * u, pz = fromZ + dz * u;
      var ddx = c.x - px, ddz = c.z - pz;
      var dist = Math.sqrt(ddx * ddx + ddz * ddz);
      if (dist < c.radius + 0.4) return c;
    }
    return null;
  }
```

- [ ] **Step 2:** In `startBehavior`, after computing the midpoint (Task 5 Step 2), check for trunk collisions and adjust:

```javascript
    var hit = pathCollidesTrunk(tsunoTransFrom.x, tsunoTransFrom.z, tsunoTransTo.x, tsunoTransTo.z);
    if (hit) {
      // Shift midpoint sideways past the trunk
      var midX = (tsunoTransFrom.x + tsunoTransTo.x) * 0.5;
      var midZ = (tsunoTransFrom.z + tsunoTransTo.z) * 0.5;
      // Vector perpendicular to path direction in xz plane
      var px = -(tsunoTransTo.z - tsunoTransFrom.z);
      var pz =  (tsunoTransTo.x - tsunoTransFrom.x);
      var plen = Math.sqrt(px * px + pz * pz) || 1;
      px /= plen; pz /= plen;
      // Push midpoint to the side that's away from trunk center
      var sign = ((midX - hit.x) * px + (midZ - hit.z) * pz) >= 0 ? 1 : -1;
      tsunoTransMid.x = midX + px * (hit.radius + 0.8) * sign;
      tsunoTransMid.z = midZ + pz * (hit.radius + 0.8) * sign;
      tsunoTransMid.y += 0.4; // also lift higher
    }
```

- [ ] **Step 3:** Commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): trunk avoidance in path planning"
```

---

## Phase 4 — New Forest States

### Task 7: PEEK_TREE state behavior

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

The existing `peek` behavior was repurposed in Task 4 to use tree anchors. This task adds the *behavior animation* — Tsuno's alpha gets clamped low when occluded by a trunk, simulating "half-hidden".

- [ ] **Step 1:** In `updateTsunoIdle` (around line 940+), after the position interpolation block, add an occlusion alpha modulation when the current behavior is `peek`:

```javascript
    // PEEK occlusion alpha — only when forest is active and behavior is 'peek'
    if (tsunoBehaviorIdx === 1 && sceneModule && sceneModule.getTrunkColliders) {
      var colliders = sceneModule.getTrunkColliders();
      var camX = camera.position.x, camZ = camera.position.z;
      var tx = tsunoMesh.position.x, tz = tsunoMesh.position.z;
      var occluded = 0;
      for (var ci = 0; ci < colliders.length; ci++) {
        var col = colliders[ci];
        // Test if trunk is between camera and Tsuno
        var dx = tx - camX, dz = tz - camZ;
        var len2 = dx * dx + dz * dz;
        if (len2 < 0.001) continue;
        var u = ((col.x - camX) * dx + (col.z - camZ) * dz) / len2;
        if (u < 0 || u > 1) continue;
        var px = camX + dx * u, pz = camZ + dz * u;
        var ddx = col.x - px, ddz = col.z - pz;
        var dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < col.radius) { occluded = 1; break; }
      }
      if (occluded && tsunoMesh.material && tsunoMesh.material.uniforms && tsunoMesh.material.uniforms.uAlpha) {
        tsunoMesh.material.uniforms.uAlpha.value = 0.4;
      }
    }
```

(Adjust the uniform path — it may differ. Search `uAlpha` in the file to find where alpha is set.)

- [ ] **Step 2:** Commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): peek state lowers alpha when occluded by trunk"
```

---

### Task 8: PERCH_SHRINE state behavior

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

When perch behavior targets a shrine anchor (Task 4 Step 1 already does), add a small "settle" bob — Tsuno gently dips into resting position over the prop, then stays still.

- [ ] **Step 1:** In `updateTsunoIdle`, after the transition completes (when `tsunoTransitioning` becomes false), add:

```javascript
    // PERCH settle: when behavior is 'perch' and not transitioning,
    // apply small dampened bob settling toward the anchor.
    if (tsunoBehaviorIdx === 4 && !tsunoTransitioning) {
      var settleAmp = 0.04 * Math.exp(-(t - tsunoBehaviorStart) * 0.5);
      tsunoMesh.position.y = tsunoTransTo.y + Math.sin((t - tsunoBehaviorStart) * 4.0) * settleAmp;
    }
```

- [ ] **Step 2:** Commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): perch state settles with dampened bob over shrine"
```

---

### Task 9: CONTEMPLATE state behavior

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Add a new behavior ID (8) for CONTEMPLATE — Tsuno faces a sotoba/haka grave marker, alpha low, very slow drift.

- [ ] **Step 1:** Append a new behavior entry to `TSUNO_BEHAVIORS` (Task 4 Step 1 added 8 entries; this adds the 9th):

```javascript
    {
      name: 'contemplate',
      pos: function () {
        var a = pickAnchorByType('grave');
        if (a) return { x: a.pos[0] + 0.5, y: a.pos[1] + 0.2, z: a.pos[2] - 0.3 };
        // Fallback: drift slowly to mid-grove distance
        return { x: 2.0, y: 0.5, z: 18 };
      }
    }
```

- [ ] **Step 2:** Add weights for the new behavior to all 7 mood arrays in `TSUNO_MOODS.weights`. Each existing array has 8 entries; append a 9th. Suggested values:

```javascript
    weights: [
      [0.3, 3,   0.2, 0.5, 1,   1,   1,   3,   2  ],  // shy — contemplate fits shy mood
      [0.5, 1,   3,   1,   3,   1,   1,   0.2, 0.5],  // curious
      [1,   0.5, 0.5, 0.5, 1,   2,   1,   1,   1.5],  // lazy
      [0.2, 3,   1,   3,   1,   1,   1,   0.5, 0.3],  // mischievous
      [1,   1,   1,   1,   3,   0.5, 1,   0.3, 2  ],  // watchful — heavy contemplate
      [0.3, 1,   1,   3,   1,   0.5, 3,   1,   0.2],  // energetic — light contemplate
      [0.5, 1,   0.3, 0.5, 1,   1,   3,   2,   2.5]   // dreamy — heavy contemplate
    ]
```

- [ ] **Step 3:** In `updateTsunoIdle`, add CONTEMPLATE behavior handling — when `tsunoBehaviorIdx === 8` and not transitioning:

```javascript
    if (tsunoBehaviorIdx === 8 && !tsunoTransitioning) {
      // Slow x drift past the grave marker
      tsunoMesh.position.x = tsunoTransTo.x + Math.sin((t - tsunoBehaviorStart) * 0.3) * 0.2;
      // Fade alpha low
      if (tsunoMesh.material && tsunoMesh.material.uniforms && tsunoMesh.material.uniforms.uAlpha) {
        tsunoMesh.material.uniforms.uAlpha.value = 0.5;
      }
    }
```

- [ ] **Step 4:** Validate: confirm `pickNextBehavior` (around line 880) iterates `weights.length` (it does — uses dynamic length, no change needed).

- [ ] **Step 5:** Commit:

```bash
node -c assets/japanjunky-screensaver.js
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): add CONTEMPLATE state for grave-marker drift"
```

---

## Phase 5 — Per-Preset Tsuno Tweaks

### Task 10: Confirm product/login presets keep current behavior

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

Spec Section 5 says product preset uses calm mode (existing behavior preserved) and login preset keeps the massive-watchful Tsuno (existing behavior preserved). Verify the new anchor-aware behaviors do not override these.

- [ ] **Step 1:** Find the existing product/login mode guards in `updateTsunoIdle` and `tsunoOnProductSelected` and `triggerTsunoGrab` (search for `tsunoProductPageMode` and `tsunoLoginPageMode`). They should already early-return for these modes.

- [ ] **Step 2:** If `pickAnchorByType` runs while in product or login mode, it returns null gracefully (forest module is still loaded with anchors, but Tsuno's behavior code never reaches the anchor selection path because product/login modes early-return). Confirm by reading the existing guards.

- [ ] **Step 3:** No code change expected. Document the verification by adding a comment block above the new behavior pos() functions if not already present:

```javascript
  // NOTE: Product page (cameraPreset='product') and login page
  // (cameraPreset='login') use existing fixed-position behavior — these
  // anchor-aware pos() functions are only consumed when default 'home'
  // preset is active, where Tsuno's drift state machine runs.
```

- [ ] **Step 4:** Smoke-test (browser):

1. Load homepage — confirm Tsuno wanders between anchors (cedars, jizo, lanterns, hokora).
2. Load a product page — confirm Tsuno stays in calm mode (no drift).
3. Load login gateway — confirm Tsuno is large and watchful (no drift).

- [ ] **Step 5:** Commit (empty — milestone marker):

```bash
git commit --allow-empty -m "feat(tsuno): forest drift complete (sub-plan 2)"
```

---

## File Summary

### Modified Files

| File | Changes |
|------|---------|
| `assets/japanjunky-forest.js` | Implement `getTsunoAnchors()` + `getTrunkColliders()` (replace stubs) |
| `assets/japanjunky-screensaver.js` | Forest anchor accessors, anchor-aware behavior position functions, Hermite path with trunk avoidance, PEEK occlusion alpha, PERCH settle bob, CONTEMPLATE state |

### Unchanged

- All other forest module code (geometry, shaders, perf tiers).
- Tsuno mood/personality system (TSUNO_MOODS, mood-driven behavior weighting).
- Per-frame Tsuno mesh updates outside `updateTsunoIdle`.
- Cursor/keystroke/grab interactions.

## Notes for Sub-Plan 3

Sub-plan 3 covers audio + page transitions — independent of Tsuno changes here. Can ship in either order after sub-plan 1.
