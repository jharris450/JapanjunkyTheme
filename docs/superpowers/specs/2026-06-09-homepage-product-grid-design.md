# Homepage Product Grid + Featured Ring — Design

**Date:** 2026-06-09
**Status:** Approved

## Summary

Rework homepage into two scroll-snapped screens. Screen 1 keeps the existing
yokocho scene + ring carousel, with the ring repurposed as a curated *featured*
showcase. Screen 2 is a new traditional product grid showing the full catalog,
with the search/filter bar relocated from the ring to the grid header.

Grid cards are static covers with product info — no spinning disc (considered,
rejected by user).

## Decisions (from brainstorming)

- Ring stays visually as-is but shows a curated featured collection (~6–10 items)
- Grid cards: static cover image + title/price/info, **no** vinyl disc graphic
- Search + FORMAT/DECADE/CONDITION filters move from ring bar to grid header;
  filters apply to grid only, ring is unfiltered
- Grid data: client-side, all at once, reusing the existing `JJ_PRODUCTS`
  JSON pattern (catalog ≤ 50 items)
- Scroll mechanism: Approach A — scroll-snap panels inside a homepage-only
  fixed wrapper; the no-scroll app-shell architecture is untouched

## Architecture

### 1. Data — `sections/jj-homepage-body.liquid`

- Schema gains `featured_collection` (collection picker) alongside existing
  `collection` and `products_to_show`.
- Section outputs **two** JSON arrays with identical item shape (the current
  `JJ_PRODUCTS` shape — handle, id, title, artist, vendor, code, condition,
  format, formatLabel, year, label, jpName, jpTitle, image, imageBack,
  type3d, variantId, available, price):
  - `window.JJ_FEATURED` — products from `featured_collection`, capped at 10
  - `window.JJ_PRODUCTS` — full catalog from `collection`, capped at
    `products_to_show` (existing behavior)
- Fallback: if `featured_collection` is unset/empty, `JJ_FEATURED` = first 8
  items of the catalog collection.
- The product-serialization Liquid loop is extracted to a snippet
  (`snippets/jj-product-json.liquid`) rendered once per collection, to avoid
  duplicating the ~70-line normalization block.

### 2. Scroll wrapper — `layout/theme.liquid` + grid CSS

- Homepage only (inside existing `{% unless template == 'product' ... %}`
  guard plus `template == 'index'` check): `#jj-scroll` div —
  `position:fixed; inset:0; overflow-y:auto; scroll-snap-type:y mandatory;`
  z-index above scene/ring, below taskbar and CRT overlay. The wrapper itself
  is `pointer-events:none` (so hero-screen clicks reach ring/product zone);
  only screen 2 and the scroll indicator re-enable `pointer-events:auto`.
  Scrolling is therefore JS-driven (wheel paging below) — native wheel scroll
  on the wrapper is not relied on.
- Screen 1 (`.jj-scroll__screen--hero`): height 100%, transparent,
  `pointer-events:none` — scene, ring, and product zone remain interactive
  through it. Contains `▼ CATALOG` scroll indicator (bottom center, CRT blink
  animation, `pointer-events:auto`, click scrolls to screen 2).
- Screen 2 (`.jj-scroll__screen--grid`): `min-height:100%`, solid `#000`
  background, 1px top border (`--jj-primary`), `pointer-events:auto`,
  `scroll-snap-align:start`. Holds grid header + grid.
- Wheel paging (in grid JS): wheel-down anywhere outside the ring's 24vw
  region while at screen 1 → smooth-scroll to screen 2. Wheel-up while grid
  is scrolled to its top → back to screen 1. Ring's own wheel handler
  (carousel rotation) is untouched.
- Fade-out: when wrapper scroll passes 50% of viewport height, add
  `jj-fade-out` class to `#jj-ring` and `#jj-product-zone` (opacity 0 +
  `pointer-events:none`, CRT-appropriate transition). Removed on scroll back.

### 3. Ring changes — `assets/japanjunky-ring-carousel.js` / `.css`

- Consumes `window.JJ_FEATURED` instead of `window.JJ_PRODUCTS`.
- Search/filter/clear/count bar markup removed from `theme.liquid` ring block;
  all bar wiring (search input, dropdown build, filter state, badge/count
  updates) removed from ring JS. Ring renders the full featured list, always.
- Bar CSS rules migrate from `japanjunky-ring-carousel.css` to the new grid
  CSS (renamed `jj-grid__bar`, `jj-grid__search`, etc.).

### 4. Product grid — new `assets/japanjunky-product-grid.js` / `.css`

- Markup: grid container + header bar live in `theme.liquid` screen 2
  (matching the existing pattern of homepage UI living in the layout).
- Header bar (sticky at top of screen 2): `>` search input,
  `[FORMAT]` `[DECADE]` `[CONDITION]` dropdowns, `[CLEAR]`, item count —
  identical behavior to the current ring bar, logic relocated into grid JS,
  operating on `window.JJ_PRODUCTS`.
- Cards rendered by JS into CSS grid (`repeat(auto-fill, minmax(...))`,
  8px gutters per grid system, 2 columns at mobile widths):
  - Square cover `<img>` (`image-rendering:pixelated`, `loading="lazy"`),
    diamond `◆` placeholder when no image (matches ring fallback)
  - Title, artist, price (cream text), format badge in format color
    (vinyl amber, cd cyan, etc. — existing mapping), condition tag
  - Whole card is `<a href="/products/{handle}">`
  - Hover: format-color border + glow, consistent with
    `.jj-ring__cover--selected` treatment
- Empty state (filters match nothing): `NO ITEMS FOUND` ASCII block.
- No rounded corners, monospace only, CRT animations only.

### 5. Files touched

| File | Change |
|---|---|
| `sections/jj-homepage-body.liquid` | two collections, two JSON arrays |
| `snippets/jj-product-json.liquid` | new — extracted serialization loop |
| `layout/theme.liquid` | scroll wrapper, grid markup, bar moved, asset tags |
| `assets/japanjunky-ring-carousel.js` | consume JJ_FEATURED, drop filter/search code |
| `assets/japanjunky-ring-carousel.css` | bar styles removed |
| `assets/japanjunky-product-grid.js` | new — grid render, filters, wheel paging, fade |
| `assets/japanjunky-product-grid.css` | new — screens, bar, cards, indicator |

## Error handling

- `JJ_FEATURED`/`JJ_PRODUCTS` missing or empty → ring/grid render empty
  states, no JS errors (guard at init, same as ring does today).
- Products without images → diamond placeholder.
- Non-homepage templates: no scroll wrapper, no grid assets loaded.

## Testing

Manual via `shopify theme dev`:
1. Screen 1 unchanged: scene, ring rotation (wheel over ring), product zone
   select/add-to-cart
2. Wheel-down outside ring → snaps to grid; `▼ CATALOG` click does same
3. Ring + product zone fade when grid is in view
4. Search + each filter group on grid; CLEAR; count updates; empty state
5. Card click → product page
6. Wheel-up at grid top → back to hero
7. Narrow viewport: 2-column grid, bar wraps usably
8. Non-index pages unaffected
