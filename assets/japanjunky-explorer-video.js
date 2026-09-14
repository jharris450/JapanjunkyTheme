/**
 * Japanjunky — Explorer tear video (product page)
 *
 * Fills the torn-page hole (#jj-explorer-tear, rendered by
 * snippets/win98-explorer.liquid when a product has a custom.video
 * metafield) with a muted looping product video:
 *   1. custom.video → hidden <video> → 256px buffer → JJ_Dither → canvas
 *   2. poster image only (reduced motion / jj-fx-low, or the video fails)
 *   3. no source at all → tear removed, random Kyosai bones instead
 *
 * YouTube was source #2 until 2026-09-14 and was dropped: a cross-origin
 * iframe cannot sit inside the CRT barrel filter (#jj-crt-content goes
 * black in Chromium), and YouTube's autoplay is refused in enough real
 * browsers (hidden tab at load, blockers) that the hole showed a play
 * button instead of a video. An mp4 we draw ourselves has none of that.
 *
 * The ring is two JJ_Burst.paintTear canvases (fray variants) swapped on a
 * stepped cadence, with the hole clip-path'd to the matching silhouette.
 * Everything here is decorative and pointer-events:none; no audio, no
 * controls.
 */
(function () {
  'use strict';

  /* ================= mount ================= */
  var RING_BUF = 384;      // ring buffer long side; short side follows the box aspect
  var DEFAULT_ROT = '-20deg'; // fallback when --jj-tear-rot is unreadable
  var SWAP_MS = 500;       // fray variant swap cadence
  var PULSE_EVERY = 4500;  // ms between pulses
  var PULSE_LEN = 300;     // ms a pulse holds
  var FILL_MIN = 0.8;      // mp4/poster: widen only if narrower than this fraction of the hole
  var PALETTE_N = 6;       // max cover colours in the lip gradient
  var HUE_BINS = 12;

  /* ================= cover palette ================= */
  // Downsample the product cover to a tiny canvas and build a spectrum of
  // its colours: saturated pixels are binned by hue, the strongest bins are
  // kept (up to PALETTE_N) and ordered around the colour wheel so the lip
  // reads as a gradient across the cover's palette. Covers with too little
  // colour fall back to their most common bright tones snapped to the CRT
  // palette. cb(list of [r,g,b]) — never called on failure.
  function samplePalette(url, cb) {
    if (!url) return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var S = 32;
        var c = document.createElement('canvas');
        c.width = S; c.height = S;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, S, S);
        var d = ctx.getImageData(0, 0, S, S).data;
        var hue = [], bins = {}, total = 0;
        for (var hb = 0; hb < HUE_BINS; hb++) hue.push({ n: 0, r: 0, g: 0, b: 0, h: hb });
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2];
          if (d[i + 3] < 128) continue;
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 48) continue; // near-black
          total++;
          // most-common bright bins (fallback path)
          var key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
          var bin = bins[key] || (bins[key] = { n: 0, r: 0, g: 0, b: 0 });
          bin.n++; bin.r += r; bin.g += g; bin.b += b;
          // hue spectrum (saturated pixels only)
          var sat = (mx - mn) / mx;
          if (sat < 0.3 || mx < 70) continue;
          var h;
          if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
          else if (mx === g) h = (b - r) / (mx - mn) + 2;
          else h = (r - g) / (mx - mn) + 4;
          var hb2 = Math.floor(h / 6 * HUE_BINS) % HUE_BINS;
          hue[hb2].n++; hue[hb2].r += r; hue[hb2].g += g; hue[hb2].b += b;
        }
        var out = [];
        var strong = hue.filter(function (q) { return q.n >= Math.max(3, total * 0.01); });
        strong.sort(function (a, b2) { return b2.n - a.n; });
        strong = strong.slice(0, PALETTE_N);
        strong.sort(function (a, b2) { return a.h - b2.h; }); // around the wheel
        for (var j = 0; j < strong.length; j++) out.push(lift(meanOf(strong[j]), 170));
        if (out.length < 2) {
          // little colour in the cover: most common bright tones instead
          var list = [];
          for (var k in bins) if (bins.hasOwnProperty(k)) list.push(bins[k]);
          list.sort(function (a, b3) { return b3.n - a.n; });
          var pal = window.JJ_Dither && window.JJ_Dither.PALETTE;
          out = [];
          for (var m = 0; m < list.length && out.length < 3; m++) {
            var col = lift(meanOf(list[m]), 140);
            if (pal) col = nearestPalette(col, pal);
            var dup = false;
            for (var q2 = 0; q2 < out.length; q2++) if (out[q2][0] === col[0] && out[q2][1] === col[1] && out[q2][2] === col[2]) dup = true;
            if (!dup) out.push(col);
          }
        }
        if (out.length) cb(out);
      } catch (e) { /* tainted or decode failure: keep the default lip */ }
    };
    img.src = url;
  }

  function meanOf(bin) {
    return [Math.round(bin.r / bin.n), Math.round(bin.g / bin.n), Math.round(bin.b / bin.n)];
  }

  // Lift dim tones so the lip stays visible on the dark pane.
  function lift(m, floor) {
    var mx = Math.max(m[0], m[1], m[2]);
    if (!mx || mx >= floor) return m;
    var f = floor / mx;
    return [Math.min(255, Math.round(m[0] * f)), Math.min(255, Math.round(m[1] * f)), Math.min(255, Math.round(m[2] * f))];
  }

  function nearestPalette(rgb, pal) {
    var best = pal[0], bd = Infinity;
    for (var i = 0; i < pal.length; i++) {
      var dr = rgb[0] - pal[i][0], dg = rgb[1] - pal[i][1], db = rgb[2] - pal[i][2];
      var dist = dr * dr + dg * dg + db * db;
      if (dist < bd) { bd = dist; best = pal[i]; }
    }
    return [best[0], best[1], best[2]];
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var tear = document.getElementById('jj-explorer-tear');
    if (!tear) return;

    var Burst = window.JJ_Burst;
    var hole = document.getElementById('jj-explorer-tear-hole');
    var poster = document.getElementById('jj-explorer-tear-poster');
    var grid = tear.querySelector('.jj-explorer__tear-grid');
    var rings = tear.querySelectorAll('.jj-explorer__tear-ring');

    function warn(msg) {
      if (window.console) console.warn('explorer: tear video — ' + msg);
    }

    // Nothing can paint: drop the tear and let the bones take the slot.
    function bail(why) {
      warn(why + '; bones instead');
      if (tear.parentNode) tear.parentNode.removeChild(tear);
      if (window.JJ_ExplorerBones) window.JJ_ExplorerBones.pick();
    }

    if (!Burst || !hole || !poster || !grid || rings.length < 2) {
      bail('missing JJ_Burst or markup');
      return;
    }

    var videoSrc = tear.getAttribute('data-video') || '';
    if (!videoSrc) {
      bail('no video source');
      return;
    }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.classList.contains('jj-fx-low') ||
      !!(window.JJ_Perf && window.JJ_Perf.tier === 'low');

    /* ---------- poster (always) ---------- */
    var posterSrc = tear.getAttribute('data-poster') || '';
    if (posterSrc) poster.src = posterSrc;

    /* ---------- ring ---------- */
    // Tilt from CSS (--jj-tear-rot) so the pulse transform below matches.
    var rot = DEFAULT_ROT;
    try {
      var cssRot = getComputedStyle(tear).getPropertyValue('--jj-tear-rot').trim();
      if (cssRot) rot = cssRot;
    } catch (e) { /* keep default */ }
    var baseTransform = 'translate(-50%, -50%) rotate(' + rot + ')';
    var rotDeg = parseFloat(rot) || 0;
    // Only the ring tilts: the poster/player inside the hole are turned back
    // by the same angle so the video reads straight through the slash.
    var playerTransform = 'translate(-50%, -50%) rotate(' + (-rotDeg) + 'deg)';
    var zone = document.getElementById('jj-explorer-tear-zone');
    var mainPane = document.getElementById('jj-explorer-main');

    // Buffer aspect follows the box so the fibre grain is uniform; repaint
    // only when the aspect actually moves (explorer drag-resize spams fit()).
    var ringAspect = 0;
    var ringColors = null; // { lips: [...] } once the cover palette resolves
    function paintRings(W, H, force) {
      var aspect = W / H;
      if (!force && ringAspect && Math.abs(aspect / ringAspect - 1) < 0.03) return;
      ringAspect = aspect;
      var bw = aspect >= 1 ? RING_BUF : Math.round(RING_BUF * aspect);
      var bh = aspect >= 1 ? Math.round(RING_BUF / aspect) : RING_BUF;
      for (var k = 0; k < 2; k++) {
        rings[k].width = Math.max(8, bw);
        rings[k].height = Math.max(8, bh);
        Burst.paintTear(rings[k], k, ringColors);
      }
    }
    // Lip colour from the product cover (async; parchment until it lands).
    samplePalette(tear.getAttribute('data-palette'), function (lips) {
      ringColors = { lips: lips };
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (W && H) paintRings(W, H, true);
    });
    var outerMax = Math.max(Burst.tearOuter(0), Burst.tearOuter(1));
    var clips = ['', ''];
    var variant = 0;
    var players = []; // { el, aspect } — sized to cover the hole; the poster is one too

    function showVariant(v) {
      variant = v;
      rings[0].hidden = v !== 0;
      rings[1].hidden = v !== 1;
      if (clips[v]) hole.style.clipPath = clips[v];
    }

    // Straight player of the given aspect inside the tilted hole. The hole's
    // outer ellipse (semi-axes outerMax * W/2, outerMax * H/2) is tilted by
    // rotDeg relative to the player; hx/hy are its axis-aligned bounding
    // half-extents in the player's frame.
    //   mp4 / poster: height = the hole's vertical extent, width from the
    //   video's own aspect — the frame is shown whole top-to-bottom at the
    //   centre and the lens tips past the frame stay black void. Widened
    //   only if that would leave more than (1 - FILL_MIN) of the hole empty.
    function sizePlayer(p) {
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (!W || !H) return;
      var a = outerMax * W / 2, b = outerMax * H / 2;
      var th = rotDeg * Math.PI / 180;
      var c2 = Math.cos(th) * Math.cos(th), s2 = Math.sin(th) * Math.sin(th);
      var hx = Math.sqrt(a * a * c2 + b * b * s2);
      var hy = Math.sqrt(a * a * s2 + b * b * c2);
      var eh = 2 * hy;
      var ew = eh * p.aspect;
      var minW = 2 * hx * FILL_MIN;
      if (ew < minW) { ew = minW; eh = ew / p.aspect; }
      p.el.style.width = Math.round(ew) + 'px';
      p.el.style.height = Math.round(eh) + 'px';
      p.el.style.transform = playerTransform;
    }

    function mountPlayer(el, aspect) {
      el.classList.add('jj-explorer__tear-player');
      var p = { el: el, aspect: aspect };
      players.push(p);
      sizePlayer(p);
      hole.insertBefore(el, grid);
      return p;
    }

    function unmountPlayer(p) {
      players = players.filter(function (q) { return q !== p; });
      if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
    }

    function fit() {
      // Pin the zone over the product-info pane (right of the sidebar) so the
      // slash lives in the spec sheet, not across the whole explorer body.
      if (zone && mainPane && zone.parentNode) {
        var zr = zone.parentNode.getBoundingClientRect();
        var mr = mainPane.getBoundingClientRect();
        // Rects are visual px under html{zoom}; style px are CSS px that the
        // zoom re-scales at paint — divide the zoom back out (explorer.js
        // does the same for drag). Without this the zone lands off-pane
        // and .jj-explorer__body's overflow:hidden swallows the tear.
        var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        if (mr.width && mr.height) {
          zone.style.left = Math.round((mr.left - zr.left) / z) + 'px';
          zone.style.top = Math.round((mr.top - zr.top) / z) + 'px';
          zone.style.width = Math.round(mr.width / z) + 'px';
          zone.style.height = Math.round(mr.height / z) + 'px';
          zone.style.right = 'auto';
          zone.style.bottom = 'auto';
        }
      }
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (!W || !H) return;
      paintRings(W, H);
      clips[0] = Burst.buildClipPath(Burst.tearVoidEdge, 0, W, H, { inset: 0.985 });
      clips[1] = Burst.buildClipPath(Burst.tearVoidEdge, 1, W, H, { inset: 0.985 });
      hole.style.clipPath = clips[variant];
      players.forEach(sizePlayer);
    }
    // The poster is sized and counter-rotated exactly like a player (16:9
    // box, object-fit: cover inside it).
    players.push({ el: poster, aspect: 16 / 9 });
    fit();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(fit);
      ro.observe(tear); // explorer window is resizable
      if (mainPane) ro.observe(mainPane);
    }
    window.addEventListener('resize', fit);
    showVariant(0);

    /* ---------- motion loop (stepped, pausable) ---------- */
    var running = false;
    var rafId = 0;
    var inView = true;
    var lowFx = false;
    var flipAt = 0;
    var lastScale = 1;
    var frameHook = null; // Task 8: the mp4 dither step
    var onRun = null;     // Task 8: play/pause the hidden <video>

    function frame(now) {
      rafId = 0;
      if (!running) return;
      if (now >= flipAt) {
        flipAt = now + SWAP_MS;
        showVariant(variant ^ 1);
      }
      var sc = (now % PULSE_EVERY) < PULSE_LEN ? 1.03 : 1;
      if (sc !== lastScale) {
        lastScale = sc;
        tear.style.transform = baseTransform + ' scale(' + sc + ')';
      }
      if (frameHook) frameHook(now);
      rafId = requestAnimationFrame(frame);
    }

    function setRunning(on) {
      if (on === running) return;
      running = on;
      if (onRun) onRun(on);
      if (on && !rafId) {
        flipAt = performance.now() + SWAP_MS;
        rafId = requestAnimationFrame(frame);
      }
      if (!on && lastScale !== 1) {
        lastScale = 1;
        tear.style.transform = baseTransform + ' scale(1)';
      }
    }

    function evalRunning() {
      setRunning(!reduced && !lowFx && !document.hidden && inView);
    }

    document.addEventListener('visibilitychange', evalRunning);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        evalRunning();
      }).observe(tear);
    }

    // Perf governor downshift (it lands seconds after mount, so it cannot be
    // read once at load): 'low' parks the ring loop and the mp4 dither loop.
    if (window.JJ_Perf && typeof window.JJ_Perf.onChange === 'function') {
      window.JJ_Perf.onChange(function (t) {
        lowFx = (t === 'low');
        evalRunning();
      });
    }

    if (reduced) {
      // Static ring, poster only — no player is ever mounted.
      return;
    }

    /* ---------- players (Task 8) ---------- */
    var api = {
      tear: tear, grid: grid, warn: warn,
      mountPlayer: mountPlayer, unmountPlayer: unmountPlayer,
      setFrameHook: function (fn) { frameHook = fn; },
      setOnRun: function (fn) { onRun = fn; },
      isRunning: function () { return running; }
    };
    startPlayers(api, videoSrc);
    evalRunning();
  });

  /* ================= players ================= */
  var VID_W = 256;          // dither buffer width: fine enough that 480p sources stay readable
  var DITHER_MIX = 0.7;     // dithered frame blended over the raw frame (1 = full dither, 0 = none)
  var VID_FPS = 12;

  // Shopify mp4 → hidden <video> → small buffer → Floyd-Steinberg to the
  // phosphor palette → visible canvas. onFail(why) tears everything down
  // and hands over to the next source.
  function startVideo(api, src, onFail) {
    var D = window.JJ_Dither;
    if (!D || typeof D.ditherImageData !== 'function') {
      onFail('no JJ_Dither');
      return;
    }
    var v = document.createElement('video');
    v.className = 'jj-explorer__tear-src';
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    v.crossOrigin = 'anonymous'; // Shopify CDN sends CORS headers → untainted canvas

    var buf = document.createElement('canvas');
    var bctx = buf.getContext('2d');
    var out = document.createElement('canvas');
    var octx = out.getContext('2d');
    var player = null;
    var dead = false;
    var lastDraw = 0;
    var step = 1000 / VID_FPS;

    function fail(why) {
      if (dead) return;
      dead = true;
      api.setFrameHook(null);
      api.setOnRun(null);
      try { v.pause(); } catch (e) { /* ignore */ }
      v.removeAttribute('src');
      try { v.load(); } catch (e2) { /* ignore */ }
      if (v.parentNode) v.parentNode.removeChild(v);
      if (player) api.unmountPlayer(player);
      onFail(why);
    }

    v.addEventListener('error', function () { fail('video error'); });
    v.addEventListener('loadeddata', function () {
      if (dead) return;
      var vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) { fail('video has no dimensions'); return; }
      var w = VID_W;
      var h = Math.max(1, Math.round(VID_W * vh / vw));
      buf.width = w; buf.height = h;
      out.width = w; out.height = h;
      player = api.mountPlayer(out, vw / vh);
      api.setFrameHook(function (now) {
        if (now - lastDraw < step || v.readyState < 2) return;
        lastDraw = now;
        bctx.drawImage(v, 0, 0, w, h);
        var px;
        try {
          px = bctx.getImageData(0, 0, w, h);
        } catch (e) {
          fail('tainted canvas');
          return;
        }
        D.ditherImageData(px, w, h);
        // Soft dither: raw frame underneath, stipple on top at DITHER_MIX.
        bctx.putImageData(px, 0, 0);
        octx.globalAlpha = 1;
        octx.drawImage(v, 0, 0, w, h);
        octx.globalAlpha = DITHER_MIX;
        octx.drawImage(buf, 0, 0);
        octx.globalAlpha = 1;
      });
      api.setOnRun(function (on) {
        if (dead) return;
        if (on) {
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () { /* first play() below already decided */ });
        } else {
          v.pause();
        }
      });
      // First play() doubles as the autoplay probe; if the loop is not
      // running yet (tab hidden, tear off-screen) park it right away. A
      // pause() from onRun(false) mid-probe rejects with AbortError, which
      // we must not treat as an autoplay block.
      var p = v.play();
      if (p && p.then) {
        p.then(function () { if (!api.isRunning()) v.pause(); },
               function (e) {
                 // pause() from onRun(false) mid-probe rejects with AbortError:
                 // that is our own interrupt, not an autoplay block
                 if (e && e.name === 'AbortError') return;
                 fail('autoplay refused');
               });
      }
    });

    api.tear.appendChild(v);
    v.src = src;
  }

  // video → poster (already showing). Warns once on failure.
  function startPlayers(api, videoSrc) {
    startVideo(api, videoSrc, function (why) {
      api.warn(why + '; poster only');
    });
  }
})();
