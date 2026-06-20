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

  // Advance the whole state in place. (Tsuno impulse added in Task 2.)
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

  return {
    MAX_BLOBS: MAX_BLOBS,
    clamp: clamp,
    makeRng: makeRng,
    DEFAULTS: DEFAULTS,
    createState: createState,
    stepBlob: stepBlob,
    applyTsuno: applyTsuno,
    step: step
  };
});
