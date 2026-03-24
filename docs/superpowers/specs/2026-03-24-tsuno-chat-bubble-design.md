# Tsuno Daishi Chat Bubble — Design Spec

## Overview

On page load, a chat bubble appears next to the Tsuno Daishi ghost graphic. He "says" いらっしゃいませ, which scrambles through glitch characters and resolves into "Welcome". While speaking, Tsuno bounces rapidly. A slowed/reverbed audio clip plays during the sequence. After lingering, the bubble pixel-dissolves out of existence.

## Components

### 1. Chat Bubble (DOM Overlay)

**Element**: `<div id="jj-tsuno-bubble" class="jj-tsuno-bubble">` inside `jj-product-zone`, positioned absolutely near Tsuno's screen location.

**Styling**:
- Dark background (`rgba(0, 0, 0, 0.85)`), 1px border `#333`
- Monospace font (Fixedsys), cream text with subtle CRT glow
- Small speech tail/notch pointing toward Tsuno (CSS triangle via `::after`)
- Max-width ~200px, padding 8px 12px
- Starts hidden (`opacity: 0`), appears with CRT-on flash (`jj-crt-on` animation, 0.4s — matches existing duration in `japanjunky-crt.css`)

**Position**: Positioned absolutely within `jj-product-zone`. The screensaver display canvas is sized to viewport dimensions (adjusted by CSS zoom), and Tsuno idles at 3D coordinates `{ x: 4.0, y: 0.0, z: 6 }` which renders in the left portion of the screen. The bubble sits to Tsuno's right (toward the catalogue) using absolute positioning within the product zone. Concrete offsets will be tuned during implementation to align with Tsuno's rendered position. Speech tail points left toward Tsuno.

**Z-index**: Inherits from the product zone stacking context (`z-index: 50`). Above the screensaver canvas (`z-index: 0`), below the CRT overlay (`z-index: 10000`).

### 2. Text Scramble Sequence

Adapts the calendar year glitch system (`japanjunky-calendar.js` lines 71-124) for text transformation.

**Charset**: Same as calendar — `░▒▓█╳¤§#@%&0123456789`

**Phases**:

| Phase | Duration | Description |
|-------|----------|-------------|
| Appear | 0.4s | Bubble CRT-on flash, empty |
| Print JP | ~1.2s | "いらっしゃいませ" types in character-by-character (8 chars, jittered ~80ms/char) |
| Hold JP | 1.5s | Japanese text visible, Tsuno still bouncing |
| Scramble | ~0.8s | Characters cycle through glitch chars at 50ms/frame, same phase logic as calendar (scramble → reveal → scramble → settle) but applied per-character with staggered timing |
| Reveal EN | ~0.5s | Resolves to "Welcome!" character-by-character, left-to-right |
| Hold EN | 3.0s | "Welcome!" displayed, Tsuno returns to gentle bob |
| Dissolve | 0.5s | Pixel dissolve exit animation |

**Total sequence**: ~7.8 seconds

**Scramble mechanics**: "いらっしゃいませ" is 8 characters; "Welcome!" is 8 characters (exclamation added to match). Each of the 8 character positions independently cycles through random glitch chars before settling on its target English character. Characters settle left-to-right with ~60ms stagger, creating a decode/reveal wave effect.

### 3. Tsuno Talk Bounce

**Mechanism**: A `tsunoTalking` flag checked in `updateTsuno()` inside `japanjunky-screensaver.js`.

**When `tsunoTalking = true`** (during Print JP, Hold JP, and Scramble phases):
- Bob amplitude increases from `0.15` to `0.6`
- Bob frequency increases from `0.5 Hz` to `6.0 Hz`
- Creates a rapid vertical bounce like an excited speaking animation

**When `tsunoTalking = false`** (Hold EN and after):
- Smoothly returns to normal idle bob over ~0.5s (lerp the amplitude/frequency back)

**Exposed via**: `window.JJ_Portal.setTalking(bool)` — called by the bubble script.

### 4. Audio

**Asset**: `assets/tsuno-irasshaimase.mp3` — placeholder silent file initially, user will provide the real slowed/reverbed TTS clip of いらっしゃいませ later.

**Playback**: Loaded as an `<audio>` element. Triggered at the start of the Print JP phase. Single play, no loop.

**Fallback**: If audio fails to load or play (autoplay restrictions), the visual sequence proceeds normally without sound. No error shown.

### 5. Pixel Dissolve Exit

After "Welcome" lingers for 3 seconds, the bubble disintegrates.

**Implementation**:
1. The bubble's content is replaced with a grid of small `<div>` cells (~6x6px each) using CSS grid
2. Each cell captures its portion of the bubble's appearance (background color + text fragment via clipping or background-position)
3. Each cell gets a random animation delay (0–300ms range)
4. Animation per cell (200ms each): `scale(1) → scale(0)` + `opacity: 1 → 0` simultaneously
5. Cells also get a slight random translate offset during shrink for scatter feel
6. After all cells complete (~500ms total), the bubble element is removed from DOM

**CSS animation**:
```
@keyframes jj-pixel-dissolve {
  0%   { opacity: 1; transform: scale(1) translate(0, 0); }
  100% { opacity: 0; transform: scale(0) translate(var(--dx), var(--dy)); }
}
```
Each cell sets `--dx` and `--dy` CSS custom properties to small random values (±8px).

## File Changes

### New Files

**`assets/japanjunky-tsuno-bubble.js`**
- Self-executing IIFE
- On DOMContentLoaded, waits 1.5s then starts sequence
- Checks `window.JJ_Portal` before calling `setTalking()`. If portal is unavailable (WebGL failed, high-contrast mode), the bubble still plays its full visual sequence but skips the talk bounce — graceful degradation
- Contains: scramble engine (adapted from calendar glitch), phase state machine, dissolve builder, audio trigger
- Calls `window.JJ_Portal.setTalking(true/false)` to control bounce when available

**`assets/japanjunky-tsuno-bubble.css`**
- `.jj-tsuno-bubble` — positioning, styling, speech tail
- `.jj-tsuno-bubble--entering` — CRT-on entrance
- `.jj-tsuno-bubble__text` — text container
- `.jj-pixel-dissolve-grid` — grid container for dissolve cells
- `@keyframes jj-pixel-dissolve` — per-cell shrink/fade/scatter

**`assets/tsuno-irasshaimase.mp3`**
- Placeholder silent audio file (will be replaced by user)

### Modified Files

**`assets/japanjunky-screensaver.js`**
- Add `tsunoTalking` flag and `tsunoTalkBob` lerp state
- In `updateTsuno()` idle branch: check flag, use amplified bob when talking
- Expose `window.JJ_Portal.setTalking = function(bool) { ... }` in the public API

**`layout/theme.liquid`**
- Add bubble markup `<div id="jj-tsuno-bubble">` inside `jj-product-zone`
- Add `<link>` for `japanjunky-tsuno-bubble.css`
- Add `<script>` for `japanjunky-tsuno-bubble.js` (defer, after screensaver)

## Sequence Diagram

```
Time  0.0s  ─── Page load
      1.5s  ─── Bubble appears (CRT-on flash)
             ─── setTalking(true)
             ─── Audio plays
      1.8s  ─── "い" types in
      2.0s  ─── "いら" ...
      2.7s  ─── "いらっしゃいませ" complete
      4.2s  ─── Hold complete, scramble begins
             ─── Characters cycle through glitch chars
      5.0s  ─── "Welcome!" resolves left-to-right
      5.5s  ─── Resolve complete
             ─── setTalking(false)
      8.5s  ─── Hold complete, dissolve begins
      9.0s  ─── Dissolve complete, bubble removed
```

## Edge Cases

- **Product selected during sequence**: Bubble skips to dissolve immediately. The bubble script listens for `jj:product-selected` and triggers early dissolve when fired.
- **Audio autoplay blocked**: Sequence proceeds silently. No retry.
- **Repeat visits**: Plays once per page load. No session persistence (plays every time).
- **Mobile (<=960px)**: Bubble is hidden via CSS (`display: none`). The screensaver canvas is less prominent on mobile and the bubble would overlap the catalogue.
- **`prefers-reduced-motion`**: Bubble shows static "Welcome!" text immediately (no typing, no scramble, no dissolve). Stays for 3s then hides with `opacity` fade. Talk bounce is suppressed.
- **High-contrast / no WebGL**: Bubble still plays visual sequence but without talk bounce (no `JJ_Portal` available). Bubble is suppressed entirely if screensaver canvas is not present in DOM.
