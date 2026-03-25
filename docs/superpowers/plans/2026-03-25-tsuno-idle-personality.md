# Tsuno Idle Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tsuno's static sine-bob idle animation with a mood-based behavior system featuring varied movement patterns, visual personality cues, and mouse interactivity.

**Architecture:** All code is added to `assets/japanjunky-screensaver.js` — no new files. New config objects and functions are inserted after the existing Tsuno constants (line ~375). The idle block in `updateTsuno()` (lines 635-640) is replaced with a call to the new system. Mouse interaction is added as a separate call in `animate()`.

**Tech Stack:** Three.js (existing), vanilla JS (ES5, matching codebase style)

**Spec:** `docs/superpowers/specs/2026-03-25-tsuno-idle-personality-design.md`

---

### Task 1: Add Mood Config and `getTsunoMood()`

**Files:**
- Modify: `assets/japanjunky-screensaver.js:375` (insert after `tsunoTalking` declaration)

- [ ] **Step 1: Add TSUNO_MOODS config object**

Insert after line 378 (`var tsunoTalking = false;`):

```javascript
  // ─── Tsuno Personality System ─────────────────────────────
  var TSUNO_MOODS = {
    //        0=Sun       1=Mon       2=Tue      3=Wed          4=Thu       5=Fri       6=Sat
    names:   ['shy',     'curious',  'lazy',    'mischievous', 'watchful', 'energetic','dreamy'],
    // Movement speed multiplier
    speed:   [0.6,        1.0,        0.5,       1.4,           0.8,        1.3,        0.6],
    // Behavior change interval range [min, max] in seconds
    interval:[[15,25],    [12,20],    [18,30],   [10,18],       [14,22],    [8,15],     [16,28]],
    // Mouse sensitivity (0 = ignore, 1 = normal)
    mouseSensitivity: [0.3, 1.0, 0.2, 0.8, 1.0, 0.7, 0.15],
    // Reaction style: 'shy' | 'curious' | 'lazy' | 'playful'
    reactionStyle: ['shy', 'curious', 'lazy', 'playful', 'curious', 'playful', 'shy'],
    // Visual: glow alpha multiplier
    glowMult: [0.6, 1.1, 0.7, 1.0, 1.0, 1.2, 0.8],
    // Visual: tint vec3 [r, g, b]
    tint: [
      [0.85, 0.15, 0.15],  // shy — faint red
      [1.0,  0.25, 0.1],   // curious — warm orange
      [0.9,  0.18, 0.08],  // lazy — muted base
      [1.0,  0.35, 0.05],  // mischievous — amber
      [1.0,  0.2,  0.08],  // watchful — base tint
      [1.0,  0.3,  0.1],   // energetic — bright warm
      [0.8,  0.15, 0.2]    // dreamy — cooler purple-ish
    ],
    // Visual: bob amplitude
    bobAmp:  [0.08, 0.18, 0.1,  0.2,  0.15, 0.25, 0.12],
    // Visual: bob frequency (Hz)
    bobFreq: [0.35, 0.5,  0.4,  0.7,  0.45, 0.8,  0.3],
    // Visual: sway amplitude (x-axis oscillation)
    swayAmp: [0.03, 0.06, 0.04, 0.08, 0.0,  0.05, 0.15],
    // Visual: base tilt (radians, positive = lean right)
    baseTilt:[0.12, -0.09,0.0,  0.0,  0.0,  0.0, -0.05],
    // Behavior weights [hang, peek, loom, patrol, perch, sink, circle, retreat]
    weights: [
      [0.5, 3,   0.2, 0.5, 1,   1,   1,   3  ],  // shy
      [1,   1,   3,   1,   3,   1,   1,   0.2],  // curious
      [3,   0.5, 0.5, 0.3, 1,   2,   0.5, 1  ],  // lazy
      [0.3, 3,   1,   3,   1,   1,   1,   0.5],  // mischievous
      [2,   1,   1,   1,   3,   0.5, 1,   0.3],  // watchful
      [0.5, 1,   1,   3,   1,   0.5, 3,   1  ],  // energetic
      [1,   1,   0.3, 0.5, 1,   1,   3,   2  ]   // dreamy
    ]
  };

  function getTsunoMood() {
    return new Date().getDay(); // 0=Sun..6=Sat, indexes into TSUNO_MOODS arrays
  }
```

- [ ] **Step 2: Verify no syntax errors**

Run: search the file for the inserted code to confirm it exists and the surrounding code is intact.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): add mood config and getTsunoMood()"
```

---

### Task 2: Add Behavior Definitions and `pickNextBehavior()`

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after TSUNO_MOODS block from Task 1)

- [ ] **Step 1: Add TSUNO_BEHAVIORS array and picker**

Insert immediately after the `getTsunoMood()` function:

```javascript
  // Behavior IDs: 0=hang, 1=peek, 2=loom, 3=patrol, 4=perch, 5=sink, 6=circle, 7=retreat
  var TSUNO_BEHAVIORS = [
    { name: 'hang',    pos: function () { return { x: 4.0, y: 0.0, z: 6 }; } },
    { name: 'peek',    pos: function () {
      var zDist = 5 - camera.position.z; // z:5 minus camera z
      var halfW = Math.tan(camera.fov * Math.PI / 360) * zDist * (camera.aspect || viewportAspect);
      return { x: halfW - 0.5, y: 0.5, z: 5 };
    }},
    { name: 'loom',    pos: function () { return { x: 1.5, y: 0.5, z: 2.5 }; } },
    { name: 'patrol',  pos: function () { return { x: 6.0, y: 0.3, z: 10 }; },
      animated: true, endX: -4.0 },
    { name: 'perch',   pos: function () { return { x: 5.0, y: -1.0, z: 6 }; } },
    { name: 'sink',    pos: function () {
      // Sink transitions to current pos (not bottom); the drop is animated in updateTsunoIdle
      var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
      var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
      var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
      return { x: cx, y: cy, z: cz };
    },
      // Bottom y is computed at runtime in the behavior animation
      bottomY: function () {
        var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
        var zDist = cz - camera.position.z;
        var halfH = Math.tan(camera.fov * Math.PI / 360) * zDist;
        return -halfH - 1.0;
      }
    },
    { name: 'circle',  pos: function () {
      var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
      var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
      var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
      return { x: cx, y: cy, z: cz };
    }, orbital: true, radius: 1.0 },
    { name: 'retreat',  pos: function () { return { x: 2.0, y: 0.0, z: 22 }; } }
  ];

  function pickNextBehavior(moodIdx, currentIdx) {
    var weights = TSUNO_MOODS.weights[moodIdx];
    // Halve weight of current behavior to reduce immediate repeats
    var adjusted = [];
    var total = 0;
    for (var i = 0; i < weights.length; i++) {
      adjusted[i] = (i === currentIdx) ? weights[i] * 0.5 : weights[i];
      total += adjusted[i];
    }
    var roll = Math.random() * total;
    var acc = 0;
    for (var j = 0; j < adjusted.length; j++) {
      acc += adjusted[j];
      if (roll <= acc) return j;
    }
    return 0; // fallback
  }
```

- [ ] **Step 2: Verify no syntax errors**

Search for `pickNextBehavior` to confirm it exists.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): add behavior definitions and weighted picker"
```

---

### Task 3: Add Idle Personality State Variables

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after `pickNextBehavior`)

- [ ] **Step 1: Add personality state tracking variables**

Insert after `pickNextBehavior`:

```javascript
  // ─── Personality State ────────────────────────────────────
  var tsunoMoodIdx = getTsunoMood();
  var tsunoBehaviorIdx = 0;         // current behavior index
  var tsunoBehaviorStart = 0;       // wall-clock time (s) when current behavior began
  var tsunoBehaviorDuration = 0;    // how long to linger (s)
  var tsunoTransitioning = false;   // true = easing to new behavior position
  var tsunoTransStart = 0;          // transition start time
  var tsunoTransDuration = 1.5;     // transition ease duration (s), scaled by mood speed
  var tsunoTransFrom = { x: 4, y: 0, z: 6 };
  var tsunoTransTo = { x: 4, y: 0, z: 6 };
  // Moment cues
  var tsunoPulseStart = -1;         // arrival pulse start time (-1 = inactive)
  var tsunoShakeStart = -1;         // startle shake start time (-1 = inactive)
  // Patrol animation
  var tsunoPatrolProgress = 0;      // 0..1 progress for patrol sweep

  function getNextInterval() {
    var range = TSUNO_MOODS.interval[tsunoMoodIdx];
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  function startBehavior(t, behaviorIdx) {
    tsunoBehaviorIdx = behaviorIdx;
    tsunoBehaviorStart = t;
    tsunoBehaviorDuration = getNextInterval();
    tsunoPatrolProgress = 0;

    // Start transition from current position to behavior target
    if (tsunoMesh) {
      tsunoTransitioning = true;
      tsunoTransStart = t;
      tsunoTransDuration = 1.5 / TSUNO_MOODS.speed[tsunoMoodIdx];
      tsunoTransFrom.x = tsunoMesh.position.x;
      tsunoTransFrom.y = tsunoMesh.position.y;
      tsunoTransFrom.z = tsunoMesh.position.z;
      var target = TSUNO_BEHAVIORS[behaviorIdx].pos();
      tsunoTransTo.x = target.x;
      tsunoTransTo.y = target.y;
      tsunoTransTo.z = target.z;
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): add personality state variables and startBehavior"
```

---

### Task 4: Implement `updateTsunoIdle(t)`

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after Task 3 code, and replace lines 635-640)

- [ ] **Step 1: Add the `updateTsunoIdle` function**

Insert after `startBehavior`:

```javascript
  function updateTsunoIdle(t) {
    if (!tsunoMesh) return;

    // Reset scale each frame (preserving horizontal flip); pulse/mouse may override below
    tsunoMesh.scale.set(-1, 1, 1);

    var mood = tsunoMoodIdx;
    var speed = TSUNO_MOODS.speed[mood];
    var bobAmp = TSUNO_MOODS.bobAmp[mood];
    var bobFreq = TSUNO_MOODS.bobFreq[mood];
    var swayAmp = TSUNO_MOODS.swayAmp[mood];
    var baseTilt = TSUNO_MOODS.baseTilt[mood];

    // ── Check if it's time to pick a new behavior ──
    if (!tsunoTransitioning && (t - tsunoBehaviorStart) >= tsunoBehaviorDuration) {
      var nextIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
      startBehavior(t, nextIdx);
    }

    // ── Transition easing to new position ──
    if (tsunoTransitioning) {
      var tp = (t - tsunoTransStart) / tsunoTransDuration;
      if (tp >= 1.0) {
        tp = 1.0;
        tsunoTransitioning = false;
        tsunoPulseStart = t; // trigger arrival pulse
      }
      var ease = easeInOutCubic(tp);
      tsunoMesh.position.x = tsunoTransFrom.x + (tsunoTransTo.x - tsunoTransFrom.x) * ease;
      tsunoMesh.position.y = tsunoTransFrom.y + (tsunoTransTo.y - tsunoTransFrom.y) * ease;
      tsunoMesh.position.z = tsunoTransFrom.z + (tsunoTransTo.z - tsunoTransFrom.z) * ease;
    } else {
      // ── At-position idle animations per behavior ──
      var beh = TSUNO_BEHAVIORS[tsunoBehaviorIdx];
      var target = beh.pos();

      if (beh.orbital) {
        // Circle: small orbit around target position
        var cAngle = t * 0.4 * speed;
        tsunoMesh.position.x = target.x + Math.cos(cAngle) * beh.radius;
        tsunoMesh.position.y = target.y + Math.sin(cAngle) * beh.radius;
        tsunoMesh.position.z = target.z;
      } else if (beh.animated) {
        // Patrol: sweep from startX to endX (time-based, not frame-based)
        var patrolElapsed = t - tsunoBehaviorStart - tsunoTransDuration;
        var patrolTotal = tsunoBehaviorDuration - tsunoTransDuration;
        tsunoPatrolProgress = Math.min(1.0, Math.max(0, patrolElapsed / patrolTotal) * speed);
        var sweepEase = easeInOutCubic(tsunoPatrolProgress);
        tsunoMesh.position.x = target.x + (beh.endX - target.x) * sweepEase;
        tsunoMesh.position.y = target.y;
        tsunoMesh.position.z = target.z;
      } else if (beh.name === 'sink') {
        // Sink: drop down from current y, pause at bottom, rise back
        var sinkBottom = beh.bottomY();
        var sinkElapsed = t - tsunoBehaviorStart - tsunoTransDuration;
        var sinkDur = tsunoBehaviorDuration - tsunoTransDuration;
        var sinkPhase = Math.max(0, sinkElapsed / sinkDur);
        if (sinkPhase < 0.4) {
          // Sinking down
          var downEase = easeInOutCubic(sinkPhase / 0.4);
          tsunoMesh.position.y = target.y + (sinkBottom - target.y) * downEase;
        } else if (sinkPhase < 0.6) {
          // Holding at bottom
          tsunoMesh.position.y = sinkBottom;
        } else {
          // Rising back
          var upEase = easeInOutCubic((sinkPhase - 0.6) / 0.4);
          tsunoMesh.position.y = sinkBottom + (target.y - sinkBottom) * upEase;
        }
        tsunoMesh.position.x = target.x;
        tsunoMesh.position.z = target.z;
      } else {
        // Static behaviors (hang, peek, loom, perch, retreat): bob + sway at target
        tsunoMesh.position.x = target.x + Math.sin(t * 0.3) * swayAmp;
        tsunoMesh.position.y = target.y + Math.sin(t * bobFreq * 2 * Math.PI) * bobAmp;
        tsunoMesh.position.z = target.z;
      }
    }

    // ── Apply mood visuals ──
    var tintArr = TSUNO_MOODS.tint[mood];
    tsunoMesh.material.uniforms.uTint.value.set(tintArr[0], tintArr[1], tintArr[2]);
    var alpha = 0.8 * TSUNO_MOODS.glowMult[mood];

    // Arrival pulse (scale bump over 0.3s)
    if (tsunoPulseStart >= 0) {
      var pp = (t - tsunoPulseStart) / 0.3;
      if (pp >= 1.0) {
        tsunoPulseStart = -1;
        tsunoMesh.scale.set(-1, 1, 1);
      } else {
        var bump = 1.0 + 0.05 * Math.sin(pp * Math.PI);
        tsunoMesh.scale.set(-bump, bump, 1);
      }
    }

    // Startle shake (position.x jitter over 0.2s)
    if (tsunoShakeStart >= 0) {
      var sp = (t - tsunoShakeStart) / 0.2;
      if (sp >= 1.0) {
        tsunoShakeStart = -1;
      } else {
        tsunoMesh.position.x += Math.sin(sp * Math.PI * 6) * 0.05 * (1 - sp);
      }
    }

    // Alpha with any awareness flash applied
    tsunoMesh.material.uniforms.uAlpha.value = alpha;

    // Face camera then apply tilt
    tsunoMesh.lookAt(camera.position);
    tsunoMesh.rotateZ(baseTilt);
  }
```

- [ ] **Step 2: Replace the idle block in `updateTsuno()`**

Replace lines 635-640 (the `tsunoState === 'idle'` block):

Old code:
```javascript
    if (tsunoState === 'idle') {
      // Gentle bob at idle position
      tsunoMesh.position.x = TSUNO_IDLE_POS.x;
      tsunoMesh.position.y = TSUNO_IDLE_POS.y + Math.sin(t * 0.5 * 2 * Math.PI) * 0.15;
      tsunoMesh.position.z = TSUNO_IDLE_POS.z;
      tsunoMesh.lookAt(camera.position);
```

New code:
```javascript
    if (tsunoState === 'idle') {
      updateTsunoIdle(t);
```

- [ ] **Step 3: Handle returning-to-idle reset**

In the `returning` state block (line ~671), where `tsunoState = 'idle'` is set after transition completes, add a fresh behavior pick. Change:

```javascript
        tsunoState = 'idle';
```

To:

```javascript
        tsunoState = 'idle';
        startBehavior(t, pickNextBehavior(tsunoMoodIdx, -1));
```

- [ ] **Step 4: Manually test by loading the site**

Open the site in browser. Tsuno should now cycle through different positions every 10-20s instead of static bobbing. Verify:
- Tsuno moves to different positions
- Transitions are smooth (eased)
- No visual glitches when transitioning to/from orbit states
- Scale stays flipped (Tsuno doesn't mirror unexpectedly)

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): implement idle personality behavior system"
```

---

### Task 5: Add Mouse Interaction (`updateTsunoMouse`)

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after `updateTsunoIdle`, and add call in `animate()`)

- [ ] **Step 1: Add the `updateTsunoMouse` function**

Insert after `updateTsunoIdle`:

```javascript
  // ─── Tsuno Mouse Interaction ──────────────────────────────
  var tsunoAwarenessAlpha = 0;       // extra alpha from awareness
  var tsunoProxReacting = false;     // currently in proximity reaction
  var tsunoProxCooldown = 0;         // cooldown timestamp to prevent rapid re-triggers
  var tsunoFlashStart = -1;          // awareness flash start time (-1 = inactive)
  var tsunoWasClose = false;         // was cursor close last frame (for edge detection)

  function updateTsunoMouse(mouse) {
    if (!tsunoMesh || tsunoState !== 'idle') return;
    var mood = tsunoMoodIdx;
    var sensitivity = TSUNO_MOODS.mouseSensitivity[mood];

    // ── Layer 1: Passive Awareness ──
    // Lean toward cursor (post-lookAt tilt is applied in updateTsunoIdle)
    // Here we just modulate the tilt based on mouse
    var mouseTilt = mouse.x * 0.15 * sensitivity; // up to ~8.5 degrees
    tsunoMesh.rotateZ(mouseTilt);

    // Glow brightens when cursor is on canvas side
    tsunoAwarenessAlpha = Math.abs(mouse.x) * 0.1 * sensitivity;
    tsunoMesh.material.uniforms.uAlpha.value += tsunoAwarenessAlpha;

    // ── Layer 2: Proximity Reactions ──
    var pos3 = tsunoMesh.position.clone();
    pos3.project(camera);
    var screenX = (pos3.x * 0.5 + 0.5) * window.innerWidth;
    var screenY = (-pos3.y * 0.5 + 0.5) * window.innerHeight;
    var cursorX = (mouse.x * 0.5 + 0.5) * window.innerWidth;
    var cursorY = (mouse.y * 0.5 + 0.5) * window.innerHeight;
    var dist = Math.sqrt((screenX - cursorX) * (screenX - cursorX) +
                         (screenY - cursorY) * (screenY - cursorY));

    var t = performance.now() * 0.001;
    var style = TSUNO_MOODS.reactionStyle[mood];

    // Awareness flash: trigger on entering close zone (edge detection)
    var isClose = dist < 150;
    if (isClose && !tsunoWasClose) {
      tsunoFlashStart = t;
    }
    tsunoWasClose = isClose;

    // Apply flash alpha (0.15 spike over 0.15s, ease back)
    if (tsunoFlashStart >= 0) {
      var fp = (t - tsunoFlashStart) / 0.15;
      if (fp >= 1.0) {
        tsunoFlashStart = -1;
      } else {
        tsunoMesh.material.uniforms.uAlpha.value += 0.15 * (1.0 - fp);
      }
    }

    if (dist < 60 && t > tsunoProxCooldown) {
      // Very close reaction
      tsunoProxCooldown = t + 2.0; // 2s cooldown
      if (style === 'curious') {
        // Scale up slightly, brighten
        tsunoMesh.scale.set(-1.08, 1.08, 1);
        tsunoMesh.material.uniforms.uAlpha.value += 0.15;
      } else if (style === 'playful') {
        // Dart to a new position
        var dartIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
        startBehavior(t, dartIdx);
      } else if (style === 'shy') {
        // Startle shake then retreat
        tsunoShakeStart = t;
        startBehavior(t, 7); // 7 = retreat
      } else if (style === 'lazy') {
        // Reluctant drift — pick a new behavior (usually hang or sink for lazy mood)
        var lazyIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
        startBehavior(t, lazyIdx);
      }
    } else if (dist < 150 && t > tsunoProxCooldown) {
      // Close reaction
      if (style === 'curious') {
        // Lean in, glow
        tsunoMesh.rotateZ(-0.08);
        tsunoMesh.material.uniforms.uAlpha.value += 0.1;
      } else if (style === 'playful') {
        // Wiggle
        tsunoMesh.position.x += Math.sin(t * 12) * 0.03;
      } else if (style === 'shy') {
        // Gentle drift away
        tsunoMesh.position.x += 0.05 * sensitivity;
      }
      // lazy: barely reacts (no action needed)
    }
  }
```

- [ ] **Step 2: Add `updateTsunoMouse` call in `animate()`**

In the `animate()` function, after line 972 (`updateTsuno(t, targetInterval / 1000);`), insert:

```javascript
    // Tsuno mouse interaction (idle only, desktop only, when mouse interaction is enabled)
    if (tsunoState === 'idle' && !isMobile && config.mouseInteraction !== false) {
      updateTsunoMouse(mouseNorm);
    }
```

- [ ] **Step 3: Manually test mouse interaction**

Open site in browser. Verify:
- Tsuno tilts slightly toward cursor as you move mouse
- Glow brightens subtly when cursor is near
- Moving cursor very close to Tsuno triggers a reaction (varies by day/mood)
- No interaction on mobile (test via devtools responsive mode)

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): add mouse awareness and proximity reactions"
```

---

### Task 6: Initialize Personality on Startup

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (in the texture load callback near line 406, and reduced motion guard)

- [ ] **Step 1: Start first behavior after tsunoMesh is created**

In the texture load callback, after `scene.add(tsunoMesh);` (line ~406) and after the JJ_Portal API update block, add:

```javascript
      // Start first idle behavior
      startBehavior(performance.now() * 0.001, pickNextBehavior(tsunoMoodIdx, -1));
```

- [ ] **Step 2: Guard personality system under reduced motion**

In `updateTsunoIdle`, the first line already checks `if (!tsunoMesh) return;`. Add after it:

```javascript
    if (prefersReducedMotion) {
      tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);
      tsunoMesh.lookAt(camera.position);
      return;
    }
```

- [ ] **Step 3: Manually test full flow**

Open site in browser. Verify the complete system:
- Tsuno starts with a behavior on page load
- Cycles through different behaviors every 10-20s
- Mouse interaction works (tilt, proximity reactions)
- Visual cues change (glow, tint, bob speed vary)
- Transitioning to orbit (if applicable) and returning works cleanly
- No errors in console

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): initialize personality on startup with reduced-motion guard"
```

---

### Task 7: Final Polish and Integration Test

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (minor adjustments if needed)

- [ ] **Step 1: Test each mood manually**

Temporarily override `getTsunoMood()` to return each day index (0-6) and verify:
- Each mood has visibly different behavior (speed, positions chosen, glow, tint)
- No mood produces broken visuals or positions outside the frustum
- Revert the override after testing

- [ ] **Step 2: Test edge cases**

- Tab hidden → tab visible: Tsuno should pick a new behavior on resume (this is implicitly handled: wall-clock timestamps mean `(t - tsunoBehaviorStart) >= tsunoBehaviorDuration` will be true after any pause, triggering a fresh `pickNextBehavior` call)
- Product selected during behavior (jj:product-selected event): bubble dissolves correctly
- Orbit transition during non-idle behavior position: smooth easing, no snap
- Window resize: Peek and Sink positions recalculate correctly (they use runtime frustum math)

- [ ] **Step 3: Final commit and push**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(tsuno): complete idle personality system with mood-based behaviors"
git push
```
