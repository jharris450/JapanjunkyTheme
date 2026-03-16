# Enhanced Search Materialization — ASCII Glitch Effect Design Spec

## Overview

Replace the current CSS-based materialization (brightness/contrast wash) with a JS-driven ASCII glitch effect. When search results materialize, text cells display rapidly cycling random glitch characters in CRT phosphor colors that resolve to real content, while image cells step through progressively higher-resolution versions of the thumbnail (pixelated → sharp).

## 1. Text Cell Glitch

### Character set

Same as the calendar glitch (`japanjunky-calendar.js` line 71):
```
\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789
```
Decoded: `░▒▓█╳¤§#@%&0123456789` (17 characters)

### Color cycling

Each glitch character gets a random color from the CRT phosphor palette:
- `var(--jj-amber)`
- `var(--jj-cyan)`
- `var(--jj-green)`
- `var(--jj-magenta)`
- `var(--jj-red)`

### Frame-based animation

- **Frame rate:** 50ms per frame (same as calendar glitch)
- **Total duration:** ~350ms (7 frames)
- **Phase 1 — Scramble (frames 1-4, ~200ms):** Cell content replaced with random glitch characters. Each frame regenerates all characters and recolors randomly.
- **Phase 2 — Resolve (frames 5-7, ~150ms):** Real characters progressively revealed left-to-right. Remaining glitch characters converge from phosphor colors to the cell's normal text color (`var(--jj-text)`). Final frame restores original `innerHTML`.

### Implementation

1. On animation start, save `cell.innerHTML` and extract visible text via `cell.textContent`
2. Create a `<span>` per character position, each containing a random glitch char with a random inline phosphor color
3. Set `cell.innerHTML` to the array of colored spans
4. Each 50ms frame: regenerate random chars and colors (scramble phase), then progressively swap in real characters from `textContent` left-to-right (resolve phase)
5. Final frame: restore saved `innerHTML` exactly — this snaps structured HTML (links, icons, nested spans) back in one step. The transition from flat glitch text to restored HTML is not perceptible at 50ms frame rate.

**Note:** Restoring `innerHTML` recreates DOM nodes, which destroys any direct event listeners on cell children. The product table uses event delegation on `<tr>` (row click for detail pane), so no direct cell-child listeners exist. This is a safe assumption for the current codebase.

### Which cells

All `<td>` cells in the row **except** the image cell. Image cell is identified as: `cells[0]` if `cells[0].querySelector('img')` returns truthy (the image is always the first column). The image cell gets the pixelation treatment instead.

## 2. Image Cell Pixelation

### Shopify image URL manipulation

Shopify CDN URLs support size suffixes before the file extension. However, Liquid's `img_url` filter typically already embeds a size suffix (e.g., `image_640x640.jpg`). Before inserting a new suffix, **strip any existing size suffix first**:

```js
// Strip existing Shopify size suffix: _100x, _640x640, etc.
url = url.replace(/_\d+x\d*(?=\.[a-z]+(\?|$))/i, '');
```

Then insert the new suffix before the extension:
```
original:  /path/image_640x640.jpg?v=123
stripped:  /path/image.jpg?v=123
_10x:      /path/image_10x.jpg?v=123
```

### Progressive resolution steps

Aligned to the same 50ms frame ticker as text glitch:

| Frame | Image size | Notes |
|-------|-----------|-------|
| 1-2   | `_10x`    | Extremely blocky, ~10px wide |
| 3-4   | `_50x`    | Recognizable shape |
| 5-6   | `_100x`   | Nearly sharp |
| 7     | original  | Full resolution (original `src` restored) |

### Implementation

1. On animation start, save original `img.src` (this is the full-resolution URL)
2. Set `img.style.imageRendering = 'pixelated'` to keep hard pixel edges when upscaled
3. Each frame: swap `img.src` to the appropriate size suffix URL (after stripping existing suffix)
4. Final frame: restore original `src` and remove `imageRendering` style

## 3. Timing & Stagger

- Same stagger as current: 30ms per row, 500ms cap
- Stagger delay is additive: a row with 60ms stagger starts its 350ms glitch at t=60ms and finishes at t=410ms
- Each row's animation starts after its stagger delay via `setTimeout`, then runs 7 frames at 50ms via `setInterval`

## 4. Cancellation & Cleanup

### In-flight cancellation

A new search keystroke (after debounce) may fire while rows are still mid-glitch from the previous keystroke. To prevent overlapping intervals corrupting DOM state:

- Store the active `intervalId` and `timeoutId` (stagger delay) on each `<tr>` element via expando properties (`row._glitchInterval`, `row._glitchTimeout`)
- Before starting a new glitch on a row, clear any existing interval/timeout on that row
- On cancellation, immediately restore the row's saved `innerHTML` and `img.src` (snap to final state)
- Also clear `img.style.imageRendering` on cancellation

### Row hidden mid-animation

If a row gets hidden (e.g., sidebar filter applied during glitch), the interval keeps running but writes to a hidden element. This is harmless — the interval self-terminates after 7 frames. No special handling needed.

## 5. Reduced Motion

The `prefers-reduced-motion` CSS override was intentionally removed — the user wants the CRT glitch effect to play regardless of the Windows "Show animations" setting. No reduced-motion handling in CSS or JS.

## 6. Integration

### Replaces

- Remove CSS `@keyframes jj-materialize` and `@keyframes jj-static-fade`
- Remove `.jj-row--materializing td` and `.jj-row--materializing td::after` rules
- Remove `applyMaterialization` function from `japanjunky-search.js` (replaced by new glitch function)
- Remove `jj-row--materializing` class usage entirely

### Keeps

- `materializeVisibleRows` logic (decides which rows animate) — rename to `glitchVisibleRows`
- Debounced search input, `data-search-match` bridge, `applyFilters()` integration — unchanged
- Stagger delay structure — same concept, applied via setTimeout

### Trigger

- Search only. Not on initial page load.

## 7. Files Changed

| File | Change |
|---|---|
| `assets/japanjunky-search.js` | Replace `applyMaterialization` with frame-based glitch engine; remove `jj-row--materializing` usage |
| `assets/japanjunky-homepage.css` | Remove `@keyframes jj-materialize`, `jj-static-fade`, `.jj-row--materializing td`, `.jj-row--materializing td::after` |
