/**
 * japanjunky-audio-react.js
 * Shared "music energy" signal the scene + Tsuno react to. Exposes
 * window.JJ_AudioReact with smoothed fields updated on its own rAF:
 *   energy 0..1 — playback envelope (rises while a song plays, settles when it stops)
 *   beat   0..1 — a pulse that spikes on each beat, then decays
 *   bass / treble 0..1 — frequency bands (real only for self-hosted audio)
 *
 * Three signal sources, picked per song by player-audio.js:
 *   - analyser  : real FFT (only self-hosted/licensed files route through Web Audio)
 *   - bpm+getTime: YouTube — its audio is cross-origin/unreadable, so we sync a
 *                 synthetic beat to the track's tempo using the player's clock
 *   - pseudo    : no bpm + no analyser — a gentle musical idle pulse
 */
(function () {
  'use strict';

  var energy = 0, beat = 0, bass = 0, treble = 0;
  var playing = false;
  var src = null;            // { analyser, freqData, bpm, beatOffset, getTime }
  var rafId = null, lastT = 0;
  var lastBeatIndex = -1;    // tempo-sync edge detector
  var ema = 0;               // moving avg for FFT onset detection

  function ensureLoop() {
    if (rafId === null) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
  }

  function start(opts) {
    src = opts || {};
    if (src.analyser) {
      try { src.freqData = new Uint8Array(src.analyser.frequencyBinCount); } catch (e) { src.analyser = null; }
    }
    playing = true;
    lastBeatIndex = -1;
    ensureLoop();
  }

  function stop() {
    playing = false;
    src = null;
    ensureLoop(); // keep ticking so energy/beat decay to rest, then the loop self-stops
  }

  function tick(now) {
    var dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.05) dt = 0.05;

    // Envelope: ~0.3s rise/fall toward playing state.
    var target = playing ? 1 : 0;
    energy += (target - energy) * Math.min(1, dt * 3);

    // Beat is a decaying pulse (~0.3s tail).
    beat *= Math.pow(0.0008, dt);

    if (playing && src) {
      if (src.analyser && src.freqData) {
        src.analyser.getByteFrequencyData(src.freqData);
        var d = src.freqData, n = d.length, total = 0, bSum = 0, bN = 0, tSum = 0, tN = 0;
        for (var i = 0; i < n; i++) {
          total += d[i];
          if (i < n * 0.15) { bSum += d[i]; bN++; }
          else if (i > n * 0.5) { tSum += d[i]; tN++; }
        }
        var inst = total / (n * 255);
        bass = bN ? bSum / (bN * 255) : 0;
        treble = tN ? tSum / (tN * 255) : 0;
        ema += (inst - ema) * Math.min(1, dt * 4);
        if (inst > ema * 1.4 && inst > 0.05) beat = Math.max(beat, Math.min(1, (inst - ema) * 3));
      } else {
        // Tempo-synced beat: real BPM via the player's clock, else a pseudo pulse.
        var bpm = src.bpm > 0 ? src.bpm : 100;
        var time = null;
        if (src.getTime) { try { time = src.getTime(); } catch (e) { time = null; } }
        if (time == null || isNaN(time)) time = now / 1000;
        var phase = (time - (src.beatOffset || 0)) * bpm / 60;
        var idx = Math.floor(phase);
        if (idx !== lastBeatIndex) { lastBeatIndex = idx; beat = 1; }
        bass = 0.3 + 0.2 * Math.sin(now * 0.006);
        treble = 0.2;
      }
    } else {
      bass *= 0.9; treble *= 0.9;
    }

    if (beat < 0.001) beat = 0;

    if (!playing && energy < 0.01 && beat === 0) {
      energy = 0; bass = 0; treble = 0; rafId = null; return; // idle — stop the loop
    }
    rafId = requestAnimationFrame(tick);
  }

  window.JJ_AudioReact = {
    start: start,
    stop: stop,
    get energy() { return energy; },
    get beat() { return beat; },
    get bass() { return bass; },
    get treble() { return treble; },
    get bpm() { return src ? (src.bpm || 0) : 0; },
    sample: function () { return { energy: energy, beat: beat, bass: bass, treble: treble }; }
  };
})();
