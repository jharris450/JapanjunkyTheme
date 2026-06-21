# Win98 Volume Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows-98-style speaker control in the taskbar tray (left of the clock) that masters all site audio — the toolbox media players (Web Audio + YouTube iframe) and Tsuno's voice clips — with a vertical-slider popup, a mute toggle, and persistence across pages.

**Architecture:** A new `JJ_Volume` manager (state + localStorage + pub/sub) is the single source of truth. Three consumers subscribe: `player-audio.js` (a Web Audio master GainNode for file/static + the YouTube API for the iframe), `tsuno-bubble.js` (`audio.volume`). A tray snippet + JS + CSS render the Win98 speaker icon and popup and write to `JJ_Volume`.

**Tech Stack:** ES5 UMD asset modules, Web Audio API, YouTube IFrame API, Liquid, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-win98-volume-control-design.md`

## Global Constraints

- Asset JS is ES5 UMD (`var`, no arrows/const/let), matching the codebase.
- `JJ_Volume` API (exact): `getEffective()`, `getLevel()`, `isMuted()`, `setLevel(v)`, `setMuted(b)`, `toggleMute()`, `subscribe(fn)→unsub`. Plus statics for tests: `clamp01`, `effective`, `serialize`, `parse`, `create(store)`.
- `getEffective()` = `muted ? 0 : level`. `level` clamped to [0,1]. Default `{ level: 0.8, muted: false }`. localStorage key `'jj-volume'`.
- All consumers guard `if (window.JJ_Volume)` and no-op without it. `subscribe(fn)` calls `fn(effective)` immediately and on every change.
- Only output LEVEL changes — never change what a source plays.
- UI is CRT/Win95 aesthetic: NO emoji (CSS/inline-SVG speaker glyph), no rounded corners, reuse the existing win95 bevel box-shadow recipe. `audio.volume`/`setVolume` ranges: Web Audio gain & HTMLAudio.volume are 0..1; YouTube `setVolume` is 0..100.
- Tests are Vitest, `npm test`. Never `git add -A`. Deploy is via `main`.

---

### Task 1: `JJ_Volume` manager + tests

**Files:**
- Create: `assets/japanjunky-volume.js`
- Test: `tests/volume.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `window.JJ_Volume` (default instance bound to localStorage) with the API in Global Constraints, plus `clamp01`, `effective`, `serialize`, `parse`, `create(store)` for tests. `create(store)` builds an instance bound to `store` (any object with `getItem(k)`/`setItem(k,v)`).

- [ ] **Step 1: Write the failing test**

```js
// tests/volume.test.js
import { describe, it, expect } from 'vitest';
import V from '../assets/japanjunky-volume.js';

function fakeStore(initial) {
  var data = initial ? { 'jj-volume': initial } : {};
  return {
    data: data,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = v; }
  };
}

describe('pure helpers', () => {
  it('clamp01 bounds to [0,1] and handles junk', () => {
    expect(V.clamp01(-1)).toBe(0);
    expect(V.clamp01(0.5)).toBe(0.5);
    expect(V.clamp01(2)).toBe(1);
    expect(V.clamp01(NaN)).toBe(0);
  });
  it('effective is 0 when muted, else the clamped level', () => {
    expect(V.effective(0.5, false)).toBe(0.5);
    expect(V.effective(0.5, true)).toBe(0);
    expect(V.effective(2, false)).toBe(1);
  });
  it('parse tolerates bad/empty/missing input -> defaults (0.8, false)', () => {
    expect(V.parse('not json')).toEqual({ level: 0.8, muted: false });
    expect(V.parse('')).toEqual({ level: 0.8, muted: false });
    expect(V.parse(null)).toEqual({ level: 0.8, muted: false });
    expect(V.parse('{"level":0.3,"muted":true}')).toEqual({ level: 0.3, muted: true });
    expect(V.parse('{"level":5}')).toEqual({ level: 1, muted: false });
  });
  it('serialize -> parse round trips', () => {
    expect(V.parse(V.serialize({ level: 0.42, muted: true }))).toEqual({ level: 0.42, muted: true });
  });
});

describe('manager (injected store)', () => {
  it('loads defaults when the store is empty', () => {
    var m = V.create(fakeStore());
    expect(m.getLevel()).toBe(0.8);
    expect(m.isMuted()).toBe(false);
    expect(m.getEffective()).toBe(0.8);
  });
  it('loads persisted state', () => {
    var m = V.create(fakeStore('{"level":0.25,"muted":true}'));
    expect(m.getLevel()).toBe(0.25);
    expect(m.isMuted()).toBe(true);
    expect(m.getEffective()).toBe(0); // muted
  });
  it('setLevel clamps, persists, and notifies subscribers', () => {
    var store = fakeStore();
    var m = V.create(store);
    var seen = [];
    m.subscribe(function (v) { seen.push(v); }); // fires once immediately with 0.8
    m.setLevel(0.5);
    expect(m.getLevel()).toBe(0.5);
    expect(seen).toEqual([0.8, 0.5]);
    expect(V.parse(store.data['jj-volume'])).toEqual({ level: 0.5, muted: false });
    m.setLevel(2);
    expect(m.getLevel()).toBe(1);
  });
  it('mute zeroes effective and toggleMute flips it; unsubscribe stops updates', () => {
    var m = V.create(fakeStore());
    var seen = [];
    var off = m.subscribe(function (v) { seen.push(v); });
    m.setMuted(true);
    expect(m.getEffective()).toBe(0);
    off();
    m.toggleMute(); // back to unmuted, but unsubscribed
    expect(m.isMuted()).toBe(false);
    expect(seen).toEqual([0.8, 0]); // no event after unsubscribe
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- volume`
Expected: FAIL — cannot resolve `../assets/japanjunky-volume.js`.

- [ ] **Step 3: Write the implementation**

```js
// assets/japanjunky-volume.js
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

  function clamp01(v) {
    v = +v;
    if (!(v >= 0)) return 0; // NaN or < 0
    if (v > 1) return 1;
    return v;
  }

  function effective(level, muted) {
    return muted ? 0 : clamp01(level);
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
  var instance = create(ls);
  instance.clamp01 = clamp01;
  instance.effective = effective;
  instance.serialize = serialize;
  instance.parse = parse;
  instance.create = create;
  return instance;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- volume`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-volume.js tests/volume.test.js
git commit -m "feat(volume): JJ_Volume master volume manager + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Route media-player audio through the master volume

**Files:**
- Modify: `assets/japanjunky-player-audio.js`

No unit test — Web Audio / YouTube; verified in the Task 4 browser pass. Must not break `npm test`.

**Interfaces:**
- Consumes: `window.JJ_Volume` (Task 1).
- Produces: file + static playback routed through a module `masterGain` whose gain follows `JJ_Volume.getEffective()`; the active YouTube player's volume follows it via the YT API.

- [ ] **Step 1: Add module-level handles**

Near the top of the IIFE, after `var active = null;`, add:

```js
  var masterGain = null;
  var activeYT = null;
```

- [ ] **Step 2: Create the master gain in `getCtx`**

In `getCtx()`, after the context is created/obtained and before `return ctx;`, add:

```js
    if (ctx && !masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = window.JJ_Volume ? window.JJ_Volume.getEffective() : 1;
      masterGain.connect(ctx.destination);
    }
```

- [ ] **Step 3: Route the Web Audio paths through the master gain**

In `playFile`, change `chain.output.connect(c.destination);` to:

```js
    chain.output.connect(masterGain || c.destination);
```

In `playStatic`, change `chain.output.connect(trim); trim.connect(c.destination);` to:

```js
    chain.output.connect(trim); trim.connect(masterGain || c.destination);
```

(`playFile`'s catch-fallback calls `playStatic(c)`, which will use `masterGain` too — no change needed there.)

- [ ] **Step 4: Track + volume the YouTube player**

In `playYouTube`, set the active player and apply the current volume on ready, and clear it on stop. Replace the `active = { stop: ... }` block and the `onReady` handler so they read:

```js
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
```

- [ ] **Step 5: Subscribe to volume changes**

Just before `window.JJ_PlayerAudio = { play: play, stop: stop };` at the bottom, add:

```js
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
```

- [ ] **Step 6: Verify the suite still passes**

Run: `npm test`
Expected: PASS (no test changes; nothing regressed).

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-player-audio.js
git commit -m "feat(volume): master gain + YouTube volume follow JJ_Volume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Apply the master volume to Tsuno's voice clips

**Files:**
- Modify: `assets/japanjunky-tsuno-bubble.js`

No unit test — HTMLAudio/DOM; browser-verified. Must not break `npm test`.

**Interfaces:**
- Consumes: `window.JJ_Volume`, the existing `audio` (HTMLAudioElement) and `playAudio()` in this file.

- [ ] **Step 1: Set the clip volume before playing**

In `playAudio()`, immediately after `if (!audio || !audio.src) return;`, add:

```js
    try { audio.volume = window.JJ_Volume ? window.JJ_Volume.getEffective() : audio.volume; } catch (e) {}
```

- [ ] **Step 2: Subscribe so it updates live**

Right after the `audio` element is created (after the `try { audio = new Audio(); ... } catch (e) { audio = null; }` block), add:

```js
  if (window.JJ_Volume) {
    window.JJ_Volume.subscribe(function (v) {
      if (audio) { try { audio.volume = v; } catch (e) {} }
    });
  }
```

- [ ] **Step 3: Verify the suite still passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-tsuno-bubble.js
git commit -m "feat(volume): Tsuno voice clips follow JJ_Volume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Taskbar tray UI — speaker icon + Win98 popup

**Files:**
- Create: `snippets/win95-volume.liquid`
- Create: `assets/japanjunky-win95-volume.js`
- Modify: `assets/japanjunky-win95.css`
- Modify: `sections/jj-footer-win95.liquid`
- Modify: `layout/theme.liquid`

No unit test — DOM/CSS; browser-verified (Step 7 checklist). Must not break `npm test`.

**Interfaces:**
- Consumes: `window.JJ_Volume`.
- Produces: the tray DOM (`#jj-vol-btn`, `#jj-vol-popup`, `#jj-vol-slider`, `#jj-vol-mute-cb`) and the wiring that reads/writes `JJ_Volume`.

- [ ] **Step 1: Create the tray snippet**

```liquid
{%- comment -%} snippets/win95-volume.liquid — Win98 volume control for the taskbar tray. {%- endcomment -%}
<div class="jj-vol-tray" id="jj-vol-tray">
  <button type="button" class="jj-vol-btn" id="jj-vol-btn" aria-label="Volume" aria-expanded="false" aria-controls="jj-vol-popup">
    <span class="jj-vol-btn__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="13" height="13">
        <path fill="currentColor" d="M1 6 h3 l4 -3 v10 l-4 -3 H1 z"></path>
        <path class="jj-vol-wave" fill="none" stroke="currentColor" stroke-width="1.3" d="M10 5 a4 4 0 0 1 0 6"></path>
      </svg>
      <span class="jj-vol-btn__x" aria-hidden="true">×</span>
    </span>
  </button>
  <div class="jj-vol-popup" id="jj-vol-popup" role="dialog" aria-label="Volume" hidden>
    <input type="range" class="jj-vol-slider" id="jj-vol-slider" min="0" max="100" value="80" step="1" aria-label="Volume level">
    <label class="jj-vol-mute"><input type="checkbox" id="jj-vol-mute-cb"> Mute</label>
  </div>
</div>
```

- [ ] **Step 2: Render it before the clock**

In `sections/jj-footer-win95.liquid`, change the line `  {% render 'win95-clock' %}` to:

```liquid
  {% render 'win95-volume' %}
  {% render 'win95-clock' %}
```

- [ ] **Step 3: Add the CSS** (append to `assets/japanjunky-win95.css`)

```css
/* ── Taskbar volume control ─────────────────────────────────── */
.jj-vol-tray { position: relative; display: flex; align-items: center; }
.jj-vol-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 20px; margin: 0 2px; padding: 0;
  background: var(--jj-bg-elevated, #111); color: var(--jj-amber, #ffaa00);
  border: 0; cursor: pointer;
  box-shadow:
    inset 1px 1px 0 rgba(224, 213, 192, 0.22),
    inset -1px -1px 0 rgba(0, 0, 0, 0.85);
}
.jj-vol-btn:active,
.jj-vol-tray--open .jj-vol-btn {
  box-shadow:
    inset 1px 1px 0 rgba(0, 0, 0, 0.85),
    inset -1px -1px 0 rgba(224, 213, 192, 0.22);
}
.jj-vol-btn__icon { position: relative; display: flex; line-height: 0; }
.jj-vol-btn__x {
  display: none; position: absolute; inset: 0; align-items: center; justify-content: center;
  font: 12px/1 monospace; color: var(--jj-primary, #e8313a);
}
.jj-vol-btn--muted .jj-vol-wave { display: none; }
.jj-vol-btn--muted .jj-vol-btn__x { display: flex; }

.jj-vol-popup {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 8px 6px; z-index: 10001;
  background: var(--jj-bg-panel, #0a0a0a); color: var(--jj-white, #e0e0e0);
  font: 11px/1.4 monospace;
  box-shadow:
    inset 1px 1px 0 rgba(224, 213, 192, 0.22),
    inset -1px -1px 0 rgba(0, 0, 0, 0.85),
    0 2px 6px rgba(0, 0, 0, 0.6);
}
.jj-vol-popup[hidden] { display: none; }
.jj-vol-slider {
  -webkit-appearance: slider-vertical; appearance: slider-vertical;
  writing-mode: vertical-lr; direction: rtl;
  width: 18px; height: 90px; margin: 2px 0; accent-color: var(--jj-amber, #ffaa00);
}
.jj-vol-mute { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
```

(`accent-color` + `appearance: slider-vertical` gives a vertical native slider tinted to the palette; the bevel comes from the popup panel. No rounded corners are introduced — the global `border-radius: 0 !important` reset already applies.)

- [ ] **Step 4: Create the UI wiring**

```js
// assets/japanjunky-win95-volume.js
(function () {
  'use strict';
  var V = window.JJ_Volume;
  var tray = document.getElementById('jj-vol-tray');
  var btn = document.getElementById('jj-vol-btn');
  var popup = document.getElementById('jj-vol-popup');
  var slider = document.getElementById('jj-vol-slider');
  var muteCb = document.getElementById('jj-vol-mute-cb');
  if (!V || !tray || !btn || !popup || !slider || !muteCb) return;

  function syncUI() {
    slider.value = String(Math.round(V.getLevel() * 100));
    muteCb.checked = V.isMuted();
    var muted = V.isMuted() || V.getLevel() <= 0;
    btn.classList.toggle('jj-vol-btn--muted', muted); // CSS keys the × glyph off this
  }
  V.subscribe(function () { syncUI(); }); // also fires once immediately

  function open() { popup.hidden = false; tray.classList.add('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'true'); }
  function close() { popup.hidden = true; tray.classList.remove('jj-vol-tray--open'); btn.setAttribute('aria-expanded', 'false'); }

  btn.addEventListener('click', function (e) { e.stopPropagation(); if (popup.hidden) open(); else close(); });
  popup.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { if (!popup.hidden) close(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Escape' || e.keyCode === 27) && !popup.hidden) close(); });

  slider.addEventListener('input', function () { V.setLevel(parseInt(slider.value, 10) / 100); });
  muteCb.addEventListener('change', function () { V.setMuted(muteCb.checked); });
})();
```

- [ ] **Step 5: Load the scripts in the right order**

In `layout/theme.liquid`:
1. Add `japanjunky-volume.js` **before** the tsuno script (currently `<script src="{{ 'japanjunky-tsuno-bubble.js' | asset_url }}" defer></script>`):

```liquid
  <script src="{{ 'japanjunky-volume.js' | asset_url }}" defer></script>
```

2. Add the UI wiring after the taskbar menu script (`japanjunky-win95-menu.js`):

```liquid
  <script src="{{ 'japanjunky-win95-volume.js' | asset_url }}" defer></script>
```

(Deferred scripts run in document order after parse, so `volume.js` initializes `window.JJ_Volume` before `tsuno-bubble.js`, `player-audio.js`, and `win95-volume.js` use it, and the footer DOM exists when `win95-volume.js` runs.)

- [ ] **Step 6: Verify the suite still passes**

Run: `npm test`
Expected: PASS (no test changes).

- [ ] **Step 7: Manual browser regression (record results)**

- [ ] A speaker icon appears in the taskbar tray, just left of the clock, in the Win95 bevel style (no emoji).
- [ ] Clicking it opens a Win98 popup with a **vertical** slider + a "Mute" checkbox; clicking outside or pressing Escape closes it.
- [ ] Drag a record/cassette/CD onto a player and play audio (self-hosted `audio_url`): the slider changes its volume live; 0 = silent.
- [ ] Play a YouTube product: the slider changes the YouTube volume live.
- [ ] Trigger a Tsuno voice clip: it plays at the slider's level.
- [ ] Mute checkbox silences everything and the icon shows the muted (×) glyph; unmute restores the previous level.
- [ ] Reload / navigate to another page: the volume + mute state persist.
- [ ] No console errors.

- [ ] **Step 8: Commit**

```bash
git add snippets/win95-volume.liquid assets/japanjunky-win95-volume.js assets/japanjunky-win95.css sections/jj-footer-win95.liquid layout/theme.liquid
git commit -m "feat(volume): Win98 taskbar speaker icon + slider popup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** manager state + persistence + pub/sub + pure helpers (T1, tested); media-player master gain + YouTube volume (T2); Tsuno voice volume (T3); tray icon → vertical-slider popup + mute, CRT/no-emoji styling, footer placement, load order, persistence-across-pages (T4). Default 0.8, key `jj-volume`, guards, ranges — all in T1/Global Constraints. All covered.
- **Type/name consistency:** `getEffective/getLevel/isMuted/setLevel/setMuted/toggleMute/subscribe` + statics `clamp01/effective/serialize/parse/create` are used identically across T1 (def + tests), T2, T3, T4. Element ids (`jj-vol-btn/-popup/-slider/-mute-cb/-tray`) match between the snippet (T4.1) and the JS (T4.4). `masterGain`/`activeYT` names consistent within T2.
- **Placeholder scan:** every step has concrete code + expected output. No TBD/TODO.
