# Mobile Handheld Mode — Phase 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up mobile mode: a load-time `JJ_MOBILE` gate, zoom-1 foundation, desktop-only systems disabled, and Windows CE-style handheld chrome (top taskbar, drop-down start menu, bottom command bar, fullscreen explorer windows).

**Architecture:** One boolean decided at load (`window.JJ_MOBILE` + `html.jj-mobile` class) gates everything. All mobile CSS lives in one new file (`assets/japanjunky-mobile.css`), every rule prefixed `html.jj-mobile` — desktop rendering must be byte-identical when the class is absent. JS systems check `window.JJ_MOBILE` and no-op.

**Tech Stack:** Shopify Liquid theme, vanilla JS (IIFE per file), plain CSS. No build step. Verification via `shopify theme dev` + Playwright device emulation.

## Global Constraints

- Branch `mobile-handheld` only. NEVER merge/push to `main` in this plan — main auto-deploys to the live store.
- Fixedsys Excelsior stays everywhere; no font changes.
- No rounded corners; no bounce/slide/elastic animations; CRT lexicon.
- All new CSS keyed on `html.jj-mobile` (class selector, not width media queries).
- CSS prefix `jj-`, BEM-like `jj-[component]__[element]--[modifier]`.
- Never write `@media (prefers-reduced-motion)` blocks.
- Comment density/style: match surrounding files (block comments explaining constraints).

---

### Task 1: Mobile gate

**Files:**
- Modify: `layout/theme.liquid` (after the reduced-motion shim IIFE, ~line 82)
- Modify: `assets/japanjunky-crt-shader.js:473-480`

**Interfaces:**
- Produces: `window.JJ_MOBILE` (boolean, set before any deferred script runs), `html.jj-mobile` class, `html.jj-crt-no-barrel` class on mobile. Every later task keys off these.

- [ ] **Step 1: Add the gate script to theme.liquid**

Insert inside the existing `<script>` block, immediately after the reduced-motion IIFE closes (`})();`) and before `window.JJ_CURSOR_SETS = {`:

```js
    /* Mobile handheld mode (spec: docs/superpowers/specs/2026-07-14-mobile-
       handheld-design.md). One load-time decision — no live switching. A
       coarse pointer + narrow viewport = handheld device; CSS keys off the
       html class so desktop and mobile can never half-blend. The barrel
       filter is skipped on handhelds (same jj-crt-no-barrel path Firefox
       uses) — crt-shader.js checks JJ_MOBILE before initBarrelDistortion. */
    window.JJ_MOBILE = !!(window.matchMedia
      && window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches);
    if (window.JJ_MOBILE) {
      document.documentElement.classList.add('jj-mobile');
      document.documentElement.classList.add('jj-crt-no-barrel');
    }
```

- [ ] **Step 2: Skip barrel init on mobile in crt-shader.js**

At `assets/japanjunky-crt-shader.js`, the init currently reads:

```js
    if (isGecko) {
      document.documentElement.classList.add('jj-crt-no-barrel');
    } else {
      initBarrelDistortion(cfg);
    }
```

Change to:

```js
    if (isGecko || window.JJ_MOBILE) {
      document.documentElement.classList.add('jj-crt-no-barrel');
    } else {
      initBarrelDistortion(cfg);
    }
```

- [ ] **Step 3: Static check**

Run: `Select-String -Path "layout/theme.liquid" -Pattern "JJ_MOBILE"` and `Select-String -Path "assets/japanjunky-crt-shader.js" -Pattern "JJ_MOBILE"`
Expected: gate script present once in theme.liquid; one `isGecko || window.JJ_MOBILE` in crt-shader.js.

- [ ] **Step 4: Commit**

```bash
git add layout/theme.liquid assets/japanjunky-crt-shader.js
git commit -m "feat(mobile): JJ_MOBILE load-time gate + no-barrel CRT profile"
```

---

### Task 2: Mobile foundation stylesheet

**Files:**
- Create: `assets/japanjunky-mobile.css`
- Modify: `layout/theme.liquid` (stylesheet tags block, after `japanjunky-bundle.css` ~line 44)

**Interfaces:**
- Consumes: `html.jj-mobile` from Task 1.
- Produces: `assets/japanjunky-mobile.css` — the single home for ALL mobile rules; later tasks append sections to this file.

- [ ] **Step 1: Create the stylesheet**

```css
/* ============================================
   JAPANJUNKY MOBILE (handheld mode)
   Pocket PC / Windows CE translation of the Win98 CRT desktop.
   EVERY rule here is keyed on html.jj-mobile (set by the load-time
   gate in theme.liquid) — with the class absent this file is inert,
   so desktop rendering is untouched by construction.
   Spec: docs/superpowers/specs/2026-07-14-mobile-handheld-design.md
   ============================================ */

/* --- Foundation --- */
/* Desktop chunky-pixel look comes from html{zoom:2.5}; a phone viewport
   (~390 CSS px) divided by 2.5 leaves ~156px of layout — unusable. The
   handheld runs at zoom 1 and native font sizes. */
html.jj-mobile {
  zoom: 1;
}

/* Comfortable thumb targets: WinCE-era chrome was stylus-sized; ours
   must be finger-sized. Applies to system chrome buttons only — content
   layout tasks size their own. */
html.jj-mobile .jj-start-btn,
html.jj-mobile .jj-action-btn,
html.jj-mobile .jj-explorer__ctl {
  min-height: 40px;
  min-width: 40px;
}
```

- [ ] **Step 2: Load it in theme.liquid**

After the `japanjunky-bundle.css` stylesheet_tag line add:

```liquid
  {{ 'japanjunky-mobile.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 3: Static check**

Run: `Select-String -Path "assets/japanjunky-mobile.css" -Pattern "^html\.jj-mobile|^/\*| *html\.jj-mobile" -NotMatch | Select-String -Pattern "\{"`
Expected: no selector lines outside `html.jj-mobile` scope (every rule block starts with `html.jj-mobile`).

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-mobile.css layout/theme.liquid
git commit -m "feat(mobile): foundation stylesheet — zoom 1, thumb targets"
```

---

### Task 3: Gate desktop-only JS systems

**Files:**
- Modify: `assets/japanjunky-cursor-light.js:14` (top of IIFE)
- Modify: `assets/japanjunky-guy.js:16` (top of IIFE)
- Modify: `assets/japanjunky-toolbox.js:9` (top of IIFE)
- Modify: `assets/japanjunky-explorer.js` (drag + resize bindings)

**Interfaces:**
- Consumes: `window.JJ_MOBILE`.
- Produces: nothing new — these systems simply absent on mobile.

- [ ] **Step 1: Early-return guards**

In each of cursor-light.js, guy.js, toolbox.js, add as the first statement after `'use strict';`:

```js
  // Handheld mode: no pointer → no custom cursors / drag physics / hover
  // fan menu. Each returns in Phase 5 with a touch design or stays desktop.
  if (window.JJ_MOBILE) return;
```

(Adjust the comment per file: cursors / guy character / toolbox players.)

- [ ] **Step 2: Explorer — skip drag and resize on mobile**

In `assets/japanjunky-explorer.js`, wrap the titlebar drag binding (`if (bar) { bar.addEventListener('pointerdown', ...` ) and the whole resize-edge binding section in:

```js
  if (!window.JJ_MOBILE) {
    // ...existing drag/resize bindings unchanged...
  }
```

Do NOT gate minimize/close/address-bar/folder-view — those work on touch.

- [ ] **Step 3: Static check**

Run: `Select-String -Path "assets/japanjunky-cursor-light.js","assets/japanjunky-guy.js","assets/japanjunky-toolbox.js","assets/japanjunky-explorer.js" -Pattern "JJ_MOBILE"`
Expected: one guard per file (explorer may have two).

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-cursor-light.js assets/japanjunky-guy.js assets/japanjunky-toolbox.js assets/japanjunky-explorer.js
git commit -m "feat(mobile): gate cursor/guy/toolbox/explorer-resize off on handheld"
```

---

### Task 4: Handheld top taskbar + drop-down start menu

**Files:**
- Modify: `assets/japanjunky-mobile.css` (append)
- Read first: `assets/japanjunky-win95.css:7-30` (taskbar), `:374-390` (start menu), win95-volume popup block (~:544), `snippets/win95-start-menu.liquid`, `assets/japanjunky-win95-menu.js` (grep for `bottom`/geometry math before writing overrides)

**Interfaces:**
- Consumes: existing taskbar DOM from `sections/jj-footer-win95.liquid` (unchanged).
- Produces: `--jj-mobile-topbar-h: 40px` and `--jj-mobile-cmdbar-h: 48px` CSS vars on `html.jj-mobile` — Tasks 5 and 6 consume them.

- [ ] **Step 1: Append chrome section to japanjunky-mobile.css**

```css
/* --- Handheld chrome: WinCE top taskbar --- */
/* Windows CE puts the taskbar at the TOP (Start left, tray right) and
   runs every app fullscreen — period-correct AND touch-correct. Same
   taskbar DOM as desktop; only geometry moves. */
html.jj-mobile {
  --jj-mobile-topbar-h: 40px;
  --jj-mobile-cmdbar-h: 48px;
}

html.jj-mobile .jj-taskbar {
  top: 0;
  bottom: auto;
  height: var(--jj-mobile-topbar-h);
  border-top: none;
  border-bottom: 1px solid #333;
}

/* Fullscreen apps make window tabs meaningless on the handheld. */
html.jj-mobile #jj-taskbar-tabs {
  display: none;
}

/* Start menu drops DOWN from the top bar, full width. */
html.jj-mobile .jj-start-menu {
  top: var(--jj-mobile-topbar-h);
  bottom: auto;
  left: 0;
  right: 0;
  width: auto;
  max-height: calc(100vh - var(--jj-mobile-topbar-h) - var(--jj-mobile-cmdbar-h));
  overflow-y: auto;
  margin-bottom: 0;
  margin-top: 2px;
}

/* Volume popup anchors under the tray instead of above it. */
html.jj-mobile .jj-vol-popup {
  top: calc(var(--jj-mobile-topbar-h) + 4px);
  bottom: auto;
}
```

(Exact selector for the volume popup: confirm the class in `snippets/win95-volume.liquid` before writing — plan assumes `.jj-vol-popup`; if it differs, use the real one.)

- [ ] **Step 2: Check win95-menu.js geometry assumptions**

Run: `Select-String -Path "assets/japanjunky-win95-menu.js" -Pattern "bottom|getBoundingClientRect|innerHeight"`
For each hit that positions the menu or crops the Tsuno sprite relative to a bottom-anchored bar, add a `window.JJ_MOBILE` branch that mirrors the math for top anchoring. If hits only toggle classes, no JS change needed.

- [ ] **Step 3: Tsuno start-logo overflow**

Desktop: horns overflow the taskbar upward. On a top bar they must overflow DOWNWARD or be cropped. Simplest correct v1 — crop to the bar:

```css
/* Tsuno horns overflow upward on desktop; on a top bar that clips into
   the notch/status area. Crop to the bar height for v1. */
html.jj-mobile .jj-start-btn__tsuno {
  top: 0;
  bottom: auto;
  height: var(--jj-mobile-topbar-h);
  overflow: hidden;
}
```

(Verify against the real `.jj-start-btn__tsuno` rules at japanjunky-win95.css:140-160 — mirror whatever geometry properties they set.)

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-mobile.css assets/japanjunky-win95-menu.js
git commit -m "feat(mobile): WinCE top taskbar + drop-down start menu"
```

---

### Task 5: Bottom command bar

**Files:**
- Create: `snippets/jj-mobile-commandbar.liquid`
- Modify: `sections/jj-footer-win95.liquid` (render after `</footer>`)
- Modify: `assets/japanjunky-mobile.css` (append)

**Interfaces:**
- Consumes: `--jj-mobile-cmdbar-h` from Task 4; `routes.cart_url`, `routes.search_url`, `routes.all_products_collection_url`.
- Produces: `#jj-cmdbar` element with `#jj-cmdbar-cart-count` badge span (cart JS may update it in a later phase).

- [ ] **Step 1: Create the snippet**

```liquid
{%- comment -%} Handheld bottom command bar — thumb-zone nav (Pocket PC
    command bar). Rendered on all pages; display gated to html.jj-mobile
    in japanjunky-mobile.css so desktop never shows it. {%- endcomment -%}
<nav class="jj-cmdbar" id="jj-cmdbar" aria-label="Quick navigation">
  <a class="jj-cmdbar__btn" href="{{ routes.all_products_collection_url }}">CATALOG</a>
  <a class="jj-cmdbar__btn" href="{{ routes.search_url }}">SEARCH</a>
  <a class="jj-cmdbar__btn" href="{{ routes.cart_url }}">CART{% if cart.item_count > 0 %}<span class="jj-cmdbar__count" id="jj-cmdbar-cart-count">{{ cart.item_count }}</span>{% endif %}</a>
  <a class="jj-cmdbar__btn" href="/pages/watchlist">WATCH</a>
</nav>
```

- [ ] **Step 2: Render it in the footer section**

In `sections/jj-footer-win95.liquid`, after the closing `</footer>` add:

```liquid
{% render 'jj-mobile-commandbar' %}
```

- [ ] **Step 3: Style it (append to japanjunky-mobile.css)**

```css
/* --- Handheld chrome: bottom command bar --- */
/* Hidden by default (desktop); only the handheld class reveals it. */
.jj-cmdbar {
  display: none;
}

html.jj-mobile .jj-cmdbar {
  display: flex;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--jj-mobile-cmdbar-h);
  background: var(--jj-win95-bar);
  border-top: 1px solid #333;
  z-index: 9000;
}

html.jj-mobile .jj-cmdbar__btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--jj-text);
  text-decoration: none;
  box-shadow: var(--jj-tactile);
  margin: 4px;
}

html.jj-mobile .jj-cmdbar__btn:active {
  box-shadow: var(--jj-tactile-pressed);
  transform: translate(2px, 2px);
}

html.jj-mobile .jj-cmdbar__count {
  color: var(--jj-secondary);
}
```

(z-index: check what the taskbar uses in japanjunky-win95.css and match it, so both bars sit in the same chrome layer under the CRT overlay at 9998.)

- [ ] **Step 4: Commit**

```bash
git add snippets/jj-mobile-commandbar.liquid sections/jj-footer-win95.liquid assets/japanjunky-mobile.css
git commit -m "feat(mobile): bottom command bar (catalog/search/cart/watchlist)"
```

---

### Task 6: Fullscreen explorer windows

**Files:**
- Modify: `assets/japanjunky-mobile.css` (append)
- Read first: `snippets/win98-explorer.liquid` + its CSS (grep `jj-explorer` across assets/*.css) for the real maximized-state selectors (`.jj-explorer--max`).

**Interfaces:**
- Consumes: `--jj-mobile-topbar-h`, `--jj-mobile-cmdbar-h`; explorer DOM ids from japanjunky-explorer.js (`jj-explorer`, `jj-explorer-max`, etc.).
- Produces: explorer permanently fullscreen on mobile; later phases put page content in it unchanged.

- [ ] **Step 1: Append explorer section to japanjunky-mobile.css**

Mirror the existing `.jj-explorer--max` geometry but pinned between the bars (read the real rules first and copy their property set):

```css
/* --- Fullscreen explorer --- */
/* WinCE apps are always maximized: window fills the strip between the
   top taskbar and the command bar. Resize/min/max are desktop-only. */
html.jj-mobile .jj-explorer {
  position: fixed;
  top: var(--jj-mobile-topbar-h);
  left: 0;
  right: 0;
  bottom: var(--jj-mobile-cmdbar-h);
  width: auto;
  height: auto;
  margin: 0;
  transform: none !important; /* neutralize any stale drag translate */
}

html.jj-mobile #jj-explorer-min,
html.jj-mobile #jj-explorer-max,
html.jj-mobile .jj-explorer__resize {
  display: none;
}
```

(`.jj-explorer__resize` — confirm the real resize-handle class name in win98-explorer.liquid; use whatever exists.)

- [ ] **Step 2: Touch scrolling inside the window**

Check the main pane's overflow (grep `jj-explorer__main|#jj-explorer-main` in CSS). If it scrolls via the custom JS scrollbar only, add:

```css
html.jj-mobile #jj-explorer-main {
  overflow-y: auto;
  touch-action: pan-y;
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-mobile.css
git commit -m "feat(mobile): explorer windows fullscreen between chrome bars"
```

---

### Task 7: End-to-end verification (emulation)

**Files:**
- Create (scratchpad, not repo): `<scratchpad>/mobile-check.js`

**Interfaces:**
- Consumes: everything above, served by `shopify theme dev`.

- [ ] **Step 1: Start the preview server**

Run: `shopify theme dev` (background). If it demands interactive auth, ask the user to run `! shopify theme dev` themselves; do not fight the login flow.
Expected: `http://127.0.0.1:9292` serving the branch theme.

- [ ] **Step 2: Install Playwright in the scratchpad**

```bash
cd <scratchpad> && npm init -y && npm i playwright && npx playwright install chromium
```

- [ ] **Step 3: Write and run the check script**

```js
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  // Mobile pass
  const m = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await m.newPage();
  await mp.goto('http://127.0.0.1:9292/pages/faq', { waitUntil: 'networkidle' });
  const mobileClass = await mp.evaluate(() => document.documentElement.className);
  const barTop = await mp.evaluate(() => document.querySelector('.jj-taskbar').getBoundingClientRect().top);
  const cmdbar = await mp.evaluate(() => getComputedStyle(document.querySelector('.jj-cmdbar')).display);
  const hOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log({ mobileClass, barTop, cmdbar, hOverflow });
  await mp.screenshot({ path: 'mobile-faq.png' });
  // Desktop regression pass
  const d = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const dp = await d.newPage();
  await dp.goto('http://127.0.0.1:9292/pages/faq', { waitUntil: 'networkidle' });
  const desktopClass = await dp.evaluate(() => document.documentElement.className);
  const dBarBottom = await dp.evaluate(() => { const r = document.querySelector('.jj-taskbar').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight / 2.5) < 40 || r.bottom > 300; });
  const dCmdbar = await dp.evaluate(() => getComputedStyle(document.querySelector('.jj-cmdbar')).display);
  console.log({ desktopClass, dBarBottom, dCmdbar });
  await dp.screenshot({ path: 'desktop-faq.png' });
  await browser.close();
})();
```

Expected mobile: class contains `jj-mobile` and `jj-crt-no-barrel`; `barTop === 0`; `cmdbar === 'flex'`; `hOverflow === false`.
Expected desktop: class has NO `jj-mobile`; `dCmdbar === 'none'`.

- [ ] **Step 4: Repeat for `/` (homepage) and `/cart`**

Same script, swap URL. Homepage on mobile is NOT expected to look right yet (Phase 4) — only assert: no JS console errors (`page.on('console')` / `page.on('pageerror')`), gate class present, chrome bars positioned.

- [ ] **Step 5: Read the screenshots**

Open `mobile-faq.png`, `desktop-faq.png` with the Read tool; visually confirm top bar, command bar, fullscreen explorer, intact desktop.

- [ ] **Step 6: Fix-and-loop**

Any failed assertion: fix in the owning task's files, re-run, then amend nothing — new commit per fix (`fix(mobile): ...`).

- [ ] **Step 7: Final commit + report**

```bash
git add -A
git commit -m "fix(mobile): emulation-pass fixes"  # only if fixes exist
```

Report to user with screenshots; user real-device check is the merge gate.
