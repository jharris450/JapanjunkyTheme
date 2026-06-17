# Win95 Scrollbar + "Newest" Sort — Design

**Date:** 2026-06-16
**Status:** Approved (design), pending implementation plan
**Context:** Post-Tranche-C tweaks to the JapanJunky storefront. Two independent features bundled into one spec/plan because both are small and ship together.

## Purpose

1. **Newest sort:** let shoppers sort the product grid by date added to the store, and make the start-menu "new arrivals" link land on the catalog with that sort pre-selected.
2. **Win95 scrollbar:** replace the hidden/native scrollbar with an on-brand Win95-style vertical scrollbar (▲/▼ arrow buttons + draggable thumb) across all scrolling pages, matching the site's CRT/Win95 aesthetic.

## Feature 1 — "Newest" sort + new-arrivals default

### Data

The grid sorts client-side over `window.JJ_PRODUCTS`. That payload currently has no store-added date (only `year`, a release-year metafield — semantically different). Add one.

- `snippets/jj-product-json.liquid`: add a field
  `"addedAt": {{ product.created_at | date: '%s' }},`
  emitting epoch seconds for a reliable numeric client-side sort. `created_at` is always present (chosen over `published_at`, which can be null).

### Sort option

- `assets/japanjunky-product-grid.js`:
  - Add to `SORT_OPTIONS`: `{ key: 'date-desc', label: 'NEWEST', badge: 'NEW' }`. Place it directly after `featured` so it reads as the "freshness" option near the top.
  - Add a `dateOf(p)` helper: `return parseInt(p.addedAt, 10) || 0;`
  - Add a comparator branch in `applySort`'s switch: `case 'date-desc': return dateOf(b) - dateOf(a);` (newest first).

### New-arrivals default selection

- `snippets/win95-start-menu.liquid`: change the "new arrivals" link `href` from `/collections/all` to `/collections/all?sort=newest`.
- `assets/japanjunky-product-grid.js`, in init (before the first `renderGrid()`):
  - Read `?sort=` from `window.location.search`. Map the alias `newest` → `date-desc` (also accept a literal `date-desc`). Ignore unknown/missing values (default stays `featured`).
  - If a valid sort is found, set `sortMode` to it AND sync the UI to match the existing selection path: set the sort button's `--active` class, set `sortBadge` text to the option's badge wrapped in `(...)`, and set the dropdown item check/`--active`/`aria-checked` for the matching `data-sort-key`. Then the initial `applySort()`/`renderGrid()` already reflects it.
  - Implementation note: factor the "apply a sort key + sync UI" logic so both the URL-init path and the dropdown-click path use it, avoiding divergence (DRY). Minimal version: a `selectSort(key)` function the click handler also calls.

This only changes the default when the param is present; direct visits to `/collections/all` keep `FEATURED`.

## Feature 2 — Win95 scrollbar

### Components

- `assets/japanjunky-scrollbar.js` (new) — the reusable widget.
- `assets/japanjunky-scrollbar.css` (new) — Win95/CRT styling.
- Both loaded in `layout/theme.liquid` (script `defer`, stylesheet in head).

### Target resolution

Each page has exactly one primary scroll container. Resolve on load by priority:
1. `#jj-scroll` (homepage — custom wheel-driven, native bar already hidden)
2. `.jj-page` (collection / search / list / cart / generic page / contact / FAQ / policy)
3. `.jj-pdp-info` (product page internal panel)

If none found (e.g. login `.jj-auth`, or a non-scrolling page), do nothing. Bind to the first match only.

### Structure & placement

- A single fixed overlay appended to `<body>`, pinned to the viewport's right edge, ~16px wide, from top:0 down to `bottom: 32px` (clears the fixed taskbar). Contains, top→bottom: `▲` button, track (flex-fills), thumb (absolutely positioned within track), `▼` button.
- z-index above content scroll-layers (`.jj-page`/`#jj-scroll` are ~100) but below start menu (2000) and taskbar (10010). Use ~150.
- Win95 bevel borders + CRT palette; monospace `▲`/`▼` glyphs; no rounded corners. Reference `assets/japanjunky-win95.css` for the bevel treatment.
- `pointer-events: auto` (so it works even over the homepage's `pointer-events:none` `#jj-scroll`).
- `aria-hidden="true"` — it's a redundant control; native keyboard/scroll still works. (Mouse-only enhancement.)

### Behavior

Let `el` = bound container. `max = el.scrollHeight - el.clientHeight`.
- **Thumb size:** `thumbHeight = max( MIN_THUMB(=24px), trackHeight * clientHeight / scrollHeight )`.
- **Thumb position:** `top = (trackHeight - thumbHeight) * (el.scrollTop / max)`.
- **Sync** (recompute thumb size + position, and visibility) on three triggers: the container's `scroll` event (passive), a `ResizeObserver` on `el` (catches the async grid render growing content height as well as viewport changes), and `window` `resize`. That set is sufficient — no polling or mutation observers.
- **Drag thumb:** pointerdown on thumb → capture; pointermove maps `deltaY` to `el.scrollTop += deltaY * (max / (trackHeight - thumbHeight))`; pointerup releases. Use Pointer Events with `setPointerCapture`.
- **Arrow buttons:** pointerdown scrolls one line (`LINE=40px`) immediately, then auto-repeats every ~50ms while held (interval cleared on pointerup/leave/cancel). `▲` = `scrollTop -= LINE`, `▼` = `+= LINE`.
- **Track click** (on track, not thumb): page jump by `el.clientHeight * 0.9` toward the click side.
- All writes clamp `scrollTop` to `[0, max]`.

### Visibility

- Auto-hide (`display:none` or a hidden class) when `el.scrollHeight <= el.clientHeight` (nothing to scroll) and while `window.JJ_SPLASH_ACTIVE` is truthy (homepage splash owns first interaction). Re-evaluate on the same sync events.

### No-JS

- Do NOT hide `.jj-page`'s native scrollbar in CSS. Instead, when the scrollbar JS successfully binds to a `.jj-page`, it adds a class (e.g. `jj-has-custom-scrollbar` on `<html>` or the container) that the CSS uses to hide the native bar. No-JS users keep the native scrollbar. (Homepage `#jj-scroll` already hides its native bar by existing design — unchanged.)

### Reduced motion

- Honor `prefers-reduced-motion`: arrow/track scrolling jumps without smooth behavior (we write `scrollTop` directly anyway, so this is naturally satisfied; no CSS scroll-behavior is introduced).

## Files

New:
- `assets/japanjunky-scrollbar.js`
- `assets/japanjunky-scrollbar.css`

Modified:
- `layout/theme.liquid` — load the two new assets.
- `snippets/jj-product-json.liquid` — add `addedAt`.
- `assets/japanjunky-product-grid.js` — NEWEST sort option + comparator + `?sort=` init + `selectSort` refactor.
- `snippets/win95-start-menu.liquid` — new-arrivals link gains `?sort=newest`.

## Testing / acceptance

- NEWEST appears in the [SORT] dropdown; selecting it orders the grid newest-added first.
- Visiting `/collections/all?sort=newest` (and clicking "new arrivals") loads with NEWEST pre-selected: grid ordered newest-first, sort button active, badge `(NEW)`, dropdown check on NEWEST. Visiting `/collections/all` plain keeps FEATURED.
- Scrollbar appears on homepage, collection, search, list, cart, page, contact, FAQ, policy, and product; not on login. Drag, arrows (click + hold-repeat), and track-click all scroll. Thumb size/position track content and update on scroll/resize. Hidden when nothing to scroll and during splash. Never overlaps the taskbar.
- No-JS: every page still scrolls with the native scrollbar (custom bar absent, native `.jj-page` bar not hidden).
- In-browser regression by the user after deploy to `main`.

## Deploy

Shopify GitHub integration syncs `main`. Build on a feature branch, merge to `main`.
