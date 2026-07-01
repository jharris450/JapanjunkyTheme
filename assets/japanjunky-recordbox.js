/**
 * japanjunky-recordbox.js
 * Pure geometry + face-mapping logic for the flagship 3D record box.
 *
 * UMD: attaches to window.JJ_Recordbox as a classic <script>, exports via
 * module.exports under Vitest. No DOM access, no three.js dependency.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_Recordbox = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // BoxGeometry args for a 12 x 12 x 3 (L x W x H) box in viewer units.
  // Square face = 2.0; depth = 2.0 * 3 / 12 = 0.5.
  var DIMS = { w: 2.0, h: 2.0, d: 0.5 };

  // three.js BoxGeometry material index order is [+X, -X, +Y, -Y, +Z, -Z].
  // Each entry names a key in window.JJ_RECORDBOX_TEX, except 'front', which
  // is a runtime canvas composite of frontLeft|frontRight (the two lid halves).
  var FACE_ORDER = ['sideRight', 'sideLeft', 'top', 'bottom', 'front', 'back'];

  // Rects for drawing the two lid halves onto one square canvas, with a thin
  // dark seam down the center so the front reads as a two-flap lid.
  function frontCompositeLayout(size) {
    var half = size / 2;
    var seamW = Math.max(1, Math.round(size * 0.006));
    return {
      size: size,
      left:  { x: 0,    y: 0, w: half, h: size },
      right: { x: half, y: 0, w: half, h: size },
      seam:  { x: half - seamW / 2, y: 0, w: seamW, h: size }
    };
  }

  return { DIMS: DIMS, FACE_ORDER: FACE_ORDER, frontCompositeLayout: frontCompositeLayout };
});
