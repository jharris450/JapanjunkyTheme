# Lava Lamp Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal-vortex background in `assets/japanjunky-screensaver.js` with a full-bleed 3D raymarched lava-lamp wax scene whose blobs rise/stretch/merge/split and react to Tsuno moving through them.

**Architecture:** A pure, unit-tested convection sim (`japanjunky-wax-sim.js`) owns blob positions/temps and the Tsuno push/split impulse. A GLSL module (`japanjunky-wax-shader.js`) raymarches those blobs as metaballs (Tsuno = subtractive carve). `japanjunky-screensaver.js` swaps its portal meshes for a wax full-frame ortho pre-pass fed by the sim, recolors the sparkle system into warm rising motes (some rendered as ASCII glyphs from a runtime atlas), and keeps the existing 240p → readPixels → VGA-dither pipeline, Tsuno, bubble, parallax, and perf safeguards.

**Tech Stack:** three.js (global `THREE`), raw GLSL, ES5 UMD asset modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-lava-lamp-background-design.md`

## Global Constraints

- Asset JS is ES5 in UMD form (`var`, no arrow functions, no `const`/`let`) to match the codebase; pure modules follow the `japanjunky-cassette-math.js` UMD pattern.
- Tests are Vitest ESM in `tests/`, run via `npm test` (`vitest run`).
- No new committed binary asset — the glyph atlas is generated at runtime from a `<canvas>`.
- Keep the existing warm palette exactly: gold `vec3(0.95,0.75,0.30)`, orange `vec3(0.85,0.35,0.05)`, deep red `vec3(0.40,0.05,0.02)`. Cyan stays reserved (CD indicator only); green/magenta/gold phosphor stays Tsuno's mood domain.
- `MAX_BLOBS = 8`, identical in the sim and the shader.
- Never `git add -A` in this repo — stage explicit files only.
- Deploy is via `main` (Shopify GitHub sync); this work is not live until merged.

---

### Task 1: Wax convection sim — core

**Files:**
- Create: `assets/japanjunky-wax-sim.js`
- Test: `tests/wax-sim.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `JJ_WaxSim.MAX_BLOBS` → `8`
  - `JJ_WaxSim.clamp(t, lo, hi)` → number
  - `JJ_WaxSim.makeRng(seed:int)` → `function(): number` in [0,1)
  - `JJ_WaxSim.DEFAULTS` → options object
  - `JJ_WaxSim.createState(opts)` → `{ blobs: Blob[], opts, t:0 }` where `Blob = { x, y, z, vx, vy, radius, temp, phase }`, all coords in normalized field space (x,y in 0..1, y up; z = depth slab).
  - `JJ_WaxSim.stepBlob(blob, dt, env, t)` → new Blob (pure, no mutation)
  - `JJ_WaxSim.step(state, dt)` → state (advances all blobs; Tsuno added in Task 2)

- [ ] **Step 1: Write the failing test**

```js
// tests/wax-sim.test.js
import { describe, it, expect } from 'vitest';
import Sim from '../assets/japanjunky-wax-sim.js';

function env(over) {
  return Object.assign({}, Sim.DEFAULTS, over || {});
}

describe('createState', () => {
  it('is deterministic for a seed and respects count/MAX_BLOBS', () => {
    var a = Sim.createState({ seed: 7, count: 6 });
    var b = Sim.createState({ seed: 7, count: 6 });
    expect(a.blobs.length).toBe(6);
    expect(JSON.stringify(a.blobs)).toBe(JSON.stringify(b.blobs));
    var big = Sim.createState({ seed: 1, count: 99 });
    expect(big.blobs.length).toBe(Sim.MAX_BLOBS);
  });
});

describe('stepBlob — buoyancy', () => {
  it('a hot blob accelerates upward (vy increases)', () => {
    var e = env();
    var hot = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 5, phase: 0 };
    var out = Sim.stepBlob(hot, 0.1, e, 0);
    expect(out.vy).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0.5);
  });

  it('a cold blob sinks (vy goes negative)', () => {
    var e = env();
    var cold = { x: 0.5, y: 0.8, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 0, phase: 0 };
    var out = Sim.stepBlob(cold, 0.1, e, 0);
    expect(out.vy).toBeLessThan(0);
  });
});

describe('stepBlob — heat band', () => {
  it('gains temperature near the floor, loses it up high', () => {
    var e = env();
    var low = Sim.stepBlob({ x: 0.5, y: 0.05, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 0, phase: 0 }, 0.2, e, 0);
    expect(low.temp).toBeGreaterThan(0);
    var high = Sim.stepBlob({ x: 0.5, y: 0.95, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 }, 0.2, e, 0);
    expect(high.temp).toBeLessThan(1);
  });
});

describe('stepBlob — bounds and purity', () => {
  it('clamps below the floor and reflects vy', () => {
    var e = env({ buoyancy: 0, gravity: 0 });
    var out = Sim.stepBlob({ x: 0.5, y: 0.0, z: 0, vx: 0, vy: -1, radius: 0.15, temp: 0, phase: 0 }, 0.1, e, 0);
    expect(out.y).toBeGreaterThanOrEqual(e.floor - 1e-9);
    expect(out.vy).toBeGreaterThan(0); // reflected upward
  });

  it('does not mutate the input blob', () => {
    var input = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var frozen = JSON.stringify(input);
    Sim.stepBlob(input, 0.1, env(), 0);
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe('step — stays in bounds over many frames', () => {
  it('never escapes the field', () => {
    var s = Sim.createState({ seed: 3, count: 8 });
    for (var i = 0; i < 600; i++) {
      Sim.step(s, 0.033);
      for (var j = 0; j < s.blobs.length; j++) {
        var b = s.blobs[j];
        expect(b.y).toBeGreaterThanOrEqual(s.opts.floor - 1e-6);
        expect(b.y).toBeLessThanOrEqual(s.opts.ceil + 1e-6);
        expect(b.x).toBeGreaterThanOrEqual(0.0);
        expect(b.x).toBeLessThanOrEqual(1.0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wax-sim`
Expected: FAIL — cannot resolve `../assets/japanjunky-wax-sim.js` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

```js
// assets/japanjunky-wax-sim.js
/**
 * japanjunky-wax-sim.js
 * Pure lava-lamp convection sim. UMD: window.JJ_WaxSim as a classic
 * <script>, module.exports under Vitest. No THREE dependency.
 * Field space: x,y in 0..1 (y up, 0 = heated floor), z = depth slab.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_WaxSim = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BLOBS = 8;

  function clamp(t, lo, hi) {
    if (t < lo) return lo;
    if (t > hi) return hi;
    return t;
  }

  // mulberry32 — deterministic PRNG for seedable, testable placement
  function makeRng(seed) {
    var s = (seed || 1) >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DEFAULTS = {
    seed: 1,
    count: 6,
    heatBand: 0.18,   // y below this gains heat
    heatRate: 1.6,    // temp/sec gained in heat band
    coolRate: 0.5,    // base temp/sec lost (scaled up with height)
    buoyancy: 0.9,    // upward accel per unit temp
    gravity: 0.5,     // constant downward accel
    drag: 1.2,        // velocity damping per second
    floor: 0.06,
    ceil: 0.94,
    bounce: 0.4,
    driftAmp: 0.05,   // lateral accel amplitude
    minRadius: 0.10,
    maxRadius: 0.20,
    zSpread: 0.25,    // depth slab half-range
    tsunoPush: 1.5,   // used in Task 2
    tsunoSplit: 1.0   // used in Task 2
  };

  function createState(opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var rng = makeRng(opts.seed);
    var n = clamp(opts.count | 0, 1, MAX_BLOBS);
    var blobs = [];
    for (var i = 0; i < n; i++) {
      blobs.push({
        x: 0.2 + rng() * 0.6,
        y: opts.floor + rng() * (opts.ceil - opts.floor),
        z: (rng() * 2 - 1) * opts.zSpread,
        vx: 0,
        vy: 0,
        radius: opts.minRadius + rng() * (opts.maxRadius - opts.minRadius),
        temp: rng() * 0.5,
        phase: rng() * 6.2832
      });
    }
    return { blobs: blobs, opts: opts, t: 0 };
  }

  // Pure: advance one blob by dt. env = options, t = absolute sim time.
  function stepBlob(b, dt, env, t) {
    var heat = (b.y < env.heatBand) ? env.heatRate : 0;
    var cool = env.coolRate * (0.4 + b.y); // cools more when higher
    var temp = b.temp + (heat - cool) * dt;
    if (temp < 0) temp = 0;

    var accelY = env.buoyancy * temp - env.gravity;
    var vy = b.vy + accelY * dt;
    var drift = Math.sin(t * 0.6 + b.phase) * env.driftAmp;
    var vx = b.vx + drift * dt;

    var damp = 1 - env.drag * dt;
    if (damp < 0) damp = 0;
    vy *= damp;
    vx *= damp;

    var x = b.x + vx * dt;
    var y = b.y + vy * dt;

    if (y < env.floor) { y = env.floor; vy = -vy * env.bounce; }
    if (y > env.ceil)  { y = env.ceil;  vy = -vy * env.bounce; }
    if (x < 0.08) { x = 0.08; vx = -vx * env.bounce; }
    if (x > 0.92) { x = 0.92; vx = -vx * env.bounce; }

    return { x: x, y: y, z: b.z, vx: vx, vy: vy, radius: b.radius, temp: temp, phase: b.phase };
  }

  // Advance the whole state in place. (Tsuno impulse added in Task 2.)
  function step(state, dt) {
    state.t += dt;
    var env = state.opts;
    for (var i = 0; i < state.blobs.length; i++) {
      state.blobs[i] = stepBlob(state.blobs[i], dt, env, state.t);
    }
    return state;
  }

  return {
    MAX_BLOBS: MAX_BLOBS,
    clamp: clamp,
    makeRng: makeRng,
    DEFAULTS: DEFAULTS,
    createState: createState,
    stepBlob: stepBlob,
    step: step
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wax-sim`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-wax-sim.js tests/wax-sim.test.js
git commit -m "feat(wax): convection sim core — blobs, buoyancy, bounds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wax sim — Tsuno push/split interaction

**Files:**
- Modify: `assets/japanjunky-wax-sim.js`
- Test: `tests/wax-sim.test.js`

**Interfaces:**
- Consumes: Task 1 sim.
- Produces:
  - `JJ_WaxSim.applyTsuno(blob, tsuno, env)` → new Blob (pure). `tsuno = { active:boolean, x, y, vx, vy, radius }` in field space. Out-of-range or inactive → blob returned unchanged.
  - `JJ_WaxSim.step(state, dt, tsuno)` → now also applies `applyTsuno` to each blob after `stepBlob`. `tsuno` optional.

- [ ] **Step 1: Write the failing test**

```js
// append to tests/wax-sim.test.js
describe('applyTsuno — push and split', () => {
  function e() { return Object.assign({}, Sim.DEFAULTS); }

  it('is a no-op when inactive or out of range', () => {
    var b = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    expect(Sim.applyTsuno(b, { active: false }, e())).toBe(b);
    var far = { active: true, x: 0.0, y: 0.0, vx: 1, vy: 1, radius: 0.1 };
    expect(Sim.applyTsuno(b, far, e())).toEqual(b);
  });

  it('pushes an in-range blob along Tsuno velocity and away from him', () => {
    var env = e();
    var b = { x: 0.55, y: 0.50, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var tsuno = { active: true, x: 0.50, y: 0.50, vx: 1.0, vy: 0.0, radius: 0.20 };
    var out = Sim.applyTsuno(b, tsuno, env);
    expect(out.vx).toBeGreaterThan(0); // along +x velocity AND away (+x, blob is right of Tsuno)
    expect(out).not.toBe(b);
  });

  it('does not mutate the input blob', () => {
    var b = { x: 0.55, y: 0.50, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var frozen = JSON.stringify(b);
    Sim.applyTsuno(b, { active: true, x: 0.5, y: 0.5, vx: 1, vy: 0, radius: 0.2 }, e());
    expect(JSON.stringify(b)).toBe(frozen);
  });
});

describe('step — applies Tsuno when provided', () => {
  it('moves a blob out of Tsuno path over frames', () => {
    var s = Sim.createState({ seed: 5, count: 1, gravity: 0, buoyancy: 0 });
    s.blobs[0].x = 0.52; s.blobs[0].y = 0.5; s.blobs[0].vx = 0; s.blobs[0].vy = 0;
    var tsuno = { active: true, x: 0.5, y: 0.5, vx: 2.0, vy: 0, radius: 0.2 };
    var startX = s.blobs[0].x;
    for (var i = 0; i < 10; i++) Sim.step(s, 0.033, tsuno);
    expect(s.blobs[0].x).toBeGreaterThan(startX);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wax-sim`
Expected: FAIL — `Sim.applyTsuno is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the `applyTsuno` function above the `step` function in `assets/japanjunky-wax-sim.js`:

```js
  // Pure: Tsuno passing through shoves nearby blobs along his velocity
  // (push) and radially away from his center (split).
  function applyTsuno(b, tsuno, env) {
    if (!tsuno || !tsuno.active) return b;
    var dx = b.x - tsuno.x;
    var dy = b.y - tsuno.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= tsuno.radius) return b;
    var falloff = 1 - dist / tsuno.radius;
    var nx = dist > 1e-4 ? dx / dist : 0;
    var ny = dist > 1e-4 ? dy / dist : 1;
    var pushK = env.tsunoPush;
    var splitK = env.tsunoSplit;
    var vx = b.vx + ((tsuno.vx || 0) * pushK + nx * splitK) * falloff;
    var vy = b.vy + ((tsuno.vy || 0) * pushK + ny * splitK) * falloff;
    return { x: b.x, y: b.y, z: b.z, vx: vx, vy: vy, radius: b.radius, temp: b.temp, phase: b.phase };
  }
```

Replace the existing `step` function body so it threads Tsuno through, and add `applyTsuno` to the returned object:

```js
  function step(state, dt, tsuno) {
    state.t += dt;
    var env = state.opts;
    for (var i = 0; i < state.blobs.length; i++) {
      var b = stepBlob(state.blobs[i], dt, env, state.t);
      b = applyTsuno(b, tsuno, env);
      state.blobs[i] = b;
    }
    return state;
  }
```

Add `applyTsuno: applyTsuno,` to the returned API object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wax-sim`
Expected: PASS (Task 1 + Task 2 blocks all green).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-wax-sim.js tests/wax-sim.test.js
git commit -m "feat(wax): Tsuno push/split impulse on nearby blobs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wax raymarch shader module

**Files:**
- Create: `assets/japanjunky-wax-shader.js`
- Test: `tests/wax-shader.test.js`

**Interfaces:**
- Consumes: nothing (pure strings; no THREE).
- Produces:
  - `JJ_WaxShader.MAX_BLOBS` → `8` (must equal `JJ_WaxSim.MAX_BLOBS`)
  - `JJ_WaxShader.vert` → GLSL vertex string
  - `JJ_WaxShader.frag` → GLSL fragment string. Uniforms: `uTime` float, `uAspect` float, `uHeatGlow` float, `uBlobCount` int, `uBlobs[8]` vec4 (xy = uv center 0..1, z = slab, w = radius), `uBlobTemp[8]` float, `uTsuno` vec4 (xy uv, z slab, w radius), `uTsunoActive` float.

- [ ] **Step 1: Write the failing test**

```js
// tests/wax-shader.test.js
import { describe, it, expect } from 'vitest';
import Shader from '../assets/japanjunky-wax-shader.js';
import Sim from '../assets/japanjunky-wax-sim.js';

describe('wax-shader module', () => {
  it('matches the sim blob cap', () => {
    expect(Shader.MAX_BLOBS).toBe(Sim.MAX_BLOBS);
  });

  it('exposes vert and frag GLSL with the expected uniforms', () => {
    expect(typeof Shader.vert).toBe('string');
    expect(typeof Shader.frag).toBe('string');
    ['uTime', 'uAspect', 'uHeatGlow', 'uBlobCount', 'uBlobs[8]', 'uBlobTemp[8]', 'uTsuno', 'uTsunoActive']
      .forEach(function (decl) {
        expect(Shader.frag).toContain(decl);
      });
    expect(Shader.frag).toContain('void main()');
    expect(Shader.vert).toContain('vUv');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wax-shader`
Expected: FAIL — cannot resolve `../assets/japanjunky-wax-shader.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// assets/japanjunky-wax-shader.js
/**
 * japanjunky-wax-shader.js
 * GLSL for the lava-lamp wax: orthographic raymarch of metaball blobs
 * with a subtractive Tsuno carve. UMD: window.JJ_WaxShader / module.exports.
 * No THREE dependency — screensaver.js builds the ShaderMaterial + uniforms.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_WaxShader = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BLOBS = 8;
  var N = String(MAX_BLOBS);

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'uniform float uHeatGlow;',
    'uniform int   uBlobCount;',
    'uniform vec4  uBlobs[' + N + '];',     // xy = uv center, z = slab, w = radius
    'uniform float uBlobTemp[' + N + '];',
    'uniform vec4  uTsuno;',                 // xy = uv, z = slab, w = radius
    'uniform float uTsunoActive;',
    'varying vec2 vUv;',
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float smax(float a, float b, float k) { return -smin(-a, -b, k); }',
    '',
    'float map(vec3 p) {',
    '  float d = 1e5;',
    '  for (int i = 0; i < ' + N + '; i++) {',
    '    if (i >= uBlobCount) break;',
    '    vec4 b = uBlobs[i];',
    '    vec3 c = vec3((b.x - 0.5) * uAspect, b.y, b.z);',
    '    float ds = length(p - c) - b.w;',
    '    d = smin(d, ds, 0.12);',
    '  }',
    '  if (uTsunoActive > 0.5) {',
    '    vec3 tc = vec3((uTsuno.x - 0.5) * uAspect, uTsuno.y, uTsuno.z);',
    '    float dts = length(p - tc) - uTsuno.w;',
    '    d = smax(d, -dts, 0.10);',          // wax parts/splits around Tsuno
    '  }',
    '  return d;',
    '}',
    '',
    'vec3 calcNormal(vec3 p) {',
    '  vec2 e = vec2(0.002, 0.0);',
    '  return normalize(vec3(',
    '    map(p + e.xyy) - map(p - e.xyy),',
    '    map(p + e.yxy) - map(p - e.yxy),',
    '    map(p + e.yyx) - map(p - e.yyx)));',
    '}',
    '',
    'vec3 waxColor(float h) {',              // h = height 0 (hot) .. 1 (cool)
    '  vec3 gold   = vec3(0.95, 0.75, 0.30);',
    '  vec3 orange = vec3(0.85, 0.35, 0.05);',
    '  vec3 red    = vec3(0.40, 0.05, 0.02);',
    '  return (h < 0.5) ? mix(gold, orange, h / 0.5) : mix(orange, red, (h - 0.5) / 0.5);',
    '}',
    '',
    'void main() {',
    '  vec3 ro = vec3((vUv.x - 0.5) * uAspect, vUv.y, -1.5);',
    '  vec3 rd = vec3(0.0, 0.0, 1.0);',
    '  float t = 0.0;',
    '  float hit = -1.0;',
    '  for (int s = 0; s < 56; s++) {',
    '    vec3 p = ro + rd * t;',
    '    float d = map(p);',
    '    if (d < 0.002) { hit = t; break; }',
    '    t += max(d, 0.01);',
    '    if (t > 3.0) break;',
    '  }',
    '',
    '  vec3 col = vec3(0.0);',
    '  if (hit > 0.0) {',
    '    vec3 p = ro + rd * hit;',
    '    vec3 n = calcNormal(p);',
    '    vec3 ld = normalize(vec3(0.4, 0.7, -0.6));',
    '    float diff = clamp(dot(n, ld), 0.0, 1.0);',
    '    float spec = pow(clamp(dot(reflect(-ld, n), -rd), 0.0, 1.0), 24.0);',
    '    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.0);',
    '    vec3 base = waxColor(clamp(p.y, 0.0, 1.0));',
    '    col = base * (0.35 + 0.65 * diff) + vec3(1.0, 0.9, 0.7) * spec * 0.5;',
    '    col += base * fres * 0.4;',
    '  }',
    '',
    '  float glow = (1.0 - smoothstep(0.0, 0.35, vUv.y)) * uHeatGlow;',
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 1.0);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  return { MAX_BLOBS: MAX_BLOBS, vert: VERT, frag: FRAG };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wax-shader`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-wax-shader.js tests/wax-shader.test.js
git commit -m "feat(wax): raymarch metaball shader module (Tsuno carve)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire wax into the screensaver (remove portal, mount wax pre-pass)

**Files:**
- Modify: `assets/japanjunky-screensaver.js`
- Modify: `layout/theme.liquid` (add the two new scripts before `japanjunky-screensaver.js`)

No unit test — this is THREE/DOM integration, verified in the Task 6 browser pass.

**Interfaces:**
- Consumes: `JJ_WaxSim` (Task 1–2), `JJ_WaxShader` (Task 3), global `THREE`.
- Produces: wax background rendered in place of the portal; `JJ_Portal` API surface unchanged.

- [ ] **Step 1: Load the new modules**

In `layout/theme.liquid`, immediately before the existing `japanjunky-screensaver.js` `<script ... defer>` tag (around line 272), add:

```liquid
  <script src="{{ 'japanjunky-wax-sim.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-wax-shader.js' | asset_url }}" defer></script>
```

- [ ] **Step 2: Remove the portal build + animation**

In `assets/japanjunky-screensaver.js`, delete these build blocks and their variables entirely:
- `TUNNEL_VERT`, `TUNNEL_FRAG`, `buildTunnel`, `var tunnel = buildTunnel();`
- `GLOW_FRAG`, `buildGlow`, `var glow = buildGlow();`
- `RING_FRAG`, `RING_CONFIG`, the `portalRings` build loop, `ringGlowGeo`/`RING_GLOW_FRAG`/`ringGlowMat`/`ringGlowMesh`
- `BACKDROP_FRAG`, `vortexBackdrop` + its `textureLoader.load(swirlUrl, …)` block
- `MEMPHIS_VERT`, `MEMPHIS_FRAG`, `memphisScene`, `memphisCamera`, `memphisGeo`, `memphisMat`, `memphisBackdrop`
- The flying-object system: `spawnObject`, `animateObjects`, and the object pool/array they use
- The memory-fragment system: `spawnFragment`, `animateFragments`, `fragmentPool`, and the `fragBuffer`/`fragImageData`/`fragCanvas`/`fragCtx` layer-1 compositing block inside `renderOneFrame`

Keep `GLOW_VERT` — Task 5's motes reuse it.

Verify before deleting: search the file for `spawnObject`, `spawnFragment`, `portalRings`, `memphis` and confirm the only remaining references are the ones being removed (none in `JJ_Portal` API, product-selection, or bubble code). If any kept code references them, stop and reconcile.

- [ ] **Step 3: Build the wax pre-pass**

After the `var scene = …` / camera setup and `swirlSpeed` definition (where `buildTunnel()` used to be), insert:

```js
  // ─── Lava-lamp wax (replaces the portal) ───────────────────
  var waxState = JJ_WaxSim.createState({ seed: 7, count: 6 });
  var waxAspect = resW / resH;
  var waxUniforms = {
    uTime: { value: 0.0 },
    uAspect: { value: waxAspect },
    uHeatGlow: { value: 1.0 },
    uBlobCount: { value: waxState.blobs.length },
    uBlobs: { value: [] },
    uBlobTemp: { value: [] },
    uTsuno: { value: new THREE.Vector4(0, 0, 0, 0.16) },
    uTsunoActive: { value: 0.0 }
  };
  for (var wi = 0; wi < JJ_WaxSim.MAX_BLOBS; wi++) {
    waxUniforms.uBlobs.value.push(new THREE.Vector4(0, 0, 0, 0));
    waxUniforms.uBlobTemp.value.push(0.0);
  }
  var waxScene = new THREE.Scene();
  var waxCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var waxMat = new THREE.ShaderMaterial({
    uniforms: waxUniforms,
    vertexShader: JJ_WaxShader.vert,
    fragmentShader: JJ_WaxShader.frag,
    depthWrite: false,
    depthTest: false
  });
  var waxQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waxMat);
  waxScene.add(waxQuad);

  // Tsuno → wax field input (uv space, with frame-to-frame velocity)
  var lastTsunoUv = null;
  function computeTsunoInput(dt) {
    if (!tsunoMesh || dt <= 0) return { active: false };
    var ndc = tsunoMesh.position.clone().project(camera);
    var uv = { x: ndc.x * 0.5 + 0.5, y: ndc.y * 0.5 + 0.5 };
    var vx = 0, vy = 0;
    if (lastTsunoUv) { vx = (uv.x - lastTsunoUv.x) / dt; vy = (uv.y - lastTsunoUv.y) / dt; }
    lastTsunoUv = uv;
    return { active: true, x: uv.x, y: uv.y, vx: vx, vy: vy, radius: 0.16 };
  }

  function updateWax(t, dt) {
    var tsuno = computeTsunoInput(dt);
    JJ_WaxSim.step(waxState, dt, tsuno);
    waxUniforms.uTime.value = t;
    waxUniforms.uBlobCount.value = waxState.blobs.length;
    for (var i = 0; i < waxState.blobs.length; i++) {
      var b = waxState.blobs[i];
      waxUniforms.uBlobs.value[i].set(b.x, b.y, b.z, b.radius);
      waxUniforms.uBlobTemp.value[i] = b.temp;
    }
    if (tsuno.active) {
      waxUniforms.uTsuno.value.set(tsuno.x, tsuno.y, 0.0, tsuno.radius);
      waxUniforms.uTsunoActive.value = 1.0;
    } else {
      waxUniforms.uTsunoActive.value = 0.0;
    }
  }
```

- [ ] **Step 4: Render the wax instead of memphis/tunnel**

Replace the `renderOneFrame` pre-pass so it draws the wax then the scene. The new top of `renderOneFrame`:

```js
  function renderOneFrame() {
    camera.layers.set(0);
    renderer.setClearColor(mainClearColor, 1);
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    var prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(waxScene, waxCamera); // wax fills the frame first
    renderer.render(scene, camera);       // bubbles + Tsuno on top
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }
    displayCtx.putImageData(displayImageData, 0, 0);
  }
```

(The entire layer-1 fragment compositing block previously at the bottom of `renderOneFrame` is gone with Step 2.)

- [ ] **Step 5: Drive the wax from the animation loop**

In `animate`, remove the deleted uniform/animation lines (`tunnel.material…`, `glow.material…`, `memphisBackdrop.material…`, the `portalRings` loop, `vortexBackdrop` rotation, `spawnObject`/`animateObjects`, `spawnFragment`/`animateFragments`). In their place, after `var t = time * 0.001;`, add:

```js
    updateWax(t, interval / 1000);
```

Keep the existing `updateTsuno`, `updateBubblePosition`, `updateTsunoMouse`, parallax, and `renderOneFrame()` calls.

Also update the reduced-motion static-frame block near the bottom: replace the `tunnel.material.uniforms.uTime.value = 0; glow.material.uniforms.uTime.value = 0;` lines with a single sim step so one wax frame renders:

```js
  if (prefersReducedMotion) {
    updateWax(0, 0.016);
    renderOneFrame();
    return;
  }
```

- [ ] **Step 6: Verify it runs (smoke check)**

Run: `npm test`
Expected: PASS — existing suites + new wax suites green (this task adds no tests but must not break the build).

Then load the homepage in a browser (`main` not required for local theme preview). Expected: warm wax blobs rising/sinking full-bleed, no JS console errors, Tsuno still roams on top. Visual tuning is Task 6.

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-screensaver.js layout/theme.liquid
git commit -m "feat(wax): mount lava-lamp wax pre-pass, remove portal vortex

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Warm rising motes + ASCII glyph atlas

**Files:**
- Modify: `assets/japanjunky-screensaver.js`

No unit test — runtime canvas/THREE; verified in the Task 6 browser pass.

**Interfaces:**
- Consumes: existing `sparkleGeo`/`sparkles` Points system, global `THREE`, `GLOW_VERT`.
- Produces: recolored upward-drifting motes; ~15% render as a static ASCII/kana glyph sampled from a runtime atlas.

- [ ] **Step 1: Replace the sparkle build with mote + glyph attributes**

Find the `// ─── Sparkle Particles ───` section. Keep the `SPARKLE_COUNT`, position/size/phase buffers, but add a per-point `aGlyph` attribute (0 = soft dot, ≥1 = glyph cell index + 1) and an upward drift seed. After the existing `sparklePhases` setup, add:

```js
  // Glyph atlas — drawn once at runtime, NearestFilter for the pixel look.
  var GLYPHS = ['ア','イ','ウ','エ','オ','カ','ｦ','ﾝ',':','*','.','='];
  var GLYPH_MOTE_CHANCE = 0.15;
  var GLYPH_MOTE_SCALE = 1.8;

  function buildGlyphAtlas(glyphs) {
    var cell = 16;
    var cv = document.createElement('canvas');
    cv.width = cell * glyphs.length;
    cv.height = cell;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Fixedsys Excelsior 3.01", "DotGothic16", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < glyphs.length; i++) {
      ctx.fillText(glyphs[i], i * cell + cell / 2, cell / 2);
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }
  var glyphAtlas = buildGlyphAtlas(GLYPHS);

  var sparkleGlyph = new Float32Array(SPARKLE_COUNT);
  for (var gi = 0; gi < SPARKLE_COUNT; gi++) {
    sparkleGlyph[gi] = (Math.random() < GLYPH_MOTE_CHANCE)
      ? (1 + Math.floor(Math.random() * GLYPHS.length))
      : 0;
  }
  sparkleGeo.setAttribute('aGlyph', new THREE.BufferAttribute(sparkleGlyph, 1));
```

- [ ] **Step 2: Update the mote shaders (warm color + glyph sampling)**

Replace `SPARKLE_VERT` and `SPARKLE_FRAG` and the `sparkleMat` definition with:

```js
  var SPARKLE_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'attribute float aGlyph;',
    'uniform float uTime;',
    'uniform float uResolution;',
    'uniform float uGlyphScale;',
    'varying float vAlpha;',
    'varying float vGlyph;',
    'void main() {',
    '  float twinkle = sin(uTime * 3.0 + aPhase) * 0.5 + 0.5;',
    '  vAlpha = pow(twinkle, 3.0);',
    '  vGlyph = aGlyph;',
    '  vec3 pos = position;',
    '  pos.y += mod(uTime * 0.25 + aPhase, 3.0);', // slow upward drift, wraps
    '  vec4 viewPos = modelViewMatrix * vec4(pos, 1.0);',
    '  float sz = aSize * (aGlyph > 0.5 ? uGlyphScale : 1.0);',
    '  gl_PointSize = sz * (20.0 / -viewPos.z);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w) * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var SPARKLE_FRAG = [
    'uniform sampler2D uAtlas;',
    'uniform float uGlyphCount;',
    'varying float vAlpha;',
    'varying float vGlyph;',
    'void main() {',
    '  vec3 warm = vec3(0.95, 0.72, 0.30);', // amber/gold mote
    '  if (vGlyph > 0.5) {',
    '    float idx = vGlyph - 1.0;',
    '    vec2 uv = vec2((idx + gl_PointCoord.x) / uGlyphCount, gl_PointCoord.y);',
    '    float lum = texture2D(uAtlas, uv).r;',
    '    if (lum < 0.4) discard;',
    '    gl_FragColor = vec4(warm, vAlpha);',
    '  } else {',
    '    float dist = length(gl_PointCoord - vec2(0.5));',
    '    if (dist > 0.5) discard;',
    '    float glow = 1.0 - dist * 2.0;',
    '    gl_FragColor = vec4(warm, glow * vAlpha);',
    '  }',
    '}'
  ].join('\n');

  var sparkleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: { value: parseFloat(resH) },
      uGlyphScale: { value: GLYPH_MOTE_SCALE },
      uAtlas: { value: glyphAtlas },
      uGlyphCount: { value: GLYPHS.length }
    },
    vertexShader: SPARKLE_VERT,
    fragmentShader: SPARKLE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
```

The existing `var sparkles = new THREE.Points(sparkleGeo, sparkleMat); scene.add(sparkles);` stays. The existing `sparkles.material.uniforms.uTime.value = t;` line in `animate` also stays.

- [ ] **Step 3: Dispose the atlas on teardown (if a dispose path exists)**

If the file has a teardown/dispose path that disposes scene materials, add `glyphAtlas.dispose();` there. If there is none (the screensaver lives for the page lifetime), skip — no action.

- [ ] **Step 4: Verify build**

Run: `npm test`
Expected: PASS (no new tests; build unbroken).

Browser: reload homepage. Expected: warm motes drift upward; roughly 1 in 7 shows a small kana/symbol glyph; no console errors.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(wax): warm rising motes + ASCII glyph atlas easter egg

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Config cleanup + manual browser regression

**Files:**
- Modify: `layout/theme.liquid`

**Interfaces:**
- Consumes: everything above.
- Produces: dead config removed; documented manual verification.

- [ ] **Step 1: Remove the now-unused swirl texture config**

In `layout/theme.liquid`, delete the `swirlTexture: {{ 'vortex-swirl.jpg' | asset_url | json }},` line from `JJ_SCREENSAVER_CONFIG` (≈ line 251). Leave `ghostTexture` (Tsuno) untouched. Confirm `swirlTexture` is referenced nowhere else (it was only consumed by the deleted `vortexBackdrop` block).

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: PASS — all suites including `wax-sim` and `wax-shader`.

- [ ] **Step 3: Manual browser regression (record results)**

Load the live theme preview and check each. This is the visual gate the unit tests cannot cover:

- [ ] Homepage: full-bleed warm wax, blobs rise from the heated bottom, cool and sink — no portal tunnel/rings remain.
- [ ] Blobs visibly merge when centers approach and neck/split when they part (metaball behavior).
- [ ] Tsuno moving across the wax pushes/parts it — a visible void/displacement follows him.
- [ ] Motes drift upward; ~15% render as legible kana/symbol glyphs; colors are warm (no stray cyan).
- [ ] Product page preset and login preset both render wax without errors (camera presets still apply).
- [ ] Speech bubble still appears/positions correctly; Tsuno personality/judging still works.
- [ ] Reduced-motion: one static wax frame, no animation. High-contrast: background disabled.
- [ ] Scroll past the fold and switch tabs: animation pauses and resumes (perf safeguards intact).
- [ ] No console errors; framerate acceptable on a mid laptop (if heavy, lower `count` in `createState` and/or the `56` march-step cap — note any change).

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid
git commit -m "chore(wax): drop unused swirlTexture config; lava-lamp regression pass

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** raymarched metaballs (T3), full-bleed + bottom heat glow (T3 frag), warm palette only (T3 `waxColor`), Tsuno carve + push/split (T2 sim + T3 `smax`), keep Tsuno/bubble/post/perf/parallax (T4 keeps those calls), cut tunnel/rings/glow/vortex/memphis/objects/fragments (T4 Step 2), sparkles→warm motes (T5), ASCII glyph motes ~15% via runtime atlas (T5), splash untouched (no task touches `japanjunky-splash.js`), perf budget MAX_BLOBS 8 + bounded steps + existing throttles (T3/T4/T6), reduced-motion static frame (T4 Step 5), unit tests for sim (T1/T2) + shader sanity (T3), visual-unverified caveat (T6 manual gate). All covered.
- **Type consistency:** `JJ_WaxSim` API (`createState`, `stepBlob`, `applyTsuno`, `step`, `MAX_BLOBS`, `DEFAULTS`) used identically in T4. `JJ_WaxShader` (`vert`, `frag`, `MAX_BLOBS`) used identically in T4. Blob fields `{x,y,z,vx,vy,radius,temp,phase}` consistent across sim, tests, and the `uBlobs.set(x,y,z,radius)` mapping in T4. `tsuno` input shape `{active,x,y,vx,vy,radius}` consistent T2↔T4.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; commands have expected output.
