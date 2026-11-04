/**
 * japanjunky-offer.js -- "the offer" (2026-11-03, rev 6 "A+C")
 * One mirrored, dithered sprite of a masked figure (#jj-offer-body, see
 * japanjunky-bundle.css "The offer") placed BEHIND the mystery box: palm on
 * the box's tape seam, whole head over the box's top edge where the viewport
 * has the room, hand held out under the box. This file only PLACES it, in the
 * box canvas's own css-px space, so the man rides the card exactly like the
 * box does (#jj-bundle-canvas: left calc(100% - 275px), bottom calc(20vh -
 * 329.4px)). The reveal (.is-offering) is bundle-stage.js's -- the box click
 * owns it.
 */
(function () {
  'use strict';
  if (window.JJ_MOBILE) return; // mobile hides the sprite (bundle.css)

  var card = document.getElementById('jj-product-info');
  var canvas = document.getElementById('jj-bundle-canvas');
  var man = document.getElementById('jj-offer-body');
  var tail = document.getElementById('jj-offer-tail');
  if (!card || !canvas || !man) return;

  // -- Tuning ----------------------------------------------------------
  // Anchors are MIRRORED source px of mantheoffer.png (1200x896, x' = 1199-x);
  // the sprite is 4x downsampled but MAN_BBOX is kept in source px, so the
  // maths never sees the sprite resolution.
  //   EYES: between the eyes. CHIN_Y / HAT_Y: bottom of the mask / top of the
  //   hat. PALM: palm centre (155 px LEFT of the eyes in the mirror).
  // Box geometry in canvas px (550x550), projected from the three.js scene in
  // the OPEN state (harness, 2026-11-03): tape seam x 275 (the left flap's
  // inner edge = box centre), front face top y 170-180 / bottom 371-381 over
  // the float. The box does not move inside its canvas with the viewport.
  var EYES = { x: 664, y: 210 }, CHIN_Y = 395, HAT_Y = 69, PALM = { x: 509, y: 615 };
  var TAPE_X = 275, BOX_TOP = 175;
  // SCALE (css px per source px) adapts to the room above the box: the whole
  // mask should sit above the box, hat HAT_MARGIN inside the viewport top.
  // Clamped to [SCALE_MIN, SCALE_MAX]; when even SCALE_MIN does not fit, the
  // head slides down behind the box instead (eyes stay >= EYES_MIN_PEEK over
  // the box top, hat may bleed HAT_BLEED px off the top edge).
  var SCALE_MIN = 0.5, SCALE_MAX = 0.65, HAT_MARGIN = 6, HAT_BLEED = 10, EYES_MIN_PEEK = 16;
  var CHIN_TUCK = 20;      // chin this far behind the box's top edge
  // Horizontal: on wide viewports the PALM sits on the seam (head over the
  // box's right part, torso in the gap before the record crescent). On
  // narrow ones that gap does not exist -- the crescent's covers start right
  // of the box and would hide the head -- so the whole figure slides left
  // until the EYES sit on the seam. Linear between the two viewport widths
  // (css px): 1920x1080 at zoom 2.5 is 762 wide, 2560x1440 is 1018.
  var VW_NARROW = 800, VW_WIDE = 1000;
  // Crop box of the sprite inside the mirrored source (tools/offer-split.py prints it).
  var MAN_BBOX = { x: 244, y: 72, w: 836 };
  // Genie tail (tools/offer-tail.py): hung by its top centre from this point
  // in mirrored man-source px (his waist, inside the 640-820 fade band so the
  // torso dissolves into it); w = the padded sprite width x 4.
  var TAIL = { x: 690, y: 665, w: 1000 }; // a little right of centre: keeps the left lobe off the card copy

  var SCALE = SCALE_MIN, HEAD_PEEK = 0, SEAM_SRC_X = PALM.x; // last computed, for get()

  function place() {
    if (!canvas.offsetWidth) return; // card still display:none -- nothing to measure
    // Room above the box's top edge, in css px: the zone is fixed at the
    // viewport top, the card is its offset child, the canvas the card's.
    var spaceAbove = card.offsetTop + canvas.offsetTop + BOX_TOP;
    var headH = CHIN_Y - HAT_Y;
    SCALE = Math.max(SCALE_MIN, Math.min(SCALE_MAX, (spaceAbove - HAT_MARGIN + CHIN_TUCK) / headH));
    var wantPeek = (CHIN_Y - EYES.y) * SCALE - CHIN_TUCK;
    var maxPeek = spaceAbove + HAT_BLEED - (EYES.y - HAT_Y) * SCALE;
    HEAD_PEEK = Math.max(EYES_MIN_PEEK, Math.min(wantPeek, maxPeek));
    // Which source x lands on the seam: palm (wide) ... eyes (narrow).
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var vw = window.innerWidth / zoom;
    var t = Math.max(0, Math.min(1, (vw - VW_NARROW) / (VW_WIDE - VW_NARROW)));
    SEAM_SRC_X = EYES.x + (PALM.x - EYES.x) * t;

    var sx = canvas.offsetLeft + TAPE_X;                    // seam x, card px
    var ey = canvas.offsetTop - HEAD_PEEK + BOX_TOP;        // eyes y, card px
    // Card px of mirrored source (0,0): everything hangs off these two.
    var ox = sx - SEAM_SRC_X * SCALE, oy = ey - EYES.y * SCALE;
    man.style.left = Math.round(ox + MAN_BBOX.x * SCALE) + 'px';
    man.style.top = Math.round(oy + MAN_BBOX.y * SCALE) + 'px';
    man.style.width = Math.round(MAN_BBOX.w * SCALE) + 'px';
    if (tail) {
      tail.style.left = Math.round(ox + (TAIL.x - TAIL.w / 2) * SCALE) + 'px';
      tail.style.top = Math.round(oy + TAIL.y * SCALE) + 'px';
      tail.style.width = Math.round(TAIL.w * SCALE) + 'px';
    }
  }

  // One rAF late so layout from the same ResizeObserver / resize event has
  // settled before we read offsets.
  var queued = 0;
  function schedule() {
    if (queued) return;
    queued = requestAnimationFrame(function () { queued = 0; place(); });
  }
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(card);
  window.addEventListener('resize', schedule);
  schedule();

  window.JJ_OFFER = {
    place: place,
    get: function () { return { SCALE: SCALE, HEAD_PEEK: HEAD_PEEK, SEAM_SRC_X: SEAM_SRC_X, SCALE_MIN: SCALE_MIN, SCALE_MAX: SCALE_MAX, CHIN_TUCK: CHIN_TUCK, VW_NARROW: VW_NARROW, VW_WIDE: VW_WIDE }; },
    // Console tuning on the preview, e.g. JJ_OFFER.set({ SCALE_MAX: 0.75, CHIN_TUCK: 0 })
    set: function (o) {
      if (o.SCALE_MIN !== undefined) SCALE_MIN = o.SCALE_MIN;
      if (o.SCALE_MAX !== undefined) SCALE_MAX = o.SCALE_MAX;
      if (o.CHIN_TUCK !== undefined) CHIN_TUCK = o.CHIN_TUCK;
      if (o.HAT_BLEED !== undefined) HAT_BLEED = o.HAT_BLEED;
      if (o.EYES_MIN_PEEK !== undefined) EYES_MIN_PEEK = o.EYES_MIN_PEEK;
      if (o.VW_NARROW !== undefined) VW_NARROW = o.VW_NARROW;
      if (o.VW_WIDE !== undefined) VW_WIDE = o.VW_WIDE;
      place();
    }
  };
})();
