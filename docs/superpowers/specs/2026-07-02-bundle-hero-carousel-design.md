# Bundle Hero: Restore Carousel Scroll/Select — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan
**Amends:** `2026-07-01-bundle-hero-mystery-box-design.md` — the mystery-box hero is LIVE (`30c9f44`); this changes the record interaction model and layout based on user feedback, and fixes a CSS regression.

## Purpose

Three changes to the live bundle hero:

1. **Fix the click bug:** clicking a record shoves the info panel (and product zone) to the bottom-left of the page.
2. **Mirror the layout:** box parked on the **left**, the 5 records form a crescent on the **right**.
3. **Restore ring-carousel behavior:** the 5 records become a scrollable/selectable carousel (arrow/scroll/swipe rotation, centered = biggest = auto-selected), replacing the current "click any record → free-focus pull" model. Selection remains **preview-only** (info panel, no per-record Add-to-Cart; the bundle button is still the only purchase).

## Root Cause of the Click Bug

`.jj-product-zone` (the fixed top-left container holding `#jj-product-info`) got its positioning from `assets/japanjunky-ring-carousel.css` (`position:fixed; left:0; top:0; width:24vw; height:calc(40vh - 12.8px); flex column`). That stylesheet was retired in the mystery-box build; only `.jj-ring`/`.jj-ring__stage` were ported into `bundle.css`, not `.jj-product-zone`. With no positioning, the zone sits in normal document flow, so when a record is selected and `#jj-product-info` un-hides, it renders at the bottom-left. Fix: port the `.jj-product-zone` rule (and any sibling info-panel layout rules it needs) into `bundle.css`.

## Confirmed Decisions

1. **Select = preview only.** Centered/selected album shows its info; no per-record Add-to-Cart. Bundle button remains the only purchase.
2. **Box left, crescent scrolls on right.** Box stays parked on the left as the source; records occupy a scrollable crescent on the right.

## Non-Goals (YAGNI)

- No per-record purchase. No change to the reroll cycle, the bundle Add-to-Cart button, or the pure modules (`bundle-pool`, `bundle-fsm`, `ps1-shader`).
- No change to the open/close/shake box animation or the box's idle float+spin while closed.
- No new opacity/depth-of-field effects for non-centered records beyond the existing scale falloff (ring-carousel used opacity on DOM covers; the 3D meshes use scale only — acceptable).

## Layout (Composition)

- **Box** at `BOX_X ≈ -2.4` (left), unchanged idle float+spin while closed; flaps open facing the viewer.
- **Crescent** on the right, using the ring-carousel `ARC` shape **mirrored** (x positive = opening right). Slots are indexed by **offset from the centered record** (−2…+2 for 5 items):
  - offset 0 (center): `x≈0.6, y=0, scale 1.15` — biggest, the selected one.
  - offset ±1: `x≈0.8, y=±0.83, scale 0.88`.
  - offset ±2: `x≈1.2, y=±1.61, scale 0.72`.
  - (px→scene divisor ~90, mirrored from ring-carousel ARC `{0,-18,-55}` / `{0,±75,±145}`.)
- **Camera** aimed at the composition midpoint (`camera.position.x` = midpoint of box-left and crescent-right extents) so the whole thing is centered and nothing clips. All constants are first-pass, tuned in the browser.

## Behavior (ported from `assets/japanjunky-ring-carousel.js`)

Records become a carousel once dealt (state `open`):

- **`centerIndex`** into the `records` array (0…4). On each change, every record animates to the ARC slot for `slotForOffset(i - centerIndex)`, wrapping so all 5 stay visible (offset normalized into −2…+2). Records not in −2…+2 don't occur (only 5 items). Center record is biggest.
- **Navigation** (only when `state === 'open'` and `!FSM.isLocked(state)`):
  - `ArrowUp`/`ArrowLeft` → rotate toward previous; `ArrowDown`/`ArrowRight` → next. Wrap-around.
  - Scroll wheel over the canvas → rotate (throttled ~150ms, one step per event), matching ring-carousel.
  - Touch swipe (vertical) → one rotation per gesture.
  - Clicking a **side** record rotates it to center; clicking the **center** record selects immediately.
- **Selection (300ms delay, like ring-carousel):** after rotation settles, a timer auto-selects the centered record → dispatch `jj:product-selected` with `recordDetail(centered) {preview:true}`. Rotating away clears the timer and deselects (dispatch `jj:product-deselected`) before reselecting the new center. `Escape` deselects.
- **This replaces** the current raycast free-focus (`focusRecord` pulling a clicked record to `CENTER_X` with a slow spin). Raycast is still used to detect *which* record was clicked (to decide center vs side), but the motion is now centerIndex-driven.
- Keyboard handling mirrors ring-carousel's guards: ignore when typing in inputs, when `jj-grid-active`, and let focused links/buttons act natively.

## Reroll interaction

Unchanged pipeline (retract → close → shake → reopen → deal 5 fresh), with two additions: on the fresh deal, `centerIndex` resets to the middle (index 2), and any active selection/timer is cleared before retracting.

## Data Flow

```
box open (fsm) → dealRecords() picks 5 → centerIndex = 2 (middle)
 → layoutRecords(): each record → slot for offset (i - centerIndex), wrapped
 → 300ms → auto-select centered → jj:product-selected{preview:true} → info panel (no ATC)
 nav (arrow/wheel/swipe/click-side) → centerIndex change → re-layout + re-arm select timer
 click center → immediate select
 reroll → clear selection/timer → retract → … → deal 5 → centerIndex = 2
```

## Components / Files

- **`assets/japanjunky-bundle-stage.js`** (modify) — replace the free-focus block (`focusRecord`/`deselect` pull-to-center) with: `centerIndex`, `slotForOffset(offset)`, `layoutRecords(animated)`, `rotateBy(delta)`/`rotateTo(index)`, a 300ms `selectTimer` + `selectCentered()`/`deselectCurrent()`, and keyboard/wheel/touch handlers gated on `state === 'open'` && `!FSM.isLocked`. Box position → left; camera → composition midpoint. Reroll resets `centerIndex`.
- **`assets/japanjunky-bundle.css`** (modify) — add the `.jj-product-zone` positioning rule (and any sibling info-panel layout rules) ported from the retired `ring-carousel.css`.
- **Unchanged:** `bundle-pool.js`, `bundle-fsm.js`, `ps1-shader.js`, the box build/open/close/shake, the bundle Add-to-Cart button, `product-viewer.js` preview mode.

## Error Handling / Edge Cases

- **< 5 records** (small catalog): carousel works with N items; `slotForOffset` and wrap use `records.length`. With 1 item, no rotation. 0 items handled upstream (box stays closed).
- **Input lock:** all nav gated by `FSM.isLocked(state)`; rotation ignored mid-open/reroll.
- **Selection race:** rotating clears the pending select timer before re-arming (mirrors ring-carousel's `clearSelectTimer`).
- **Reduced motion:** rotation re-layout uses the existing `tween`, already shortened under `prefers-reduced-motion`.
- **Deselect on reroll:** clear timer + dispatch deselected so the info panel doesn't retain a stale record.

## Testing

- **Unit (vitest):** add a small pure helper for offset→slot wrap logic if extracted (e.g. `normalizeOffset(i, centerIndex, len)` → −2…+2 or null), tested for wrap correctness at boundaries. If the logic stays inline in the stage (DOM/three-coupled), no node test is added and it's browser-verified.
- **Manual browser (primary gate):** box opens → 5 records in a right-side crescent, centered biggest; arrow/scroll/swipe rotates through all 5 with wrap; centered auto-previews (info panel top-left, no ATC, NOT bottom-left); clicking a side record centers it; reroll re-deals with center reset; reduced-motion + mobile; nothing clips.
- **Deploy:** live only after merge to `main`.

## Open Questions

None. Approved for planning.
