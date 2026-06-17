# Toolbox Media Players — Tranche 1: Toolbox + Fan Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-right toolbox button that opens a radial "fan" menu of three tool icons (record player, cassette Walkman, CD Walkman), with open/close interaction matching the existing Win95 start menu.

**Architecture:** A new Liquid snippet renders the toolbox button + fan markup inside the existing taskbar footer section. CSS in `japanjunky-win95.css` styles the button (reusing the `--jj-tactile` bevel) and animates the three items into a radial arc. A small vanilla-JS IIFE (`japanjunky-toolbox.js`) toggles the open state and closes on outside-click / Escape, mirroring `japanjunky-win95-menu.js`. No drag, spawning, 3D, or audio in this tranche — those are Tranches 2–5.

**Tech Stack:** Shopify Liquid, CSS (CRT/Win95 design system, `jj-` prefix), vanilla ES5-style JS (matches existing files).

**Testing note:** This repo has no JS test harness (only `sharp`/`gif-frames` image tooling) and follows a manual-browser-regression convention. Tranche 1 is DOM/CSS + a UI toggle with no pure logic worth unit-testing, so verification here is a manual browser checklist. A real test runner (Vitest) is introduced in Tranche 2, where the physics pure-functions justify it.

---

## File Structure

- **Create:** `snippets/win95-toolbox.liquid` — toolbox button + fan menu markup (three `data-tool` items). One responsibility: the toolbox DOM.
- **Create:** `assets/japanjunky-toolbox.js` — open/close interaction only (this tranche). Will grow to own spawn/physics in later tranches.
- **Modify:** `sections/jj-footer-win95.liquid` — render the snippet so the toolbox appears wherever the taskbar does.
- **Modify:** `assets/japanjunky-win95.css` — append toolbox + fan styles.
- **Modify:** `layout/theme.liquid` — load `japanjunky-toolbox.js`.

**Reference facts (verified in codebase):**
- Taskbar `.jj-taskbar`: `position: fixed; bottom: 0; height: 32px; z-index: 10010` (`japanjunky-win95.css:7`).
- CRT shader canvas sits at `z-index: 10002`; UI must beat it.
- Start menu open/close pattern lives in `japanjunky-win95-menu.js:15-41` (toggle class, outside-click, Escape).
- Tactile bevel vars `--jj-tactile` / `--jj-tactile-pressed` defined in `japanjunky-base.css`.
- Footer section already does `{% render 'win95-start-menu' %}` at `sections/jj-footer-win95.liquid:1`.
- `japanjunky-win95-menu.js` is loaded at `layout/theme.liquid:281` via `<script ... defer>`.

---

### Task 1: Toolbox snippet markup

**Files:**
- Create: `snippets/win95-toolbox.liquid`

- [ ] **Step 1: Create the snippet**

Create `snippets/win95-toolbox.liquid` with exactly:

```liquid
{%- comment -%}
  Toolbox — bottom-right fan menu of media-player tools. Tranche 1 renders the
  button + fan only; dragging a tool to spawn a player arrives in Tranche 2.
  Tool icons are placeholder ASCII glyphs until the 3D models land (Tranche 3).
{%- endcomment -%}
<div class="jj-toolbox" id="jj-toolbox">
  <div class="jj-toolbox__fan" id="jj-toolbox-fan" role="menu" aria-label="Media players" hidden>
    <button type="button" class="jj-toolbox__tool" data-tool="record"
            role="menuitem" aria-label="Record player" title="Record player">
      <span class="jj-toolbox__tool-glyph" aria-hidden="true">LP</span>
    </button>
    <button type="button" class="jj-toolbox__tool" data-tool="cassette"
            role="menuitem" aria-label="Cassette Walkman" title="Cassette Walkman">
      <span class="jj-toolbox__tool-glyph" aria-hidden="true">CS</span>
    </button>
    <button type="button" class="jj-toolbox__tool" data-tool="cd"
            role="menuitem" aria-label="CD Walkman" title="CD Walkman">
      <span class="jj-toolbox__tool-glyph" aria-hidden="true">CD</span>
    </button>
  </div>
  <button type="button" class="jj-toolbox__btn" id="jj-toolbox-btn"
          aria-expanded="false" aria-controls="jj-toolbox-fan" aria-label="Open media players">
    <span class="jj-toolbox__btn-glyph" aria-hidden="true">&#9636;</span>
  </button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add snippets/win95-toolbox.liquid
git commit -m "feat(toolbox): fan menu markup (tranche 1)"
```

---

### Task 2: Render the snippet in the taskbar footer

**Files:**
- Modify: `sections/jj-footer-win95.liquid:1`

- [ ] **Step 1: Add the render tag**

In `sections/jj-footer-win95.liquid`, change the first line from:

```liquid
{% render 'win95-start-menu' %}
```

to:

```liquid
{% render 'win95-start-menu' %}
{% render 'win95-toolbox' %}
```

- [ ] **Step 2: Commit**

```bash
git add sections/jj-footer-win95.liquid
git commit -m "feat(toolbox): render toolbox in taskbar footer (tranche 1)"
```

---

### Task 3: Toolbox + fan menu CSS

**Files:**
- Modify: `assets/japanjunky-win95.css` (append at end of file)

- [ ] **Step 1: Append the styles**

Append to the end of `assets/japanjunky-win95.css`:

```css
/* --- Toolbox + fan menu --- */
.jj-toolbox {
  position: fixed;
  right: 8px;
  bottom: 40px; /* clears the 32px taskbar + a small gap */
  z-index: 10011; /* above taskbar (10010) and CRT canvas (10002) */
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}

.jj-toolbox__btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--jj-secondary, #f5d742);
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #444;
  cursor: default;
  position: relative;
  box-shadow: var(--jj-tactile);
  transition: transform 60ms steps(1), box-shadow 60ms steps(1);
}

.jj-toolbox__btn:hover {
  border-color: var(--jj-secondary, #f5d742);
  text-shadow: 0 0 6px rgba(245, 215, 66, 0.5);
}

.jj-toolbox__btn:active,
.jj-toolbox--open .jj-toolbox__btn {
  transform: translate(2px, 2px);
  box-shadow: var(--jj-tactile-pressed);
}

.jj-toolbox__btn-glyph {
  line-height: 1;
}

/* Fan container anchored to the button's bottom-right corner */
.jj-toolbox__fan {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 34px;
  height: 34px;
}

.jj-toolbox__fan[hidden] {
  display: none;
}

/* Each tool starts collapsed under the button, then fans out when open */
.jj-toolbox__tool {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--jj-accent, #33ff33);
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #444;
  cursor: default;
  box-shadow: var(--jj-tactile);
  opacity: 0;
  transform: translate(0, 0) scale(0.6);
  transition: transform 140ms steps(3), opacity 140ms steps(3);
}

.jj-toolbox__tool:hover {
  border-color: var(--jj-accent, #33ff33);
  text-shadow: 0 0 6px rgba(51, 255, 51, 0.5);
}

.jj-toolbox__tool:active {
  transform: translate(2px, 2px);
  box-shadow: var(--jj-tactile-pressed);
}

/* Open state: arc up-and-left from the bottom-right button */
.jj-toolbox--open .jj-toolbox__tool {
  opacity: 1;
}

.jj-toolbox--open .jj-toolbox__tool[data-tool="record"] {
  transform: translate(0, -44px) scale(1);
  transition-delay: 0ms;
}

.jj-toolbox--open .jj-toolbox__tool[data-tool="cassette"] {
  transform: translate(-32px, -32px) scale(1);
  transition-delay: 45ms;
}

.jj-toolbox--open .jj-toolbox__tool[data-tool="cd"] {
  transform: translate(-44px, 0) scale(1);
  transition-delay: 90ms;
}

@media (prefers-reduced-motion: reduce) {
  .jj-toolbox__tool {
    transition-duration: 0ms;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-win95.css
git commit -m "feat(toolbox): button + radial fan styles (tranche 1)"
```

---

### Task 4: Toolbox open/close JS

**Files:**
- Create: `assets/japanjunky-toolbox.js`
- Modify: `layout/theme.liquid:281`

- [ ] **Step 1: Create the JS module**

Create `assets/japanjunky-toolbox.js` with exactly:

```javascript
/**
 * Japanjunky - Toolbox (Tranche 1: open/close only)
 *
 * Toggles the bottom-right toolbox fan menu. Mirrors the start menu:
 * click toggles, outside click closes, Escape closes. Dragging a tool to
 * spawn a 3D player is added in Tranche 2.
 */
(function () {
  'use strict';

  var toolbox = document.getElementById('jj-toolbox');
  var btn = document.getElementById('jj-toolbox-btn');
  var fan = document.getElementById('jj-toolbox-fan');
  if (!toolbox || !btn || !fan) return;

  function open() {
    fan.hidden = false;
    toolbox.classList.add('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    toolbox.classList.remove('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'false');
    // Keep the element in the DOM during the collapse transition, then hide.
    fan.hidden = true;
  }

  function isOpen() {
    return toolbox.classList.contains('jj-toolbox--open');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isOpen()) { close(); } else { open(); }
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (isOpen() && !toolbox.contains(e.target)) close();
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      close();
      btn.focus();
    }
  });
})();
```

- [ ] **Step 2: Load the script**

In `layout/theme.liquid`, find line 281:

```liquid
  <script src="{{ 'japanjunky-win95-menu.js' | asset_url }}" defer></script>
```

Add immediately after it:

```liquid
  <script src="{{ 'japanjunky-toolbox.js' | asset_url }}" defer></script>
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-toolbox.js layout/theme.liquid
git commit -m "feat(toolbox): open/close interaction (tranche 1)"
```

---

### Task 5: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Push to a preview environment**

The Shopify GitHub integration syncs `main`, but do NOT merge to `main` for verification. Use the Shopify CLI theme preview against the current branch if available:

Run: `shopify theme dev` (from the theme root, if Shopify CLI is installed)
Expected: a local preview URL. If the CLI is unavailable, push the feature branch and use the Shopify admin "Preview" for that branch's theme, or ask the user to preview.

- [ ] **Step 2: Verify the checklist in the browser**

Confirm each, on the homepage and one product/collection page:

1. A toolbox button (▢ glyph) appears at the bottom-right, sitting just above the taskbar, not overlapping it.
2. Clicking the button fans out three tools (LP, CS, CD) in an arc up-and-to-the-left, staggered.
3. The button shows the pressed/inset bevel while open.
4. Clicking the button again collapses the fan.
5. Clicking anywhere outside the toolbox collapses the fan.
6. Pressing Escape collapses the fan and returns focus to the button.
7. Hover states: button glows gold, tools glow green; bevel presses on `:active`.
8. The fan never paints under the CRT canvas or the taskbar (z-index correct).
9. Resize the window — the toolbox stays anchored bottom-right above the taskbar.

- [ ] **Step 3: Record the result**

If all pass, Tranche 1 is complete. If any fail, fix inline (CSS positions in Task 3 are the usual culprit for arc geometry) and re-verify.

---

## Self-Review

**Spec coverage (Tranche 1 scope only):**
- Spec component #1 "Toolbox + fan menu — fixed button above taskbar, click → 3 tool icons fan out, `data-tool`, closes on outside click/Escape, mirrors start menu" → Tasks 1–5. ✓
- Out-of-scope for T1 (drag-to-spawn, 3D, physics, audio, persistence) → intentionally deferred to later tranches. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; tool glyphs are intentional ASCII placeholders per the spec (3D models are Tranche 3). ✓

**Type/name consistency:** IDs and classes match across snippet, CSS, and JS — `jj-toolbox`, `jj-toolbox-btn`/`jj-toolbox__btn`, `jj-toolbox-fan`/`jj-toolbox__fan`, `jj-toolbox__tool`, state class `jj-toolbox--open`, `data-tool` values `record|cassette|cd`. JS references only `jj-toolbox`, `jj-toolbox-btn`, `jj-toolbox-fan`, which exist in the snippet. ✓
```
