/* Japanjunky — shared burst math.
 *
 * One source of truth for the jagged silhouettes that frame things on the
 * site: the homepage kyogen "bang" (japanjunky-info-swirl.js paints its
 * texture and clip polygon from bangJag / bangBlackEdgeV) and the product
 * explorer's torn-page hole (japanjunky-explorer-video.js paints it with
 * paintTear and clips the video with tearEdge). Pure functions, no DOM;
 * loaded before either consumer (see layout/theme.liquid). Node tests in
 * tests/burst-math.test.js load this file with a stubbed window.
 *
 * Angle convention everywhere: u in 0..1, clockwise from screen bottom
 * (u=0 bottom, 0.25 left, 0.5 top, 0.75 right) — it matches the homepage
 * tunnel's texture wrap, and buildClipPath / paintTear share it.
 */
(function () {
  'use strict';

  function fract(x) { return x - Math.floor(x); }

  // Deterministic noise (same constants the homepage used inline).
  function hash(k, salt) {
    return fract(Math.sin(k * 127.1 + salt * 311.7) * 43758.5453);
  }

  /* ================= homepage bang ================= */
  var BANG_SPIKES = 14;

  // Per-angle spike displacement of the comic bang: triangle wave per
  // spike, long/short alternation, per-spike jitter. `variant` reseeds
  // the pattern and rotates it half a tip so two textures can flicker.
  function bangJag(u, variant) {
    var st = (u + variant * 0.5 / BANG_SPIKES) * BANG_SPIKES;
    var spike = Math.floor(st) % BANG_SPIKES;
    var tri = 1 - Math.abs(2 * (st - Math.floor(st)) - 1);
    var amp = (spike % 2 ? 0.45 : 1.0) * (0.6 + 0.4 * hash(spike, 1 + variant * 7));
    return tri * amp * 0.16;
  }

  // Texture-v of the bang's black-interior boundary (edge0 + 0.15 in the
  // painter's layer stack: 0.28 - jag*1.65 + 0.15).
  function bangBlackEdgeV(u, variant) {
    return 0.43 - bangJag(u, variant) * 1.65;
  }

  /* ================= clip polygon ================= */
  // edgeFn(u, variant) → screen radius as a fraction of the half-box on
  // that axis. opts.rotDeg bakes a CSS rotation of the painted layer into
  // the polygon (+ = CCW in y-up math coords, i.e. matches a CSS
  // rotate(-deg) on the sibling canvas). opts.inset scales the radius
  // (default 1); opts.points = vertex count (default 168).
  function buildClipPath(edgeFn, variant, W, H, opts) {
    opts = opts || {};
    var N = opts.points || 168;
    var inset = (opts.inset == null) ? 1 : opts.inset;
    var rot = (opts.rotDeg || 0) * Math.PI / 180;
    var pts = [];
    for (var k = 0; k < N; k++) {
      var u = k / N;
      var f = inset * edgeFn(u, variant);
      var beta = -Math.PI / 2 - u * Math.PI * 2;
      var px = f * Math.cos(beta) * W / 2;
      var py = f * Math.sin(beta) * H / 2;
      var rx = px * Math.cos(rot) - py * Math.sin(rot);
      var ry = px * Math.sin(rot) + py * Math.cos(rot);
      pts.push((50 + (rx / W) * 100).toFixed(2) + '% ' + (50 - (ry / H) * 100).toFixed(2) + '%');
    }
    return 'polygon(' + pts.join(',') + ')';
  }

  /* ================= explorer tear ================= */
  // Torn-page hole for the product explorer: an irregular ragged opening,
  // not the homepage's symmetric comic bang. tearEdge returns the screen
  // radius (fraction of the half-box) at angle u. Nine uneven lobes give
  // the long ragged tears; they are identical across variants so the hole
  // never jumps. A fine sawtooth fray on top is reseeded per variant, so
  // swapping variants makes the edge shiver like fibres.
  var TEAR_LOBES = 9;
  var TEAR_BASE = 0.66;
  // Lens shape: the base radius bulges along the long edges (u = 0 / 0.5)
  // and pinches at the pointed ends (u = 0.25 / 0.75), so the slash is
  // widest through its middle.
  var TEAR_BULGE = 0.18;
  var TEAR_TEETH = 40;

  function smooth(t) { return t * t * (3 - 2 * t); }

  // Lobe geometry is loop-invariant (variant only reseeds the fray), so
  // hash it once: paintTear calls tearEdge 65k times per variant.
  // JAG_MID boosts lobes near u = 0 / 0.5 (the long top and bottom edges
  // of the slash box) so the tear is most ragged along its middle, and
  // calmer at the two pointed ends (u = 0.25 / 0.75).
  var JAG_MID = 0.9;
  var TEAR_LOBE = [];
  for (var li = 0; li < TEAR_LOBES; li++) {
    var lc = (li + 0.5 * hash(li, 3)) / TEAR_LOBES;   // uneven centre
    TEAR_LOBE.push({
      c: lc,
      w: 0.035 + 0.05 * hash(li, 5),              // half-width in u
      a: (hash(li, 9) - 0.35) * 0.3               // some tear out, some fold in
         * (1 + JAG_MID * Math.abs(Math.cos(2 * Math.PI * lc)))
    });
  }

  function tearEdge(u, variant) {
    var phase = fract(u);
    var r = TEAR_BASE + TEAR_BULGE * Math.abs(Math.cos(2 * Math.PI * phase));
    for (var i = 0; i < TEAR_LOBES; i++) {
      var L = TEAR_LOBE[i]; var c = L.c, w = L.w, a = L.a;
      var d = phase - c;
      d -= Math.round(d);                            // wrap to -0.5..0.5
      var t = Math.max(0, 1 - Math.abs(d) / w);
      r += a * smooth(t);
    }
    var tooth = Math.floor(phase * TEAR_TEETH);
    var ft = fract(phase * TEAR_TEETH + variant * 0.5);
    r += (ft - 0.5) * 0.03 * (0.5 + hash(tooth, 11 + variant * 7));
    return Math.max(0.55, Math.min(0.92, r));
  }

  // Parchment lip thickness varies per lobe (torn paper is never even).
  function tearLipWidth(u) {
    return 0.03 + 0.03 * hash(Math.floor(fract(u) * TEAR_LOBES), 13);
  }

  var TEAR_SHADOW = 0.02;

  // Boundary of the black void: the torn edge minus the parchment lip and
  // the ink shadow. The hole (poster/player) is clipped to this, so the
  // whole lip and shadow stay visible around the video.
  function tearVoidEdge(u, variant) {
    return tearEdge(u, variant) - tearLipWidth(u) - TEAR_SHADOW;
  }

  // Radius of the largest circle guaranteed inside the void (edge minus
  // lip minus shadow, minimised over the angle).
  function tearInner(variant) {
    var m = Infinity;
    for (var k = 0; k < 720; k++) {
      var u = k / 720;
      var r = tearVoidEdge(u, variant);
      if (r < m) m = r;
    }
    return m;
  }

  // Largest void radius (maximised over the angle): the player must cover
  // an ellipse of this size (times the box half-extents) to fill the hole.
  function tearOuter(variant) {
    var m = -Infinity;
    for (var k = 0; k < 720; k++) {
      var u = k / 720;
      var r = tearVoidEdge(u, variant);
      if (r > m) m = r;
    }
    return m;
  }

  // Paint one tear variant into a canvas (any aspect). Layers outside-in from
  // the torn edge: transparent → lip (a stippled gradient walking colors.lips,
  // a list of [r,g,b], once around the edge — by default one parchment
  // tone — plus dark speckle) → ink
  // shadow (alpha 0.85) → solid black void. All noise is hashed, so the
  // result is deterministic (Node-testable, and the two variants only
  // differ where the fray moved). colors.lip (single) is still honoured.
  function paintTear(canvas, variant, colors) {
    colors = colors || {};
    var lips = colors.lips && colors.lips.length ? colors.lips : [colors.lip || [224, 213, 192]];
    var ink = colors.ink || [10, 10, 10];
    // Any aspect: normalised per axis, so the tear stretches with the box
    // exactly like buildClipPath's polygon does (f * W/2, f * H/2).
    var PW = canvas.width, PH = canvas.height;
    var halfW = PW / 2, halfH = PH / 2;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(PW, PH);
    var d = img.data;
    for (var y = 0; y < PH; y++) {
      for (var x = 0; x < PW; x++) {
        var dx = (x + 0.5 - halfW) / halfW;
        var dy = (y + 0.5 - halfH) / halfH;
        var r = Math.sqrt(dx * dx + dy * dy);
        // u clockwise from screen bottom: y-up angle beta = atan2(-dy, dx),
        // u = (-PI/2 - beta) / 2PI (the inverse of buildClipPath's beta).
        var beta = Math.atan2(-dy, dx);
        var u = fract((-Math.PI / 2 - beta) / (2 * Math.PI));
        var edge = tearEdge(u, variant);
        if (r > edge) continue; // transparent (buffer starts zeroed)
        var i = (y * PW + x) * 4;
        var lw = tearLipWidth(u);
        var n = hash(x * 7 + y * 13, 17 + variant);
        if (r > edge - lw) {
          var dark = n < 0.22;
          // Gradient around the edge: lips[] is walked once per revolution
          // of u, blending neighbours by stipple (hash pick) rather than a
          // smooth lerp so it stays in the dithered CRT language.
          var lip;
          if (lips.length === 1) {
            lip = lips[0];
          } else {
            var t = u * lips.length;
            var li0 = Math.floor(t) % lips.length;
            var li1 = (li0 + 1) % lips.length;
            lip = hash(x * 3 + y * 5, 23 + variant) < (t - Math.floor(t)) ? lips[li1] : lips[li0];
          }
          d[i] = dark ? ink[0] : lip[0];
          d[i + 1] = dark ? ink[1] : lip[1];
          d[i + 2] = dark ? ink[2] : lip[2];
          d[i + 3] = 255;
        } else if (r > edge - lw - TEAR_SHADOW) {
          d[i] = ink[0];
          d[i + 1] = ink[1];
          d[i + 2] = ink[2];
          d[i + 3] = 217; // 0.85
        } else {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  window.JJ_Burst = {
    hash: hash,
    bangJag: bangJag,
    bangBlackEdgeV: bangBlackEdgeV,
    buildClipPath: buildClipPath,
    tearEdge: tearEdge,
    tearLipWidth: tearLipWidth,
    tearVoidEdge: tearVoidEdge,
    tearInner: tearInner,
    tearOuter: tearOuter,
    paintTear: paintTear
  };
})();
