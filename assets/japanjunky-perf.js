/**
 * japanjunky-perf.js — global FPS governor + soft-GPU / lite mode.
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
 * LITE mode (2026-09-16, "hardware acceleration off" report): with the GPU
 * gone (Chrome's accel toggle off -> WARP/SwiftShader WebGL + software
 * compositor; Firefox measured the same shape), the homepage ran at 6.5 fps.
 * Measured on the live store, headless Chrome --disable-gpu, 1920x1080
 * (tests/harness/perf-probe.js):
 *   all effects on                                   6.5 fps
 *   - barrel SVG filter (#jj-crt-content)            17
 *   - WebGL CRT overlay (fullscreen shader canvas)   21
 *   - swirl "bang" canvas (512 buffer -> ~2300 css)  60 with glyph+box off
 *   glyph-field + bundle box kept on                 41
 * The JS main thread was only ~25% busy throughout: the cost is the software
 * compositor re-rasterizing huge per-frame layers, so 'low' tier's DPR/bloom
 * knobs could not save it. Lite is the STRUCTURAL shed: no barrel, CSS
 * scanlines instead of the WebGL overlay, no swirl canvas, throttled
 * glyph-field / bundle box / viewer / card spins.
 *
 * Lite LATCHES — once on, on for the page's life. The structural changes
 * (barrel on/off, overlay swap) would be jarring if the governor's up/down
 * hysteresis toggled them every few seconds. Because it is permanent it is
 * only ever latched on MEASURED evidence: the tier must sit at 'low' for a
 * sustained stretch (LITE_LATCH_MS) — a load-time dip must not cost the page
 * its bang/overlay for good. The soft-GPU probe (WebGL refuses
 * `failIfMajorPerformanceCaveat` — Chromium with accel off) only shortens
 * the confirmation: no warm-up and a short sustain, so the slideshow lasts
 * ~1.5 s instead of ~8. A probe that the frame rate does not corroborate
 * does nothing. (Brave regression, 2026-09-16: a renderer-name heuristic —
 * "SwiftShader"/"Basic Render Driver" — pinned the tier at 'low' on a
 * healthy GPU because Brave's fingerprint farbling spoofs the WebGL renderer
 * string. Never trust the renderer string; Firefox on WARP is caught by the
 * measured latch anyway — it runs ~13 fps.) Once lite is latched WITH a
 * positive probe, the tier is capped at 'low': a CPU renderer never earns
 * the smooth knobs back.
 *
 * Consumers:
 *   JJ_Perf.tier              -> current tier string
 *   JJ_Perf.onChange(fn)      -> fn(tier) on every tier change; also fired
 *                                immediately with the current tier
 *   JJ_Perf.fps               -> smoothed fps (for debugging)
 *   JJ_Perf.lite              -> boolean, latched
 *   JJ_Perf.softGpu           -> boolean, load-time probe result
 *   JJ_Perf.onLite(fn)        -> fn() once, when lite latches (immediately if
 *                                already lite); returns unsubscribe
 *
 * The <html> element also carries jj-fx-mid / jj-fx-low classes so pure-CSS
 * effects can be shed without JS ('high' carries no class), plus jj-fx-lite
 * (latched) and jj-soft-gpu (probe). Lite also adds jj-crt-no-barrel — the
 * same class Firefox/handheld already use to drop the barrel filter.
 *
 * Override for testing: localStorage 'jj-fx-force' = 'high'|'mid'|'low'
 * pins the tier and disables measurement ('low' also latches lite);
 * 'jj-fx-lite' = '1' forces lite on, '0' forces it off (probe + latch ignored).
 */
(function () {
  'use strict';

  var TIERS = ['low', 'mid', 'high'];       // ordered weakest -> strongest
  var root = document.documentElement;

  // ─── Forced tier / lite (debugging / QA) ─────────────────────────
  var forced = null, forcedLite = null;
  try {
    forced = localStorage.getItem('jj-fx-force');
    forcedLite = localStorage.getItem('jj-fx-lite');
  } catch (e) {}
  if (TIERS.indexOf(forced) === -1) forced = null;
  if (forcedLite !== '1' && forcedLite !== '0') forcedLite = null;

  // ─── Soft-GPU probe ──────────────────────────────────────────────
  // A context that fails with failIfMajorPerformanceCaveat is one the browser
  // itself calls slow (software rasterizer). Only that signal is used — the
  // unmasked renderer string is farbled by Brave (see header). Any thrown
  // error = not soft (an absent WebGL is a different failure the modules
  // already handle).
  function release(gl) {
    try { var lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); } catch (e) {}
  }
  function probeSoftGpu() {
    try {
      var c = document.createElement('canvas');
      var strict = c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
        || c.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true });
      if (strict) { release(strict); return false; }
      var plain = document.createElement('canvas').getContext('webgl');
      if (plain) { release(plain); return true; }     // WebGL exists, but only software
      return false;                                    // no WebGL at all
    } catch (e) { return false; }
  }

  var softGpu = forcedLite === null ? probeSoftGpu() : false;
  if (softGpu) root.classList.add('jj-soft-gpu');

  // ─── Lite latch ──────────────────────────────────────────────────
  var lite = false;
  var liteListeners = [];
  var maxTier = 'high';

  function latchLite() {
    if (lite || forcedLite === '0') return;
    lite = true;
    root.classList.add('jj-fx-lite');
    root.classList.add('jj-crt-no-barrel');
    // Probe + measurement agree: a CPU renderer never earns the knobs back.
    if (softGpu) maxTier = 'low';
    var fns = liteListeners; liteListeners = [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](); } catch (e) {}
    }
  }

  // Sustained-'low' requirement before the permanent latch. The probe only
  // shortens it; it never latches on its own.
  var LITE_LATCH_MS = softGpu ? 1500 : 5000;
  var LITE_MIN_AGE_MS = softGpu ? 0 : 8000;   // no latch inside the load-jank window
  var lowTierSince = 0;
  var startedAt = 0;

  var tier = 'high';
  var listeners = [];

  function applyClass(t) {
    root.classList.remove('jj-fx-mid', 'jj-fx-low');
    if (t === 'mid') root.classList.add('jj-fx-mid');
    else if (t === 'low') root.classList.add('jj-fx-low');
  }

  function setTier(t) {
    if (TIERS.indexOf(t) > TIERS.indexOf(maxTier)) t = maxTier;
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
    if (!last) { last = now; startedAt = now; warmupUntil = now + (softGpu ? 0 : 1500); return; }
    var dt = now - last;
    last = now;
    // Ignore absurd gaps (tab was backgrounded / debugger paused).
    if (dt > 0 && dt < 500) {
      var inst = 1000 / dt;
      smoothed += (inst - smoothed) * 0.1;   // EMA, ~10-frame window
    }
    if (now < warmupUntil) return;

    var t = now;

    // Lite latch: 'low' must hold for LITE_LATCH_MS, and not inside the
    // load-jank window. A dip that recovers costs nothing permanent.
    if (!lite) {
      if (tier === 'low') {
        lowTierSince = lowTierSince || t;
        if (t - lowTierSince > LITE_LATCH_MS && t - startedAt > LITE_MIN_AGE_MS) latchLite();
      } else {
        lowTierSince = 0;
      }
    }
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
    get lite() { return lite; },
    get softGpu() { return softGpu; },
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      try { fn(tier); } catch (e) {}        // fire immediately with current
      return function () {                    // unsubscribe
        var i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    onLite: function (fn) {
      if (typeof fn !== 'function') return function () {};
      if (lite) { try { fn(); } catch (e) {} return function () {}; }
      liteListeners.push(fn);
      return function () {
        var i = liteListeners.indexOf(fn);
        if (i !== -1) liteListeners.splice(i, 1);
      };
    }
  };

  if (forcedLite === '1') latchLite();

  if (forced) {
    setTier(forced);
    if (forced === 'low') latchLite();
    // Pinned — no measurement loop.
  } else {
    // Probe positive: start at 'low' (cheap, reversible knobs) so the first
    // seconds are not a slideshow; the frame loop confirms before lite.
    if (softGpu) setTier('low');
    else applyClass(tier);
    requestAnimationFrame(frame);
  }
})();
