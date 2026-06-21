/**
 * JapanJunky Screensaver — Portal Vortex Tunnel
 *
 * Holographic swirling portal with flying objects (album covers),
 * rendered at low resolution with VGA 256-color dithering and
 * PS1-style vertex snapping.
 *
 * Depends on: THREE (global), JJ_ScreensaverPost (global),
 *             JJ_SCREENSAVER_CONFIG (global, set by theme.liquid)
 */
(function () {
  'use strict';

  function init() {
  var config = window.JJ_SCREENSAVER_CONFIG || {};
  if (config.enabled === false) return;
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('jj-screensaver');
  if (!canvas) return;

  // Accessibility: high-contrast → disable entirely
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersHighContrast) return;

  // Accessibility: reduced-motion → render one static frame then stop
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Resolution ──────────────────────────────────────────────
  // Match viewport aspect so the 3D scene isn't stretched/distorted.
  var configRes = parseInt(config.resolution, 10) || 240;
  var resH = configRes;
  var viewportAspect = (window.innerWidth && window.innerHeight)
    ? window.innerWidth / window.innerHeight : 4 / 3;
  var resW = Math.round(resH * viewportAspect);

  // ─── Renderer ────────────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    return; // WebGL not available — silent fallback to black bg
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);

  var CAMERA_PRESETS = {
    default: { pos: [0, 0, -1], look: [0, 0, 30] },
    product: { pos: [-3, 0.5, -1], look: [2, 0, 30] },
    login:   { pos: [0, 2.5, -1], look: [0, -1, 30] }
  };
  var cameraPreset = CAMERA_PRESETS[config.cameraPreset] || CAMERA_PRESETS.default;
  camera.position.set(cameraPreset.pos[0], cameraPreset.pos[1], cameraPreset.pos[2]);
  camera.lookAt(cameraPreset.look[0], cameraPreset.look[1], cameraPreset.look[2]);

  // Product-page preset: camera is off-axis so several effects need
  // conditional handling (amber clear color, fragment occlusion fade, etc.)
  var isProductPagePreset = (config.cameraPreset === 'product');
  var isLoginPreset = (config.cameraPreset === 'login');

  // Main-pass clear color. Product page camera is off-axis, so part of
  // the view sees past the tunnel cylinder wall — with a black clear
  // that area reads as a dead void. Fill with a warm amber that matches
  // the dim end of the tunnel shader's warm palette so the empty side
  // reads as portal glow, aligned with the homepage's appearance.
  var mainClearColor = (isProductPagePreset || isLoginPreset) ? 0x3a1a08 : 0x000000;

  var textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = 'anonymous';

  // ─── Lava-lamp wax (replaces the portal) ───────────────────
  var waxState = JJ_WaxSim.createState({ seed: 7, count: 4 });
  var waxAspect = resW / resH;
  // Teardrop: moving blobs stretch into necks/columns; smoothing keeps it from
  // snapping. Between rounded-ball (too low) and rigid-pill (too high).
  var STRETCH_K = 9.0;
  var MAX_STRETCH = 2.0;

  var waxUniforms = {
    uTime: { value: 0.0 },
    uAspect: { value: waxAspect },
    uHeatGlow: { value: 1.0 },
    uBlobCount: { value: waxState.blobs.length },
    uBlobs: { value: [] },
    uBlobTemp: { value: [] },
    uTsuno: { value: new THREE.Vector4(0, 0, 0, 0.16) },
    uTsunoActive: { value: 0.0 },
    uBlobStretch: { value: [] },
    uHorizon: { value: 0.27 },
    uSunTex: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat) },
    uSunActive: { value: 0.0 },          // flips to 1 when the PNG loads
    uPortalRot: { value: 0.82 },
    uSunRot: { value: 0.08 },
    uSunSize: { value: 3.0 },
    uRipple: { value: 0.054 },
    uWaterDark: { value: 0.78 }
  };
  waxUniforms.uSunTex.value.needsUpdate = true; // DataTexture must be flagged before first use
  // Smoothed per-blob stretch (low-pass of the raw |vy|-driven target) so the
  // teardrop shape eases instead of snapping when velocity changes.
  var waxStretch = [];
  var STRETCH_SMOOTH = 0.06;
  for (var wi = 0; wi < JJ_WaxSim.MAX_BLOBS; wi++) {
    waxUniforms.uBlobs.value.push(new THREE.Vector4(0, 0, 0, 0));
    waxUniforms.uBlobTemp.value.push(0.0);
    waxUniforms.uBlobStretch.value.push(1.0);
    waxStretch.push(1.0);
  }
  var waxScene = new THREE.Scene();
  var waxCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var waxMat = new THREE.ShaderMaterial({
    uniforms: waxUniforms,
    vertexShader: JJ_WaxShader.vert,
    fragmentShader: JJ_WaxShader.frag,
    depthWrite: false,
    depthTest: false
  });
  var waxQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waxMat);
  waxScene.add(waxQuad);

  // Rising-sun overlay: load the cut-out PNG, then activate it in the shader.
  if (config.risingSun) {
    textureLoader.load(config.risingSun, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      waxUniforms.uSunTex.value = tex;
      waxUniforms.uSunActive.value = 1.0;
      if (prefersReducedMotion) { renderOneFrame(); }
    });
  }

  // Tsuno → wax field input (uv space, with frame-to-frame velocity)
  var lastTsunoUv = null;
  // Tsuno only disturbs the wax when he is up close to the viewport (small z =
  // near the camera). As he moves to the back the reaction fades out, then off.
  var TSUNO_FRONT_Z = 4.5; // z <= this: full reaction
  var TSUNO_BACK_Z = 8.0;  // z >= this: no reaction (deferred while in back)
  function computeTsunoInput(dt) {
    if (!tsunoMesh || dt <= 0) return { active: false };
    var prox = (TSUNO_BACK_Z - tsunoMesh.position.z) / (TSUNO_BACK_Z - TSUNO_FRONT_Z);
    if (prox > 1) prox = 1;
    if (prox <= 0) { lastTsunoUv = null; return { active: false }; }
    var ndc = tsunoMesh.position.clone().project(camera);
    var uv = { x: ndc.x * 0.5 + 0.5, y: ndc.y * 0.5 + 0.5 };
    var vx = 0, vy = 0;
    if (lastTsunoUv) { vx = (uv.x - lastTsunoUv.x) / dt; vy = (uv.y - lastTsunoUv.y) / dt; }
    lastTsunoUv = uv;
    return { active: true, x: uv.x, y: uv.y, vx: vx, vy: vy, radius: 0.16 * prox };
  }

  function updateWax(t, dt) {
    var tsuno = computeTsunoInput(dt);
    JJ_WaxSim.step(waxState, dt, tsuno);
    waxUniforms.uTime.value = t;
    waxUniforms.uBlobCount.value = waxState.blobs.length;
    for (var i = 0; i < waxState.blobs.length; i++) {
      var b = waxState.blobs[i];
      waxUniforms.uBlobs.value[i].set(b.x, b.y, b.z, b.radius);
      waxUniforms.uBlobTemp.value[i] = b.temp;
      var target = 1 + Math.min(Math.abs(b.vy) * STRETCH_K, MAX_STRETCH - 1);
      waxStretch[i] += (target - waxStretch[i]) * STRETCH_SMOOTH;
      waxUniforms.uBlobStretch.value[i] = waxStretch[i];
    }
    if (tsuno.active) {
      waxUniforms.uTsuno.value.set(tsuno.x, tsuno.y, 0.0, tsuno.radius);
      waxUniforms.uTsunoActive.value = 1.0;
    } else {
      waxUniforms.uTsunoActive.value = 0.0;
    }
  }

  // ─── Starburst Glow ─────────────────────────────────────────
  var GLOW_VERT = [
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

  // ─── Sparkle Particles ─────────────────────────────────────
  var SPARKLE_COUNT = 30;
  var sparkleGeo = new THREE.BufferGeometry();
  var sparklePositions = new Float32Array(SPARKLE_COUNT * 3);
  var sparkleSizes = new Float32Array(SPARKLE_COUNT);
  var sparklePhases = new Float32Array(SPARKLE_COUNT);

  for (var si = 0; si < SPARKLE_COUNT; si++) {
    var sAngle = Math.random() * Math.PI * 2;
    var sRadius = Math.random() * 2.4;
    var sDepth = 1 + Math.random() * 34;
    sparklePositions[si * 3] = Math.cos(sAngle) * sRadius;
    sparklePositions[si * 3 + 1] = Math.sin(sAngle) * sRadius;
    sparklePositions[si * 3 + 2] = sDepth;
    sparkleSizes[si] = 1.0 + Math.random() * 1.5;
    sparklePhases[si] = Math.random() * Math.PI * 2;
  }

  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  sparkleGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkleSizes, 1));
  sparkleGeo.setAttribute('aPhase', new THREE.BufferAttribute(sparklePhases, 1));

  // Warm rising bubble motes (plain dots; the ASCII look now lives on a wax
  // glob in the raymarch shader, not on particles).
  var SPARKLE_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform float uResolution;',
    'varying float vAlpha;',
    'void main() {',
    '  float twinkle = sin(uTime * 3.0 + aPhase) * 0.5 + 0.5;',
    '  vAlpha = pow(twinkle, 3.0);',
    '  vec3 pos = position;',
    '  pos.y += mod(uTime * 0.25 + aPhase, 3.0);', // slow upward drift, wraps
    '  vec4 viewPos = modelViewMatrix * vec4(pos, 1.0);',
    '  gl_PointSize = aSize * (20.0 / -viewPos.z);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w) * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var SPARKLE_FRAG = [
    'varying float vAlpha;',
    'void main() {',
    '  vec3 warm = vec3(0.95, 0.72, 0.30);', // amber/gold mote
    '  float dist = length(gl_PointCoord - vec2(0.5));',
    '  if (dist > 0.5) discard;',
    '  float glow = 1.0 - dist * 2.0;',
    '  gl_FragColor = vec4(warm, glow * vAlpha);',
    '}'
  ].join('\n');

  var sparkleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: { value: parseFloat(resH) }
    },
    vertexShader: SPARKLE_VERT,
    fragmentShader: SPARKLE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  var sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  scene.add(sparkles);

  // ─── Ghost Figures (Tsuno Daishi) ──────────────────────────
  var GHOST_FRAG = [
    'uniform sampler2D uTexture;',
    'uniform float uTime;',
    'uniform vec3 uTint;',
    'uniform float uAlpha;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  uv.x += sin(uv.y * 4.0 + uTime * 1.5) * 0.06;',
    '  vec4 texColor = texture2D(uTexture, uv);',
    '  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));',
    '  float mask = 1.0 - lum;',
    '  vec3 color = uTint * mask * uAlpha;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  // ─── Tsuno Daishi — Shopkeeper ──────────────────────────────
  var tsunoMesh = null;
  var tsunoState = 'idle'; // idle | transitioning-out | orbiting | returning
  var tsunoActivated = false; // true after first product selection — personality system engages
  var tsunoTransition = { progress: 0, startPos: null, endPos: null };

  // Idle position: left side of viewport, inline with selected product
  // v2 — positive x = screen-left confirmed
  var TSUNO_IDLE_POS = { x: 4.0, y: 0.0, z: 6 };
  // Product page: Tsuno starts in a calm resting position near portal edge
  var tsunoProductPageMode = config.cameraPreset === 'product';
  var tsunoLoginPageMode = config.cameraPreset === 'login';
  // Storefront pages (collection / search / list / cart): no hero scroll to
  // fire jj:tsuno-wake, so engage the personality system on load like the
  // product page does — Tsuno should be awake and moving, not dormant idle.
  var tsunoStorefrontMode = config.tsunoActive === true;
  var TSUNO_PRODUCT_POS = { x: 2.5, y: -0.5, z: 8 };
  var TSUNO_LOGIN_POS = { x: 0, y: 0.5, z: 3 };
  var tsunoLastFlipTime = 0;
  var TSUNO_FLIP_THROTTLE = 0.3;
  var TSUNO_ORBIT_RADIUS = 2.0;
  var TSUNO_ORBIT_SPEED = 0.2;
  var TSUNO_ORBIT_Z = 16;
  var TSUNO_TRANSITION_DURATION = 1.5; // seconds
  var tsunoOrbitAngleOffset = 0; // syncs orbit start to transition end

  // Talk-bounce state — disabled (kept for API compat, no visual effect)
  var tsunoTalking = false;

  // ─── Tsuno Personality System ─────────────────────────────
  var TSUNO_MOODS = {
    //        0=Sun       1=Mon       2=Tue      3=Wed          4=Thu       5=Fri       6=Sat
    names:   ['shy',     'curious',  'lazy',    'mischievous', 'watchful', 'energetic','dreamy'],
    // Movement speed multiplier
    speed:   [0.6,        1.0,        0.5,       1.4,           0.8,        1.3,        0.6],
    // Behavior change interval range [min, max] in seconds
    interval:[[15,25],    [12,20],    [18,30],   [10,18],       [14,22],    [8,15],     [16,28]],
    // Mouse sensitivity (0 = ignore, 1 = normal)
    mouseSensitivity: [0.3, 1.0, 0.2, 0.8, 1.0, 0.7, 0.15],
    // Reaction style: 'shy' | 'curious' | 'lazy' | 'playful'
    reactionStyle: ['shy', 'curious', 'lazy', 'playful', 'curious', 'playful', 'shy'],
    // Visual: glow alpha multiplier
    glowMult: [0.6, 1.1, 0.7, 1.0, 1.0, 1.2, 0.8],
    // Visual: tint vec3 [r, g, b]. Spread across the approved phosphor
    // palette so each day reads as a distinct emotion (cyan stays reserved
    // for the CD format indicator — never used here).
    tint: [
      [0.70, 0.10, 0.12],  // Sun shy        — faint dim red, withdrawn
      [1.0,  0.45, 0.12],  // Mon curious    — bright warm amber-orange
      [0.55, 0.16, 0.08],  // Tue lazy       — muted low-energy ember
      [0.95, 0.20, 0.65],  // Wed mischievous— magenta
      [0.35, 0.95, 0.30],  // Thu watchful   — green phosphor
      [1.0,  0.78, 0.15],  // Fri energetic  — bright gold
      [0.55, 0.30, 0.88]   // Sat dreamy     — soft cool purple
    ],
    // Visual: bob amplitude
    bobAmp:  [0.08, 0.18, 0.1,  0.2,  0.15, 0.25, 0.12],
    // Visual: bob frequency (Hz)
    bobFreq: [0.35, 0.5,  0.4,  0.7,  0.45, 0.8,  0.3],
    // Visual: sway amplitude (x-axis oscillation)
    swayAmp: [0.03, 0.06, 0.04, 0.08, 0.0,  0.05, 0.15],
    // Visual: base tilt (radians, positive = lean right)
    baseTilt:[0.12, -0.09,0.0,  0.0,  0.0,  0.0, -0.05],
    // Behavior weights [hang, peek, loom, patrol, perch, sink, circle, retreat]
    // Behavior weights [hang, peek, loom, patrol, perch, sink, circle, retreat]
    // hang is kept low so Tsuno moves around noticeably
    weights: [
      [0.3, 3,   0.2, 0.5, 1,   1,   1,   3  ],  // shy
      [0.5, 1,   3,   1,   3,   1,   1,   0.2],  // curious
      [1,   0.5, 0.5, 0.5, 1,   2,   1,   1  ],  // lazy
      [0.2, 3,   1,   3,   1,   1,   1,   0.5],  // mischievous
      [1,   1,   1,   1,   3,   0.5, 1,   0.3],  // watchful
      [0.3, 1,   1,   3,   1,   0.5, 3,   1  ],  // energetic
      [0.5, 1,   0.3, 0.5, 1,   1,   3,   2  ]   // dreamy
    ]
  };

  function getTsunoMood() {
    return new Date().getDay(); // 0=Sun..6=Sat, indexes into TSUNO_MOODS arrays
  }

  // Behavior IDs: 0=hang, 1=peek, 2=loom, 3=patrol, 4=perch, 5=sink, 6=circle, 7=retreat
  var TSUNO_BEHAVIORS = [
    { name: 'hang',    pos: function () { return { x: 4.0, y: 0.0, z: 6 }; } },
    { name: 'peek',    pos: function () {
      var zDist = 5 - camera.position.z; // z:5 minus camera z
      var halfW = Math.tan(camera.fov * Math.PI / 360) * zDist * (camera.aspect || viewportAspect);
      return { x: halfW - 0.5, y: 0.5, z: 5 };
    }},
    { name: 'loom',    pos: function () { return { x: 1.5, y: 0.5, z: 2.5 }; } },
    { name: 'patrol',  pos: function () { return { x: 6.0, y: 0.3, z: 10 }; },
      animated: true, endX: -4.0 },
    { name: 'perch',   pos: function () { return { x: 5.0, y: -1.0, z: 6 }; } },
    { name: 'sink',    pos: function () {
      // Sink transitions to current pos (not bottom); the drop is animated in updateTsunoIdle
      var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
      var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
      var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
      return { x: cx, y: cy, z: cz };
    },
      // Bottom y is computed at runtime in the behavior animation
      bottomY: function () {
        var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
        var zDist = cz - camera.position.z;
        var halfH = Math.tan(camera.fov * Math.PI / 360) * zDist;
        return -halfH - 1.0;
      }
    },
    { name: 'circle',  pos: function () {
      var cx = tsunoMesh ? tsunoMesh.position.x : TSUNO_IDLE_POS.x;
      var cy = tsunoMesh ? tsunoMesh.position.y : TSUNO_IDLE_POS.y;
      var cz = tsunoMesh ? tsunoMesh.position.z : TSUNO_IDLE_POS.z;
      return { x: cx, y: cy, z: cz };
    }, orbital: true, radius: 1.0 },
    { name: 'retreat',  pos: function () { return { x: 2.0, y: 0.0, z: 22 }; } }
  ];

  function pickNextBehavior(moodIdx, currentIdx) {
    var weights = TSUNO_MOODS.weights[moodIdx];
    // Halve weight of current behavior to reduce immediate repeats
    var adjusted = [];
    var total = 0;
    for (var i = 0; i < weights.length; i++) {
      adjusted[i] = (i === currentIdx) ? weights[i] * 0.5 : weights[i];
      total += adjusted[i];
    }
    var roll = Math.random() * total;
    var acc = 0;
    for (var j = 0; j < adjusted.length; j++) {
      acc += adjusted[j];
      if (roll <= acc) return j;
    }
    return 0; // fallback
  }

  // ─── Personality State ────────────────────────────────────
  var tsunoMoodIdx = getTsunoMood();
  var tsunoBehaviorIdx = 0;         // current behavior index
  var tsunoBehaviorStart = 0;       // wall-clock time (s) when current behavior began
  var tsunoBehaviorDuration = 0;    // how long to linger (s)
  var tsunoTransitioning = false;   // true = easing to new behavior position
  var tsunoTransStart = 0;          // transition start time
  var tsunoTransDuration = 1.5;     // transition ease duration (s), scaled by mood speed
  var tsunoTransFrom = { x: 4, y: 0, z: 6 };
  var tsunoTransTo = { x: 4, y: 0, z: 6 };
  var tsunoGrabCallback = null;      // callback fired when grab transition completes
  // Moment cues
  var tsunoPulseStart = -1;         // arrival pulse start time (-1 = inactive)
  var tsunoShakeStart = -1;         // startle shake start time (-1 = inactive)
  // Patrol animation
  var tsunoPatrolProgress = 0;      // 0..1 progress for patrol sweep

  function getNextInterval() {
    var range = TSUNO_MOODS.interval[tsunoMoodIdx];
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  function startBehavior(t, behaviorIdx) {
    if (!tsunoMesh) return; // guard: mesh not yet loaded
    tsunoBehaviorIdx = behaviorIdx;
    tsunoBehaviorStart = t;
    tsunoBehaviorDuration = getNextInterval();
    tsunoPatrolProgress = 0;

    // Start transition from current position to behavior target
    tsunoTransitioning = true;
    tsunoTransStart = t;
    tsunoTransDuration = 1.5 / TSUNO_MOODS.speed[tsunoMoodIdx];
    tsunoTransFrom.x = tsunoMesh.position.x;
    tsunoTransFrom.y = tsunoMesh.position.y;
    tsunoTransFrom.z = tsunoMesh.position.z;
    var target = TSUNO_BEHAVIORS[behaviorIdx].pos();
    tsunoTransTo.x = target.x;
    tsunoTransTo.y = target.y;
    tsunoTransTo.z = target.z;
  }

  function updateTsunoIdle(t) {
    if (!tsunoMesh) return;

    if (tsunoLoginPageMode) {
      if (t - tsunoLastFlipTime > 2.0 + Math.sin(t * 0.7) * 1.5) {
        tsunoLastFlipTime = t;
        tsunoMesh.scale.x = tsunoMesh.scale.x > 0 ? -3.5 : 3.5;
      }
      var sx = tsunoMesh.scale.x > 0 ? 3.5 : -3.5;
      tsunoMesh.scale.set(sx, 3.5, 1);
      tsunoMesh.position.x = TSUNO_LOGIN_POS.x + Math.sin(t * 0.15) * 0.3;
      tsunoMesh.position.y = TSUNO_LOGIN_POS.y + Math.sin(t * 0.22) * 0.15;
      tsunoMesh.position.z = TSUNO_LOGIN_POS.z;
      tsunoMesh.material.uniforms.uAlpha.value = 0.6;
      tsunoMesh.lookAt(camera.position);
      return;
    }

    // Before first product selection: gentle idle bob at the fixed idle
    // position — but flavored by the day's mood (tint/glow/bob/sway/tilt)
    // so the daily personality reads immediately, before Tsuno roams.
    if (!tsunoActivated) {
      var im = tsunoMoodIdx;
      var iTint = TSUNO_MOODS.tint[im];
      tsunoMesh.scale.set(-1, 1, 1);
      tsunoMesh.position.x = TSUNO_IDLE_POS.x + Math.sin(t * 0.3) * TSUNO_MOODS.swayAmp[im];
      tsunoMesh.position.y = TSUNO_IDLE_POS.y + Math.sin(t * TSUNO_MOODS.bobFreq[im] * 2 * Math.PI) * TSUNO_MOODS.bobAmp[im];
      tsunoMesh.position.z = TSUNO_IDLE_POS.z;
      tsunoMesh.material.uniforms.uTint.value.set(iTint[0], iTint[1], iTint[2]);
      tsunoMesh.material.uniforms.uAlpha.value = 0.8 * TSUNO_MOODS.glowMult[im];
      tsunoMesh.lookAt(camera.position);
      tsunoMesh.rotateZ(TSUNO_MOODS.baseTilt[im]);
      return;
    }

    // Judging animation manages its own scale (flips); skip normal scale reset
    if (tsunoJudging) {
      updateTsunoJudging(t);
      return;
    }

    // Reset scale each frame (preserving horizontal flip); pulse/mouse may override below
    tsunoMesh.scale.set(-1, 1, 1);

    var mood = tsunoMoodIdx;
    var speed = TSUNO_MOODS.speed[mood];
    var bobAmp = TSUNO_MOODS.bobAmp[mood];
    var bobFreq = TSUNO_MOODS.bobFreq[mood];
    var swayAmp = TSUNO_MOODS.swayAmp[mood];
    var baseTilt = TSUNO_MOODS.baseTilt[mood];

    // ── Check if it's time to pick a new behavior ──
    if (!tsunoTransitioning && (t - tsunoBehaviorStart) >= tsunoBehaviorDuration) {
      var nextIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
      startBehavior(t, nextIdx);
    }

    // ── Transition easing to new position ──
    if (tsunoTransitioning) {
      var tp = (t - tsunoTransStart) / tsunoTransDuration;
      if (tp >= 1.0) {
        tp = 1.0;
        tsunoTransitioning = false;
        tsunoPulseStart = t; // trigger arrival pulse
        if (tsunoGrabCallback) {
          var cb = tsunoGrabCallback;
          tsunoGrabCallback = null;
          cb();
        }
      }
      var ease = easeInOutCubic(tp);
      tsunoMesh.position.x = tsunoTransFrom.x + (tsunoTransTo.x - tsunoTransFrom.x) * ease;
      tsunoMesh.position.y = tsunoTransFrom.y + (tsunoTransTo.y - tsunoTransFrom.y) * ease;
      tsunoMesh.position.z = tsunoTransFrom.z + (tsunoTransTo.z - tsunoTransFrom.z) * ease;
    } else {
      // ── At-position idle animations per behavior ──
      var beh = TSUNO_BEHAVIORS[tsunoBehaviorIdx];
      var target = tsunoTransTo; // stable reference captured once at behavior start

      if (beh.orbital) {
        // Circle: small orbit around target position
        var cAngle = t * 0.4 * speed;
        tsunoMesh.position.x = target.x + Math.cos(cAngle) * beh.radius;
        tsunoMesh.position.y = target.y + Math.sin(cAngle) * beh.radius;
        tsunoMesh.position.z = target.z;
      } else if (beh.animated) {
        // Patrol: sweep from startX to endX (time-based, not frame-based)
        var patrolElapsed = t - tsunoBehaviorStart - tsunoTransDuration;
        var patrolTotal = tsunoBehaviorDuration - tsunoTransDuration;
        tsunoPatrolProgress = Math.min(1.0, Math.max(0, patrolElapsed / patrolTotal) * speed);
        var sweepEase = easeInOutCubic(tsunoPatrolProgress);
        tsunoMesh.position.x = target.x + (beh.endX - target.x) * sweepEase;
        tsunoMesh.position.y = target.y;
        tsunoMesh.position.z = target.z;
      } else if (beh.name === 'sink') {
        // Sink: drop down from current y, pause at bottom, rise back
        var sinkBottom = beh.bottomY();
        var sinkElapsed = t - tsunoBehaviorStart - tsunoTransDuration;
        var sinkDur = tsunoBehaviorDuration - tsunoTransDuration;
        var sinkPhase = Math.min(1.0, Math.max(0, sinkElapsed / sinkDur));
        if (sinkPhase < 0.4) {
          // Sinking down
          var downEase = easeInOutCubic(sinkPhase / 0.4);
          tsunoMesh.position.y = target.y + (sinkBottom - target.y) * downEase;
        } else if (sinkPhase < 0.6) {
          // Holding at bottom
          tsunoMesh.position.y = sinkBottom;
        } else {
          // Rising back
          var upEase = easeInOutCubic((sinkPhase - 0.6) / 0.4);
          tsunoMesh.position.y = sinkBottom + (target.y - sinkBottom) * upEase;
        }
        tsunoMesh.position.x = target.x;
        tsunoMesh.position.z = target.z;
      } else {
        // Static behaviors (hang, peek, loom, perch, retreat): bob + sway at target
        tsunoMesh.position.x = target.x + Math.sin(t * 0.3) * swayAmp;
        tsunoMesh.position.y = target.y + Math.sin(t * bobFreq * 2 * Math.PI) * bobAmp;
        tsunoMesh.position.z = target.z;
      }
    }

    // ── Apply mood visuals ──
    var tintArr = TSUNO_MOODS.tint[mood];
    tsunoMesh.material.uniforms.uTint.value.set(tintArr[0], tintArr[1], tintArr[2]);
    var alpha = 0.8 * TSUNO_MOODS.glowMult[mood];

    // Arrival pulse (scale bump over 0.3s)
    if (tsunoPulseStart >= 0) {
      var pp = (t - tsunoPulseStart) / 0.3;
      if (pp >= 1.0) {
        tsunoPulseStart = -1;
        tsunoMesh.scale.set(-1, 1, 1);
      } else {
        var bump = 1.0 + 0.05 * Math.sin(pp * Math.PI);
        tsunoMesh.scale.set(-bump, bump, 1);
      }
    }

    // Startle shake (position.x jitter over 0.2s)
    if (tsunoShakeStart >= 0) {
      var sp = (t - tsunoShakeStart) / 0.2;
      if (sp >= 1.0) {
        tsunoShakeStart = -1;
      } else {
        tsunoMesh.position.x += Math.sin(sp * Math.PI * 6) * 0.05 * (1 - sp);
      }
    }

    // Alpha with any awareness flash applied
    tsunoMesh.material.uniforms.uAlpha.value = alpha;

    // Face camera then apply tilt
    tsunoMesh.lookAt(camera.position);
    tsunoMesh.rotateZ(baseTilt);
  }

  // ─── Tsuno Mouse Interaction ──────────────────────────────
  var tsunoAwarenessAlpha = 0;       // extra alpha from awareness
  var tsunoProxCooldown = 0;         // cooldown timestamp to prevent rapid re-triggers
  var tsunoFlashStart = -1;          // awareness flash start time (-1 = inactive)
  var tsunoWasClose = false;         // was cursor close last frame (for edge detection)

  function updateTsunoMouse(mouse) {
    if (!tsunoMesh || tsunoState !== 'idle') return;
    var mood = tsunoMoodIdx;
    var sensitivity = TSUNO_MOODS.mouseSensitivity[mood];

    // ── Layer 1: Passive Awareness ──
    // Lean toward cursor (post-lookAt tilt is applied in updateTsunoIdle)
    // Here we just modulate the tilt based on mouse
    var mouseTilt = mouse.x * 0.15 * sensitivity; // up to ~8.5 degrees
    tsunoMesh.rotateZ(mouseTilt);

    // Glow brightens when cursor is on canvas side
    tsunoAwarenessAlpha = Math.abs(mouse.x) * 0.1 * sensitivity;
    tsunoMesh.material.uniforms.uAlpha.value += tsunoAwarenessAlpha;

    // ── Layer 2: Proximity Reactions ──
    var pos3 = tsunoMesh.position.clone();
    pos3.project(camera);
    var screenX = (pos3.x * 0.5 + 0.5) * window.innerWidth;
    var screenY = (-pos3.y * 0.5 + 0.5) * window.innerHeight;
    var cursorX = (mouse.x * 0.5 + 0.5) * window.innerWidth;
    var cursorY = (mouse.y * 0.5 + 0.5) * window.innerHeight;
    var dist = Math.sqrt((screenX - cursorX) * (screenX - cursorX) +
                         (screenY - cursorY) * (screenY - cursorY));

    var t = performance.now() * 0.001;
    var style = TSUNO_MOODS.reactionStyle[mood];

    // Awareness flash: trigger on entering close zone (edge detection)
    var isClose = dist < 150;
    if (isClose && !tsunoWasClose) {
      tsunoFlashStart = t;
    }
    tsunoWasClose = isClose;

    // Apply flash alpha (0.15 spike over 0.15s, ease back)
    if (tsunoFlashStart >= 0) {
      var fp = (t - tsunoFlashStart) / 0.15;
      if (fp >= 1.0) {
        tsunoFlashStart = -1;
      } else {
        tsunoMesh.material.uniforms.uAlpha.value += 0.15 * (1.0 - fp);
      }
    }

    if (dist < 60 && t > tsunoProxCooldown) {
      // Very close reaction
      tsunoProxCooldown = t + 2.0; // 2s cooldown
      if (style === 'curious') {
        // Scale up slightly, brighten
        tsunoMesh.scale.set(-1.08, 1.08, 1);
        tsunoMesh.material.uniforms.uAlpha.value += 0.15;
      } else if (style === 'playful') {
        // Dart to a new position
        var dartIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
        startBehavior(t, dartIdx);
      } else if (style === 'shy') {
        // Startle shake then retreat
        tsunoShakeStart = t;
        startBehavior(t, 7); // 7 = retreat
      } else if (style === 'lazy') {
        // Reluctant drift — pick a new behavior (usually hang or sink for lazy mood)
        var lazyIdx = pickNextBehavior(mood, tsunoBehaviorIdx);
        startBehavior(t, lazyIdx);
      }
    } else if (dist < 150 && t > tsunoProxCooldown) {
      // Close reaction
      if (style === 'curious') {
        // Lean in, glow
        tsunoMesh.rotateZ(-0.08);
        tsunoMesh.material.uniforms.uAlpha.value += 0.1;
      } else if (style === 'playful') {
        // Wiggle
        tsunoMesh.position.x += Math.sin(t * 12) * 0.03;
      } else if (style === 'shy') {
        // Gentle drift away
        tsunoMesh.position.x += 0.05 * sensitivity;
      }
      // lazy: barely reacts (no action needed)
    }
  }

  // ─── Tsuno Product Reaction ───────────────────────────────
  // When a product is selected, Tsuno sometimes reacts (moves close, judges)
  // and sometimes ignores it entirely. Mood influences the odds.
  var tsunoJudging = false;          // true = currently in judging animation
  var tsunoJudgeStart = -1;          // wall-clock time judging began
  var tsunoJudgeDuration = 0;        // total judging duration
  var tsunoJudgeFlips = 0;           // how many flips to do
  var tsunoJudgeFlipIdx = 0;         // current flip count

  // Odds of reacting to product selection by mood
  // shy=low, curious=high, lazy=low, mischievous=mid, watchful=high, energetic=high, dreamy=low
  var TSUNO_REACT_ODDS = [0.25, 0.85, 0.2, 0.5, 0.9, 0.75, 0.2];

  function tsunoOnProductSelected() {
    if (!tsunoMesh || tsunoState !== 'idle') return;
    if (tsunoProductPageMode || tsunoLoginPageMode) return;

    // First product selection activates personality system
    if (!tsunoActivated) {
      tsunoActivated = true;
      var t = performance.now() * 0.001;
      startBehavior(t, pickNextBehavior(tsunoMoodIdx, 0));
    }

    var mood = tsunoMoodIdx;
    var roll = Math.random();

    // Sometimes Tsuno doesn't care
    if (roll > TSUNO_REACT_ODDS[mood]) return;

    // Move close to user/meta box and judge
    var t = performance.now() * 0.001;
    tsunoJudging = true;
    tsunoJudgeStart = t;
    tsunoJudgeDuration = 3.0 + Math.random() * 2.0; // 3-5 seconds of judging
    tsunoJudgeFlips = 2 + Math.floor(Math.random() * 4); // 2-5 flips
    tsunoJudgeFlipIdx = 0;

    // Move to a close position near the meta box (right side, close to camera)
    tsunoTransitioning = true;
    tsunoTransStart = t;
    tsunoTransDuration = 0.8 / TSUNO_MOODS.speed[mood];
    tsunoTransFrom.x = tsunoMesh.position.x;
    tsunoTransFrom.y = tsunoMesh.position.y;
    tsunoTransFrom.z = tsunoMesh.position.z;
    // Close to camera, slightly right and up — as if peering at the product info
    tsunoTransTo.x = 3.5 + Math.random() * 1.5;
    tsunoTransTo.y = -0.5 + Math.random() * 1.0;
    tsunoTransTo.z = 3.0;
  }

  function updateTsunoJudging(t) {
    if (!tsunoJudging || !tsunoMesh) return;

    var elapsed = t - tsunoJudgeStart;

    // Judging is done — pick next idle behavior
    if (elapsed >= tsunoJudgeDuration) {
      tsunoJudging = false;
      tsunoMesh.scale.set(-1, 1, 1); // reset flip
      startBehavior(t, pickNextBehavior(tsunoMoodIdx, -1));
      return;
    }

    // Handle transition easing to judging position
    if (tsunoTransitioning) {
      var tp = (t - tsunoTransStart) / tsunoTransDuration;
      if (tp >= 1.0) {
        tp = 1.0;
        tsunoTransitioning = false;
      }
      var ease = easeInOutCubic(tp);
      tsunoMesh.position.x = tsunoTransFrom.x + (tsunoTransTo.x - tsunoTransFrom.x) * ease;
      tsunoMesh.position.y = tsunoTransFrom.y + (tsunoTransTo.y - tsunoTransFrom.y) * ease;
      tsunoMesh.position.z = tsunoTransFrom.z + (tsunoTransTo.z - tsunoTransFrom.z) * ease;
      tsunoMesh.lookAt(camera.position);
      return;
    }

    // Flip left/right at intervals during judging (scale.x toggles sign)
    var judgeElapsed = elapsed - tsunoTransDuration; // time since arriving
    var flipInterval = (tsunoJudgeDuration - tsunoTransDuration) / (tsunoJudgeFlips + 1);
    var expectedFlips = Math.floor(judgeElapsed / flipInterval);
    if (expectedFlips > tsunoJudgeFlipIdx && expectedFlips <= tsunoJudgeFlips) {
      tsunoJudgeFlipIdx = expectedFlips;
      // Toggle horizontal flip
      tsunoMesh.scale.x = tsunoMesh.scale.x > 0 ? -1 : 1;
    }

    // Subtle judging bob (slower, smaller than idle — contemplative)
    tsunoMesh.position.y = tsunoTransTo.y + Math.sin(t * 1.5) * 0.06;
    // Slight tilt as if thinking
    var thinkTilt = Math.sin(t * 0.8) * 0.1;
    tsunoMesh.lookAt(camera.position);
    tsunoMesh.rotateZ(thinkTilt);
  }

  var ghostGeo = new THREE.PlaneGeometry(1.8, 5.25);

  var ghostUrl = config.ghostTexture;
  if (ghostUrl) {
    textureLoader.load(ghostUrl, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;

      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: parseFloat(resH) },
          uTexture: { value: tex },
          uTime: { value: 0.0 },
          uTint: { value: new THREE.Vector3(1.0, 0.2, 0.08) },
          uAlpha: { value: 0.8 }
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GHOST_FRAG,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      tsunoMesh = new THREE.Mesh(ghostGeo, mat);
      tsunoMesh.scale.x = -1; // flip horizontally to face the catalogue
      var tsunoStartPos = tsunoLoginPageMode ? TSUNO_LOGIN_POS : (tsunoProductPageMode ? TSUNO_PRODUCT_POS : TSUNO_IDLE_POS);
      tsunoMesh.position.set(tsunoStartPos.x, tsunoStartPos.y, tsunoStartPos.z);
      scene.add(tsunoMesh);

      // Update the pre-created tsuno API with real references
      if (window.JJ_Portal && window.JJ_Portal.tsuno) {
        window.JJ_Portal.tsuno.mesh = tsunoMesh;
        window.JJ_Portal.tsuno.getState = function () { return tsunoState; };
        window.JJ_Portal.tsuno.setState = function (state) { setTsunoState(state); };
        window.JJ_Portal.tsuno.onProductSelected = function () { tsunoOnProductSelected(); };
        window.JJ_Portal.tsuno.onProductDeselected = function () {
          if (tsunoJudging) {
            tsunoJudging = false;
            tsunoMesh.scale.set(-1, 1, 1);
            var t = performance.now() * 0.001;
            startBehavior(t, pickNextBehavior(tsunoMoodIdx, -1));
          }
        };
      }

      // Place Tsuno at idle position — personality system activates on first product selection
      tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);

      // On the product page there is no "first product selection" to activate
      // the personality system, so bootstrap the floating idle immediately.
      if (tsunoLoginPageMode) {
        tsunoMesh.scale.set(-3.5, 3.5, 1);
        tsunoMesh.position.set(TSUNO_LOGIN_POS.x, TSUNO_LOGIN_POS.y, TSUNO_LOGIN_POS.z);
        tsunoMesh.material.uniforms.uAlpha.value = 0.6;
      } else if (tsunoProductPageMode || tsunoStorefrontMode) {
        tsunoActivated = true;
        var tInit = performance.now() * 0.001;
        startBehavior(tInit, pickNextBehavior(tsunoMoodIdx, 0));
      }
    });
  }

  if (tsunoLoginPageMode) {
    document.addEventListener('jj-auth-keystroke', function () {
      if (!tsunoMesh) return;
      var now = performance.now() * 0.001;
      if (now - tsunoLastFlipTime < TSUNO_FLIP_THROTTLE) return;
      if (Math.random() < 0.4) return;
      tsunoLastFlipTime = now;
      tsunoMesh.scale.x = tsunoMesh.scale.x > 0 ? -3.5 : 3.5;
    });
  }

  // ─── Speech Bubble (3D, same shader as Tsuno) ──────────────
  var BUBBLE_FRAG = [
    'uniform sampler2D uTexture;',
    'uniform vec3 uTint;',
    'uniform float uAlpha;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));',
    '  float mask = 1.0 - lum;',
    '  vec3 color = uTint * mask * uAlpha;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  var bubbleCanvas = document.createElement('canvas');
  bubbleCanvas.width = 256;
  bubbleCanvas.height = 64;
  var bubbleCtx = bubbleCanvas.getContext('2d');

  var bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
  bubbleTex.minFilter = THREE.NearestFilter;
  bubbleTex.magFilter = THREE.NearestFilter;

  // Separate canvas for text only (rendered with white tint for readability)
  var textCanvas = document.createElement('canvas');
  textCanvas.width = 256;
  textCanvas.height = 64;
  var textCtx = textCanvas.getContext('2d');

  var textTex = new THREE.CanvasTexture(textCanvas);
  textTex.minFilter = THREE.NearestFilter;
  textTex.magFilter = THREE.NearestFilter;

  var bubbleGeo = new THREE.PlaneGeometry(3.2, 0.8);

  // Frame mesh — same tint as Tsuno
  var bubbleMat = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: parseFloat(resH) },
      uTexture: { value: bubbleTex },
      uTint: { value: new THREE.Vector3(1.0, 0.2, 0.08) },
      uAlpha: { value: 0.8 }
    },
    vertexShader: GLOW_VERT,
    fragmentShader: BUBBLE_FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  var bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
  bubbleMesh.visible = false;
  scene.add(bubbleMesh);

  // Text mesh — white tint for visibility
  var textMat = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: parseFloat(resH) },
      uTexture: { value: textTex },
      uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uAlpha: { value: 0.9 }
    },
    vertexShader: GLOW_VERT,
    fragmentShader: BUBBLE_FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  var textMesh = new THREE.Mesh(bubbleGeo, textMat);
  textMesh.visible = false;
  scene.add(textMesh);

  // Bubble offset from Tsuno (3D units)
  var BUBBLE_OFFSET = { x: -2.0, y: 2.0, z: 0 };

  function drawBubble(text) {
    var ctx = bubbleCtx;
    var w = bubbleCanvas.width;
    var h = bubbleCanvas.height;
    var b = 3; // border thickness
    var step = 4; // corner step size
    var tailW = 8;
    var tailH = 10;
    var tailX = 20;

    // Clear to white (white = transparent in ghost shader)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    // Draw bubble border (medium gray = dimmer than text in ghost shader)
    ctx.fillStyle = '#666';

    // Top border (inset by step at corners)
    ctx.fillRect(step, 0, w - step * 2, b);
    // Bottom border (inset by step at corners)
    ctx.fillRect(step, h - tailH - b, w - step * 2, b);
    // Left border (inset by step at corners)
    ctx.fillRect(0, step, b, h - tailH - step * 2);
    // Right border (inset by step at corners)
    ctx.fillRect(w - b, step, b, h - tailH - step * 2);

    // Corner steps (top-left)
    ctx.fillRect(step - b, b, b, step - b);
    ctx.fillRect(b, step - b, step - b, b);
    // Corner steps (top-right)
    ctx.fillRect(w - step, b, b, step - b);
    ctx.fillRect(w - step, step - b, step - b, b);
    // Corner steps (bottom-left)
    ctx.fillRect(step - b, h - tailH - step, b, step - b);
    ctx.fillRect(b, h - tailH - step, step - b, b);
    // Corner steps (bottom-right)
    ctx.fillRect(w - step, h - tailH - step, b, step - b);
    ctx.fillRect(w - step, h - tailH - step, step - b, b);

    // Pixel-art tail (bottom-left, stepping down-left)
    ctx.fillRect(tailX, h - tailH, b, tailH - 6);
    ctx.fillRect(tailX + tailW, h - tailH, b, tailH - 6);
    ctx.fillRect(tailX - 3, h - 6, b, 3);
    ctx.fillRect(tailX + tailW - 3, h - 6, b, 3);
    ctx.fillRect(tailX - 6, h - 3, b + 3, b);

    // Subtle fill inside bubble (nearly invisible in shader)
    ctx.fillStyle = '#ddd';
    ctx.fillRect(b, step, w - b * 2, h - tailH - step * 2);

    bubbleTex.needsUpdate = true;

    // Draw text on separate canvas with CRT phosphor glow
    var tc = textCtx;
    tc.fillStyle = '#fff';
    tc.fillRect(0, 0, w, h);

    var tx = w / 2;
    var ty = (h - tailH) / 2;
    var str = text || '';
    tc.font = 'bold 22px "Fixedsys Excelsior 3.01", monospace';
    tc.textAlign = 'center';
    tc.textBaseline = 'middle';

    // Layered glow passes (wide → narrow blur, light → dark)
    tc.shadowOffsetX = 0;
    tc.shadowOffsetY = 0;

    tc.shadowColor = 'rgba(0,0,0,0.15)';
    tc.shadowBlur = 20;
    tc.fillStyle = '#fff';
    tc.fillText(str, tx, ty);

    tc.shadowColor = 'rgba(0,0,0,0.3)';
    tc.shadowBlur = 10;
    tc.fillStyle = '#fff';
    tc.fillText(str, tx, ty);

    tc.shadowColor = 'rgba(0,0,0,0.5)';
    tc.shadowBlur = 4;
    tc.fillStyle = '#fff';
    tc.fillText(str, tx, ty);

    // Solid text on top (no shadow)
    tc.shadowBlur = 0;
    tc.fillStyle = '#000';
    tc.fillText(str, tx, ty);

    textTex.needsUpdate = true;
  }

  function updateBubblePosition() {
    if (!tsunoMesh || !bubbleMesh.visible) return;
    var bx = tsunoMesh.position.x + BUBBLE_OFFSET.x;
    var by = tsunoMesh.position.y + BUBBLE_OFFSET.y;
    var bz = tsunoMesh.position.z + BUBBLE_OFFSET.z;
    bubbleMesh.position.set(bx, by, bz);
    bubbleMesh.lookAt(camera.position);
    // Text slightly in front to avoid z-fighting
    textMesh.position.set(bx, by, bz - 0.01);
    textMesh.lookAt(camera.position);
  }

  function setTsunoState(newState) {
    if (!tsunoMesh || tsunoState === newState) return;

    tsunoState = newState;
    tsunoTransition.progress = 0;

    if (newState === 'transitioning-out') {
      tsunoTransition.startPos = {
        x: tsunoMesh.position.x,
        y: tsunoMesh.position.y,
        z: tsunoMesh.position.z
      };
      // End exactly where orbit angle 0 starts, so there's no snap
      tsunoTransition.endPos = { x: TSUNO_ORBIT_RADIUS, y: 0, z: TSUNO_ORBIT_Z };
    } else if (newState === 'returning') {
      tsunoTransition.startPos = {
        x: tsunoMesh.position.x,
        y: tsunoMesh.position.y,
        z: tsunoMesh.position.z
      };
      tsunoTransition.endPos = {
        x: TSUNO_IDLE_POS.x,
        y: TSUNO_IDLE_POS.y,
        z: TSUNO_IDLE_POS.z
      };
    }
  }

  // ─── Wake on scroll to grid ───────────────────────────────────
  // The grid scroll handler dispatches jj:tsuno-wake the first time the
  // user reaches the grid. Treat it like a first product selection: engage
  // the personality system with a deliberate "peek" wake gesture. No-op if
  // Tsuno is already activated, not idle, or on the product/login pages.
  document.addEventListener('jj:tsuno-wake', function () {
    if (!tsunoMesh || tsunoState !== 'idle') return;
    if (tsunoProductPageMode || tsunoLoginPageMode) return;
    if (tsunoActivated) return;

    tsunoActivated = true;
    var t = performance.now() * 0.001;
    startBehavior(t, 1);   // 1 = peek — the wake gesture
    tsunoPulseStart = t;   // immediate arrival-pulse pop for emphasis
  });

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function updateTsuno(t, dt) {
    if (!tsunoMesh) return;

    tsunoMesh.material.uniforms.uTime.value = t;

    if (tsunoState === 'idle') {
      updateTsunoIdle(t);

    } else if (tsunoState === 'transitioning-out') {
      tsunoTransition.progress += dt / TSUNO_TRANSITION_DURATION;
      if (tsunoTransition.progress >= 1.0) {
        tsunoTransition.progress = 1.0;
        tsunoState = 'orbiting';
        // Sync orbit so it starts at angle 0 (exactly where transition ended)
        tsunoOrbitAngleOffset = -t * TSUNO_ORBIT_SPEED;
      }
      var ease = easeInOutCubic(tsunoTransition.progress);
      var sp = tsunoTransition.startPos;
      var ep = tsunoTransition.endPos;
      tsunoMesh.position.x = sp.x + (ep.x - sp.x) * ease;
      tsunoMesh.position.y = sp.y + (ep.y - sp.y) * ease;
      tsunoMesh.position.z = sp.z + (ep.z - sp.z) * ease;
      // Gradually face toward vortex center during transition
      tsunoMesh.lookAt(0, 0, 30);

    } else if (tsunoState === 'orbiting') {
      var angle = t * TSUNO_ORBIT_SPEED + tsunoOrbitAngleOffset;
      tsunoMesh.position.x = Math.cos(angle) * TSUNO_ORBIT_RADIUS;
      tsunoMesh.position.y = Math.sin(angle) * TSUNO_ORBIT_RADIUS;
      tsunoMesh.position.z = TSUNO_ORBIT_Z + Math.sin(t * 0.3) * 1.5;
      // Face the user (camera) while orbiting
      tsunoMesh.lookAt(camera.position);

    } else if (tsunoState === 'returning') {
      tsunoTransition.progress += dt / TSUNO_TRANSITION_DURATION;
      if (tsunoTransition.progress >= 1.0) {
        tsunoTransition.progress = 1.0;
        tsunoState = 'idle';
        startBehavior(t, pickNextBehavior(tsunoMoodIdx, -1));
      }
      var ease = easeInOutCubic(tsunoTransition.progress);
      var sp = tsunoTransition.startPos;
      var ep = tsunoTransition.endPos;
      tsunoMesh.position.x = sp.x + (ep.x - sp.x) * ease;
      tsunoMesh.position.y = sp.y + (ep.y - sp.y) * ease;
      tsunoMesh.position.z = sp.z + (ep.z - sp.z) * ease;
      tsunoMesh.lookAt(camera.position);
    }
  }



  // ─── Offscreen Render Target ──────────────────────────────────
  var renderTarget = new THREE.WebGLRenderTarget(resW, resH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat
  });

  // Display canvas (2D) — the visible output
  var displayCanvas = document.createElement('canvas');
  displayCanvas.width = resW;
  displayCanvas.height = resH;
  var displayCtx = displayCanvas.getContext('2d');
  var displayImageData = displayCtx.createImageData(resW, resH);

  // Pixel readback buffer
  var pixelBuffer = new Uint8Array(resW * resH * 4);

  // Hide the WebGL canvas, show the 2D display canvas
  canvas.style.display = 'none';

  displayCanvas.id = 'jj-screensaver-display';
  displayCanvas.setAttribute('aria-hidden', 'true');
  displayCanvas.tabIndex = -1;
  // Size to effective viewport (divide by CSS zoom so it doesn't overflow).
  // 100vw/vh are pre-zoom CSS px — at zoom 1.5 they'd render 1.5× the viewport.
  var cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var canvasW = Math.round(window.innerWidth / cssZoom);
  var canvasH = Math.round(window.innerHeight / cssZoom);
  displayCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:' + canvasW + 'px',
    'height:' + canvasH + 'px',
    'z-index:0', 'pointer-events:none',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges'
  ].join(';');
  canvas.parentNode.insertBefore(displayCanvas, canvas.nextSibling);

  // Camera sees both layers by default
  camera.layers.enable(0);
  camera.layers.enable(1);

  // ─── Render one frame (reusable) ─────────────────────────────
  function renderOneFrame() {
    camera.layers.set(0);
    renderer.setClearColor(mainClearColor, 1);
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    var prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(waxScene, waxCamera); // wax fills the frame first
    renderer.render(scene, camera);       // bubbles + Tsuno on top
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }
    displayCtx.putImageData(displayImageData, 0, 0);
  }

  // ─── Mouse Parallax ──────────────────────────────────────────
  var parallaxEnabled = true;
  var mouseNorm = { x: 0, y: 0 };
  var parallaxOffset = { x: 0, y: 0 };
  var MAX_PARALLAX = 0.5;
  var PARALLAX_LERP = 0.05;
  var LOOK_TARGET = { x: cameraPreset.look[0], y: cameraPreset.look[1], z: cameraPreset.look[2] };
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  if (config.mouseInteraction !== false && !isMobile) {
    window.addEventListener('mousemove', function (e) {
      mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    document.addEventListener('mouseleave', function () {
      mouseNorm.x = 0;
      mouseNorm.y = 0;
    });
  }

  function updateParallax() {
    if (!parallaxEnabled) return;
    parallaxOffset.x += (mouseNorm.x * MAX_PARALLAX - parallaxOffset.x) * PARALLAX_LERP;
    parallaxOffset.y += (mouseNorm.y * MAX_PARALLAX - parallaxOffset.y) * PARALLAX_LERP;
  }

  // ─── Performance Safeguards ───────────────────────────────────
  var pauseReasons = { hidden: false, scrolled: false };

  function isPaused() {
    return pauseReasons.hidden || pauseReasons.scrolled;
  }

  function resumeIfNeeded() {
    if (!isPaused()) {
      lastFrame = performance.now();
      requestAnimationFrame(animate);
    }
  }

  document.addEventListener('visibilitychange', function () {
    pauseReasons.hidden = document.hidden;
    resumeIfNeeded();
  });

  // Scroll sentinel — pause when user scrolls past the fold.
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:fixed;bottom:0;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(sentinel);

  if (window.IntersectionObserver) {
    var scrollObserver = new IntersectionObserver(function (entries) {
      pauseReasons.scrolled = !entries[0].isIntersecting;
      resumeIfNeeded();
    }, { threshold: 0 });
    scrollObserver.observe(sentinel);
  }

  // ─── Animation Loop ──────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var throttledInterval = 1000 / 18; // 18fps during product viewing
  var productViewing = false;
  var lastFrame = 0;

  function animate(time) {
    requestAnimationFrame(animate);
    if (isPaused()) return;

    var interval = productViewing ? throttledInterval : targetInterval;
    if (time - lastFrame < interval) return;
    lastFrame = time;

    // Update shader time uniforms
    var t = time * 0.001;
    updateWax(t, interval / 1000);
    sparkles.material.uniforms.uTime.value = t;

    // Update Tsuno Daishi
    updateTsuno(t, targetInterval / 1000);
    updateBubblePosition();

    // Tsuno mouse interaction (idle only, desktop only, when mouse interaction is enabled)
    if (tsunoState === 'idle' && !isMobile && config.mouseInteraction !== false) {
      updateTsunoMouse(mouseNorm);
    }

    // Update parallax
    updateParallax();
    var lookX = LOOK_TARGET.x + parallaxOffset.x;
    var lookY = LOOK_TARGET.y - parallaxOffset.y;
    camera.lookAt(lookX, lookY, LOOK_TARGET.z);

    renderOneFrame();
  }

  // ─── Public API ──────────────────────────────────────────────
  var tsunoApi = {
    mesh: null,
    getState: function () { return 'idle'; },
    setState: function () {}
  };

  window.JJ_Portal = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    renderTarget: renderTarget,
    displayCanvas: displayCanvas,
    displayCtx: displayCtx,
    resW: resW,
    resH: resH,
    tsuno: tsunoApi,
    setParallaxEnabled: function (enabled) {
      parallaxEnabled = enabled;
      if (!enabled) {
        parallaxOffset.x = 0;
        parallaxOffset.y = 0;
      }
    },
    setProductViewing: function (viewing) {
      productViewing = !!viewing;
    },
    setTalking: function (talking) {
      tsunoTalking = !!talking;
    },
    setBubbleText: function (text) {
      drawBubble(text);
    },
    setBubbleVisible: function (visible) {
      bubbleMesh.visible = !!visible;
      textMesh.visible = !!visible;
    },
    triggerTsunoGrab: function (cb) {
      if (!tsunoMesh || tsunoProductPageMode || tsunoLoginPageMode) {
        if (cb) setTimeout(cb, 200);
        return;
      }
      // Cancel any in-progress judging animation
      if (tsunoJudging) tsunoJudging = false;
      // Move Tsuno toward the product viewer canvas area
      tsunoTransitioning = true;
      var t = performance.now() * 0.001;
      tsunoTransStart = t;
      tsunoTransDuration = 0.5;
      tsunoTransFrom.x = tsunoMesh.position.x;
      tsunoTransFrom.y = tsunoMesh.position.y;
      tsunoTransFrom.z = tsunoMesh.position.z;
      tsunoTransTo.x = 1.0;
      tsunoTransTo.y = 0.0;
      tsunoTransTo.z = 3.0;
      // Prevent behavior scheduler from interrupting the grab
      tsunoBehaviorStart = t;
      tsunoBehaviorDuration = 2.0;
      // Fire callback when transition completes (tied to rAF, not wall clock)
      tsunoGrabCallback = cb || null;
    }
  };

  // ─── Reduced Motion: Static Frame ─────────────────────────────
  if (prefersReducedMotion) {
    updateWax(0, 0.016);
    renderOneFrame();
    return;
  }

  // ─── Init ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }

  } // end init()

  // If splash is active, defer initialization; otherwise start immediately
  if (window.JJ_SPLASH_ACTIVE) {
    window.JJ_Portal_Init = init;
  } else {
    init();
  }
})();
