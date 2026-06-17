# Toolbox Media Players — Tranche 2: Spawn + Physics + Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dragging a toolbox fan tool onto the screen spawns a single placeholder "player" element that falls under gravity, bounces off the viewport edges, never leaves the screen, settles on top of the taskbar, can be grabbed and thrown, and is restored across page navigations.

**Architecture:** A pure, unit-tested physics module (`japanjunky-player-physics.js`, UMD so it loads as a classic script *and* imports into Vitest) computes one body's motion per frame in layout-pixel space. A player module (`japanjunky-player.js`) owns a single fixed-position DOM container, drives a `requestAnimationFrame` loop through the physics, handles pointer drag/throw, persists state to `sessionStorage`, and exposes `window.JJ_Player`. The toolbox JS gains pointer drag-to-spawn on the fan tools. The 3D model visuals are deferred to Tranche 3 — this tranche uses a CSS placeholder box.

**Tech Stack:** Vanilla ES5-style JS (no build step; UMD for the testable module), Vitest (new dev dependency, Node environment) for the physics unit tests, CSS in the existing `japanjunky-win95.css`.

**Critical environment facts (verified):**
- `html { zoom: 2.5 }` (`japanjunky-base.css:16-25`). `window.innerWidth/Height` and pointer `clientX/Y` are in **visual** px; element `offsetWidth/Height` and CSS `transform`/`top`/`left` are in **layout** px. Convert visual→layout by dividing by the zoom factor. Precedent: `japanjunky-splash.js` reads `getComputedStyle(document.documentElement).zoom` and divides.
- Taskbar `.jj-taskbar`: `position: fixed; bottom: 0; height: 32px; z-index: 10010` (`japanjunky-win95.css:7-22`). Read its height at runtime via `offsetHeight` (layout px, = 32) rather than hardcoding.
- Toolbox: `.jj-toolbox` z-index 10011; fan tools are `<button class="jj-toolbox__tool" data-tool="record|cassette|cd">` inside `#jj-toolbox-fan`; toolbox JS is `assets/japanjunky-toolbox.js` with a `close()` function in scope.
- Scripts are loaded at the end of `layout/theme.liquid`; the toolbox script tag is `<script src="{{ 'japanjunky-toolbox.js' | asset_url }}" defer></script>` (added in Tranche 1, immediately after the `japanjunky-win95-menu.js` tag).
- `--jj-tactile` bevel var defined in `japanjunky-base.css`.

---

## File Structure

- **Create:** `assets/japanjunky-player-physics.js` — pure physics (UMD): `clamp`, `step`, `isAtRest`. No DOM. The only unit-tested unit.
- **Create:** `assets/japanjunky-player.js` — the single player: DOM container, rAF loop, pointer drag/throw, resize, persistence, `window.JJ_Player` API. Depends on `window.JJ_PlayerPhysics`.
- **Create:** `vitest.config.js` — Vitest config (Node env).
- **Create:** `tests/player-physics.test.js` — physics unit tests.
- **Create:** `tests/sanity.test.js` — harness smoke test.
- **Modify:** `package.json` — add `vitest` devDependency + `test` script.
- **Modify:** `assets/japanjunky-win95.css` — append `.jj-player` styles.
- **Modify:** `assets/japanjunky-toolbox.js` — pointer drag-to-spawn on fan tools.
- **Modify:** `layout/theme.liquid` — load the two new scripts (physics before player).

**Coordinate convention (used everywhere):** a body's `x,y` is the container's **top-left in layout px**; `+y` is down. `bounds.maxX/maxY` are already inset by the body's size, so clamping the top-left into `[min,max]` keeps the whole body on screen. `bounds.maxY` is the floor = top edge of the taskbar.

---

### Task 1: Vitest harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/sanity.test.js`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added under devDependencies; `package-lock.json` created; exit 0.

- [ ] **Step 2: Add the test script to `package.json`**

Edit `package.json` so it reads (keep existing devDependencies, add `scripts`; the vitest version pin will be whatever step 1 installed):

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "gif-frames": "^1.0.1",
    "sharp": "^0.34.5",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
```

- [ ] **Step 4: Create `tests/sanity.test.js`**

```javascript
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the suite to verify the harness works**

Run: `npm test`
Expected: PASS — 1 test file, 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/sanity.test.js
git commit -m "test(toolbox): add vitest harness (tranche 2)"
```

---

### Task 2: Physics module (TDD)

**Files:**
- Create: `tests/player-physics.test.js`
- Create: `assets/japanjunky-player-physics.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/player-physics.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import Physics from '../assets/japanjunky-player-physics.js';

// Standard opts fixture. bounds inset by body size already.
function opts(over) {
  return Object.assign({
    gravity: 2000,
    restitution: 0.5,
    friction: 4.0,
    restThreshold: 24,
    bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 }
  }, over || {});
}

describe('clamp', () => {
  it('clamps below, within, above', () => {
    expect(Physics.clamp(-5, 0, 10)).toBe(0);
    expect(Physics.clamp(5, 0, 10)).toBe(5);
    expect(Physics.clamp(15, 0, 10)).toBe(10);
  });
});

describe('step — gravity (free fall, no collision)', () => {
  it('increases downward velocity and position', () => {
    var b = Physics.step({ x: 50, y: 0, vx: 0, vy: 0 }, 0.1, opts());
    expect(b.vy).toBeCloseTo(200, 5); // 0 + 2000*0.1
    expect(b.y).toBeCloseTo(20, 5);   // 0 + 200*0.1
    expect(b.x).toBe(50);
    expect(b.vx).toBe(0);
  });
});

describe('step — floor bounce', () => {
  it('clamps to floor and reverses vy with energy loss', () => {
    var b = Physics.step({ x: 100, y: 199, vx: 0, vy: 100 }, 0.1, opts());
    expect(b.y).toBe(200);       // clamped to floor (maxY)
    expect(b.vy).toBeLessThan(0); // reversed (now upward)
    expect(Math.abs(b.vy)).toBeLessThan(300); // less than pre-bounce speed
  });
});

describe('step — wall bounce', () => {
  it('reverses vx at the right wall', () => {
    var b = Physics.step({ x: 295, y: 50, vx: 200, vy: 0 }, 0.1, opts());
    expect(b.x).toBe(300);       // clamped to maxX
    expect(b.vx).toBeLessThan(0); // reversed
  });
  it('reverses vx at the left wall', () => {
    var b = Physics.step({ x: 5, y: 50, vx: -200, vy: 0 }, 0.1, opts());
    expect(b.x).toBe(0);          // clamped to minX
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('step — never escapes bounds', () => {
  it('stays in bounds across many steps from a corner with high velocity', () => {
    var o = opts();
    var b = { x: 0, y: 0, vx: 900, vy: -300 };
    for (var i = 0; i < 800; i++) {
      b = Physics.step(b, 0.016, o);
      expect(b.x).toBeGreaterThanOrEqual(o.bounds.minX);
      expect(b.x).toBeLessThanOrEqual(o.bounds.maxX);
      expect(b.y).toBeGreaterThanOrEqual(o.bounds.minY);
      expect(b.y).toBeLessThanOrEqual(o.bounds.maxY);
    }
  });
});

describe('step — floor friction', () => {
  it('reduces horizontal speed while on the floor', () => {
    var b = Physics.step({ x: 100, y: 200, vx: 200, vy: 0 }, 0.1, opts());
    expect(Math.abs(b.vx)).toBeLessThan(200);
    expect(Math.abs(b.vx)).toBeGreaterThan(0);
  });
});

describe('step + isAtRest — settling', () => {
  it('snaps tiny floor motion to a dead stop and reports rest', () => {
    var o = opts();
    var b = Physics.step({ x: 100, y: 200, vx: 5, vy: 0 }, 0.016, o);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.y).toBe(200);
    expect(Physics.isAtRest(b, o)).toBe(true);
  });
  it('is not at rest while airborne', () => {
    var o = opts();
    expect(Physics.isAtRest({ x: 100, y: 50, vx: 0, vy: 0 }, o)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../assets/japanjunky-player-physics.js` (module does not exist yet).

- [ ] **Step 3: Implement the physics module**

Create `assets/japanjunky-player-physics.js`:

```javascript
/**
 * japanjunky-player-physics.js
 * Pure 2D screen-space physics for the toolbox media player.
 *
 * UMD: attaches to window.JJ_PlayerPhysics when loaded as a classic <script>,
 * and exports via module.exports when required (Vitest). No DOM access.
 *
 * Coordinate space: body.x/y is the container top-left in layout px; +y is down.
 * opts.bounds.maxX/maxY are already inset by the body size, so clamping the
 * top-left into [min,max] keeps the whole body on screen. maxY is the floor
 * (top edge of the taskbar).
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_PlayerPhysics = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // Advance one body by dt seconds. Pure: returns a new body object.
  function step(body, dt, opts) {
    var b = opts.bounds;
    var vx = body.vx;
    var vy = body.vy + opts.gravity * dt;
    var x = body.x + vx * dt;
    var y = body.y + vy * dt;

    // Left / right walls
    if (x < b.minX) { x = b.minX; vx = -vx * opts.restitution; }
    else if (x > b.maxX) { x = b.maxX; vx = -vx * opts.restitution; }

    // Ceiling
    if (y < b.minY) { y = b.minY; vy = -vy * opts.restitution; }

    // Floor (top of taskbar)
    var onFloor = false;
    if (y >= b.maxY) {
      y = b.maxY;
      if (vy > 0) vy = -vy * opts.restitution;
      onFloor = true;
    }

    // Horizontal friction while resting on the floor (implicit damping)
    if (onFloor) {
      vx = vx / (1 + opts.friction * dt);
    }

    // Sleep: tiny motion on the floor settles to a dead stop
    if (onFloor &&
        Math.abs(vx) < opts.restThreshold &&
        Math.abs(vy) < opts.restThreshold) {
      vx = 0;
      vy = 0;
    }

    return { x: x, y: y, vx: vx, vy: vy };
  }

  function isAtRest(body, opts) {
    return body.vx === 0 && body.vy === 0 &&
           body.y >= opts.bounds.maxY - 0.5;
  }

  return { clamp: clamp, step: step, isAtRest: isAtRest };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all physics tests + the sanity test green.

- [ ] **Step 5: Commit**

```bash
git add tests/player-physics.test.js assets/japanjunky-player-physics.js
git commit -m "feat(toolbox): physics module with unit tests (tranche 2)"
```

---

### Task 3: Player container + CSS + script loading

**Files:**
- Create: `assets/japanjunky-player.js`
- Modify: `assets/japanjunky-win95.css` (append)
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Create the player module (spawn/despawn only)**

Create `assets/japanjunky-player.js`:

```javascript
/**
 * japanjunky-player.js
 * The single toolbox media player. Tranche 2: spawn/despawn a placeholder
 * box. Physics, drag, and persistence are layered on in later tasks.
 * The 3D model visual is Tranche 3.
 *
 * Exposes window.JJ_Player. Depends on window.JJ_PlayerPhysics.
 */
(function () {
  'use strict';

  var Physics = window.JJ_PlayerPhysics;
  var el = null;          // the player container element
  var currentTool = null; // 'record' | 'cassette' | 'cd' | null

  // html has zoom:2.5 — visual px (clientX, innerWidth) convert to layout px
  // (offsetWidth, transform) by dividing by this. Re-read on resize.
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  function setPosition(x, y) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    el.innerHTML = '<span class="jj-player__label">' + tool + '</span>';
    document.body.appendChild(el);
    setPosition(x, y);
  }

  function despawn() {
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
    currentTool = null;
  }

  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; }
  };
})();
```

- [ ] **Step 2: Append the player CSS**

Append to the end of `assets/japanjunky-win95.css`:

```css
/* --- Toolbox media player (placeholder visual until Tranche 3) --- */
.jj-player {
  position: fixed;
  top: 0;
  left: 0;
  width: 96px;
  height: 96px;
  z-index: 10009; /* below taskbar (10010) so it rests on top of it visually */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid var(--jj-secondary, #f5d742);
  box-shadow: var(--jj-tactile);
  color: var(--jj-secondary, #f5d742);
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 10px;
  text-transform: uppercase;
  text-align: center;
  cursor: grab;
  user-select: none;
  will-change: transform;
}

.jj-player--grabbed {
  cursor: grabbing;
}

.jj-player__label {
  padding: 2px;
  pointer-events: none;
}
```

- [ ] **Step 3: Load the scripts (physics before player)**

In `layout/theme.liquid`, find:

```liquid
  <script src="{{ 'japanjunky-toolbox.js' | asset_url }}" defer></script>
```

Add immediately after it:

```liquid
  <script src="{{ 'japanjunky-player-physics.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-player.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Manual smoke check**

In a browser preview, open the console on the homepage and run:

```js
JJ_Player.spawn('record', 100, 100); // a gold-bordered box labeled RECORD appears near top-left
JJ_Player.getType();                  // 'record'
JJ_Player.despawn();                  // box disappears
```

Expected: the placeholder box appears/disappears as described. (No falling yet — that's Task 4.)

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-player.js assets/japanjunky-win95.css layout/theme.liquid
git commit -m "feat(toolbox): player container + css + script loading (tranche 2)"
```

---

### Task 4: Physics loop (fall, bounce, settle, resize)

**Files:**
- Modify: `assets/japanjunky-player.js`

- [ ] **Step 1: Add the loop, bounds builder, and resize handler; wire them into spawn/despawn**

Replace the entire contents of `assets/japanjunky-player.js` with:

```javascript
/**
 * japanjunky-player.js
 * The single toolbox media player. Tranche 2: a placeholder box with gravity,
 * edge bounce, and settling on the taskbar. Drag/throw and persistence are
 * layered on in later tasks. The 3D model visual is Tranche 3.
 *
 * Exposes window.JJ_Player. Depends on window.JJ_PlayerPhysics.
 */
(function () {
  'use strict';

  var Physics = window.JJ_PlayerPhysics;
  var el = null;          // the player container element
  var currentTool = null; // 'record' | 'cassette' | 'cd' | null
  var body = null;        // { x, y, vx, vy } in layout px
  var rafId = null;
  var lastT = 0;

  // html has zoom:2.5 — visual px (clientX, innerWidth) convert to layout px
  // (offsetWidth, transform) by dividing by this. Re-read on resize.
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  function setPosition(x, y) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  // Build the physics options for the current viewport. Sizes from offsetWidth
  // (layout px); viewport from innerWidth/zoom (visual -> layout); floor is the
  // taskbar top.
  function buildOpts() {
    var taskbar = document.querySelector('.jj-taskbar');
    var taskbarH = taskbar ? taskbar.offsetHeight : 32;
    var w = el.offsetWidth || 96;
    var h = el.offsetHeight || 96;
    var vw = window.innerWidth / zoom;
    var vh = window.innerHeight / zoom;
    return {
      gravity: 2600,
      restitution: 0.55,
      friction: 4.0,
      restThreshold: 24,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, vw - w),
        maxY: Math.max(0, vh - taskbarH - h)
      }
    };
  }

  function startLoop() {
    if (rafId !== null) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // cap after tab switch to avoid tunneling
    var opts = buildOpts();
    body = Physics.step(body, dt, opts);
    setPosition(body.x, body.y);
    if (Physics.isAtRest(body, opts)) {
      stopLoop();
    }
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    el.innerHTML = '<span class="jj-player__label">' + tool + '</span>';
    document.body.appendChild(el);

    var opts = buildOpts();
    body = {
      x: Physics.clamp(x, opts.bounds.minX, opts.bounds.maxX),
      y: Physics.clamp(y, opts.bounds.minY, opts.bounds.maxY),
      vx: 0,
      vy: 0
    };
    setPosition(body.x, body.y);
    startLoop();
  }

  function despawn() {
    stopLoop();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    body = null;
    currentTool = null;
  }

  window.addEventListener('resize', function () {
    if (!el) return;
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var opts = buildOpts();
    body.x = Physics.clamp(body.x, opts.bounds.minX, opts.bounds.maxX);
    body.y = Physics.clamp(body.y, opts.bounds.minY, opts.bounds.maxY);
    setPosition(body.x, body.y);
    startLoop(); // re-settle if the floor moved
  });

  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; }
  };
})();
```

- [ ] **Step 2: Manual verification**

In a browser preview console:

```js
JJ_Player.spawn('record', 200, 0);
```

Expected: the box falls, bounces off the bottom (taskbar top) with decreasing height, settles resting on the taskbar, and never overlaps or passes the taskbar. Spawn near a side wall and confirm it bounces off left/right edges and never leaves the screen. Resize the window while it rests — it stays on-screen and re-settles on the taskbar.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-player.js
git commit -m "feat(toolbox): gravity, edge bounce, settle on taskbar (tranche 2)"
```

---

### Task 5: Drag and throw

**Files:**
- Modify: `assets/japanjunky-player.js`

- [ ] **Step 1: Add pointer drag/throw to the player**

In `assets/japanjunky-player.js`, add these drag state variables next to the other `var` declarations at the top of the IIFE (after `var lastT = 0;`):

```javascript
  var dragging = false;
  var grabDX = 0, grabDY = 0;   // cursor-to-topleft offset at grab (layout px)
  var lastPX = 0, lastPY = 0;   // last pointer pos (layout px) for velocity
  var lastPT = 0;               // last pointer time (ms)
  var velX = 0, velY = 0;       // tracked drag velocity (layout px/s)
  var THROW_MAX = 4000;         // clamp thrown speed (layout px/s)
```

Then add these three handlers immediately before the `function spawn(` declaration:

```javascript
  function onPointerDown(e) {
    e.preventDefault();
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    var px = e.clientX / zoom;
    var py = e.clientY / zoom;
    grabDX = px - body.x;
    grabDY = py - body.y;
    lastPX = px; lastPY = py; lastPT = performance.now();
    velX = 0; velY = 0;
    stopLoop();
    el.classList.add('jj-player--grabbed');
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    var px = e.clientX / zoom;
    var py = e.clientY / zoom;
    var now = performance.now();
    var dt = (now - lastPT) / 1000;
    if (dt > 0) {
      velX = (px - lastPX) / dt;
      velY = (py - lastPY) / dt;
    }
    lastPX = px; lastPY = py; lastPT = now;
    var opts = buildOpts();
    body.x = Physics.clamp(px - grabDX, opts.bounds.minX, opts.bounds.maxX);
    body.y = Physics.clamp(py - grabDY, opts.bounds.minY, opts.bounds.maxY);
    setPosition(body.x, body.y);
  }

  function onPointerUp(e) {
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.classList.remove('jj-player--grabbed');
    body.vx = Physics.clamp(velX, -THROW_MAX, THROW_MAX);
    body.vy = Physics.clamp(velY, -THROW_MAX, THROW_MAX);
    startLoop();
  }
```

Finally, register the drag start inside `spawn`, immediately after `document.body.appendChild(el);`:

```javascript
    el.addEventListener('pointerdown', onPointerDown);
```

- [ ] **Step 2: Manual verification**

In a browser preview:

```js
JJ_Player.spawn('cassette', 200, 0);
```

Expected: after it settles, press and hold the box and drag it around — it follows the cursor (no gravity while held). Release while moving — it flies off in the throw direction, bounces off edges, and settles back on the taskbar. It never leaves the viewport during or after the throw.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-player.js
git commit -m "feat(toolbox): grab and throw the player (tranche 2)"
```

---

### Task 6: Persistence across navigation

**Files:**
- Modify: `assets/japanjunky-player.js`

- [ ] **Step 1: Add save/restore and wire into the lifecycle**

In `assets/japanjunky-player.js`, add the storage key with the other top-of-IIFE `var`s:

```javascript
  var STORE_KEY = 'jj-player';
```

Add these functions immediately before `window.JJ_Player = {`:

```javascript
  function save() {
    try {
      if (!currentTool || !body) return;
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        tool: currentTool, x: body.x, y: body.y
      }));
    } catch (e) { /* sessionStorage unavailable — ignore */ }
  }

  function clearSaved() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.tool) spawn(s.tool, s.x, s.y);
    } catch (e) { /* malformed — ignore */ }
  }
```

Persist when the player settles: in `tick`, inside the `if (Physics.isAtRest(body, opts)) {` block, after `stopLoop();` add:

```javascript
      save();
```

Persist a fresh spawn position: in `spawn`, on the line after `startLoop();` add:

```javascript
    save();
```

Clear on despawn: in `despawn`, after `currentTool = null;` add:

```javascript
    clearSaved();
```

Restore on load: add at the very end of the IIFE, immediately after the `window.JJ_Player = { ... };` assignment:

```javascript
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }
```

- [ ] **Step 2: Manual verification**

In a browser preview:
1. `JJ_Player.spawn('cd', 200, 0)`, let it settle, note its resting position.
2. Navigate to another page (click a product/collection link).
3. Expected: the CD player re-appears at (approximately) the same resting spot, at rest.
4. `JJ_Player.despawn()`, then reload — expected: no player re-appears (storage cleared).

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-player.js
git commit -m "feat(toolbox): persist player across navigation (tranche 2)"
```

---

### Task 7: Toolbox drag-to-spawn

**Files:**
- Modify: `assets/japanjunky-toolbox.js`

- [ ] **Step 1: Wire fan tools to spawn the player**

In `assets/japanjunky-toolbox.js`, add the following immediately before the final `})();` (after the Escape keydown listener). It attaches a pointer drag to each fan tool; releasing anywhere spawns the player centred on the release point and closes the fan. `close()` is already defined in this IIFE's scope.

```javascript
  // --- Drag (or click) a fan tool to spawn its player (Tranche 2) ---
  var PLAYER_HALF = 48; // half of the 96px player, to centre it on the cursor

  function spawnFromTool(toolEl, clientX, clientY) {
    if (!window.JJ_Player) return;
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var x = clientX / zoom - PLAYER_HALF;
    var y = clientY / zoom - PLAYER_HALF;
    window.JJ_Player.spawn(toolEl.getAttribute('data-tool'), x, y);
    close();
  }

  var tools = toolbox.querySelectorAll('.jj-toolbox__tool');
  for (var i = 0; i < tools.length; i++) {
    (function (toolEl) {
      toolEl.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { toolEl.setPointerCapture(e.pointerId); } catch (err) {}

        function onUp(ev) {
          toolEl.removeEventListener('pointerup', onUp);
          try { toolEl.releasePointerCapture(ev.pointerId); } catch (err) {}
          spawnFromTool(toolEl, ev.clientX, ev.clientY);
        }
        toolEl.addEventListener('pointerup', onUp);
      });
    })(tools[i]);
  }
```

- [ ] **Step 2: Manual verification**

In a browser preview on the homepage:
1. Click the toolbox button (bottom-right) to open the fan.
2. Drag the **LP** tool out onto the middle of the screen and release.
3. Expected: a RECORD player spawns at the release point, falls, and settles on the taskbar; the fan closes.
4. Repeat with **CS** and **CD** — each replaces the previous player (one at a time).
5. A plain click on a tool (no drag) also spawns it (near the toolbox) — acceptable.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-toolbox.js
git commit -m "feat(toolbox): drag a fan tool to spawn its player (tranche 2)"
```

---

### Task 8: Full manual regression

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all physics + sanity tests pass.

- [ ] **Step 2: Browser checklist**

On the homepage and one collection/product page, confirm:

1. Open the toolbox fan; drag each of the three tools out — the matching player spawns, falls, and settles on the taskbar.
2. Only one player exists at a time (spawning a new one removes the old).
3. The player bounces off the left, right, and top edges and never leaves the viewport.
4. The player rests on top of the taskbar without overlapping it.
5. Grab and throw the player — momentum + bounce + re-settle all work; cursor shows grab/grabbing.
6. Navigate to another page — the player reappears at its resting position.
7. `JJ_Player.despawn()` then reload — no player returns.
8. Resize the window with a player out — it stays on-screen and re-settles.
9. The Tranche 1 fan open/close behaviour still works (button toggle, outside click, Escape).

- [ ] **Step 3: Record the result**

If all pass, Tranche 2 is complete. If any fail, fix inline (physics constants in `buildOpts`, or zoom conversion, are the usual culprits) and re-verify.

---

## Self-Review

**Spec coverage (Tranche 2 scope):**
- "Drag a tool out → spawn chosen player" → Task 7 (+ `JJ_Player.spawn` Tasks 3–4). ✓
- "One active player … dragging out a new tool replaces it" → `spawn()` calls `despawn()` first (Task 3/4); manual check 2. ✓
- "Physics engine: gravity, velocity, restitution; floor = taskbar top; clamps to viewport; grab/throw imparts velocity; settles" → Task 2 (pure) + Tasks 4–5 (wiring). ✓
- "Persist across pages via sessionStorage; re-spawn on load; audio not restored (N/A this tranche)" → Task 6. ✓
- "Reuses product-viewer WebGL pattern / 3D models" → intentionally deferred to Tranche 3; this tranche uses a CSS placeholder (stated in spec tranche list). ✓
- "Desktop-first (Pointer Events for mouse)" → pointer handlers, no touch-specific work. ✓
- Physics unit-testable pure functions; format gate / audio path selection are **not** in this tranche (Tranches 4–5). ✓

**Placeholder scan:** No TBD/TODO; all steps contain complete code or exact commands; the CSS "placeholder box" is the intended Tranche-2 visual, not an unfinished stub. ✓

**Type/name consistency across tasks:**
- Physics API `clamp(v,lo,hi)`, `step(body,dt,opts)`, `isAtRest(body,opts)` — defined in Task 2, consumed identically in Tasks 4–5. ✓
- `body` shape `{x,y,vx,vy}` consistent in tests, physics, and player. ✓
- `opts` shape `{gravity,restitution,friction,restThreshold,bounds:{minX,minY,maxX,maxY}}` consistent between `buildOpts` (Task 4) and the test fixture (Task 2). ✓
- Globals `window.JJ_PlayerPhysics` (Task 2) and `window.JJ_Player` (Tasks 3–6) referenced consistently; toolbox uses `window.JJ_Player.spawn` (Task 7). ✓
- Functions added across tasks (`buildOpts`, `startLoop`, `stopLoop`, `tick`, `onPointerDown/Move/Up`, `save`, `clearSaved`, `restore`) are each defined once and referenced by the exact same name. ✓
- CSS classes `.jj-player`, `.jj-player--grabbed`, `.jj-player__label` consistent between CSS (Task 3) and JS (Tasks 3–5). ✓
```
