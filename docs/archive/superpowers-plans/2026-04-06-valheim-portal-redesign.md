# Valheim Portal Background Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the existing portal vortex tunnel with a Valheim-style portal aesthetic — warm fire edges grading into a purple core, procedural flame rings, and depth-aware sparkles.

**Architecture:** All changes are in `assets/japanjunky-screensaver.js`. Four shader modifications (tunnel, glow, rings, sparkles) plus a ring build loop rework and one new glow plane. No new files, dependencies, or geometry types.

**Tech Stack:** Three.js (global), GLSL ES 1.0 (WebGL 1), existing PS1 vertex snapping pipeline

**Spec:** `docs/superpowers/specs/2026-04-06-valheim-portal-redesign-design.md`

---

### Task 1: Tunnel Shader — Warm-to-Purple Depth Gradient

**Files:**
- Modify: `assets/japanjunky-screensaver.js:74-104` — `TUNNEL_FRAG`

- [ ] **Step 1: Replace TUNNEL_FRAG with depth-blended dual palette**

Replace lines 74-104 of `assets/japanjunky-screensaver.js` (the entire `TUNNEL_FRAG` variable) with:

```javascript
  var TUNNEL_FRAG = [
    'uniform float uTime;',
    'uniform float uSwirlSpeed;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  float angle = vUv.x;',
    '  float depth = vUv.y;',
    '',
    '  float twist = angle * 6.2832 - uTime * uSwirlSpeed * 0.08;',
    '  float pull = depth + uTime * 0.15;',
    '',
    '  float band = sin(twist * 3.0 + pull * 8.0) * 0.5 + 0.5;',
    '  float band2 = sin(twist * 5.0 - pull * 12.0 + uTime * 0.5) * 0.5 + 0.5;',
    '  float pattern = band * 0.6 + band2 * 0.4;',
    '',
    '  // Warm palette (near camera)',
    '  vec3 w1 = vec3(0.4, 0.05, 0.02);',
    '  vec3 w2 = vec3(0.85, 0.35, 0.05);',
    '  vec3 w3 = vec3(0.95, 0.75, 0.3);',
    '  vec3 warm = mix(w1, w2, smoothstep(0.0, 0.5, pattern));',
    '  warm = mix(warm, w3, smoothstep(0.5, 1.0, pattern));',
    '',
    '  // Purple palette (far end)',
    '  vec3 p1 = vec3(0.25, 0.05, 0.35);',
    '  vec3 p2 = vec3(0.6, 0.2, 0.8);',
    '  vec3 p3 = vec3(0.8, 0.6, 0.95);',
    '  vec3 cool = mix(p1, p2, smoothstep(0.0, 0.5, pattern));',
    '  cool = mix(cool, p3, smoothstep(0.5, 1.0, pattern));',
    '',
    '  // Blend warm→purple by depth',
    '  float depthMix = smoothstep(0.2, 0.8, depth);',
    '  vec3 color = mix(warm, cool, depthMix);',
    '',
    '  float falloff = smoothstep(0.0, 0.12, depth) * smoothstep(1.0, 0.6, depth);',
    '  color *= 0.4 + 0.6 * falloff;',
    '',
    '  // Glow at far end shifts warm→purple',
    '  float glow = smoothstep(0.75, 1.0, depth);',
    '  vec3 glowWarm = vec3(0.95, 0.75, 0.5);',
    '  vec3 glowCool = vec3(0.7, 0.5, 0.95);',
    '  color += mix(glowWarm, glowCool, depthMix) * glow * 0.3;',
    '',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Visual check**

Open the site in a browser. The tunnel should show warm red/orange/gold near the camera mouth transitioning to purple/violet at the far end. The swirl band pattern should be unchanged in shape.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): warm-to-purple depth gradient in tunnel shader"
```

---

### Task 2: Starburst Glow — Purple Core with Pulse

**Files:**
- Modify: `assets/japanjunky-screensaver.js:146-167` — `GLOW_FRAG`

- [ ] **Step 1: Replace GLOW_FRAG with purple palette and pulse**

Replace lines 146-167 of `assets/japanjunky-screensaver.js` (the entire `GLOW_FRAG` variable) with:

```javascript
  var GLOW_FRAG = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv);',
    '  float angle = atan(uv.y, uv.x);',
    '',
    '  float rays = pow(abs(sin(angle * 8.0 + uTime * 0.5)), 4.0);',
    '  rays += pow(abs(sin(angle * 13.0 - uTime * 0.3)), 6.0) * 0.5;',
    '',
    '  float glow = 1.0 / (1.0 + dist * 6.0);',
    '  glow = pow(glow, 1.5);',
    '',
    '  float intensity = glow + rays * glow * 0.6;',
    '',
    '  // Pulse breathing',
    '  float pulse = 1.0 + sin(uTime * 0.8) * 0.15;',
    '  intensity *= pulse;',
    '',
    '  vec3 color = mix(vec3(0.3, 0.05, 0.4), vec3(0.7, 0.5, 0.95), glow);',
    '',
    '  gl_FragColor = vec4(color * intensity, intensity);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Visual check**

The starburst at the tunnel's far end should now be purple/violet with a gentle pulsing brightness.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): purple starburst glow with breathing pulse"
```

---

### Task 3: Fire Rings — Procedural Flame Shader

**Files:**
- Modify: `assets/japanjunky-screensaver.js:258-285` — `RING_FRAG`

- [ ] **Step 1: Replace RING_FRAG with procedural flame shader**

Replace lines 258-285 of `assets/japanjunky-screensaver.js` (the entire `RING_FRAG` variable) with:

```javascript
  var RING_FRAG = [
    'uniform float uTime;',
    'uniform vec3 uBaseColor;',
    'uniform float uFlameIntensity;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv) * 2.0;',
    '  float angle = atan(uv.y, uv.x);',
    '',
    '  // Flame noise — layered sin waves for flickering',
    '  float flame1 = sin(angle * 8.0 + uTime * 2.5) * 0.5 + 0.5;',
    '  float flame2 = sin(angle * 13.0 - uTime * 1.8) * 0.5 + 0.5;',
    '  float flame3 = sin(angle * 21.0 + uTime * 3.2) * 0.5 + 0.5;',
    '  float flames = flame1 * 0.5 + flame2 * 0.3 + flame3 * 0.2;',
    '',
    '  // Ring band with flame-distorted outer edge',
    '  float outerEdge = 0.88 + flames * 0.12;',
    '  float ring = smoothstep(0.6, 0.78, dist) * smoothstep(outerEdge + 0.05, outerEdge - 0.05, dist);',
    '',
    '  // Brighten toward white at flame tips',
    '  float tipGlow = flames * smoothstep(0.75, 0.9, dist);',
    '  vec3 color = mix(uBaseColor, vec3(1.0, 0.9, 0.8), tipGlow * 0.6);',
    '',
    '  gl_FragColor = vec4(color * uFlameIntensity, ring);',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Visual check**

The rings won't look correct yet — they still use the old uniforms (`uHue`). That gets fixed in Task 4. Just verify the shader compiles without errors (no WebGL console errors).

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): procedural flame shader for portal rings"
```

---

### Task 4: Fire Rings — Rework Build Loop and Add Glow Plane

**Files:**
- Modify: `assets/japanjunky-screensaver.js:287-309` — ring build loop
- Modify: `assets/japanjunky-screensaver.js:1857-1860` — ring rotation in animation loop

- [ ] **Step 1: Replace the ring build loop**

Replace lines 287-309 of `assets/japanjunky-screensaver.js` (from `var PORTAL_RING_COUNT` through the end of the `for` loop including `portalRings.push`) with:

```javascript
  var RING_CONFIG = [
    { color: [0.95, 0.7, 0.2],   size: 8,   z: 2,  rot: 0.15,  intensity: 1.0 },
    { color: [0.85, 0.15, 0.05], size: 7,   z: 7,  rot: -0.25, intensity: 0.9 },
    { color: [0.8, 0.1, 0.3],   size: 6.2, z: 12, rot: 0.35,  intensity: 0.8 },
    { color: [0.6, 0.1, 0.5],   size: 5.5, z: 17, rot: -0.45, intensity: 0.7 },
    { color: [0.4, 0.15, 0.65], size: 5,   z: 22, rot: 0.55,  intensity: 0.6 },
    { color: [0.65, 0.45, 0.85], size: 4.5, z: 27, rot: -0.65, intensity: 0.5 }
  ];

  var portalRings = [];

  for (var ri = 0; ri < RING_CONFIG.length; ri++) {
    var rc = RING_CONFIG[ri];
    var ringGeo = new THREE.PlaneGeometry(rc.size, rc.size);
    var ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 },
        uBaseColor: { value: new THREE.Vector3(rc.color[0], rc.color[1], rc.color[2]) },
        uFlameIntensity: { value: rc.intensity }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = rc.z;
    ringMesh.userData.rotSpeed = rc.rot;
    scene.add(ringMesh);
    portalRings.push(ringMesh);
  }

  // Glow plane behind front ring — warm backlight bloom
  var ringGlowGeo = new THREE.PlaneGeometry(10, 10);
  var RING_GLOW_FRAG = [
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv);',
    '  float glow = 1.0 / (1.0 + dist * 4.0);',
    '  glow = pow(glow, 2.0) * 0.3;',
    '  vec3 color = vec3(0.95, 0.7, 0.2);',
    '  gl_FragColor = vec4(color * glow, glow);',
    '}'
  ].join('\n');
  var ringGlowMat = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: parseFloat(resH) }
    },
    vertexShader: GLOW_VERT,
    fragmentShader: RING_GLOW_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  var ringGlowMesh = new THREE.Mesh(ringGlowGeo, ringGlowMat);
  ringGlowMesh.position.z = 3;
  scene.add(ringGlowMesh);
```

- [ ] **Step 2: Update animation loop — ring time uniforms and rotation**

Replace lines 1857-1860 of `assets/japanjunky-screensaver.js`:

```javascript
    // Spin portal rings
    for (var ri = 0; ri < portalRings.length; ri++) {
      portalRings[ri].rotation.z += portalRings[ri].userData.rotSpeed * 0.02;
    }
```

With:

```javascript
    // Spin portal rings + update time
    for (var ri = 0; ri < portalRings.length; ri++) {
      portalRings[ri].material.uniforms.uTime.value = t;
      portalRings[ri].rotation.z += portalRings[ri].userData.rotSpeed * 0.02;
    }
```

- [ ] **Step 3: Visual check**

The 6 rings should now show animated procedural flames. The front ring (orange-gold, largest) should be closest to the camera. Each successive ring should be smaller, deeper, and shift in color toward purple. A soft warm glow should sit behind the front ring. All rings should rotate at different speeds in alternating directions.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): 6-layer flame rings with glow plane"
```

---

### Task 5: Sparkles — Depth-Aware Color Tint

**Files:**
- Modify: `assets/japanjunky-screensaver.js:212-239` — `SPARKLE_VERT` and `SPARKLE_FRAG`

- [ ] **Step 1: Replace SPARKLE_VERT with depth varying**

Replace lines 212-229 of `assets/japanjunky-screensaver.js` (the entire `SPARKLE_VERT` variable) with:

```javascript
  var SPARKLE_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform float uResolution;',
    'varying float vAlpha;',
    'varying float vDepth;',
    '',
    'void main() {',
    '  float twinkle = sin(uTime * 3.0 + aPhase) * 0.5 + 0.5;',
    '  vAlpha = pow(twinkle, 3.0);',
    '  vDepth = clamp(position.z / 35.0, 0.0, 1.0);',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (20.0 / -viewPos.z);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');
```

- [ ] **Step 2: Replace SPARKLE_FRAG with depth-blended color**

Replace lines 231-240 of `assets/japanjunky-screensaver.js` (the entire `SPARKLE_FRAG` variable — note line numbers shifted by +2 from the new varying line) with:

```javascript
  var SPARKLE_FRAG = [
    'varying float vAlpha;',
    'varying float vDepth;',
    '',
    'void main() {',
    '  float dist = length(gl_PointCoord - vec2(0.5));',
    '  if (dist > 0.5) discard;',
    '  float glow = 1.0 - dist * 2.0;',
    '  vec3 warmColor = vec3(0.95, 0.85, 0.7);',
    '  vec3 coolColor = vec3(0.8, 0.7, 0.95);',
    '  vec3 sparkleColor = mix(warmColor, coolColor, vDepth);',
    '  gl_FragColor = vec4(sparkleColor, glow * vAlpha);',
    '}'
  ].join('\n');
```

- [ ] **Step 3: Visual check**

Sparkles near the tunnel mouth should be warm gold. Sparkles deep in the tunnel should be pale lavender. The twinkle animation should be unchanged.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): depth-aware sparkle tint warm→purple"
```

---

### Task 6: Final Visual Tuning and Commit

**Files:**
- Modify: `assets/japanjunky-screensaver.js` (if needed)

- [ ] **Step 1: Full visual review**

Open the site and verify the complete scene:
1. Tunnel grades from warm fire at the mouth to purple at the far end
2. Starburst glow at the far end is purple with gentle pulse
3. 6 flame rings — front is large orange-gold, rings progress through red, magenta, violet, purple, lavender
4. Rings rotate at different speeds in alternating directions
5. Flames flicker and animate on all rings
6. Warm glow bloom behind the front ring
7. Sparkles tint from warm to lavender with depth
8. Tsuno Daishi behaves normally
9. Flying fragments behave normally
10. Dithering and PS1 vertex snapping still work

- [ ] **Step 2: Tune values if needed**

If any colors, intensities, or speeds feel off, adjust the specific values. Likely candidates:
- `depthMix` smoothstep range in tunnel (currently 0.2-0.8)
- Ring flame speed multipliers (currently 2.5, 1.8, 3.2)
- Glow pulse speed (currently 0.8) and amplitude (currently 0.15)
- Ring glow intensity (currently 0.3)

- [ ] **Step 3: Final commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(screensaver): valheim portal redesign — complete"
```
