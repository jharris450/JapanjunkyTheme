/**
 * Japanjunky - Underscene (below-the-fold underworld)
 *
 * Scroll parallax: the scene display canvas is pinned to the TOP OF THE
 * PAGE, not the viewport — scrolling toward the catalog slides it up at
 * PARALLAX_FACTOR of content speed. Directly beneath it, this module's
 * canvas shows the scene's INVERSE: a vertically mirrored, wax-less
 * sun/portal render (delivered by japanjunky-screensaver.js) that
 * deteriorates with depth — rows shear apart and pixels break off and
 * drift down as dust. Every so often the real wax dips ~10-15% below the
 * horizon into the underworld, then retreats to its native scene.
 * Below all of it: black, reserved for a future scene.
 *
 * Consumes: window.JJ_Portal (displayCanvas/resW/resH), #jj-scroll
 * Provides: window.JJ_UnderScene { wantsFrame, receiveFrame }
 */
(function () {
  'use strict';

  var PARALLAX_FACTOR = 0.55; // scene recedes at ~half content speed
  var DUST_BLOCK = 2;         // px (buffer-res) — dust/dropout granularity
  var BAND_H = 3;             // px — shear band height
  var DIP_MAX = 0.13;         // wax dip depth, fraction of a screen
  var DIP_MS = 2800;          // one dip (down + back up)
  var DIP_GAP_MS = [6000, 11000]; // pause between dips

  var scroll = document.getElementById('jj-scroll');
  if (!scroll) return; // homepage-only

  var portal = null;
  var underCanvas = null, uctx = null;
  var resW = 0, resH = 0;
  var scrollTop = 0;

  // ─── Dust dropout masks ──────────────────────────────────────
  // Pre-rendered noise tiles punched out via destination-out. Density
  // ramps with depth; the pick + vertical offset drift over time so the
  // decay edge crawls like shedding dust.
  var masks = [];
  function buildMasks() {
    for (var m = 0; m < 3; m++) {
      var c = document.createElement('canvas');
      c.width = resW;
      c.height = resH;
      var x = c.getContext('2d');
      x.fillStyle = '#000';
      for (var y = 0; y < resH; y += DUST_BLOCK) {
        var d = y / resH; // 0 top .. 1 bottom
        var density = d * d * 0.9 + d * 0.25; // sparse up top, heavy below
        for (var px = 0; px < resW; px += DUST_BLOCK) {
          if (Math.random() < density) x.fillRect(px, y, DUST_BLOCK, DUST_BLOCK);
        }
      }
      masks.push(c);
    }
  }

  // ─── Falling dust motes ──────────────────────────────────────
  var motes = [];
  var MOTE_COLORS = ['#e8313a', '#f5d742', '#ffaa00', '#7a5a30', '#555555'];
  function spawnMote() {
    return {
      x: Math.random() * resW,
      y: resH * (0.25 + Math.random() * 0.5),
      vy: 4 + Math.random() * 14,
      vx: (Math.random() - 0.5) * 4,
      life: 1,
      color: MOTE_COLORS[Math.floor(Math.random() * MOTE_COLORS.length)]
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

    buildMasks();
    for (var i = 0; i < 36; i++) motes.push(spawnMote());
    nextDipAt = performance.now() + 4000;

    // ─── Scroll parallax ────────────────────────────────────────
    function onScroll() {
      scrollTop = scroll.scrollTop;
      var ty = -scrollTop * PARALLAX_FACTOR;
      var t = 'translateY(' + ty.toFixed(2) + 'px)';
      portal.displayCanvas.style.transform = t;
      underCanvas.style.transform = t;
    }
    scroll.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  window.JJ_UnderScene = {
    wantsFrame: function () {
      return !!uctx && scrollTop > 2 && !window.JJ_SPLASH_ACTIVE;
    },

    // Called by the screensaver's render loop with the mirrored wax-less
    // frame + the live main frame (for the wax-dip strip).
    receiveFrame: function (inverse, mainFrame) {
      var now = performance.now();
      var dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      uctx.clearRect(0, 0, resW, resH);

      // 1. Mirrored scene in shear bands — horizontal tearing grows with depth
      var tSlow = now * 0.001;
      for (var y = 0; y < resH; y += BAND_H) {
        var d = y / resH;
        // per-band deterministic wobble; deeper bands tear further
        var seed = Math.sin(y * 12.9898 + Math.floor(tSlow * 2) * 78.233) * 43758.5453;
        var jitter = (seed - Math.floor(seed) - 0.5) * 2 * (d * d * 16);
        uctx.globalAlpha = Math.max(0, 1 - d * 0.75);
        uctx.drawImage(inverse, 0, y, resW, BAND_H, jitter, y, resW, BAND_H);
      }
      uctx.globalAlpha = 1;

      // 2. Dust dropout — punch drifting noise holes, heavier with depth
      var mask = masks[Math.floor(tSlow * 3) % masks.length];
      var drift = Math.floor((tSlow * 6) % resH / DUST_BLOCK) * DUST_BLOCK;
      uctx.globalCompositeOperation = 'destination-out';
      uctx.drawImage(mask, 0, drift - resH);
      uctx.drawImage(mask, 0, drift);
      uctx.globalCompositeOperation = 'source-over';

      // 3. Dust motes shedding off the wreck, drifting down into the black
      for (var i = 0; i < motes.length; i++) {
        var mo = motes[i];
        mo.y += mo.vy * dt;
        mo.x += mo.vx * dt;
        mo.life -= dt * 0.5;
        if (mo.life <= 0 || mo.y > resH) motes[i] = spawnMote();
        uctx.globalAlpha = Math.max(0, Math.min(0.8, mo.life));
        uctx.fillStyle = mo.color;
        uctx.fillRect(mo.x | 0, mo.y | 0, DUST_BLOCK, DUST_BLOCK);
      }
      uctx.globalAlpha = 1;

      // 4. Wax dip — the real wax briefly hangs 10-15% below the horizon,
      // then climbs back to its native scene. Mirrored strip of the main
      // frame's bottom (the pool) so the surface continues seamlessly.
      if (!dipStart && now >= nextDipAt) dipStart = now;
      if (dipStart) {
        var p = (now - dipStart) / DIP_MS;
        if (p >= 1) {
          dipStart = 0;
          nextDipAt = now + DIP_GAP_MS[0] + Math.random() * (DIP_GAP_MS[1] - DIP_GAP_MS[0]);
        } else {
          var depth = Math.sin(p * Math.PI) * DIP_MAX; // down then back up
          var h = Math.max(1, Math.round(depth * resH));
          uctx.save();
          uctx.translate(0, h);
          uctx.scale(1, -1);
          uctx.drawImage(mainFrame, 0, resH - h, resW, h, 0, 0, resW, h);
          uctx.restore();
        }
      }
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
