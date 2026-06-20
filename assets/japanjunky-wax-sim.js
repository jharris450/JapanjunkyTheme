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

  // Lava-lamp convection, real-physics style. A blob's temperature relaxes
  // toward the ambient temperature of its current height — hot at the heated
  // floor, cold at the top. Buoyancy is driven by (temp - neutral): warmer
  // than neutral rises, cooler sinks. The slow `exchange` rate gives thermal
  // lag, so a blob heated at the bottom stays buoyant well past mid-height and
  // rides all the way up before cooling and sinking — a full cycle. No hard
  // walls bounce them. Tuned slow + liquid; adjust live in the browser pass.
  var DEFAULTS = {
    seed: 1,
    count: 4,          // few, large globs (lava-lamp look)
    hotTemp: 1.0,      // ambient temp at the floor
    coldTemp: 0.0,     // ambient temp at the top
    neutralTemp: 0.5,  // temp at which buoyancy is zero
    exchange: 0.035,   // how fast temp tracks ambient (low = more lag/glide)
    buoyancy: 2.0,     // vertical accel per unit (temp - neutral)
    drag: 0.7,         // velocity damping per second (lower = more liquid glide)
    maxSpeed: 0.18,    // terminal velocity (viscosity cap) — keeps motion slow
    floor: 0.06,       // bottom; blobs stop here (no bounce) and reheat
    ceil: 0.94,        // visible top reference
    topRunoff: 0.30,   // how far above ceil a blob may run off before the cap
    xMin: 0.06,        // left wall (visible edge); blobs bounce off it
    xMax: 0.94,        // right wall
    wallBounce: 0.9,   // side-wall restitution (how bouncy the glass is)
    biasSpeed: 0.045,  // persistent lateral drift so blobs traverse + hit walls
    driftAmp: 0.012,   // small lateral wobble on top of the bias
    driftFreq: 0.35,   // lateral drift frequency
    minRadius: 0.12,   // varied globs; columns stay thin once stretched
    maxRadius: 0.28,
    zSpread: 0.25,     // depth slab half-range
    tsunoPush: 1.5,
    tsunoSplit: 1.0
  };

  function createState(opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var rng = makeRng(opts.seed);
    var n = clamp(opts.count | 0, 1, MAX_BLOBS);
    var blobs = [];
    for (var i = 0; i < n; i++) {
      var bx = 0.2 + rng() * 0.6;
      var by = opts.floor + rng() * (opts.ceil - opts.floor);
      var bz = (rng() * 2 - 1) * opts.zSpread;
      var br = opts.minRadius + rng() * (opts.maxRadius - opts.minRadius);
      blobs.push({
        x: bx,
        y: by,
        z: bz,
        vx: 0,
        vy: 0,
        radius: br,
        // Start in thermal equilibrium with the blob's height (no launch spike).
        temp: opts.hotTemp + (opts.coldTemp - opts.hotTemp) * by,
        phase: rng() * 6.2832,
        // Persistent lateral current (random direction) so it traverses + bounces.
        vxBias: (rng() * 2 - 1) * opts.biasSpeed
      });
    }
    return { blobs: blobs, opts: opts, t: 0 };
  }

  // Pure: advance one blob by dt. env = options, t = absolute sim time.
  function stepBlob(b, dt, env, t) {
    // Ambient temperature of this height: hot at the floor, cold at the top.
    var yc = b.y < 0 ? 0 : (b.y > 1 ? 1 : b.y);
    var ambient = env.hotTemp + (env.coldTemp - env.hotTemp) * yc;
    // Relax toward ambient (thermal lag).
    var temp = b.temp + (ambient - b.temp) * env.exchange * dt;

    var accelY = env.buoyancy * (temp - env.neutralTemp);
    var vy = b.vy + accelY * dt;
    var drift = Math.sin(t * env.driftFreq + b.phase) * env.driftAmp;
    var vx = b.vx + drift * dt;

    var damp = 1 - env.drag * dt;
    if (damp < 0) damp = 0;
    vy *= damp;
    vx *= damp;

    // Terminal velocity (viscosity): wax never moves fast, no matter the force.
    if (vy > env.maxSpeed) vy = env.maxSpeed; else if (vy < -env.maxSpeed) vy = -env.maxSpeed;
    if (vx > env.maxSpeed) vx = env.maxSpeed; else if (vx < -env.maxSpeed) vx = -env.maxSpeed;

    // Horizontal = damped transient (drift + Tsuno pushes) + persistent bias.
    var bias = b.vxBias || 0;
    var x = b.x + (vx + bias) * dt;
    var y = b.y + vy * dt;

    // Bottom: stop and reheat. Top: run off above the visible edge to a cap.
    if (y < env.floor) { y = env.floor; if (vy < 0) vy = 0; }
    var topCap = env.ceil + env.topRunoff;
    if (y > topCap) { y = topCap; if (vy > 0) vy = 0; }
    // Side walls: bounce (reflect the inward-moving components) like the glass.
    if (x < env.xMin) {
      x = env.xMin;
      if (vx < 0) vx = -vx * env.wallBounce;
      if (bias < 0) bias = -bias * env.wallBounce;
    }
    if (x > env.xMax) {
      x = env.xMax;
      if (vx > 0) vx = -vx * env.wallBounce;
      if (bias > 0) bias = -bias * env.wallBounce;
    }

    return { x: x, y: y, z: b.z, vx: vx, vy: vy, radius: b.radius, temp: temp, phase: b.phase, vxBias: bias };
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
