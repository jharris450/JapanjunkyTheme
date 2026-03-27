# Splash Portal Screen — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

A full-viewport "enchanted mirror" splash screen that greets users before the homepage. A churning, rippling reflective surface rendered with a custom GLSL shader — visually related to the existing tunnel screensaver but self-contained. Tsuno's silhouette is barely visible, warped into the swirl. An ENTER button appears, and clicking it triggers a ~2 second "pulled through the mirror" transition into the homepage.

Shows once per browser session (sessionStorage). Skipped on return visits within the same session.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Separate scene (`japanjunky-splash.js`) | Clean separation from screensaver; no risk of regressions |
| Viewport | Full viewport | Maximum impact as the first thing users see |
| Transition duration | ~2 seconds | Punchy enough to not bore, long enough to feel like a journey |
| Audio | None | Visuals speak for themselves |
| Session behavior | Once per session (sessionStorage) | No friction for returning visitors |
| Tsuno visibility | Barely there (~0.1 alpha) | Almost subliminal; reward for close attention |
| Renderer | Own WebGL renderer, same 240p dither pipeline | Consistent VGA aesthetic; disposed after transition |
| Initialization | Sequential — screensaver deferred until splash disposes | Avoids dual WebGL contexts entirely |

## Scene Composition

### Mirror Plane

A fullscreen quad with a multi-layered fragment shader:

- **Base layer**: Procedural swirl pattern using the tunnel's color palette (deep reds, burnt orange, golds). Generated from polar-coordinate math — no dependency on the live screensaver output.
- **Ripple distortion**: Concentric rings expanding from center at varying speeds. Mouse/touch interaction spawns additional ripple impulses at cursor position, decaying over ~1.5 seconds. On mobile (no hover), only the auto-ripple from center plays.
- **Surface sheen**: Fresnel-like brightness gradient at edges for liquid mirror quality.

### Tsuno Silhouette

The `tsuno-daishi.jpg` texture sampled through the swirl-distorted UVs. Uses the existing luminance-as-mask technique at very low opacity (~0.1-0.15). Rotates slowly clockwise with the churning. Almost subliminal — users might not notice on first visit.

### ENTER Button

An HTML `<button>` element (not 3D) positioned center-screen over the canvas. Styled in the Retrofuture Glyphs aesthetic: Fixedsys font, bordered, CRT glow effect. Fades in ~1 second after the mirror surface stabilizes. Keyboard accessible — focusable and activatable with Enter/Space by default.

### Camera

Fixed position, looking straight forward at the plane. No parallax during splash.

## The Mirror Shader

Single fragment shader on a fullscreen quad. Note: PS1 vertex snapping is omitted from the splash shader since it has no visible effect on a fullscreen quad (all vertices are at screen corners).

**Swirl field:**
- Primary swirl: slow clockwise rotation matching `orbitSpeed` config
- Secondary counter-swirl: faster, smaller amplitude, creates turbulence
- Combined field displaces UV coordinates before color sampling

**Color generation:**
- Same palette as tunnel (dark reds → burnt orange → gold)
- Procedural via `smoothstep` band mixing driven by swirl field

**Ripple layer:**
- Concentric rings expanding outward from center
- Mouse/touch interaction spawns ripple impulse at cursor position
- Each ripple decays over ~1.5s; only latest stored (no accumulation)

**Tsuno embed:**
- Ghost texture sampled with swirl-distorted UVs, scaled and centered
- Luminance-as-mask, ~0.1 alpha, blurred by swirl distortion

**Uniforms:**
- `uTime` — animation driver
- `uSwirlSpeed` — from config, matches homepage tunnel
- `uRippleOrigin` + `uRippleTime` — mouse/touch interaction ripple
- `uGhostTex` — Tsuno texture
- `uTransition` — 0.0 normally, animates to 1.0 during enter

## Enter Transition (~2 seconds)

### Phase 1 — Ripple Burst (0–0.4s)

`uTransition` starts climbing. Strong ripple emanates from screen center. Swirl accelerates — churning speeds up as the mirror reacts. ENTER button fades out immediately.

### Phase 2 — Pull Through (0.4–1.5s)

Radial zoom distortion centered on screen — UVs pull inward creating the sensation of being sucked into the surface. Colors shift toward tunnel's deeper palette. Vignette closes in from edges. Tsuno silhouette stretches and vanishes.

### Phase 3 — Handoff (1.5–2.0s)

Vignette closes to black. During the brief blackout:
1. Splash renderer disposed, splash canvases removed from DOM
2. Screensaver initializes its renderer and scene (no dual contexts — splash is fully gone)
3. Homepage wrapper revealed, screensaver starts its animation loop
4. Brief fade-up from black completes the illusion

The ~0.3s darkness at the threshold is both technically clean and narratively fitting — crossing into another world.

## File Architecture

### New Files

- **`assets/japanjunky-splash.js`** (~400-550 lines) — Scene, shader, ripple interaction, transition logic, ENTER button creation, dither pipeline, cleanup
- **`assets/japanjunky-splash.css`** — ENTER button styling, splash canvas positioning

### Modified Files

- **`layout/theme.liquid`** — Splash canvas element, splash config block, script/CSS tags, homepage wrapper div, deferred screensaver init
- **`assets/japanjunky-screensaver.js`** — Wrap initialization in a callable function; expose `JJ_Portal.init()` instead of self-starting

### Screensaver Initialization Change

The screensaver currently self-starts inside an IIFE. To support deferred init:

```javascript
// Current (self-starting):
(function () {
  // ... all setup ...
  requestAnimationFrame(animate);
})();

// New (deferred):
(function () {
  function init() {
    // ... all setup (renderer, scene, textures, loop start) ...
    requestAnimationFrame(animate);
  }

  // If splash is active, expose init for later; otherwise start immediately
  if (window.JJ_SPLASH_ACTIVE) {
    window.JJ_Portal_Init = init;
  } else {
    init();
  }
})();
```

The splash script sets `window.JJ_SPLASH_ACTIVE = true` before the screensaver script loads. On transition complete, it calls `window.JJ_Portal_Init()`. This avoids any WebGL context overlap.

## DOM Structure During Splash

```html
<!-- Splash layer (removed after transition) -->
<canvas id="jj-splash" style="display:none;">  <!-- hidden WebGL canvas -->
<!-- jj-splash-display canvas created by JS, full viewport, z-index: 10 -->
<button id="jj-splash-enter">                  <!-- centered over canvas -->

<!-- Homepage layer (hidden during splash) -->
<div id="jj-homepage" style="opacity:0; pointer-events:none;">
  <canvas id="jj-screensaver">
  <div class="jj-crt-overlay">
  <div class="jj-product-zone">
  <div class="jj-ring">
  ...
</div>
```

## Lifecycle

1. Page loads → `window.JJ_SPLASH_ACTIVE = true` set in theme.liquid
2. Splash script creates its own renderer + scene + full-viewport display canvas (same 240p dither pipeline)
3. Screensaver script loads but sees `JJ_SPLASH_ACTIVE` — stores `init` in `JJ_Portal_Init` instead of self-starting
4. User clicks ENTER → transition plays (~2s)
5. Phase 3: splash renderer disposed, canvases removed, `window.JJ_Portal_Init()` called
6. Screensaver initializes (no context conflict), homepage fades to `opacity:1`
7. `sessionStorage.setItem('jj-entered', '1')` set
8. Subsequent visits in same session: `JJ_SPLASH_ACTIVE` not set, screensaver self-starts normally

### Session Skip Logic

```javascript
// In theme.liquid, before script tags:
try {
  if (!sessionStorage.getItem('jj-entered')) {
    window.JJ_SPLASH_ACTIVE = true;
  }
} catch (e) {
  // Private browsing or storage blocked — skip splash
}
```

### Shopify Customizer

An `enable_splash_screen` boolean in theme settings. When disabled, no splash scripts or styles are loaded and `JJ_SPLASH_ACTIVE` is never set.

## Configuration

In `theme.liquid`, a `JJ_SPLASH_CONFIG` block provides asset URLs:

```javascript
window.JJ_SPLASH_CONFIG = {
  ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }},
  swirlSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
  resolution: {{ settings.screensaver_resolution | default: 240 }},
  fps: {{ settings.screensaver_fps | default: 24 }}
};
```

Shares the same theme settings as the screensaver for visual consistency.

## Renderer & Performance

**Splash renderer:** Own `THREE.WebGLRenderer` + hidden canvas. Same 240p readback + VGA dither pipeline as screensaver (hidden WebGL canvas → render target → readback → dither → visible 2D display canvas). Keeps the aesthetic identical.

**Context management:** Sequential, never concurrent. Splash renderer is the only WebGL context during splash. It is fully disposed before the screensaver creates its own context. Zero overlap.

**FPS:** Matches screensaver config (default 24fps). Single fullscreen quad — extremely lightweight. Dither (with LUT optimization) is the heaviest per-frame operation.

**Mouse/touch ripples:** `mousemove` and `touchstart`/`touchmove` both tracked. Stores only latest ripple origin + timestamp as uniforms. No buffers, no history, zero-allocation.

**Cleanup on transition complete:**
- `renderer.dispose()`
- Render target disposed
- Hidden WebGL canvas + visible display canvas removed from DOM
- All references nulled for full GC eligibility
- Zero lingering memory after entering the site

## Accessibility

- **`prefers-reduced-motion: reduce`** — Skip splash entirely; homepage loads immediately (consistent with screensaver behavior)
- **`prefers-contrast: more`** — Skip splash entirely (consistent with screensaver behavior)
- **Keyboard** — ENTER button is a native `<button>` element, focusable and activatable with Enter/Space
- **Screen readers** — Canvas is `aria-hidden="true"`, button has visible text label

## Error Handling

- **WebGL failure** — If `THREE.WebGLRenderer` construction throws, skip splash entirely and reveal homepage immediately. The splash must never gate access to the store.
- **sessionStorage blocked** — try/catch around storage access; default to skipping splash on failure.
- **Texture load failure** — Tsuno silhouette is decorative; if texture fails to load, the mirror shader still works without it (the `uGhostTex` sample returns black, which multiplied by the low alpha is invisible).
