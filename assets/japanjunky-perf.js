/**
 * japanjunky-perf.js — global FPS governor.
 *
 * Loads early (right after three.min.js) so window.JJ_Perf exists before any
 * scene module inits. Samples the real frame rate and publishes a quality
 * TIER — 'high' | 'mid' | 'low' — that heavy modules subscribe to and shed
 * effects against.
 *
 * WHY this and not a hardware check: the FPS problems are runtime-state bound
 * (integrated GPU, high-DPI, weak CPU, thermal throttle, iOS Low Power Mode,
 * WebGL context pressure). Two identical iPhones behave differently because
 * one is throttled — and a throttled device just reports a low frame rate.
 * So we measure the frame rate and react to it. No device sniffing.
 *
 * Consumers:
 *   JJ_Perf.tier              -> current tier string
 *   JJ_Perf.onChange(fn)      -> fn(tier) on every tier change; also fired
 *                                immediately with the current tier
 *   JJ_Perf.fps               -> smoothed fps (for debugging)
 *
 * The <html> element also carries jj-fx-mid / jj-fx-low classes so pure-CSS
 * effects can be shed without JS. 'high' carries no class (the default look).
 *
 * Override for testing: localStorage 'jj-fx-force' = 'high'|'mid'|'low' pins
 * the tier and disables measurement.
 */
(function () {
  'use strict';

  var TIERS = ['low', 'mid', 'high'];       // ordered weakest -> strongest
  var root = document.documentElement;

  // ─── Forced tier (debugging / QA) ────────────────────────────────
  var forced = null;
  try { forced = localStorage.getItem('jj-fx-force'); } catch (e) {}
  if (TIERS.indexOf(forced) === -1) forced = null;

  var tier = 'high';
  var listeners = [];

  function applyClass(t) {
    root.classList.remove('jj-fx-mid', 'jj-fx-low');
    if (t === 'mid') root.classList.add('jj-fx-mid');
    else if (t === 'low') root.classList.add('jj-fx-low');
  }

  function setTier(t) {
    if (t === tier) return;
    tier = t;
    applyClass(t);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](t); } catch (e) {}
    }
  }

  // ─── FPS sampling ────────────────────────────────────────────────
  // EMA-smoothed fps. Wide hysteresis + sustained-duration requirement so the
  // tier doesn't flap frame-to-frame. Downshifts fast (bad experience now),
  // upshifts slow (don't yo-yo back into the load that caused the drop).
  var smoothed = 60;          // start optimistic
  var last = 0;
  var warmupUntil = 0;        // skip the first stretch — load jank isn't steady-state
  var lowSince = 0, midSince = 0, highSince = 0;

  // Downshift thresholds (sustained below X for Y ms -> drop a tier)
  var TO_MID = 46, TO_LOW = 27;
  // Upshift thresholds (sustained above X for Y ms -> raise a tier)
  var TO_MID_UP = 40, TO_HIGH_UP = 54;
  var DOWN_MS = 1200, UP_MS = 4000;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) { last = now; warmupUntil = now + 1500; return; }
    var dt = now - last;
    last = now;
    // Ignore absurd gaps (tab was backgrounded / debugger paused).
    if (dt > 0 && dt < 500) {
      var inst = 1000 / dt;
      smoothed += (inst - smoothed) * 0.1;   // EMA, ~10-frame window
    }
    if (now < warmupUntil) return;

    var t = now;
    // Track how long we've been in each band.
    if (smoothed < TO_LOW) { lowSince = lowSince || t; } else { lowSince = 0; }
    if (smoothed < TO_MID) { midSince = midSince || t; } else { midSince = 0; }
    if (smoothed > TO_HIGH_UP) { highSince = highSince || t; } else { highSince = 0; }

    if (tier === 'high') {
      if (lowSince && t - lowSince > DOWN_MS) setTier('low');
      else if (midSince && t - midSince > DOWN_MS) setTier('mid');
    } else if (tier === 'mid') {
      if (lowSince && t - lowSince > DOWN_MS) setTier('low');
      else if (highSince && t - highSince > UP_MS) { setTier('high'); highSince = 0; }
    } else { // low
      // step up only to mid first; needs sustained recovery above TO_MID_UP
      if (smoothed > TO_MID_UP) {
        if (!midSince) midSince = t; // reuse as "recovering" timer
        if (t - midSince > UP_MS) { setTier('mid'); midSince = 0; }
      } else {
        midSince = 0;
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────
  window.JJ_Perf = {
    get tier() { return tier; },
    get fps() { return Math.round(smoothed); },
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      try { fn(tier); } catch (e) {}        // fire immediately with current
      return function () {                    // unsubscribe
        var i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    }
  };

  if (forced) {
    setTier(forced);
    // Pinned — no measurement loop.
  } else {
    applyClass(tier);
    requestAnimationFrame(frame);
  }
})();
