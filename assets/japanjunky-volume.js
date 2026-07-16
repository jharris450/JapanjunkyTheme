/**
 * japanjunky-volume.js
 * Master audio volume manager (state + localStorage + pub/sub). UMD:
 * window.JJ_Volume as a classic <script>, module.exports under Vitest.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_Volume = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'jj-volume';
  var DEF_LEVEL = 0.8;
  var DEF_MUTED = false;

  // Audio taper. The slider position is linear (0..1) but perceived loudness is
  // roughly exponential, so a linear gain felt finicky — too quiet then suddenly
  // too loud, with no useful control at the low end. MAX_GAIN caps the ceiling
  // (max was unusably loud) and GAIN_EXP spreads fine control across the slider.
  var MAX_GAIN = 0.5; // half of full-scale: slider at 100% = 0.5 gain
  var GAIN_EXP = 2;   // square curve → finer resolution near the bottom

  function clamp01(v) {
    v = +v;
    if (!(v >= 0)) return 0; // NaN or < 0
    if (v > 1) return 1;
    return v;
  }

  // Map a raw slider level (0..1) to actual audio gain.
  function taper(level) {
    return MAX_GAIN * Math.pow(clamp01(level), GAIN_EXP);
  }

  function effective(level, muted) {
    return muted ? 0 : taper(level);
  }

  function serialize(state) {
    return JSON.stringify({ level: clamp01(state.level), muted: !!state.muted });
  }

  function parse(str) {
    try {
      var o = JSON.parse(str);
      if (!o || typeof o !== 'object') return { level: DEF_LEVEL, muted: DEF_MUTED };
      var lvl = (typeof o.level === 'number' && o.level >= 0) ? clamp01(o.level) : DEF_LEVEL;
      return { level: lvl, muted: !!o.muted };
    } catch (e) {
      return { level: DEF_LEVEL, muted: DEF_MUTED };
    }
  }

  function create(store) {
    var loaded = parse(store && store.getItem ? store.getItem(STORAGE_KEY) : null);
    var state = { level: loaded.level, muted: loaded.muted };
    var subs = [];

    function persist() {
      try { if (store && store.setItem) store.setItem(STORAGE_KEY, serialize(state)); } catch (e) {}
    }
    function notify() {
      var v = effective(state.level, state.muted);
      for (var i = 0; i < subs.length; i++) { try { subs[i](v); } catch (e) {} }
    }
    return {
      getEffective: function () { return effective(state.level, state.muted); },
      getLevel: function () { return state.level; },
      isMuted: function () { return state.muted; },
      setLevel: function (v) { state.level = clamp01(v); persist(); notify(); },
      setMuted: function (b) { state.muted = !!b; persist(); notify(); },
      toggleMute: function () { state.muted = !state.muted; persist(); notify(); },
      subscribe: function (fn) {
        subs.push(fn);
        try { fn(effective(state.level, state.muted)); } catch (e) {}
        return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
      }
    };
  }

  // Default instance bound to localStorage (browser) or a null store (tests/Node).
  var ls = null;
  try { ls = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null; } catch (e) { ls = null; }
  // Handheld: sound is permanently muted — players are desktop-only and the
  // tray icon is display-only. Null store: the forced mute must never leak
  // into another session through localStorage.
  var instance;
  if (typeof window !== 'undefined' && window.JJ_MOBILE) {
    instance = create(null);
    instance.setMuted(true);
  } else {
    instance = create(ls);
  }
  instance.clamp01 = clamp01;
  instance.taper = taper;
  instance.MAX_GAIN = MAX_GAIN;
  instance.effective = effective;
  instance.serialize = serialize;
  instance.parse = parse;
  instance.create = create;
  return instance;
});
