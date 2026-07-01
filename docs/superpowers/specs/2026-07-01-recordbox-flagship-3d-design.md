# Recordbox Flagship 3D Product — Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan

## Purpose

Introduce a flagship bundle product — **a mystery box of 5 random records from inventory, shipped** — and represent it in the existing homepage ring UI with a floating 3D cardboard box (12×12×3, L×W×H) instead of the floating record-cover plane used for normal records.

The box reuses the existing ring-carousel selection flow and the `japanjunky-product-viewer.js` floating-graphic viewer. When the flagship product is the centered/selected item in the ring, the viewer renders a 3D cardboard box skinned from bundled cardboard textures, with the same drag / flick / idle physics every other 3D product already gets.

## Non-Goals (YAGNI)

- No new page, section, or layout. Reuses the homepage ring + product-info panel exactly as-is.
- No per-order or per-variant texture variation. The box looks identical for every buyer (mystery grab-bag aesthetic).
- No dynamic "show the 5 records inside" reveal. The box is sealed/opaque.
- No change to the product page (PDP) 3D viewer behavior for this product beyond it inheriting whatever `type3d` it already uses. (PDP treatment can be a follow-up if desired; this spec covers the homepage ring floating graphic.)

## Decisions (confirmed with user)

1. **Textures ship as theme assets**, not product images. The cardboard faces never vary, so they belong in `assets/`, versioned in git, independent of Shopify admin. Uploading them to the product would pollute the PDP gallery and the ring thumbnail and risk breakage from image reordering.
2. **Front lid = two-flap seam.** `front-left` + `front-right` composite side-by-side with a visible center seam, matching the source photos (a real box lid that opens down the middle).

## Source Textures

From `~/Desktop/recordbox/` (7 PNGs), copied into the theme as `assets/recordbox-*.png`:

| Source file        | Dimensions | Box face                                  |
|--------------------|-----------|-------------------------------------------|
| `back.png`         | 873×891   | Back face (12×12)                         |
| `front-left.png`   | 443×910   | Front lid, left half                      |
| `front-right.png`  | 408×888   | Front lid, right half                     |
| `side-left.png`    | 109×890   | Left vertical side (3-deep), slotted vents|
| `side-right.png`   | 115×886   | Right vertical side (3-deep), slotted vents|
| `top-side.png`     | 875×87    | Top edge (12×3)                           |
| `bottom-side.png`  | 887×88    | Bottom edge (12×3)                        |

Front-left + front-right widths sum to ≈ back width, confirming they are the two halves of the 12×12 front face.

## Architecture

### 1. Product tagging & data (`snippets/jj-product-json.liquid`)

Add a new `type3d` value alongside the existing `box`:

```liquid
{%- if tag == '3d-box' -%}{%- assign p_3d_type = 'box' -%}{%- endif -%}
{%- if tag == '3d-recordbox' -%}{%- assign p_3d_type = 'recordbox' -%}{%- endif -%}
```

The flagship product gets the `3d-recordbox` tag. Its normal `featured_image` (a box hero shot the merchant uploads) continues to serve as the ring-carousel selectable thumbnail via the existing `"image"` field. No extra product-image wiring — the 3D faces come from theme assets, not `product.images`.

### 2. Texture path injection (Liquid → JS)

JS cannot hardcode Shopify CDN asset URLs. Inject a global map where the ring data is already emitted (same place `JJ_FEATURED` is defined — `snippets/jj-homepage-body.liquid` / wherever the homepage body script lives):

```liquid
<script>
window.JJ_RECORDBOX_TEX = {
  back:        {{ 'recordbox-back.png'        | asset_url | json }},
  frontLeft:   {{ 'recordbox-front-left.png'  | asset_url | json }},
  frontRight:  {{ 'recordbox-front-right.png' | asset_url | json }},
  sideLeft:    {{ 'recordbox-side-left.png'   | asset_url | json }},
  sideRight:   {{ 'recordbox-side-right.png'  | asset_url | json }},
  top:         {{ 'recordbox-top-side.png'    | asset_url | json }},
  bottom:      {{ 'recordbox-bottom-side.png' | asset_url | json }}
};
</script>
```

### 3. Viewer model (`assets/japanjunky-product-viewer.js`)

In `createModel(data)`, add a `data.type3d === 'recordbox'` branch (before the generic `box` branch):

- **Geometry:** `BoxGeometry(2.0, 2.0, 0.5)` — ratio 12:12:3 (the current generic box uses `0.3`, the wrong depth for this product).
- **Front lid composite:** load `frontLeft` + `frontRight`, draw them side-by-side onto a single `<canvas>` (left half / right half) with a thin dark seam line down the center, then wrap as a `CanvasTexture`. This becomes the front face texture. Loading is async — build the material with the fallback texture first, swap `uTexture.value` once both halves load (mirror the existing `TextureLoader` nearest-filter setup).
- **Six materials**, one per `BoxGeometry` face, in three.js face order `[+X, -X, +Y, -Y, +Z, -Z]`:
  - `+X` (right) → `sideRight`
  - `-X` (left)  → `sideLeft`
  - `+Y` (top)   → `top`
  - `-Y` (bottom)→ `bottom`
  - `+Z` (front) → composited front lid
  - `-Z` (back)  → `back`
- All faces use the existing PS1 `ShaderMaterial` (nearest-filter, `uResolution` shaderRes) so the box matches the site's PS1 render aesthetic. No `DoubleSide` needed — box is closed.
- Textures created here must be tracked and disposed in `removeModel()` (extend the existing disposal loop to cover the six-material array + the composited canvas texture).

Everything downstream — spring physics, drag, flick momentum, idle bob/tilt, entrance angle, `showProductInfo`, screensaver/Tsuno coordination — is unchanged and applies automatically because the box is just another `currentModel` mesh.

### 4. Assets

Copy the 7 source PNGs into `assets/` with the `recordbox-` prefix. Consider committing a lightly size-optimized version if the raw files are large (source `back.png` ≈ 0.5 MB; others small). Optimization optional, not required for correctness.

## Data Flow

```
Product tagged 3d-recordbox
  → jj-product-json.liquid emits type3d:"recordbox" into JJ_FEATURED
  → ring-carousel.js: user centers/selects it → jj:product-selected {type3d:"recordbox", ...}
  → product-viewer.js createModel(): recordbox branch
       → BoxGeometry(2,2,0.5)
       → 6 face materials from window.JJ_RECORDBOX_TEX (theme assets)
       → front = canvas composite of frontLeft|frontRight
  → same idle/drag/flick physics as every other product
```

## Error Handling / Edge Cases

- **`JJ_RECORDBOX_TEX` missing** (e.g. JS runs before Liquid injects it): fall back to the existing `createFallbackTexture()` per face so the box still renders (grey "NO IMG"), no crash.
- **Texture 404 / slow load:** materials start with fallback texture; async swap on load. A failed load simply leaves the fallback — no exception.
- **Front composite race:** both halves must load before compositing; guard with a load-count check. If only one loads, still composite what's available onto its half.
- **Disposal:** selecting away from the box (`jj:product-deselected` / `removeModel`) must dispose all six materials + their textures + the canvas texture to avoid GPU leaks across repeated ring selections.

## Testing

- **Manual (primary):** load homepage, rotate ring to the flagship product, confirm the 3D box appears with correct face mapping (front seam visible, slotted sides on left/right, correct 12:12:3 proportions), drags/flicks/idles like other products, and info panel shows the bundle's title/price. Rotate away and back repeatedly to confirm no leak/flicker.
- **Fallback path:** temporarily blank `JJ_RECORDBOX_TEX` and confirm grey fallback box renders without console errors.
- Deploy note: live only after merge to `main` (Shopify GitHub integration syncs `main`).

## Open Questions

None. Design approved for planning.
