# Bundle Hero: Mystery-Box Fold-Out — Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Supersedes (integration only):** `2026-07-01-recordbox-flagship-3d-design.md` — the recordbox box mesh + textures + module are reused, but the box is now the homepage hero centerpiece, not a selectable ring-carousel entry.

## Purpose

Repurpose the entire `jj-ring` homepage hero for the flagship **"Five Random Records"** bundle (a mystery box of 5 random records, shipped). Remove the featured-collection carousel. On load a closed 3D box sits at the crescent's mouth; clicking it opens the box and fans **5 live 3D record meshes** down the vertical crescent as an illustrative preview of what a buyer might receive. Each record is clickable for a read-only preview. A **Reroll** button reshuffles the five with a retract → close → shake → reopen animation. A persistent button is the only purchase action; it buys the bundle.

The five records are an **illustrative client-side random sample** from live inventory — not the actual shipped contents (those are chosen at fulfillment). No backend.

## Confirmed Decisions

1. **5 records = illustrative random sample**, re-rolled client-side each load/reroll. No backend/metafield.
2. **Record click = preview only.** Shows the record's info; **not** individually purchasable. Only the bundle is buyable.
3. **Bundle purchase = one dedicated persistent button** ("Add 5 Random Records — $X"). Clicking the box never adds to cart.
4. **Random pool = distinct available record-format products**, excluding the bundle itself.
5. **Fold-out layout = vertical crescent**, reusing the existing `ARC` positions as 3D targets.
6. **All 5 records are simultaneous 3D meshes** (Approach B) in one shared three.js scene, folding out of the box.

## Non-Goals (YAGNI)

- No backend, no per-bundle inventory, no "these exact records ship."
- No individual add-to-cart for the sampled records.
- No vinyl-disc treatment or drag-to-rotate on the sampled records (preview is forward-slide + slow spin only).
- No change to the product grid below the hero, the splash/forest intro, or the product page.
- No new carousel navigation (arrow/scroll/swipe rotation is retired for this hero; interaction is click-box / click-record / reroll).

## Architecture / Components

### New files

- **`assets/japanjunky-bundle-stage.js`** — the hero controller. Owns one three.js scene + canvas holding the box (body + two hinged front-flap meshes) and 5 record meshes (`PlaneGeometry` + PS1 shader). Manages open/close/shake/slide animations, raycast picking, the reroll sequence, preview dispatch, and the bundle add-to-cart button. Consumes `window.JJ_BUNDLE`, `window.JJ_PRODUCTS`, `window.JJ_RECORDBOX_TEX`, `window.JJ_Recordbox`, `window.JJ_BundlePool`, `window.JJ_BundleFSM`, `window.JJ_PS1`.
- **`assets/japanjunky-bundle-pool.js`** — pure UMD (`window.JJ_BundlePool`, no DOM/three). Random selection: `pickRecords(products, n, excludeId, rng)` → up to `n` distinct available record-format entries (dedup by product id), excluding the bundle. Deterministic when passed a seeded `rng` (for tests).
- **`assets/japanjunky-bundle-fsm.js`** — pure UMD (`window.JJ_BundleFSM`, no DOM/three). The open/reroll state machine: states `closed, opening, open, retracting, closing, shaking`; `next(state, event)` transition table; `isLocked(state)` true for every state except `closed` and `open` (input lock during animation).
- **`assets/japanjunky-ps1-shader.js`** — small UMD (`window.JJ_PS1 = { vert, frag }`) holding the existing `PS1_VERT`/`PS1_FRAG` GLSL so `product-viewer.js` and `bundle-stage.js` share one copy instead of duplicating the source.

### Modified files

- **`sections/jj-homepage-body.liquid`** — remove the featured-collection ring wiring (`JJ_FEATURED` no longer needed for the hero). Emit:
  ```js
  window.JJ_BUNDLE = { handle, productId, variantId, price, priceCents, available, title };
  ```
  (`productId` is what `pickRecords` uses to exclude the bundle from its own random pool.)
  from the bundle product (looked up by a section setting `bundle_product`, defaulting to handle `five-random-records`). Keep `JJ_PRODUCTS` (full catalog, `include_unavailable: true`) as the random pool.
- **`layout/theme.liquid`** — (a) hero markup at lines 181–207: add the bundle `<canvas>` inside `#jj-ring`, plus a **Reroll** button and the persistent bundle **Add-to-Cart** button; (b) load `japanjunky-ps1-shader.js`, `japanjunky-recordbox.js` (already loaded), `japanjunky-bundle-pool.js`, `japanjunky-bundle-fsm.js`, `japanjunky-bundle-stage.js` in order, all before any consumer; (c) stop loading `japanjunky-ring-carousel.js` on the homepage (retire it for this hero).
- **`assets/japanjunky-product-viewer.js`** — honor `detail.preview === true` on `jj:product-selected`: run only the info-panel population, **disable/hide the info-panel Add-to-Cart**, and skip `createModel`/screensaver coordination (the record is already 3D in the bundle scene). Refactor its inline `PS1_VERT`/`PS1_FRAG` to consume `window.JJ_PS1`.

### Reused as-is

`japanjunky-recordbox.js` (box `DIMS`/`FACE_ORDER`), `JJ_RECORDBOX_TEX` (box face textures), the `ARC` crescent offsets (copied into `bundle-stage` as 3D slot targets), the `#jj-product-info` DOM + `jj:product-selected` event contract, `three.min.js`.

## Box Open Mechanics

The box is built as **body + two front-flap meshes**, not a monolithic `BoxGeometry`:
- **Body:** five faces (back, top, bottom, left, right) textured from `JJ_RECORDBOX_TEX` via the PS1 shader; the front is left open.
- **Two flaps:** the `front-left` and `front-right` textures on separate planes, each hinged on its **outer vertical edge** (pivot via a parent `Object3D` at that edge). Closed = flaps flush, forming the front face. Open = each flap rotates outward ~110° like double doors.

Records start hidden inside the body (scaled/positioned behind the closed front). Opening rotates the flaps, then the records slide out along the front normal and ease to their crescent `ARC` targets.

## Records & Preview

- Each sampled record = `PlaneGeometry` sized to the cover, PS1 shader, cover texture from the product entry's `image`.
- **Idle:** gentle per-record vertical bob in its crescent slot (staggered phase).
- **Click (raycast):** the hit record eases to a front-center focus position, enlarges, and slow-spins; `bundle-stage` dispatches `jj:product-selected` with `{ ...recordData, preview: true }`. The info panel fills (artist/title/meta/price) with **no Add-to-Cart**.
- **Deselect:** clicking empty space, another record, the box, or Reroll returns the focused record to its slot.

## Data Flow

```
Liquid → window.JJ_BUNDLE {variantId, price, available, ...}
       → window.JJ_PRODUCTS (pool)   [JJ_RECORDBOX_TEX already global]
bundle-stage init:
  JJ_BundlePool.pickRecords(JJ_PRODUCTS, 5, JJ_BUNDLE.productId) → 5 records
  build scene: box (closed, fsm='closed') + 5 record meshes hidden inside
  bundle button: label "Add 5 Random Records — {price}", disabled if !available
Interaction:
  click box (fsm closed) → fsm 'opening' → flaps swing, records slide to ARC targets → 'open'
  click record (fsm open) → focus + dispatch jj:product-selected{preview:true} → info panel (no ATC)
  Reroll (fsm open) → 'retracting' → 'closing' → 'shaking' → 'opening'; re-pick 5 → slide out → 'open'
  bundle button → POST /cart/add.js { id: JJ_BUNDLE.variantId, quantity: 1 } → jjRefreshCart()
  (input ignored whenever JJ_BundleFSM.isLocked(state))
```

## Error Handling / Edge Cases

- **Fewer than 5 available records:** `pickRecords` returns as many distinct as exist; the scene lays out only that many. **Zero:** box stays closed, no fold, no error.
- **Bundle unavailable / $0** (current live state): button renders `[Unavailable]`, disabled. Depends on the merchant setting a price + availability in admin. `JJ_BUNDLE.available` drives this.
- **`JJ_BUNDLE` missing** (bundle product not found): hero renders the box (non-purchasable, button hidden) so the page never breaks.
- **Reroll/click spam:** all pointer input is gated by `JJ_BundleFSM.isLocked(state)`; ignored mid-animation.
- **`prefers-reduced-motion`:** slides/shake collapse to short opacity fades; end states identical.
- **No WebGL context:** `bundle-stage` detects failure and falls back to a static box image + the bundle button; no fold, no crash.
- **Texture 404s:** reuse the existing per-face fallback (grey "NO IMG") from the recordbox path; record covers fall back to the product entry's missing-image placeholder.

## Testing

- **Unit (vitest, node):**
  - `bundle-pool`: returns N distinct entries; caps at available count; excludes the bundle id; records-only filter; empty pool → `[]`; seeded rng → deterministic pick.
  - `bundle-fsm`: legal transitions for each state/event; illegal events are no-ops; `isLocked` true for all states except `closed`/`open`.
- **Manual browser:** load → closed box; click → flaps open + 5 slide into the crescent; click a record → forward-focus + info panel (no ATC); Reroll → full retract/close/shake/reopen with a fresh 5; bundle button adds to cart and refreshes the cart count; verify `prefers-reduced-motion` and mobile layout; verify input lock during animation.
- **Deploy note:** live only after merge to `main` (Shopify GitHub integration syncs `main`).

## Open Questions

None. Design approved for planning.
