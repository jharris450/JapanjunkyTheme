# Mobile Landing + Bottom Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile gets a bottom Win98 taskbar with 3 account tabs, a scrollable landing page (Tsuno greeting → kyogen pop card with live 3D box → daruma → 5-record list), 1-per-row catalog, perma-muted sound, bigger text, fixed calendar, and momentum scrolling.

**Architecture:** Everything keys on `html.jj-mobile` / `window.JJ_MOBILE` (load-time gate in theme.liquid) so desktop is untouched by construction. The desktop hero cluster (`#jj-product-info` containing kyogen + box canvas + panel; daruma button) is REPARENTED by JS into a new in-flow `.jj-scroll__screen--mhero` screen on mobile — all element ids keep working (typewriter, ATC, cart wiring). The box engine in japanjunky-bundle-stage.js is reused; a DOM records list (grid cards via an exported `createCard`) stands in for the desktop ring crescent.

**Tech Stack:** Shopify Liquid theme, vanilla JS (IIFE modules, `defer` scripts), three.js r150+, Vitest (pure-logic tests only), Playwright device emulation for layout checks.

## Global Constraints

- ALL mobile CSS lives in `assets/japanjunky-mobile.css`, keyed on `html.jj-mobile` — never raw width media queries. (Base-state rules for mobile-only elements, e.g. `display:none` defaults, are the one exception — same file, unkeyed, like the old `.jj-cmdbar` rule.)
- JS branches check `window.JJ_MOBILE`.
- Fixedsys Excelsior 3.01 + DotGothic16 only. No rounded corners. CRT-style animations only (blink/flash/screen-refresh — no bounce/slide/elastic).
- Scanlines/grille/dither come ONLY from the global CRT shader canvas (z 20000) — never add per-element raster overlays. Overlay UI appends inside `#jj-crt-content`.
- Never add `prefers-reduced-motion` media blocks (global bypass policy).
- Canvas DPR cap 2 on mobile (perf budget).
- Taskbar z 10010; popovers 10015; under shader canvas 20000.
- Deploy = `main` (Shopify GitHub sync). ALL work on branch `mobile-landing`; merge only after the user's real-device check.
- cyan #00e5e5 is reserved for the CD format indicator — never as a default.
- CSS prefix `jj-`, BEM-like.

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch**

```bash
git checkout -b mobile-landing
```

---

### Task 1: Volume perma-mute on mobile

**Files:**
- Modify: `assets/japanjunky-volume.js:85-88` (instance creation)
- Modify: `tests/volume.test.js` (add mobile test)
- Modify: `assets/japanjunky-mobile.css` (icon non-clickable)

**Interfaces:**
- Produces: unchanged `window.JJ_Volume` API; on mobile `isMuted()===true`, `getEffective()===0`, and nothing is ever written to localStorage.

- [ ] **Step 1: Write the failing test**

Open `tests/volume.test.js`, match its existing import style (it requires `assets/japanjunky-volume.js` via the UMD `module.exports` branch), and add:

```js
describe('mobile perma-mute', () => {
  it('boots muted with a null store when window.JJ_MOBILE is set', async () => {
    vi.resetModules();
    const setItem = vi.fn();
    global.window = { JJ_MOBILE: true, localStorage: { getItem: () => null, setItem } };
    const V = await import('../assets/japanjunky-volume.js').then(m => m.default || m);
    expect(V.isMuted()).toBe(true);
    expect(V.getEffective()).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
    delete global.window;
  });
});
```

(If the existing tests use `require` instead of dynamic `import`, use `require` — copy whatever the file already does. The assertion set is what matters: muted, zero gain, zero persistence.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/volume.test.js`
Expected: FAIL — `isMuted()` returns false (desktop default instance).

- [ ] **Step 3: Implement the mobile instance**

In `assets/japanjunky-volume.js`, replace the default-instance block (lines 85-88):

```js
  // Default instance bound to localStorage (browser) or a null store (tests/Node).
  var ls = null;
  try { ls = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null; } catch (e) { ls = null; }
  // Handheld: sound is permanently muted — players are desktop-only and the
  // tray icon is display-only. Null store: the forced mute must never leak
  // into another session through localStorage.
  var instance;
  if (typeof window !== 'undefined' && window.JJ_MOBILE) {
    instance = create(null);
    instance.setMuted(true);
  } else {
    instance = create(ls);
  }
```

- [ ] **Step 4: Run tests to verify they pass (including existing volume tests)**

Run: `npx vitest run tests/volume.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Make the tray icon display-only on mobile**

In `assets/japanjunky-mobile.css`, add (new section near the chrome rules):

```css
/* Sound is perma-muted on the handheld (players are desktop-only): the
   tray speaker is a status glyph, not a control. win95-volume.js still
   syncs the × mute glyph from JJ_Volume state on load. */
html.jj-mobile .jj-vol-btn {
  pointer-events: none;
}
```

No JS change needed in japanjunky-win95-volume.js: its `subscribe → syncUI` fires once on load and `V.isMuted()` is already true, so `.jj-vol-btn--muted` (the × glyph) applies automatically.

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-volume.js tests/volume.test.js assets/japanjunky-mobile.css
git commit -m "feat(mobile): perma-mute master volume, display-only tray icon"
```

---

### Task 2: Gate product media-drag off on mobile

**Files:**
- Modify: `assets/japanjunky-media-drag.js:9-11`

**Interfaces:**
- Produces: nothing — on mobile the module no-ops so long-press drags on grid cards / PDP can never hijack touch scrolling.

- [ ] **Step 1: Add the gate**

At the top of the IIFE body (right after `'use strict';`):

```js
  // Handheld: players are desktop-only and hold-drag would fight touch
  // scrolling — the whole module stands down.
  if (window.JJ_MOBILE) return;
```

- [ ] **Step 2: Verify desktop is untouched**

Run: `node -e "const s=require('fs').readFileSync('assets/japanjunky-media-drag.js','utf8'); if(!/JJ_MOBILE\) return/.test(s)) process.exit(1); console.log('gate present')"`
Expected: `gate present`

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-media-drag.js
git commit -m "fix(mobile): media-drag stands down on touch (players desktop-only)"
```

---

### Task 3: Bottom taskbar with 3 account tabs

**Files:**
- Modify: `sections/jj-footer-win95.liquid` (tabs markup in, commandbar render out)
- Delete: `snippets/jj-mobile-commandbar.liquid`
- Modify: `assets/japanjunky-cart.js:71-80` (`jjRefreshCart` updates the tab count)
- Modify: `assets/japanjunky-mobile.css` (chrome section rewrite)
- Modify: `assets/japanjunky-mobile.js:28` (exclusion selector loses `.jj-cmdbar`)

**Interfaces:**
- Produces: `#jj-mtab-cart-count` span (cart.js keeps it fresh), `--jj-mobile-taskbar-h: 44px` CSS var consumed by Tasks 4 and 6.
- Consumes: existing `.jj-taskbar` DOM, `--jj-tactile` / `--jj-tactile-pressed` shadow vars.

- [ ] **Step 1: Add account tabs to the taskbar, drop the command bar render**

In `sections/jj-footer-win95.liquid`, directly AFTER `<div class="jj-taskbar__tabs" id="jj-taskbar-tabs"></div>` (line 23), insert:

```liquid
  {%- comment -%} Handheld account tabs — occupy the window-tab slot (window
      tabs are hidden on mobile). Desktop hides this strip (base CSS).
      HARD CAP: 3 tabs. {%- endcomment -%}
  <nav class="jj-taskbar__mtabs" id="jj-taskbar-mtabs" aria-label="Account">
    {%- if customer -%}
      <a class="jj-taskbar__mtab" href="/account">ACCOUNT</a>
    {%- else -%}
      <a class="jj-taskbar__mtab" href="/account/login">LOG IN</a>
    {%- endif -%}
    <a class="jj-taskbar__mtab" href="{{ routes.cart_url }}">CART&nbsp;<span class="jj-taskbar__mtab-count" id="jj-mtab-cart-count">{%- if cart.item_count > 0 -%}{{ cart.item_count }}{%- endif -%}</span></a>
    <a class="jj-taskbar__mtab" href="/pages/watchlist">WATCH</a>
  </nav>
```

Then delete line 33: `{% render 'jj-mobile-commandbar' %}`.

- [ ] **Step 2: Delete the command bar snippet**

```bash
git rm snippets/jj-mobile-commandbar.liquid
```

- [ ] **Step 3: Keep the tab cart count live**

In `assets/japanjunky-cart.js`, inside `window.jjRefreshCart` right after the `jj-nav-cart-count` update (line 76), add:

```js
        var mtabCount = document.getElementById('jj-mtab-cart-count');
        if (mtabCount) mtabCount.textContent = cart.item_count > 0 ? String(cart.item_count) : '';
```

- [ ] **Step 4: Rewrite the mobile chrome CSS**

In `assets/japanjunky-mobile.css`:

DELETE these blocks (they implemented the WinCE TOP bar + separate command bar):
- the `html.jj-mobile .jj-taskbar { top: 0; ... }` block
- the `--jj-mobile-topbar-h` / `--jj-mobile-cmdbar-h` var block
- the horn-crop undo block (`.jj-start-btn--active + .jj-start-btn__tsuno`)
- the start-menu drop-DOWN block (`top: var(--jj-mobile-topbar-h); ...`)
- the tray-popup top-anchor block (`.jj-vol-popup, .jj-clock-popover { top: ... }`)
- ALL `.jj-cmdbar` blocks (base `display:none` + every `html.jj-mobile .jj-cmdbar*` rule)

KEEP: `#jj-taskbar-tabs { display:none }`, `.jj-taskbar::after { display:none }`, `#jj-toolbox { display:none }`, the thumb-target block, `html.jj-mobile { zoom: 1 }`.

ADD in their place:

```css
/* --- Handheld chrome: bottom Win98 taskbar --- */
/* One bar: Start | 3 account tabs | tray (muted speaker + clock). The
   taskbar keeps its desktop bottom anchor; only height + tab strip are
   mobile. Window tabs stay hidden (apps are fullscreen). */
html.jj-mobile {
  --jj-mobile-taskbar-h: 44px;
}

html.jj-mobile .jj-taskbar {
  height: var(--jj-mobile-taskbar-h);
}

/* Account tabs: hidden on desktop (base), revealed on the handheld. */
.jj-taskbar__mtabs {
  display: none;
}

html.jj-mobile .jj-taskbar__mtabs {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 6px;
  margin: 0 6px;
  align-self: center;
}

html.jj-mobile .jj-taskbar__mtab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  font-size: 14px;
  color: var(--jj-text);
  text-decoration: none;
  background: #111;
  border: 1px solid #333;
  box-shadow: var(--jj-tactile);
  white-space: nowrap;
  overflow: hidden;
}

html.jj-mobile .jj-taskbar__mtab:active {
  box-shadow: var(--jj-tactile-pressed);
  transform: translate(1px, 1px);
}

html.jj-mobile .jj-taskbar__mtab-count {
  color: var(--jj-secondary);
}

/* Start menu: desktop-default bottom anchor, stretched full width. */
html.jj-mobile .jj-start-menu {
  left: 0;
  right: 0;
  width: auto;
  bottom: var(--jj-mobile-taskbar-h);
  max-height: calc(100vh - var(--jj-mobile-taskbar-h) - 8px);
  overflow-y: auto;
}

/* Tray popups clear the taller bar. */
html.jj-mobile .jj-vol-popup,
html.jj-mobile .jj-clock-popover {
  bottom: calc(var(--jj-mobile-taskbar-h) + 4px);
}
```

UPDATE the existing layout-inset rules in the same file (they referenced the deleted top/cmdbar vars):

```css
html.jj-mobile .jj-explorer {
  position: fixed;
  inset: 0 0 var(--jj-mobile-taskbar-h);
  width: auto;
  max-width: none;
  height: auto;
  margin: 0;
  transform: none !important;
}

html.jj-mobile .jj-page {
  top: 0;
  bottom: var(--jj-mobile-taskbar-h);
  padding-bottom: 16px;
}

html.jj-mobile .jj-pdp {
  top: 0;
  bottom: var(--jj-mobile-taskbar-h);
  flex-direction: column;
}

html.jj-mobile .jj-scroll__indicator {
  bottom: calc(var(--jj-mobile-taskbar-h) + 8px);
}
```

- [ ] **Step 5: Drop the dead selector from the touch driver**

In `assets/japanjunky-mobile.js` line 28, change the exclusion list:

```js
    if (t.closest && t.closest('#jj-scroll, .jj-taskbar, .jj-start-menu, .jj-vol-popup, .jj-calendar-popover')) return;
```

(`.jj-cmdbar` is gone; `.jj-calendar-popover` added so calendar swipes don't pan the page.)

- [ ] **Step 6: Emulation smoke check**

Write a throwaway Playwright script in the scratchpad (pattern exists there from earlier phases: launch chromium with iPhone 13 descriptor against the password-cookied live store OR `shopify theme dev` preview if the CLI is available — if neither works headlessly, defer to Task 10's integration pass and note it). Assert: `html.jj-mobile` present, `.jj-taskbar` bounding rect bottom ≈ viewport height, `#jj-taskbar-mtabs` visible with 3 children, `#jj-cmdbar` absent.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mobile): bottom Win98 taskbar with 3 account tabs, command bar deleted"
```

---

### Task 4: Calendar popover un-crush

**Files:**
- Modify: `assets/japanjunky-mobile.css`

The crush cause: `.jj-calendar-popover { max-width: calc(40vw - 8px) }` (japanjunky-calendar.css:22) = ~156px on a 390px phone.

- [ ] **Step 1: Add mobile calendar rules**

```css
/* --- Calendar popover --- */
/* Desktop caps it at 40vw (fine beside a wide taskbar); on a phone that
   is ~156px — crushed. Full width, columns stacked, finger-sized days. */
html.jj-mobile .jj-calendar-popover {
  left: 8px;
  right: 8px;
  width: auto;
  max-width: none;
  bottom: calc(var(--jj-mobile-taskbar-h) + 4px);
}

html.jj-mobile .jj-calendar-popover--open {
  flex-direction: column;
}

html.jj-mobile .jj-cal-right {
  width: auto;
  align-self: center;
}

html.jj-mobile .jj-cal-grid {
  font-size: 14px;
}

html.jj-mobile .jj-cal-grid__day {
  padding: 8px 0;
}

html.jj-mobile .jj-cal-grid__header {
  font-size: 12px;
}

html.jj-mobile .jj-cal-nav__btn {
  width: 36px;
  height: 32px;
  font-size: 14px;
}

html.jj-mobile .jj-cal-nav__label {
  font-size: 16px;
}

html.jj-mobile .jj-cal-today-btn {
  font-size: 12px;
  padding: 6px 8px;
}
```

- [ ] **Step 2: Emulation check**

In the emulation script: tap the clock, screenshot `.jj-calendar-popover`, assert its width > 300px and each `.jj-cal-grid__day` height ≥ 28px.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-mobile.css
git commit -m "fix(mobile): calendar popover full-width, stacked, finger-sized days"
```

---

### Task 5: Catalog 1-per-row + text-size floor

**Files:**
- Modify: `assets/japanjunky-mobile.css`

Context: `.jj-grid` is `repeat(4, 1fr)` with a 600px media query to 2 cols (japanjunky-product-grid.css:84-95). At zoom 1 phones hit the 2-col branch today. The mobile override wins by specificity (`html.jj-mobile .jj-grid`) over both.

- [ ] **Step 1: Add grid + text rules**

```css
/* --- Catalog: one product per row --- */
html.jj-mobile .jj-grid {
  grid-template-columns: 1fr;
  gap: 20px;
  padding: 16px 12px;
}

/* Full-width card covers would tower — cap and center them. */
html.jj-mobile .jj-grid__card-img-wrap {
  max-width: 70vw;
  margin: 0 auto;
}

/* --- Text-size floor (user: mobile text too small) --- */
html.jj-mobile .jj-grid__card-title { font-size: 16px; }
html.jj-mobile .jj-grid__card-artist { font-size: 14px; }
html.jj-mobile .jj-grid__card-price,
html.jj-mobile .jj-grid__card-format,
html.jj-mobile .jj-grid__card-cond-chip { font-size: 14px; }

html.jj-mobile .jj-product-info__artist { font-size: 18px; }
html.jj-mobile .jj-product-info__title { font-size: 16px; }
html.jj-mobile .jj-product-info__meta { font-size: 14px; }
html.jj-mobile .jj-product-info__price { font-size: 18px; }
html.jj-mobile .jj-action-btn { font-size: 15px; }

html.jj-mobile .jj-start-menu__item { font-size: 15px; min-height: 40px; }
html.jj-mobile .jj-start-menu__section-title { font-size: 13px; }

html.jj-mobile .jj-explorer__status { font-size: 13px; }
html.jj-mobile .jj-prose { font-size: 15px; }
```

Then sweep: open the emulated homepage + a collection + a content page, run `document.querySelectorAll('*')` filtered to visible elements with computed font-size < 13px, and add overrides for anything user-facing that surfaces (ignore decorative/ASCII glyph elements). Selector names above are from the current CSS — verify each exists before relying on it (e.g. check `jj-grid__card-cond-chip`, `jj-explorer__status` spellings in product-grid.css / explorer CSS) and correct to the real class names.

- [ ] **Step 2: Emulation check**

Assert: `getComputedStyle` on `.jj-grid` shows a single-column template; first two `.jj-grid__card` rects have equal left edges and stacked tops; card title computed font-size ≥ 16px.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-mobile.css
git commit -m "feat(mobile): 1-per-row catalog + global text-size floor"
```

---

### Task 6: Mobile hero scaffold (screen, records list, card export)

**Files:**
- Modify: `layout/theme.liquid` (~line 369, after the hero screen div closes)
- Modify: `assets/japanjunky-product-grid.js` (export `createCard`)
- Modify: `assets/japanjunky-mobile.js` (records module)
- Modify: `assets/japanjunky-mobile.css` (screen + list styles)

**Interfaces:**
- Produces: `window.JJ_GridCard.createCard(p)` → grid-card element (p = a JJ_PRODUCTS entry); `window.JJ_MobileRecords.populate(pool)` / `.clear()`; DOM ids `#jj-mhero`, `#jj-mhero-card-mount`, `#jj-mhero-daruma-slot`, `#jj-mrecords`.
- Consumes: `.jj-scroll` screen pattern (product-grid.css), `jj-crt-on` keyframes (existing power-on flash animation — confirm the exact keyframe name where `.jj-vol-popup` uses it in win95.css:1183, and reuse it).

- [ ] **Step 1: Add the mobile hero screen to the scroll flow**

In `layout/theme.liquid`, between `.jj-scroll__screen--hero`'s closing `</div>` (line 369) and the `--under` screen (line 370), insert:

```liquid
    {%- comment -%} Handheld landing (mobile spec 2026-07-15): pop-card mount,
        daruma slot, records list — in the scroll FLOW, unlike the desktop's
        fixed hero layers. Desktop never shows this screen (base CSS hides it;
        html.jj-mobile reveals). On mobile, bundle-stage.js reparents
        #jj-product-info and the daruma into the mounts. {%- endcomment -%}
    <div class="jj-scroll__screen jj-scroll__screen--mhero" id="jj-mhero">
      <div class="jj-mhero__card-mount" id="jj-mhero-card-mount"></div>
      <div class="jj-mhero__daruma-slot" id="jj-mhero-daruma-slot"></div>
      <div class="jj-grid jj-mrecords" id="jj-mrecords"></div>
    </div>
```

(`class="jj-grid"` on the records container is deliberate: record cards inherit all grid-card styling plus Task 5's 1-per-row rule for free.)

- [ ] **Step 2: Export the card builder**

At the end of the IIFE in `assets/japanjunky-product-grid.js` (before the closing `})();`):

```js
  // Handheld records list (japanjunky-mobile.js) reuses the exact grid card
  // (cover spin, condition chips, quick-ATC, watch star all ride along).
  window.JJ_GridCard = { createCard: createCard };
```

- [ ] **Step 3: Records module in japanjunky-mobile.js**

After the scroll-driver code (still inside the IIFE, which already guards `JJ_MOBILE` + homepage):

```js
  // ─── Records list: the mobile stand-in for the ring crescent ──
  // bundle-stage.js's mobile path calls populate() when the box opens and
  // clear() when a reroll shuts it. Cards are real grid cards (JJ_GridCard
  // is exported by japanjunky-product-grid.js, which loads before the
  // bundle stage ever deals).
  var recordsEl = document.getElementById('jj-mrecords');
  window.JJ_MobileRecords = {
    populate: function (pool) {
      if (!recordsEl || !window.JJ_GridCard) return;
      recordsEl.innerHTML = '';
      for (var i = 0; i < pool.length; i++) {
        var card = window.JJ_GridCard.createCard(pool[i]);
        card.classList.add('jj-mrecords__card');
        card.style.animationDelay = (i * 120) + 'ms';
        recordsEl.appendChild(card);
      }
    },
    clear: function () {
      if (recordsEl) recordsEl.innerHTML = '';
    }
  };
```

- [ ] **Step 4: Screen + list CSS**

In `assets/japanjunky-mobile.css`:

```css
/* --- Mobile landing screen (homepage hero flow) --- */
/* Base: desktop never renders this screen. */
.jj-scroll__screen--mhero {
  display: none;
}

html.jj-mobile .jj-scroll__screen--mhero {
  display: block;
  pointer-events: auto;
  padding: 24px 12px 40px;
}

html.jj-mobile .jj-mhero__daruma-slot {
  position: relative;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Records deal in with the CRT power-on flash, staggered per card
   (animation-delay set inline by JJ_MobileRecords.populate). */
html.jj-mobile .jj-mrecords__card {
  animation: jj-crt-on 0.3s ease-out backwards;
}
```

(Verify the keyframe name `jj-crt-on` — win95.css:1183 uses it for popup open flash. If it lives under a different name in base.css, use that name.)

- [ ] **Step 5: Emulation check**

Desktop viewport (fine pointer): `#jj-mhero` has `display:none`. Mobile emulation: screen visible between hero spacer and underworld spacer; `window.JJ_MobileRecords.populate(window.JJ_PRODUCTS.slice(0,5))` in the console fills `#jj-mrecords` with 5 stacked cards.

- [ ] **Step 6: Commit**

```bash
git add layout/theme.liquid assets/japanjunky-product-grid.js assets/japanjunky-mobile.js assets/japanjunky-mobile.css
git commit -m "feat(mobile): landing hero scaffold - mhero screen + records list + card export"
```

---

### Task 7: Bundle stage mobile path (pop card + live 3D box + daruma reroll)

**Files:**
- Modify: `assets/japanjunky-bundle-stage.js:703-710` (replace the early return)
- Modify: `assets/japanjunky-daruma.js:15` (allow mobile)
- Modify: `assets/japanjunky-mobile.css` (pop-card layout; delete the old panel-only block)

**Interfaces:**
- Consumes: `window.JJ_MobileRecords` (Task 6), `#jj-mhero-card-mount` / `#jj-mhero-daruma-slot` (Task 6), existing internals `buildBox/buildLights/setFlaps/showBundleInfo/startLoop/openFlaps/closeFlaps/shakeBox/alignFront/buildStack/pickPool/tween/setState/FSM`.
- Produces: working tap-to-open + scroll-auto-open + daruma reroll on mobile.

- [ ] **Step 1: Replace the mobile early-return with a mobile init**

In `assets/japanjunky-bundle-stage.js`, FIRST read `openFlaps`/`closeFlaps` (lines 332-341) and the desktop canvas click handler (lines 717-740) and mirror their embedded `setState` calls exactly — the FSM transitions below are transcribed from the desktop reroll (lines 510-543) and must stay in lockstep with whatever `openFlaps` does internally.

Replace lines 703-710 (`if (window.JJ_MOBILE) { showBundleInfo(); return; }`) with `if (window.JJ_MOBILE) { initMobile(); return; }` and add above the Init section:

```js
  // ─── Handheld landing (mobile spec 2026-07-15) ────────────────
  // The desktop fixed-zone cluster (#jj-product-info holds kyogen + box
  // canvas + panel text; the daruma floats beside it) is reparented into
  // the in-flow mobile hero screen. Same box engine; the DOM records list
  // (JJ_MobileRecords) stands in for the ring crescent.
  function initMobile() {
    var mount = document.getElementById('jj-mhero-card-mount');
    var darumaSlot = document.getElementById('jj-mhero-daruma-slot');
    var infoPanel = document.getElementById('jj-product-info');
    var records = document.getElementById('jj-mrecords');
    if (!mount || !infoPanel) { showBundleInfo(); return; } // non-home fallback

    mount.appendChild(infoPanel);
    var darumaBtn = document.getElementById('jj-bundle-reroll');
    var darumaFx = document.getElementById('jj-daruma-fx');
    if (darumaSlot && darumaBtn) {
      darumaSlot.appendChild(darumaBtn);
      if (darumaFx) darumaSlot.appendChild(darumaFx);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    buildBox();
    buildLights();
    setFlaps(0);
    showBundleInfo();
    startLoop();

    var opened = false;
    function openAndDeal() {
      if (opened || FSM.isLocked(state) || state !== 'closed' || aligning) return;
      opened = true;
      var pool = pickPool();
      buildStack(pool);
      alignFront(500, function () {
        openFlaps(function () {
          canvas.style.cursor = 'grab';
          if (window.JJ_MobileRecords) window.JJ_MobileRecords.populate(pool);
          if (darumaBtn) darumaBtn.style.display = '';
        });
      });
    }

    canvas.addEventListener('click', function () {
      if (window.JJ_SPLASH_ACTIVE) return;
      openAndDeal();
    });

    // Not tapped? Scrolling to the records area auto-opens (once).
    if (records && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting && !window.JJ_SPLASH_ACTIVE) {
            openAndDeal();
            io.disconnect();
            return;
          }
        }
      }, { root: document.getElementById('jj-scroll'), rootMargin: '0px 0px -20% 0px' });
      io.observe(records);
    }

    // Reroll: list clears → lid shuts → shake → reopen → new 5.
    // Desktop's reroll() drives the ring; this is its list twin — the FSM
    // transitions are copied 1:1 from reroll() (lines 510-543).
    function mobileReroll() {
      if (state !== 'open') return;
      setState(FSM.next(state, 'reroll'));        // → retracting
      if (window.JJ_MobileRecords) window.JJ_MobileRecords.clear();
      setState(FSM.next(state, 'retracted'));     // → closing
      closeFlaps(function () {
        setState(FSM.next(state, 'closed'));      // → shaking
        var pool = pickPool();
        buildStack(pool);
        alignFront(350, function () {
          shakeBox(function () {
            setState(FSM.next(state, 'shaken'));  // → opening
            tween(600, function (e) { setFlaps(e); }, function () {
              setState(FSM.next(state, 'opened')); // → open
              if (window.JJ_MobileRecords) window.JJ_MobileRecords.populate(pool);
            });
          });
        });
      });
    }

    if (darumaBtn) {
      darumaBtn.addEventListener('click', function () {
        if (FSM.isLocked(state)) return;
        var proceed = function () {
          if (state === 'closed') { openAndDeal(); return; }
          mobileReroll();
        };
        var daruma = window.JJ_DARUMA;
        if (daruma) {
          if (daruma.isBusy()) return;
          daruma.play(proceed);
        } else {
          proceed();
        }
      });
    }
  }
```

Also note: the desktop `openFlaps` (line 332) begins with a `setState` transition — check it and, if `openAndDeal`/`mobileReroll` would double-transition, adjust to match the desktop click handler exactly.

- [ ] **Step 2: Let the daruma build on mobile**

In `assets/japanjunky-daruma.js` line 15, replace `if (window.JJ_MOBILE) return;` with a DPR-capped mobile allowance: delete the gate, then find the `renderer.setPixelRatio(...)` call in its FX scene builder and cap it: `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`. The doll's `click` handler works on touch as-is; its `pointerenter` rattle simply never fires (acceptable). **Fallback (decide by testing):** the FX scene positions dice around desktop geometry constants (`CX`, `SEAM`) — if the emulation shows the dice/FX badly misplaced in the reparented slot and the fix isn't a quick canvas-rect read, RESTORE the gate (`if (window.JJ_MOBILE) return;`): bundle-stage's `if (daruma)` guard degrades gracefully to reroll-without-dice-FX. Note the outcome in the commit message.

- [ ] **Step 3: Pop-card layout CSS**

In `assets/japanjunky-mobile.css`, DELETE the Phase-4 panel-only block:
- the `display: none !important` list for `.jj-ring / #jj-bundle-canvas / #jj-viewer-canvas / #jj-swirl-canvas / .jj-kyogen-clip / .jj-daruma / #jj-daruma-fx`
- the `html.jj-mobile .jj-product-zone` and `.jj-product-zone .jj-product-info` overrides

ADD:

```css
/* --- Pop card: kyogen backdrop + live 3D box + bundle panel --- */
/* Ring crescent and old product viewer stay desktop-only; swirl tunnel
   too (kyogen is a static ambient graphic here, pupils at their CSS
   rest positions — info-swirl.js no-ops on mobile). */
html.jj-mobile .jj-ring,
html.jj-mobile #jj-swirl-canvas,
html.jj-mobile #jj-viewer-canvas {
  display: none !important;
}

/* The zone is a desktop fixed layer; after reparenting it only hosts the
   Tsuno bubble. Let it keep its geometry but never eat touches. */
html.jj-mobile .jj-product-zone {
  pointer-events: none;
}

html.jj-mobile #jj-product-info {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  border: 1px solid #444;
  padding: 16px;
  overflow: hidden; /* clips the oversized kyogen backdrop */
}

/* Box canvas rides the card's top-right, like the desktop graphic spot.
   Vertical pans over it must keep scrolling the page; horizontal drags
   spin the open box (pointer events in bundle-stage). */
html.jj-mobile #jj-bundle-canvas {
  position: relative;
  float: right;
  width: 45%;
  aspect-ratio: 1;
  margin: 0 0 8px 12px;
  touch-action: pan-y;
}

/* Kyogen: desktop positions a 900x750 frame around the card center —
   scale it down to card size, still the dim ambient layer behind text. */
html.jj-mobile .jj-kyogen-clip {
  transform: scale(0.42);
  transform-origin: center;
}

/* Daruma: in-flow in its slot between card and records, tap target. */
html.jj-mobile .jj-daruma {
  position: relative;
  left: auto;
  right: auto;
  top: auto;
  bottom: auto;
  width: 84px;
}

html.jj-mobile #jj-daruma-fx {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
```

(The kyogen scale and daruma width are starting values — tune against the emulation screenshot until the card reads like the desktop composition. Check japanjunky-bundle.css:67-155 for the desktop values being overridden; if `.jj-daruma` uses other anchoring properties, neutralize those too.)

- [ ] **Step 4: Emulation check — full flow**

Mobile emulation, homepage: (1) pop card shows kyogen backdrop + typewriter title/price + box canvas right; (2) tap box → flaps animate, 5 record cards appear under the daruma slot with staggered flash; (3) reload, DON'T tap, scroll down → records auto-populate when the area approaches; (4) tap daruma → list clears, box shuts/shakes/reopens, 5 different records; (5) records' [+ CART] quick-add works (cart count on the taskbar tab updates); (6) desktop viewport unchanged (box in card, ring crescent works — spot-check with a fine-pointer context).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-bundle-stage.js assets/japanjunky-daruma.js assets/japanjunky-mobile.css
git commit -m "feat(mobile): landing pop card - live 3D box, tap/scroll deal, daruma reroll"
```

---

### Task 8: Tsuno on the mobile landing (greeting position + scroll-follow)

**Files:**
- Modify: `assets/japanjunky-screensaver.js:348` (mobile idle pos), `:897-898` + `:918` (use it), `:1234-1243` (wake gate)

**Interfaces:**
- Consumes: existing `JJ_ScrollFollow` rig follow (underscene.js:159 sets it; screensaver.js:1615-1621 eases `tsunoRig.position.y` toward viewer-lock) — this ALREADY makes Tsuno track the scroll; no new follow code.
- Produces: Tsuno starts upper-center on mobile and never wanders (roam wake disabled on mobile).

- [ ] **Step 1: Mobile idle position**

At line 348 (`TSUNO_IDLE_POS` definition), add below it:

```js
  // Handheld: portrait FOV crops x=-4 off-screen — greet from upper-center.
  var TSUNO_MOBILE_IDLE_POS = { x: 0, y: 1.1, z: 6 };
```

At line 897, extend the start-pos pick:

```js
      var tsunoStartPos = tsunoLoginPageMode ? TSUNO_LOGIN_POS
        : (tsunoProductPageMode ? TSUNO_PRODUCT_POS
        : (window.JJ_MOBILE ? TSUNO_MOBILE_IDLE_POS : TSUNO_IDLE_POS));
```

Line 918 unconditionally re-sets `TSUNO_IDLE_POS` — make it respect the same pick:

```js
      var idlePos = window.JJ_MOBILE ? TSUNO_MOBILE_IDLE_POS : TSUNO_IDLE_POS;
      tsunoMesh.position.set(idlePos.x, idlePos.y, idlePos.z);
```

(Only if line 918's set targets the idle case — read the surrounding branch first; login/product modes at 922+ must keep their positions.)

- [ ] **Step 2: Disable roam-wake on mobile**

In the `jj:tsuno-wake` listener (line 1234), first line of the handler body:

```js
    // Handheld: Tsuno stays in his greeting float and tracks the scroll
    // (JJ_ScrollFollow rig); roaming would carry him off the portrait FOV.
    if (window.JJ_MOBILE) return;
```

- [ ] **Step 3: Emulation check**

Mobile emulation, homepage: Tsuno visible upper-center with greeting bubble on load; scroll to the pop card → he rides down with the scene (rig follow) and stays on screen beside/above the card; keeps tracking through the records area; gone by the underscene. Desktop viewport: idle at x=-4, wake-on-scroll still roams.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(mobile): Tsuno greets upper-center and scroll-follows, roam-wake desktop-only"
```

---

### Task 9: Momentum scrolling

**Files:**
- Modify: `assets/japanjunky-mobile.js` (scroll driver)

- [ ] **Step 1: Add velocity + glide to the manual driver**

Replace the three touch listeners in `assets/japanjunky-mobile.js` with:

```js
  var startY = null, startTop = 0, lastY = 0, lastT = 0, vel = 0, momentumRaf = null;

  function cancelMomentum() {
    if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = null; }
  }

  document.addEventListener('touchstart', function (e) {
    var t = e.target;
    // Native scroll handles descendants of the wrapper; chrome bars and
    // menus manage their own gestures.
    if (t.closest && t.closest('#jj-scroll, .jj-taskbar, .jj-start-menu, .jj-vol-popup, .jj-calendar-popover')) return;
    cancelMomentum();
    startY = lastY = e.touches[0].clientY;
    lastT = performance.now();
    startTop = sc.scrollTop;
    vel = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    var y = e.touches[0].clientY;
    var now = performance.now();
    var dt = now - lastT;
    if (dt > 0) vel = (lastY - y) / dt; // px/ms, positive = scrolling down
    lastY = y; lastT = now;
    sc.scrollTop = startTop + (startY - y);
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (startY === null) return;
    startY = null;
    // Glide: decay the release velocity like a native fling.
    var v = vel * 16; // px per ~60fps frame
    if (Math.abs(v) < 2) return;
    function glide() {
      sc.scrollTop += v;
      v *= 0.95;
      momentumRaf = Math.abs(v) >= 0.5 ? requestAnimationFrame(glide) : null;
    }
    momentumRaf = requestAnimationFrame(glide);
  }, { passive: true });
```

Also add to `assets/japanjunky-mobile.css` (native inner scrollers keep their own momentum and never chain to the page):

```css
html.jj-mobile #jj-scroll,
html.jj-mobile .jj-explorer__main,
html.jj-mobile .jj-pdp-info {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
```

- [ ] **Step 2: Emulation check**

Playwright touchscreen fling on the greeting area (dispatch touch events with decreasing timestamps): `#jj-scroll.scrollTop` keeps advancing for several frames after touchend, then settles. A second touchstart mid-glide freezes it immediately.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-mobile.js assets/japanjunky-mobile.css
git commit -m "feat(mobile): fling momentum on the manual scroll driver"
```

---

### Task 10: Integration pass + spec addendum

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-mobile-landing-chrome-design.md` (outcome addendum)
- Test: scratchpad Playwright script (not committed)

- [ ] **Step 1: Full emulation sweep**

One Playwright script, iPhone-13-class descriptor (pointer coarse, 390×844) + one Android-class (412×915), against the same target used in Task 3 Step 6. Walk: homepage (greeting → tap box → records → daruma reroll → scroll to catalog), collection page (1-col grid), product page (insets to bottom bar), cart via taskbar tab, calendar open, start menu open (full width, opens up), volume icon (muted glyph, no popup on tap). Screenshot each state into the scratchpad. Run `npx vitest run` — all green.

- [ ] **Step 2: Desktop regression sweep**

Same script, fine-pointer 1440×900 context: `html.jj-mobile` absent, `#jj-mhero` display none, taskbar 32px with window tabs area, ring crescent + box + daruma in the desktop spots, volume popup opens.

- [ ] **Step 3: Append outcome addendum to the spec**

Record what shipped vs. planned (especially the Task 7 Step 2 daruma-FX decision), then:

```bash
git add docs/superpowers/specs/2026-07-15-mobile-landing-chrome-design.md
git commit -m "docs(mobile): landing + chrome spec addendum - build outcomes"
```

- [ ] **Step 4: STOP — user device check**

Do NOT merge to main. Report to the user for the real-device check (emulation is not a device-GPU oracle — bundle lid-gap lesson). Merge `mobile-landing` → `main` only on their confirmation.
