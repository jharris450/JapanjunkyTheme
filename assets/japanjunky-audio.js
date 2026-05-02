/**
 * JapanJunky Audio — WebAudio wrapper for ambient forest bed +
 * interaction accents.
 *
 * Lazy-init: AudioContext created on first user gesture (autoplay policy).
 * Default-muted on first visit; user toggles via taskbar UI.
 *
 * Exposes: window.JJ_Audio.{ playAccent(name, opts), setMuted(bool),
 *                            isMuted(), unlock() }
 */
(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────
  var ASSET_BASE = (window.JJ_AUDIO_CONFIG && window.JJ_AUDIO_CONFIG.assetBase) || '/assets/';
  var AMBIENT_FILE  = 'ambient_forest.ogg';
  var ACCENT_FILES  = ['chime', 'paper', 'stone', 'bell', 'step', 'tsuno'];

  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isMobile = (
    /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    window.innerWidth < 768
  );

  // ─── Persisted state ───────────────────────────────────────
  function readMuted() {
    try { return localStorage.getItem('jj-audio-muted') !== 'false'; } catch (e) { return true; }
  }
  function writeMuted(v) {
    try { localStorage.setItem('jj-audio-muted', String(!!v)); } catch (e) {}
  }
  var muted = readMuted();
  // Reduced motion / mobile: default mute (override only if explicit unmute)
  if (prefersReducedMotion || isMobile) {
    var stored = null;
    try { stored = localStorage.getItem('jj-audio-muted'); } catch (e) {}
    if (stored === null) muted = true;
  }

  // ─── Lazy state ────────────────────────────────────────────
  var ctx = null;
  var masterGain = null;
  var ambientBus = null;
  var accentBus = null;
  var ambientBuffer = null;
  var ambientSource = null;
  var accentBuffers = {};

  // ─── Init (lazy, on first user gesture) ────────────────────
  function ensureContext() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0.0;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    ambientBus.connect(lp);
    lp.connect(masterGain);

    accentBus = ctx.createGain();
    accentBus.gain.value = 0.8;
    accentBus.connect(masterGain);

    return ctx;
  }

  // ─── Buffer loaders ────────────────────────────────────────
  function loadBuffer(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        ctx.decodeAudioData(xhr.response, cb, function () { cb(null); });
      } else {
        cb(null);
      }
    };
    xhr.onerror = function () { cb(null); };
    xhr.send();
  }

  function loadAllBuffers() {
    if (ambientBuffer) return;
    loadBuffer(ASSET_BASE + AMBIENT_FILE, function (buf) {
      ambientBuffer = buf;
      if (!muted && buf && !prefersReducedMotion) startAmbient();
    });
    for (var i = 0; i < ACCENT_FILES.length; i++) {
      (function (name) {
        loadBuffer(ASSET_BASE + 'accent_' + name + '.ogg', function (buf) {
          if (buf) accentBuffers[name] = buf;
        });
      })(ACCENT_FILES[i]);
    }
  }

  // ─── Ambient ───────────────────────────────────────────────
  function startAmbient() {
    if (!ctx || !ambientBuffer || muted || prefersReducedMotion) return;
    if (ambientSource) return;
    ambientSource = ctx.createBufferSource();
    ambientSource.buffer = ambientBuffer;
    ambientSource.loop = true;
    ambientSource.connect(ambientBus);
    ambientSource.start(0);
    var now = ctx.currentTime;
    ambientBus.gain.cancelScheduledValues(now);
    ambientBus.gain.setValueAtTime(0, now);
    ambientBus.gain.linearRampToValueAtTime(0.3, now + 3);
  }
  function stopAmbient() {
    if (!ambientSource || !ctx) return;
    var now = ctx.currentTime;
    ambientBus.gain.cancelScheduledValues(now);
    ambientBus.gain.linearRampToValueAtTime(0, now + 0.5);
    var s = ambientSource;
    ambientSource = null;
    setTimeout(function () { try { s.stop(); } catch (e) {} }, 600);
  }

  // ─── Accent playback ───────────────────────────────────────
  function playAccent(name, opts) {
    if (!ctx) return;
    var buf = accentBuffers[name];
    if (!buf) return;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var pitch = (opts && opts.pitch) || 1.0;
    src.playbackRate.value = pitch;
    if (opts && typeof opts.panX === 'number' && ctx.createStereoPanner) {
      var panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.panX));
      src.connect(panner);
      panner.connect(accentBus);
    } else {
      src.connect(accentBus);
    }
    src.start(0);
  }

  // ─── Mute toggle ───────────────────────────────────────────
  function setMuted(v) {
    muted = !!v;
    writeMuted(muted);
    if (muted) stopAmbient();
    else if (ambientBuffer) startAmbient();
  }
  function isMuted() { return muted; }

  // ─── First-gesture unlock ─────────────────────────────────
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended' && c.resume) c.resume();
    loadAllBuffers();
  }
  ['click', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  });

  // ─── Battery-aware throttle ────────────────────────────────
  if (navigator.getBattery) {
    navigator.getBattery().then(function (battery) {
      function maybeBatteryMute() {
        if (battery.level < 0.2 && !battery.charging) stopAmbient();
      }
      battery.addEventListener('levelchange', maybeBatteryMute);
      battery.addEventListener('chargingchange', maybeBatteryMute);
      maybeBatteryMute();
    }).catch(function () {});
  }

  // ─── Mute toggle UI binding ───────────────────────────────
  function bindToggle() {
    var btn = document.getElementById('jj-audio-mute');
    if (!btn) return;
    var icon = btn.querySelector('.jj-audio-icon');
    function refresh() {
      if (icon) {
        icon.textContent = muted ? '🔇' : '🔊';
        icon.dataset.state = muted ? 'muted' : 'on';
      }
    }
    refresh();
    btn.addEventListener('click', function () {
      setMuted(!muted);
      refresh();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle);
  } else {
    bindToggle();
  }

  window.JJ_Audio = {
    playAccent: playAccent,
    setMuted: setMuted,
    isMuted: isMuted,
    unlock: unlock
  };
})();
