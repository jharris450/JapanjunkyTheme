# Mobile Handheld Mode — Design

**Date:** 2026-07-14
**Status:** Approved direction (user picked recommended approach); umbrella spec with Phase 1–2 detailed, Phases 3–5 get their own specs.

## Concept

The desktop site is a Win98-era CRT machine. The mobile site is the same brand
running on a period-correct handheld: Pocket PC / Windows CE. It is a sibling
device, not a squeezed desktop.

What carries over unchanged: Fixedsys Excelsior + DotGothic16, black
background, phosphor palette, CRT overlay + global shader canvas, no rounded
corners, CRT-style animations only, terminal content layer.

What changes: system chrome and interaction model. Windows CE happens to be
both period-correct and touch-correct — taskbar at the TOP with a Start
button and tray, applications always fullscreen, no window resizing. The
desktop's Win98 chrome translates 1:1 into WinCE chrome.

## Mode gate

- One load-time decision, in an inline `<head>` script that runs before all
  deferred theme scripts (same slot as the reduced-motion shim):
  `window.matchMedia('(pointer: coarse) and (max-width: 820px)')`.
- On match: `window.JJ_MOBILE = true` and `<html>` gets class `jj-mobile`.
- CSS keys off `html.jj-mobile` — never off raw width media queries — so
  desktop and mobile can't half-blend.
- No live switching between modes. Orientation changes stay in mobile mode
  (mobile CSS handles landscape). A narrow desktop browser window stays
  desktop (`pointer: fine` fails the gate).
- JS systems check `window.JJ_MOBILE` to no-op or switch behavior.

## Phase 1 — Foundation

1. **Zoom.** `html.jj-mobile { zoom: 1 }` overrides the desktop `zoom: 2.5`
   (japanjunky-base.css:36). `--jj-zoom` stays correct because
   japanjunky-crt-shader.js already reads computed zoom; verify it resolves 1
   on mobile. JS that divides positions by zoom (guy.js pattern) self-corrects
   for the same reason.
2. **CRT profile.** Add `jj-crt-no-barrel` on `<html>` when `JJ_MOBILE`
   (mechanism already exists for Firefox — skips the SVG barrel filter and
   activates the no-barrel compensation overrides in win95.css /
   scrollbar.css). Keep the scanline/grille overlay and the global shader
   canvas; cap canvas `devicePixelRatio` at 2 in the shader and three.js
   scenes.
3. **Cursors.** Skip installing custom cursor sets when `JJ_MOBILE` (no
   pointer on touch). japanjunky-cursor-light.js no-ops.
4. **Desktop-only systems gated off** (return in Phase 5 with touch designs):
   explorer window resize (margin-lock + resize cursors), guy character
   (mouse drag physics), toolbox media players (hover fan menu + drag),
   hover-only FX (daruma hover rattle degrades to tap).
5. **Touch basics.** Tap targets ≥ 40px CSS (comfortable at zoom 1);
   `touch-action` set so page scrolling works where intended and is locked
   where the app-like layout requires.

## Phase 2 — Handheld chrome

1. **Top taskbar.** The existing footer-group taskbar DOM (jj-footer-win95)
   is repositioned to the top of the screen by `.jj-mobile` CSS: Start
   (Tsuno logo) on the left, tray (volume + clock) on the right. Taskbar tab
   strip hidden on mobile (fullscreen apps make it meaningless).
2. **Start menu.** Drops DOWN from the top bar, full width. Same menu DOM,
   mobile layout via CSS; win95-menu.js gets a `JJ_MOBILE` branch only where
   geometry math assumes bottom-anchored placement.
3. **Bottom command bar.** New mobile-only snippet: thumb-zone nav with
   [Catalog] [Search] [Cart] [Watchlist]. Win98 bevel styling (system chrome
   layer). Cart shows count badge (reuses cart badge logic).
4. **Fullscreen explorer.** Explorer windows (content pages, cart,
   watchlist) fill the area between top bar and command bar. No resize, no
   margin-lock. Titlebar keeps the X (acts as history back). Typable address
   bar, Win98 error box, folder view, Tsuno throbber, status bar all keep
   working full-width; status bar may collapse cells to fit.

## Phase 3 — Commerce reflow (own spec later)

Product grid to 2-column cards; product page single-column stack; cart /
watchlist / content pages mostly inherit the fullscreen explorer. HEAT badge
and format indicators unchanged.

## Phase 4 — Homepage mobile (own spec later)

Wax/sun scene kept at reduced render resolution; splash kept at low
resolution/fps (settings already exist). Bundle hero simplified to a single
column: box canvas on top, a swipeable record strip replaces the hover ring
crescent, bundle panel below, daruma tap = reroll. Underscene scroll
retained.

## Phase 5 — FX returns (own specs later)

Guy character, toolbox media players, music-reactive extras — each returns
with an explicit touch interaction design or stays desktop-only by decision.

## Performance budget (mobile)

- No SVG barrel filter (biggest CPU/GPU saving; known 3fps hazard in Gecko).
- All canvases DPR-capped at 2; 3D scene render resolutions halved from
  desktop.
- No hover-driven RAF loops running without a pointer.

## Testing

- Playwright device emulation (iPhone + Android profiles, `pointer: coarse`)
  for layout and gate verification each phase.
- Known limit: emulation is not an oracle for device GPU artifacts (bundle
  lid-gap lesson) — the user's real-device check is the final gate per phase.

## Rollout

- All work on branch `mobile-handheld`. `main` auto-deploys to the live
  store via the Shopify GitHub integration, so merges happen per phase only
  after the user's real-device check.
