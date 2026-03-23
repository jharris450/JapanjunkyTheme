# Product Page Redesign: Radial Crescent Catalogue + Dedicated 3D Viewer

**Date:** 2026-03-22
**Status:** Draft
**Reference:** `outline.png` (layout sketch), `aod.jpg` (Advent of Darkness inventory UI)

## Summary

Replace the current vertical arc ring carousel + shared-portal 3D viewer with a new two-zone layout: a radial crescent catalogue on the right and a dedicated Three.js product viewer with spring physics on the left. Same browse-and-select functionality, new spatial arrangement and interaction model.

## Layout

The viewport splits into two fixed zones over the screensaver portal background:

- **Left (~60-65vw):** Product detail area — product title, dedicated Three.js canvas for the 3D album, meta tags, price, and action buttons stacked vertically
- **Right (~35-40vw):** Catalogue crescent — filter bar at top, album covers arranged along a radial arc

Both zones are viewport-fixed (not document-scrollable). The screensaver portal continues as a full-viewport background canvas (z-index 0). CRT overlay stays on top of everything.

## Catalogue Crescent (Right Side)

Album covers arranged along a radial arc — approximately a quarter-circle crescent (1 o'clock to 5 o'clock positions) curving inward toward the product viewer.

### Mechanics

- Covers positioned using CSS `rotateY() translateZ()` on a shared container
- Scrolling (wheel/touch/keyboard) rotates the container, cycling visible covers
- ~5-7 covers visible in the arc at once
- Covers fade and scale as they approach the arc edges
- Selected cover gets a format-colored glow effect (red vinyl, cyan CD, green cassette, etc.)
- Clicking a cover selects it and updates the left side
- Lazy loading of cover images (unchanged from current)

### Filter Bar

Unchanged — sits at the top of the right zone. Search input + format/decade/condition dropdowns. Keyboard controls (arrow keys to rotate, Enter to select, Esc to deselect) unchanged.

### Visual Style

Loosely positioned with slight random rotation/offset per cover — structured but imperfect, not a perfect geometric arc. Album covers show the image only (no text labels).

## Three.js Product Viewer (Left Side)

The selected album renders in a dedicated canvas element, independent from the screensaver's portal scene.

### Scene Setup

- Own `THREE.Scene`, `THREE.Camera`, `THREE.WebGLRenderer`
- Transparent background (`alpha: true`) so the screensaver shows through
- Same PS1-style vertex snapping shaders and `NearestFilter` textures as current viewer
- Supports both plane and box geometries (driven by `3d-box` product tag)

### Idle Animation (Zero-Gravity)

- Gentle slow Y-axis rotation (~0.1-0.2 rad/s)
- Subtle vertical sine-wave bobbing (small amplitude, ~2-3s period)
- Slight random tilting on X/Z axes using layered sine waves
- Overall feel: suspended in zero gravity, subtle and calm

### Spring Physics

- On drag release, a damped harmonic oscillator pulls the album back toward idle orientation
- Moderate stiffness, enough damping to avoid bouncy oscillation — "floats home" rather than snaps or wobbles
- Idle animation resumes smoothly once the spring settles

### Drag Interaction

- Raycasting for hit detection (same as current viewer)
- Drag rotates the album on X/Y axes relative to drag direction
- Dragging pauses the idle animation; spring takes over on release

## Product Info Panel (Left Side, Below Viewer)

Product details stacked vertically below the 3D canvas, inline (not a floating overlay):

1. **Product title** — cyan text
2. **Meta tags** — artist, format, year, label, condition as horizontal tag elements
3. **Product price** — with compare-at-price strikethrough if applicable
4. **Action buttons** — "Add to Cart" and "View" side by side

### Behavior

- Typewriter animation on product selection (same system as current)
- Updates when a new cover is selected from the catalogue crescent
- Clears/hides when nothing is selected

## Files Changed

### Modified

| File | Changes |
|------|---------|
| `assets/japanjunky-ring-carousel.css` | Rework from vertical arc to radial crescent layout, adjust positioning to right zone |
| `assets/japanjunky-ring-carousel.js` | Change arc math from `rotateX/translateZ` to `rotateY/translateZ`, adjust visible cover count and fade logic |
| `assets/japanjunky-product-viewer.js` | Decouple from `JJ_Portal`, create own scene/camera/renderer, add spring physics + idle animation |
| `assets/japanjunky-product-info.css` | Change from fixed bottom-left overlay to inline layout below the viewer canvas |
| `layout/theme.liquid` | Restructure left/right zone HTML, add dedicated viewer canvas, move product info into left column |

### No New Files

Everything builds on existing modules.

### Removed/Deprecated

- Viewer's dependency on `window.JJ_Portal` (screensaver scene)
- Viewer interaction overlay (`jj-viewer-interact` div covering left 65vw) — drag interaction moves to the dedicated canvas

### Unchanged

- Screensaver (portal background)
- CRT overlay
- Filter bar logic and keyboard controls
- Custom event system (`jj:product-selected` / `jj:product-deselected`)
- Taskbar / win95 UI
- Product data pipeline (`JJ_PRODUCTS`)
- Product data shape and metafield extraction

## Approach

**Hybrid: CSS Crescent + Dedicated Three.js Viewer**

- Catalogue crescent uses CSS 3D transforms (lightweight, GPU-accelerated, consistent with existing patterns)
- Product viewer gets its own isolated Three.js scene/canvas (clean spring physics, no interference with screensaver)
- Transparent canvas background lets the portal show through

This was chosen over:
- Pure CSS (no true 3D viewer possible)
- Full Three.js catalogue (unnecessarily complex, harder DOM interaction)
- Shared portal scene (current approach — couples viewer to screensaver, complicates spring physics)
