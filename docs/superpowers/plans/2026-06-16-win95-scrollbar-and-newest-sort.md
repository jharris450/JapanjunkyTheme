# Win95 Scrollbar + "Newest" Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a NEWEST (date-added) sort to the product grid that the start-menu "new arrivals" link pre-selects, and a reusable Win95-style scrollbar (▲/▼ buttons + draggable thumb) on every scrolling page.

**Architecture:** Two independent features. (1) Sort is client-side over `JJ_PRODUCTS` — add a `created_at` epoch field, a `date-desc` comparator, and a `?sort=` URL preselect. (2) Scrollbar is one self-contained component bound to the page's single primary scroll container, written as a body-level fixed overlay driving the container's `scrollTop`.

**Tech Stack:** Shopify OS2.0 (Liquid), vanilla ES5-style JS (matches existing assets), CSS. No build step, no automated test runner — verification is `node --check` on JS, grep, and the spec's in-browser acceptance checks. Deploy = push to `main` (Shopify GitHub sync), built on a feature branch.

**Spec:** `docs/superpowers/specs/2026-06-16-win95-scrollbar-and-newest-sort-design.md`

---

## File Structure

New:
- `assets/japanjunky-scrollbar.js` — the Win95 scrollbar widget (resolve container, build DOM, sync thumb, arrows/drag/track-click).
- `assets/japanjunky-scrollbar.css` — Win95/CRT styling + native-scrollbar hide (JS-gated).

Modified:
- `snippets/jj-product-json.liquid` — add `addedAt` (created_at epoch).
- `assets/japanjunky-product-grid.js` — NEWEST sort option, `dateOf`, comparator, `applySortSelection` refactor, `?sort=` preselect, init `applySort()`.
- `snippets/win95-start-menu.liquid` — "new arrivals" link → `/collections/all?sort=newest`.
- `layout/theme.liquid` — load the scrollbar CSS + JS.

---

## Task 1: NEWEST sort + new-arrivals default

**Files:**
- Modify: `snippets/jj-product-json.liquid`
- Modify: `assets/japanjunky-product-grid.js`
- Modify: `snippets/win95-start-menu.liquid`

- [ ] **Step 1: Emit the store-added date in the product JSON**

In `snippets/jj-product-json.liquid`, find:

```liquid
        "priceCents": {{ variant.price | json }}
      }
```

Replace with (adds `addedAt` before `priceCents`):

```liquid
        "priceCents": {{ variant.price | json }},
        "addedAt": {{ product.created_at | date: '%s' | json }}
      }
```

- [ ] **Step 2: Add the NEWEST sort option**

In `assets/japanjunky-product-grid.js`, find:

```javascript
  var SORT_OPTIONS = [
    { key: 'featured',   label: 'FEATURED',       badge: '' },
    { key: 'price-asc',  label: 'PRICE LOW-HIGH', badge: 'PRICE↑' },
```

Replace with (inserts NEWEST right after featured):

```javascript
  var SORT_OPTIONS = [
    { key: 'featured',   label: 'FEATURED',       badge: '' },
    { key: 'date-desc',  label: 'NEWEST',         badge: 'NEW' },
    { key: 'price-asc',  label: 'PRICE LOW-HIGH', badge: 'PRICE↑' },
```

- [ ] **Step 3: Add the `dateOf` helper**

In `assets/japanjunky-product-grid.js`, find:

```javascript
  function yearOf(p) {
    var y = parseInt(p.year, 10);
    return isNaN(y) ? null : y;
  }
```

Add immediately after it:

```javascript
  function dateOf(p) {
    return parseInt(p.addedAt, 10) || 0; // epoch seconds; 0 sinks to bottom on desc
  }
```

- [ ] **Step 4: Add the comparator branch**

In `assets/japanjunky-product-grid.js`, find:

```javascript
        case 'price-asc':  return priceOf(a) - priceOf(b);
        case 'price-desc': return priceOf(b) - priceOf(a);
```

Replace with:

```javascript
        case 'price-asc':  return priceOf(a) - priceOf(b);
        case 'price-desc': return priceOf(b) - priceOf(a);
        case 'date-desc':  return dateOf(b) - dateOf(a);
```

- [ ] **Step 5: Extract `applySortSelection` + add the `?sort=` preselect**

In `assets/japanjunky-product-grid.js`, find this exact block (the whole sort-dropdown click handler):

```javascript
    sortDropdown.addEventListener('click', function (e) {
      var itemEl = e.target.closest('.jj-grid__dropdown-item');
      if (!itemEl) return;
      e.stopPropagation();
      e.preventDefault();

      var key = itemEl.getAttribute('data-sort-key');
      if (!key || key === sortMode) {
        closeAllDropdowns();
        return;
      }
      sortMode = key;

      // Single-select: refresh check marks
      var items = sortDropdown.querySelectorAll('.jj-grid__dropdown-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].getAttribute('data-sort-key') === key;
        items[i].classList.toggle('jj-grid__dropdown-item--active', on);
        items[i].querySelector('.jj-grid__dropdown-check').textContent = on ? 'x' : ' ';
        items[i].setAttribute('aria-checked', on ? 'true' : 'false');
      }

      // Badge + button state reflect non-default sort
      var badge = '';
      for (var s = 0; s < SORT_OPTIONS.length; s++) {
        if (SORT_OPTIONS[s].key === key) badge = SORT_OPTIONS[s].badge;
      }
      if (sortBadge) sortBadge.textContent = badge ? '(' + badge + ')' : '';
      sortBtn.classList.toggle('jj-grid__filter-btn--active', key !== 'featured');

      closeAllDropdowns();
      refilter();
    });
```

Replace it with:

```javascript
    // Apply a sort key + sync the dropdown/badge/button UI. Shared by the
    // click handler and the ?sort= URL preselect so they never diverge.
    function applySortSelection(key) {
      sortMode = key;
      var items = sortDropdown.querySelectorAll('.jj-grid__dropdown-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].getAttribute('data-sort-key') === key;
        items[i].classList.toggle('jj-grid__dropdown-item--active', on);
        items[i].querySelector('.jj-grid__dropdown-check').textContent = on ? 'x' : ' ';
        items[i].setAttribute('aria-checked', on ? 'true' : 'false');
      }
      var badge = '';
      for (var s = 0; s < SORT_OPTIONS.length; s++) {
        if (SORT_OPTIONS[s].key === key) badge = SORT_OPTIONS[s].badge;
      }
      if (sortBadge) sortBadge.textContent = badge ? '(' + badge + ')' : '';
      sortBtn.classList.toggle('jj-grid__filter-btn--active', key !== 'featured');
    }

    // Preselect from ?sort= (the start-menu "new arrivals" link → ?sort=newest)
    var urlSortMatch = window.location.search.match(/[?&]sort=([^&]+)/);
    if (urlSortMatch) {
      var urlSortVal = decodeURIComponent(urlSortMatch[1]).toLowerCase();
      if (urlSortVal === 'newest') urlSortVal = 'date-desc';
      for (var us = 0; us < SORT_OPTIONS.length; us++) {
        if (SORT_OPTIONS[us].key === urlSortVal) { applySortSelection(urlSortVal); break; }
      }
    }

    sortDropdown.addEventListener('click', function (e) {
      var itemEl = e.target.closest('.jj-grid__dropdown-item');
      if (!itemEl) return;
      e.stopPropagation();
      e.preventDefault();

      var key = itemEl.getAttribute('data-sort-key');
      if (!key || key === sortMode) {
        closeAllDropdowns();
        return;
      }
      applySortSelection(key);
      closeAllDropdowns();
      refilter();
    });
```

- [ ] **Step 6: Apply the sort on initial render**

In `assets/japanjunky-product-grid.js`, find the init block at the very end:

```javascript
  // ─── Init ──────────────────────────────────────────────────────
  renderGrid();
  updateCount();

})();
```

Replace with (so a URL-preselected sort orders the first paint; `applySort()` is a no-op when `sortMode === 'featured'`):

```javascript
  // ─── Init ──────────────────────────────────────────────────────
  applySort();
  renderGrid();
  updateCount();

})();
```

- [ ] **Step 7: Point "new arrivals" at the preselect URL**

In `snippets/win95-start-menu.liquid`, find this exact block (the full "new arrivals" anchor — the other `/collections/all` link in this file uses class `jj-start-submenu__item` and is left untouched):

```liquid
    <a href="/collections/all" class="jj-start-menu__item" role="menuitem">
      <span class="jj-start-item-icon">&gt;</span>
      <span>new arrivals</span>
    </a>
```

Replace with (only the href changes):

```liquid
    <a href="/collections/all?sort=newest" class="jj-start-menu__item" role="menuitem">
      <span class="jj-start-item-icon">&gt;</span>
      <span>new arrivals</span>
    </a>
```

- [ ] **Step 8: Verify JS syntax + the edits landed**

Run:
```
node --check assets/japanjunky-product-grid.js && \
grep -n "date-desc\|dateOf\|applySortSelection\|urlSortMatch" assets/japanjunky-product-grid.js && \
grep -n "addedAt" snippets/jj-product-json.liquid && \
grep -n "collections/all?sort=newest" snippets/win95-start-menu.liquid
```
Expected: `node --check` prints nothing (exit 0); grep shows the new sort code, the `addedAt` field, and the updated new-arrivals link.

- [ ] **Step 9: Commit**

```bash
git add snippets/jj-product-json.liquid assets/japanjunky-product-grid.js snippets/win95-start-menu.liquid
git commit -m "feat(grid): NEWEST date-added sort; new-arrivals preselects it via ?sort=newest"
```

- [ ] **Step 10: Manual verification (after deploy)**

`/collections/all`: [SORT] dropdown now lists NEWEST; selecting it orders newest-added first. `/collections/all?sort=newest` (and clicking "new arrivals" in the start menu): loads ordered newest-first with the sort button active, badge `(NEW)`, and the NEWEST dropdown item checked. Plain `/collections/all` still defaults to FEATURED.

---

## Task 2: Win95 scrollbar component

**Files:**
- Create: `assets/japanjunky-scrollbar.css`
- Create: `assets/japanjunky-scrollbar.js`
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Create `assets/japanjunky-scrollbar.css`**

```css
/* ============================================
   JAPANJUNKY WIN95 SCROLLBAR
   Right-edge vertical scrollbar: ▲/▼ buttons + draggable thumb.
   Bound to the page's primary scroll container by japanjunky-scrollbar.js.
   ============================================ */
.jj-scrollbar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 32px; /* clear the fixed 32px taskbar */
  width: 16px;
  z-index: 150; /* above content (~100), below start menu (2000) + taskbar (10010) */
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  border-left: 1px solid #333;
  pointer-events: auto;
}

.jj-scrollbar__btn {
  flex: 0 0 16px;
  height: 16px;
  padding: 0;
  font-size: 9px;
  line-height: 1;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  color: var(--jj-secondary, #f5d742);
  background: #161616;
  border: 1px solid;
  border-color: #444 #222 #222 #444; /* raised bevel: light top/left, dark bottom/right */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.jj-scrollbar__btn:active {
  border-color: #222 #444 #444 #222; /* pressed bevel */
  color: var(--jj-primary, #e8313a);
}

.jj-scrollbar__track {
  flex: 1 1 auto;
  position: relative;
  min-height: 0;
  background: #050505;
}

.jj-scrollbar__thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: #161616;
  border: 1px solid;
  border-color: #555 #222 #222 #555; /* raised bevel */
  cursor: grab;
}
.jj-scrollbar__thumb:active { cursor: grabbing; }

/* Hide the native scrollbar ONLY when our JS bound (so no-JS keeps it).
   The homepage #jj-scroll already hides its native bar by existing design. */
.jj-page.jj-has-scrollbar,
.jj-pdp-info.jj-has-scrollbar { scrollbar-width: none; }
.jj-page.jj-has-scrollbar::-webkit-scrollbar,
.jj-pdp-info.jj-has-scrollbar::-webkit-scrollbar { display: none; }
```

- [ ] **Step 2: Create `assets/japanjunky-scrollbar.js`**

```javascript
/**
 * japanjunky-scrollbar.js
 * Win95-style vertical scrollbar (▲/▼ buttons + draggable thumb) bound to
 * the page's primary scroll container. Mouse enhancement only — native
 * scroll + keyboard still work; the widget is aria-hidden. Auto-hides when
 * there is nothing to scroll or while the splash owns interaction.
 */
(function () {
  'use strict';

  // ─── Resolve the page's primary scroll container ───────────────
  var el = document.getElementById('jj-scroll') ||
           document.querySelector('.jj-page') ||
           document.querySelector('.jj-pdp-info');
  if (!el) return; // e.g. login — nothing to scroll

  var LINE = 40;       // px per arrow nudge
  var REPEAT_MS = 50;  // hold-to-repeat interval
  var MIN_THUMB = 24;  // px

  // Let the CSS hide this container's native scrollbar (no-JS keeps it).
  el.classList.add('jj-has-scrollbar');

  // ─── Build the widget ──────────────────────────────────────────
  var bar = document.createElement('div');
  bar.className = 'jj-scrollbar';
  bar.setAttribute('aria-hidden', 'true');

  var up = document.createElement('button');
  up.className = 'jj-scrollbar__btn jj-scrollbar__btn--up';
  up.type = 'button';
  up.tabIndex = -1;
  up.textContent = '▲'; // ▲

  var track = document.createElement('div');
  track.className = 'jj-scrollbar__track';

  var thumb = document.createElement('div');
  thumb.className = 'jj-scrollbar__thumb';
  track.appendChild(thumb);

  var down = document.createElement('button');
  down.className = 'jj-scrollbar__btn jj-scrollbar__btn--down';
  down.type = 'button';
  down.tabIndex = -1;
  down.textContent = '▼'; // ▼

  bar.appendChild(up);
  bar.appendChild(track);
  bar.appendChild(down);
  document.body.appendChild(bar);

  // ─── Geometry ──────────────────────────────────────────────────
  function maxScroll() { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function trackH() { return track.clientHeight; }
  function clampTop(v) { return Math.max(0, Math.min(maxScroll(), v)); }
  function setTop(v) { el.scrollTop = clampTop(v); }

  // ─── Sync thumb size/position + visibility ─────────────────────
  function sync() {
    var hidden = maxScroll() <= 0 || window.JJ_SPLASH_ACTIVE;
    bar.style.display = hidden ? 'none' : '';
    if (hidden) return;
    var th = Math.max(MIN_THUMB, trackH() * el.clientHeight / el.scrollHeight);
    var travel = trackH() - th;
    var ratio = maxScroll() > 0 ? el.scrollTop / maxScroll() : 0;
    thumb.style.height = th + 'px';
    thumb.style.transform = 'translateY(' + (travel * ratio) + 'px)';
  }

  el.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  if (window.ResizeObserver) {
    new window.ResizeObserver(sync).observe(el); // catches async grid height changes
  }

  // ─── Arrow buttons (click + hold-to-repeat) ────────────────────
  function bindHold(btn, dir) {
    var timer = null;
    function step() { setTop(el.scrollTop + dir * LINE); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      step();
      stop();
      timer = setInterval(step, REPEAT_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (evt) {
      btn.addEventListener(evt, stop);
    });
  }
  bindHold(up, -1);
  bindHold(down, 1);

  // ─── Track click (page jump toward the click) ──────────────────
  track.addEventListener('pointerdown', function (e) {
    if (e.target === thumb) return; // thumb drag handles itself
    var page = el.clientHeight * 0.9;
    var thumbTop = thumb.getBoundingClientRect().top;
    setTop(el.scrollTop + (e.clientY < thumbTop ? -page : page));
  });

  // ─── Thumb drag ────────────────────────────────────────────────
  var dragging = false, startY = 0, startTop = 0;
  thumb.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startTop = el.scrollTop;
    try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
  });
  thumb.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var travel = trackH() - thumb.offsetHeight;
    if (travel <= 0) return;
    setTop(startTop + (e.clientY - startY) * maxScroll() / travel);
  });
  ['pointerup', 'pointercancel'].forEach(function (evt) {
    thumb.addEventListener(evt, function (e) {
      if (!dragging) return;
      dragging = false;
      try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
    });
  });

  // ─── Re-sync once the splash releases control ──────────────────
  if (window.JJ_SPLASH_ACTIVE) {
    var splashWatch = setInterval(function () {
      if (!window.JJ_SPLASH_ACTIVE) { clearInterval(splashWatch); sync(); }
    }, 200);
  }

  // ─── Init ──────────────────────────────────────────────────────
  sync();
  window.addEventListener('load', sync); // final measure after assets/images
})();
```

- [ ] **Step 3: Load the CSS in `layout/theme.liquid`**

Find:

```liquid
  {{ 'japanjunky-content.css' | asset_url | stylesheet_tag }}
```

Add immediately after it:

```liquid
  {{ 'japanjunky-scrollbar.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 4: Load the JS in `layout/theme.liquid`**

Find:

```liquid
  <script src="{{ 'japanjunky-crt-shader.js' | asset_url }}" defer></script>
```

Add immediately after it:

```liquid
  <script src="{{ 'japanjunky-scrollbar.js' | asset_url }}" defer></script>
```

- [ ] **Step 5: Verify JS syntax + the loads landed**

Run:
```
node --check assets/japanjunky-scrollbar.js && \
grep -n "japanjunky-scrollbar.css\|japanjunky-scrollbar.js" layout/theme.liquid && \
grep -c "jj-scrollbar" assets/japanjunky-scrollbar.css
```
Expected: `node --check` prints nothing (exit 0); two matching load lines in `theme.liquid`; CSS class count ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add assets/japanjunky-scrollbar.js assets/japanjunky-scrollbar.css layout/theme.liquid
git commit -m "feat(ui): Win95 scrollbar (arrows + draggable thumb) on all scrolling pages"
```

- [ ] **Step 7: Manual verification (after deploy)**

On homepage, collection, search, list, cart, page, contact, FAQ, policy, and product pages: a Win95 scrollbar appears at the right edge (not over the taskbar). Drag the thumb, click + hold the ▲/▼ arrows, and click the track — each scrolls the page; the thumb size/position track the content and update on scroll and on resize. The bar hides when a page has nothing to scroll and during the homepage splash, reappearing after entering. Login shows no scrollbar. With JS disabled, pages still scroll via the native scrollbar.

---

## Final verification (whole change, after deploy to main)

- [ ] `node --check` passes for both modified/created JS files.
- [ ] NEWEST sort orders newest-first; `?sort=newest` / "new arrivals" preselects it; plain `/collections/all` stays FEATURED.
- [ ] Scrollbar works (drag/arrows/track) on every scrolling page; hidden when nothing to scroll, during splash, and on login; never overlaps the taskbar.
- [ ] No-JS: native scrolling intact on all pages.

## Notes for the implementer

- No theme-check/linter assumed; `node --check` + grep + the manual browser checklist are the verification. Do NOT add unit tests.
- ES5-style vanilla JS (var, no arrow functions) to match the existing assets.
- Do not touch `.jj-page`/`#jj-scroll`/`.jj-pdp-info` layout — only bind to them.
