/**
 * japanjunky-cassette-math.js
 * Pure helpers for the cassette model lid animation. UMD:
 * window.JJ_CassetteMath as a classic <script>, module.exports under Vitest.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_CassetteMath = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPEN_RAD = (110 * Math.PI) / 180; // lid fully-open angle

  function clamp(t, lo, hi) {
    if (lo === undefined) lo = 0;
    if (hi === undefined) hi = 1;
    if (t < lo) return lo;
    if (t > hi) return hi;
    return t;
  }

  // smoothstep ease, clamped to [0,1]
  function easeInOut(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  // open fraction t in [0,1] -> lid rotation in radians
  function lidAngle(t) {
    return easeInOut(t) * OPEN_RAD;
  }

  return { clamp: clamp, easeInOut: easeInOut, lidAngle: lidAngle, OPEN_RAD: OPEN_RAD };
});
