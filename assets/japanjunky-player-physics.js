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

    // Horizontal friction while resting on the floor (implicit damping)
    if (onFloor) {
      vx = vx / (1 + opts.friction * dt);
    }

    // Sleep: tiny motion on the floor settles to a dead stop
    if (onFloor &&
        Math.abs(vx) < opts.restThreshold &&
        Math.abs(vy) < opts.restThreshold) {
      vx = 0;
      vy = 0;
    }

    return { x: x, y: y, vx: vx, vy: vy };
  }

  function isAtRest(body, opts) {
    return body.vx === 0 && body.vy === 0 &&
           body.y >= opts.bounds.maxY - 0.5;
  }

  return { clamp: clamp, step: step, isAtRest: isAtRest };
});
