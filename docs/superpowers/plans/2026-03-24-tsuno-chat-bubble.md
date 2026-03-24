# Tsuno Daishi Chat Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated chat bubble to the Tsuno Daishi ghost that plays a greeting sequence on page load — types "いらっしゃいませ", scrambles to "Welcome!", plays audio, bounces Tsuno, then pixel-dissolves away.

**Architecture:** DOM overlay bubble inside the product zone, positioned near Tsuno. A JS IIFE drives a phase-based state machine (appear → type JP → hold → scramble → reveal EN → hold → dissolve). The screensaver's `updateTsuno()` gains a talk-bounce mode toggled via `JJ_Portal.setTalking()`. Audio is a placeholder `<audio>` element.

**Tech Stack:** Vanilla JS (IIFE), CSS animations, existing CRT animation system, `<audio>` element

**Spec:** `docs/superpowers/specs/2026-03-24-tsuno-chat-bubble-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `assets/japanjunky-tsuno-bubble.css` | Create | Bubble styling, speech tail, dissolve grid animation, reduced-motion/mobile overrides |
| `assets/japanjunky-tsuno-bubble.js` | Create | Phase state machine, scramble engine, dissolve builder, audio trigger, talk-bounce coordination |
| `assets/tsuno-irasshaimase.mp3` | Create | Placeholder silent audio (user replaces later) |
| `assets/japanjunky-screensaver.js` | Modify | Add `tsunoTalking` flag, lerped talk-bounce in `updateTsuno()`, expose `setTalking()` API |
| `layout/theme.liquid` | Modify | Add bubble markup, CSS link, JS script tag |

---

### Task 1: Add Talk Bounce to Screensaver

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (lines 446-456 — `updateTsuno()` idle branch; lines 810-827 — public API)

- [ ] **Step 1: Add talk state variables**

After the existing `var tsunoOrbitAngleOffset = 0;` line (~line 375), add:

```javascript
  // Talk-bounce state (controlled by bubble script via JJ_Portal.setTalking)
  var tsunoTalking = false;
  var tsunoTalkAmp = 0.15;   // current bob amplitude (lerps between 0.15 and 0.6)
  var tsunoTalkFreq = 0.5;   // current bob frequency (lerps between 0.5 and 6.0)
```

- [ ] **Step 2: Modify the idle branch in `updateTsuno()`**

Replace the idle bob line (line ~454):

```javascript
tsunoMesh.position.y = TSUNO_IDLE_POS.y + Math.sin(t * 0.5) * 0.15;
```

With lerped talk-bounce:

```javascript
      // Lerp bob params toward target
      var targetAmp = tsunoTalking ? 0.6 : 0.15;
      var targetFreq = tsunoTalking ? 6.0 : 0.5;
      var lerpRate = 1.0 - Math.pow(0.05, dt); // ~0.5s settle
      tsunoTalkAmp += (targetAmp - tsunoTalkAmp) * lerpRate;
      tsunoTalkFreq += (targetFreq - tsunoTalkFreq) * lerpRate;
      tsunoMesh.position.y = TSUNO_IDLE_POS.y + Math.sin(t * tsunoTalkFreq * 2 * Math.PI) * tsunoTalkAmp;
```

- [ ] **Step 3: Expose `setTalking` in the public API**

In the `window.JJ_Portal` object (line ~810), add after `setParallaxEnabled`:

```javascript
    setTalking: function (talking) {
      tsunoTalking = !!talking;
    }
```

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): add talk-bounce mode for Tsuno Daishi"
```

---

### Task 2: Create Bubble CSS

**Files:**
- Create: `assets/japanjunky-tsuno-bubble.css`

- [ ] **Step 1: Write the stylesheet**

```css
/* ============================================
   JAPANJUNKY TSUNO BUBBLE
   Chat bubble overlay for Tsuno Daishi greeting
   ============================================ */

.jj-tsuno-bubble {
  position: absolute;
  bottom: 55%;
  left: 45%;
  max-width: 200px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #333;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 14px;
  color: var(--jj-text, #e0d5c0);
  text-shadow: 0 0 6px rgba(224, 213, 192, 0.3);
  pointer-events: none;
  opacity: 0;
  white-space: nowrap;
}

/* Speech tail pointing left toward Tsuno */
.jj-tsuno-bubble::after {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: rgba(0, 0, 0, 0.85);
  border-left: none;
}

/* CRT-on entrance */
.jj-tsuno-bubble--entering {
  animation: jj-crt-on 0.4s ease-out forwards;
}

/* Pixel dissolve grid */
.jj-pixel-dissolve-grid {
  display: grid;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.jj-pixel-dissolve-grid > div {
  background: rgba(0, 0, 0, 0.85);
  animation: jj-pixel-dissolve 0.2s ease-in forwards;
  animation-delay: var(--d, 0ms);
}

@keyframes jj-pixel-dissolve {
  0%   { opacity: 1; transform: scale(1) translate(0, 0); }
  100% { opacity: 0; transform: scale(0) translate(var(--dx, 0px), var(--dy, 0px)); }
}

/* Hide speech tail during dissolve */
.jj-tsuno-bubble--dissolving::after { display: none; }

/* Mobile: hide bubble */
@media (max-width: 960px) {
  .jj-tsuno-bubble { display: none; }
}

/* Reduced motion: no animations */
@media (prefers-reduced-motion: reduce) {
  .jj-tsuno-bubble--entering { animation: none; opacity: 1; }
  .jj-pixel-dissolve-grid > div { animation: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-tsuno-bubble.css
git commit -m "feat(tsuno-bubble): add chat bubble stylesheet"
```

---

### Task 3: Create Bubble JavaScript

**Files:**
- Create: `assets/japanjunky-tsuno-bubble.js`

- [ ] **Step 1: Write the IIFE**

```javascript
/**
 * japanjunky-tsuno-bubble.js
 * Tsuno Daishi greeting chat bubble.
 * Phases: appear → type JP → hold → scramble → reveal EN → hold → dissolve
 *
 * Depends on: JJ_Portal (optional, for talk-bounce)
 * Listens:    jj:product-selected (early dissolve)
 */
(function () {
  'use strict';

  // ─── Guard: need screensaver canvas in DOM ──────────────────
  var ssCanvas = document.getElementById('jj-screensaver') ||
                 document.getElementById('jj-screensaver-display');
  if (!ssCanvas) return;

  var bubble = document.getElementById('jj-tsuno-bubble');
  if (!bubble) return;

  var textEl = bubble.querySelector('.jj-tsuno-bubble__text');
  if (!textEl) return;

  // ─── Config ─────────────────────────────────────────────────
  var JP_TEXT = 'いらっしゃいませ';
  var EN_TEXT = 'Welcome!';
  var GLITCH_CHARS = '\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789';
  var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var phase = 'waiting'; // waiting|appear|typeJP|holdJP|scramble|revealEN|holdEN|dissolve|done
  var timer = null;
  var frameInterval = null;
  var dissolved = false;

  // ─── Portal helpers (graceful if unavailable) ───────────────
  function setTalking(val) {
    if (window.JJ_Portal && window.JJ_Portal.setTalking) {
      window.JJ_Portal.setTalking(val);
    }
  }

  // ─── Audio ──────────────────────────────────────────────────
  var audio = null;
  try {
    audio = new Audio();
    audio.src = bubble.getAttribute('data-audio-src') || '';
    audio.preload = 'auto';
  } catch (e) { audio = null; }

  function playAudio() {
    if (!audio || !audio.src) return;
    try { audio.play().catch(function () {}); } catch (e) { /* autoplay blocked */ }
  }

  // ─── Typewriter (jittered, same style as product viewer) ────
  function typeText(text, msPerChar, cb) {
    var idx = 0;
    textEl.textContent = '';
    function tick() {
      if (phase === 'done' || dissolved) return;
      if (idx < text.length) {
        idx++;
        textEl.textContent = text.substring(0, idx);
        var jitter = msPerChar * (0.6 + Math.random() * 0.8);
        timer = setTimeout(tick, jitter);
      } else {
        if (cb) cb();
      }
    }
    tick();
  }

  // ─── Scramble → Reveal (per-character, staggered settle) ────
  function scrambleToReveal(fromText, toText, cb) {
    var len = Math.max(fromText.length, toText.length);
    var settled = [];
    for (var si = 0; si < len; si++) settled.push(false);
    var settleOrder = [];
    for (var i = 0; i < len; i++) settleOrder.push(i);
    // Settle left-to-right with small random variance
    var nextSettle = 0;
    var totalFrames = 0;
    var scrambleFrames = 8;  // ~400ms of pure scramble before first settle
    var settlePause = 1;     // frames between each character settling (~60ms at 50ms/frame)
    var framesSinceLastSettle = 0;

    frameInterval = setInterval(function () {
      if (phase === 'done' || dissolved) {
        clearInterval(frameInterval);
        frameInterval = null;
        return;
      }

      totalFrames++;

      // Build display string
      var display = '';
      for (var c = 0; c < len; c++) {
        if (settled[c]) {
          display += toText[c] || '';
        } else {
          display += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
      }
      textEl.textContent = display;

      // After initial scramble period, start settling characters
      if (totalFrames > scrambleFrames) {
        framesSinceLastSettle++;
        if (framesSinceLastSettle >= settlePause && nextSettle < len) {
          settled[settleOrder[nextSettle]] = true;
          nextSettle++;
          framesSinceLastSettle = 0;
        }
      }

      // All settled
      if (nextSettle >= len) {
        clearInterval(frameInterval);
        frameInterval = null;
        textEl.textContent = toText;
        if (cb) cb();
      }
    }, 50);
  }

  // ─── Pixel Dissolve ─────────────────────────────────────────
  function dissolve() {
    if (dissolved) return;
    dissolved = true;
    clearTimers();
    setTalking(false);

    // Get bubble dimensions
    var rect = bubble.getBoundingClientRect();
    var cellSize = 6;
    var cols = Math.ceil(rect.width / cellSize);
    var rows = Math.ceil(rect.height / cellSize);

    // Hide original content, speech tail, and border
    textEl.style.visibility = 'hidden';
    bubble.style.border = 'none';
    bubble.classList.add('jj-tsuno-bubble--dissolving');

    // Build grid
    var grid = document.createElement('div');
    grid.className = 'jj-pixel-dissolve-grid';
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';

    for (var i = 0; i < cols * rows; i++) {
      var cell = document.createElement('div');
      cell.style.setProperty('--d', Math.floor(Math.random() * 300) + 'ms');
      cell.style.setProperty('--dx', (Math.random() * 16 - 8) + 'px');
      cell.style.setProperty('--dy', (Math.random() * 16 - 8) + 'px');
      grid.appendChild(cell);
    }

    bubble.appendChild(grid);

    // Remove bubble after animation completes
    setTimeout(function () {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 550);
  }

  // ─── Phase Machine ──────────────────────────────────────────
  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (frameInterval) { clearInterval(frameInterval); frameInterval = null; }
    if (rmFadeTimer) { clearTimeout(rmFadeTimer); rmFadeTimer = null; }
  }

  function runPhase(newPhase) {
    if (dissolved) return;
    phase = newPhase;

    switch (phase) {
      case 'appear':
        bubble.classList.add('jj-tsuno-bubble--entering');
        setTalking(true);
        playAudio();
        timer = setTimeout(function () { runPhase('typeJP'); }, 400);
        break;

      case 'typeJP':
        typeText(JP_TEXT, 80, function () {
          runPhase('holdJP');
        });
        break;

      case 'holdJP':
        timer = setTimeout(function () { runPhase('scramble'); }, 1500);
        break;

      case 'scramble':
        scrambleToReveal(JP_TEXT, EN_TEXT, function () {
          runPhase('holdEN');
        });
        break;

      case 'holdEN':
        setTalking(false);
        timer = setTimeout(function () { runPhase('dissolve'); }, 3000);
        break;

      case 'dissolve':
        dissolve();
        break;
    }
  }

  // ─── Reduced Motion Path ────────────────────────────────────
  var rmFadeTimer = null;
  function runReducedMotion() {
    textEl.textContent = EN_TEXT;
    bubble.style.opacity = '1';
    timer = setTimeout(function () {
      bubble.style.transition = 'opacity 0.5s';
      bubble.style.opacity = '0';
      rmFadeTimer = setTimeout(function () {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      }, 600);
    }, 3000);
  }

  // ─── Early dissolve on product select ───────────────────────
  document.addEventListener('jj:product-selected', function () {
    if (phase !== 'done' && !dissolved) {
      dissolve();
    }
  });

  // ─── Init ───────────────────────────────────────────────────
  if (REDUCED_MOTION) {
    timer = setTimeout(runReducedMotion, 1500);
  } else {
    timer = setTimeout(function () { runPhase('appear'); }, 1500);
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-tsuno-bubble.js
git commit -m "feat(tsuno-bubble): add chat bubble greeting sequence"
```

---

### Task 4: Create Placeholder Audio

**Files:**
- Create: `assets/tsuno-irasshaimase.mp3`

- [ ] **Step 1: Generate a minimal silent MP3 placeholder**

Use `ffmpeg` to create a 1-second silent MP3:

```bash
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 "assets/tsuno-irasshaimase.mp3"
```

If `ffmpeg` is not available, create an empty file as a placeholder — the JS gracefully handles missing/broken audio:

```bash
echo "" > assets/tsuno-irasshaimase.mp3
```

- [ ] **Step 2: Commit**

```bash
git add assets/tsuno-irasshaimase.mp3
git commit -m "feat(tsuno-bubble): add placeholder audio asset"
```

---

### Task 5: Wire Into Theme Layout

**Files:**
- Modify: `layout/theme.liquid` (lines 33-34 for CSS, lines 134-149 for markup, lines 200-204 for script)

- [ ] **Step 1: Add CSS link**

After the `japanjunky-product-info.css` line (~line 33), add:

```liquid
  {{ 'japanjunky-tsuno-bubble.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 2: Add bubble markup inside product zone**

Inside `jj-product-zone` (after the `jj-product-info` div closing tag, before `</div>` on ~line 149), add:

```liquid
    {%- comment -%} Tsuno Daishi greeting bubble {%- endcomment -%}
    <div id="jj-tsuno-bubble" class="jj-tsuno-bubble" aria-hidden="true"
         data-audio-src="{{ 'tsuno-irasshaimase.mp3' | asset_url }}">
      <span class="jj-tsuno-bubble__text"></span>
    </div>
```

- [ ] **Step 3: Add script tag**

After the `japanjunky-product-viewer.js` script tag (~line 204), add:

```liquid
  <script src="{{ 'japanjunky-tsuno-bubble.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(tsuno-bubble): wire bubble markup, CSS, and JS into theme"
```

---

### Task 6: Test and Tune

- [ ] **Step 1: Deploy and verify full sequence**

Load the site fresh. Verify:
1. Bubble appears ~1.5s after load with CRT-on flash
2. "いらっしゃいませ" types character-by-character with jitter
3. Tsuno bounces rapidly during typing/scramble
4. Characters scramble through glitch chars then settle to "Welcome!" left-to-right
5. Tsuno calms back to gentle bob
6. After 3s hold, bubble pixel-dissolves away
7. No console errors

- [ ] **Step 2: Test edge cases**

1. Select a product mid-sequence — bubble should dissolve immediately
2. Resize to mobile (<=960px) — bubble should be hidden
3. Check `prefers-reduced-motion` — should show static "Welcome!" then fade

- [ ] **Step 3: Tune bubble position**

Adjust `.jj-tsuno-bubble` `bottom` and `left` percentages in the CSS to align with Tsuno's rendered screen position. The product zone is `24vw` wide, fixed top-left.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(tsuno-bubble): tune positioning and finalize"
```
