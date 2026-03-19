# Game Inventory UI — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Inspiration:** Tomb Raider: Angel of Darkness, Silent Hill, Resident Evil inventory screens

## Goal

Transform the JapanJunky storefront from a draggable window manager into a video game-style inventory UI. A fixed catalog panel on the right serves as the inventory list. The left side is a 3D product viewer where selected items render as PS1-style degraded models. Tsuno Daishi acts as an idle shopkeeper presence that yields the space when an item is selected.

## Layout Architecture

The viewport divides into two zones plus a bottom HUD:

```
+------------------------------------------+------------------------+
|                                          |                        |
|           3D VIEWER (60%)                |   CATALOG PANEL (40%)  |
|                                          |                        |
|     [Tsuno Daishi / Product Model]       |   [Header: logo,       |
|                                          |    search, cart]        |
|                                          |                        |
|                                          |   [Product list:        |
|                                          |    scrollable single    |
|                                          |    column inventory]    |
|                                          |                        |
|  +------------------------------------+  |                        |
|  | PRODUCT INFO OVERLAY               |  |   [Status bar:         |
|  | Title, price, variants, desc, ATC  |  |    item count]         |
|  +------------------------------------+  |                        |
+------------------------------------------+------------------------+
|                    TASKBAR (full width, 32px)                     |
+-------------------------------------------------------------------+
```

- **Left 60%:** No DOM content. The Three.js canvas (full viewport) is visible here. Shows portal vortex background, Tsuno Daishi, and the selected product model.
- **Right 40%:** Fixed DOM panel (`position: fixed; right: 0; top: 0; width: 40%; height: calc(100vh - 32px); z-index: 100`). Background: `#0a0a0a` at ~95% opacity so the portal vortex faintly bleeds through.
- **Bottom-left overlay:** Product info HUD (`position: fixed; z-index: 100`), max-width 50% of the viewer area (i.e. ~30vw), positioned 16px from left and 48px from bottom. Only visible when a product is selected.
- **Taskbar:** Unchanged, full width at bottom. The catalog panel is not a taskbar tab (it's always visible).

### Z-Index Layering

Follows the existing stacking scale from the design guidelines:
- Screensaver canvas: `z-index: 0`
- Catalog panel + product info overlay: `z-index: 100` (above canvas, below taskbar)
- Taskbar: `z-index: 1000`
- CRT overlay: `z-index: 9997–10000` (topmost, pointer-events: none)

### Removed Elements

- `.jj-shell-header` — its contents (logo, search, cart) move into the catalog panel header.
- `#jj-window-source` wrapper and window manager catalog window — the catalog is now a fixed HUD panel, not a WM window.
- `japanjunky-product-select.js` — superseded entirely. Its responsibilities (product row clicks, detail pane, keyboard nav, ATC) are split between `japanjunky-catalog-panel.js` (selection + list) and `japanjunky-product-viewer.js` (3D model + info overlay). Remove its `<script>` tag from `theme.liquid`.
- The window manager (`japanjunky-wm.js`) may still exist for future popup windows but is no longer responsible for the catalog.

## Catalog Panel

### Header Bar (replaces shell header + window titlebar)

- **Left:** JapanJunky logo/icon + "JAPANJUNKY" text
- **Center:** Compact inline search input
- **Right:** Checkout, Watchlist, Cart buttons
- **Styling:** Dark background (`#111`), 1px border-bottom, Fixedsys font, uppercase, ~28-32px height. Matches existing titlebar chrome aesthetic.

### Product List

- Single column, full width of the panel, scrollable (`overflow-y: auto`)
- Each row: small dithered thumbnail, product title, price (right-aligned)
- **Hover:** Row highlights with subtle red/gold glow border (CRT style)
- **Selected:** Row stays highlighted, indicates which product is in the 3D viewer
- **Keyboard:** Arrow keys navigate, Enter selects/deselects (toggles). Escape deselects and returns Tsuno Daishi. Enter does NOT navigate to product page — the 3D viewer replaces page navigation.
- Click selected row again to deselect (Tsuno Daishi returns to viewer)

### Filters

- The existing three-column catalog layout is replaced entirely
- Filter sidebar content (categories, tags) becomes a collapsible dropdown or toggle at the top of the product list, below the header

### Status Bar (bottom of panel)

- Shows item count: "23 ITEMS" or active filter status
- Matches existing `.jj-window__statusbar` styling

## 3D Product Viewer

### Tsuno Daishi Behavior

State machine with four states:

1. **`idle`** — No product selected. Tsuno Daishi floats at ~30% from left, vertically centered. Gentle bobbing and slow rotation. The "shopkeeper" presence.
2. **`transitioning-out`** — Product selected. Tsuno Daishi turns to face the vortex center, drifts toward it over ~1.5s (eased).
3. **`orbiting`** — Tsuno Daishi has reached the vortex. He turns back to face the user, then slowly orbits around the vortex. Always watching.
4. **`returning`** — Product deselected (no product active). Tsuno Daishi drifts back from vortex orbit to his idle position over ~1.5s.

The multiple Tsuno Daishi ghost figures currently orbiting the vortex are removed. Only one Tsuno Daishi exists.

### Product Model

**Render quality:**
- Product models render at the same resolution as the portal (default 240p) through the same Floyd-Steinberg VGA dithering pipeline. This is intentional — the PS1/CRT degradation is the core aesthetic. Product identification relies on shape + color impression, not pixel-perfect image reproduction. The catalog panel's 2D thumbnails serve as the legible reference.

**Appearance:**
- Selected product renders as a 3D model at left-center of the viewport (same position Tsuno Daishi vacated)
- PS1-style degradation: vertex snapping shader, low-poly geometry
- Model fades in with a slight initial spin to show dimensionality, then settles facing front

**Geometry types (context-dependent):**
- **Flat plane** (default): Two-sided plane geometry. Front product image mapped to front face, second image (if available) mapped to back face. Used for records, posters, prints.
- **Box**: Six-faced box geometry. Front image on front, back image on back, sides/top/bottom get a neutral dark material. Used for CDs, VHS, figures, books.
- Geometry selection determined by Shopify product tag: `3d-box` tag triggers box geometry, otherwise defaults to flat plane.

**Transitions:**
- Product selected: Model fades in at viewer position
- Product switched: Current model fades out, new model fades in
- Product deselected: Model fades out, Tsuno Daishi returns

### Camera

- Fixed position (or with subtle breathing/drift movement)
- The model rotates, not the camera
- Camera framing ensures the model is visible in the left 60% of the viewport
- Mouse parallax (existing system in screensaver) is disabled while a product model is displayed to avoid conflicting with drag-to-rotate. Parallax resumes when product is deselected.

## Product Info Overlay

Positioned at bottom-left, overlaying the 3D viewer area. Dark panel with border, CRT typography. Only visible when a product is selected.

**Contents:**
- Product title (Fixedsys, uppercase, red/gold glow)
- Price
- Variant selector (dropdown or inline CRT-styled buttons)
- Product description text (scrollable if long)
- Add to Cart button (Win95/CRT button aesthetic)

**Behavior:**
- Appears with CRT-on flash when product is selected
- Changing variant updates the model texture in real-time (swaps product image)
- Disappears when product is deselected

## Interaction

### Product Model Rotation

- An invisible overlay div (`jj-viewer-interaction`, `position: fixed; left: 0; top: 0; width: 60%; height: calc(100vh - 32px); z-index: 50`) captures pointer events in the viewer area. It sits above the canvas (z:0) but below the catalog panel (z:100) and product info overlay (z:100).
- On mousedown, JS converts `clientX/clientY` (divided by CSS zoom) to normalized device coordinates and raycasts into the Three.js scene against the product model.
- If hit: drag rotates model freely on X and Y axes (mousemove updates rotation, mouseup stops)
- If miss: drag does nothing
- Release stops rotation, model holds its current angle (no snap-back, no auto-spin)
- When no product is selected, the overlay has `pointer-events: none` so clicks pass through normally.

### Product Selection

- Click a product row in the catalog list to select
- Click the already-selected row to deselect
- Arrow keys navigate the list, Enter selects

### Scroll

- Catalog panel scrolls independently
- Left area has no scroll — fixed 3D viewport

## Technical Architecture

### Scene Integration Pattern

The screensaver is currently a self-contained IIFE with all state (scene, camera, renderer, renderTarget, display canvas) trapped in local variables. To allow the product viewer to add meshes, raycast, and coordinate with Tsuno Daishi, the screensaver exposes a global API object before its animation loop begins:

```javascript
window.JJ_Portal = {
  scene:         scene,          // THREE.Scene — add/remove product meshes
  camera:        camera,         // THREE.PerspectiveCamera — for raycasting
  renderer:      renderer,       // THREE.WebGLRenderer — shared context
  renderTarget:  renderTarget,   // for render pipeline
  displayCanvas: displayCanvas,  // 2D output canvas
  tsuno: {
    setState: function(state) {},  // 'idle' | 'transitioning-out' | 'orbiting' | 'returning'
    getState: function() {},
    mesh: tsunoMesh                // direct mesh reference for position queries
  },
  setParallaxEnabled: function(enabled) {}  // disable during product rotation
};
```

`japanjunky-product-viewer.js` loads after the screensaver and consumes `window.JJ_Portal`. It checks for its existence on DOMContentLoaded and retries with a short polling interval if the screensaver hasn't initialized yet.

### Scene Changes (japanjunky-screensaver.js)

- Remove `sample3.jpg` tunnel texture. Replace the texture-sampled tunnel shader with a procedural approach or remove the tunnel cylinder mesh entirely, keeping the starburst glow and portal rings as the backdrop. The `swirlTexture` (vortex-swirl.jpg) remains.
- Remove multiple Tsuno Daishi ghost figures
- Add single Tsuno Daishi entity with state machine (idle, transitioning-out, orbiting, returning)
- Expose `window.JJ_Portal` API object (see integration pattern above)
- Raycasting system for product model interaction

### New: japanjunky-product-viewer.js

- Product model lifecycle: create geometry, apply texture, position, swap, destroy
- Drag-to-rotate interaction: mousedown/mousemove/mouseup on canvas, raycast to product model
- Listens for `jj:product-selected` custom event (detail: product data + image URLs)
- Listens for `jj:product-deselected` custom event
- Loads product images from Shopify CDN URLs as Three.js textures
- Determines geometry type from product tags

### New: japanjunky-catalog-panel.js

- Renders product list from Shopify Liquid-generated markup (reuses `{{ content_for_layout }}`)
- Manages selection state
- Emits `jj:product-selected` and `jj:product-deselected` custom events
- Handles keyboard navigation (arrow keys, Enter)
- Filter toggle UI

### Layout Changes (theme.liquid)

- Remove `.jj-shell-header` wrapper
- Remove `#jj-window-source` wrapper
- Add `<div class="jj-catalog-panel">` fixed to right (contains nav header + product list from `{{ content_for_layout }}`)
- Add `<div class="jj-product-info">` at bottom-left for HUD overlay

### New CSS Files

- `japanjunky-catalog-panel.css` — right panel, header bar, inventory list rows, selection states, status bar
- `japanjunky-product-info.css` — bottom-left HUD overlay, variant selector, ATC button

### Shopify Data Flow

- Product images: `{{ product.featured_image | image_url }}` — already available via Liquid
- Product type/tags: available via Liquid for geometry selection (`3d-box` tag)
- Variant images: available for real-time texture swapping
- No new API calls needed — all data rendered server-side into DOM, JS reads from data attributes

### CSS Zoom Awareness

All new JS code must account for the adaptive CSS zoom system:
- `html { zoom: 1.5 }` at >=1600px, `zoom: 2.0` at >=2400px, `zoom: 2.5` at >=3200px
- Divide `window.innerWidth/Height` by `parseFloat(getComputedStyle(document.documentElement).zoom) || 1`
- Divide `clientX/clientY` by zoom for raycasting coordinates
- Canvas sizing must use effective viewport dimensions

## Mobile (Future Phase)

On narrow screens (<768px), the layout collapses: catalog panel goes full-width, 3D viewer is hidden or becomes a small preview above the list. This is out of scope for this phase — desktop-first.

## Out of Scope

- Window manager draggable windows for the catalog (replaced by fixed HUD)
- Multiple display modes (STN, TFT, etc.) — future work
- Mobile/responsive layout — future phase
- Additional 3D geometry types beyond plane and box
