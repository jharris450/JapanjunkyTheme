# Mobile Landing + Bottom Chrome — Design

**Date:** 2026-07-15
**Status:** Approved (user picked all recommended options).
**Parent:** 2026-07-14-mobile-handheld-design.md — this supersedes its "top
taskbar" chrome decision and its Phase 4 "panel-only hero" v1; the swipeable
box-and-strip hero project from the addendum is now built as a tap-box +
vertical-list hero instead.

## Scope

Mobile-only (`html.jj-mobile` / `window.JJ_MOBILE`). Desktop untouched by
construction — same gating discipline as the parent spec.

1. Bottom Win98 taskbar with 3 account tabs (replaces top WinCE bar + command bar)
2. Mobile landing page: Tsuno greeting → pop card (kyogen + bundle info +
   live 3D box) → daruma → 5-record vertical list
3. Catalog 1 product per row
4. Music systems off: media-drag gated, volume perma-muted
5. Text-size floor pass, calendar popover fix, scroll momentum

## Code structure (Approach A — mobile branches in existing files)

- **japanjunky-bundle-stage.js** — the `JJ_MOBILE` early-return is replaced
  by a mobile init path that reuses the existing box engine (geometry,
  textures, flap tweens, stack build, reroll FSM) rendering into a
  flow-positioned canvas. Desktop path byte-identical behavior.
- **japanjunky-mobile.js** — grows: scroll momentum, Tsuno scroll-follow
  controller, records-list build/populate, auto-trigger observer.
- **japanjunky-mobile.css** — all layout. No raw width media queries.
- **japanjunky-media-drag.js** — `if (window.JJ_MOBILE) return;` at top.
- Rejected alternatives: separate mobile-hero file (duplicates ~300 lines of
  box code); extracting a shared box module (churns 20+ commits of desktop
  tuning for no user-visible gain).

## 1. Chrome — single bottom Win98 bar

- Delete the mobile top-taskbar overrides; the taskbar reverts to its
  desktop-default bottom position, mobile height 44px.
- Window tabs (`#jj-taskbar-tabs`) stay hidden on mobile. In their slot, a
  mobile-only account-tab strip rendered inside the taskbar DOM
  (desktop-hidden): `ACCOUNT` → /account (label `LOG IN` → /account/login
  when no customer), `CART` + live count (reuse cart badge id wiring),
  `WATCH` → /pages/watchlist. Max 3 tabs — hard cap per user.
- `snippets/jj-mobile-commandbar.liquid` deleted; its render call removed.
- Start menu opens upward (desktop default geometry), full width via mobile
  CSS; any win95-menu.js `JJ_MOBILE` geometry branches added for the top bar
  in Phase 2 are reverted.
- `.jj-page` / `.jj-pdp` / fullscreen explorer insets: top 0, bottom = taskbar
  height.
- **Clock/calendar popover:** bottom-anchored above the bar; min-width 320px,
  day cells ≥36px square, font ≥14px — fixes the crushed grid at zoom 1.
- **Volume:** on mobile, JJ_Volume forced to 0 at init, no localStorage
  write. Tray icon renders the muted glyph and gets `pointer-events: none`.
  Silences Tsuno voice mp3s too — intended (players are desktop-only).

## 2. Mobile landing page (homepage)

New mobile-only hero container in the homepage section markup, living inside
the `#jj-scroll` flow (desktop hero layers get `display:none` on mobile, as
today; container is display-gated to `html.jj-mobile`). Sections top→bottom:

1. **Tsuno greeting** — full-viewport spacer; wax/sun scene shows through,
   Tsuno positioned upper-center, greeting bubble types as today
   (tsuno-bubble.js unchanged).
2. **Pop card** — kyogen mask art + bundle product info: typewriter title,
   price (catalog strobe var), description, ATC — same JJ_BUNDLE data and
   typing engine as desktop. Live 3D box canvas fitted to the RIGHT of the
   graphic (~40% card width), mirroring the desktop product-graphic spot.
3. **Daruma** — between pop card and records area. Tap = reroll; split +
   loot-light + bone-dice FX reused where touch-compatible; hover rattle
   degrades to press-hold rattle.
4. **Records area** — empty until triggered; populates with 5 stacked
   full-width record cards: cover, title, price, format indicator, ATC.

Below records: underscene spacer → catalog screen — unchanged.

## 3. Box interaction flow

- Canvas DPR-capped at 2, render size ~40% card width (perf budget from
  parent spec applies).
- Closed box idles (float + slow spin, existing updateBox states).
- **Tap** closed box → `openFlaps` tween → records area populates. Cards
  appear with CRT brightness-flash stagger (no 3D fly path — ring-carousel
  stays desktop-only).
- **Auto-trigger:** IntersectionObserver on the records area; first
  intersection while box still closed fires the same open sequence. Fires
  once.
- **Reroll (daruma tap, box open):** records list clears → `closeFlaps` →
  `shakeBox` → reopen → new `pickPool()` 5 populate. Reuses the desktop FSM
  transitions with the list standing in for the ring
  (deal/retract callbacks target list cards instead of ring covers).
- Drag-spin on the open box: keep, driven by touch pointer events; vertical
  pans over the canvas must still scroll the page (`touch-action: pan-y` on
  canvas, horizontal drags spin).

## 4. Tsuno scroll-follow

Controller in japanjunky-mobile.js (homepage only):

- Suspends the behavior scheduler on mobile (sets a mobile flag /
  transition-lock so roaming doesn't fight the controller).
- Maps `#jj-scroll.scrollTop` → `JJ_Portal.tsuno.mesh.position`: greeting
  position at top; as pop card / records sections pass, Tsuno drifts toward
  the screen edge (stays visible beside/above the near-opaque cards); at
  underscene descent he releases (scene parallaxes away naturally).
- Position updates lerped in the existing RAF, not per scroll event.

## 5. Catalog + global polish

- **1 per row:** `grid-template-columns: 1fr` for grid screens (catalog /
  search / collection / homepage catalog). Cover height capped (~55vw) so
  full-width cards don't tower; card text uses the new size floor.
- **Text floor:** any mobile-visible component text below 14px raised to
  14–16px (grid cards, hero panel, explorer status cells, start menu,
  tabs). One pass in japanjunky-mobile.css.
- **Scroll momentum:** manual `scrollTop` driver in japanjunky-mobile.js
  gains touchend velocity → exponential decay RAF (cancel on next
  touchstart). Inner native scrollers get `overscroll-behavior: contain`;
  keep passive listeners.

## Testing / rollout

- Playwright device emulation per component (gate, chrome geometry, hero
  trigger flows, 1-col grid).
- Known limit: emulation ≠ device GPU oracle (bundle lid-gap lesson) — the
  user's real-device check is the merge gate.
- All work on a feature branch; merge to `main` (= live deploy) only after
  the user's device check.

## Addendum (2026-07-15, after build) — outcomes

Built on branch `mobile-landing`, 11 commits, all 10 plan tasks reviewed
clean (per-task spec + quality gate; two review loops caught real defects —
see below). Shipped essentially as specced. Notable outcomes:

- **Chrome (Task 3).** The WinCE top-bar + separate command bar from the
  parent (2026-07-14) spec were reverted to a single bottom Win98 taskbar;
  `jj-mobile-commandbar.liquid` deleted. 3 account tabs live in the
  window-tab slot: ACCOUNT (→ LOG IN when logged out) · CART+count · WATCH.
- **Pop card (Task 7).** Built as specced — the desktop hero cluster
  (`#jj-product-info` + daruma + `#jj-daruma-fx`) is reparented into the
  in-flow `#jj-mhero` screen and driven by `initMobile()`, reusing the
  desktop box engine + reroll FSM verbatim; a DOM records list
  (`JJ_MobileRecords`) stands in for the ring crescent. Daruma FX enabled on
  mobile — its scene renders a fixed 150×180 ortho buffer with no
  viewport/DPR reads, so it is reparent-safe and needs no DPR cap (the
  brief's assumed `setPixelRatio` call did not exist).
- **Tsuno (Task 8).** Greets from a new `TSUNO_MOBILE_IDLE_POS` (upper-center;
  desktop x=−4 is off-screen in portrait) and rides the pre-existing
  `JJ_ScrollFollow` rig — no new follow code. Roam-wake gated off on mobile.
  Review caught that a per-frame idle-bob and the return-transition endpoint
  also hardcoded the desktop idle position (would have reverted Tsuno
  off-screen one frame after placement); both fixed to be mobile-aware.
- **Records list (Task 6).** Reuses the grid `createCard` export, so record
  cards inherit cover-spin, condition chips, quick-ATC, and the watch star
  for free, plus the Task-5 1-col rule.

**Not run here / device-check gate.** Live Playwright emulation (every task's
final step) could not run in the build environment — `shopify theme dev`
needs interactive auth and the branch is not on `main`, so there was no
preview to drive. Static verification stood in throughout (JS parse, FSM
trace on paper, selector/dangling-var greps, brace balance, 94/94 vitest,
desktop-untouched confirmed: every mobile CSS rule is `html.jj-mobile`-keyed
bar two permitted base `display:none` exceptions). Per the bundle lid-gap
lesson, emulation was never the oracle anyway — the user's real-device check
is the merge gate.

**Starting values to tune on device** (function-safe, all flagged in code
comments): kyogen backdrop `scale(0.42)`, box canvas `45%` width,
`#jj-daruma-fx` `252×302` center (dice rise above the doll — vertical
placement is the fiddly one; FX shows only during a reroll and degrades
gracefully). Fling-glide decay is per-RAF-tick, so feel varies with refresh
rate (polish note).
