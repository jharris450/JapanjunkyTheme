# Live Search with Materialization Effect — Design Spec

## Overview

Add live client-side search to the header search bar. As the user types, the product table filters to matching rows. Rows materialize into view with a CRT glitch/pixelation animation as if the system is scanning an archive and manifesting results in real time.

## Approach

Client-side substring search against existing `data-*` attributes on product table rows. Integrates with the existing sidebar filter engine via a shared `data-search-match` attribute. Materialization effect is pure CSS `@keyframes` with a staggered cascade. Respects `prefers-reduced-motion` (covers Windows "show animations" toggle).

## 1. Search Input Handler

**New file:** `assets/japanjunky-search.js`

- Listens to `input` events on `.jj-nav-bar__input` with a 200ms debounce
- Prevents the wrapping `<form>` from submitting on Enter (search is client-side only)
- On each debounced input: runs match logic, sets `data-search-match` on rows, calls `applyFilters()`

## 2. Matching Logic

Case-insensitive substring match. A row matches if either `data-product-title` or `data-product-artist` contains the search string. Empty search string = all rows match (clears search filter).

## 3. Filter Integration

The search engine does NOT show/hide rows directly. Instead:

- Sets `data-search-match="true"` or `data-search-match="false"` on each `<tr>`
- `applyFilters()` in `japanjunky-filter.js` is extended: a row must pass sidebar filters AND have `data-search-match != "false"` to be visible
- This composes search with sidebar filters naturally (AND logic)

**Changes to `japanjunky-filter.js`:**
- In the `applyFilters()` function, after checking all sidebar filter groups, also check `row.getAttribute('data-search-match') !== 'false'`
- Expose `applyFilters` so the search script can call it: attach to `window.JJ_applyFilters = applyFilters`

## 4. Materialization Effect

When a row transitions from hidden to visible (new search match, or search cleared):

### Animation stages

- **Stage 1 (0-150ms):** Row visible but obscured — CSS `filter: brightness(2) contrast(0.5) saturate(0)` washes it out. A `::after` pseudo-element overlay shows a noise/static pattern at high opacity.
- **Stage 2 (150-350ms):** Filter normalizes to `brightness(1) contrast(1) saturate(1)`. Overlay opacity fades to 0. Row content sharpens into place.
- **Stage 3 (350ms):** `jj-row--materializing` class removed via `animationend` listener. Row is clean.

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

.jj-row--materializing {
  animation: jj-materialize 350ms ease-out forwards;
}

.jj-row--materializing::after {
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

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .jj-row--materializing {
    animation: none;
    filter: none;
    opacity: 1;
  }
  .jj-row--materializing::after {
    animation: none;
    opacity: 0;
  }
}
```

This respects the Windows "show animations in Windows" toggle, which maps to `prefers-reduced-motion: reduce`.

## 5. Staggered Reveal

Matching rows don't all materialize simultaneously. Each row gets a stagger delay via inline `animation-delay` style:

- Row 0: 0ms
- Row 1: 30ms
- Row 2: 60ms
- etc.

The search JS applies both the `jj-row--materializing` class and the stagger delay. Max stagger capped at ~500ms total (so 15+ rows don't take too long).

## 6. Header Form Prevention

**File:** `sections/jj-header.liquid`

The search `<form>` currently submits to `/search` on Enter. Change to prevent default submission so search stays client-side. The JS attaches a `submit` event listener to the form and calls `preventDefault()`.

## 7. Script Loading

**File:** `layout/theme.liquid`

Add after `japanjunky-filter.js`:
```liquid
<script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
```

## 8. Table Row Position

The `::after` pseudo-element on materializing rows needs `position: absolute` with `inset: 0`. This requires the `<tr>` to have `position: relative`. Add this to the materializing class only (tables handle positioning differently, so we scope it).

## Files Changed

| File | Change |
|---|---|
| `assets/japanjunky-search.js` | New — debounced input handler, match logic, staggered materialization |
| `assets/japanjunky-filter.js` | Extend `applyFilters` to check `data-search-match`, expose as `window.JJ_applyFilters` |
| `assets/japanjunky-homepage.css` | Materialization keyframes, static overlay, reduced-motion override |
| `layout/theme.liquid` | Load search JS after filter JS |
| `sections/jj-header.liquid` | No markup change needed — form prevention handled in JS |
