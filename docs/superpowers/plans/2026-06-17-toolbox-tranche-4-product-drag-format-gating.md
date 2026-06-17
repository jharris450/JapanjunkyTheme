# Toolbox Media Players — Tranche 4: Product Drag + Format Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user hold-drag a product (from a grid card or the product page) onto the spawned player; a cursor ghost follows the drag, and dropping on the player runs a format gate (record→record player, cassette→cassette Walkman, CD→CD Walkman) with accept or reject feedback. Audio is stubbed — Tranche 5 wires real playback into the accept path.

**Architecture:** A small UMD module (`japanjunky-media-format.js`) provides the testable `normalizeFormat`/`matchesPlayer` logic (mirrors the Liquid normalization). `japanjunky-media-drag.js` detects a hold-drag on grid cards and the PDP info column, shows a placeholder ghost, hit-tests the player's screen rect on release, and calls the player. `japanjunky-player.js` gains `getRect()` and `tryLoadProduct(product)` (format gate + accept/reject visual feedback; audio is a stub). The 3D ghost visuals (record disc reuse + cassette/CD models) are deferred to the Tranche 3 model work — this tranche uses a CSS placeholder ghost, like the placeholder player box from Tranche 2.

**Tech Stack:** Vanilla ES5-style JS (no build step; UMD for the testable module), Vitest (already set up) for `normalizeFormat`/`matchesPlayer`, CSS in `japanjunky-win95.css`.

**Verified facts:**
- Grid card (`assets/japanjunky-product-grid.js:402-520`): each card is an `<a class="jj-grid__card" href="/products/HANDLE" data-format="record|cassette|cd|...">`. It contains `.jj-grid__card-title`, condition chips `.jj-grid__card-cond-chip` (spans, `role=radio`, own click + stopPropagation), and an add button `.jj-grid__card-add` (`<button>`, own click + stopPropagation). Cards are re-created on filter/sort, so drag detection must be **delegated**, not bound per-card.
- PDP (`sections/jj-product.liquid`): `window.JJ_PRODUCT_DATA` has `formatLabel` (raw metafield string) and `title`, but **no normalized `format`**. The info column is `#jj-pdp-info` (contains title/artist/meta/variant buttons `.jj-pdp-variant-btn`, cart form `#jj-pdp-cart-form`, back link `.jj-pdp-back`, thumbs `.jj-pdp-thumb`). The 3D viewer canvas is separate (`#jj-pdp-viewer-canvas`) and owns its own rotate-drag — do NOT use it as a drag source.
- Player (`assets/japanjunky-player.js`): IIFE exposing `window.JJ_Player = { spawn, despawn, getType }`. Internals: `el` (the container), `body`, `currentTool`, `startLoop()`. Position is driven by `el.style.transform = translate(...)` every physics frame — so accept/reject animations must NOT use `transform`.
- Liquid format normalization (`snippets/jj-product-json.liquid:22-34`): vinyl/lp/record→record; cd/compact disc→cd; cassette/tape→cassette; minidisc/mini disc/md→minidisc; hardware/player/walkman/stereo→hardware; else ''.
- `html { zoom: 2.5 }` — pointer `clientX/Y` and `innerWidth` are visual px; element `getBoundingClientRect()` is also visual px (so hit-testing pointer-vs-rect needs NO zoom conversion); CSS `transform` translate values are layout px (so positioning the ghost at the cursor needs `clientX/zoom`).
- Scripts load at end of `layout/theme.liquid`; current order ends `...toolbox.js`, `...player-physics.js`, `...player.js`.
- Vitest: `npm test`, config `vitest.config.js` (Node env, `tests/**/*.test.js`).

---

## File Structure

- **Create:** `assets/japanjunky-media-format.js` — UMD: `normalizeFormat(raw)`, `matchesPlayer(playerType, productFormat)`. Testable; no DOM.
- **Create:** `tests/media-format.test.js` — unit tests for the above.
- **Create:** `assets/japanjunky-media-drag.js` — delegated hold-drag detection (grid cards + PDP info), placeholder ghost, drop hit-test, click suppression.
- **Modify:** `assets/japanjunky-player.js` — add `getRect()` and `tryLoadProduct(product)` + accept/reject feedback; expose both on `window.JJ_Player`.
- **Modify:** `assets/japanjunky-win95.css` — append `.jj-media-ghost` styles and `.jj-player--accept` / `.jj-player--reject` feedback.
- **Modify:** `layout/theme.liquid` — load `japanjunky-media-format.js` then `japanjunky-media-drag.js`.

**Out of scope (later tranches):** real 3D ghost graphics + real player models (Tranche 3), actual audio playback / distortion / static / metafields (Tranche 5). In this tranche, accept = visual confirm (audio stubbed), reject = shove + flash.

---

### Task 1: Media-format module (TDD)

**Files:**
- Create: `tests/media-format.test.js`
- Create: `assets/japanjunky-media-format.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/media-format.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import MF from '../assets/japanjunky-media-format.js';

describe('normalizeFormat', () => {
  it('maps vinyl / lp / record to record', () => {
    expect(MF.normalizeFormat('Vinyl')).toBe('record');
    expect(MF.normalizeFormat('LP')).toBe('record');
    expect(MF.normalizeFormat('Record')).toBe('record');
    expect(MF.normalizeFormat('record')).toBe('record');
  });
  it('maps cd / compact disc to cd', () => {
    expect(MF.normalizeFormat('CD')).toBe('cd');
    expect(MF.normalizeFormat('Compact Disc')).toBe('cd');
  });
  it('maps cassette / tape to cassette', () => {
    expect(MF.normalizeFormat('Cassette')).toBe('cassette');
    expect(MF.normalizeFormat('tape')).toBe('cassette');
  });
  it('maps minidisc to minidisc', () => {
    expect(MF.normalizeFormat('MiniDisc')).toBe('minidisc');
  });
  it('maps hardware-ish to hardware', () => {
    expect(MF.normalizeFormat('Walkman')).toBe('hardware');
    expect(MF.normalizeFormat('Stereo Player')).toBe('hardware');
  });
  it('returns empty string for unknown / empty / null', () => {
    expect(MF.normalizeFormat('')).toBe('');
    expect(MF.normalizeFormat('   ')).toBe('');
    expect(MF.normalizeFormat(null)).toBe('');
    expect(MF.normalizeFormat(undefined)).toBe('');
    expect(MF.normalizeFormat('something else')).toBe('');
  });
});

describe('matchesPlayer', () => {
  it('matches same playable format', () => {
    expect(MF.matchesPlayer('record', 'record')).toBe(true);
    expect(MF.matchesPlayer('cassette', 'cassette')).toBe(true);
    expect(MF.matchesPlayer('cd', 'cd')).toBe(true);
  });
  it('rejects mismatched formats', () => {
    expect(MF.matchesPlayer('record', 'cd')).toBe(false);
    expect(MF.matchesPlayer('cd', 'cassette')).toBe(false);
  });
  it('rejects non-playable product formats', () => {
    expect(MF.matchesPlayer('record', 'minidisc')).toBe(false);
    expect(MF.matchesPlayer('cd', 'hardware')).toBe(false);
    expect(MF.matchesPlayer('cassette', '')).toBe(false);
  });
  it('rejects when player type is not a known player', () => {
    expect(MF.matchesPlayer(null, 'record')).toBe(false);
    expect(MF.matchesPlayer('minidisc', 'minidisc')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../assets/japanjunky-media-format.js`.

- [ ] **Step 3: Implement the module**

Create `assets/japanjunky-media-format.js`:

```javascript
/**
 * japanjunky-media-format.js
 * Format normalization + player matching for the toolbox media player.
 *
 * UMD: attaches to window.JJ_MediaFormat as a classic <script>, exports via
 * module.exports under Vitest. No DOM access.
 *
 * normalizeFormat mirrors the Liquid logic in snippets/jj-product-json.liquid.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_MediaFormat = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeFormat(raw) {
    var s = (raw == null ? '' : String(raw)).toLowerCase().trim();
    if (!s) return '';
    if (s.indexOf('vinyl') >= 0 || s.indexOf('lp') >= 0 || s.indexOf('record') >= 0) return 'record';
    if (s.indexOf('cd') >= 0 || s.indexOf('compact disc') >= 0) return 'cd';
    if (s.indexOf('cassette') >= 0 || s.indexOf('tape') >= 0) return 'cassette';
    if (s.indexOf('minidisc') >= 0 || s.indexOf('mini disc') >= 0 || s.indexOf('md') >= 0) return 'minidisc';
    if (s.indexOf('hardware') >= 0 || s.indexOf('player') >= 0 ||
        s.indexOf('walkman') >= 0 || s.indexOf('stereo') >= 0) return 'hardware';
    return '';
  }

  // Only record/cassette/cd are playable, and only on their matching player.
  function matchesPlayer(playerType, productFormat) {
    if (playerType !== 'record' && playerType !== 'cassette' && playerType !== 'cd') {
      return false;
    }
    return playerType === productFormat;
  }

  return { normalizeFormat: normalizeFormat, matchesPlayer: matchesPlayer };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — media-format tests + all existing physics/sanity tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/media-format.test.js assets/japanjunky-media-format.js
git commit -m "feat(toolbox): media format normalize + match, with tests (tranche 4)"
```

---

### Task 2: Player accepts a product (gate + feedback)

**Files:**
- Modify: `assets/japanjunky-player.js`
- Modify: `assets/japanjunky-win95.css` (append)

- [ ] **Step 1: Add getRect, tryLoadProduct, and feedback to the player**

In `assets/japanjunky-player.js`, add these functions immediately before the `window.JJ_Player = {` line:

```javascript
  // Player's on-screen rectangle in VISUAL px (getBoundingClientRect), for the
  // drag system to hit-test a drop. Returns null when no player is spawned.
  function getRect() {
    return el ? el.getBoundingClientRect() : null;
  }

  // Briefly toggle a CSS class to play a one-shot feedback animation. Uses a
  // reflow to restart the animation if the class is still applied. The class
  // must not animate `transform` (the physics loop owns el's transform).
  function flashClass(cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { if (el) el.classList.remove(cls); }, 600);
  }

  // Try to load a dropped product. Format gate: a product only plays on its
  // matching player. Tranche 4 stubs audio — accept = visual confirm only;
  // Tranche 5 routes the accept path to the audio engine.
  // Returns 'no-player' | 'rejected' | 'accepted'.
  function tryLoadProduct(product) {
    if (!el || !currentTool) return 'no-player';
    var fmt = product && product.format;
    var MF = window.JJ_MediaFormat;
    if (!MF || !MF.matchesPlayer(currentTool, fmt)) {
      // Reject: shove the player (physics impulse) + red flash.
      if (body) {
        body.vy = -700;
        body.vx = (body.vx || 0) + (Math.random() < 0.5 ? -260 : 260);
      }
      startLoop();
      flashClass('jj-player--reject');
      return 'rejected';
    }
    // Accept: green flash. (Audio is wired in Tranche 5.)
    flashClass('jj-player--accept');
    return 'accepted';
  }
```

Then extend the public API object so it reads:

```javascript
  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; },
    getRect: getRect,
    tryLoadProduct: tryLoadProduct
  };
```

- [ ] **Step 2: Append the accept/reject CSS**

Append to the end of `assets/japanjunky-win95.css`:

```css
/* --- Player drop feedback (no transform — physics owns el's transform) --- */
.jj-player--accept {
  animation: jj-player-accept 0.5s steps(2);
}

@keyframes jj-player-accept {
  0%, 100% { box-shadow: var(--jj-tactile); border-color: var(--jj-secondary, #f5d742); }
  50% {
    box-shadow: 0 0 14px rgba(51, 255, 51, 0.85);
    border-color: var(--jj-green, #33ff33);
  }
}

.jj-player--reject {
  animation: jj-player-reject 0.4s steps(3);
}

@keyframes jj-player-reject {
  0%, 100% { box-shadow: var(--jj-tactile); border-color: var(--jj-secondary, #f5d742); }
  50% {
    box-shadow: 0 0 14px rgba(232, 49, 58, 0.9);
    border-color: var(--jj-primary, #e8313a);
  }
}
```

- [ ] **Step 3: Manual smoke check**

In a browser preview console, with a record player spawned (`JJ_Player.spawn('record', 200, 0)` then let it settle):

```js
JJ_Player.tryLoadProduct({ format: 'record' }); // 'accepted' — green flash
JJ_Player.tryLoadProduct({ format: 'cd' });      // 'rejected' — red flash + the player hops/shoves
JJ_Player.getRect();                              // a DOMRect with left/top/right/bottom
```

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-player.js assets/japanjunky-win95.css
git commit -m "feat(toolbox): player format gate + accept/reject feedback (tranche 4)"
```

---

### Task 3: Product hold-drag + ghost + drop

**Files:**
- Create: `assets/japanjunky-media-drag.js`
- Modify: `assets/japanjunky-win95.css` (append)
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Append the ghost CSS**

Append to the end of `assets/japanjunky-win95.css`:

```css
/* --- Drag ghost (placeholder until 3D graphics land in Tranche 3) --- */
.jj-media-ghost {
  position: fixed;
  top: 0;
  left: 0;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px; /* centre on the cursor; transform sets cursor pos */
  z-index: 10012; /* above the player (10009) and toolbox (10011) */
  pointer-events: none; /* never block the drop hit-test */
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  text-align: center;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid var(--jj-secondary, #f5d742);
  color: var(--jj-secondary, #f5d742);
  box-shadow: var(--jj-tactile);
  opacity: 0.92;
}

.jj-media-ghost[data-format="record"]   { border-color: var(--jj-amber, #ffaa00); color: var(--jj-amber, #ffaa00); }
.jj-media-ghost[data-format="cassette"] { border-color: var(--jj-green, #33ff33); color: var(--jj-green, #33ff33); }
.jj-media-ghost[data-format="cd"]       { border-color: var(--jj-cyan, #00e5e5); color: var(--jj-cyan, #00e5e5); }
```

- [ ] **Step 2: Create the drag module**

Create `assets/japanjunky-media-drag.js`:

```javascript
/**
 * japanjunky-media-drag.js
 * Hold-drag a product (grid card or PDP info column) onto the spawned player.
 * Shows a placeholder ghost following the cursor; on release over the player it
 * calls JJ_Player.tryLoadProduct. The 3D ghost graphics arrive with Tranche 3.
 *
 * Depends on window.JJ_Player (lazy) and window.JJ_MediaFormat (lazy).
 */
(function () {
  'use strict';

  var DRAG_THRESHOLD = 6; // layout px of movement before a press becomes a drag
  // Controls/links inside a draggable source that must keep their own behavior.
  var EXCLUDE = 'button, input, select, textarea, .jj-grid__card-cond-chip, .jj-pdp-back';

  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var pending = null; // { x, y, prod, srcEl }
  var dragging = false;
  var product = null;
  var ghost = null;

  function normFmt(raw) {
    return window.JJ_MediaFormat ? window.JJ_MediaFormat.normalizeFormat(raw) : (raw || '');
  }

  // Resolve the product being dragged from the pointer target, or null.
  function getProductAt(target) {
    if (!target || !target.closest) return null;
    var card = target.closest('.jj-grid__card');
    if (card) {
      var t = card.querySelector('.jj-grid__card-title');
      return {
        format: normFmt(card.getAttribute('data-format')),
        title: t ? t.textContent : '',
        srcEl: card
      };
    }
    var info = target.closest('#jj-pdp-info');
    if (info && window.JJ_PRODUCT_DATA) {
      return {
        format: normFmt(window.JJ_PRODUCT_DATA.formatLabel),
        title: window.JJ_PRODUCT_DATA.title || '',
        srcEl: info
      };
    }
    return null;
  }

  function createGhost(fmt) {
    ghost = document.createElement('div');
    ghost.className = 'jj-media-ghost';
    ghost.setAttribute('data-format', fmt || '');
    ghost.textContent = (fmt || '?').toUpperCase();
    document.body.appendChild(ghost);
  }

  function moveGhost(clientX, clientY) {
    if (!ghost) return;
    ghost.style.transform = 'translate(' + (clientX / zoom) + 'px,' + (clientY / zoom) + 'px)';
  }

  function removeGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  }

  function dropOnPlayer(clientX, clientY) {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return;
    var r = window.JJ_Player.getRect();
    if (!r) return;
    if (clientX >= r.left && clientX <= r.right &&
        clientY >= r.top && clientY <= r.bottom) {
      window.JJ_Player.tryLoadProduct(product);
    }
  }

  // After a drag, swallow the click the browser fires on the source (so an
  // <a> card doesn't navigate). Self-removes after the click or a short delay.
  function suppressNextClick(srcEl) {
    if (!srcEl) return;
    function handler(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      srcEl.removeEventListener('click', handler, true);
    }
    srcEl.addEventListener('click', handler, true);
    setTimeout(function () { srcEl.removeEventListener('click', handler, true); }, 400);
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // primary button only
    if (e.target.closest(EXCLUDE)) return;
    var prod = getProductAt(e.target);
    if (!prod) return;
    pending = { x: e.clientX, y: e.clientY, prod: prod, srcEl: prod.srcEl };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!pending) return;
    if (!dragging) {
      var dx = (e.clientX - pending.x) / zoom;
      var dy = (e.clientY - pending.y) / zoom;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      dragging = true;
      product = pending.prod;
      createGhost(product.format);
    }
    moveGhost(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (dragging) {
      removeGhost();
      dropOnPlayer(e.clientX, e.clientY);
      suppressNextClick(pending.srcEl); // a drag never navigates
    }
    dragging = false;
    pending = null;
    product = null;
  }

  document.addEventListener('pointerdown', onPointerDown);

  // Block the browser's native link/image drag-and-drop on our sources so it
  // can't hijack the gesture.
  document.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('.jj-grid__card, #jj-pdp-info')) {
      e.preventDefault();
    }
  });

  window.addEventListener('resize', function () {
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  });
})();
```

- [ ] **Step 3: Load the scripts**

In `layout/theme.liquid`, find:

```liquid
  <script src="{{ 'japanjunky-player.js' | asset_url }}" defer></script>
```

Add immediately after it:

```liquid
  <script src="{{ 'japanjunky-media-format.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-media-drag.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Manual verification**

In a browser preview on the homepage:
1. Spawn a record player (open the toolbox fan, drag the LP tool out; let it settle).
2. Press and hold a **record** product card, move past ~6px — a gold ghost labeled RECORD follows the cursor. Drop it on the player → green accept flash. The card does NOT navigate.
3. Repeat with a **non-record** card (e.g. a CD) → red reject flash + the player hops/shoves.
4. A plain click on a card (no drag) still navigates to the product page.
5. Clicking a condition chip or `[+ CART]` still works (no drag starts).
6. On a product page, hold-drag from the info column (title/meta area) → ghost appears; dropping on a matching player accepts. The 3D viewer's rotate-drag still works (dragging the cover canvas does not start a product drag).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-media-drag.js assets/japanjunky-win95.css layout/theme.liquid
git commit -m "feat(toolbox): hold-drag a product onto the player (tranche 4)"
```

---

### Task 4: Full regression

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all media-format + physics + sanity tests pass.

- [ ] **Step 2: Browser checklist**

On the homepage and one product page, confirm:
1. With no player spawned, dragging a card shows the ghost but dropping anywhere does nothing (no errors); the card still doesn't navigate after a drag.
2. With a player spawned, a matching-format product drop → green accept flash.
3. A mismatched-format drop → red reject flash + physics shove (player hops, then re-settles on the taskbar, never leaving the screen).
4. Plain clicks on cards navigate; condition chips select; `[+ CART]` adds — all unaffected.
5. The ghost is colour-coded (record=amber, cassette=green, cd=cyan) and never blocks the drop.
6. PDP: dragging from the info column works; the 3D viewer rotate-drag is unaffected.
7. Tranches 1–2 still work (fan open/close; spawn/throw/persist/settle).
8. Resize during/after a drag leaves the player on-screen.

- [ ] **Step 3: Record the result**

If all pass, Tranche 4 is complete. If any fail, fix inline (the click-suppression and the EXCLUDE selector are the usual culprits) and re-verify.

---

## Self-Review

**Spec coverage (Tranche 4 scope):**
- "Click-hold a product (grid card and PDP) → ghost follows cursor → drop on player" → Task 3 (`onPointerDown/Move/Up`, `getProductAt` handles both sources). ✓
- "Format gate: records→record player, cassettes→cassette, CDs→CD; mismatch rejects" → Task 1 (`matchesPlayer`) + Task 2 (`tryLoadProduct`). ✓
- "Reject = buzz + visual shove" → reject does a physics shove + red flash; the *buzz* (audio) is deferred to Tranche 5 (no audio engine yet). Noted. ✓ (partial — audio buzz in T5)
- "Drag graphic: record reuses disc; cassette/CD new graphics" → deferred to Tranche 3 model work; this tranche uses a colour-coded CSS placeholder ghost (consistent with the T2 placeholder player box). Explicit scope-down. ✓ (deferred)
- "Drop loads & plays the product's audio" → accept path stubbed; Tranche 5 wires audio. ✓ (deferred by design)
- Format normalization unit-tested. ✓

**Placeholder scan:** No TBD/TODO; all steps contain complete code/commands. The CSS ghost and stubbed audio are intentional, documented Tranche-4 scope, not unfinished stubs. ✓

**Type/name consistency:**
- `window.JJ_MediaFormat.normalizeFormat` / `.matchesPlayer` defined in Task 1, consumed in Task 2 (`tryLoadProduct`) and Task 3 (`normFmt`). ✓
- `window.JJ_Player.getRect` / `.tryLoadProduct` defined in Task 2, consumed in Task 3 (`dropOnPlayer`). ✓
- `product` shape `{ format, title, srcEl }` produced by `getProductAt` (Task 3) and consumed by `tryLoadProduct` (reads `product.format`, Task 2). ✓
- CSS classes `.jj-media-ghost`, `.jj-player--accept`, `.jj-player--reject` consistent between CSS (Tasks 2–3) and JS (`flashClass`, `createGhost`). ✓
- Zoom usage: pointer-vs-rect hit-test uses visual px on both sides (no conversion); ghost positioning divides clientX/Y by zoom (layout px for transform) — consistent with the player module. ✓

**Decisions to flag to the user:** PDP drag source is the info column (`#jj-pdp-info`), not the 3D cover (which owns rotate-drag); the drag ghost and the accept-path audio are placeholders/stubs pending Tranches 3 and 5 respectively.
```
