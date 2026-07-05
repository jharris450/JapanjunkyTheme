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

  var BUFFER = 512;      // render buffer px; CSS upscale ~2.4x keeps pixels but kills grain-mush
  var TEX = 512;         // burst texture size
  var FLICKER = 0.18;    // seconds per frame of the two-pattern flicker
  var PARTICLES = 42;    // sparks shed off the burst rim
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
        var cr = card.getBoundingClientRect();
        target = { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.55 };
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
    function fitCanvas() {
      var w = card.offsetWidth, h = card.offsetHeight;
      if (!w || !h) return;
      var W = Math.round((w / 2) / (FIT_K * FIT_Q));
      var H = Math.round((h / 2) / (FIT_K * FIT_Q));
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.style.left = 'calc(50% - ' + Math.round(W / 2) + 'px)';
      canvas.style.top = 'calc(50% - ' + Math.round(H / 2) + 'px)';
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
      var SPIKES = 14; // zigzag tips around the outline
      function hash(k, salt) {
        var h = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
        return h - Math.floor(h);
      }
      for (var y = 0; y < TEX; y++) {
        for (var x = 0; x < TEX; x++) {
          var u = x / TEX, v = y / TEX;
          // jagged spike displacement: triangle wave per spike, tip
          // height varies spike to spike so the outline isn't uniform
          var st = (u + variant * 0.5 / SPIKES) * SPIKES;
          var spike = Math.floor(st) % SPIKES;
          var tri = 1 - Math.abs(2 * (st - Math.floor(st)) - 1); // 0 valley -> 1 tip
          // long/short alternation + per-spike jitter: comic bang, not a gear
          var amp = (spike % 2 ? 0.45 : 1.0) * (0.6 + 0.4 * hash(spike, 1 + variant * 7));
          var jag = tri * amp * 0.16;
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

    /* ---------- rim sparks: particles shed off the swirl's edge ---------- */
    var spark = (function () {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(PARTICLES * 3);
      var col = new Float32Array(PARTICLES * 3);
      var p = [];
      var redC = parseColor(RED), goldC = parseColor(GOLD);
      function reset(i, scatterLife) {
        var s = p[i] = p[i] || {};
        s.theta = Math.random() * Math.PI * 2;
        s.r = 2.9 + Math.random() * 0.3;          // spawn on the rim
        s.z = 9 + Math.random() * 6;              // near the mouth
        s.vr = 0.9 + Math.random() * 0.9;         // drift outward
        s.omega = 0.5 + Math.random() * 0.5;      // keep swirling
        s.life = s.maxLife = 1.4 + Math.random() * 1.2;
        if (scatterLife) s.life *= Math.random(); // stagger initial batch
        s.gold = Math.random() < 0.45;
      }
      for (var i = 0; i < PARTICLES; i++) reset(i, true);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

      // tiny round sprite so points aren't squares
      var dot = document.createElement('canvas');
      dot.width = dot.height = 16;
      var dctx = dot.getContext('2d');
      var dg = dctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      dg.addColorStop(0, 'rgba(255,255,255,1)');
      dg.addColorStop(1, 'rgba(255,255,255,0)');
      dctx.fillStyle = dg;
      dctx.fillRect(0, 0, 16, 16);

      var pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.1, // world units; the far camera shrinks attenuated points ~4x
        map: new THREE.CanvasTexture(dot),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending, // color fades to black = invisible
        depthWrite: false
      }));
      scene.add(pts);

      return {
        // kick n sparks off the rim fast — fired at each bang pulse
        burst: function (n) {
          for (var k = 0, i = 0; i < PARTICLES && k < n; i++) {
            if (p[i].life < p[i].maxLife * 0.4) {
              reset(i, false);
              p[i].vr = 2.6 + Math.random() * 1.6;
              k++;
            }
          }
        },
        update: function (dt) {
          for (var i = 0; i < PARTICLES; i++) {
            var s = p[i];
            s.life -= dt;
            if (s.life <= 0) reset(i, false);
            s.theta += s.omega * dt;
            s.r += s.vr * dt;
            var fade = Math.max(0, s.life / s.maxLife);
            var c = s.gold ? goldC : redC;
            pos[i * 3] = Math.cos(s.theta) * s.r;
            pos[i * 3 + 1] = Math.sin(s.theta) * s.r;
            pos[i * 3 + 2] = s.z;
            col[i * 3] = (c[0] / 255) * fade;
            col[i * 3 + 1] = (c[1] / 255) * fade;
            col[i * 3 + 2] = (c[2] / 255) * fade;
          }
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
      };
    })();

    /* ---------- loop, with visibility pausing ---------- */
    var running = false;
    var rafId = 0;
    var last = 0;
    var inView = true;
    var banging = false;
    var flickerT = 0;

    function frame(now) {
      rafId = 0;
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
      last = now;
      // No swirl anymore: the burst FLASHES by alternating two spike
      // patterns on a steps cycle (same rhythm as the old pop flicker).
      flickerT += dt;
      var flickFrame = Math.floor(flickerT / FLICKER) % 2;
      tunnel.material.map = flickFrame ? stripeTexB : stripeTexA;
      glowRing.rotation.z += dt * 0.4;

      // BANG pulse: periodic core flash, quantized to steps (CRT flash,
      // not a smooth ease), with a spark burst on the attack.
      var ph = (now / 1000) % BANG_PERIOD;
      var inBang = ph < BANG_LEN;
      if (inBang) {
        var f = Math.ceil((1 - ph / BANG_LEN) * 4) / 4;
        glowRing.scale.setScalar(1 + f * 0.45);
        if (!banging) spark.burst(10);
      } else {
        glowRing.scale.setScalar(1);
      }
      banging = inBang;

      spark.update(dt);
      renderer.render(scene, camera);
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

    function evalRunning() {
      setRunning(!reduced && !document.hidden && inView);
    }

    document.addEventListener('visibilitychange', evalRunning);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        evalRunning();
      }).observe(canvas);
    }

    if (reduced) {
      // Single static frame; pupils stay at their CSS rest positions.
      renderer.render(scene, camera);
    } else {
      evalRunning();
    }
  });
})();
