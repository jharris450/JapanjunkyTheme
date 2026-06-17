/**
 * japanjunky-player-physics.js
 * Pure 2D screen-space physics for the toolbox media player.
 *
 * UMD: attaches to window.JJ_PlayerPhysics when loaded as a classic <script>,
 * and exports via module.exports when required (Vitest). No DOM access.
 *
 * Coordinate space: body.x/y is the container top-left in layout px; +y is down.
 * opts.bounds.maxX/maxY are already inset by the body size, so clamping the
 * top-left into [min,max] keeps the whole body on screen. maxY is the floor
 * (top edge of the taskbar).
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_PlayerPhysics = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Exported for callers (the player module clamps spawn/drag positions with it).
  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // Advance one body by dt seconds. Pure: returns a new body object.
  function step(body, dt, opts) {
    var b = opts.bounds;
    var vx = body.vx;
    var vy = body.vy + opts.gravity * dt;
    var x = body.x + vx * dt;
    var y = body.y + vy * dt;

    // Left / right walls
    if (x < b.minX) { x = b.minX; vx = -vx * opts.restitution; }
    else if (x > b.maxX) { x = b.maxX; vx = -vx * opts.restitution; }

    // Ceiling
    if (y < b.minY) { y = b.minY; vy = -vy * opts.restitution; }

    // Floor (top of taskbar)
    var onFloor = false;
    if (y >= b.maxY) {
      y = b.maxY;
      if (vy > 0) vy = -vy * opts.restitution;
      onFloor = true;
    }

    // Speed-proportional (viscous) floor friction — vx/(1+k*dt) is stable for any dt
    if (onFloor) {
      vx = vx / (1 + opts.friction * dt);
    }

    // Sleep: tiny motion on the floor settles to a dead stop. The threshold is
    // scaled to a 60fps reference so settling is framerate-independent — a
    // grounded body's residual bounce is gravity*dt*restitution, which scales
    // with dt, so the cutoff must too (otherwise it never sleeps at low fps).
    var sleepCut = opts.restThreshold * dt * 60;
    if (onFloor && Math.abs(vx) < sleepCut && Math.abs(vy) < sleepCut) {
      vx = 0;
      vy = 0;
    }

    return { x: x, y: y, vx: vx, vy: vy };
  }

  function isAtRest(body, opts) {
    // 0.5px tolerance absorbs float accumulation in the floor position.
    return body.vx === 0 && body.vy === 0 &&
           body.y >= opts.bounds.maxY - 0.5;
  }

  return { clamp: clamp, step: step, isAtRest: isAtRest };
});
