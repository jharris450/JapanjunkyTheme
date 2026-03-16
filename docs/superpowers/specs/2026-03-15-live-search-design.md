# Live Search with Materialization Effect — Design Spec

## Overview

Add live client-side search to the header search bar. As the user types, the product table filters to matching rows. Rows materialize into view with a CRT glitch/pixelation animation as if the system is scanning an archive and manifesting results in real time.

## Approach

Client-side substring search against existing `data-*` attributes on product table rows. Integrates with the existing sidebar filter engine via a shared `data-search-match` attribute. Materialization effect is pure CSS `@keyframes` with a staggered cascade. Respects `prefers-reduced-motion` (covers Windows "show animations" toggle).

## 1. Search Input Handler

**New file:** `assets/japanjunky-search.js`

- Listens to `input` events on `.jj-nav-bar__input` with a 100ms debounce (client-side matching is fast enough for a tight debounce)
- Prevents the wrapping `<form>` from submitting on Enter (search is client-side only)
- On each debounced input: runs match logic, sets `data-search-match` on rows, calls `window.JJ_applyFilters()`
- Guards against missing `JJ_applyFilters` (exits early if product table doesn't exist on the page)

## 2. Matching Logic

Case-insensitive substring match. A row matches if either `data-product-title` or `data-product-artist` contains the search string. Empty search string = all rows match (clears search filter).

## 3. Filter Integration

The search engine does NOT show/hide rows directly. Instead:

- Sets `data-search-match="true"` or `data-search-match="false"` on each `<tr>`
- `applyFilters()` in `japanjunky-filter.js` is extended: a row must pass sidebar filters AND have `data-search-match != "false"` to be visible
- This composes search with sidebar filters naturally (AND logic)

**Exact change to `japanjunky-filter.js` `applyFilters()`:**

After the sidebar filter group loop (which sets `visible`), add:

```js
// Search filter (AND with sidebar filters)
if (visible && row.getAttribute('data-search-match') === 'false') {
  visible = false;
}
```

**Footer count fix:** The `isFiltered` flag must also account for active search:

```js
var searchInput = document.querySelector('.jj-nav-bar__input');
var searchActive = searchInput && searchInput.value.trim() !== '';
updateFooterCount(visibleCount, totalRows, activeGroups.length > 0 || searchActive);
```

**Expose for search script:** Add `window.JJ_applyFilters = applyFilters;` inside the IIFE, after the function definition.

**Clear All integration:** The "Clear All" button handler should also clear the search input and remove `data-search-match` attributes from all rows, so users get a full reset.

## 4. Materialization Effect

When a row transitions from hidden to visible (new search match, or search cleared):

### Animation target

Apply the animation to `<td>` cells within the row (`.jj-row--materializing td`), NOT the `<tr>` itself. `::after` pseudo-elements are unreliable on `<tr>` elements across browsers, and `position: relative` on `<tr>` is undefined behavior per CSS spec, especially with `border-collapse: collapse`. Targeting `<td>` elements is fully cross-browser.

### Animation stages

- **Stage 1 (0-150ms):** Cells washed out — CSS `filter: brightness(2) contrast(0.5) saturate(0)`, low opacity. A `::after` pseudo-element overlay on each `<td>` shows a scanline/static pattern.
- **Stage 2 (150-350ms):** Filter normalizes, overlay fades, content sharpens into place.
- **Stage 3 (350ms):** Cleanup — both `jj-row--materializing` class and inline `animation-delay` style are removed.

### CSS implementation

```css
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
    rgba(255,255,255,0.03) 2px,
    rgba(255,255,255,0.03) 4px
  );
  animation: jj-static-fade 350ms ease-out forwards;
  pointer-events: none;
}
```

### Cleanup logic

The search JS listens for `animationend` on the **first `<td>`** of a materializing row. On fire, it removes `jj-row--materializing` from the `<tr>` and clears the inline `animation-delay` style.

**Fallback for reduced-motion:** Since `animation: none` means `animationend` never fires, use a `setTimeout(cleanup, 400)` as a fallback that runs alongside the listener. Whichever fires first cleans up; the other is a no-op.

### Reduced motion

```css
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

This respects the Windows "show animations in Windows" toggle, which maps to `prefers-reduced-motion: reduce`.

## 5. Staggered Reveal

Matching rows don't all materialize simultaneously. Each row gets a stagger delay via inline `animation-delay` style on the `<tr>` (inherited by its `<td>` children):

- Row 0: 0ms
- Row 1: 30ms
- Row 2: 60ms
- etc.

Max stagger capped at ~500ms total (so 15+ rows don't take too long). The search JS applies both the `jj-row--materializing` class and the stagger delay. Both are cleaned up after animation completes (see Section 4 cleanup).

Note: `animation-delay` on `<td>` is set via the `<tr>` style attribute and inherited. If inheritance doesn't apply for `animation-delay`, the JS should set it directly on each `<td>` instead.

## 6. Header Form Prevention

The search `<form>` currently submits to `/search` on Enter. The search JS attaches a `submit` event listener to the form and calls `preventDefault()`. No markup changes needed.

## 7. Script Loading

**File:** `layout/theme.liquid`

Add after `japanjunky-filter.js`:
```liquid
<script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
```

## Files Changed

| File | Change |
|---|---|
| `assets/japanjunky-search.js` | New — debounced input handler, match logic, staggered materialization, cleanup |
| `assets/japanjunky-filter.js` | Extend `applyFilters` with search check, fix footer count, expose as `window.JJ_applyFilters`, clear search on "Clear All" |
| `assets/japanjunky-homepage.css` | Materialization keyframes on `td`, static overlay on `td::after`, reduced-motion override |
| `layout/theme.liquid` | Load search JS after filter JS |
