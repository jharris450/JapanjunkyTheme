# Memory Fragments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add animated sprite-sheet-based "memory fragments" (clips from Japanese music/media) that fly through the portal tunnel as irregular glowing shards across three depth layers.

**Architecture:** Fragment sprite sheets are loaded from a config manifest, masked to irregular polygon shapes via a mask atlas, and rendered with a tinted additive-blend shader. Three depth layers (background/mid/foreground) with independent spawn timers and motion profiles create parallax. Meshes are recycled from a pool on despawn. All new code is additive — existing scene code is untouched.

**Tech Stack:** Three.js (existing global), GLSL shaders (ES1.0), ES5 JavaScript

**Spec:** `docs/superpowers/specs/2026-03-25-memory-fragments-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `assets/japanjunky-screensaver.js` | Modify | Add fragment system (~200 lines) after existing flying objects section (after line 1268) and add 2 calls in `animate()` (after line 1433) |
| `layout/theme.liquid` | Modify | Add `fragments` and `fragmentMasks` to `JJ_SCREENSAVER_CONFIG` (lines 194-202) |
| `tools/convert-fragments.js` | Create | Standalone Node.js GIF-to-sprite-sheet conversion script |

---

### Task 1: Fragment Shader and Material Factory

Add the GLSL shaders and `makeFragmentMaterial()` function for sprite-sheet + mask rendering.

**Files:**
- Modify: `assets/japanjunky-screensaver.js:1268` (insert after flying objects section, before Offscreen Render Target section)

**Context:** The existing file has a `TEX_VERT` vertex shader (lines 1135-1147) with PS1-style vertex snapping and a `makeTextureMaterial()` factory (lines 1158-1169). The new fragment shader needs the same vertex snapping but a different fragment shader with sprite sheet UV stepping, mask atlas sampling, tint, and alpha. Insert the new code between the `animateObjects` function (ends line 1268) and the "Offscreen Render Target" section (starts line 1270).

- [ ] **Step 1: Add the fragment vertex shader string**

Insert after line 1268 (`}` closing `animateObjects`):

```javascript
  // ─── Memory Fragments ──────────────────────────────────────────
  var FRAG_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Add the fragment pixel shader string**

```javascript
  var FRAG_FRAG = [
    'uniform sampler2D uSpriteSheet;',
    'uniform sampler2D uMaskAtlas;',
    'uniform float uFrameIndex;',
    'uniform float uSheetCols;',
    'uniform float uSheetRows;',
    'uniform float uMaskIndex;',
    'uniform float uMaskCols;',
    'uniform float uMaskRows;',
    'uniform vec3 uFragTint;',
    'uniform float uFragAlpha;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  float frame = floor(uFrameIndex);',
    '  float col = mod(frame, uSheetCols);',
    '  float row = floor(frame / uSheetCols);',
    '  vec2 cellSize = vec2(1.0 / uSheetCols, 1.0 / uSheetRows);',
    '  vec2 spriteUV = vec2(col, row) * cellSize + vUv * cellSize;',
    '',
    '  float mCol = mod(uMaskIndex, uMaskCols);',
    '  float mRow = floor(uMaskIndex / uMaskCols);',
    '  vec2 mCellSize = vec2(1.0 / uMaskCols, 1.0 / uMaskRows);',
    '  vec2 maskUV = vec2(mCol, mRow) * mCellSize + vUv * mCellSize;',
    '',
    '  vec4 sprite = texture2D(uSpriteSheet, spriteUV);',
    '  float mask = texture2D(uMaskAtlas, maskUV).a;',
    '  gl_FragColor = vec4(sprite.rgb * uFragTint, sprite.a * mask * uFragAlpha);',
    '}'
  ].join('\n');
```

- [ ] **Step 3: Add the material factory function**

```javascript
  var fragmentMaskTex = null; // loaded in Task 3

  function makeFragmentMaterial(spriteTex, meta) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uSpriteSheet: { value: spriteTex },
        uMaskAtlas: { value: fragmentMaskTex },
        uFrameIndex: { value: 0.0 },
        uSheetCols: { value: meta.cols },
        uSheetRows: { value: meta.rows },
        uMaskIndex: { value: 0.0 },
        uMaskCols: { value: 4.0 },
        uMaskRows: { value: 2.0 },
        uFragTint: { value: new THREE.Vector3(1.0, 0.7, 0.4) },
        uFragAlpha: { value: 0.6 }
      },
      vertexShader: FRAG_VERT,
      fragmentShader: FRAG_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }
```

- [ ] **Step 4: Verify no syntax errors**

Open browser console, reload the site. Confirm no JS errors. The fragment system isn't wired up yet, so no visual change expected.

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(fragments): add sprite-sheet + mask GLSL shaders and material factory"
```

---

### Task 2: Layer Config and State Variables

Add the `FRAG_LAYERS` config, shared geometry, fragment pools, and state variables.

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert right after the code from Task 1)

- [ ] **Step 1: Add layer config object**

```javascript
  var FRAG_LAYERS = [
    // Background: slow, small, near walls
    {
      spawnInterval: 2000,
      spawnRadiusMin: TUNNEL_RADIUS * 0.5,
      spawnRadiusMax: TUNNEL_RADIUS * 0.7,
      velZMin: 0.05, velZMax: 0.1,
      accel: 0.0005,
      scaleMin: 0.3, scaleMax: 0.5,
      driftAmp: 0.1,
      wobbleAmp: 0.087,
      alphaMult: 0.6,
      maxCount: 5,
      lastSpawn: 0,
      nextInterval: 2000
    },
    // Mid: medium speed and size
    {
      spawnInterval: 3000,
      spawnRadiusMin: TUNNEL_RADIUS * 0.3,
      spawnRadiusMax: TUNNEL_RADIUS * 0.5,
      velZMin: 0.15, velZMax: 0.25,
      accel: 0.001,
      scaleMin: 0.5, scaleMax: 0.8,
      driftAmp: 0.2,
      wobbleAmp: 0.175,
      alphaMult: 0.8,
      maxCount: 3,
      lastSpawn: 0,
      nextInterval: 3000
    },
    // Foreground: fast, large, near center
    {
      spawnInterval: 5000,
      spawnRadiusMin: 0,
      spawnRadiusMax: TUNNEL_RADIUS * 0.3,
      velZMin: 0.3, velZMax: 0.5,
      accel: 0.002,
      scaleMin: 0.8, scaleMax: 1.2,
      driftAmp: 0.3,
      wobbleAmp: 0.262,
      alphaMult: 1.0,
      maxCount: 2,
      lastSpawn: 0,
      nextInterval: 5000
    }
  ];
```

- [ ] **Step 2: Add state variables and shared geometry**

```javascript
  var fragmentGeo = new THREE.PlaneGeometry(1, 1);
  var fragmentPool = [];        // active fragments
  var fragmentRecyclePool = []; // despawned, ready to reuse
  var fragmentTextures = [];    // { tex: THREE.Texture, meta: {frames,cols,rows,fps,w,h}, url: string }
  var fragmentManifest = config.fragments || [];
  var fragmentMaskConfig = config.fragmentMasks || { count: 8, columns: 4, rows: 2 };
  var fragmentRecycleCount = 0; // counts recycles for texture rotation
```

- [ ] **Step 3: Verify no syntax errors**

Reload site, confirm no JS errors in console.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(fragments): add layer config, state variables, and shared geometry"
```

---

### Task 3: Texture Loading

Add mask atlas loading, sprite sheet batch loading, and texture cache rotation.

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after Task 2 code)

- [ ] **Step 1: Add mask atlas loader**

```javascript
  // Load mask atlas
  if (config.fragmentMasks && config.fragmentMasks.url) {
    textureLoader.load(config.fragmentMasks.url, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      fragmentMaskTex = tex;
      fragmentMaskConfig.columns = config.fragmentMasks.columns || 4;
      fragmentMaskConfig.rows = config.fragmentMasks.rows || 2;
      fragmentMaskConfig.count = config.fragmentMasks.count || 8;
    });
  }
```

- [ ] **Step 2: Add sprite sheet batch loader**

```javascript
  var fragmentLoadedUrls = {}; // track which URLs are already loaded/loading

  function loadFragmentBatch(count) {
    if (fragmentManifest.length === 0) return;
    var loaded = 0;
    var shuffled = [];
    for (var si = 0; si < fragmentManifest.length; si++) {
      shuffled.push(si);
    }
    // Fisher-Yates shuffle
    for (var fi = shuffled.length - 1; fi > 0; fi--) {
      var ri = Math.floor(Math.random() * (fi + 1));
      var tmp = shuffled[fi];
      shuffled[fi] = shuffled[ri];
      shuffled[ri] = tmp;
    }
    for (var li = 0; li < shuffled.length && loaded < count; li++) {
      var entry = fragmentManifest[shuffled[li]];
      if (fragmentLoadedUrls[entry.url]) continue;
      fragmentLoadedUrls[entry.url] = true;
      loaded++;
      (function (e) {
        textureLoader.load(e.url, function (tex) {
          tex.minFilter = THREE.NearestFilter;
          tex.magFilter = THREE.NearestFilter;
          fragmentTextures.push({
            tex: tex,
            meta: { frames: e.frames, cols: e.cols, rows: e.rows, fps: e.fps, w: e.w, h: e.h },
            url: e.url
          });
        });
      })(entry);
    }
  }

  // Initial batch load
  loadFragmentBatch(Math.min(20, fragmentManifest.length));
```

- [ ] **Step 3: Add texture rotation function**

Called after every 10 recycles to swap one cached texture for a new one:

```javascript
  function rotateFragmentTexture() {
    if (fragmentManifest.length <= fragmentTextures.length) return; // all loaded
    if (fragmentTextures.length === 0) return;
    // Evict oldest
    var evicted = fragmentTextures.shift();
    evicted.tex.dispose();
    delete fragmentLoadedUrls[evicted.url];
    // Load one new
    loadFragmentBatch(1);
  }
```

- [ ] **Step 4: Verify no syntax errors**

Reload site, confirm no JS errors. No visual change yet (no spawn/animate wired up).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(fragments): add texture loading with batch loader and cache rotation"
```

---

### Task 4: Spawn Logic

Add `spawnFragment(time)` that checks each layer's timer, picks a texture, creates or recycles a mesh, and assigns random params.

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after Task 3 code)

- [ ] **Step 1: Add helper to count active fragments per layer**

```javascript
  function countFragmentsInLayer(layerIdx) {
    var count = 0;
    for (var ci = 0; ci < fragmentPool.length; ci++) {
      if (fragmentPool[ci].userData.layerIdx === layerIdx) count++;
    }
    return count;
  }
```

- [ ] **Step 2: Add the spawn function**

```javascript
  function spawnFragment(time) {
    if (fragmentTextures.length === 0 || !fragmentMaskTex) return;

    for (var li = 0; li < FRAG_LAYERS.length; li++) {
      var layer = FRAG_LAYERS[li];
      if (time - layer.lastSpawn < layer.nextInterval) continue;
      if (countFragmentsInLayer(li) >= layer.maxCount) continue;

      layer.lastSpawn = time;
      // Jitter next interval ±30%
      layer.nextInterval = layer.spawnInterval * (0.7 + Math.random() * 0.6);

      // Pick random texture from cache
      var texIdx = Math.floor(Math.random() * fragmentTextures.length);
      var texEntry = fragmentTextures[texIdx];
      var meta = texEntry.meta;

      // Vivid (20%) or ghost-tinted (80%)
      var isVivid = Math.random() < 0.2;

      // Spawn position
      var angle = Math.random() * Math.PI * 2;
      var r = layer.spawnRadiusMin + Math.random() * (layer.spawnRadiusMax - layer.spawnRadiusMin);
      var sx = Math.cos(angle) * r;
      var sy = Math.sin(angle) * r;

      // Scale from aspect ratio + layer size
      var maxDim = Math.max(meta.w, meta.h);
      var layerScale = layer.scaleMin + Math.random() * (layer.scaleMax - layer.scaleMin);
      var meshScaleX = layerScale * (meta.w / maxDim);
      var meshScaleY = layerScale * (meta.h / maxDim);

      // Try to recycle
      var mesh;
      if (fragmentRecyclePool.length > 0) {
        mesh = fragmentRecyclePool.pop();
        mesh.material.uniforms.uSpriteSheet.value = texEntry.tex;
        mesh.material.uniforms.uSheetCols.value = meta.cols;
        mesh.material.uniforms.uSheetRows.value = meta.rows;
        mesh.material.uniforms.uFrameIndex.value = 0.0;
        mesh.material.uniforms.uMaskIndex.value = Math.floor(Math.random() * fragmentMaskConfig.count);
        mesh.material.uniforms.uMaskCols.value = fragmentMaskConfig.columns;
        mesh.material.uniforms.uMaskRows.value = fragmentMaskConfig.rows;
        mesh.material.uniforms.uFragTint.value.set(
          isVivid ? 1.0 : 1.0,
          isVivid ? 1.0 : 0.7,
          isVivid ? 1.0 : 0.4
        );
        mesh.material.uniforms.uFragAlpha.value = (isVivid ? 0.85 : (0.4 + Math.random() * 0.3)) * layer.alphaMult;
        scene.add(mesh);
      } else {
        var mat = makeFragmentMaterial(texEntry.tex, meta);
        mat.uniforms.uMaskIndex.value = Math.floor(Math.random() * fragmentMaskConfig.count);
        mat.uniforms.uMaskCols.value = fragmentMaskConfig.columns;
        mat.uniforms.uMaskRows.value = fragmentMaskConfig.rows;
        mat.uniforms.uFragTint.value.set(
          isVivid ? 1.0 : 1.0,
          isVivid ? 1.0 : 0.7,
          isVivid ? 1.0 : 0.4
        );
        mat.uniforms.uFragAlpha.value = (isVivid ? 0.85 : (0.4 + Math.random() * 0.3)) * layer.alphaMult;
        mesh = new THREE.Mesh(fragmentGeo, mat);
        scene.add(mesh);
      }

      mesh.position.set(sx, sy, SPAWN_Z);
      mesh.scale.set(meshScaleX, meshScaleY, 1);

      mesh.userData = {
        layerIdx: li,
        velZ: layer.velZMin + Math.random() * (layer.velZMax - layer.velZMin),
        accel: layer.accel,
        driftFreqX: 0.3 + Math.random() * 0.4,
        driftFreqY: 0.25 + Math.random() * 0.35,
        driftAmp: layer.driftAmp,
        driftPhase: Math.random() * Math.PI * 2,
        baseX: sx,
        baseY: sy,
        wobbleFreq: 0.3 + Math.random() * 0.5,
        wobbleAmp: layer.wobbleAmp,
        frameFps: meta.fps || 10,
        frameCount: meta.frames,
        frameAccum: 0,
        currentFrame: 0
      };

      fragmentPool.push(mesh);
    }
  }
```

- [ ] **Step 3: Verify no syntax errors**

Reload site, confirm no JS errors.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(fragments): add spawn logic with layer timers and mesh recycling"
```

---

### Task 5: Animation Loop

Add `animateFragments(time, dt)` that updates positions, sprite frame stepping, billboard facing, wobble, and handles despawn/recycling.

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (insert after Task 4 code)

- [ ] **Step 1: Add the animation function**

```javascript
  function animateFragments(time, dt) {
    var t = time * 0.001;
    var i = fragmentPool.length;

    while (i--) {
      var mesh = fragmentPool[i];
      var ud = mesh.userData;

      // Z movement (frame-based)
      ud.velZ += ud.accel;
      mesh.position.z += ud.velZ;

      // Lateral drift (sinusoidal)
      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmp;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmp;
      mesh.position.x = ud.baseX + driftX;
      mesh.position.y = ud.baseY + driftY;

      // Clamp to tunnel radius
      var dist = Math.sqrt(mesh.position.x * mesh.position.x + mesh.position.y * mesh.position.y);
      if (dist > TUNNEL_RADIUS) {
        var clampScale = TUNNEL_RADIUS / dist;
        mesh.position.x *= clampScale;
        mesh.position.y *= clampScale;
      }

      // Billboard facing + wobble
      mesh.lookAt(camera.position);
      mesh.rotateZ(ud.wobbleAmp * Math.sin(t * ud.wobbleFreq));

      // Sprite sheet frame stepping (time-based)
      ud.frameAccum += dt;
      var frameDuration = 1.0 / ud.frameFps;
      if (ud.frameAccum >= frameDuration) {
        ud.frameAccum -= frameDuration;
        ud.currentFrame = (ud.currentFrame + 1) % ud.frameCount;
      }
      mesh.material.uniforms.uFrameIndex.value = ud.currentFrame;

      // Despawn
      if (mesh.position.z > DESPAWN_Z) {
        scene.remove(mesh);
        fragmentPool.splice(i, 1);
        fragmentRecyclePool.push(mesh);

        // Texture rotation every 10 recycles
        fragmentRecycleCount++;
        if (fragmentRecycleCount >= 10) {
          fragmentRecycleCount = 0;
          rotateFragmentTexture();
        }
      }
    }
  }
```

- [ ] **Step 2: Verify no syntax errors**

Reload site, confirm no JS errors. Still no visual change — not wired into `animate()` yet.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(fragments): add animation loop with frame stepping and despawn recycling"
```

---

### Task 6: Wire Into Animation Loop and Config

Connect the fragment system to the main `animate()` function and add config entries to `theme.liquid`.

**Files:**
- Modify: `assets/japanjunky-screensaver.js:1433` (after `animateObjects(time);` in `animate()`)
- Modify: `layout/theme.liquid:194-202` (add fragment config)

- [ ] **Step 1: Add fragment calls to animate()**

In the `animate()` function, find the lines (after the existing flying objects calls):
```javascript
    // Spawn and animate flying objects
    spawnObject(time);
    animateObjects(time);
```

Add immediately after:
```javascript

    // Spawn and animate memory fragments
    spawnFragment(time);
    animateFragments(time, targetInterval / 1000);
```

- [ ] **Step 2: Add fragment config to theme.liquid**

In `layout/theme.liquid`, modify the `JJ_SCREENSAVER_CONFIG` block. After the `ghostTexture` line, add `fragmentMasks` and `fragments`. Note: the `fragments` array will be empty initially — the user will populate it after creating GIFs and running the conversion script.

Replace:
```javascript
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      swirlTexture: {{ 'vortex-swirl.jpg' | asset_url | json }},
      ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }}
    };
```

With:
```javascript
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      swirlTexture: {{ 'vortex-swirl.jpg' | asset_url | json }},
      ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }},
      fragmentMasks: {
        url: {{ 'frag-masks.png' | asset_url | json }},
        count: 8,
        columns: 4,
        rows: 2
      },
      fragments: [
        /*** Add entries here after running convert-fragments.js:
        { url: {{ 'frag-example.png' | asset_url | json }}, frames: 24, cols: 6, rows: 4, fps: 10, w: 128, h: 96 },
        ***/
      ]
    };
```

- [ ] **Step 3: Verify no syntax errors**

Reload site. With an empty `fragments` array and no mask atlas, the spawn function will early-return (`fragmentTextures.length === 0 || !fragmentMaskTex`). No visual change, no errors.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js layout/theme.liquid
git commit -m "feat(fragments): wire fragment system into animate loop and add config to theme.liquid"
```

---

### Task 7: GIF-to-Sprite-Sheet Conversion Script

Create the standalone Node.js script that converts a directory of GIFs into sprite sheet PNGs + metadata JSON + Liquid config snippet.

**Files:**
- Create: `tools/convert-fragments.js`

**Prerequisites:** `ffmpeg` and ImageMagick (`montage`) must be installed on the user's machine.

- [ ] **Step 1: Create the conversion script**

```javascript
#!/usr/bin/env node
/**
 * convert-fragments.js
 *
 * Converts a directory of GIF files into sprite sheet PNGs + metadata JSON
 * for the JapanJunky memory fragments system.
 *
 * Usage: node convert-fragments.js <input-dir> <output-dir>
 *
 * Requires: ffmpeg, ffprobe, ImageMagick (montage)
 */

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var os = require('os');

var args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node convert-fragments.js <input-dir> <output-dir>');
  process.exit(1);
}

var inputDir = args[0];
var outputDir = args[1];

if (!fs.existsSync(inputDir)) {
  console.error('Input directory does not exist: ' + inputDir);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Find all GIF files
var gifs = fs.readdirSync(inputDir).filter(function (f) {
  return /\.gif$/i.test(f);
});

if (gifs.length === 0) {
  console.error('No GIF files found in: ' + inputDir);
  process.exit(1);
}

console.log('Found ' + gifs.length + ' GIF files');

var liquidLines = [];

gifs.forEach(function (gifName, idx) {
  var gifPath = path.join(inputDir, gifName);
  var baseName = gifName.replace(/\.gif$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  var fragName = 'frag-' + baseName;

  console.log('[' + (idx + 1) + '/' + gifs.length + '] Processing: ' + gifName);

  // Create temp dir for frames
  var tmpDir = path.join(os.tmpdir(), 'frag-' + baseName + '-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Extract frames
    child_process.execSync(
      'ffmpeg -i "' + gifPath + '" -vsync 0 "' + path.join(tmpDir, 'frame_%04d.png') + '"',
      { stdio: 'pipe' }
    );

    // 2. Count frames
    var frames = fs.readdirSync(tmpDir).filter(function (f) {
      return /^frame_\d+\.png$/.test(f);
    });
    var frameCount = frames.length;

    if (frameCount === 0) {
      console.error('  No frames extracted, skipping');
      return;
    }

    // 3. Get dimensions from first frame
    var identifyOut = child_process.execSync(
      'magick identify -format "%w %h" "' + path.join(tmpDir, 'frame_0001.png') + '"',
      { encoding: 'utf8' }
    ).trim();
    var dims = identifyOut.split(' ');
    var frameW = parseInt(dims[0], 10);
    var frameH = parseInt(dims[1], 10);

    // 4. Get FPS from per-frame delays (GIFs define delay per frame, not a stream rate)
    var fps = 10; // default fallback
    try {
      var probeOut = child_process.execSync(
        'ffprobe -v quiet -print_format json -show_entries frame=duration_time "' + gifPath + '"',
        { encoding: 'utf8' }
      );
      var probeData = JSON.parse(probeOut);
      if (probeData.frames && probeData.frames.length > 0) {
        var totalDuration = 0;
        var validFrames = 0;
        for (var pi = 0; pi < probeData.frames.length; pi++) {
          var dur = parseFloat(probeData.frames[pi].duration_time);
          if (dur > 0) {
            totalDuration += dur;
            validFrames++;
          }
        }
        if (validFrames > 0) {
          var avgDuration = totalDuration / validFrames;
          var probeFps = Math.round(1.0 / avgDuration);
          if (probeFps > 0 && probeFps < 60) {
            fps = probeFps;
          }
        }
      }
    } catch (e) {
      // fallback to default fps
    }

    // 5. Compute grid (aim for roughly square)
    var cols = Math.ceil(Math.sqrt(frameCount));
    var rows = Math.ceil(frameCount / cols);

    // 6. Assemble sprite sheet
    var sheetPath = path.join(outputDir, fragName + '.png');
    child_process.execSync(
      'magick montage "' + path.join(tmpDir, 'frame_*.png') + '"' +
      ' -tile ' + cols + 'x' + rows +
      ' -geometry ' + frameW + 'x' + frameH + '+0+0' +
      ' -background transparent' +
      ' "' + sheetPath + '"',
      { stdio: 'pipe' }
    );

    // 7. Write metadata JSON
    var metaPath = path.join(outputDir, fragName + '.json');
    var meta = {
      name: baseName,
      frameCount: frameCount,
      columns: cols,
      rows: rows,
      fps: fps,
      width: frameW,
      height: frameH
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    // 8. Append Liquid config line
    liquidLines.push(
      "        { url: {{ '" + fragName + ".png' | asset_url | json }}, " +
      "frames: " + frameCount + ", cols: " + cols + ", rows: " + rows + ", " +
      "fps: " + fps + ", w: " + frameW + ", h: " + frameH + " }"
    );

    console.log('  -> ' + fragName + '.png (' + cols + 'x' + rows + ' grid, ' +
      frameCount + ' frames, ' + fps + ' fps, ' + frameW + 'x' + frameH + ')');

  } finally {
    // Cleanup temp frames
    try {
      var tmpFiles = fs.readdirSync(tmpDir);
      tmpFiles.forEach(function (f) { fs.unlinkSync(path.join(tmpDir, f)); });
      fs.rmdirSync(tmpDir);
    } catch (e) { /* best effort */ }
  }
});

// Write Liquid config snippet
var liquidPath = path.join(outputDir, 'fragments-config.liquid');
var liquidContent = '      fragments: [\n' + liquidLines.join(',\n') + '\n      ]';
fs.writeFileSync(liquidPath, liquidContent);

console.log('\nDone! ' + liquidLines.length + ' sprite sheets generated.');
console.log('Liquid config snippet saved to: ' + liquidPath);
console.log('\nNext steps:');
console.log('1. Upload all frag-*.png files to Shopify assets/');
console.log('2. Copy contents of fragments-config.liquid into theme.liquid JJ_SCREENSAVER_CONFIG');
```

- [ ] **Step 2: Test the script runs without errors (with no input)**

```bash
node tools/convert-fragments.js
```
Expected: prints usage message and exits with code 1.

- [ ] **Step 3: Commit**

```bash
git add tools/convert-fragments.js
git commit -m "feat(fragments): add GIF-to-sprite-sheet conversion script"
```

---

### Task 8: Create Mask Atlas

Create the `frag-masks.png` mask atlas with 8 irregular polygon shapes.

**Files:**
- Create: `assets/frag-masks.png` (generated via script or manual)

- [ ] **Step 1: Create a mask atlas generation script**

Create a temporary Node.js script that generates 8 irregular polygon mask shapes in a 4x2 grid PNG using the `canvas` package (or generate manually in any image editor). Each cell is 128x128px. Each shape is a white irregular polygon on transparent black.

```bash
node tools/generate-masks.js
```

Alternatively, create `frag-masks.png` manually in an image editor:
- Canvas size: 512x256 (4 columns x 2 rows, each cell 128x128)
- Draw 8 distinct irregular polygon shapes (jagged shards, angular fragments)
- Each shape: white (#FFFFFF) polygon fill on fully transparent background
- Save as PNG with alpha channel

- [ ] **Step 2: Verify the mask atlas**

Open `assets/frag-masks.png` and confirm:
- 512x256 pixels
- 8 distinct shard shapes visible
- Transparent background (alpha channel present)

- [ ] **Step 3: Commit**

```bash
git add assets/frag-masks.png
git commit -m "feat(fragments): add mask atlas with 8 irregular shard shapes"
```

---

### Task 9: End-to-End Test with Sample Fragment

Create a test GIF, convert it, add it to config, and verify the full pipeline renders correctly.

**Files:**
- Modify: `layout/theme.liquid` (add test fragment entry)
- Create: test GIF (temporary)

- [ ] **Step 1: Create a simple test GIF**

Use ffmpeg to create a minimal animated test GIF (colored squares cycling):
```bash
ffmpeg -f lavfi -i "color=c=red:s=64x64:d=0.1,format=rgb24" -f lavfi -i "color=c=blue:s=64x64:d=0.1,format=rgb24" -f lavfi -i "color=c=green:s=64x64:d=0.1,format=rgb24" -filter_complex "[0][1][2]concat=n=3:v=1:a=0,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" test-fragment.gif
```

- [ ] **Step 2: Convert the test GIF**

```bash
mkdir -p tools/test-output
node tools/convert-fragments.js . tools/test-output
```

Verify outputs: `tools/test-output/frag-test-fragment.png` and `tools/test-output/frag-test-fragment.json`

- [ ] **Step 3: Upload and add to config**

Copy the sprite sheet PNG to `assets/`, then update `theme.liquid` fragments array with the entry from `fragments-config.liquid`.

- [ ] **Step 4: Visual verification**

Reload the site. After the mask atlas and sprite sheet load (~1-2s), fragments should begin spawning:
- Irregular shard shapes visible (not rectangles)
- Animation cycling through frames (red → blue → green for the test)
- Three depth layers with different sizes and speeds
- 80% ghost-tinted (amber glow), 20% vivid (full color)
- Billboard-facing with gentle wobble
- Despawn when past camera, new ones spawn

- [ ] **Step 5: Clean up test files and commit**

Remove the test GIF. Keep the test sprite sheet in assets if useful, or remove it.

```bash
git add assets/japanjunky-screensaver.js layout/theme.liquid assets/frag-masks.png
git commit -m "feat(fragments): end-to-end verified memory fragments system"
```

- [ ] **Step 6: Push**

```bash
git push
```
