/**
 * japanjunky-player-audio.js
 * Web Audio engine for the toolbox player. Tranche 5 (this file):
 * Includes self-hosted file playback through an old-speaker distortion chain, clean YouTube IFrame playback, and a generated static fallback.
 *
 * Exposes window.JJ_PlayerAudio = { play(opts), stop() }.
 * opts = { format, audioUrl, youtubeUrl }. Depends on window.JJ_AudioUtil.
 */
(function () {
  'use strict';

  var ctx = null;
  var active = null; // { stop: function } teardown for whatever is playing
  var masterGain = null;
  var activeYT = null;

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; }
    }
    // Autoplay policy: resume must follow a user gesture (the drop is one).
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {
          console.warn('[JJ] AudioContext resume rejected — audio may not play');
        });
      } catch (e) {}
    }
    if (ctx && !masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = window.JJ_Volume ? window.JJ_Volume.getEffective() : 1;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  // Soft-clip curve for the waveshaper (the "driven small speaker" colour).
  function makeCurve(amount) {
    var n = 1024;
    var curve = new Float32Array(n);
    var k = amount || 50;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  // Bandpass (telephone-ish) + soft clip + trim. Returns { input, output }.
  function buildChain(c) {
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    var shaper = c.createWaveShaper(); shaper.curve = makeCurve(50); shaper.oversample = '2x';
    var g = c.createGain(); g.gain.value = 0.9;
    hp.connect(lp); lp.connect(shaper); shaper.connect(g);
    return { input: hp, output: g };
  }

  function noiseBuffer(c, seconds) {
    var len = Math.floor(c.sampleRate * seconds);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playStatic(c) {
    var chain = buildChain(c);
    var trim = c.createGain(); trim.gain.value = 0.18; // static is quieter
    chain.output.connect(trim); trim.connect(masterGain || c.destination);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 2);
    src.loop = true;
    src.connect(chain.input);
    src.start();
    active = {
      stop: function () {
        try { src.stop(); } catch (e) {}
        try { src.disconnect(); } catch (e) {}
        try { trim.disconnect(); } catch (e) {}
        try { chain.output.disconnect(); } catch (e) {}
      }
    };
  }

  function playFile(c, url) {
    var chain = buildChain(c);
    chain.output.connect(masterGain || c.destination);
    var src = null;
    var stopped = false;
    active = {
      stop: function () {
        stopped = true;
        try { if (src) src.stop(); } catch (e) {}
        try { if (src) src.disconnect(); } catch (e) {}
        try { chain.output.disconnect(); } catch (e) {}
      }
    };
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); })
      .then(function (b) { return c.decodeAudioData(b); })
      .then(function (buf) {
        if (stopped) return;
        src = c.createBufferSource();
        src.buffer = buf;
        src.connect(chain.input);
        src.start();
      })
      .catch(function () {
        if (stopped) return;
        try { chain.output.disconnect(); } catch (e) {}
        playStatic(c); // broken/CORS-blocked link → static
      });
  }

  // --- YouTube IFrame API (lazy) ---
  var ytReady = false;
  var ytQueue = [];

  function ensureYouTube(cb) {
    if (window.YT && window.YT.Player) { ytReady = true; cb(); return; }
    ytQueue.push(cb);
    if (window.JJ_YT_LOADING) return;
    window.JJ_YT_LOADING = true;

    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      ytReady = true;
      var q = ytQueue; ytQueue = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
    };

    // Hidden host element for the iframe.
    if (!document.getElementById('jj-yt-host')) {
      var host = document.createElement('div');
      host.id = 'jj-yt-host';
      host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);
    }

    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  function playYouTube(c, url) {
    var Util = window.JJ_AudioUtil;
    var id = Util ? Util.parseYouTubeId(url) : '';
    if (!id) { playStatic(c); return; } // unparseable link → static

    // Clean YouTube playback — no crackle/hum bed over the song.
    var player = null;
    var stopped = false;
    active = {
      stop: function () {
        stopped = true;
        activeYT = null;
        try { if (player && player.stopVideo) player.stopVideo(); } catch (e) {}
        try { if (player && player.destroy) player.destroy(); } catch (e) {}
      }
    };

    ensureYouTube(function () {
      if (stopped) return;
      player = new window.YT.Player('jj-yt-host', {
        videoId: id,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: function (e) {
            if (stopped) { try { e.target.stopVideo(); } catch (err) {} return; }
            activeYT = e.target;
            var v = window.JJ_Volume ? window.JJ_Volume.getEffective() : 1;
            try {
              e.target.setVolume(Math.round(v * 100));
              if (v <= 0) { e.target.mute(); } else { e.target.unMute(); }
            } catch (err) {}
            try { e.target.playVideo(); } catch (err) {}
          }
        }
      });
    });
  }

  function stop() {
    if (active) {
      try { active.stop(); } catch (e) {}
      active = null;
    }
  }

  function play(opts) {
    var c = getCtx();
    if (!c) return; // no Web Audio support — silently no-op
    stop();
    var Util = window.JJ_AudioUtil;
    var path = Util ? Util.choosePath(opts) : 'static';
    if (path === 'file') {
      playFile(c, opts.audioUrl);
    } else if (path === 'youtube') {
      playYouTube(c, opts.youtubeUrl);
    } else {
      playStatic(c);
    }
  }

  if (window.JJ_Volume) {
    window.JJ_Volume.subscribe(function (v) {
      if (masterGain) masterGain.gain.value = v;
      if (activeYT) {
        try {
          activeYT.setVolume(Math.round(v * 100));
          if (v <= 0) { activeYT.mute(); } else { activeYT.unMute(); }
        } catch (e) {}
      }
    });
  }

  window.JJ_PlayerAudio = { play: play, stop: stop };
})();
