# Daruma Reroll + Kyogen Eye Blend — Design

**Date:** 2026-07-05
**Status:** Implemented

## Goal

Two bundle-hero adjustments:

1. **Kyogen eye blend** — the mask's source image (`kyogen-head.png`) kept two flat,
   cross-hatched circles where the painted pupils were erased (the live pupils are
   DOM dots). Blend those patches into the gold eye domes so they are invisible.
2. **Daruma reroll** — replace the `[Reroll]` action button with an antique daruma
   doll that floats in the gap between the mystery box and the crescent carousel
   (overlapping the outstretched right flap is acceptable).

## Kyogen eye blend

- Patches at source px (115, 271) and (312, 273), radius ~20 (the DOM pupils'
  rest coordinates). Masked at r=27 with an 8px feather.
- Inpainted by **annulus interpolation**: each masked pixel takes a weighted
  average of known pixels at the same radius from the eye's center (angular
  Gaussian weights), which continues the dome's radial shading instead of
  producing a flat smudge. Light blur + grain matched to the surrounding
  high-frequency energy keeps the texture consistent.
- Applied directly to `assets/kyogen-head.png`. Verified invisible at the CSS
  display size (330×475).

## Daruma reroll

### Assets (cut from the user's reference photos via grabCut + edge decontamination)

| File | Source | Content |
|---|---|---|
| `daruma-body.png` (178×228) | daruma1.png | full closed doll |
| `daruma-peg-l.png` / `daruma-peg-r.png` | daruma3.png (r = mirrored l) | yellow bone eye pegs |
| `daruma-peg-m.png` | daruma3.png | red mouth peg |
| `daruma-die-1.png` / `daruma-die-2.png` | dice1/dice2.png | uneven bone dice |

### Markup (`layout/theme.liquid`)

The `#jj-bundle-reroll` button keeps its id (all bundle-stage wiring — show/hide
in `showBundleInfo()`, click binding — is untouched) but moves out of the actions
row into `#jj-product-info` as `.jj-daruma`, absolutely positioned like the box
canvas. The doll is **two full-size copies of the body sprite**, clip-pathed to
top (0–56%) and bottom (55–100%) halves with 1% overlap so no seam shows closed;
splitting the halves makes the open read as one continuous object. Pegs live
inside the top half; dice + beam + glow are siblings.

### Placement

`left: calc(100% + 225px); top: -66px; width: 118px` — centered just past the
box canvas edge (+275px), level with the box's center line (card top edge = y 0),
`z-index: 2` above the canvas so the whole doll is clickable.

### States

- **Idle:** slow float (`translateY ±8px` + `rotate ±1.5deg`, 5.5s).
- **Hover / focus-visible:** pegs scale out of the face holes
  (`transform-origin` at the peg top → they grow out of the holes, 0.2s ease-out).
- **Click (`.is-open`, driven by `japanjunky-daruma.js`):**
  top half lifts and tilts (`translate(-7px,-46px) rotate(-17deg)`); a gold
  (`--jj-secondary`) beam column scales up from the seam plus a radial glow
  bloom (both `mix-blend-mode: screen`, keyframed in→out over 1s); the two
  bone dice rise from the seam (`z-index: 3`, in front of the halves), tumble
  apart ±150px up with gold drop-shadows, staggered 80ms, gone by 0.98s —
  RPG-chest loot. `done()` fires at 700ms so the record retraction starts as
  the dice fade; the doll snaps shut at 1100ms.

### Wiring

`window.JJ_DARUMA.play(done)` exposed by the new `japanjunky-daruma.js`
(deferred after bundle-stage.js). The stage's reroll click handler now guards
on ring busy, plays the daruma sequence, and calls the original
open-or-reroll logic from the callback. If the daruma script is absent the
handler falls straight through. `prefers-reduced-motion` skips the sequence
entirely (JS calls through immediately; CSS disables float/transitions).

## Verification

- Puppeteer harness (scratchpad `daruma-harness.html`) screenshots: idle
  placement vs box-canvas/ring guides, hover pegs, open frames at
  250/400/500/750ms (dice visible above the doll at 500ms).
- Full vitest suite: 93/93 passing.
