# Win98 Volume Control — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorm)
**Scope:** Add a Windows-98-style speaker/volume control to the Win95 taskbar tray (next to the clock) that masters all site audio: the toolbox media players (Web Audio + YouTube iframe) and Tsuno's voice clips. New master-volume state, persisted across pages.

## Goal

A beveled **speaker icon** sits in the taskbar tray, left of the clock. Clicking it opens a small Win98 **popup** with a **vertical volume slider** + a **Mute checkbox**. The value is a single **master volume** that controls every audio source on the site and is **remembered across pages** (localStorage). The icon reflects the muted/level state.

```
 taskbar tray:   [▣ spkr] [12:30 JST]
 click spkr ->   ┌────────┐
                 │   ▀    │   vertical slider
                 │   │    │
                 │   ▬    │
                 │ ☑ Mute │
                 └────────┘
```

## Decisions (from brainstorm)

- **Presentation:** icon → vertical-slider popup (Win98-authentic), not an inline slider.
- **Scope:** master volume over ALL audio — media players (record/cassette/CD), YouTube playback, and Tsuno's voice clips.
- **Mute:** yes. Clicking the **icon opens the popup**; muting is the **checkbox** in the popup; the icon glyph *reflects* the muted state (and restores the pre-mute level on unmute).
- **Glyph:** a small monochrome pixel/CSS speaker (NO emoji — stays on the CRT/monospace aesthetic), with a muted variant.
- **Default level:** 0.8.

## Non-goals

- No double-click "full mixer" (Win98 had one); single popup only. YAGNI.
- No per-source volumes; one master only.
- No change to what each source plays — only its output level.

## Architecture — units

### 1. `assets/japanjunky-volume.js` (new, UMD) — the single source of truth

Holds `{ level: 0..1, muted: bool }`, the master volume state.

- `JJ_Volume.getEffective()` → `muted ? 0 : level`
- `JJ_Volume.getLevel()` → `level` (ignores mute, for the slider)
- `JJ_Volume.isMuted()` → bool
- `JJ_Volume.setLevel(v)` → clamps to [0,1], persists, notifies
- `JJ_Volume.setMuted(b)` → persists, notifies
- `JJ_Volume.toggleMute()` → flips muted
- `JJ_Volume.subscribe(fn)` → registers `fn`; returns an unsubscribe fn. `fn(effective)` is called immediately with the current value and on every change.
- Persistence: `localStorage['jj-volume']` = JSON `{level, muted}`; loaded on init (default `level 0.8, muted false`). All storage access wrapped in try/catch (private-mode safe).

**Pure helpers (unit-tested), no DOM:** `clamp01(v)`, `effective(level, muted)`, `serialize(state)`, `parse(str)` (tolerant of bad/missing JSON → defaults). The manager composes these; `subscribe`/`localStorage` are browser-verified.

### 2. `assets/japanjunky-player-audio.js` (modify) — route through a master gain + YT volume

- Add a lazily-created module-level **`masterGain`** (`ctx.createGain()`), created in `getCtx()`. The **file** and **static** paths connect their chain output to `masterGain` instead of `c.destination`; `masterGain.connect(c.destination)` once. `masterGain.gain.value = JJ_Volume.getEffective()`.
- The **YouTube** path's audio is in a separate iframe (not in the Web Audio graph), so it uses the YT API: on `onReady` and whenever volume changes while active, `player.setVolume(effective * 100)` (and `effective === 0` → `player.mute()`, else `player.unMute()`). Track the active YT `player` ref (already partially there).
- Subscribe to `JJ_Volume` once (guarded `if (window.JJ_Volume)`): on change, set `masterGain.gain` and the active YT player's volume.

### 3. `assets/japanjunky-tsuno-bubble.js` (modify) — voice clip volume

- Before `audio.play()`, set `audio.volume = JJ_Volume ? JJ_Volume.getEffective() : 1`.
- Subscribe once (guarded) to update `audio.volume` live while a clip plays.

### 4. `snippets/win95-volume.liquid` (new) — tray markup

- A `<button class="jj-vol" id="jj-vol-btn" aria-label="Volume" aria-expanded="false">` with a CSS/pixel speaker glyph (`.jj-vol__icon`, muted modifier `.jj-vol--muted`).
- A hidden popup `<div class="jj-vol-popup" id="jj-vol-popup">` containing a vertical `<input type="range" min="0" max="100" class="jj-vol__slider" id="jj-vol-slider">` and a `<label><input type="checkbox" id="jj-vol-mute"> Mute</label>`.
- Rendered in `sections/jj-footer-win95.liquid` immediately before `{% render 'win95-clock' %}`.

### 5. `assets/japanjunky-win95-volume.js` (new) — UI wiring

- On load: read `JJ_Volume.getLevel()`/`isMuted()` → set slider value + checkbox + icon state.
- Icon button click → toggle popup (`aria-expanded`, a `--open` class); click/touch outside the popup closes it; `Escape` closes.
- Slider `input` → `JJ_Volume.setLevel(value/100)`.
- Mute checkbox `change` → `JJ_Volume.setMuted(checked)`.
- Subscribe to `JJ_Volume` → keep slider/checkbox/icon in sync (e.g. another tab/page changed it, or mute). Icon glyph: muted or level==0 → muted variant; else normal (optionally low/high variant by level — optional polish).
- Guard if `JJ_Volume` is absent (no-op).

### 6. `assets/japanjunky-win95.css` (modify) — styling

- `.jj-vol` tray button: matches the existing tray/clock bevel + sizing; the pixel speaker drawn with CSS (borders/box-shadow) or a tiny inline SVG referenced in the snippet — monochrome in the CRT palette, with a muted variant (an `×` or no sound-waves).
- `.jj-vol-popup`: Win98 raised panel (outset bevel, the existing win95 border recipe), positioned above the tray button, hidden by default, shown via `--open`.
- Vertical slider styling (`writing-mode: vertical-lr` / `appearance` track + thumb) in the beveled style. No rounded corners (per design system).

### 7. `layout/theme.liquid` (modify) — load order

- Load `japanjunky-volume.js` **before** `japanjunky-player-audio.js` and `japanjunky-tsuno-bubble.js` (so the subscribe guards find it).
- Load `japanjunky-win95-volume.js` alongside the other taskbar JS (after the footer renders / `defer`).

## Data flow

```
slider / mute checkbox / (cross-page load)
        │  setLevel / setMuted
        ▼
   JJ_Volume  ──persist──> localStorage['jj-volume']
        │  subscribe(effective)
        ├──> player-audio: masterGain.gain = effective
        ├──> player-audio: activeYTPlayer.setVolume(effective*100)
        ├──> tsuno-bubble: audio.volume = effective
        └──> win95-volume UI: sync slider/checkbox/icon
```

One value; every source follows; remembered across pages.

## Edge cases

- **No Web Audio / no JJ_Volume:** consumers guard and no-op (audio plays at default level; UI is inert).
- **Private mode / localStorage blocked:** try/catch → in-memory only (resets per session).
- **Volume changed before the YT player exists:** the value is read on `onReady`, so it applies when the player loads.
- **masterGain created lazily:** until the first `getCtx()`, there's nothing to set; the subscribe handler null-checks `masterGain`.

## Testing

- Unit tests (Vitest) for `japanjunky-volume.js` pure helpers: `clamp01` bounds; `effective(level,muted)` (muted→0, else level); `parse` tolerates bad/empty/missing JSON → defaults; `serialize`/`parse` round-trip. A small injected-store test for the manager's get/set/mute + subscribe-notify (inject a fake storage object so it's testable without the DOM).
- **Browser-verified:** the tray popup look/behavior, the vertical slider, and that dragging the slider changes the live volume of a playing record / YouTube / Tsuno clip, and that it persists across a page navigation.

## Open tunables (defaulted)

- Default level 0.8; popup size/position; speaker glyph style; whether the icon shows low/high variants by level (optional).
