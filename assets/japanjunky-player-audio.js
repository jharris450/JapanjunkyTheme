/**
 * japanjunky-player-audio.js
 * Web Audio engine for the toolbox player. Tranche 5 (this file): self-hosted
 * file playback through an "old speaker" distortion chain, generated static
 * fallback, and stop(). The YouTube path is added next.
 *
 * Exposes window.JJ_PlayerAudio = { play(opts), stop() }.
 * opts = { format, audioUrl, youtubeUrl }. Depends on window.JJ_AudioUtil.
 */
(function () {
  'use strict';

  var ctx = null;
  var active = null; // { stop: function } teardown for whatever is playing

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; }
    }
    // Autoplay policy: resume must follow a user gesture (the drop is one).
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (e) {}
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
    chain.output.connect(trim); trim.connect(c.destination);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 2);
    src.loop = true;
    src.connect(chain.input);
    src.start();
    active = {
      stop: function () {
        try { src.stop(); } catch (e) {}
        try { trim.disconnect(); } catch (e) {}
        try { chain.output.disconnect(); } catch (e) {}
      }
    };
  }

  function playFile(c, url) {
    var chain = buildChain(c);
    chain.output.connect(c.destination);
    var src = null;
    var stopped = false;
    active = {
      stop: function () {
        stopped = true;
        try { if (src) src.stop(); } catch (e) {}
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
    } else {
      // 'youtube' is added in the next task; until then it falls to static.
      playStatic(c);
    }
  }

  window.JJ_PlayerAudio = { play: play, stop: stop };
})();
