# Product Page Template — Design Spec

**Date**: 2026-04-07
**Scope**: New Shopify product template with cinematic View Transitions API page transition, 3D product viewer with vinyl disc, and terminal-styled product info panel.

## Overview

When a user clicks [View] on the homepage product info panel, a cinematic transition plays: Tsuno Daishi grabs the product, the catalog UI flies off screen, and the browser navigates to a real Shopify product page at `/products/{handle}`. The product page loads with the portal screensaver at a shifted camera angle (as if the viewer walked to the side), a product info panel sliding in from the left, and a 3D product graphic with a half-pulled vinyl disc animating in from the right.

## 1. Page Transition — Homepage Exit

**Trigger**: Click on `[View]` button (`#jj-pi-view`) in the product info panel.

**Sequence** (~1.2s total, overlapping):

1. **Tsuno grab (~0.5s)**: In the screensaver scene, Tsuno moves toward the screen position where the product viewer canvas sits. Since Tsuno and the product graphic are in separate rendering contexts (screensaver vs product viewer canvas), the "grab" is a visual illusion — Tsuno slides toward the product's on-screen location. Mood shifts to an excited/carrying state. Quick positional animation via the existing `tsunoTransitioning` system.
2. **Fly-off (~0.8s, overlapping with grab)**: View Transitions API captures the outgoing page. CSS keyframe animations on tagged elements:
   - `.jj-ring__bar` → flies up off screen
   - `.jj-ring__stage` → flies down off screen
   - `.jj-product-info` → flies left off screen
   - `#jj-viewer-canvas` → fades/scales down (product "picked up")
3. **Navigate**: After ~1.2s, `window.location` changes to `/products/{handle}`. The View Transitions API crossfades into the new page.

**Firefox fallback**: No exit animation. Instant navigation. Product page entrance animations still play.

**Implementation**: Intercept [View] click in `japanjunky-product-viewer.js`. Run Tsuno grab animation via `JJ_Portal.tsuno`, then after delay set `window.location`.

## 2. Page Transition — Product Page Entrance

**Sequence** on `/products/{handle}` load:

1. **Portal screensaver initializes with shifted camera**: `window.JJ_SCREENSAVER_CONFIG.cameraPreset = 'product'` triggers an offset camera position (e.g., `camera.position.set(-3, 0.5, -1)` looking at `(2, 0, 30)`). Portal is full-screen background, viewed from the side. Tsuno starts in a resting idle state.
2. **Product info panel slides in from left (~0.4s)**: Left-side panel uses CRT-on flash effect (reuse `.jj-product-info--entering` pattern).
3. **Product graphic canvas animates in from right (~0.4s)**: 3D viewer fades/scales in. Staggered ~0.1s after info panel.
4. **Vinyl slide-out (~0.6s, after graphic settles)**: Vinyl disc slides out from behind the album cover to the right, stopping at 50% pulled out. Then begins slow rotation + bob idle.
5. **View Transitions API crossfade**: Incoming animations layer on top of the API's crossfade from the old page screenshot.

## 3. Product Page Layout

Full-screen portal background with two overlay zones.

### Left side — Product info panel

Width: ~360px, matching homepage `jj-product-info` styling (dark semi-transparent backdrop, Fixedsys monospace, no window chrome).

Stacked top to bottom:
- `[← Catalog]` back button — navigates home with reverse transition
- Artist name — red, glowing (`jj-primary`)
- JP name — muted, 25% width separator line below
- Album title — cream, glowing (`jj-text`)
- JP title — muted
- Meta rows — Code, Label, Format, Year, Condition (label/value pairs)
- Price — gold, glowing (`jj-secondary`)
- Variant selector — inline bracketed buttons: `[NM] [VG+] [G]`. Selected variant highlighted in red/primary. Clickable to change variant.
- `[Add to Cart]` button
- Thumbnail strip — 4 small images in a horizontal row:
  - Image 1: Album front (default)
  - Image 2: Album back
  - Image 3: Vinyl label side A
  - Image 4: Vinyl label side B
  - Click swaps what's shown on the 3D viewer
- Description — product description text, monospace, muted color

### Right side — Product graphic canvas

Dedicated Three.js canvas (same architecture as homepage `jj-viewer-canvas`):
- Product cover mesh — same flip behavior as homepage (click/drag to flip front/back). Uses image 1 (front) and image 2 (back).
- Vinyl disc mesh — procedurally generated, half-pulled to the right. Slow rotation + gentle bob idle.
- Different floating animation parameters than homepage (to be tuned during implementation).
- PS1 vertex snapping shader pipeline for visual consistency.

### Background — Portal screensaver

- Full viewport, rendered by `japanjunky-screensaver.js`
- Camera offset to the side via `cameraPreset: 'product'`
- Tsuno present in scene, resting idle state
- All existing effects (tunnel, rings, sparkles, glow, dithering) active

## 4. 3D Vinyl Disc

New mesh in the product viewer scene.

### Geometry

`CylinderGeometry` — flat disc (height ~0.02). Radius slightly smaller than album cover width (looks like it's sliding out from a sleeve).

### Materials

- **Outer ring / grooves**: Dark black-brown base. Concentric ring pattern via `sin()` shader on radial distance (similar technique to portal ring shader). Subtle reflective sheen.
- **Center label**: Circular area (~40% of disc radius). UV-mapped to a circle in the disc center. Textured from product image 3 (side A) or image 4 (side B).
- **Edge**: Thin dark edge visible from the side.

### Animation

- **Entrance**: Slides out from behind album cover to the right, stopping at ~50% pulled out (~0.6s ease-out).
- **Idle**: Slow continuous rotation around flat axis (~1 revolution per 8-10 seconds) + gentle vertical bob (sin wave, ~2px amplitude, slow period).
- **Label sync**: When album is flipped to back, vinyl label swaps to side B (image 4). Flipped to front → side A (image 3).

### Shader

Reuses PS1 vertex snapping pipeline from existing product viewer.

## 5. Variant Selector

Inline bracketed buttons rendered from product variant data:

```
[NM]  [VG+]  [G]
```

- One button per variant option value (condition)
- Selected variant: red/primary color, subtle glow border
- Unselected: muted color, default border
- Click updates: price display, availability, `[Add to Cart]` state, variant ID for cart form
- Implementation: standard Shopify variant JS — update a hidden `<input name="id">` and POST to `/cart/add`

## 6. Thumbnail Strip

Four small square thumbnails below the product info:

| Thumbnail | Source | Click behavior |
|-----------|--------|---------------|
| 1 | `product.images[0]` (front) | Flip product cover to front in 3D viewer |
| 2 | `product.images[1]` (back) | Flip product cover to back in 3D viewer |
| 3 | `product.images[2]` (label A) | Highlight vinyl label, swap to side A |
| 4 | `product.images[3]` (label B) | Highlight vinyl label, swap to side B |

Selected thumbnail gets a red/primary border. Styled as small dark squares with 1px borders, matching the action button aesthetic.

Graceful handling when fewer than 4 images: only render thumbnails for available images. Vinyl disc shows a generic black label if images 3/4 are missing.

## 7. View Transitions API Wiring

### Meta tag

Add to `<head>` in `layout/theme.liquid`:
```html
<meta name="view-transition" content="same-origin">
```

Enables cross-document View Transitions for all same-origin navigations.

### Transition names (CSS)

**Homepage elements** (outgoing):
- `.jj-ring__bar` → `view-transition-name: catalog-bar`
- `.jj-ring__stage` → `view-transition-name: catalog-stage`
- `.jj-product-info` → `view-transition-name: product-info`
- `#jj-viewer-canvas` → `view-transition-name: product-canvas`
- `#jj-screensaver` → `view-transition-name: portal`

**Product page elements** (incoming):
- `.jj-pdp-info` (product page info panel) → `view-transition-name: product-info`
- `#jj-pdp-viewer-canvas` → `view-transition-name: product-canvas`
- `#jj-screensaver` → `view-transition-name: portal` (shared — provides visual continuity)

Elements with matching names animate between positions. Elements without matches use `::view-transition-old` / `::view-transition-new` pseudo-elements for generic in/out.

### Transition keyframes (CSS)

```css
/* Outgoing — homepage elements */
::view-transition-old(catalog-bar) {
  animation: fly-up 0.5s ease-in forwards;
}
::view-transition-old(catalog-stage) {
  animation: fly-down 0.6s ease-in forwards;
}

/* Incoming — product page elements */
::view-transition-new(product-info) {
  animation: slide-in-left 0.4s ease-out;
}
::view-transition-new(product-canvas) {
  animation: fade-scale-in 0.4s ease-out 0.1s both;
}

/* Portal: crossfade between camera angles */
::view-transition-old(portal) {
  animation: fade-out 0.3s ease-out forwards;
}
::view-transition-new(portal) {
  animation: fade-in 0.3s ease-in 0.1s both;
}
```

### Back navigation

`[← Catalog]` click sets `window.location = '/'`. The View Transitions API does not auto-reverse animations — explicit back-direction keyframes are needed. The back navigation uses the CSS `@view-transition` navigation type or a `data-back-nav` sessionStorage flag to trigger reverse animations:
- Product info panel slides out left
- Product canvas fades out right
- Catalog bar flies down into place
- Catalog stage flies up into place
- Portal crossfades back to centered camera angle

## 8. Screensaver Modifications

### Camera presets

Add to `japanjunky-screensaver.js` init:

```javascript
var cameraPresets = {
  default: { pos: [0, 0, -1], look: [0, 0, 30] },
  product: { pos: [-3, 0.5, -1], look: [2, 0, 30] }
};
var preset = cameraPresets[config.cameraPreset] || cameraPresets.default;
camera.position.set(preset.pos[0], preset.pos[1], preset.pos[2]);
// lookAt called in animation loop with parallax offset
```

The `LOOK_TARGET` variable updates to use the preset's look target.

### Tsuno carrying state

New Tsuno state: `'carrying'`. When `cameraPreset === 'product'`:
- Tsuno starts in a resting idle near the portal edge (not orbiting)
- Gentle floating bob, occasionally looking toward the camera
- No mood cycling — calm/idle

### Config flag

`window.JJ_SCREENSAVER_CONFIG.cameraPreset` set by `sections/jj-product.liquid`:
```liquid
<script>
  window.JJ_SCREENSAVER_CONFIG.cameraPreset = 'product';
</script>
```

## 9. Product Viewer Modifications

### Product page mode

`japanjunky-product-viewer.js` detects product page context (e.g., `data-page-mode="product"` on canvas or a JS config flag) and adjusts:
- **Float animation**: Different parameters (amplitude, speed, axis weighting) — to be tuned
- **Vinyl attachment**: Creates and manages the vinyl disc mesh as a child/sibling of the product cover mesh
- **Flip behavior**: Same click/drag flip as homepage. Flip also triggers vinyl label swap (A↔B)
- **Positioning**: Canvas positioned on the right side of the viewport instead of overlapping the info panel

### New functionality

- Vinyl mesh creation (geometry, groove shader, label texture mapping)
- Vinyl entrance animation (slide-out from behind cover)
- Vinyl idle animation (rotation + bob)
- Thumbnail-driven texture swapping
- Variant-driven state updates

## 10. File Changes

### New files
- `templates/product.json` — Shopify JSON template
- `sections/jj-product.liquid` — Product section with HTML structure + data JSON block + schema
- `assets/japanjunky-product-page.css` — Product page layout, extending `jj-product-info` visual language
- `assets/japanjunky-product-page.js` — Entrance animations, variant selector, thumbnail strip, add-to-cart, back button transition

### Modified files
- `layout/theme.liquid` — View Transition meta tag, transition CSS, product page script/CSS includes
- `assets/japanjunky-screensaver.js` — Camera presets, Tsuno carrying state
- `assets/japanjunky-product-viewer.js` — Product page mode, vinyl disc, different float params, thumbnail swapping

### No new dependencies
Everything builds on existing Three.js and the established shader pipeline.

## 11. Graceful Degradation

- **Firefox / no View Transitions**: Instant navigation. Product page entrance animations still play. No exit animation.
- **No WebGL**: Product graphic area shows a static image fallback (the product's featured image). Vinyl disc not rendered.
- **Missing images**: Vinyl shows generic black label if images 3/4 not uploaded. Back cover shows front cover if image 2 missing. Thumbnail strip only shows available images.
- **No JS**: Standard Shopify product page renders from the Liquid template — all product data, add-to-cart form, and images are server-rendered.
