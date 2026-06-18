# Cassette Walkman (WM-F45) — Texture Map

Which texture file maps to which face of the 3D model, so you can clean the
carpet/background out of each one. The model is built in
`assets/japanjunky-cassette-model.js` (body box + a hinged lid).

## Two ways to edit

**A. Edit the committed PNGs directly (simplest).**
The files in `assets/` listed below are the live textures. Open each in an image
editor, remove the carpet, save over the same file, and re-commit. Keep each
file's pixel dimensions the same (or at least the same aspect — the model maps
the whole image onto the face).

**B. Clean the source photos and re-run the build.**
Edit the originals (the 7 photos, default folder `C:\Users\Jacob\Desktop\cassette\`),
then run `node tools/cassette-textures/build.js` to regenerate the `assets/cassette-*.png`.
The script just crops + resizes (and punches the front window) — it does NOT
remove background. Set `CASSETTE_SRC` to point at a different source folder if needed.

## Face mapping

| Texture file (`assets/`) | Source photo | Model face | Output px (W×H) | Notes |
|---|---|---|---|---|
| `cassette-front.png` | `front.png` | **Lid outer** (the part you see closed) | 405×512 | **Has a transparent window — must stay transparent.** See below. |
| `cassette-back.png` | `back.png` | Body **back** (−z) | 385×512 | Knobs + battery panel. |
| `cassette-left.png` | `leftside.png` | Body **left** (−x) | 512×246 | Transport buttons. Angled photo → most carpet. |
| `cassette-right.png` | `rightside.png` | Body **right** (+x) | 512×253 | Hinge side. Angled → carpet. |
| `cassette-top.png` | `top.png` | Body **top** (+y) | 512×260 | FM/AM dial + clip. |
| `cassette-deck.png` | `openbottom.png` | Body **front/deck** (+z, seen when lid opens) | 512×512 | The well/mechanism. Very angled → most carpet. |
| `cassette-lid-inner.png` | `opentop.png` | **Lid inner** (seen when lid opens) | 512×448 | Inside of the lid. |

Body **bottom** (−y) has no texture — it's a flat yellow color (`0xf2c200`), so
nothing to clean there.

## The front window (keep transparent!)

`cassette-front.png` has a transparent rounded-rectangle punched over the cassette
window opening (so the 3D cassette shows through). If you re-edit the front,
**preserve that transparent region** (don't paint over it). Its rounded-rect, as
fractions of the 405×512 image, is:

- x: 0.235  (≈ 95 px from left)
- y: 0.125  (≈ 64 px from top)
- w: 0.50   (≈ 203 px wide)
- h: 0.445  (≈ 228 px tall)
- corner radius: 0.18 × min(w,h)

(These live in the `WINDOW` constant in `build.js`. If you re-run the build with a
cleaned `front.png`, the window is re-punched automatically — you only need to
preserve it if you hand-edit `cassette-front.png` directly.)

## How you deliver the cleaned textures — two options

1. **Device fills the rectangle (opaque).** Crop/mask so the Walkman fills the
   whole image with no carpet showing at the edges. Drop-in replacement, no model
   change needed. This is the simplest for me to consume.
2. **Device on a transparent background.** If you'd rather cut the device out onto
   transparency (silhouette), tell me — I'll switch the body-face materials to
   `transparent: true` + `alphaTest` so the cut-out areas simply disappear. (Right
   now only the front/lid material respects transparency; the body faces are
   opaque, so transparent PNGs there would render black until I flip them.)

Either way: hand the cleaned files back (or commit them to `assets/`) and I'll wire
them in / confirm the model picks them up.
