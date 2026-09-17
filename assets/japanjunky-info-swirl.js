/* Swirl portal + kyogen eye tracking behind #jj-product-info.
 *
 * The swirl reuses the original portal-screensaver recipe at its most
 * fundamental: one open-ended BackSide cylinder viewed straight down its
 * axis plus a couple of additive planes for the core glow. The swirl motion
 * is nothing but a slanted-stripe texture (u = angle, v = depth, so slanted
 * stripes read as a spiral once wrapped) scrolling on both axes — no
 * shaders, no dithering pipeline. Owns its own small renderer/canvas and
 * never touches the other three.js scenes on the page.
 *
 * The kyogen pupils are the two .jj-kyogen__pupil divs; this file lerps
 * them toward the cursor inside per-eye travel ellipses. With no cursor
 * (touch, reduced motion) they rest looking at the card's product info.
 */
(function () {
  'use strict';

  // Runs on mobile too (the "pop" behind the reparented card). fitCanvas sizes
  // the swirl + kyogen clip to the live card via a ResizeObserver, and the
  // pupil cursor-tracking is already gated on a fine pointer below, so touch
  // just rests the eyes on the product info — nothing here assumes desktop.

  var BUFFER = 512;      // render buffer px; CSS upscale ~2.4x keeps pixels but kills grain-mush
  var TEX = 512;         // burst texture size
  var FLICKER = 0.18;    // seconds per frame of the two-pattern flicker
  var BANG_PERIOD = 3.4; // seconds between flash pulses
  var BANG_LEN = 0.45;   // pulse duration

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var canvas = document.getElementById('jj-swirl-canvas');
    var kyogen = document.getElementById('jj-kyogen');
    var card = document.getElementById('jj-product-info');
    if (!canvas || !kyogen || !card) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- palette from the theme settings ---------- */
    var rootStyle = getComputedStyle(document.documentElement);
    function themeColor(name, fallback) {
      var v = rootStyle.getPropertyValue(name).trim();
      return v || fallback;
    }
    var RED = themeColor('--jj-primary', '#c41e1e');
    var GOLD = themeColor('--jj-secondary', '#d4a017');

    function parseColor(str) {
      var probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      var ctx = probe.getContext('2d');
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    }

    /* ================= kyogen pupils ================= */
    // Geometry in the source image's natural pixels (425x612 crop).
    var NAT_W = 425, NAT_H = 612;
    var EYES = [
      { el: document.getElementById('jj-kyogen-pupil-l'), cx: 117.0, cy: 250.5, rx: 19, ry: 23 },
      { el: document.getElementById('jj-kyogen-pupil-r'), cx: 312.5, cy: 255.5, rx: 19, ry: 23 }
    ];
    var finePointer = window.matchMedia('(pointer: fine)').matches;
    var mouse = null;

    if (finePointer && !reduced) {
      document.addEventListener('mousemove', function (e) {
        mouse = { x: e.clientX, y: e.clientY };
      }, { passive: true });
    }
    // Handheld: no cursor — a touch drags the gaze directly; between touches
    // the eyes fall back to the viewport center (updatePupils), so they keep
    // watching the user as the burst scrolls through view.
    if (!finePointer && !reduced) {
      document.addEventListener('touchmove', function (e) {
        var t = e.touches && e.touches[0];
        if (t) mouse = { x: t.clientX, y: t.clientY };
      }, { passive: true });
      document.addEventListener('touchend', function () { mouse = null; }, { passive: true });
    }

    EYES.forEach(function (eye) {
      eye.ox = 0; // current pupil offset, natural px
      eye.oy = 0;
    });

    function updatePupils() {
      var rect = kyogen.getBoundingClientRect();
      if (!rect.width) return; // card hidden — nothing to place against

      // No cursor yet: rest looking at the product info text (card center).
      var target = mouse;
      if (!target) {
        if (window.JJ_MOBILE) {
          // Handheld: watch the viewport center — the eyes track the user as
          // the burst scrolls up/down through the screen.
          target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
        } else {
          var cr = card.getBoundingClientRect();
          target = { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.55 };
        }
      }

      var sx = rect.width / NAT_W;
      var sy = rect.height / NAT_H;

      EYES.forEach(function (eye) {
        if (!eye.el) return;
        var ex = rect.left + eye.cx * sx;
        var ey = rect.top + eye.cy * sy;
        var dx = target.x - ex;
        var dy = target.y - ey;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Full deflection once the cursor is ~240px out.
        var mag = Math.min(1, dist / 240);
        var wantX = (dx / dist) * mag * eye.rx;
        var wantY = (dy / dist) * mag * eye.ry;
        eye.ox += (wantX - eye.ox) * 0.14;
        eye.oy += (wantY - eye.oy) * 0.14;
        eye.el.style.left = ((eye.cx + eye.ox) / NAT_W * 100) + '%';
        eye.el.style.top = ((eye.cy + eye.oy) / NAT_H * 100) + '%';
      });
    }

    /* ================= swirl scene ================= */
    if (typeof THREE === 'undefined') return;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
    } catch (e) {
      return; // no WebGL — the card just loses its background flourish
    }
    renderer.setPixelRatio(1);
    renderer.setSize(BUFFER, BUFFER, false);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    // Long lens from far back (near-orthographic): with the camera at the
    // mouth the far tunnel half collapses to ~17% of the disc and there is
    // no room for a big interior. Pulled back, v maps almost linearly to
    // screen radius, so the burst ring can hug the edge and the whole
    // center stays a black field for the product info to sit in.
    var camera = new THREE.PerspectiveCamera(10.2, 1, 0.1, 150);
    camera.position.set(0, 0, -32);
    camera.lookAt(0, 0, 30);

    // Fit the canvas to the real card so the ring hugs it instead of
    // sprawling across the zone (fixed sizes guessed the card wrong).
    // FIT_K: black-interior half-extent as fraction of canvas dimension
    //   = valley black radius (0.76 of mouth) * mouth fraction of the
    //     half-frame (0.85 at FOV 10.2) / 2.
    // FIT_Q: card half-extent as fraction of the interior per axis —
    //   0.68 keeps the card's diagonal corners inside the ellipse.
    // valley black radius now 1/(1+0.43) = 0.699 of mouth (deeper spikes)
    var FIT_K = 0.297, FIT_Q = 0.68;

    /* Kyogen clip: instead of a static ellipse, clip the mask with the
       bang's ACTUAL black-interior silhouette so the head fills right up
       to the jagged gold edge and never crosses it. The spike math lives
       in japanjunky-burst.js (JJ_Burst) and is shared with the texture
       painter below, so the two cannot drift. Screen mapping is
       radius = 0.85/(1+v) of the half-frame (long-lens tunnel: 1/(1+v)),
       0.985 sits a hair inside the boundary clear of the AA fringe, the
       cylinder's u wraps clockwise from screen bottom (rotation.x = PI/2 +
       mirrored lookAt camera), and the CSS rotate(-7deg) on the canvas is
       baked in as rotDeg 7 (CCW in y-up math coords). Two polygons — one
       per flicker variant — swap with the texture in the frame loop. */
    var Burst = window.JJ_Burst;
    if (!Burst) return; // shared math missing — no portal, same as no THREE

    function bangScreenEdge(u, variant) {
      return 0.985 * 0.85 / (1 + Burst.bangBlackEdgeV(u, variant));
    }

    var clipFrame = document.getElementById('jj-kyogen-clip');
    var clipPaths = ['', ''];

    function buildClipPath(variant, W, H) {
      return Burst.buildClipPath(bangScreenEdge, variant, W, H, { rotDeg: 7 });
    }

    // Lite (japanjunky-perf.js): the burst as a plain <img>, same box as the
    // canvas. info-swirl builds it from two WebGL snapshots (see liteBuild).
    var liteImg = null, liteBack = null;
    var liteBackSrc = null;    // [variantA, variantB] black-interior data URLs

    function fitCanvas() {
      var w = card.offsetWidth, h = card.offsetHeight;
      if (!w || !h) return;
      var W = Math.round((w / 2) / (FIT_K * FIT_Q));
      var H = Math.round((h / 2) / (FIT_K * FIT_Q));
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.style.left = 'calc(50% - ' + Math.round(W / 2) + 'px)';
      canvas.style.top = 'calc(50% - ' + Math.round(H / 2) + 'px)';
      [liteImg, liteBack].forEach(function (im) {
        if (!im) return;
        im.style.width = canvas.style.width;
        im.style.height = canvas.style.height;
        im.style.left = canvas.style.left;
        im.style.top = canvas.style.top;
      });
      // kyogen clip frame rides the same rect; its spike polygons are in %
      // of this box but W/H-dependent through the -7deg rotation, so rebuild
      if (clipFrame) {
        clipFrame.style.width = W + 'px';
        clipFrame.style.height = H + 'px';
        clipFrame.style.left = 'calc(50% - ' + Math.round(W / 2) + 'px)';
        clipFrame.style.top = 'calc(50% - ' + Math.round(H / 2) + 'px)';
        clipPaths[0] = buildClipPath(0, W, H);
        clipPaths[1] = buildClipPath(1, W, H);
        // Lite: no CSS clip on the frame at all (any non-rectangular mask —
        // polygon OR border-radius ellipse — cost 8-12 fps on a software
        // compositor); the bang image above the head + the dilated mask
        // baked into the head bitmap do the hiding.
        clipFrame.style.clipPath = lite ? '' : clipPaths[0];
        if (lite) liteBakeHead(W, H);
      }
    }
    fitCanvas();
    if ('ResizeObserver' in window) {
      new ResizeObserver(fitCanvas).observe(card); // also fires when the card first shows
    }
    window.addEventListener('resize', fitCanvas);

    // Bang texture: pop-burst SHAPE on the swirl's machinery. Not radial
    // rays (read too much like the rising-sun scene) — a jagged comic
    // explosion silhouette: a zigzag spike outline r(angle) with the
    // color layers echoing it inward, like the old generated pop art.
    // u = angle, v = radius (v0 end of the cylinder faces the camera =
    // outer rim; v1 = far end = center). Layers outside-in:
    // transparent -> near-black halo -> red body -> gold rim -> center
    // hole where the gold glow core plane sits.
    // `variant` reseeds the spike pattern (and rotates it half a tip) so
    // two textures can flicker-alternate like the old pop burst did.
    function makeStripeTexture(variant) {
      var c = document.createElement('canvas');
      c.width = c.height = TEX;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(TEX, TEX);
      var red = parseColor(RED);
      var gold = parseColor(GOLD);
      var dark = [10, 2, 2]; // near-black red, keeps the burst on the site's black
      for (var y = 0; y < TEX; y++) {
        for (var x = 0; x < TEX; x++) {
          var u = x / TEX, v = y / TEX;
          // jagged spike displacement (shared with the clip polygon)
          var jag = Burst.bangJag(u, variant);
          // layer boundaries in v, all echoing the same jagged outline
          // (smaller v = further out; tips push the whole shape outward).
          // The burst is a RING: past blackV everything is a near-black
          // field — the product info sits inside that center.
          var edge0 = 0.28 - jag * 1.65;   // silhouette edge — DEEP spikes
          var edge1 = edge0 + 0.035;       // ink halo -> red body
          var edge2 = edge0 + 0.105;       // red body -> gold rim
          var edge3 = edge0 + 0.14;        // gold rim -> inner sliver
          var blackV = edge0 + 0.15;       // black interior echoes the outline exactly
          var black = [8, 2, 2];
          var inBlack = v >= blackV;
          var base;
          if (inBlack) base = black;
          else if (v < edge1) base = dark;
          else if (v < edge2) base = red;
          else if (v < edge3) base = gold;
          else base = red;
          var shade;
          if (inBlack) {
            shade = 0.85 + 0.15 * Math.random(); // whisper of grain, keep it clean
          } else {
            // grain: flip pixels near layer edges, plus overall speckle
            var edge = Math.min(Math.abs(v - edge1), Math.abs(v - edge2), Math.abs(v - edge3));
            var n = Math.random();
            if (n < 0.35 - edge * 2.2) {
              base = (base === dark) ? red : (n < 0.08 ? gold : dark);
            }
            shade = 0.75 + 0.25 * Math.random();
          }
          // alpha: dithered silhouette edge outside, fully opaque inward
          // (the far end is sealed by the black cap plane)
          var a = Math.max(0, Math.min(1, (v - edge0) / 0.02));
          var i = (y * TEX + x) * 4;
          img.data[i] = base[0] * shade;
          img.data[i + 1] = base[1] * shade;
          img.data[i + 2] = base[2] * shade;
          img.data[i + 3] = a * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      // CanvasTexture defaults sabotage the painted v-axis mapping:
      // flipY=true mirrors v (black interior lands on the OUTER rim = a
      // giant dark disc), and a linear-space upload makes the renderer's
      // sRGB output brighten the near-black texels to maroon while the
      // cap plane's material color stays black (visible oval seam).
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }

    var stripeTexA = makeStripeTexture(0);
    var stripeTexB = makeStripeTexture(1);

    // The tunnel: cylinder axis along Z, mouth at z=8 so the whole thing
    // stays in front of the camera and shows as a receding disc.
    var tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 40, 24, 1, true),
      new THREE.MeshBasicMaterial({
        map: stripeTexA,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false
      })
    );
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = 28;
    scene.add(tunnel);

    // Planes: a black cap seals the far end so the whole interior reads
    // as one solid dark field (no glow in the middle — the center is
    // supposed to frame the product info, not compete with it), plus a
    // red RING glow hugging the burst bands for the pulse flash.
    var cap = new THREE.Mesh(
      new THREE.CircleGeometry(3.05, 48),
      new THREE.MeshBasicMaterial({ color: 0x080202, side: THREE.DoubleSide })
    );
    cap.position.z = 47.9;
    scene.add(cap);

    function makeRingTexture(rgb) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var ctx = c.getContext('2d');
      var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.55, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      grad.addColorStop(0.75, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.55)');
      grad.addColorStop(0.95, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    var glowRing = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(parseColor(RED)),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glowRing.position.z = 10;
    scene.add(glowRing);

    /* ---------- loop, with visibility pausing ---------- */
    var running = false;
    var rafId = 0;
    var last = 0;
    var inView = true;
    var flickerT = 0;
    var lastSceneKey = '';

    function frame(now) {
      rafId = 0;
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
      last = now;
      // No swirl anymore: the burst FLASHES by alternating two spike
      // patterns on a steps cycle (same rhythm as the old pop flicker).
      flickerT += dt;
      var flickFrame = Math.floor(flickerT / FLICKER) % 2;

      // BANG pulse: periodic core flash, quantized to steps (CRT flash,
      // not a smooth ease).
      var ph = (now / 1000) % BANG_PERIOD;
      var bang = ph < BANG_LEN ? Math.ceil((1 - ph / BANG_LEN) * 4) / 4 : 0;

      // Everything this scene shows is STEPPED (flicker swap + quantized
      // bang; the glow ring texture is a pure radial gradient, so spinning
      // it was invisible) — so only re-render the WebGL buffer when a step
      // actually flips. The canvas covers ~2300x1800 visual px behind the
      // card; Gecko re-rasterizes that upscale every time the buffer is
      // dirtied, and 60Hz dirtying alone dragged Firefox to ~11fps. At
      // step cadence (~6 renders/s) the swirl looks identical and the
      // upscale cost drops ~10x. Pupils keep lerping every frame — they
      // are DOM divs, not canvas content.
      var sceneKey = flickFrame + ':' + bang;
      if (sceneKey !== lastSceneKey) {
        lastSceneKey = sceneKey;
        tunnel.material.map = flickFrame ? stripeTexB : stripeTexA;
        // the kyogen clip silhouette flips with the spike pattern
        if (clipFrame && clipPaths[flickFrame]) {
          clipFrame.style.clipPath = clipPaths[flickFrame];
        }
        glowRing.scale.setScalar(1 + bang * 0.45);
        renderer.render(scene, camera);
      }
      updatePupils();
      rafId = requestAnimationFrame(frame);
    }

    function setRunning(on) {
      if (on === running) return;
      running = on;
      if (on && !rafId) {
        last = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    }

    /* ---------- lite (japanjunky-perf.js) ----------
       A visible WebGL canvas costs a software compositor ~35 fps here even
       when nothing is drawn into it (measured 2026-09-16: static burst
       canvas 60 -> 25 fps, and shrinking it to 900x750 css changed nothing —
       the cost is the WebGL surface, not its area). So in lite the WebGL
       canvas is display:none (bundle.css) and the burst is TWO SNAPSHOTS —
       one per flicker variant, CSS filter baked in — shown through a plain
       <img>. Swapping src at the original FLICKER cadence (and flipping the
       kyogen clip-path with it) keeps the flash; the head keeps its pupils
       on a DOM-only loop. No WebGL work after the two snapshots.
       QA: window.JJ_SWIRL_LITE = { flicker: false, pupils: false } parks
       either loop (read live). */
    var lite = false;
    var liteSrc = null;        // [variantA, variantB] data URLs
    var liteTimer = 0, liteRaf = 0, liteFrame = 0;
    var LITE_FILTER = 'saturate(1.15) contrast(1.1) brightness(0.95)'; // = #jj-swirl-canvas filter

    function liteSnapshot(variant) {
      tunnel.material.map = variant ? stripeTexB : stripeTexA;
      glowRing.scale.setScalar(1);
      renderer.render(scene, camera);
      var c = document.createElement('canvas');
      c.width = c.height = BUFFER;
      var x = c.getContext('2d');
      try { x.filter = LITE_FILTER; } catch (e) {}
      x.drawImage(canvas, 0, 0);   // same task as the render: buffer still valid
      // Punch the black interior out (this image paints ABOVE the head).
      // Polygon in buffer space: rotDeg 0 — the -7deg lives in the CSS
      // transform of the <img>, same as the canvas.
      try { x.filter = 'none'; } catch (e) {}
      x.globalCompositeOperation = 'destination-out';
      if (polyPath(x, variant, BUFFER)) x.fill();
      x.globalCompositeOperation = 'source-over';
      return c.toDataURL('image/png');
    }

    /* Lite bang layering (2026-09-16). GPU path: swirl canvas (z -2) under
       the head (z -1), head clipped to the bang's black interior by a CSS
       polygon. Any CSS mask over the floating head costs a software
       compositor 8-12 fps, and baking the mask into the head bitmap left a
       visible cut that moved with the float. So lite OCCLUDES instead:
         z -2  liteBack : black interior, THIS variant's polygon, dilated —
                          the black the head sits on (swapped with the ring)
         z -1  head     : unmasked, floats freely
         z -1+ liteImg  : the bang snapshot with its interior punched
                          transparent, inserted AFTER the head so it paints
                          above it — the gold edge itself hides the crown,
                          pixel-exact and in sync with the flicker
       Plus one more piece, because the ring band is thin (~21 px at the
       spike valleys) and the crown reaches ~35 px past the interior edge:
       the head bitmap gets the interior polygon baked into its alpha,
       DILATED by LITE_HEAD_INSET so the head always ends INSIDE the ring
       band (never over the scene beyond it) and never short of it (no
       black gap). The opaque ring above hides that baked edge and the
       float's 11 px wobble — the visible edge is always the ring's own
       pixels, as on the GPU path.
       The bake is PER VARIANT (two head bitmaps, swapped in liteFlicker in
       the same tick as the ring): the two flicker patterns are offset half
       a spike, so where one has a valley the other has a tip reaching ~23%
       further out — far more than the band or the dilation can cover. A
       head baked to variant 0 alone left a black notch under every
       variant-1 tip (2026-09-16, "head cut off"). Swapping the head with
       the ring is exactly what the GPU path does with its clip polygon.
       Five static images, no CSS masks. */
    var LITE_HEAD_INSET = 1.04;   // interior polygon scale for the head bake (~+6 px at valleys)
    function parsePolygon(css, W, H) {
      var m = /polygon\((.*)\)/.exec(css || '');
      if (!m) return null;
      var pts = [];
      m[1].split(',').forEach(function (pair) {
        var xy = pair.trim().split(/\s+/);
        if (xy.length < 2) return;
        pts.push([parseFloat(xy[0]) / 100 * W, parseFloat(xy[1]) / 100 * H]);
      });
      return pts.length >= 3 ? pts : null;
    }


    function polyPath(ctx, variant, size) {
      var pts = parsePolygon(Burst.buildClipPath(bangScreenEdge, variant, size, size, { rotDeg: 0 }), size, size);
      if (!pts) return false;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      return true;
    }

    // Black interior backing, PER VARIANT: this variant's interior polygon
    // filled + a fat stroke (covers the AA seam against the ring's punched
    // hole; hidden under the opaque band, ~20 buffer px thick at the
    // valleys). Swapped with the ring in liteFlicker. One static UNION of
    // both variants (2026-09-16) bled past the ring: the variants are
    // offset half a spike, so each one's long tips reach ~5% of the
    // half-frame (~60 css px) beyond the OTHER variant's outer edge — black
    // wedges outside the bang on every flicker ("black background doesn't
    // move with the outline").
    function liteBackSnapshot(variant) {
      var c = document.createElement('canvas');
      c.width = c.height = BUFFER;
      var x = c.getContext('2d');
      x.fillStyle = '#000';
      x.strokeStyle = '#000';
      x.lineWidth = 12;
      x.lineJoin = 'round';
      if (polyPath(x, variant, BUFFER)) { x.fill(); x.stroke(); }
      return c.toDataURL('image/png');
    }

    /* Head mask bake: every head pixel is pushed through the head's own CSS
       transform (DOMMatrix, perspective included) into frame space and kept
       only inside the dilated interior polygon. Needs an untainted bitmap —
       the theme <img> has no crossorigin, so a CORS copy is loaded (Shopify's
       CDN sends ACAO *). If that fails the head stays unbaked: the ring
       still hides the crown wherever the band is thick, and only the valley
       slivers show. */
    var liteHeadImg = kyogen.querySelector('.jj-kyogen__img');
    var liteHeadBitmap = null, liteHeadLoading = false, liteHeadFailed = false;
    var liteHeadSrc = null;    // [variantA, variantB] baked head data URLs
    var liteBakeKey = '';

    function liteBakeHead(W, H) {
      if (!liteHeadImg || !clipFrame || liteHeadFailed) return;
      if (!liteHeadBitmap) {
        if (!liteHeadLoading) {
          liteHeadLoading = true;
          var cors = new Image();
          cors.crossOrigin = 'anonymous';
          cors.onload = function () { liteHeadBitmap = cors; liteHeadLoading = false; fitCanvas(); };
          cors.onerror = function () { liteHeadFailed = true; liteHeadLoading = false; };
          cors.src = liteHeadImg.currentSrc || liteHeadImg.src;
        }
        return;
      }
      var key = W + 'x' + H;
      if (key === liteBakeKey) return;
      try {
        // 1. head layout box in frame space (untransformed) + its transform
        var hx = kyogen.offsetLeft, hy = kyogen.offsetTop, hw = kyogen.offsetWidth, hh = kyogen.offsetHeight;
        if (!hw || !hh) return;
        var prevAnim = kyogen.style.animation;
        kyogen.style.animation = 'none';          // base transform, float phase 0
        var M = new DOMMatrix(getComputedStyle(kyogen).transform);
        kyogen.style.animation = prevAnim;
        var ox = hx + hw / 2, oy = hy + hh / 2;   // transform-origin: 50% 50%
        var m11 = M.m11, m21 = M.m21, m41 = M.m41, m12 = M.m12, m22 = M.m22, m42 = M.m42, m14 = M.m14, m24 = M.m24, m44 = M.m44;

        // 2. source head pixels (untainted CORS copy)
        var nw = liteHeadBitmap.naturalWidth, nh = liteHeadBitmap.naturalHeight;
        var oc = document.createElement('canvas');
        oc.width = nw; oc.height = nh;
        var ocx = oc.getContext('2d');
        ocx.drawImage(liteHeadBitmap, 0, 0);
        var src = ocx.getImageData(0, 0, nw, nh).data;

        var sc = Math.min(1, 1024 / W);
        var mw = Math.ceil(W * sc), mh = Math.ceil(H * sc);
        var mc = document.createElement('canvas');
        mc.width = mw; mc.height = mh;
        var mx = mc.getContext('2d');
        var srcs = [];
        for (var variant = 0; variant < 2; variant++) {
          // 3. this variant's dilated interior polygon -> alpha mask in
          //    frame space (capped resolution)
          var pts = parsePolygon(Burst.buildClipPath(bangScreenEdge, variant, W, H, { rotDeg: 7, inset: LITE_HEAD_INSET }), W, H);
          if (!pts) return;
          mx.clearRect(0, 0, mw, mh);
          mx.fillStyle = '#fff';
          mx.beginPath();
          for (var i = 0; i < pts.length; i++) {
            if (i) mx.lineTo(pts[i][0] * sc, pts[i][1] * sc); else mx.moveTo(pts[i][0] * sc, pts[i][1] * sc);
          }
          mx.closePath();
          mx.fill();
          var mask = mx.getImageData(0, 0, mw, mh).data;

          // 4. push every head pixel through M, drop the ones outside the mask
          var od = ocx.createImageData(nw, nh);
          var d = od.data;
          d.set(src);
          for (var py = 0; py < nh; py++) {
            var ly = (py + 0.5) / nh * hh - hh / 2;
            for (var px = 0; px < nw; px++) {
              var idx = (py * nw + px) * 4 + 3;
              if (d[idx] === 0) continue;
              var lx = (px + 0.5) / nw * hw - hw / 2;
              var w = m14 * lx + m24 * ly + m44;
              var fx = ox + (m11 * lx + m21 * ly + m41) / w;
              var fy = oy + (m12 * lx + m22 * ly + m42) / w;
              var mi = Math.round(fx * sc), mj = Math.round(fy * sc);
              if (mi < 0 || mj < 0 || mi >= mw || mj >= mh || mask[(mj * mw + mi) * 4 + 3] < 128) d[idx] = 0;
            }
          }
          ocx.putImageData(od, 0, 0);
          srcs.push(oc.toDataURL('image/png'));
        }
        liteHeadSrc = srcs;
        liteHeadImg.src = srcs[liteFrame];
        liteBakeKey = key;
      } catch (e) {
        liteHeadFailed = true;
      }
    }

    function liteBuild() {
      if (liteSrc) return;
      liteSrc = [liteSnapshot(0), liteSnapshot(1)];
      function mkImg(cls, src) {
        var im = document.createElement('img');
        im.className = 'jj-swirl-lite ' + cls;
        im.alt = '';
        im.setAttribute('aria-hidden', 'true');
        im.draggable = false;
        im.src = src;
        return im;
      }
      liteBackSrc = [liteBackSnapshot(0), liteBackSnapshot(1)];
      liteBack = mkImg('jj-swirl-lite--back', liteBackSrc[0]);
      canvas.parentNode.insertBefore(liteBack, canvas.nextSibling);          // below the head
      liteImg = mkImg('jj-swirl-lite--front', liteSrc[0]);
      if (clipFrame && clipFrame.parentNode === canvas.parentNode) {
        clipFrame.parentNode.insertBefore(liteImg, clipFrame.nextSibling); // above the head
      } else {
        canvas.parentNode.insertBefore(liteImg, canvas.nextSibling);
      }
      fitCanvas();
    }

    function liteFlags() { return window.JJ_SWIRL_LITE || {}; }

    function liteTick() {
      liteRaf = 0;
      if (!lite || document.hidden || !inView) return;
      if (liteFlags().pupils !== false) updatePupils();
      liteRaf = requestAnimationFrame(liteTick);
    }

    function liteFlicker() {
      if (!lite || document.hidden || !inView || liteFlags().flicker === false) return;
      liteFrame ^= 1;
      if (liteImg) liteImg.src = liteSrc[liteFrame];
      // The black interior follows the ring too (per-variant, see liteBackSnapshot).
      if (liteBack && liteBackSrc) liteBack.src = liteBackSrc[liteFrame];
      // The head follows the ring: its per-variant bake (liteBakeHead) is
      // the lite stand-in for the GPU path's clip-path flip. No CSS mask —
      // any mask on the floating head cost 8-12 fps on a software
      // compositor; a src swap on a 120x173 sprite is free.
      if (liteHeadSrc && liteHeadImg) liteHeadImg.src = liteHeadSrc[liteFrame];
    }

    function evalLite() {
      var on = lite && !document.hidden && inView;
      if (on) {
        if (!liteRaf) liteRaf = requestAnimationFrame(liteTick);
        if (!liteTimer) liteTimer = setInterval(liteFlicker, FLICKER * 1000);
      } else {
        if (liteRaf) { cancelAnimationFrame(liteRaf); liteRaf = 0; }
        if (liteTimer) { clearInterval(liteTimer); liteTimer = 0; }
      }
    }

    function evalRunning() {
      setRunning(!reduced && !lite && !document.hidden && inView);
      evalLite();
    }

    if (window.JJ_Perf && window.JJ_Perf.onLite) {
      window.JJ_Perf.onLite(function (on) {
        lite = !!on;
        if (lite) liteBuild();
        fitCanvas();          // clip frame: interior ellipse (lite) or polygon
        evalRunning();
      });
    }

    document.addEventListener('visibilitychange', evalRunning);
    if ('IntersectionObserver' in window) {
      // Observe the CARD, not the canvas: in lite the canvas is display:none
      // and reports "not intersecting", which parked the lite loops (pupils
      // + flicker froze, 2026-09-16). The canvas/img/clip all ride the card.
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        evalRunning();
      }).observe(card);
    }

    if (reduced) {
      // Single static frame; pupils stay at their CSS rest positions.
      renderer.render(scene, camera);
    } else {
      evalRunning();
    }
  });
})();
