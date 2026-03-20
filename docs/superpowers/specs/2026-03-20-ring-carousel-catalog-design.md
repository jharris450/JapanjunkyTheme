# Ring Carousel Catalog Design Spec

## Overview

Replace the fixed right 40% catalog panel with a full-viewport horizontal arc carousel of album covers. The selected item is large in the center; 5-6 others fan out smaller to either side. Smooth rotation on navigation. Filter/search bar floats just above the arc. 3D product model renders on the left with info below it. The ring overlays the Three.js portal background.

Inspired by Tomb Raider: Angel of Darkness, Silent Hill, and Resident Evil inventory screens, plus oldschool music players with radial selectors.

## Architecture

### Layer Stack (back to front)

| Layer | z-index | Content |
|-------|---------|---------|
| Three.js canvas | 0 | Portal background, Tsuno Daishi, product model |
| Ring carousel | 50 | Full-width horizontal arc of album covers + filter/search bar |
| Viewer interaction | 75 | Left side drag-to-rotate overlay (above ring, below product info) |
| Product info | 100 | Left side HUD below 3D model |
| CRT overlay + taskbar | 9997+ | Scanlines, aperture grille, taskbar |

### Viewer Interaction Overlay

The `jj-viewer-interaction` overlay covers the upper ~60% of the viewport (above the ring area). When a product is selected, it enables `pointer-events: auto` for drag-to-rotate. It must not overlap the ring carousel's bottom ~40% to avoid intercepting scroll wheel events meant for the ring. Dimensions: `position: fixed; top: 0; left: 0; width: 100vw; height: 60vh;`

### Removed Components

- `jj-catalog-panel` (fixed right 40% div) — removed from theme.liquid
- `japanjunky-catalog-panel.css` — replaced by ring carousel CSS
- `japanjunky-catalog-panel.js` — replaced by ring carousel JS
- `snippets/product-inventory-row.liquid` — ring builds covers from JSON data, not server-rendered rows

## Ring Carousel

### Container

- Full-width div, fixed to the bottom ~40% of the viewport (above the 32px taskbar)
- Semi-transparent black backing so covers read against the portal glow
- CSS `perspective` container (~800px) centered horizontally

### Cover Elements

Each product is a div containing:
- `<img>` element with album art. Only the 7 visible covers + 2 buffer covers on each side load images eagerly. All other covers use `loading="lazy"` and a dark placeholder until they enter the visible ring window.
- Small truncated title label below the image

Covers are positioned using CSS 3D transforms:

```
transform: rotateY(Xdeg) translateZ(280px)
```

### Arc Layout (7 visible: 1 selected + 6 around)

| Position | rotateY | scale | opacity |
|----------|---------|-------|---------|
| Center (selected) | 0deg | 1.0 | 1.0 |
| +/-1 | +/-30deg | 0.75 | 0.85 |
| +/-2 | +/-55deg | 0.55 | 0.6 |
| +/-3 | +/-75deg | 0.4 | 0.35 |

Cover size: selected ~180x180px (square, matching 2.0x2.0 LP model). Others scale down proportionally.

### Rotation Animation

- CSS `transition: transform 0.4s ease-out, opacity 0.3s`
- On navigate: all covers animate to their new arc positions
- New covers enter from the edges, off-screen covers are removed from DOM
- Data array index shifts to track which item is centered

### Interaction

**Keyboard:**
- ArrowLeft / ArrowRight: rotate ring
- Enter: confirm selection (dispatches `jj:product-selected`)
- Escape: deselect current product

**Mouse:**
- Click any cover: rotate it to center
- Scroll wheel on ring area: rotate carousel

**Touch:**
- Swipe left/right on ring area: rotate carousel
- Tap any cover: rotate to center + immediate select

**Selection delay:** Centering a cover starts a 300ms timer. If the cover is still centered after 300ms, it auto-selects (dispatches `jj:product-selected`). Rapid scrolling through items does not trigger model loads. Enter or direct click bypasses the delay and selects immediately. Escape while the timer is running cancels the timer without selecting.

**Scroll wheel:** Only captured when cursor is over the ring container (bottom ~40%). Filter dropdowns, when open, block scroll-to-rotate within their bounds.

## Filter / Search Bar

### Position & Layout

Thin horizontal bar (~36px tall) floating just above the arc of covers. Semi-transparent black background. Full width of the ring container.

**Left to right:**
- Search input: monospace, `>` prompt prefix, cream text on dark background
- Filter toggle buttons: `[FORMAT]` `[DECADE]` `[CONDITION]` — each toggles a dropdown of checkbox options
- Active filter count badge next to each active group
- `[CLEAR]` button when any filters active
- Item count: `"12 OF 47 ITEMS"`

### Behavior

The ring carousel JS owns all filter and search logic internally, operating on the `window.JJ_PRODUCTS` array in memory. The old DOM-based `japanjunky-filter.js` and `japanjunky-search.js` are **removed entirely** — their logic is absorbed into the ring carousel module.

**Filtering pipeline:**
1. Ring maintains a `filteredProducts` array derived from `window.JJ_PRODUCTS`
2. Active filters stored as `{ format: Set, decade: Set, condition: Set }`
3. Logic: OR within each group, AND across groups (same as before)
4. Search query is an additional AND filter matching title + artist (case-insensitive, debounced 100ms)
5. When filters change, `filteredProducts` is recomputed and the ring re-renders
6. Ring re-centers on previously selected item if it survives the filter; otherwise jumps to first match

**Filter UI:** The filter toggle buttons in the bar render dropdown lists of checkboxes dynamically from the distinct values in `window.JJ_PRODUCTS`. No server-rendered filter sidebar needed.

**Search glitch animation:** Deferred. The old search glitch effect (character scramble + pixelation) was tied to DOM table cells and does not translate to the 3D carousel. May be revisited as a cover-flip or static-noise effect in a future iteration.

## Product Info & 3D Model

### 3D Model

Unchanged from current implementation. Lives in Three.js scene. On `jj:product-selected`, the product viewer creates the LP/box model. Drag-to-rotate via interaction overlay. Model position may shift up slightly since ring occupies the bottom viewport area.

### Product Info Overlay

Fixed position, left side, above the ring layer. Positioned at `left: 16px; bottom: calc(40vh + 8px); max-width: 30vw; z-index: 100`. This places it just above the ring's top edge, below the 3D model area.

Contents (unchanged):
- Header: `C:\catalog\HANDLE.dat`
- Artist (typewriter animation, 38ms/char)
- Title (typewriter animation, 28ms/char)
- Price (typewriter animation, 22ms/char)
- Meta line: code, format, year, condition
- Variant dropdown
- `[Add to Cart]` button

Same typewriter animation, variant change, and ATC flow as current. `japanjunky-product-viewer.js` still listens to `jj:product-selected` / `jj:product-deselected`.

### Selection Flow

1. User rotates ring (keyboard, mouse, scroll)
2. Cover reaches center position
3. 300ms delay timer starts
4. If still centered after 300ms: `jj:product-selected` fires
5. Product viewer creates 3D model, Tsuno transitions out, typewriter starts
6. User can drag-rotate the model via interaction overlay
7. Escape or rotating away: `jj:product-deselected` fires, model removed, Tsuno returns

## Data Flow

### Product Data

`jj-homepage-body.liquid` outputs product data as a JSON array in a `<script>` tag instead of rendering inventory rows:

```javascript
window.JJ_PRODUCTS = [
  {
    handle: "product-slug",
    id: "123456",
    title: "Album Title",
    artist: "Artist Name",
    vendor: "Vendor",
    code: "ABC-123",
    condition: "near mint",
    format: "vinyl",
    formatLabel: "12\" Vinyl LP",
    year: "1985",
    label: "Label Name",
    jpName: "Japanese Name",
    jpTitle: "Japanese Title",
    image: "https://cdn.shopify.com/.../front.jpg",
    imageBack: "https://cdn.shopify.com/.../back.jpg",
    type3d: "box",
    variantId: "789",
    available: true,
    price: "$29.99"
  },
  ...
];
```

### Event Contract

Events remain `jj:product-selected` and `jj:product-deselected` on `document`. The ring carousel maps JSON fields to the existing event detail shape consumed by `japanjunky-product-viewer.js`:

```javascript
// jj:product-selected detail shape (matches existing consumer expectations)
{
  handle: "product-slug",
  productId: "123456",          // mapped from JJ_PRODUCTS.id
  title: "Album Title",
  artist: "Artist Name",
  vendor: "Vendor",
  code: "ABC-123",
  condition: "near mint",
  format: "vinyl",
  formatLabel: "12\" Vinyl LP",
  year: "1985",
  label: "Label Name",
  jpName: "Japanese Name",
  jpTitle: "Japanese Title",
  imageUrl: "https://...",       // mapped from JJ_PRODUCTS.image
  imageBackUrl: "https://...",   // mapped from JJ_PRODUCTS.imageBack
  type3d: "box",
  variantId: "789",
  available: true,
  price: "$29.99",
  el: coverElement              // the DOM cover element
}
```

`jj:product-deselected` detail is `{}`.

### Module Communication

```
Ring Carousel JS
  ├── manages cover lifecycle, rotation state, selection delay
  ├── consumes window.JJ_PRODUCTS
  ├── owns filter logic (OR within group, AND across groups)
  ├── owns search logic (title + artist match, debounced 100ms)
  ├── dispatches jj:product-selected / jj:product-deselected
  └── maps JJ_PRODUCTS fields to existing event detail shape

Product Viewer JS (unchanged listener)
  ├── listens jj:product-selected → create model, show info
  └── listens jj:product-deselected → remove model, hide info

Screensaver JS (unchanged)
  └── exposes window.JJ_Portal
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `assets/japanjunky-ring-carousel.css` | Ring container, perspective, cover positioning, filter bar, animations |
| `assets/japanjunky-ring-carousel.js` | Ring state management, rotation, cover lifecycle, keyboard/mouse/scroll, 300ms selection delay |

### Modified Files

| File | Changes |
|------|---------|
| `layout/theme.liquid` | Remove `jj-catalog-panel` div, add ring carousel container, update CSS/JS imports, resize viewer interaction overlay to upper 60vh |
| `sections/jj-homepage-body.liquid` | Output product data as JSON array instead of rendering inventory rows. `{{ content_for_layout }}` stays in theme.liquid but wraps the ring container instead of the old panel. Non-homepage pages render normally inside this wrapper. |
| `assets/japanjunky-product-viewer.js` | Adjust model position (shift up, ring occupies bottom) |
| `assets/japanjunky-product-info.css` | Reposition to `bottom: calc(40vh + 8px)`, left-aligned below model |

### Removed / Deprecated

| File | Reason |
|------|--------|
| `assets/japanjunky-catalog-panel.css` | Replaced by ring carousel CSS |
| `assets/japanjunky-catalog-panel.js` | Replaced by ring carousel JS |
| `assets/japanjunky-filter.js` | Filter logic absorbed into ring carousel JS |
| `assets/japanjunky-search.js` | Search logic absorbed into ring carousel JS |
| `snippets/product-inventory-row.liquid` | Ring builds from JSON, not server-rendered rows |

### Unchanged

- `assets/japanjunky-screensaver.js` — portal, Tsuno, tunnel
- `assets/japanjunky-win95.css` / `japanjunky-win95-menu.js` — taskbar
- `assets/japanjunky-crt.css` — CRT overlay
- `assets/japanjunky-cursor-light.js` — cursor system
- `assets/japanjunky-dither.js` — dither pipeline
- `assets/japanjunky-base.css` — base styles

## Visual Language

All styling follows the existing CRT terminal aesthetic:
- Monospace fonts (Fixedsys Excelsior / DotGothic16)
- No rounded corners
- CRT-style animations only (no bounce/slide/elastic)
- Color palette: black bg, red primary, gold secondary, cyan accent, cream text
- Semi-transparent dark backgrounds with subtle border glow on selected state
- Format-specific accent colors on selected cover border:
  - Vinyl: `var(--jj-amber, #ffaa00)`
  - CD: `var(--jj-cyan, #00e5e5)`
  - Cassette: `var(--jj-green, #33ff33)`
  - MiniDisc: `var(--jj-magenta, #e040e0)`
  - Hardware: `var(--jj-white, #e0e0e0)`

## Accessibility

- Ring container: `role="listbox"`, `aria-roledescription="carousel"`, `aria-label="Product catalog"`
- Each cover: `role="option"`, `aria-selected` on center item
- Keyboard fully navigable (ArrowLeft/Right, Enter, Escape)
- Filter dropdowns accessible via Tab, Space to toggle checkboxes
