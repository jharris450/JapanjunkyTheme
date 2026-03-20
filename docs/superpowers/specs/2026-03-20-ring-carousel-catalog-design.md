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
| Product info | 100 | Left side HUD below 3D model |
| Viewer interaction | 100 | Left side drag-to-rotate overlay |
| CRT overlay + taskbar | 9997+ | Scanlines, aperture grille, taskbar |

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
- `<img>` element with album art (480px source, displayed at cover size)
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

**Selection delay:** Centering a cover starts a 300ms timer. If the cover is still centered after 300ms, it auto-selects (dispatches `jj:product-selected`). Rapid scrolling through items does not trigger model loads. Enter or direct click bypasses the delay and selects immediately.

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

- Filtering removes items from the ring data array
- Ring re-centers on previously selected item if it survives the filter; otherwise jumps to first match
- Search: client-side matching on title + artist, debounced 100ms, filters ring in real-time
- Core filter logic unchanged: OR within group, AND across groups

## Product Info & 3D Model

### 3D Model

Unchanged from current implementation. Lives in Three.js scene. On `jj:product-selected`, the product viewer creates the LP/box model. Drag-to-rotate via interaction overlay. Model position may shift up slightly since ring occupies the bottom viewport area.

### Product Info Overlay

Fixed position, left side, above the ring layer. Roughly left 40%, sitting between the 3D model above and the ring below.

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

### Event Contract (unchanged)

- `jj:product-selected` — detail contains all product data fields + element reference
- `jj:product-deselected` — detail is `{}`

### Module Communication

```
Ring Carousel JS
  ├── manages cover lifecycle, rotation state, selection delay
  ├── consumes window.JJ_PRODUCTS
  ├── dispatches jj:product-selected / jj:product-deselected
  └── calls window.JJ_applyFilters() integration

Filter JS
  ├── updated selectors for ring items
  └── exposes window.JJ_applyFilters()

Search JS
  ├── updated to target ring search input
  └── calls window.JJ_applyFilters()

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
| `layout/theme.liquid` | Remove `jj-catalog-panel` div, add ring carousel container, update CSS/JS imports |
| `sections/jj-homepage-body.liquid` | Output product data as JSON array instead of rendering inventory rows |
| `assets/japanjunky-filter.js` | Update selectors for ring structure, expose filtering API |
| `assets/japanjunky-search.js` | Update selectors for ring search input |
| `assets/japanjunky-product-viewer.js` | Adjust model position (shift up, ring occupies bottom) |
| `assets/japanjunky-product-info.css` | Reposition above ring layer, left-aligned below model |

### Removed / Deprecated

| File | Reason |
|------|--------|
| `assets/japanjunky-catalog-panel.css` | Replaced by ring carousel CSS |
| `assets/japanjunky-catalog-panel.js` | Replaced by ring carousel JS |
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
- Format-specific accent colors on selected cover border (amber=vinyl, cyan=CD, green=cassette, magenta=minidisc, white=hardware)
