/**
 * japanjunky-bundle-carousel.js
 * Crescent slot table + offset-wrap math for the bundle hero carousel.
 * Mirrors the retired ring-carousel ARC (crescent opening right).
 * UMD: window.JJ_BundleCarousel / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundleCarousel = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Signed offset from the centered record → scene slot. Mirrored from the
  // ring-carousel ARC (px/90): center biggest at x≈0.6, pairs arc up/down and
  // further right with a scale falloff. y is scene-up (offset +1 sits below).
  var SLOTS = {
    '-2': { x: 1.2, y:  1.61, scale: 0.72 },
    '-1': { x: 0.8, y:  0.83, scale: 0.88 },
    '0':  { x: 0.6, y:  0.00, scale: 1.15 },
    '1':  { x: 0.8, y: -0.83, scale: 0.88 },
    '2':  { x: 1.2, y: -1.61, scale: 0.72 }
  };

  // Signed offset of index relative to centerIndex, wrapped to the nearest
  // direction around a ring of `len` items → range [-floor(len/2), floor(len/2)].
  function normalizeOffset(index, centerIndex, len) {
    var off = ((index - centerIndex) % len + len) % len; // 0..len-1
    if (off > len / 2) off -= len;                        // → nearest signed
    return off;
  }

  function slotForIndex(index, centerIndex, len) {
    var off = normalizeOffset(index, centerIndex, len);
    return SLOTS[String(off)] || null;
  }

  return { SLOTS: SLOTS, normalizeOffset: normalizeOffset, slotForIndex: slotForIndex };
});
