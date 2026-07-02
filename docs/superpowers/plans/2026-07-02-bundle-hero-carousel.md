# Bundle Hero: Restore Carousel Scroll/Select — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the live bundle hero the ring-carousel's scroll/select behavior on its 5 records, mirror the layout (box left, crescent right), and fix the click-shoves-panel-to-bottom-left CSS regression.

**Architecture:** Extract the crescent slot table + offset-wrap math into a new pure UMD module (`bundle-carousel`), unit-tested. Port the missing `.jj-product-zone` positioning into `bundle.css` (the bug fix). Rewire `bundle-stage.js`: box to the left, camera at the composition midpoint, and replace the click→free-focus model with a `centerIndex` carousel (arrow/scroll/swipe rotation, 300ms auto-select of the centered record, preview-only) ported from `japanjunky-ring-carousel.js`.

**Tech Stack:** vanilla JS (IIFE + UMD), three.js, vitest. Reference: `assets/japanjunky-ring-carousel.js` (the retired carousel whose interaction we port).

## Global Constraints

- **Select = preview only** — the centered/selected record dispatches `jj:product-selected {preview:true}`; NO per-record Add-to-Cart. The bundle button stays the only purchase.
- **Box left, crescent right** — box parked left; 5 records in a scrollable crescent on the right, centered record biggest.
- **PS1 shader + NearestFilter** on all meshes/textures (unchanged; reuse existing `psMat`/`loadTex`).
- **Input gating** — all navigation only fires when `state === 'open'` AND `!JJ_BundleFSM.isLocked(state)`.
- **Pure module rule** — `bundle-carousel.js` follows `japanjunky-media-format.js` UMD (browser global + `module.exports`, NO DOM, NO three.js).
- **Reuse, don't duplicate** — carousel nav mirrors `japanjunky-ring-carousel.js` (throttled wheel ~150ms, one-rotation-per-swipe, keyboard guards for inputs/`jj-grid-active`/focused links).
- **Deploy** — live only after merge to `main`. 3D coordinate constants (`BOX_X`, camera x, slot x/y) are first-pass, tuned in the browser.

---

### Task 1: Carousel slot + offset-wrap module

**Files:**
- Create: `assets/japanjunky-bundle-carousel.js`
- Test: `tests/bundle-carousel.test.js`

**Interfaces:**
- Produces `window.JJ_BundleCarousel` / `module.exports`:
  - `SLOTS`: object keyed by signed offset string `'-2'..'2'` → `{ x, y, scale }` (mirrored ring-carousel ARC, crescent opening right). Center `'0'` is biggest.
  - `normalizeOffset(index, centerIndex, len)`: signed offset of `index` relative to `centerIndex` wrapped into the range `[-floor(len/2), +floor(len/2)]` (for `len=5` → `-2..2`). Pure integer math.
  - `slotForIndex(index, centerIndex, len)`: the `SLOTS` entry for `normalizeOffset(...)`, or `null` if the offset falls outside `SLOTS` (never happens for `len ≤ 5`).

- [ ] **Step 1: Write the failing test**

Create `tests/bundle-carousel.test.js`:

```js
import { describe, it, expect } from 'vitest';
import C from '../assets/japanjunky-bundle-carousel.js';

describe('SLOTS table', () => {
  it('has 5 symmetric slots, center biggest', () => {
    expect(Object.keys(C.SLOTS).sort()).toEqual(['-1', '-2', '0', '1', '2']);
    expect(C.SLOTS['0'].scale).toBe(1.15);
    expect(C.SLOTS['1'].scale).toBe(C.SLOTS['-1'].scale);
    expect(C.SLOTS['2'].scale).toBe(C.SLOTS['-2'].scale);
    // center smaller offset y=0; outer slots mirror vertically
    expect(C.SLOTS['0'].y).toBe(0);
    expect(C.SLOTS['1'].y).toBe(-C.SLOTS['-1'].y);
    // crescent opens right: outer slots further right than center
    expect(C.SLOTS['2'].x).toBeGreaterThan(C.SLOTS['0'].x);
  });
});

describe('normalizeOffset (len=5)', () => {
  it('is 0 at the center index', () => {
    expect(C.normalizeOffset(2, 2, 5)).toBe(0);
  });
  it('wraps to the nearest signed offset', () => {
    expect(C.normalizeOffset(3, 2, 5)).toBe(1);
    expect(C.normalizeOffset(1, 2, 5)).toBe(-1);
    expect(C.normalizeOffset(4, 2, 5)).toBe(2);
    expect(C.normalizeOffset(0, 2, 5)).toBe(-2);
    // wrap-around: index 0 with center 4 → +1 (not -4)
    expect(C.normalizeOffset(0, 4, 5)).toBe(1);
    expect(C.normalizeOffset(4, 0, 5)).toBe(-1);
  });
});

describe('slotForIndex', () => {
  it('returns the center slot for the centered index', () => {
    expect(C.slotForIndex(2, 2, 5)).toBe(C.SLOTS['0']);
  });
  it('maps a wrapped index to its slot', () => {
    expect(C.slotForIndex(0, 4, 5)).toBe(C.SLOTS['1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bundle-carousel`
Expected: FAIL — cannot resolve `../assets/japanjunky-bundle-carousel.js`.

- [ ] **Step 3: Write the module**

Create `assets/japanjunky-bundle-carousel.js`:

```js
/**
 * japanjunky-bundle-carousel.js
 * Crescent slot table + offset-wrap math for the bundle hero carousel.
 * Mirrors the retired ring-carousel ARC (crescent opening right).
 * UMD: window.JJ_BundleCarousel / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundleCarousel = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Signed offset from the centered record → scene slot. Mirrored from the
  // ring-carousel ARC (px/90): center biggest at x≈0.6, pairs arc up/down and
  // further right with a scale falloff. y is scene-up (offset +1 sits below).
  var SLOTS = {
    '-2': { x: 1.2, y:  1.61, scale: 0.72 },
    '-1': { x: 0.8, y:  0.83, scale: 0.88 },
    '0':  { x: 0.6, y:  0.00, scale: 1.15 },
    '1':  { x: 0.8, y: -0.83, scale: 0.88 },
    '2':  { x: 1.2, y: -1.61, scale: 0.72 }
  };

  // Signed offset of index relative to centerIndex, wrapped to the nearest
  // direction around a ring of `len` items → range [-floor(len/2), floor(len/2)].
  function normalizeOffset(index, centerIndex, len) {
    var off = ((index - centerIndex) % len + len) % len; // 0..len-1
    if (off > len / 2) off -= len;                        // → nearest signed
    return off;
  }

  function slotForIndex(index, centerIndex, len) {
    var off = normalizeOffset(index, centerIndex, len);
    return SLOTS[String(off)] || null;
  }

  return { SLOTS: SLOTS, normalizeOffset: normalizeOffset, slotForIndex: slotForIndex };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bundle-carousel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-carousel.js tests/bundle-carousel.test.js
git commit -m "feat(bundle): carousel slot table + offset-wrap module with tests"
```

---

### Task 2: Fix the click bug — port `.jj-product-zone` CSS

**Files:**
- Modify: `assets/japanjunky-bundle.css` (append the ported rules)

**Interfaces:**
- Consumes: nothing. Produces: correct fixed positioning for `.jj-product-zone` / `#jj-viewer-canvas` so the info panel shows in the top-left zone, not bottom-left flow.

- [ ] **Step 1: Append the ported rules to bundle.css**

The info panel's container lost its layout when `ring-carousel.css` was retired. Append these rules (copied verbatim from the retired `assets/japanjunky-ring-carousel.css:101-122`) to the end of `assets/japanjunky-bundle.css`:

```css
/* --- Product Zone (left side) — ported from retired ring-carousel.css so the
   info panel keeps its fixed top-left position instead of dropping into flow. */
.jj-product-zone {
  position: fixed;
  left: 0;
  top: 0;
  width: 24vw;
  height: calc(40vh - 12.8px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding-left: 16px;
  pointer-events: none;
  overflow: visible;
}

#jj-viewer-canvas.jj-viewer--dragging {
  cursor: grabbing;
}
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: PASS (no test change; guards the JS suites are intact).

Run: `grep -n "jj-product-zone" assets/japanjunky-bundle.css`
Expected: the ported rule is present.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-bundle.css
git commit -m "fix(bundle): restore .jj-product-zone fixed position (info panel top-left)"
```

---

### Task 3: Rewire the stage — box left, carousel scroll/select

**Files:**
- Modify: `assets/japanjunky-bundle-stage.js`

**Interfaces:**
- Consumes: `window.JJ_BundleCarousel` (`SLOTS`, `normalizeOffset`, `slotForIndex`); existing stage closures (`scene`, `camera`, `records`, `tween`, `state`, `setState`, `FSM`, `openFlaps`, `closeFlaps`, `setFlaps`, `dealRecords`, `shakeBox`, `boxGroup`, `raycaster`, `canvas`, `recordDetail`, `reduceMotion`).
- Produces: a `centerIndex`-driven carousel replacing the free-focus model.

> This task loads `bundle-carousel.js` before `bundle-stage.js` (Step 1), moves the box left + recenters the camera (Step 2), and replaces the record-interaction block (Steps 3-5). All steps land in one commit at the end; verify in the browser.

- [ ] **Step 1: Load the carousel module before the stage**

In `layout/theme.liquid`, the bundle chain currently reads:

```liquid
  <script src="{{ 'japanjunky-bundle-pool.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-fsm.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-stage.js' | asset_url }}" defer></script>
```

Insert the carousel module before the stage:

```liquid
  <script src="{{ 'japanjunky-bundle-pool.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-fsm.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-carousel.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-bundle-stage.js' | asset_url }}" defer></script>
```

- [ ] **Step 2: Box → left, camera → composition midpoint**

In `assets/japanjunky-bundle-stage.js`, the camera/const block currently reads:

```js
  var BOX_X = 2.2;     // box position: right of the crescent mouth
  var CENTER_X = 1.05; // midpoint of box + crescent → camera + focus target
  camera.position.set(CENTER_X, 0, 6);
```

Replace with the box on the left and the camera aimed at the box+crescent midpoint:

```js
  var CAR = window.JJ_BundleCarousel;
  var BOX_X = -1.8;    // box parked on the left (source of the records)
  var CENTER_X = -0.55; // midpoint of box (left) + crescent (right) for framing
  camera.position.set(CENTER_X, 0, 6);
```

(The `boxGroup.position.x = BOX_X;` line in `buildBox` and the `BOX_X` uses in `buildRecordMesh`/`slideOut`/`slideIn` already reference `BOX_X`, so they follow automatically.)

- [ ] **Step 3: Replace `ARC_TARGETS` + `dealRecords` with carousel state**

Find the `ARC_TARGETS` array (the 5-slot literal) and DELETE it. Then replace the current `dealRecords` function with a version that seeds `centerIndex` to the middle and lays records onto their slots:

```js
  var centerIndex = 0;   // index into records that is currently centered/selected
  var selectTimer = null;

  function slotFor(i) {
    return (CAR && CAR.slotForIndex(i, centerIndex, records.length)) || CAR.SLOTS['0'];
  }

  function dealRecords() {
    clearRecords();
    var pool = (window.JJ_BundlePool && window.JJ_PRODUCTS)
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (window.JJ_BUNDLE && window.JJ_BUNDLE.productId))
      : [];
    for (var i = 0; i < pool.length; i++) {
      records.push({ mesh: buildRecordMesh(pool[i]), data: pool[i], phase: Math.random() * Math.PI * 2 });
    }
    centerIndex = Math.floor(records.length / 2); // middle record centered
  }
```

(Note: the record objects no longer carry a fixed `slot`; their slot is derived each layout from `centerIndex`. `buildRecordMesh` is unchanged — it still starts the mesh hidden at `BOX_X`.)

- [ ] **Step 4: Replace `slideOut`/`slideIn`/free-focus with carousel layout + rotation + select**

Replace the block spanning the old `slideOut`, `slideIn`, the `// ─── Preview selection (raycast) ───` section (`raycaster`, `focused`, `focusRecord`, `deselect`), and `updateRecords` with this carousel implementation. Keep the existing `recordDetail(data)` helper (reused below); if it sits inside the replaced range, retain it verbatim.

```js
  var recordsOut = false;

  // Animate every record to the slot for its offset from centerIndex.
  function layoutRecords(animated) {
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        var slot = slotFor(idx);
        var mesh = rec.mesh;
        mesh.visible = true;
        var sx = mesh.position.x, sy = mesh.position.y, ss = mesh.scale.x;
        if (!animated) {
          mesh.position.set(slot.x, slot.y, 0);
          mesh.scale.setScalar(slot.scale);
          return;
        }
        tween(320, function (e) {
          mesh.position.x = sx + (slot.x - sx) * e;
          mesh.position.y = sy + (slot.y - sy) * e;
          mesh.position.z = (1 - e) * mesh.position.z; // ease any z back to 0
          mesh.scale.setScalar(ss + (slot.scale - ss) * e);
        });
      })(records[i], i);
    }
  }

  // Deal-out: records fly from the box (BOX_X) to their carousel slots, staggered.
  function slideOut(done) {
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        var slot = slotFor(idx);
        rec.mesh.visible = true;
        var sx = BOX_X, sy = 0, ss = 0.2;
        setTimeout(function () {
          tween(500, function (e) {
            rec.mesh.position.x = sx + (slot.x - sx) * e;
            rec.mesh.position.y = sy + (slot.y - sy) * e;
            rec.mesh.scale.setScalar(ss + (slot.scale - ss) * e);
          }, function () {
            pending--;
            if (pending === 0) { recordsOut = true; armSelect(); if (done) done(); }
          });
        }, idx * 90);
      })(records[i], i);
    }
  }

  // Retract all records back into the box.
  function slideIn(done) {
    recordsOut = false;
    clearSelectTimer();
    deselectCurrent();
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var sx = rec.mesh.position.x, sy = rec.mesh.position.y, ss = rec.mesh.scale.x;
        tween(360, function (e) {
          rec.mesh.position.x = sx + (BOX_X - sx) * e;
          rec.mesh.position.y = sy + (0 - sy) * e;
          rec.mesh.scale.setScalar(ss + (0.2 - ss) * e);
        }, function () { rec.mesh.visible = false; pending--; if (pending === 0 && done) done(); });
      })(records[i]);
    }
  }

  // ─── Rotation + selection (ported from ring-carousel.js) ─────
  function rotateTo(newIndex) {
    if (!records.length) return;
    if (newIndex < 0) newIndex = records.length - 1;
    if (newIndex >= records.length) newIndex = 0;
    if (newIndex === centerIndex) return;
    deselectCurrent();
    centerIndex = newIndex;
    layoutRecords(true);
    armSelect();
  }
  function rotateBy(delta) { rotateTo(centerIndex + delta); }

  function armSelect() {
    clearSelectTimer();
    selectTimer = setTimeout(function () { selectTimer = null; selectCentered(); }, 300);
  }
  function clearSelectTimer() {
    if (selectTimer) { clearTimeout(selectTimer); selectTimer = null; }
  }
  var selectedIndex = -1;
  function selectCentered() {
    if (!records.length || centerIndex === selectedIndex) return;
    selectedIndex = centerIndex;
    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: recordDetail(records[centerIndex].data) }));
  }
  function deselectCurrent() {
    clearSelectTimer();
    if (selectedIndex === -1) return;
    selectedIndex = -1;
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }

  // Idle bob for non-centered records; centered one holds still (it's selected).
  function updateRecords(now) {
    if (!recordsOut) return;
    for (var i = 0; i < records.length; i++) {
      if (i === centerIndex) continue;
      var rec = records[i];
      var slot = slotFor(i);
      rec.mesh.position.y = slot.y + Math.sin(now * 0.001 + rec.phase) * 0.04;
    }
  }
```

- [ ] **Step 5: Replace the click handler + add keyboard/wheel/touch nav**

Replace the current canvas click handler (the `state === 'open'` raycast focus block + the `state === 'closed'` open block) with click-to-center/select, and add ring-carousel-style keyboard/wheel/touch handlers after it:

```js
  canvas.addEventListener('click', function (e) {
    if (FSM.isLocked(state)) return;
    if (state === 'closed') {
      boxGroup.rotation.y = 0;
      boxGroup.position.y = 0;
      dealRecords();
      openFlaps(function () { slideOut(); });
      return;
    }
    if (state === 'open' && records.length) {
      var r = canvas.getBoundingClientRect();
      var mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var my = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera({ x: mx, y: my }, camera);
      var meshes = records.map(function (rec) { return rec.mesh; });
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].mesh === hits[0].object) {
            if (i === centerIndex) { clearSelectTimer(); selectCentered(); }
            else { rotateTo(i); }
            return;
          }
        }
      }
    }
  });

  // Keyboard (mirrors ring-carousel guards)
  document.addEventListener('keydown', function (e) {
    if (state !== 'open' || FSM.isLocked(state)) return;
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.body.classList.contains('jj-grid-active')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); rotateBy(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); rotateBy(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); clearSelectTimer(); selectCentered(); }
    else if (e.key === 'Escape') { e.preventDefault(); deselectCurrent(); }
  });

  // Scroll wheel over the canvas (throttled, one step per event)
  var wheelCooldown = false;
  canvas.addEventListener('wheel', function (e) {
    if (state !== 'open' || FSM.isLocked(state)) return;
    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(function () { wheelCooldown = false; }, 150);
    var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (delta > 0) rotateBy(1); else if (delta < 0) rotateBy(-1);
  }, { passive: false });

  // Touch swipe (vertical, one rotation per gesture)
  var touchStartY = 0, touchLocked = false;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY; touchLocked = false;
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (state !== 'open' || FSM.isLocked(state) || touchLocked || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > 50) {
      e.preventDefault(); touchLocked = true;
      if (dy > 0) rotateBy(1); else rotateBy(-1);
    }
  }, { passive: false });
```

- [ ] **Step 6: Reset carousel on reroll**

In `reroll()`, the fresh-deal stage calls `dealRecords()` (which now resets `centerIndex` to the middle) then `slideOut()` (which arms the select timer). Confirm the reroll's `slideIn` path clears any selection — it does via the new `slideIn` calling `clearSelectTimer()` + `deselectCurrent()`. No code change needed here beyond confirming `reroll` still calls `slideIn(...)` → `closeFlaps` → `shakeBox` → `dealRecords` → flap-open tween → `slideOut()`. Leave `reroll` as-is.

- [ ] **Step 7: Verify (browser) + syntax**

Run: `node -c assets/japanjunky-bundle-stage.js` → clean; `npm test` → all green (pure suites, incl. Task 1).

Manual (primary gate): load homepage.
- Box sits on the **left**, floating + slowly spinning while closed.
- Click box → flaps open (facing viewer) → 5 records deal into a crescent on the **right**, centered record biggest.
- Arrow keys / scroll wheel / swipe rotate through all 5 with wrap; the centered record becomes biggest and, after ~300ms, its info shows in the **top-left** panel (NOT bottom-left) with **no Add-to-Cart**.
- Clicking a side record centers it; clicking the centered record selects immediately.
- Reroll → records retract into the box → shake → redeal 5 fresh, centered on the middle, no stale selection.
- Nothing clips; reduced-motion still reaches end states; mobile usable.

- [ ] **Step 8: Commit**

```bash
git add assets/japanjunky-bundle-stage.js layout/theme.liquid
git commit -m "feat(bundle): box left + ring-carousel scroll/select on the record crescent"
```

---

## Self-Review

**Spec coverage:**
- Click bug (`.jj-product-zone` port) → Task 2. ✓
- Box left / crescent right / camera midpoint → Task 3 Steps 2-4 (SLOTS x positive, BOX_X negative). ✓
- centerIndex carousel + wrap → Task 1 (`normalizeOffset`/`slotForIndex`) + Task 3 (`layoutRecords`/`rotateTo`). ✓
- Arrow/scroll/swipe nav, gated on open + !isLocked → Task 3 Step 5. ✓
- 300ms auto-select, preview-only, deselect on rotate → Task 3 Step 4 (`armSelect`/`selectCentered`/`deselectCurrent`). ✓
- Click side→center, click center→select → Task 3 Step 5. ✓
- Reroll resets centerIndex + clears selection → Task 3 Steps 3 (`dealRecords` centerIndex) + 4 (`slideIn` clears) + 6. ✓
- Records emerge/retract from box → Task 3 Step 4 (`slideOut` from `BOX_X`, `slideIn` to `BOX_X`). ✓
- Preview-only (no ATC) → reuses `product-viewer.js` preview mode (unchanged) via `recordDetail{preview:true}`. ✓
- <5 records edge case → `records.length` used throughout; `normalizeOffset` uses `len`. ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step. Browser-verification steps are concrete.

**Type consistency:** `SLOTS`/`normalizeOffset(index,centerIndex,len)`/`slotForIndex(index,centerIndex,len)` consistent between Task 1 (def + tests) and Task 3 (`slotFor` wrapper). `centerIndex`, `selectTimer`, `selectedIndex`, `recordsOut` declared once in Task 3 and used consistently. Record objects drop the `slot` field (Task 3 Step 3) and nothing reads `rec.slot` afterward (old `updateRecords`/focus that used `rec.slot` are replaced in Step 4). `recordDetail` reused unchanged. `reduceMotion`/`tween` from prior tasks unchanged.

**Note:** Task 3 is one file's interaction rewrite verified in-browser (WebGL not node-testable); the wrap math it depends on is isolated in Task 1 and unit-tested. Coordinate constants are first-pass, tuned during Step 7.
