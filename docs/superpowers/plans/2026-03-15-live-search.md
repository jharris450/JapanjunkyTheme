# Live Search with Materialization Effect — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live client-side search to the header search bar that filters the product table as the user types, with a CRT materialization animation on appearing rows.

**Architecture:** Debounced `input` listener on the search bar sets `data-search-match` on each table row, then calls the existing `applyFilters()` (exposed via `window.JJ_applyFilters`). Rows transitioning to visible get a staggered CSS animation on their `<td>` cells. `prefers-reduced-motion` skips the effect.

**Tech Stack:** Vanilla JS, CSS `@keyframes`, Shopify Liquid

**Spec:** `docs/superpowers/specs/2026-03-15-live-search-design.md`

---

## Chunk 1: Filter Integration Changes

### Task 1: Extend `applyFilters()` with search match check and expose globally

**Files:**
- Modify: `assets/japanjunky-filter.js`

- [ ] **Step 1: Add search match check to the visibility logic**

In `assets/japanjunky-filter.js`, change lines 82-87 from:

```js
      if (visible) {
        row.classList.remove('jj-row--hidden');
        visibleCount++;
      } else {
        row.classList.add('jj-row--hidden');
      }
```

To:

```js
      // Search filter (AND with sidebar filters)
      if (visible && row.getAttribute('data-search-match') === 'false') {
        visible = false;
      }

      if (visible) {
        row.classList.remove('jj-row--hidden');
        visibleCount++;
      } else {
        row.classList.add('jj-row--hidden');
      }
```

- [ ] **Step 2: Fix footer count to account for active search**

Change line 91 from:

```js
    updateFooterCount(visibleCount, totalRows, activeGroups.length > 0);
```

To:

```js
    var searchInput = document.querySelector('.jj-nav-bar__input');
    var searchActive = searchInput && searchInput.value.trim() !== '';
    updateFooterCount(visibleCount, totalRows, activeGroups.length > 0 || searchActive);
```

- [ ] **Step 3: Clear search on "Clear All"**

In the `filterClear` click handler, after the active-class removal loop (after line 240) and before `applyFilters()` (line 242), add:

```js
      // Clear search
      var searchInput = document.querySelector('.jj-nav-bar__input');
      if (searchInput) {
        searchInput.value = '';
      }
      var allRows = tbody.querySelectorAll('tr[data-search-match]');
      for (var j = 0; j < allRows.length; j++) {
        allRows[j].removeAttribute('data-search-match');
      }
```

- [ ] **Step 4: Expose applyFilters globally**

At the end of the IIFE (just before the closing `})();` on line 257), add:

```js
  // Expose for search script
  window.JJ_applyFilters = applyFilters;
```

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-filter.js
git commit -m "feat: extend filter engine with search integration and global expose"
```

---

## Chunk 2: CSS Materialization Effect

### Task 2: Add materialization keyframes and classes

**Files:**
- Modify: `assets/japanjunky-homepage.css` (append before the `@media (max-width: 600px)` block)

- [ ] **Step 1: Add the CSS**

Insert before the `@media (max-width: 600px)` media query:

```css
/* ── Search materialization effect ── */
@keyframes jj-materialize {
  0% {
    filter: brightness(2) contrast(0.5) saturate(0);
    opacity: 0.3;
  }
  30% {
    filter: brightness(1.8) contrast(0.6) saturate(0.2);
    opacity: 0.6;
  }
  60% {
    filter: brightness(1.2) contrast(0.9) saturate(0.8);
    opacity: 0.9;
  }
  100% {
    filter: brightness(1) contrast(1) saturate(1);
    opacity: 1;
  }
}

@keyframes jj-static-fade {
  0% { opacity: 0.7; }
  50% { opacity: 0.3; }
  100% { opacity: 0; }
}

.jj-row--materializing td {
  animation: jj-materialize 350ms ease-out forwards;
  position: relative;
}

.jj-row--materializing td::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.03) 2px,
    rgba(255, 255, 255, 0.03) 4px
  );
  animation: jj-static-fade 350ms ease-out forwards;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .jj-row--materializing td {
    animation: none;
    filter: none;
    opacity: 1;
  }
  .jj-row--materializing td::after {
    animation: none;
    opacity: 0;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-homepage.css
git commit -m "feat: add CRT materialization keyframes and reduced-motion override"
```

---

## Chunk 3: Search Engine JS

### Task 3: Create `japanjunky-search.js`

**Files:**
- Create: `assets/japanjunky-search.js`

- [ ] **Step 1: Write the search engine**

Create `assets/japanjunky-search.js`:

```js
/**
 * japanjunky-search.js
 * Live client-side search with CRT materialization effect.
 * Debounced input on the header search bar filters product table rows.
 */
(function () {
  'use strict';

  var searchInput = document.querySelector('.jj-nav-bar__input');
  var tbody = document.getElementById('jj-product-tbody');
  if (!searchInput || !tbody) return;

  // Prevent form submission — search is client-side only
  var form = searchInput.closest('form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
    });
  }

  var debounceTimer = null;
  var previousVisible = null; // Set of row indices that were visible before this search

  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 100);
  });

  function runSearch() {
    var query = searchInput.value.trim().toLowerCase();
    var rows = tbody.querySelectorAll('tr[data-product-handle]');

    // Snapshot which rows are currently visible (before this search changes things)
    var wasVisible = new Set();
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].classList.contains('jj-row--hidden')) {
        wasVisible.add(i);
      }
    }

    // Set data-search-match on each row
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (query === '') {
        row.removeAttribute('data-search-match');
      } else {
        var title = (row.getAttribute('data-product-title') || '').toLowerCase();
        var artist = (row.getAttribute('data-product-artist') || '').toLowerCase();
        var matches = title.indexOf(query) !== -1 || artist.indexOf(query) !== -1;
        row.setAttribute('data-search-match', matches ? 'true' : 'false');
      }
    }

    // Apply filters (sidebar + search combined)
    if (typeof window.JJ_applyFilters === 'function') {
      window.JJ_applyFilters();
    }

    // Materialize rows that just became visible
    materializeNewlyVisible(rows, wasVisible);
  }

  // ── Materialization ──

  function materializeNewlyVisible(rows, wasVisible) {
    var staggerIndex = 0;
    var MAX_STAGGER = 500; // ms cap
    var STAGGER_STEP = 30; // ms per row

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var isVisible = !row.classList.contains('jj-row--hidden');
      var wasVis = wasVisible.has(i);

      if (isVisible && !wasVis) {
        // This row just appeared — animate it
        var delay = Math.min(staggerIndex * STAGGER_STEP, MAX_STAGGER);
        applyMaterialization(row, delay);
        staggerIndex++;
      }
    }
  }

  function applyMaterialization(row, delay) {
    // Remove any previous materialization state
    row.classList.remove('jj-row--materializing');

    // Force reflow so re-adding the class restarts the animation
    void row.offsetWidth;

    row.classList.add('jj-row--materializing');

    // Set stagger delay on td cells directly (animation-delay doesn't inherit)
    var cells = row.querySelectorAll('td');
    for (var i = 0; i < cells.length; i++) {
      cells[i].style.animationDelay = delay + 'ms';
    }

    // Cleanup after animation
    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      row.classList.remove('jj-row--materializing');
      for (var i = 0; i < cells.length; i++) {
        cells[i].style.animationDelay = '';
      }
    }

    // Listen for animationend on first cell
    if (cells.length > 0) {
      cells[0].addEventListener('animationend', cleanup, { once: true });
    }

    // Fallback timeout for reduced-motion (animationend won't fire)
    setTimeout(cleanup, delay + 400);
  }

})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-search.js
git commit -m "feat: add live search engine with CRT materialization effect"
```

---

## Chunk 4: Script Loading

### Task 4: Load search JS in theme.liquid

**Files:**
- Modify: `layout/theme.liquid:145`

- [ ] **Step 1: Add script tag**

In `layout/theme.liquid`, add the following line after line 145 (`japanjunky-filter.js`):

```liquid
  <script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
```

So lines 145-146 become:

```liquid
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
```

- [ ] **Step 2: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat: load search JS after filter JS in theme.liquid"
```

---

## Chunk 5: Manual Testing

### Task 5: Test the full search flow

- [ ] **Step 1: Basic search**

Load the homepage. Type a product title into the search bar. Confirm:
- Matching rows remain visible, non-matching rows hide
- Visible rows play the materialization animation (brightness wash + scanline overlay)
- Footer shows "X of Y items"
- Filter bar does NOT appear (search is separate from sidebar filter tags)

- [ ] **Step 2: Search + sidebar filter combo**

Type a search term, then click a sidebar filter (e.g. a format). Confirm only rows matching BOTH the search AND the filter are visible.

- [ ] **Step 3: Clear search**

Delete all text from the search bar. Confirm all rows materialize back in with the staggered effect.

- [ ] **Step 4: Clear All button**

Type a search term and activate a sidebar filter. Click `[clear all]`. Confirm:
- Search input is cleared
- All sidebar filters deactivated
- All rows visible again

- [ ] **Step 5: Reduced motion**

Enable "Show animations in Windows" = OFF (or set `prefers-reduced-motion: reduce` in browser dev tools). Repeat search. Confirm rows appear instantly with no animation.

- [ ] **Step 6: Enter key does not navigate**

Type in the search bar and press Enter. Confirm the page does NOT navigate to `/search`.

- [ ] **Step 7: Stagger effect**

Clear search, then type a broad term that matches many rows. Confirm rows cascade in with staggered delays (not all at once).

- [ ] **Step 8: Push**

```bash
git push
```
