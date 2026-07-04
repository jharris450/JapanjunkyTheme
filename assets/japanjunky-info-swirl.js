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

  var BUFFER = 220;      // render buffer px; CSS upscales to 660 = chunky pixels
  var TEX = 256;         // stripe texture size
  var STRIPE_SPIN = 0.055;  // texture u scroll = rotation around the axis
  var STRIPE_FLOW = 0.028;  // texture v scroll = flow toward the core

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
    var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, -1);
    camera.lookAt(0, 0, 30);

    // Slanted-stripe swirl texture, grain-dithered like the swirl.jpg
    // reference (noisy band edges instead of clean gradients).
    function makeStripeTexture() {
      var c = document.createElement('canvas');
      c.width = c.height = TEX;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(TEX, TEX);
      var red = parseColor(RED);
      var gold = parseColor(GOLD);
      var dark = [10, 2, 2]; // near-black red, keeps the tunnel on the site's black
      var BANDS = 6;   // stripe pairs around the circumference
      var SLANT = 2;   // v twist -> how tightly the spiral winds
      for (var y = 0; y < TEX; y++) {
        for (var x = 0; x < TEX; x++) {
          var u = x / TEX, v = y / TEX;
          var t = (u * BANDS + v * SLANT) % 1;
          // three zones per band: dark gap, red, thin gold rim
          var base;
          if (t < 0.45) base = dark;
          else if (t < 0.82) base = red;
          else base = gold;
          // grain: flip pixels near zone edges, plus overall speckle
          var edge = Math.min(Math.abs(t - 0.45), Math.abs(t - 0.82), Math.min(t, 1 - t));
          var n = Math.random();
          if (n < 0.35 - edge * 2.2) {
            base = (base === dark) ? red : (n < 0.08 ? gold : dark);
          }
          var shade = 0.75 + 0.25 * Math.random();
          var i = (y * TEX + x) * 4;
          img.data[i] = base[0] * shade;
          img.data[i + 1] = base[1] * shade;
          img.data[i + 2] = base[2] * shade;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }

    var stripeTex = makeStripeTexture();

    // The tunnel: cylinder axis along Z, camera looking down the barrel.
    var tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 40, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: stripeTex, side: THREE.BackSide, depthWrite: false })
    );
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = 18;
    scene.add(tunnel);

    // Core planes: gold glow at the vanishing point + a wider dim red
    // halo a bit closer, counter-rotating for cheap depth.
    function makeGlowTexture(rgb, inner) {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var ctx = c.getContext('2d');
      var grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + inner + ')');
      grad.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }

    function makeGlowPlane(rgb, inner, size, z) {
      var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: makeGlowTexture(rgb, inner),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      mesh.position.z = z;
      scene.add(mesh);
      return mesh;
    }

    var glowCore = makeGlowPlane(parseColor(GOLD), 0.95, 2.4, 34);
    var glowHalo = makeGlowPlane(parseColor(RED), 0.5, 5.5, 26);

    /* ---------- loop, with visibility pausing ---------- */
    var running = false;
    var rafId = 0;
    var last = 0;
    var inView = true;

    function frame(now) {
      rafId = 0;
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
      last = now;
      stripeTex.offset.x = (stripeTex.offset.x + STRIPE_SPIN * dt) % 1;
      stripeTex.offset.y = (stripeTex.offset.y - STRIPE_FLOW * dt + 1) % 1;
      glowHalo.rotation.z += dt * 0.4;
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
