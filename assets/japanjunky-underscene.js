/**
 * Japanjunky - Underscene (below-the-fold underworld)
 *
 * Scroll parallax: the scene display canvas AND the hero furniture
 * (#jj-ring crescent, .jj-product-zone box/panel) are pinned to the TOP
 * OF THE PAGE — scrolling toward the catalog slides them up together at
 * PARALLAX_FACTOR of content speed. Nothing vanishes; the catalog screen
 * simply covers them.
 *
 * Beneath the scene, this module's canvas shows the DIRECT mirror: the
 * wax shader's own water-reflection continued one screen down (uVShift
 * pass rendered by japanjunky-screensaver.js, same dither pipeline as
 * the main frame). The reflection dissolves smoothly into black with
 * depth — soft gradient, a light pixel-crumble at the frontier, and
 * swirling spark particles that fly off the decay edge and fade out
 * (the info-swirl rim-spark feel). The wax pool always hangs a little
 * below the horizon for a seamless blend, and every few seconds it dips
 * further (~13%) before climbing back to its native scene.
 * Below all of it: black, reserved for a future scene.
 *
 * Consumes: window.JJ_Portal (displayCanvas/resW/resH), #jj-scroll
 * Provides: window.JJ_UnderScene { wantsFrame, receiveFrame }
 */
(function () {
  'use strict';

  var PARALLAX_FACTOR = 0.55; // scene recedes at ~half content speed
  var FADE_START = 0.30;      // depth where the dissolve begins
  var FADE_END = 0.92;        // fully black by here
  var POOL_BASE = 0.12;       // wax pool always hangs this far below the horizon
  var DIP_MAX = 0.13;         // extra dip depth, fraction of a screen
  var DIP_MS = 2800;          // one dip (down + back up)
  var DIP_GAP_MS = [6000, 11000]; // pause between dips

  var scroll = document.getElementById('jj-scroll');
  if (!scroll) return; // homepage-only

  var portal = null;
  var underCanvas = null, uctx = null;
  var resW = 0, resH = 0;
  var scrollTop = 0;

  // Pre-built overlays (made in setup once resW/resH known)
  var fadeGrad = null;   // smooth destination-out ramp to black
  var crumbles = [];     // sparse pixel-crumble tiles at the frontier
  var poolStrip = null, poolCtx = null; // offscreen for the faded pool overhang

  function buildOverlays() {
    // Smooth dissolve: erase nothing above FADE_START, everything past FADE_END
    fadeGrad = document.createElement('canvas');
    fadeGrad.width = 1;
    fadeGrad.height = resH;
    var g = fadeGrad.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, resH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(FADE_START, 'rgba(0,0,0,0)');
    grad.addColorStop((FADE_START + FADE_END) / 2, 'rgba(0,0,0,0.55)');
    grad.addColorStop(FADE_END, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, resH);

    // Light crumble: sparse 2px dropout only through the fade zone — the
    // gradient does the dissolve, this just breaks the edge into pixels.
    for (var m = 0; m < 3; m++) {
      var c = document.createElement('canvas');
      c.width = resW;
      c.height = resH;
      var x = c.getContext('2d');
      x.fillStyle = '#000';
      for (var y = 0; y < resH; y += 2) {
        var d = y / resH;
        var k = (d - FADE_START) / (FADE_END - FADE_START);
        if (k <= 0 || k >= 1) continue;
        var density = k * k * 0.45; // gentle — texture, not destruction
        for (var px = 0; px < resW; px += 2) {
          if (Math.random() < density) x.fillRect(px, y, 2, 2);
        }
      }
      crumbles.push(c);
    }

    poolStrip = document.createElement('canvas');
    poolStrip.width = resW;
    poolStrip.height = Math.ceil(resH * (POOL_BASE + DIP_MAX)) + 2;
    poolCtx = poolStrip.getContext('2d');
  }

  // ─── Swirl sparks — pixels flying off the decay edge ─────────
  var sparks = [];
  var SPARK_COUNT = 60;
  function spawnSpark(sampleFrom) {
    var x = Math.random() * resW;
    var y = resH * (FADE_START + Math.random() * (FADE_END - FADE_START));
    var color = '#f5d742';
    if (sampleFrom) {
      try {
        var p = sampleFrom.getContext('2d').getImageData(x | 0, Math.max(0, (y | 0) - 4), 1, 1).data;
        if (p[0] + p[1] + p[2] > 40) color = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
      } catch (e) { /* sampling is garnish */ }
    }
    return {
      x: x, y: y,
      vy: 6 + Math.random() * 16,
      swayAmp: 3 + Math.random() * 9,   // swirl: sinusoidal sideways drift
      swayFreq: 1.5 + Math.random() * 3,
      phase: Math.random() * 6.283,
      life: 0.7 + Math.random() * 0.6,
      color: color
    };
  }

  // ─── Wax dip state ───────────────────────────────────────────
  var dipStart = 0;
  var nextDipAt = 0;
  var lastFrameTime = 0;

  function setup() {
    portal = window.JJ_Portal;
    resW = portal.resW;
    resH = portal.resH;

    // Mirror the display canvas' sizing math (pre-zoom CSS px)
    var cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var canvasW = Math.round(window.innerWidth / cssZoom);
    var canvasH = Math.round(window.innerHeight / cssZoom);

    underCanvas = document.createElement('canvas');
    underCanvas.id = 'jj-underscene';
    underCanvas.width = resW;
    underCanvas.height = resH;
    underCanvas.setAttribute('aria-hidden', 'true');
    underCanvas.tabIndex = -1;
    underCanvas.style.cssText = [
      'position:fixed',
      'top:' + canvasH + 'px', // parked one screen down, flush under the scene
      'left:0',
      'width:' + canvasW + 'px',
      'height:' + canvasH + 'px',
      'z-index:0',
      'pointer-events:none',
      'image-rendering:pixelated',
      'image-rendering:crisp-edges'
    ].join(';');
    uctx = underCanvas.getContext('2d');
    portal.displayCanvas.parentNode.insertBefore(underCanvas, portal.displayCanvas.nextSibling);

    buildOverlays();
    for (var i = 0; i < SPARK_COUNT; i++) sparks.push(spawnSpark(null));
    nextDipAt = performance.now() + 4000;

    // ─── Scroll parallax — scene + hero furniture ride together ──
    var ring = document.getElementById('jj-ring');
    var zone = document.getElementById('jj-product-zone');
    function onScroll() {
      scrollTop = scroll.scrollTop;
      var t = 'translateY(' + (-scrollTop * PARALLAX_FACTOR).toFixed(2) + 'px)';
      portal.displayCanvas.style.transform = t;
      underCanvas.style.transform = t;
      if (ring) ring.style.transform = t;
      if (zone) zone.style.transform = t;
    }
    scroll.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  window.JJ_UnderScene = {
    wantsFrame: function () {
      return !!uctx && scrollTop > 2 && !window.JJ_SPLASH_ACTIVE;
    },

    // Called by the screensaver's render loop with the continued-reflection
    // frame (dithered like the main frame) + the live main frame.
    receiveFrame: function (inverse, mainFrame) {
      var now = performance.now();
      var dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;
      var tSlow = now * 0.001;

      // 1. The continued reflection — direct mirror from the shader
      uctx.clearRect(0, 0, resW, resH);
      uctx.drawImage(inverse, 0, 0);

      // 2. Smooth dissolve to black + a light pixel-crumble at the frontier
      uctx.globalCompositeOperation = 'destination-out';
      uctx.drawImage(fadeGrad, 0, 0, 1, resH, 0, 0, resW, resH);
      uctx.drawImage(crumbles[Math.floor(tSlow * 2.5) % crumbles.length], 0, 0);
      uctx.globalCompositeOperation = 'source-over';

      // 3. Swirl sparks — pixels shear off the decay edge, swirl, fade
      uctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < sparks.length; i++) {
        var s = sparks[i];
        s.y += s.vy * dt;
        s.x += Math.sin(tSlow * s.swayFreq + s.phase) * s.swayAmp * dt;
        s.life -= dt * 0.45;
        if (s.life <= 0 || s.y > resH) { sparks[i] = spawnSpark(inverse); continue; }
        uctx.globalAlpha = Math.max(0, Math.min(0.85, s.life));
        uctx.fillStyle = s.color;
        uctx.fillRect(s.x | 0, s.y | 0, 2, 2);
      }
      uctx.globalAlpha = 1;
      uctx.globalCompositeOperation = 'source-over';

      // 4. Wax pool overhang: always hangs POOL_BASE below the horizon
      // (kills the hard cutoff), and every few seconds dips further before
      // climbing back. Mirrored strip of the live pool, alpha-faded to 0
      // at its lower lip so it melts into the reflection.
      if (!dipStart && now >= nextDipAt) dipStart = now;
      var depth = POOL_BASE;
      if (dipStart) {
        var p = (now - dipStart) / DIP_MS;
        if (p >= 1) {
          dipStart = 0;
          nextDipAt = now + DIP_GAP_MS[0] + Math.random() * (DIP_GAP_MS[1] - DIP_GAP_MS[0]);
        } else {
          depth += Math.sin(p * Math.PI) * DIP_MAX;
        }
      }
      var h = Math.max(2, Math.round(depth * resH));
      poolCtx.clearRect(0, 0, resW, poolStrip.height);
      poolCtx.save();
      poolCtx.translate(0, h);
      poolCtx.scale(1, -1);
      poolCtx.drawImage(mainFrame, 0, resH - h, resW, h, 0, 0, resW, h);
      poolCtx.restore();
      var pg = poolCtx.createLinearGradient(0, 0, 0, h);
      pg.addColorStop(0, 'rgba(0,0,0,0)');
      pg.addColorStop(0.55, 'rgba(0,0,0,0.25)');
      pg.addColorStop(1, 'rgba(0,0,0,1)');
      poolCtx.globalCompositeOperation = 'destination-out';
      poolCtx.fillStyle = pg;
      poolCtx.fillRect(0, 0, resW, h);
      poolCtx.globalCompositeOperation = 'source-over';
      uctx.drawImage(poolStrip, 0, 0);
    }
  };

  // JJ_Portal appears after the splash releases the screensaver init
  var wait = setInterval(function () {
    if (window.JJ_Portal && window.JJ_Portal.displayCanvas) {
      clearInterval(wait);
      setup();
    }
  }, 250);
})();
