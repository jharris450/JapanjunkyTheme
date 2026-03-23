# Product Page Redesign: Radial Crescent Catalogue + Dedicated 3D Viewer

**Date:** 2026-03-22
**Status:** Draft

## Summary

Replace the current vertical arc ring carousel + shared-portal 3D viewer with a new two-zone layout: a radial crescent catalogue on the right and a dedicated Three.js product viewer with spring physics on the left. Same browse-and-select functionality, new spatial arrangement and interaction model.

**Visual references:** The layout is based on a hand-drawn outline (product viewer left, catalogue crescent right) and the Advent of Darkness inventory screen (items arranged along a curved rail on the right side of the viewport, selected item displayed large on the left).

## Layout

The viewport splits into two fixed zones over the screensaver portal background:

- **Left (~60-65vw):** Product detail area — product title, dedicated Three.js canvas for the 3D album, meta tags, price, and action buttons stacked vertically
- **Right (~35-40vw):** Catalogue crescent — filter bar at top, album covers arranged along a radial arc

Both zones are viewport-fixed (not document-scrollable). The screensaver portal continues as a full-viewport background canvas (z-index 0). CRT overlay stays on top of everything.

**Responsive:** Desktop only for v1. Mobile layout will be addressed in a follow-up.

## Catalogue Crescent (Right Side)

Album covers arranged along a radial arc — approximately a quarter-circle crescent (1 o'clock to 5 o'clock positions) curving inward toward the product viewer.

### Arc Geometry

Uses the same **slot-repositioning model** as the current ring carousel — covers are individually transformed into discrete arc positions, not placed on a rotating container. The difference is axis: current uses `rotateX/translateZ` (vertical arc), new uses `rotateY/translateZ` (radial crescent curving left-to-right).

- **Arc slots:** 7 visible positions (center + 3 on each side), matching current system
- **Radius:** `translateZ(280px)` (same as current `TRANSLATE_Z`)
- **Perspective:** `800px` (same as current)
- **Angular spread:** Each slot offset by 15-20deg rotateY from center (deliberately tighter than the current 30/55/75deg vertical arc — produces a quarter-circle crescent rather than a wide spread)
- **Random offset:** Each cover gets a slight random rotation (±2-3deg) and position jitter applied once on creation, not per frame. This gives the "structured but imperfect" feel.

### Mechanics

- Scrolling (wheel/touch/keyboard) shifts which covers occupy the arc slots
- Covers fade and scale as they approach the arc edges (same approach as current `opacity` and `scale` in ARC config)
- Selected cover gets a format-colored glow effect (red vinyl, cyan CD, green cassette, etc.)
- Clicking a cover selects it and updates the left side
- Lazy loading of cover images (unchanged)
- **Touch:** Horizontal swipe to rotate (changed from vertical to match the new arc axis)
- **Wheel:** Primary axis changes from `deltaY` to `deltaX` (with `deltaY` as fallback for mice without horizontal scroll)
- **Keyboard:** Left/Right arrow keys to rotate (remapped from Up/Down), Enter to select, Esc to deselect

### Filter Bar

Unchanged — sits at the top of the right zone. Search input + format/decade/condition dropdowns.

### Visual Style

Album covers show the image only (no text labels). The current `jj-ring__cover-label` element and its CSS styles are removed.

## Three.js Product Viewer (Left Side)

The selected album renders in a dedicated canvas element, independent from the screensaver's portal scene.

### Scene Setup

- Own `THREE.Scene`, `THREE.Camera`, `THREE.WebGLRenderer`
- Transparent background (`alpha: true`) so the screensaver shows through
- Same PS1-style vertex snapping shaders and `NearestFilter` textures as current viewer
- **Shader resolution:** Read from `JJ_SCREENSAVER_CONFIG.resolution`, parsed as integer (`parseInt(value, 10) || 240`). This is the same raw config value the screensaver uses, keeping visual consistency.
- Supports both plane and box geometries (driven by `3d-box` product tag)

### Idle Animation (Zero-Gravity)

Starting values (tune to taste):
- Y-axis rotation: `0.15 rad/s`
- Vertical sine-wave bobbing: amplitude `0.05` units, period `2.5s`
- X/Z tilt: layered sine waves, range `±0.08 rad`, different frequencies per axis
- Overall feel: suspended in zero gravity, subtle and calm

### Spring Physics

Starting values (tune to taste):
- Damped harmonic oscillator: stiffness `~8`, damping ratio `~0.7` (underdamped, settling in ~0.5s)
- On drag release, spring pulls album back toward idle orientation
- "Floats home" rather than snaps or wobbles
- Idle animation resumes smoothly once the spring settles

### Drag Interaction

- Raycasting for hit detection (same as current viewer)
- Drag rotates the album on X/Y axes relative to drag direction
- Dragging pauses the idle animation; spring takes over on release

### Screensaver Coordination

When a product is selected, the viewer dispatches coordination with the screensaver (preserving current behavior):
- Tsuno Daishi ghost transitions out (`portal.tsuno.setState('transitioning-out')`)
- Screensaver parallax disables (`portal.setParallaxEnabled(false)`)

On deselection, the reverse:
- Tsuno Daishi returns (`portal.tsuno.setState('returning')`)
- Parallax re-enables (`portal.setParallaxEnabled(true)`)

This coordination accesses `window.JJ_Portal` only for these two calls — the viewer's own rendering is fully independent.

### Dual Canvas Performance

Two simultaneous WebGL contexts (screensaver + viewer) may cause pressure on lower-end hardware. No explicit mitigation for v1 — monitor and address if issues arise.

## Product Info Panel (Left Side, Below Viewer)

Product details stacked vertically below the 3D canvas, inline (not a floating overlay):

1. **Product title** — cyan text (`var(--jj-accent)`). Displays the product title only; artist is shown separately in meta tags below.
2. **Meta tags** — artist, format, year, label, condition as horizontal tag elements
3. **Product price** — formatted price (no compare-at-price; not currently in the data pipeline)
4. **Action buttons** — "Add to Cart" and "View" side by side
   - **Add to Cart:** Adds the selected variant to cart (same as current)
   - **View:** Navigates to `/products/{handle}`. Uses Shopify's default product template until a custom one is built (separate future task).

Existing fields from current product info panel (header path, description, variant selector) are **removed** in this layout — the panel is streamlined to the four items above.

### Behavior

- Typewriter animation on product selection (same system as current)
- Updates when a new cover is selected from the catalogue crescent
- Clears/hides when nothing is selected

## Files Changed

### Modified

| File | Changes |
|------|---------|
| `assets/japanjunky-ring-carousel.css` | Rework from vertical arc to radial crescent layout, adjust positioning to right zone, remove `.jj-ring__cover-label` styles |
| `assets/japanjunky-ring-carousel.js` | Change arc math from `rotateX/translateZ` to `rotateY/translateZ`, remap touch to horizontal swipe, remap wheel to `deltaX` primary, remap keyboard to Left/Right arrows, adjust visible cover count and fade logic, add per-cover random jitter, remove cover label element creation |
| `assets/japanjunky-product-viewer.js` | Decouple rendering from `JJ_Portal` (own scene/camera/renderer), add spring physics + idle animation, keep screensaver coordination calls for Tsuno Daishi and parallax |
| `assets/japanjunky-product-info.css` | Change from fixed bottom-left overlay to inline layout below the viewer canvas, remove header path / description / variant selector styles |
| `layout/theme.liquid` | Restructure left/right zone HTML, add dedicated viewer canvas, move product info into left column, add View button to product info actions, remove `jj-viewer-interact` overlay div |

### No New Files

Everything builds on existing modules.

### Removed/Deprecated

- Viewer's own scene rendering via `window.JJ_Portal` — viewer creates its own scene
- Viewer interaction overlay (`jj-viewer-interact` div covering left 65vw) — drag interaction moves to the dedicated canvas
- Product info fields: header path (`C:\catalog\item.dat`), description text, variant selector dropdown

### Unchanged

- Screensaver (portal background)
- CRT overlay
- Filter bar logic
- Custom event system (`jj:product-selected` / `jj:product-deselected`)
- Taskbar / win95 UI
- Product data pipeline (`JJ_PRODUCTS`) and data shape
- Metafield extraction (`sections/jj-homepage-body.liquid`)

## Approach

**Hybrid: CSS Crescent + Dedicated Three.js Viewer**

- Catalogue crescent uses CSS 3D transforms (lightweight, GPU-accelerated, consistent with existing patterns)
- Product viewer gets its own isolated Three.js scene/canvas (clean spring physics, no interference with screensaver)
- Transparent canvas background lets the portal show through

This was chosen over:
- Pure CSS (no true 3D viewer possible)
- Full Three.js catalogue (unnecessarily complex, harder DOM interaction)
- Shared portal scene (current approach — couples viewer to screensaver, complicates spring physics)
