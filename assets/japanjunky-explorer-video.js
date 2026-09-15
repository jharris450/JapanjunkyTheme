/**
 * Japanjunky — Explorer tear video (product page)
 *
 * Fills the torn-page hole (#jj-explorer-tear, rendered by
 * snippets/win98-explorer.liquid when a product has a custom.video
 * metafield) with a muted looping product video:
 *   1. custom.video → hidden <video> → 256px buffer → JJ_Dither → canvas
 *   2. custom.youtube (fallback custom.youtube_url, the music player's link)
 *      → youtube-nocookie iframe driven over its postMessage API (see
 *      startYouTube for the hard-won rules)
 *   3. poster image only (reduced motion / jj-fx-low at load, or every
 *      player fails)
 *   4. no usable source → tear removed; pane left plain (or on its
 *      custom.explorer_background). Bones are not a fallback: the snippet
 *      renders them only when no video/youtube/background metafield is set.
 *
 * The ring is two JJ_Burst.paintTear canvases (fray variants) swapped on a
 * stepped cadence, with the hole clip-path'd to the matching silhouette.
 * Everything here is decorative and pointer-events:none; no audio, no
 * controls.
 *
 * Debug overlay: load the product page with ?jjdebug=1 (or set
 * localStorage 'jj-debug' = '1') and a small readout of the player state,
 * perf tier, fps and visibility is drawn over the tear. JJ_ExplorerVideo._yt
 * holds the same data plus an event history.
 */
(function () {
  'use strict';

  /* ================= YouTube URL parsing ================= */
  var ID_RE = /(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|^)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;
  var TIME_RE = /[?&#](?:t|start)=([0-9hms]+)/;

  // '90' | '1m30s' | '2h' → seconds; unparseable → 0
  function parseTime(s) {
    if (!s) return 0;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var h = /(\d+)h/.exec(s), m = /(\d+)m/.exec(s), sec = /(\d+)s/.exec(s);
    return (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (sec ? +sec[1] : 0);
  }

  // Any watch / youtu.be / shorts / live / embed URL or a bare 11-char ID →
  // { id, start } | null
  function parseYouTube(str) {
    if (!str) return null;
    str = String(str).trim();
    var m = ID_RE.exec(str);
    if (!m) return null;
    var t = TIME_RE.exec(str);
    return { id: m[1], start: t ? parseTime(t[1]) : 0 };
  }

  window.JJ_ExplorerVideo = { parseYouTube: parseYouTube, parseTime: parseTime };

  var DEBUG = false;
  try {
    DEBUG = /[?&]jjdebug=1/.test(location.search) || localStorage.getItem('jj-debug') === '1';
  } catch (e) { /* storage blocked */ }

  /* ================= mount ================= */
  var RING_BUF = 384;      // ring buffer long side; short side follows the box aspect
  var DEFAULT_ROT = '-20deg'; // fallback when --jj-tear-rot is unreadable
  var SWAP_MS = 500;       // fray variant swap cadence
  var PULSE_EVERY = 4500;  // ms between pulses
  var PULSE_LEN = 300;     // ms a pulse holds
  var YT_OVERSIZE = 1.3;   // YouTube iframe vs the hole's bounding box (crops its title bar/logo)
  // NB: every module-level constant must sit ABOVE ready(): the theme loads
  // this script with defer, so ready() runs its callback synchronously and a
  // var declared further down is still undefined at that moment (bit us once:
  // "opacity undefinedms" silently dropped the iframe fade).
  // mp4 look is tuned to sit on par with the YouTube path (raw frame + the
  // 2px checker in .jj-explorer__tear-grid at 0.1 alpha): the merchant found
  // the earlier 256px / 0.7 stipple far heavier than the iframe (2026-09-15).
  var VID_W = 384;          // dither buffer width: 480p sources upscale ~1.25x, no visible blocks
  var DITHER_MIX = 0.3;     // dithered frame blended over the raw frame (1 = full dither, 0 = none)
  var VID_FPS = 12;
  var YT_NUDGE_MAX = 6;          // attempts after the first play
  var YT_NUDGE_BASE = 1200;      // ms; doubles each attempt
  var YT_GIVEUP_MS = 20000;      // not playing this long after ready → poster
  // ms after "playing" before the iframe is shown. YouTube's embed (at the
  // tear's ~600px size and smaller) draws a centred play/pause control at
  // start that controls=0 does not remove; measured 2026-09-14 via CDP
  // inside the embed on the live store: it stays ~3.9 s after playerState
  // 1 (ytp-autohide lands at ~3 s, the button leaves ~0.9 s later), both
  // on first start and after every loop restart (-1 -> 3 -> 1). 900 ms
  // revealed it mid-flight = the play button the merchant kept seeing.
  // 3.9 s + ~1 s margin; the test in tests/burst-math.test.js pins the floor.
  var YT_REVEAL_DELAY = 5000;
  window.JJ_ExplorerVideo.YT_REVEAL_DELAY = YT_REVEAL_DELAY; // exposed for tests/burst-math.test.js
  var YT_FADE_MS = 400;          // iframe cross-fade over the poster
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

    // Nothing can paint: drop the tear. The pane is left plain (or on its
    // custom.explorer_background); the Kyosai bones are NOT a fallback —
    // the snippet only renders them when no video/youtube/background
    // metafield is set at all.
    function bail(why) {
      warn(why + '; tear removed');
      if (tear.parentNode) tear.parentNode.removeChild(tear);
    }

    if (!Burst || !hole || !poster || !grid || rings.length < 2) {
      bail('missing JJ_Burst or markup');
      return;
    }

    var videoSrc = tear.getAttribute('data-video') || '';
    var yt = parseYouTube(tear.getAttribute('data-youtube'));
    if (!videoSrc && !yt) {
      bail('no usable source (bad YouTube URL?)');
      return;
    }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.classList.contains('jj-fx-low') ||
      !!(window.JJ_Perf && window.JJ_Perf.tier === 'low');

    /* ---------- poster (always) ---------- */
    var posterSrc = tear.getAttribute('data-poster') ||
      (yt ? 'https://i.ytimg.com/vi/' + yt.id + '/hqdefault.jpg' : '');
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
    //   YouTube (cover): full cover × YT_OVERSIZE so its title bar and logo
    //   fall outside the ragged clip.
    function sizePlayer(p) {
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (!W || !H) return;
      var a = outerMax * W / 2, b = outerMax * H / 2;
      var th = rotDeg * Math.PI / 180;
      var c2 = Math.cos(th) * Math.cos(th), s2 = Math.sin(th) * Math.sin(th);
      var hx = Math.sqrt(a * a * c2 + b * b * s2);
      var hy = Math.sqrt(a * a * s2 + b * b * c2);
      var over = p.cover ? YT_OVERSIZE : 1;
      var eh = 2 * hy * over;
      var ew = eh * p.aspect;
      var minW = 2 * hx * over * (p.cover ? 1 : FILL_MIN);
      if (ew < minW) { ew = minW; eh = ew / p.aspect; }
      p.el.style.width = Math.round(ew) + 'px';
      p.el.style.height = Math.round(eh) + 'px';
      p.el.style.transform = playerTransform;
    }

    function mountPlayer(el, aspect, cover) {
      el.classList.add('jj-explorer__tear-player');
      var p = { el: el, aspect: aspect, cover: !!cover };
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
    startPlayers(api, videoSrc, yt);
    evalRunning();
  });

  /* ================= players ================= */

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

  /* ================= YouTube ================= */
  // Third attempt at this source (2026-09-14). Rules learned the hard way:
  //
  //  * A cross-origin iframe cannot be painted inside the SVG barrel filter
  //    japanjunky-crt.css puts on #jj-crt-content — Chromium blacks out the
  //    whole wrapper. So the page drops the barrel (jj-crt-no-barrel, the
  //    same path the shader takes on Firefox/handheld). Scanlines etc. stay.
  //  * autoplay=1 alone is not enough: YouTube gives up when the tab is
  //    hidden/unfocused at load and never retries. So the player is driven
  //    over enablejsapi/postMessage: mute + playVideo on ready, again when
  //    the tab becomes visible, and a capped, backing-off nudge whenever it
  //    reports unstarted/cued/paused.
  //  * NEVER send pauseVideo. v2 paused on the perf governor's low tier and
  //    on document.hidden; the tier flaps on a loaded page and every pause
  //    surfaced YouTube's big play button → flicker. The browser throttles
  //    hidden tabs on its own; a low tier just parks the ring loop.
  //  * The tear must never show a play button: if the nudges run out, or
  //    YouTube reports an error, the iframe is unmounted and the poster
  //    (YouTube's own thumbnail) stays. Static beats broken.

  function startYouTube(api, yt) {
    document.documentElement.classList.add('jj-crt-no-barrel');

    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + yt.id +
      '?autoplay=1&mute=1&loop=1&playlist=' + yt.id +
      '&controls=0&rel=0&playsinline=1&disablekb=1&iv_load_policy=3&start=' + (yt.start || 0) +
      '&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.setAttribute('frameborder', '0');
    f.setAttribute('aria-hidden', 'true');
    f.title = 'Product video';
    f.tabIndex = -1;
    // Start transparent over the poster (YouTube's own thumbnail): the title
    // strip and the centred play/pause control YouTube shows at start cannot
    // be styled from outside, so the iframe is only shown once it reports
    // playing AND YT_REVEAL_DELAY has passed (the control's measured
    // lifetime, see the constant), and hidden again if it ever stops. A loop
    // restart reports -1 first, so it conceals, then re-reveals the same way.
    f.style.opacity = '0';
    f.style.transition = 'none';
    var player = api.mountPlayer(f, 16 / 9, true); // cover: hide YouTube chrome under the clip
    api.grid.hidden = false;
    var revealTimer = 0;
    function reveal() {
      if (revealTimer) return;
      revealTimer = setTimeout(function () {
        revealTimer = 0;
        if (dead || !dbg.playing) return;
        f.style.transition = 'opacity ' + YT_FADE_MS + 'ms ease'; // fade in only
        f.style.opacity = '1';
      }, YT_REVEAL_DELAY);
    }
    function conceal() {
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
      // Cut, never fade out: YouTube redraws the centred control the moment
      // it reports -1/2/5 (loop restart included), and a 400 ms fade-out
      // would show it over the poster.
      f.style.transition = 'none';
      f.style.opacity = '0';
    }

    var dbg = { ready: false, state: null, nudges: 0, error: null, playing: false, gaveUp: null, log: [] };
    window.JJ_ExplorerVideo._yt = dbg;
    function note(what) {
      dbg.log.push(Math.round(performance.now()) + ' ' + what);
      if (dbg.log.length > 40) dbg.log.shift();
    }

    var dead = false, nudgeTimer = 0, giveUpTimer = 0;
    function send(func, args) {
      if (dead || !f.contentWindow) return;
      try {
        f.contentWindow.postMessage(JSON.stringify(
          func === 'listening' ? { event: 'listening', id: 1, channel: 'widget' }
                               : { event: 'command', func: func, args: args || [] }), '*');
      } catch (e) { /* detached */ }
    }
    function play(why) {
      note('play(' + why + ')');
      send('mute');
      send('playVideo');
    }
    // Backing-off retry while the player reports it is not running. Reset
    // whenever it does run, so a later stall gets a fresh budget. Neither
    // the budget nor the give-up clock runs while the tab is hidden: YouTube
    // sends nothing from a background tab, and burning the budget there
    // would strip the iframe before the visitor ever looks. onVis restarts
    // both with a fresh budget.
    function scheduleNudge() {
      if (dead || nudgeTimer || document.hidden) return;
      if (dbg.nudges >= YT_NUDGE_MAX) { fail('never started after ' + dbg.nudges + ' nudges'); return; }
      var wait = YT_NUDGE_BASE * Math.pow(2, dbg.nudges);
      nudgeTimer = setTimeout(function () {
        nudgeTimer = 0;
        if (dead || dbg.playing || document.hidden) return;
        dbg.nudges++;
        play('nudge ' + dbg.nudges);
        scheduleNudge();
      }, wait);
    }
    function armGiveUp() {
      if (giveUpTimer) clearTimeout(giveUpTimer);
      if (document.hidden) return;
      giveUpTimer = setTimeout(function () {
        giveUpTimer = 0;
        if (dead || dbg.playing) return;
        if (document.hidden) return; // onVis re-arms
        fail('not playing ' + (YT_GIVEUP_MS / 1000) + 's after ready');
      }, YT_GIVEUP_MS);
    }
    function onMsg(e) {
      if (dead || e.source !== f.contentWindow) return;
      var m = e.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (err) { return; } }
      if (!m || typeof m !== 'object') return;
      if (m.event === 'onReady') {
        dbg.ready = true;
        note('onReady');
        play('ready');
        armGiveUp();
        scheduleNudge();
      } else if (m.event === 'onError') {
        dbg.error = m.info;
        note('onError ' + m.info);
        fail('YouTube error ' + m.info);
      } else if (m.event === 'infoDelivery' && m.info && typeof m.info.playerState === 'number') {
        var s = m.info.playerState;
        if (s !== dbg.state) note('state ' + s);
        dbg.state = s;
        // 1 playing, 3 buffering → healthy. -1 unstarted, 2 paused, 5 cued → nudge.
        if (s === 1 || s === 3) {
          dbg.playing = true;
          dbg.nudges = 0;
          if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = 0; }
          if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = 0; }
          if (s === 1) reveal(); // buffering keeps whatever is showing
        } else if (s === -1 || s === 2 || s === 5) {
          dbg.playing = false;
          conceal();
          if (dbg.ready) { armGiveUp(); scheduleNudge(); }
        }
      }
    }
    function fail(why) {
      if (dead) return;
      dead = true;
      dbg.gaveUp = why;
      note('FAIL ' + why);
      window.removeEventListener('message', onMsg);
      document.removeEventListener('visibilitychange', onVis);
      if (nudgeTimer) clearTimeout(nudgeTimer);
      if (giveUpTimer) clearTimeout(giveUpTimer);
      if (revealTimer) clearTimeout(revealTimer);
      api.unmountPlayer(player);
      api.grid.hidden = true;
      api.warn(why + '; poster only');
    }
    function onVis() {
      if (document.hidden) {
        if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = 0; }
        if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = 0; }
        return;
      }
      if (dbg.ready && !dbg.playing) {
        dbg.nudges = 0;
        play('visible');
        armGiveUp();
        scheduleNudge();
      }
    }
    window.addEventListener('message', onMsg);
    document.addEventListener('visibilitychange', onVis);
    f.addEventListener('load', function () {
      note('iframe load');
      send('listening');
    });
    // No pause on low tier / hidden — see the rules above.
    api.setOnRun(null);
  }

  // video → YouTube → poster (already showing). Each hop warns once.
  function startPlayers(api, videoSrc, yt) {
    function afterVideo(why) {
      api.warn(why + (yt ? '; using YouTube' : '; poster only'));
      if (yt) startYouTube(api, yt);
    }
    if (videoSrc) {
      startVideo(api, videoSrc, afterVideo);
    } else {
      startYouTube(api, yt);
    }
    if (DEBUG) mountDebug(api);
  }

  /* ================= debug overlay ================= */
  function mountDebug(api) {
    var box = document.createElement('pre');
    box.id = 'jj-tear-debug';
    box.style.cssText = 'position:absolute;left:4px;top:4px;z-index:50;margin:0;padding:4px 6px;' +
      'font:10px/1.35 monospace;color:#33ff33;background:rgba(0,0,0,.85);border:1px solid #33ff33;' +
      'pointer-events:none;white-space:pre;max-width:60%;';
    var zone = document.getElementById('jj-explorer-tear-zone') || api.tear.parentNode;
    zone.appendChild(box);
    function tick() {
      var y = window.JJ_ExplorerVideo._yt;
      var lines = [
        'tear debug',
        'vis ' + document.visibilityState + '  running ' + api.isRunning(),
        'tier ' + (window.JJ_Perf ? window.JJ_Perf.tier + ' ' + window.JJ_Perf.fps + 'fps' : 'n/a') +
          '  reduced ' + window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        'players ' + api.tear.querySelectorAll('.jj-explorer__tear-player').length +
          '  iframe ' + !!api.tear.querySelector('iframe') + '  canvas ' + !!api.tear.querySelector('canvas.jj-explorer__tear-player')
      ];
      if (y) {
        lines.push('yt ready ' + y.ready + ' state ' + y.state + ' playing ' + y.playing +
          ' nudges ' + y.nudges + (y.error ? ' error ' + y.error : '') + (y.gaveUp ? ' GAVE UP: ' + y.gaveUp : ''));
        lines = lines.concat(y.log.slice(-6));
      }
      box.textContent = lines.join('\n');
    }
    tick();
    setInterval(tick, 500);
  }
})();
