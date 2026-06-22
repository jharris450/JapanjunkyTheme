# "Guy" — the song-interrupting samurai miniature — design

**Date:** 2026-06-21
**Goal:** A character that nudges users to keep moving (don't park on music for
hours). When music plays a while he appears and tries to kick the player to stop
the song. Uses `assets/guy.png` (a samurai miniature, already alpha-cut).

## Behaviour (state machine — `assets/japanjunky-guy.js`, DOM overlay)

Tracks continuous music time via `JJ_AudioReact.energy > 0.5`; resets when music
stops (and the guy retreats).

- **dormant** — off-screen left. At **2 min** of continuous music → peek.
- **peeking** — slides partway in from the left (head peeks), flips side-to-side
  a few times (looking around), slides back out.
- **waiting** — ~**1 min** later → enter.
- **hunting** — jumps into the viewport and moves ONLY by hopping (it's a
  miniature) toward the player's x. Target = `JJ_Player.getRect()` center,
  re-evaluated every hop, so if the user drags the player away he keeps chasing.
- **kicking** — when adjacent and the player is low enough to reach, he kicks →
  `JJ_Player.ejectCurrent()` (song pops out, music stops) → he retreats.
- **dragging / thrown** — the user can grab and throw him. Lands back on the
  floor → resumes hunting. Thrown clear off-screen (no wall bounce) → **gone**.
- **gone** — removed from the page for the session; he then **floats in the
  Three.js scene with Tsuno** (`JJ_Portal.summonCompanion()`).

Coordinates mirror the player (layout px via `html` zoom); floor = taskbar top.

## Hooks

- `JJ_Player.ejectCurrent()` — new public method = the existing pop-out (eject
  loaded song + stop). Called on a successful kick.
- `JJ_Portal.summonCompanion()` — new: reveals a guy sprite in the screensaver
  scene that drifts near Tsuno. Called once when he's thrown out.
- `guyTexture` added to `JJ_SCREENSAVER_CONFIG`; `guy.js` reads the same URL.

## Notes

- Appended to `<body>` (like the player) so both share an undistorted coordinate
  space for the kick hit-test.
- Tuning constants (timings, hop speed/jump, kick range) live at the top of
  `guy.js`.
