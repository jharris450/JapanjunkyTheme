# Music-reactive scene + Tsuno — design

**Date:** 2026-06-21
**Goal:** The Three.js background (sun + wax) and Tsuno breathe with the music
playing in the toolbox player. One shared signal, ~70% scene / ~30% Tsuno.

## Constraint

YouTube audio is cross-origin (iframe) — its samples are **unreadable**, and
most of the catalog is YouTube. Self-hosting the song audio is the copyright
exposure (the point of YT embeds is to NOT distribute audio), so we route around
it instead of analysing it.

## Signal — `assets/japanjunky-audio-react.js` (`window.JJ_AudioReact`)

Own rAF; smoothed fields read each frame by consumers:
- `energy` 0..1 — playback envelope (up while playing, settles when stopped).
- `beat` 0..1 — decaying pulse on each beat.
- `bass`/`treble` 0..1 — real only for analyser source.

Three sources, chosen per song by `player-audio.js`:
1. **analyser** — real FFT. Only self-hosted/static audio reaches the Web Audio
   bus (`masterGain -> analyser -> destination`).
2. **bpm + getTime** — YouTube. Synthetic beat synced to the track tempo via the
   YT player's `getCurrentTime()` clock (no audio access). BPM from the product
   metafield.
3. **pseudo** — no bpm + no analyser → gentle musical idle pulse off the clock.

## BPM data flow (optional metafield `custom.bpm`, number)

`jj-product-json.liquid` + `jj-product.liquid` emit `bpm` → grid card `data-bpm`
(`product-grid.js`) → `media-drag.js` resolves it → `player.js tryLoadProduct`
passes `bpm` to `JJ_PlayerAudio.play` → `JJ_AudioReact.start`. Default 0 →
pseudo-rhythm (works with no metafield).

## Consumers — `screensaver.js` animate()

From `energy`/`beat`:
- Sun: new `uSunGlow` uniform (brightness) + `uSunSize` breathe.
- Wax: `uHeatGlow` lifts with energy + beat.
- Tsuno: glow `uAlpha` pulse (idle state only, to avoid compounding).

All idle values are 1.0/base, so with no music the scene is unchanged.

## Setup the user must do

Define a **Products** metafield `custom.bpm` (Integer or Decimal) and fill it per
product for tight YouTube sync. Optional — everything works without it.

## Tuning knobs

Pulse depths are inline constants in `screensaver.js` (sun 0.22/0.7, size 0.05,
heat 0.5/0.5, Tsuno 0.5/0.12) and the envelope/decay rates in
`japanjunky-audio-react.js`.
