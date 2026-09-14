/**
 * Japanjunky — Explorer tear video (product page)
 *
 * Fills the torn-page hole (#jj-explorer-tear, rendered by
 * snippets/win98-explorer.liquid when a product has a video metafield) with
 * a muted looping product video:
 *   1. custom.video  → hidden <video> → 160px buffer → JJ_Dither → canvas
 *   2. custom.youtube → youtube-nocookie iframe, oversized so the ragged
 *      clip crops YouTube's title bar and logo
 *   3. poster image only (reduced motion / jj-fx-low, or both players fail)
 *   4. nothing usable at all → tear removed, random Kyosai bones instead
 *
 * The ring is two JJ_Burst.paintTear canvases (fray variants) swapped on a
 * stepped cadence, with the hole clip-path'd to the matching silhouette.
 * Everything here is decorative and pointer-events:none; there is no
 * audio, no controls, and the YouTube player is never driven through its
 * API (pausing it would surface the play button + title).
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

  /* ================= mount ================= */
  var RING_BUF = 384;      // ring buffer long side; short side follows the box aspect
  var DEFAULT_ROT = '-20deg'; // fallback when --jj-tear-rot is unreadable
  var DEFAULT_ROT = '-20deg'; // fallback when --jj-tear-rot is unreadable
  var SWAP_MS = 500;       // fray variant swap cadence
  var PULSE_EVERY = 4500;  // ms between pulses
  var PULSE_LEN = 300;     // ms a pulse holds
  var OVERSIZE = 1.5;      // player rect vs the hole's inner ellipse (crops YouTube chrome)

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

    // Buffer aspect follows the box so the fibre grain is uniform; repaint
    // only when the aspect actually moves (explorer drag-resize spams fit()).
    var ringAspect = 0;
    function paintRings(W, H) {
      var aspect = W / H;
      if (ringAspect && Math.abs(aspect / ringAspect - 1) < 0.03) return;
      ringAspect = aspect;
      var bw = aspect >= 1 ? RING_BUF : Math.round(RING_BUF * aspect);
      var bh = aspect >= 1 ? Math.round(RING_BUF / aspect) : RING_BUF;
      for (var k = 0; k < 2; k++) {
        rings[k].width = Math.max(8, bw);
        rings[k].height = Math.max(8, bh);
        Burst.paintTear(rings[k], k);
      }
    }
    var inner = [Burst.tearInner(0), Burst.tearInner(1)];
    var innerMin = Math.min(inner[0], inner[1]);
    var clips = ['', ''];
    var variant = 0;
    var players = []; // { el, aspect } — sized to cover the inner ellipse

    function showVariant(v) {
      variant = v;
      rings[0].hidden = v !== 0;
      rings[1].hidden = v !== 1;
      if (clips[v]) hole.style.clipPath = clips[v];
    }

    // Cover rectangle for a player of the given aspect: the inner ellipse
    // (semi-axes innerMin * W/2, innerMin * H/2) scaled by OVERSIZE.
    function sizePlayer(p) {
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (!W || !H) return;
      var eh = H * innerMin * OVERSIZE;
      var ew = eh * p.aspect;
      var minW = W * innerMin * OVERSIZE;
      if (ew < minW) { ew = minW; eh = ew / p.aspect; }
      p.el.style.width = Math.round(ew) + 'px';
      p.el.style.height = Math.round(eh) + 'px';
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
      var W = tear.offsetWidth, H = tear.offsetHeight;
      if (!W || !H) return;
      paintRings(W, H);
      clips[0] = Burst.buildClipPath(Burst.tearVoidEdge, 0, W, H, { inset: 0.985 });
      clips[1] = Burst.buildClipPath(Burst.tearVoidEdge, 1, W, H, { inset: 0.985 });
      hole.style.clipPath = clips[variant];
      players.forEach(sizePlayer);
    }
    fit();
    if ('ResizeObserver' in window) {
      new ResizeObserver(fit).observe(tear); // explorer window is resizable
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
    // The YouTube iframe, if any, is left alone — the player API would
    // surface its controls.
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

  // YouTube: privacy-enhanced embed, muted autoplay loop, no controls,
  // oversized so the ragged clip crops the title bar and logo. Never
  // driven through the player API.
  function startYouTube(api, yt) {
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + yt.id +
      '?autoplay=1&mute=1&loop=1&playlist=' + yt.id +
      '&controls=0&rel=0&playsinline=1&disablekb=1&iv_load_policy=3&start=' + (yt.start || 0);
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.setAttribute('frameborder', '0');
    f.setAttribute('aria-hidden', 'true');
    f.title = 'Product video';
    f.tabIndex = -1;
    api.mountPlayer(f, 16 / 9);
    api.grid.hidden = false;
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
  }
})();
