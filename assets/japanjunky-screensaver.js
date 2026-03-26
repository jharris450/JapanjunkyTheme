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
  camera.position.set(0, 0, -1);
  camera.lookAt(0, 0, 30);

  // ─── Swirl Speed ─────────────────────────────────────────────
  var SWIRL_SPEEDS = { slow: 0.3, medium: 0.6, fast: 1.0 };
  var swirlSpeed = SWIRL_SPEEDS[config.orbitSpeed] || SWIRL_SPEEDS.slow;

  // ─── Portal Tunnel ───────────────────────────────────────────
  var TUNNEL_VERT = [
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
    '  vec3 c1 = vec3(0.4, 0.05, 0.02);',
    '  vec3 c2 = vec3(0.85, 0.35, 0.05);',
    '  vec3 c3 = vec3(0.95, 0.75, 0.3);',
    '  vec3 color = mix(c1, c2, smoothstep(0.0, 0.5, pattern));',
    '  color = mix(color, c3, smoothstep(0.5, 1.0, pattern));',
    '',
    '  float falloff = smoothstep(0.0, 0.12, depth) * smoothstep(1.0, 0.6, depth);',
    '  color *= 0.4 + 0.6 * falloff;',
    '',
    '  float glow = smoothstep(0.75, 1.0, depth);',
    '  color += vec3(0.95, 0.75, 0.5) * glow * 0.3;',
    '',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  var textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = 'anonymous';

  function buildTunnel() {
    var geo = new THREE.CylinderGeometry(3, 3, 40, 12, 20, true);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 },
        uSwirlSpeed: { value: swirlSpeed }
      },
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    var tunnel = new THREE.Mesh(geo, mat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.set(0, 0, 18);
    scene.add(tunnel);
    return tunnel;
  }

  var tunnel = buildTunnel();

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
    '  vec3 color = mix(vec3(0.8, 0.1, 0.0), vec3(0.95, 0.85, 0.7), glow);',
    '',
    '  gl_FragColor = vec4(color * intensity, intensity);',
    '}'
  ].join('\n');

  function buildGlow() {
    var geo = new THREE.PlaneGeometry(4, 4);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var glow = new THREE.Mesh(geo, mat);
    glow.position.set(0, 0, 36);
    scene.add(glow);
    return glow;
  }

  var glow = buildGlow();

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

  var SPARKLE_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform float uResolution;',
    'varying float vAlpha;',
    '',
    'void main() {',
    '  float twinkle = sin(uTime * 3.0 + aPhase) * 0.5 + 0.5;',
    '  vAlpha = pow(twinkle, 3.0);',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (20.0 / -viewPos.z);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var SPARKLE_FRAG = [
    'varying float vAlpha;',
    '',
    'void main() {',
    '  float dist = length(gl_PointCoord - vec2(0.5));',
    '  if (dist > 0.5) discard;',
    '  float glow = 1.0 - dist * 2.0;',
    '  gl_FragColor = vec4(0.95, 0.85, 0.7, glow * vAlpha);',
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

  // ─── Portal Rings ──────────────────────────────────────────
  var RING_FRAG = [
    'uniform float uHue;',
    'varying vec2 vUv;',
    '',
    'vec3 flamePalette(float t) {',
    '  t = fract(t);',
    '  vec3 c0 = vec3(0.1, 0.02, 0.0);',
    '  vec3 c1 = vec3(0.7, 0.05, 0.0);',
    '  vec3 c2 = vec3(0.95, 0.2, 0.05);',
    '  vec3 c3 = vec3(0.95, 0.85, 0.7);',
    '  vec3 c4 = vec3(0.85, 0.55, 0.1);',
    '  float s = t * 5.0;',
    '  vec3 c = mix(c0, c1, clamp(s, 0.0, 1.0));',
    '  c = mix(c, c2, clamp(s - 1.0, 0.0, 1.0));',
    '  c = mix(c, c3, clamp(s - 2.0, 0.0, 1.0));',
    '  c = mix(c, c4, clamp(s - 3.0, 0.0, 1.0));',
    '  c = mix(c, c0, clamp(s - 4.0, 0.0, 1.0));',
    '  return c;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv) * 2.0;',
    '  float ring = smoothstep(0.6, 0.78, dist) * smoothstep(1.0, 0.88, dist);',
    '  vec3 color = flamePalette(uHue);',
    '  gl_FragColor = vec4(color * 1.0, ring);',
    '}'
  ].join('\n');

  var PORTAL_RING_COUNT = 6;
  var portalRings = [];
  var ringGeo = new THREE.PlaneGeometry(5.6, 5.6);

  for (var ri = 0; ri < PORTAL_RING_COUNT; ri++) {
    var ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uHue: { value: ri / PORTAL_RING_COUNT }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = 4 + ri * 5;
    ringMesh.userData.rotSpeed = (0.3 + ri * 0.15) * (ri % 2 === 0 ? 1 : -1);
    scene.add(ringMesh);
    portalRings.push(ringMesh);
  }

  // ─── Vortex Swirl Backdrop ─────────────────────────────────
  var BACKDROP_FRAG = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  vec3 color = texColor.rgb * 0.2;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  var vortexBackdrop = null;
  var swirlUrl = config.swirlTexture;
  if (swirlUrl) {
    textureLoader.load(swirlUrl, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      var geo = new THREE.PlaneGeometry(7, 7);
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: parseFloat(resH) },
          uTexture: { value: tex }
        },
        vertexShader: GLOW_VERT,
        fragmentShader: BACKDROP_FRAG,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      vortexBackdrop = new THREE.Mesh(geo, mat);
      vortexBackdrop.position.set(0, 0, 37);
      scene.add(vortexBackdrop);
    });
  }

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
  var tsunoTransition = { progress: 0, startPos: null, endPos: null };

  // Idle position: left side of viewport, inline with selected product
  // v2 — positive x = screen-left confirmed
  var TSUNO_IDLE_POS = { x: 4.0, y: 0.0, z: 6 };
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
    // Visual: tint vec3 [r, g, b]
    tint: [
      [0.85, 0.15, 0.15],  // shy — faint red
      [1.0,  0.25, 0.1],   // curious — warm orange
      [0.9,  0.18, 0.08],  // lazy — muted base
      [1.0,  0.35, 0.05],  // mischievous — amber
      [1.0,  0.2,  0.08],  // watchful — base tint
      [1.0,  0.3,  0.1],   // energetic — bright warm
      [0.8,  0.15, 0.2]    // dreamy — cooler purple-ish
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
      tsunoMesh.position.set(TSUNO_IDLE_POS.x, TSUNO_IDLE_POS.y, TSUNO_IDLE_POS.z);
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

      // Start first idle behavior — exclude hang (0) so first action is visibly different
      startBehavior(performance.now() * 0.001, pickNextBehavior(tsunoMoodIdx, 0));
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

  // ─── PS1 Textured Material ───────────────────────────────────
  var TEX_VERT = [
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

  var TEX_FRAG = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  gl_FragColor = texture2D(uTexture, vUv);',
    '}'
  ].join('\n');

  function makeTextureMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTexture: { value: texture }
      },
      vertexShader: TEX_VERT,
      fragmentShader: TEX_FRAG,
      side: THREE.DoubleSide,
      depthWrite: true
    });
  }

  // ─── Flying Objects ──────────────────────────────────────────
  var TUNNEL_RADIUS = 3;
  var SPAWN_RADIUS = TUNNEL_RADIUS * 0.7;
  var SPAWN_Z = -2;
  var DESPAWN_Z = 36;
  var OBJECT_SIZE = 0.4;
  var SPAWN_INTERVAL = 2500;
  var MAX_OBJECTS = 5;

  var flyingObjects = [];
  var loadedTextures = [];
  var lastSpawnTime = 0;
  var objectGeo = new THREE.PlaneGeometry(OBJECT_SIZE, OBJECT_SIZE);

  var textureUrls = config.textures || [];

  for (var ti = 0; ti < textureUrls.length; ti++) {
    (function (url) {
      textureLoader.load(url, function (tex) {
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        loadedTextures.push(tex);
      });
    })(textureUrls[ti]);
  }

  function spawnObject(time) {
    if (loadedTextures.length === 0) return;
    if (flyingObjects.length >= MAX_OBJECTS) return;
    if (time - lastSpawnTime < SPAWN_INTERVAL) return;

    lastSpawnTime = time;

    var tex = loadedTextures[Math.floor(Math.random() * loadedTextures.length)];
    var mat = makeTextureMaterial(tex);
    var mesh = new THREE.Mesh(objectGeo, mat);

    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * SPAWN_RADIUS;
    mesh.position.set(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      SPAWN_Z
    );

    mesh.userData = {
      velZ: 0.2 + Math.random() * 0.1,
      accel: 0.002 + Math.random() * 0.001,
      rotVelX: (Math.random() - 0.5) * 0.08,
      rotVelY: (Math.random() - 0.5) * 0.08,
      rotVelZ: (Math.random() - 0.5) * 0.08,
      driftFreqX: 0.5 + Math.random() * 0.5,
      driftFreqY: 0.4 + Math.random() * 0.4,
      driftAmpX: 0.3 + Math.random() * 0.3,
      driftAmpY: 0.3 + Math.random() * 0.3,
      driftPhase: Math.random() * Math.PI * 2,
      baseX: mesh.position.x,
      baseY: mesh.position.y
    };

    scene.add(mesh);
    flyingObjects.push(mesh);
  }

  function animateObjects(time) {
    var t = time * 0.001;
    var i = flyingObjects.length;

    while (i--) {
      var obj = flyingObjects[i];
      var ud = obj.userData;

      ud.velZ += ud.accel;
      obj.position.z += ud.velZ;

      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmpX;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmpY;
      obj.position.x = ud.baseX + driftX;
      obj.position.y = ud.baseY + driftY;

      var dist = Math.sqrt(obj.position.x * obj.position.x + obj.position.y * obj.position.y);
      if (dist > SPAWN_RADIUS) {
        var scale = SPAWN_RADIUS / dist;
        obj.position.x *= scale;
        obj.position.y *= scale;
      }

      obj.rotation.x += ud.rotVelX;
      obj.rotation.y += ud.rotVelY;
      obj.rotation.z += ud.rotVelZ;

      if (obj.position.z > DESPAWN_Z) {
        scene.remove(obj);
        obj.material.dispose();
        flyingObjects.splice(i, 1);
      }
    }
  }

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
    '  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);',
    '  float frame = floor(uFrameIndex);',
    '  float col = mod(frame, uSheetCols);',
    '  float row = floor(frame / uSheetCols);',
    '  vec2 cellSize = vec2(1.0 / uSheetCols, 1.0 / uSheetRows);',
    '  vec2 spriteUV = vec2(col, row) * cellSize + uv * cellSize;',
    '',
    '  float mCol = mod(uMaskIndex, uMaskCols);',
    '  float mRow = floor(uMaskIndex / uMaskCols);',
    '  vec2 mCellSize = vec2(1.0 / uMaskCols, 1.0 / uMaskRows);',
    '  vec2 maskUV = vec2(mCol, mRow) * mCellSize + uv * mCellSize;',
    '',
    '  vec4 sprite = texture2D(uSpriteSheet, spriteUV);',
    '  float mask = texture2D(uMaskAtlas, maskUV).a;',
    '  gl_FragColor = vec4(sprite.rgb * uFragTint, sprite.a * mask * uFragAlpha);',
    '}'
  ].join('\n');

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
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
  }

  // ─── Memory Fragment Layer Config & State ─────────────────────
  var FRAG_LAYERS = [
    // Background: slow, small, near walls
    {
      spawnInterval: 2500,
      spawnRadiusMin: TUNNEL_RADIUS * 0.3,
      spawnRadiusMax: TUNNEL_RADIUS * 0.5,
      velZMin: 0.03, velZMax: 0.06,
      accel: 0.0003,
      scaleMin: 0.4, scaleMax: 0.6,
      driftAmp: 0.1,
      wobbleAmp: 0.087,
      expandRate: 2.0,
      alphaMult: 0.9,
      maxCount: 5,
      lastSpawn: 0,
      nextInterval: 2500
    },
    // Mid: medium speed and size
    {
      spawnInterval: 3500,
      spawnRadiusMin: TUNNEL_RADIUS * 0.2,
      spawnRadiusMax: TUNNEL_RADIUS * 0.4,
      velZMin: 0.08, velZMax: 0.14,
      accel: 0.0005,
      scaleMin: 0.6, scaleMax: 1.0,
      driftAmp: 0.15,
      wobbleAmp: 0.175,
      expandRate: 2.5,
      alphaMult: 1.0,
      maxCount: 3,
      lastSpawn: 0,
      nextInterval: 3500
    },
    // Foreground: fast, large, closer to center
    {
      spawnInterval: 6000,
      spawnRadiusMin: TUNNEL_RADIUS * 0.1,
      spawnRadiusMax: TUNNEL_RADIUS * 0.3,
      velZMin: 0.15, velZMax: 0.25,
      accel: 0.001,
      scaleMin: 0.9, scaleMax: 1.4,
      driftAmp: 0.2,
      wobbleAmp: 0.262,
      expandRate: 3.5,
      alphaMult: 1.0,
      maxCount: 2,
      lastSpawn: 0,
      nextInterval: 6000
    }
  ];

  var fragmentGeo = new THREE.PlaneGeometry(1, 1);
  var fragmentPool = [];        // active fragments
  var fragmentRecyclePool = []; // despawned, ready to reuse
  var fragmentTextures = [];    // { tex: THREE.Texture, meta: {frames,cols,rows,fps,w,h}, url: string }
  var fragmentManifest = config.fragments || [];
  var fragmentMaskConfig = config.fragmentMasks || { count: 8, columns: 4, rows: 2 };
  var fragmentRecycleCount = 0; // counts recycles for texture rotation

  // ─── Memory Fragment Texture Loading ──────────────────────────
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

  // ─── Memory Fragment Spawn Logic ──────────────────────────────
  function countFragmentsInLayer(layerIdx) {
    var count = 0;
    for (var ci = 0; ci < fragmentPool.length; ci++) {
      if (fragmentPool[ci].userData.layerIdx === layerIdx) count++;
    }
    return count;
  }

  function spawnFragment(time) {
    if (fragmentTextures.length === 0 || !fragmentMaskTex) return;

    for (var li = 0; li < FRAG_LAYERS.length; li++) {
      var layer = FRAG_LAYERS[li];
      if (time - layer.lastSpawn < layer.nextInterval) continue;
      if (countFragmentsInLayer(li) >= layer.maxCount) continue;

      layer.lastSpawn = time;
      // Jitter next interval +-30%
      layer.nextInterval = layer.spawnInterval * (0.7 + Math.random() * 0.6);

      // Pick random texture from cache
      var texIdx = Math.floor(Math.random() * fragmentTextures.length);
      var texEntry = fragmentTextures[texIdx];
      var meta = texEntry.meta;

      // Vivid (60%) or ghost-tinted (40%)
      var isVivid = Math.random() < 0.6;

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
          isVivid ? 1.0 : 0.85,
          isVivid ? 1.0 : 0.7
        );
        mesh.material.uniforms.uFragAlpha.value = (isVivid ? 1.0 : (0.7 + Math.random() * 0.2)) * layer.alphaMult;
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

      mesh.position.set(sx, sy, DESPAWN_Z);
      mesh.scale.set(meshScaleX, meshScaleY, 1);

      mesh.userData = {
        layerIdx: li,
        velZ: -(layer.velZMin + Math.random() * (layer.velZMax - layer.velZMin)),
        accel: -layer.accel,
        driftFreqX: 0.3 + Math.random() * 0.4,
        driftFreqY: 0.25 + Math.random() * 0.35,
        driftAmp: layer.driftAmp,
        driftPhase: Math.random() * Math.PI * 2,
        baseX: sx,
        baseY: sy,
        expandRate: layer.expandRate || 2.0,
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

  // ─── Memory Fragment Animation Loop ───────────────────────────
  function animateFragments(time, dt) {
    var t = time * 0.001;
    var i = fragmentPool.length;

    while (i--) {
      var mesh = fragmentPool[i];
      var ud = mesh.userData;

      // Z movement (frame-based)
      ud.velZ += ud.accel;
      mesh.position.z += ud.velZ;

      // Radial expansion — fragments fly outward toward screen edges as they approach
      var zProgress = 1.0 - (mesh.position.z - SPAWN_Z) / (DESPAWN_Z - SPAWN_Z);
      // zProgress: 0 at far end (DESPAWN_Z), 1 near camera (SPAWN_Z)
      var expand = 1.0 + zProgress * zProgress * ud.expandRate;

      // Lateral drift (sinusoidal) + expansion
      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmp;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmp;
      mesh.position.x = (ud.baseX + driftX) * expand;
      mesh.position.y = (ud.baseY + driftY) * expand;

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

      // Despawn (fragments fly toward camera, despawn when past it)
      if (mesh.position.z < SPAWN_Z) {
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

  // ─── Render one frame (reusable) ─────────────────────────────
  function renderOneFrame() {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    // Copy pixels (WebGL reads bottom-up, flip vertically)
    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    // VGA palette quantization + Floyd-Steinberg dither
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
  var LOOK_TARGET = { x: 0, y: 0, z: 30 };
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
  // Use position:fixed so CSS zoom on html can't push it off-viewport.
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
  var lastFrame = 0;

  function animate(time) {
    if (isPaused()) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    // Update shader time uniforms
    var t = time * 0.001;
    tunnel.material.uniforms.uTime.value = t;
    glow.material.uniforms.uTime.value = t;
    sparkles.material.uniforms.uTime.value = t;

    // Spin portal rings
    for (var ri = 0; ri < portalRings.length; ri++) {
      portalRings[ri].rotation.z += portalRings[ri].userData.rotSpeed * 0.02;
    }

    // Rotate vortex backdrop
    if (vortexBackdrop) {
      vortexBackdrop.rotation.z = t * 0.15;
    }

    // Update Tsuno Daishi
    updateTsuno(t, targetInterval / 1000);
    updateBubblePosition();

    // Tsuno mouse interaction (idle only, desktop only, when mouse interaction is enabled)
    if (tsunoState === 'idle' && !isMobile && config.mouseInteraction !== false) {
      updateTsunoMouse(mouseNorm);
    }

    // Spawn and animate flying objects
    spawnObject(time);
    animateObjects(time);

    // Spawn and animate memory fragments
    spawnFragment(time);
    animateFragments(time, targetInterval / 1000);

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
    setTalking: function (talking) {
      tsunoTalking = !!talking;
    },
    setBubbleText: function (text) {
      drawBubble(text);
    },
    setBubbleVisible: function (visible) {
      bubbleMesh.visible = !!visible;
      textMesh.visible = !!visible;
    }
  };

  // ─── Reduced Motion: Static Frame ─────────────────────────────
  if (prefersReducedMotion) {
    // Render one static dithered frame, then stop
    tunnel.material.uniforms.uTime.value = 0;
    glow.material.uniforms.uTime.value = 0;
    renderOneFrame();
    return; // Exit IIFE — no animation loop
  }

  // ─── Init ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }

})();
