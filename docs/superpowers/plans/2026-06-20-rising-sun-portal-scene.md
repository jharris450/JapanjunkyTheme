# Rising Sun over Reflective Water — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a Japanese rising-sun-over-water scene (portal vortex + counter-rotating sun in the sky, mirrored rippling water below) as the background of the existing wax shader, leaving the lava wax and its physics completely unchanged.

**Architecture:** The wax raymarch shader already computes a background colour then raymarches the wax orbs over it. We replace only that background: a single fragment-shader function `jjSkyWater(uv)` draws the recovered portal spiral (2D polar) + the cut-out rising-sun texture in the sky, and a mirror-reflected, rippled copy in the water below the horizon. The sun's background is removed offline into `assets/risingsun.png`. No extra render target — single pass.

**Tech Stack:** three.js (global `THREE`), raw GLSL, ES5 UMD asset modules, `sharp` (build-time image), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-rising-sun-portal-scene-design.md`
**Look reference:** `tools/sun-portal-preview/preview.html` (the validated WebGL preview).

## Global Constraints

- **The wax simulation (`japanjunky-wax-sim.js`) and the wax orb raymarch are NOT changed.** Convection, wall-bounce, teardrop, pool, ASCII glob, Tsuno carve all stay exactly as they are. Only the wax shader's *background* colour changes.
- Asset JS is ES5 UMD (`var`, no arrows/const/let), matching the codebase.
- Warm palette; the sun is the theme red **`#e8313a` = `vec3(0.909, 0.192, 0.227)`**; the portal's recovered warm→purple is kept but purple is pushed to the rim (`depthMix = smoothstep(0.72, 1.0, depth)`). Cyan stays reserved. 240p → readPixels → VGA-dither/PS1 pipeline preserved.
- Single pass, no extra render target.
- **Validated defaults:** `uHorizon 0.27`, `uPortalRot 0.82` (rot term negated → counter-rotates sun), `uSunRot 0.08` (CCW), `uSunSize 3.0`, `uRipple 0.054`, `uWaterDark 0.78`.
- Sun background removed offline → `assets/risingsun.png` (RGBA, committed). No runtime chroma-key; the shader reads the PNG's alpha.
- Splash intro (`japanjunky-splash.js`) untouched.
- Tests are Vitest, `npm test`. Never `git add -A` — stage explicit files. Deploy is via `main`.

---

### Task 1: Sun cut-out build script → `assets/risingsun.png`

**Files:**
- Create: `tools/risingsun-cutout/build.js`
- Produces (committed): `assets/risingsun.png`

**Interfaces:**
- Consumes: source image (default `C:/Users/Jacob/Desktop/risingsun.jpg`, override via arg or `RISINGSUN_SRC`).
- Produces: `assets/risingsun.png` — RGBA, red rays opaque, light background transparent. Sampled at runtime by the shader (Task 2/3).

- [ ] **Step 1: Write the build script**

```js
// tools/risingsun-cutout/build.js
// Remove the light background from risingsun.jpg -> assets/risingsun.png (RGBA).
// Alpha = "redness" of each pixel: saturated-red sun stays opaque, near-white/grey
// background becomes transparent. No runtime chroma-key needed.
// Run: node tools/risingsun-cutout/build.js [sourcePath]
var sharp = require('sharp');
var path = require('path');

var SRC = process.argv[2] || process.env.RISINGSUN_SRC || 'C:/Users/Jacob/Desktop/risingsun.jpg';
var OUT = path.join(__dirname, '..', '..', 'assets', 'risingsun.png');
var GAIN = 3.0; // redness gain (matches the preview's chroma-key)

sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  .then(function (res) {
    var data = res.data, info = res.info;
    var n = info.width * info.height, ch = info.channels;
    for (var i = 0; i < n; i++) {
      var o = i * ch;
      var r = data[o], g = data[o + 1], b = data[o + 2];
      var a = (r - Math.max(g, b)) / 255 * GAIN;
      a = a < 0 ? 0 : (a > 1 ? 1 : a);
      data[o + 3] = Math.round(a * 255);
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
      .trim()           // crop the now-transparent margins
      .png()
      .toFile(OUT);
  })
  .then(function () { console.log('wrote', OUT); })
  .catch(function (e) { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the build script**

Run: `node tools/risingsun-cutout/build.js`
Expected: prints `wrote .../assets/risingsun.png`, no error.

- [ ] **Step 3: Verify the output has real transparency**

Run:
```bash
node -e "const s=require('sharp'); s('assets/risingsun.png').stats().then(st=>{const a=st.channels[3]; console.log('alpha min',a.min,'max',a.max); if(a.min!==0||a.max!==255){process.exit(1);}}).then(()=>s('assets/risingsun.png').metadata()).then(m=>console.log(m.width+'x'+m.height,'alpha',m.hasAlpha))"
```
Expected: `alpha min 0 max 255` (fully transparent background + fully opaque rays) and `hasAlpha true`. If `min` is not 0, the background wasn't keyed — lower `GAIN` or check the source isn't already dark.

- [ ] **Step 4: Commit**

```bash
git add tools/risingsun-cutout/build.js assets/risingsun.png
git commit -m "feat(sun): cut-out build script + transparent risingsun.png

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Sky + water background in the wax shader

**Files:**
- Modify: `assets/japanjunky-wax-shader.js`
- Test: `tests/wax-shader.test.js`

**Interfaces:**
- Consumes: nothing new (GLSL strings only).
- Produces: the wax FRAG now declares uniforms `uHorizon` (float), `uSunTex` (sampler2D), `uSunActive` (float), `uPortalRot` (float), `uSunRot` (float), `uSunSize` (float), `uRipple` (float), `uWaterDark` (float), and draws `jjSkyWater(vUv)` as the background. Screensaver (Task 3) supplies these uniforms.

- [ ] **Step 1: Write the failing test**

Add the new uniforms to the existing assertion list in `tests/wax-shader.test.js` (the `.forEach` of expected `decl` substrings):

```js
    ['uTime', 'uAspect', 'uHeatGlow', 'uBlobCount', 'uBlobs[8]', 'uBlobTemp[8]', 'uTsuno', 'uTsunoActive',
     'uAsciiTex', 'uAsciiCount', 'uAsciiCenter', 'uAsciiActive', 'uAsciiCell', 'uResolution', 'uBlobStretch[8]',
     'uHorizon', 'uSunTex', 'uSunActive', 'uPortalRot', 'uSunRot', 'uSunSize', 'uRipple', 'uWaterDark']
      .forEach(function (decl) {
        expect(Shader.frag).toContain(decl);
      });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wax-shader`
Expected: FAIL — frag does not contain `uHorizon` (and the other new uniforms).

- [ ] **Step 3: Declare the new uniforms**

In `assets/japanjunky-wax-shader.js`, in the FRAG uniform block, after the `'uniform float uBlobStretch[' + N + '];',` line add:

```js
    'uniform float uHorizon;',           // horizon line (uv.y); sky above, water below
    'uniform sampler2D uSunTex;',        // cut-out rising sun (alpha = sun)
    'uniform float uSunActive;',         // 1 = draw the sun
    'uniform float uPortalRot;',         // portal spin speed (rot term negated in jjPortal)
    'uniform float uSunRot;',            // sun spin speed (CCW, opposite the portal)
    'uniform float uSunSize;',           // sun scale (larger = covers more of the page)
    'uniform float uRipple;',            // water ripple amplitude
    'uniform float uWaterDark;',         // water reflection darken factor
```

- [ ] **Step 4: Add the sky/water GLSL functions**

In the same file, immediately AFTER the `waxColor(float h)` function block and BEFORE `void main()`, insert these four functions:

```js
    '// ── Sky: portal vortex (recovered tunnel, ported to 2D polar) ──',
    'vec3 jjPortal(vec2 uv) {',
    '  vec2 d = uv - vec2(0.5, uHorizon); d.x *= uAspect;',
    '  float angle = atan(d.y, d.x) / 6.2832 + 0.5;',
    '  float depth = clamp(length(d) / 1.1, 0.0, 1.0);',
    '  float a = angle * 6.2832;',
    '  float rot = -uTime * uPortalRot;',          // negated -> counter-rotates the sun
    '  float tightness = 3.0 + depth * 5.0;',
    '  float s1 = sin(a*2.0 + depth*tightness*6.2832 - rot)*0.5+0.5;',
    '  float s2 = sin(a*3.0 - depth*(tightness-1.0)*4.5 + rot*0.6)*0.5+0.5;',
    '  float s3 = sin(a*5.0 + depth*tightness*8.0 - rot*1.4)*0.5+0.5;',
    '  float pattern = s1*0.5 + s2*0.3 + s3*0.2;',
    '  vec3 w1=vec3(0.4,0.05,0.02), w2=vec3(0.85,0.35,0.05), w3=vec3(0.95,0.75,0.3);',
    '  vec3 warm=mix(w1,w2,smoothstep(0.0,0.5,pattern)); warm=mix(warm,w3,smoothstep(0.5,1.0,pattern));',
    '  vec3 q1=vec3(0.25,0.05,0.35), q2=vec3(0.6,0.2,0.8), q3=vec3(0.8,0.6,0.95);',
    '  vec3 cool=mix(q1,q2,smoothstep(0.0,0.5,pattern)); cool=mix(cool,q3,smoothstep(0.5,1.0,pattern));',
    '  float depthMix = smoothstep(0.72, 1.0, depth);', // purple only at the rim (orange-dominant)
    '  vec3 color = mix(warm, cool, depthMix);',
    '  float falloff = smoothstep(0.0,0.1,depth)*smoothstep(1.0,0.5,depth);',
    '  color *= 0.45 + 0.55*falloff;',
    '  float glow = smoothstep(0.7,1.0,depth);',
    '  color += mix(vec3(0.95,0.75,0.5), vec3(0.7,0.5,0.95), depthMix)*glow*0.3;',
    '  return color;',
    '}',
    '',
    'vec4 jjSun(vec2 uv) {',
    '  if (uSunActive < 0.5) return vec4(0.0);',
    '  vec2 d = uv - vec2(0.5, uHorizon); d.x *= uAspect;',
    '  float ang = uTime * uSunRot;',               // CCW
    '  float ca = cos(ang), sa = sin(ang);',
    '  vec2 r = vec2(d.x*ca - d.y*sa, d.x*sa + d.y*ca);',
    '  vec2 suv = r / uSunSize + 0.5;',
    '  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return vec4(0.0);',
    '  float alpha = texture2D(uSunTex, vec2(suv.x, 1.0 - suv.y)).a;',
    '  return vec4(vec3(0.909, 0.192, 0.227), alpha);', // theme red #e8313a
    '}',
    '',
    'vec3 jjSky(vec2 uv) {',
    '  vec3 col = jjPortal(uv);',
    '  vec4 s = jjSun(uv);',
    '  return mix(col, s.rgb, s.a);',
    '}',
    '',
    '// Sky above the horizon; below it, the sky mirrored about the horizon and',
    '// rippled (the reflective water), warm-darkened, plus a horizon glow line.',
    'vec3 jjSkyWater(vec2 uv) {',
    '  vec3 col;',
    '  if (uv.y >= uHorizon) {',
    '    col = jjSky(uv);',
    '  } else {',
    '    float below = (uHorizon - uv.y) / uHorizon;',
    '    vec2 ref = vec2(uv.x, 2.0*uHorizon - uv.y);',
    '    ref.x += sin(uv.y*60.0 - uTime*1.5) * uRipple * below;',
    '    ref.y += sin(uv.x*40.0 - uTime*1.2) * uRipple * 0.3 * below;',
    '    col = jjSky(ref) * uWaterDark;',
    '  }',
    '  float hg = exp(-pow((uv.y - uHorizon)*40.0, 2.0));',
    '  col += vec3(0.95,0.6,0.2) * hg * 0.4;',
    '  return col;',
    '}',
```

- [ ] **Step 5: Use the sky/water as the background**

In `void main()`, replace the flat-gradient background block:

```js
    '  // Warm background (no black void) — matches the portal\'s warm zone,',
    '  // brighter toward the heated bottom, dimmer warm red up high.',
    '  vec3 bgBottom = vec3(0.72, 0.34, 0.10);',
    '  vec3 bgTop    = vec3(0.30, 0.10, 0.05);',
    '  vec3 col = mix(bgTop, bgBottom, 1.0 - vUv.y);',
```

with:

```js
    '  vec3 col = jjSkyWater(vUv);',   // sky + reflective water behind the wax
```

- [ ] **Step 6: Stop the heat glow from washing the water**

The bottom heat glow currently brightens the background everywhere it has no wax hit. Over water that washes the reflection, so apply it only on wax hits. Change:

```js
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 1.0);',
```

to:

```js
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 0.0);',
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — `wax-shader` now finds all uniforms; the rest of the suite (incl. `wax-sim`) is green (no sim change). 64 tests.

- [ ] **Step 8: Commit**

```bash
git add assets/japanjunky-wax-shader.js tests/wax-shader.test.js
git commit -m "feat(scene): portal + sun + reflective water behind the wax

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the sun texture + uniforms in the screensaver + theme

**Files:**
- Modify: `assets/japanjunky-screensaver.js`
- Modify: `layout/theme.liquid`

No unit test — THREE/DOM wiring, verified in the Step 6 browser checklist. Must keep `npm test` green (no test changes).

**Interfaces:**
- Consumes: `JJ_WaxShader.frag` (Task 2) with the new uniforms; `config.risingSun` (theme).
- Produces: the wax material gets `uHorizon/uSunTex/uSunActive/uPortalRot/uSunRot/uSunSize/uRipple/uWaterDark`; the sun PNG is loaded and bound.

- [ ] **Step 1: Pass the sun asset URL from the theme**

In `layout/theme.liquid`, in the `window.JJ_SCREENSAVER_CONFIG = { ... }` object, add a line next to `ghostTexture`:

```liquid
      risingSun: {{ 'risingsun.png' | asset_url | json }},
```

- [ ] **Step 2: Add the new uniforms with validated defaults + a placeholder sun texture**

In `assets/japanjunky-screensaver.js`, find the `var waxUniforms = { ... }` object (in the wax-mount section). Add these entries (before the closing `}` of the object):

```js
    uHorizon: { value: 0.27 },
    uSunTex: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat) },
    uSunActive: { value: 0.0 },          // flips to 1 when the PNG loads
    uPortalRot: { value: 0.82 },
    uSunRot: { value: 0.08 },
    uSunSize: { value: 3.0 },
    uRipple: { value: 0.054 },
    uWaterDark: { value: 0.78 }
```

(The 1×1 transparent `DataTexture` is a valid placeholder so the `uSunTex` sampler is always bound; `uSunActive` 0 means the shader never samples it until the real texture loads.)

- [ ] **Step 3: Mark the placeholder texture ready**

Immediately after the `waxUniforms` object literal (before it is used by the material), add:

```js
  waxUniforms.uSunTex.value.needsUpdate = true; // DataTexture must be flagged before first use
```

- [ ] **Step 4: Load the real sun PNG**

After the wax material is created (after `var waxQuad = ...; waxScene.add(waxQuad);`), add:

```js
  // Rising-sun overlay: load the cut-out PNG, then activate it in the shader.
  if (config.risingSun) {
    textureLoader.load(config.risingSun, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      waxUniforms.uSunTex.value = tex;
      waxUniforms.uSunActive.value = 1.0;
    });
  }
```

(`textureLoader` already exists in this file — it loads `ghostTexture`. Reuse it. The portal + water render immediately; the sun pops in when loaded. No per-frame JS is needed — `uTime`, already advanced in `updateWax`, drives the portal and sun rotation inside the shader.)

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS — 64 tests, unchanged (this task adds no tests and must not break the build).

- [ ] **Step 6: Manual browser regression (record results)**

Load the live theme preview. This is the visual gate the unit tests cannot cover:

- [ ] Homepage **background renders** (no blank/black) — a GLSL compile error in Task 2 would blank it; check the console for shader errors first.
- [ ] Sky (top ~73%): swirling **portal** (orange-dominant, purple only at the rim) with the **theme-red rising sun** on the horizon, the sun **counter-rotating** the portal.
- [ ] Horizon at ~27% from the bottom with a warm glow line; below it the **water mirrors** the sky (portal + sun flipped) and **ripples**; the sun's lower half is reflected.
- [ ] **Wax orbs are unchanged** — they still form at the pool, rise, cool, fall, bounce off the walls; ASCII glob and Tsuno carve still work, now over the new background.
- [ ] Product page and login camera presets still render without errors.
- [ ] Reduced-motion: one static frame (portal/sun frozen). High-contrast: background disabled. Scroll/tab-away still pauses.
- [ ] No console errors; framerate acceptable (if heavy, the ripple detail and `uSunSize` are the dials; resolution is `settings.screensaver_resolution`).

- [ ] **Step 7: Commit**

```bash
git add assets/japanjunky-screensaver.js layout/theme.liquid
git commit -m "feat(scene): load rising-sun PNG + scene uniforms in screensaver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** sky portal ported to 2D polar (T2 `jjPortal`), purple-to-rim `depthMix` (T2), counter-rotation via negated `rot` (T2), theme-red sun `#e8313a` (T2 `jjSun`), sun bisected on horizon + sized to cover page (T2 + `uSunSize` 3.0), reflective rippling water mirror single-pass (T2 `jjSkyWater`), horizon glow (T2), wax orbs + sim UNCHANGED (only the bg block + heat-glow gate change; raymarch untouched), sun bg removed offline → `assets/risingsun.png` (T1), theme config (T3), validated defaults (T3 uniforms), 240p/dither preserved (pipeline untouched), splash untouched (no task touches it). All covered.
- **Deviation from spec:** the spec proposed a separate `japanjunky-sky.js` module with a `reflectUv` unit test. Folded the GLSL into `japanjunky-wax-shader.js` instead — it is one fragment shader, cross-module GLSL composition under both browser-global and vitest-require is fragile, and the only "pure" logic (`2*horizon - y`) is too trivial to warrant a module. Uniform presence is covered by the wax-shader sanity test. No behaviour lost.
- **Type/uniform consistency:** the eight new uniform names are identical across the FRAG declarations (T2 Step 3), the GLSL that reads them (T2 Step 4), the test assertions (T2 Step 1), and the `waxUniforms` values (T3 Step 2). `uSunTex` is a sampler read only when `uSunActive > 0.5`; a 1×1 placeholder keeps it bound until the PNG loads.
- **Placeholder scan:** every step has concrete code/commands and expected output; no TBD/TODO.
