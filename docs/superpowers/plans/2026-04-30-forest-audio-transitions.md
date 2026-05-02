# Forest — Audio + Page Transitions Implementation Plan (Sub-Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ambient forest audio bed + interaction accent sounds, plus a same-origin click interceptor that flashes an amber wash overlay before page navigation (hides reload jank).

**Architecture:** New `assets/japanjunky-audio.js` exposes `window.JJ_Audio` global with WebAudio bed/accent buses, lazy-loaded after first user gesture (browser autoplay policy). Same-origin link interceptor lives inline in `theme.liquid` snippet — adds 200ms amber wash + CRT roll before `window.location` change.

**Tech Stack:** WebAudio API, vanilla ES5 IIFE, CSS animations, Liquid (Shopify theme).

**Spec:** `docs/superpowers/specs/2026-04-30-forest-splash-design.md` (Sections 7, 10).

**Prerequisite:** Sub-plan 1 (forest baseline) merged.

**Sub-plan scope:**
- ✅ `japanjunky-audio.js` module (WebAudio wrapper)
- ✅ Audio asset list + sourcing template
- ✅ Ambient bed loader + fade-in
- ✅ Accent trigger map (Tsuno events, ring carousel, nav, etc.)
- ✅ Spatial panning for scene-positioned accents
- ✅ Mute UI in taskbar
- ✅ Page transition flash overlay (same-origin link interceptor)
- ✅ Reduced-motion + battery-aware mute
- ❌ Tsuno forest drift (sub-plan 2)

---

## Phase 1 — Audio Asset Sourcing

### Task 1: Source audio assets

**Files:**
- Create directory: `assets/sounds/`
- Create: `assets/sounds/SOURCES.md` (provenance log)

This is a manual sourcing task — must be CC0/CC-BY/PD. Track license per file.

- [ ] **Step 1:** Create directory.

```bash
mkdir -p assets/sounds
```

- [ ] **Step 2:** Source audio files. Recommended: Freesound (filter CC0), Pixabay Music (CC0).

| Filename | What | Length | Notes |
|----------|------|--------|-------|
| `ambient_forest.ogg` | Wind through cedars + cicada/bird + dripping water + creak | ~40s seamless loop | -24 LUFS |
| `accent_chime.ogg` | Soft wood-block + wind bell | ~1.2s | bright but soft |
| `accent_paper.ogg` | Paper rustle (shide) | ~0.6s | crisp |
| `accent_stone.ogg` | Dry stone tap | ~0.4s | percussive |
| `accent_bell.ogg` | Distant temple bell | ~2.0s | reverberant |
| `accent_step.ogg` | Gravel/needle crunch | ~0.3s | gritty |
| `accent_tsuno.ogg` | Breathy whisper | ~0.8s | unsettling |

Save into `assets/sounds/`.

- [ ] **Step 3:** Write `assets/sounds/SOURCES.md`:

```markdown
# Audio Sources

| File                  | Source URL          | License | Author     |
|-----------------------|---------------------|---------|------------|
| ambient_forest.ogg    |                     |         |            |
| accent_chime.ogg      |                     |         |            |
| accent_paper.ogg      |                     |         |            |
| accent_stone.ogg      |                     |         |            |
| accent_bell.ogg       |                     |         |            |
| accent_step.ogg       |                     |         |            |
| accent_tsuno.ogg      |                     |         |            |
```

- [ ] **Step 4:** Commit license tracking + audio:

```bash
git add assets/sounds/
git commit -m "feat(audio): source CC-licensed forest audio bed + accents"
```

---

## Phase 2 — Audio Module

### Task 2: Create `assets/japanjunky-audio.js` skeleton

**Files:**
- Create: `assets/japanjunky-audio.js`

- [ ] **Step 1:** Create module skeleton:

```javascript
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

  // ─── Persisted state ───────────────────────────────────────
  function readMuted() {
    try { return localStorage.getItem('jj-audio-muted') !== 'false'; } catch (e) { return true; }
  }
  function writeMuted(v) {
    try { localStorage.setItem('jj-audio-muted', String(!!v)); } catch (e) {}
  }
  var muted = readMuted();

  // ─── Lazy state ────────────────────────────────────────────
  var ctx = null;
  var masterGain = null;
  var ambientBus = null;
  var accentBus = null;
  var ambientBuffer = null;
  var ambientSource = null;
  var accentBuffers = {};
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    ambientBus.gain.value = 0.0; // start silent (fade in on play)
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
    if (ambientBuffer) return; // already loaded
    loadBuffer(ASSET_BASE + AMBIENT_FILE, function (buf) {
      ambientBuffer = buf;
      if (!muted && buf) startAmbient();
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
    if (!ctx || !ambientBuffer || muted) return;
    if (ambientSource) return; // already playing
    ambientSource = ctx.createBufferSource();
    ambientSource.buffer = ambientBuffer;
    ambientSource.loop = true;
    ambientSource.connect(ambientBus);
    ambientSource.start(0);
    // Fade in 3s
    var now = ctx.currentTime;
    ambientBus.gain.cancelScheduledValues(now);
    ambientBus.gain.setValueAtTime(0, now);
    ambientBus.gain.linearRampToValueAtTime(0.3, now + 3);
  }
  function stopAmbient() {
    if (!ambientSource) return;
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
    if (prefersReducedMotion && opts && opts.skipOnReducedMotion) return;
    var buf = accentBuffers[name];
    if (!buf) return;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var pitch = (opts && opts.pitch) || 1.0;
    src.playbackRate.value = pitch;
    var dest = accentBus;
    if (opts && typeof opts.panX === 'number') {
      var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, opts.panX));
        src.connect(panner);
        panner.connect(accentBus);
        src.start(0);
        return;
      }
    }
    src.connect(dest);
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

  window.JJ_Audio = {
    playAccent: playAccent,
    setMuted: setMuted,
    isMuted: isMuted,
    unlock: unlock
  };
})();
```

- [ ] **Step 2:** Validate JS:

```bash
node -c assets/japanjunky-audio.js
```

- [ ] **Step 3:** Commit:

```bash
git add assets/japanjunky-audio.js
git commit -m "feat(audio): add JJ_Audio module with WebAudio bed + accents"
```

---

### Task 3: Wire audio module in theme.liquid

**Files:**
- Modify: `layout/theme.liquid`

- [ ] **Step 1:** Add asset base config + script tag. Find the `JJ_SCREENSAVER_CONFIG` block and add a separate `JJ_AUDIO_CONFIG`:

```liquid
  <script>
    window.JJ_AUDIO_CONFIG = {
      assetBase: "{{ 'placeholder.txt' | asset_url | replace: 'placeholder.txt', '' }}",
      enabled: {{ settings.audio_enabled | default: true }}
    };
  </script>
```

(The replace trick produces the asset URL prefix without a specific filename — Shopify's `asset_url` always needs a filename.)

- [ ] **Step 2:** After the existing screensaver script tag, add audio script (only when enabled):

```liquid
  {% if settings.audio_enabled %}
  <script src="{{ 'japanjunky-audio.js' | asset_url }}" defer></script>
  {% endif %}
```

- [ ] **Step 3:** Commit:

```bash
git add layout/theme.liquid
git commit -m "feat(theme): wire japanjunky-audio.js with config block"
```

---

## Phase 3 — Accent Trigger Wiring

### Task 4: Trigger map in screensaver.js + tsuno-bubble + ring-carousel

**Files:**
- Modify: `assets/japanjunky-screensaver.js`
- Modify: `assets/japanjunky-ring-carousel.js`
- Modify: `assets/japanjunky-tsuno-bubble.js`

Wire `window.JJ_Audio.playAccent(...)` calls at key event points.

- [ ] **Step 1:** In `screensaver.js`, find Tsuno appearance/state-change points and add accent triggers. Search for `tsunoState` transitions, `triggerTsunoGrab`, behavior-change spots:

For Tsuno appearance / PEEK behavior start (around the call to `startBehavior(t, behaviorIdx)` when behaviorIdx is `peek` or transitioning):

```javascript
    if (window.JJ_Audio && tsunoMesh) {
      var pitch = 0.95 + Math.random() * 0.1;
      // Pan based on Tsuno's screen X
      var panX = Math.max(-1, Math.min(1, tsunoMesh.position.x / 5));
      window.JJ_Audio.playAccent('tsuno', { pitch: pitch, panX: panX });
    }
```

For PERCH on shrine (behaviorIdx === 4):

```javascript
    if (window.JJ_Audio) window.JJ_Audio.playAccent('stone');
```

For CONTEMPLATE start (behaviorIdx === 8) — 10% chance:

```javascript
    if (window.JJ_Audio && Math.random() < 0.1) window.JJ_Audio.playAccent('chime');
```

(Add these inside `startBehavior` after the behavior is determined.)

- [ ] **Step 2:** In `assets/japanjunky-ring-carousel.js`, find hover and click handlers for ring items. Add accents:

```javascript
// On hover (debounce so it doesn't fire on rapid mouseover)
function onItemHover() {
  if (window.JJ_Audio) window.JJ_Audio.playAccent('paper');
}
// On click
function onItemClick() {
  if (window.JJ_Audio) window.JJ_Audio.playAccent('stone');
}
```

(Wire these into existing handlers — exact integration depends on the ring carousel's current event setup. Read the file first to find the right hooks.)

- [ ] **Step 3:** Add-to-cart accent. Find where the cart "add" event fires (check for `dispatchEvent` or fetch to `/cart/add`). Add:

```javascript
if (window.JJ_Audio) window.JJ_Audio.playAccent('bell');
```

- [ ] **Step 4:** Commit:

```bash
git add assets/japanjunky-screensaver.js assets/japanjunky-ring-carousel.js
git commit -m "feat(audio): wire accent triggers across Tsuno + ring carousel + cart"
```

---

## Phase 4 — Mute UI

### Task 5: Add mute toggle to taskbar

**Files:**
- Modify: `snippets/win95-taskbar.liquid` (or wherever taskbar lives — find via grep)
- Modify: `assets/japanjunky-win95.css` (taskbar styles)

- [ ] **Step 1:** Locate the taskbar snippet:

```bash
grep -rln "win95-taskbar\|jj-taskbar" snippets/ sections/
```

- [ ] **Step 2:** Add a mute button to the taskbar HTML:

```liquid
<button id="jj-audio-mute" class="jj-taskbar__audio-toggle" type="button"
        aria-label="Toggle ambient audio">
  <span class="jj-audio-icon" data-state="muted">🔇</span>
</button>
```

- [ ] **Step 3:** Add CSS in `assets/japanjunky-win95.css` (or a new taskbar file):

```css
.jj-taskbar__audio-toggle {
  background: none;
  border: 1px solid var(--jj-secondary, #888);
  color: var(--jj-text, #e0d5c0);
  font-size: 14px;
  padding: 2px 6px;
  cursor: pointer;
  font-family: inherit;
}
.jj-taskbar__audio-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}
```

- [ ] **Step 4:** Add JS to wire the toggle. Place in `assets/japanjunky-audio.js` at the bottom (before `window.JJ_Audio = ...`):

```javascript
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
```

- [ ] **Step 5:** Smoke-test: load site, click mute button. Expected: icon flips between 🔇 and 🔊. After unmuting (and after first user gesture), ambient bed fades in.

- [ ] **Step 6:** Commit:

```bash
git add assets/japanjunky-audio.js assets/japanjunky-win95.css snippets/
git commit -m "feat(audio): add mute toggle to taskbar"
```

---

## Phase 5 — Page Transition Flash

### Task 6: Amber wash overlay CSS

**Files:**
- Modify: `assets/japanjunky-transitions.css` (existing) or new file

- [ ] **Step 1:** Open existing transitions CSS and add a wash overlay rule:

```css
/* Forest scene → page nav transition (sub-plan 3) */
.jj-page-flash {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: rgba(196, 106, 40, 0);
  transition: background-color 200ms ease-in;
}
.jj-page-flash--active {
  background: rgba(196, 106, 40, 0.85);
}
.jj-page-flash--active::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 3px
  );
  animation: jj-crt-roll 80ms linear infinite;
}
@keyframes jj-crt-roll {
  from { background-position-y: 0; }
  to   { background-position-y: 3px; }
}
@media (prefers-reduced-motion: reduce) {
  .jj-page-flash {
    transition: none;
  }
}
```

- [ ] **Step 2:** Commit:

```bash
git add assets/japanjunky-transitions.css
git commit -m "feat(transitions): add amber-wash page flash overlay"
```

---

### Task 7: Same-origin link interceptor

**Files:**
- Create: `assets/japanjunky-nav-flash.js`
- Modify: `layout/theme.liquid` (script tag)

- [ ] **Step 1:** Create the interceptor module:

```javascript
/**
 * JapanJunky Nav Flash — Same-origin click interceptor.
 * Adds a brief amber wash before navigation to hide reload jank.
 *
 * Skips for: external links, target=_blank, ctrl/cmd-click, anchor #fragments,
 * download attribute, javascript: links, prefers-reduced-motion.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  function ensureOverlay() {
    var el = document.getElementById('jj-page-flash');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'jj-page-flash';
    el.className = 'jj-page-flash';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  function shouldIntercept(a, ev) {
    if (!a || !a.href) return false;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.hasAttribute('data-no-flash')) return false;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (e) { return false; }
    if (url.protocol !== window.location.protocol) return false;
    if (url.hostname !== window.location.hostname) return false;
    if (url.pathname === window.location.pathname && url.hash) return false; // anchor jump
    return true;
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    while (t && t.nodeType === 1 && t.tagName !== 'A') t = t.parentNode;
    if (!t || t.tagName !== 'A') return;
    if (!shouldIntercept(t, ev)) return;

    ev.preventDefault();

    var overlay = ensureOverlay();
    overlay.classList.add('jj-page-flash--active');

    if (window.JJ_Audio) window.JJ_Audio.playAccent('chime');

    setTimeout(function () {
      window.location = t.href;
    }, 200);
  }, true);
})();
```

- [ ] **Step 2:** Add script tag in `layout/theme.liquid`:

```liquid
  {% if settings.scene_mode != 'portal' %}
  <script src="{{ 'japanjunky-nav-flash.js' | asset_url }}" defer></script>
  {% endif %}
```

(Place near the other nav-related scripts, after audio module so the chime call works.)

- [ ] **Step 3:** Smoke-test: click any internal link. Expected: 200ms amber wash + chime, then navigation. External links + ctrl-click + anchor links work normally.

- [ ] **Step 4:** Commit:

```bash
git add assets/japanjunky-nav-flash.js layout/theme.liquid
git commit -m "feat(transitions): add same-origin nav flash interceptor"
```

---

## Phase 6 — Reduced Motion + Battery Awareness

### Task 8: Reduced-motion behavior

**Files:**
- Modify: `assets/japanjunky-audio.js`

`prefersReducedMotion` already disables nav flash entirely (Task 7 Step 1). Now make audio respect it too — default mute, accents only.

- [ ] **Step 1:** In `japanjunky-audio.js`, modify the initial `muted` value:

```javascript
  var muted = readMuted();
  // Reduced motion: default mute (override only if user explicitly unmuted)
  if (prefersReducedMotion) {
    var stored = null;
    try { stored = localStorage.getItem('jj-audio-muted'); } catch (e) {}
    if (stored === null) muted = true;
  }
```

- [ ] **Step 2:** In `playAccent`, allow accents but suppress ambient when reduced-motion is on:

```javascript
  function startAmbient() {
    if (!ctx || !ambientBuffer || muted || prefersReducedMotion) return;
    // ... rest unchanged ...
  }
```

- [ ] **Step 3:** Commit:

```bash
git add assets/japanjunky-audio.js
git commit -m "feat(audio): respect prefers-reduced-motion for ambient bed"
```

---

### Task 9: Battery-aware audio disable

**Files:**
- Modify: `assets/japanjunky-audio.js`

When battery < 20% and not charging, mute ambient automatically.

- [ ] **Step 1:** At the bottom of `japanjunky-audio.js` (before `window.JJ_Audio = ...`), add battery hook:

```javascript
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
```

- [ ] **Step 2:** Commit:

```bash
git add assets/japanjunky-audio.js
git commit -m "feat(audio): mute ambient on low battery"
```

---

## Phase 7 — Mobile Audio Default

### Task 10: Mobile defaults to ambient-off

**Files:**
- Modify: `assets/japanjunky-audio.js`

Per spec Section 9: ambient bed disabled by default on mobile (battery + autoplay). Accents still play on tap.

- [ ] **Step 1:** Add mobile detection at the top of the IIFE in `japanjunky-audio.js`:

```javascript
  var isMobile = (
    /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    window.innerWidth < 768
  );
```

- [ ] **Step 2:** Override `muted` default for mobile if not previously set:

```javascript
  var muted = readMuted();
  if (prefersReducedMotion) {
    var stored1 = null;
    try { stored1 = localStorage.getItem('jj-audio-muted'); } catch (e) {}
    if (stored1 === null) muted = true;
  }
  if (isMobile) {
    var stored2 = null;
    try { stored2 = localStorage.getItem('jj-audio-muted'); } catch (e) {}
    if (stored2 === null) muted = true;
  }
```

- [ ] **Step 3:** Commit:

```bash
git add assets/japanjunky-audio.js
git commit -m "feat(audio): default ambient off on mobile (battery + autoplay)"
```

---

## Phase 8 — Smoke Test

### Task 11: End-to-end audio + transition test

**Files:** None new — verifies prior tasks.

- [ ] **Step 1:** Clear localStorage, reload site:

```javascript
localStorage.clear();
location.reload();
```

- [ ] **Step 2:** Verify checklist:

1. Site loads silently (default-muted).
2. Click mute toggle in taskbar — icon flips to 🔊, ambient forest bed fades in over 3s.
3. Click another mute toggle — icon flips back to 🔇, ambient fades out.
4. Click a ring carousel item — accent paper sound plays.
5. Click an internal link — 200ms amber wash + chime, then navigation.
6. Click an external link or ctrl-click an internal link — no flash, normal behavior.
7. Add to cart — bell accent.
8. Wait for Tsuno to start drifting (forest mode home preset) — peek/perch/contemplate accents play sporadically.
9. Toggle browser to reduced-motion mode — flash skipped, ambient stays muted by default.
10. Throttle CPU — flash still works, ambient still plays (audio is independent of frame rate).

- [ ] **Step 3:** Final commit (milestone marker):

```bash
git commit --allow-empty -m "feat(audio): forest audio + transitions complete (sub-plan 3)"
```

---

## File Summary

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `assets/japanjunky-audio.js` | WebAudio wrapper, ambient bed, accent triggers, mute UI | ~250 |
| `assets/japanjunky-nav-flash.js` | Same-origin link interceptor + amber wash trigger | ~60 |
| `assets/sounds/ambient_forest.ogg` | Ambient loop | — |
| `assets/sounds/accent_*.ogg` | 6 accent sounds | — |
| `assets/sounds/SOURCES.md` | License provenance | — |

### Modified Files

| File | Changes |
|------|---------|
| `assets/japanjunky-screensaver.js` | Wire accent triggers at Tsuno behavior transitions |
| `assets/japanjunky-ring-carousel.js` | Wire paper/stone accents on hover/click |
| `assets/japanjunky-transitions.css` | Add `.jj-page-flash` overlay rule + CRT roll keyframe |
| `assets/japanjunky-win95.css` | Add `.jj-taskbar__audio-toggle` styles |
| `layout/theme.liquid` | `JJ_AUDIO_CONFIG` block, audio + nav-flash script tags |
| `snippets/win95-taskbar.liquid` (or eq.) | Add mute toggle button |

### Unchanged

- Forest module (no changes needed for audio).
- Tsuno code structure (only adds accent calls at existing transition points).
- All other site systems.

---

## All Three Sub-Plans — Final Roll-up

| Sub-plan | Scope | Status |
|----------|-------|--------|
| 1: Forest Baseline | Module, geometry, shaders, perf tiers, splash sequence | Implemented (Phases 1-7) — Phases 8-9 (splash, smoke) pending |
| 2: Tsuno Forest Drift | Anchor exposure, anchor-aware behaviors, Hermite paths, new states | Plan written |
| 3: Audio + Transitions | WebAudio module, accent triggers, page flash, mute UI | Plan written |
