/**
 * JapanJunky Forest — Sacred grove background scene.
 *
 * Depends on: THREE (global)
 * Exposes:    window.JJ_Forest.create(scene, camera, clock, opts)
 *               → { update(t, scrollY),
 *                   setTier(tier),
 *                   setCameraPreset(name),
 *                   getTsunoAnchors(),
 *                   getTrunkColliders(),
 *                   getCurrentPhosphorMix(),
 *                   dispose() }
 */
(function () {
  'use strict';

  // ─── Camera presets ──────────────────────────────────────────
  var PRESETS = {
    home: {
      pos:  [0, 1.6, -2],
      look: [0, 2.0, 14],          // looking slightly UP the steps
      fog:  { near: 6, far: 32 },
      fov:  60,
      float: { pos: 0.05, rot: 0.6 * Math.PI / 180, period: 4.0 }
    },
    product: {
      pos:  [2, 1.4, 4],
      look: [4, 1.2, 16],
      fog:  { near: 8, far: 30 },
      fov:  48,
      float: { pos: 0.025, rot: 0.4 * Math.PI / 180, period: 5.0 }
    },
    login: {
      pos:  [3, 0.6, 8],
      look: [3, 4.5, 14],
      fog:  { near: 20, far: 90 },
      fov:  60,
      float: { pos: 0.05, rot: 0.5 * Math.PI / 180, period: 4.5 }
    }
  };

  function create(scene, camera, clock, opts) {
    opts = opts || {};
    var currentTier = opts.tier || 'high';
    var currentPreset = PRESETS[opts.cameraPreset] || PRESETS.home;
    var cameraBasePos = new THREE.Vector3();
    var cameraBaseQuat = new THREE.Quaternion();

    // Layer roots — each layer added/removed independently for tier scaling
    var layers = {
      sky:        new THREE.Group(),
      silhouette: new THREE.Group(),
      midGrove:   new THREE.Group(),
      hero:       new THREE.Group(),
      shrine:     new THREE.Group(),
      foreground: new THREE.Group(),
      road:       new THREE.Group(),
      particles:  new THREE.Group(),
      godRays:    new THREE.Group(),
      fogWisps:   new THREE.Group(),
      grain:      new THREE.Group()
    };
    Object.keys(layers).forEach(function (k) { scene.add(layers[k]); });

    // ─── Distance fog (initialized early — tree shader reads it) ──
    // Cool gray-green: light filtering through cedar canopy (concept6).
    scene.fog = new THREE.Fog(0x3a4838, currentPreset.fog.near, currentPreset.fog.far);

    // ─── Layer 0: Sky / fog wall ──────────────────────────────
    // Single billboard plane far behind everything. Amber gradient
    // (light top → deep bottom). Always faces camera implicitly via
    // its z-far placement.
    // Cool canopy gradient — light filtering through cedar grove (concept6).
    // Top dim shadow, mid backlit green, bottom deep moss shadow.
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:    { value: new THREE.Color(0x2a3024) },  // dim canopy top
        uMidColor:    { value: new THREE.Color(0x6a7858) },  // backlit moss-green
        uBottomColor: { value: new THREE.Color(0x1c1e16) }   // deep shadow base
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTopColor;',
        'uniform vec3 uMidColor;',
        'uniform vec3 uBottomColor;',
        'varying vec2 vUv;',
        'void main() {',
        '  // 3-stop gradient: bottom → glow band at horizon → top',
        '  vec3 col;',
        '  if (vUv.y < 0.45) {',
        '    col = mix(uBottomColor, uMidColor, smoothstep(0.15, 0.45, vUv.y));',
        '  } else {',
        '    col = mix(uMidColor, uTopColor, smoothstep(0.45, 0.95, vUv.y));',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      depthWrite: false,
      depthTest: false,
      fog: false
    });
    var skyGeo = new THREE.PlaneGeometry(200, 100);
    var skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(0, 0, 80);
    skyMesh.renderOrder = -10;
    layers.sky.add(skyMesh);

    // ─── Layer 1: Distant silhouette ridge ────────────────────
    // Procedural for now. Texture swap-in happens in Task 19.
    var silhouetteMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x1a0a04) },
        uHeight: { value: 0.35 }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uHeight;',
        'varying vec2 vUv;',
        'float noise(float x) {',
        '  return fract(sin(x * 12.9898) * 43758.5453);',
        '}',
        'void main() {',
        '  // Distant conifer silhouettes — each x band is one tree:',
        '  // narrow trunk + triangular cone above it.',
        '  float band = floor(vUv.x * 40.0);',
        '  float bandX = fract(vUv.x * 40.0);   // 0..1 within band',
        '  float treeH = noise(band) * 0.45 + 0.35;',
        '  // Triangular cone: peak at band center, falls to 0 at edges',
        '  float dCenter = abs(bandX - 0.5) * 2.0;',
        '  float coneTop = treeH;',
        '  float coneBottom = 0.05 + noise(band + 0.3) * 0.08;',
        '  // Cone occupies (bandX 0.05..0.95) and (vUv.y < lerp(coneBottom, coneTop, 1-dCenter))',
        '  float coneLine = mix(coneBottom, coneTop, 1.0 - dCenter);',
        '  // Trunk: thin column at center 0.45..0.55, bottom 0..0.05',
        '  float trunkInBand = step(0.42, bandX) * step(bandX, 0.58);',
        '  float trunkBottom = 0.0;',
        '  float trunkTopY = 0.05;',
        '  float opaque = 0.0;',
        '  if (vUv.y < coneLine && bandX > 0.06 && bandX < 0.94) opaque = 1.0;',
        '  if (vUv.y < trunkTopY && trunkInBand > 0.5) opaque = 1.0;',
        '  if (opaque < 0.5) discard;',
        '  // Distance fade — taller trees further left/right of frame fade slightly',
        '  float a = 0.78 + 0.22 * noise(band + 0.7);',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      fog: false
    });
    var silhouetteGeo = new THREE.PlaneGeometry(160, 30);
    var silhouetteMesh = new THREE.Mesh(silhouetteGeo, silhouetteMat);
    silhouetteMesh.position.set(0, 6, 60);
    silhouetteMesh.renderOrder = -9;
    layers.silhouette.add(silhouetteMesh);

    // ─── Tree silhouette texture (alpha-cutout, 128×256) ─────
    // PS1 horror trees are flat textured planes, not 3D meshes.
    // Texture: dark conifer silhouette on transparent background.
    // Variants give visual diversity across trees.
    function makeTreeSilhouette(variant) {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 256;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 128, 256);
      // Trunk — narrow vertical column, slight taper
      var trunkW = 6 + variant;        // 6-9px wide
      var trunkColor = '#0f0c08';
      ctx.fillStyle = trunkColor;
      ctx.beginPath();
      ctx.moveTo(64 - trunkW / 2, 256);
      ctx.lineTo(64 + trunkW / 2, 256);
      ctx.lineTo(64 + trunkW / 2 - 1, 110);
      ctx.lineTo(64 - trunkW / 2 + 1, 110);
      ctx.closePath();
      ctx.fill();
      // Sparse foliage — 3 triangular fronds, each progressively smaller
      var foliage = '#141a10';
      ctx.fillStyle = foliage;
      // Bottom (widest)
      ctx.beginPath();
      ctx.moveTo(64,        70);
      ctx.lineTo(64 - 38,   124);
      ctx.lineTo(64 + 38,   124);
      ctx.closePath();
      ctx.fill();
      // Mid frond
      ctx.beginPath();
      ctx.moveTo(64,        38);
      ctx.lineTo(64 - 28,   88);
      ctx.lineTo(64 + 28,   88);
      ctx.closePath();
      ctx.fill();
      // Top frond
      ctx.beginPath();
      ctx.moveTo(64,        6);
      ctx.lineTo(64 - 18,   54);
      ctx.lineTo(64 + 18,   54);
      ctx.closePath();
      ctx.fill();
      // Pixel notch noise on edges (jagged silhouette)
      var notches = 14 + variant * 4;
      for (var i = 0; i < notches; i++) {
        var nx = Math.floor(Math.random() * 128);
        var ny = Math.floor(Math.random() * 130);
        ctx.clearRect(nx, ny, 2, 2);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return tex;
    }
    var TREE_TEXTURES = [
      makeTreeSilhouette(0),
      makeTreeSilhouette(1),
      makeTreeSilhouette(2)
    ];

    // ─── PS1 tree shader (vertex snap + affine warp + manual fog) ──
    var TREE_VERT = [
      'uniform float uSnapRes;',
      'varying vec2 vUvAffine;',
      'varying float vWAffine;',
      'varying float vFogDepth;',
      'void main() {',
      '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipPos = projectionMatrix * viewPos;',
      '  // Vertex jitter — snap to integer pixel grid',
      '  clipPos.xy = floor(clipPos.xy * uSnapRes / clipPos.w) * clipPos.w / uSnapRes;',
      '  gl_Position = clipPos;',
      '  // Affine UV setup — pre-multiply by w; fragment will divide back.',
      '  // Cancels GPU perspective correction, restoring PSX UV warp.',
      '  vUvAffine = uv * clipPos.w;',
      '  vWAffine  = clipPos.w;',
      '  vFogDepth = -viewPos.z;',
      '}'
    ].join('\n');
    var TREE_FRAG = [
      'uniform sampler2D uMap;',
      'uniform vec3 uFogColor;',
      'uniform float uFogNear;',
      'uniform float uFogFar;',
      'varying vec2 vUvAffine;',
      'varying float vWAffine;',
      'varying float vFogDepth;',
      'void main() {',
      '  vec2 uv = vUvAffine / vWAffine;',
      '  vec4 c = texture2D(uMap, uv);',
      '  if (c.a < 0.5) discard;',
      '  float fogFactor = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
      '  vec3 col = mix(c.rgb, uFogColor, fogFactor);',
      '  gl_FragColor = vec4(col, c.a);',
      '}'
    ].join('\n');

    function makeTreeMaterial(treeTex) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uMap:       { value: treeTex },
          uSnapRes:   { value: 240 },
          uFogColor:  { value: scene.fog.color },
          uFogNear:   { value: scene.fog.near },
          uFogFar:    { value: scene.fog.far }
        },
        vertexShader:   TREE_VERT,
        fragmentShader: TREE_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true
      });
    }

    // ─── X-billboard tree builder (two crossed planes, alpha cutout) ──
    function buildXTree(x, z, height, variant) {
      var w = height * 0.55;
      var geo = new THREE.PlaneGeometry(w, height);
      var tex = TREE_TEXTURES[variant % TREE_TEXTURES.length];
      var mat = makeTreeMaterial(tex);
      var p0 = new THREE.Mesh(geo, mat);
      p0.position.set(x, height / 2 - 0.2, z);
      var p1 = new THREE.Mesh(geo, mat);
      p1.position.set(x, height / 2 - 0.2, z);
      p1.rotation.y = Math.PI / 2;
      var group = new THREE.Group();
      group.add(p0);
      group.add(p1);
      group.userData.isTree = true;
      return group;
    }

    // ─── Sparse horror-conifer foliage (PS1 Silent Hill style) ──────
    // (Old buildHorrorConifer cone-stack foliage retired — trees are now
    // X-billboard alpha-cutout planes via buildXTree above. Per PS1 horror
    // guidelines, 3D foliage is wrong; flat planes are authentic.)

    // ─── Layer 2: Mid grove — denser rows tightly flanking steps ─────
    // Concept6: cedars in two close parallel rows, packed tight.
    var MID_GROVE_LAYOUT = [
      // [x,   z,  height, baseR, topR]
      // Left row, ascending
      [ -3.6, 18, 17, 0.45, 0.30],
      [ -3.4, 22, 16, 0.45, 0.30],
      [ -3.8, 27, 15, 0.40, 0.25],
      [ -3.5, 33, 14, 0.40, 0.25],
      // Right row, ascending
      [  3.6, 19, 17, 0.45, 0.30],
      [  3.4, 24, 16, 0.45, 0.30],
      [  3.8, 29, 15, 0.40, 0.25],
      [  3.5, 35, 14, 0.40, 0.25]
    ];
    function buildMidGrove(count) {
      for (var i = 0; i < Math.min(count, MID_GROVE_LAYOUT.length); i++) {
        var L = MID_GROVE_LAYOUT[i];
        layers.midGrove.add(buildXTree(L[0], L[1], L[2], i));
      }
    }
    buildMidGrove(8);

    // ─── Layer 3: Hero cedars flanking the steps near camera ────────
    // Concept6: huge close-up cedars right next to the lanterns.
    var HERO_LAYOUT = [
      // [x,    z,  height, baseR, topR]
      [ -3.4,  6, 22, 0.65, 0.40],   // closest-left, tallest
      [ -3.4, 11, 20, 0.55, 0.35],   // mid-left
      [  3.4,  7, 22, 0.65, 0.40],   // closest-right, tallest
      [  3.4, 13, 20, 0.55, 0.35]    // mid-right
    ];
    var heroCedars = [];
    function buildHeroCedars(count) {
      for (var i = 0; i < Math.min(count, HERO_LAYOUT.length); i++) {
        var L = HERO_LAYOUT[i];
        layers.hero.add(buildXTree(L[0], L[1], L[2], i + 5));
        heroCedars.push({ layout: L });
      }
    }
    buildHeroCedars(4);

    // (Shimenawa rope + shide streamers removed — non-PS1, too decorative
    // for horror tone. Trees are now flat alpha-cutout billboards which
    // wouldn't accommodate a 3D torus rope wrap anyway.)
    /* SHIMENAWA + SHIDE BLOCK START — retained for reference but commented
    function makePlaceholderRope() {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#c19a3a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#a07a1c';
      ctx.lineWidth = 4;
      for (var i = -8; i < 32; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 16, 0);
        ctx.lineTo(i * 16 + 28, 64);
        ctx.stroke();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    }
    var ropeTex = (opts.textures && opts.textures.rope) || makePlaceholderRope();

    function buildRope(trunkRadius, atY, trunkX, trunkZ) {
      var ropeRadius = trunkRadius + 0.18;
      var tubeRadius = 0.18;
      var radialSegs = 12;
      var tubularSegs = 8;
      var geo = new THREE.TorusGeometry(ropeRadius, tubeRadius, tubularSegs, radialSegs);
      ropeTex.repeat.set(4, 1);
      var mat = new THREE.MeshBasicMaterial({ map: ropeTex, fog: true });
      var rope = new THREE.Mesh(geo, mat);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(trunkX, atY, trunkZ);
      return rope;
    }

    // Wrap hero cedars with shimenawa rope at mid-height
    var heroRopes = [];
    for (var hri = 0; hri < heroCedars.length; hri++) {
      var hero = heroCedars[hri];
      var hL = hero.layout;
      var hRopeY = hL[2] * 0.45;
      var hAvgRadius = (hL[3] + hL[4]) / 2;
      var rope = buildRope(hAvgRadius, hRopeY, hL[0], hL[1]);
      layers.hero.add(rope);
      heroRopes.push(rope);
    }

    // ─── Shide paper streamers ────────────────────────────────
    function makePlaceholderShide() {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 96;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 32, 96);
      ctx.fillStyle = '#f0e8d8';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(24, 16);
      ctx.lineTo(8, 32);
      ctx.lineTo(24, 48);
      ctx.lineTo(8, 64);
      ctx.lineTo(24, 80);
      ctx.lineTo(8, 96);
      ctx.lineTo(8, 0);
      ctx.fill();
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
    var shideTex = (opts.textures && opts.textures.shide) || makePlaceholderShide();

    var SHIDE_VERT = [
      'uniform float uTime;',
      'attribute float aSwayPhase;',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec3 p = position;',
      '  float sway = (1.0 - uv.y) * 0.18;',
      '  p.x += sin(uTime * 1.6 + aSwayPhase) * sway;',
      '  p.z += cos(uTime * 1.1 + aSwayPhase * 1.3) * sway * 0.4;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\n');
    var SHIDE_FRAG = [
      'uniform sampler2D uMap;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 c = texture2D(uMap, vUv);',
      '  if (c.a < 0.5) discard;',
      '  gl_FragColor = c;',
      '}'
    ].join('\n');

    var shideMaterials = [];
    function buildShideAt(worldX, worldY, worldZ) {
      var w = 0.18, h = 0.55;
      var geo = new THREE.PlaneGeometry(w, h);
      var phase = Math.random() * 6.28;
      var phases = new Float32Array([phase, phase, phase, phase]);
      geo.setAttribute('aSwayPhase', new THREE.BufferAttribute(phases, 1));
      // ShaderMaterial + fog requires merging THREE.UniformsLib.fog and
      // adding fog includes to the shader. Skipping that since shide hang
      // close to camera and won't visibly fade. Disable fog instead.
      var mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMap: { value: shideTex } },
        vertexShader: SHIDE_VERT,
        fragmentShader: SHIDE_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        fog: false
      });
      shideMaterials.push(mat);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(worldX, worldY, worldZ);
      mesh.renderOrder = 1;
      layers.hero.add(mesh);
      return mesh;
    }

    // Hang shide around each rope at world coordinates
    for (var sri = 0; sri < heroRopes.length; sri++) {
      var sHero = heroCedars[sri];
      var sL = sHero.layout;
      var sTrunkX = sL[0], sTrunkZ = sL[1];
      var sRopeY = sL[2] * 0.45;
      var sAvgRadius = (sL[3] + sL[4]) / 2 + 0.18;
      var sHangBelow = 0.4;
      var sCount = 5 + Math.floor(Math.random() * 3);
      for (var ssi = 0; ssi < sCount; ssi++) {
        var sAngle = (ssi / sCount) * Math.PI * 2;
        var sx = sTrunkX + Math.cos(sAngle) * sAvgRadius;
        var sz = sTrunkZ + Math.sin(sAngle) * sAvgRadius;
        var sy = sRopeY - sHangBelow;
        buildShideAt(sx, sy, sz);
      }
    }
    SHIMENAWA + SHIDE BLOCK END */
    var shideMaterials = []; // empty stub — update loop iterates safely

    // ─── Shrine props (placeholders until Task 19) ────────────
    function makeFlatColorTex(w, h, hex) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, h - 4, w, 4);
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }

    // Concept6: TWO BIG ishidoro lanterns flanking the steps in foreground.
    // Other shrine props minor or removed.
    var SHRINE_PROPS = [
      // Big foreground lanterns — these are the key compositional anchors
      { type: 'ishidoro', w: 1.4, h: 3.4, hex: '#9a9080', pos: [-2.4, 1.7, 4.2] },
      { type: 'ishidoro', w: 1.4, h: 3.4, hex: '#9a9080', pos: [ 2.4, 1.7, 4.5] },
      // Optional smaller hokora deeper up the steps
      { type: 'hokora',   w: 0.8, h: 0.8, hex: '#7a6a55', pos: [0.0, 0.4, 22.0] }
    ];

    function buildShrineProps() {
      var realTex = (opts.textures && opts.textures.shrine) || {};
      var typeTex = {};
      function getTypeTex(type, hex) {
        if (typeTex[type]) return typeTex[type];
        if (realTex[type]) {
          typeTex[type] = realTex[type];
        } else {
          typeTex[type] = makeFlatColorTex(64, 96, hex);
        }
        return typeTex[type];
      }
      for (var i = 0; i < SHRINE_PROPS.length; i++) {
        var P = SHRINE_PROPS[i];
        var geo = new THREE.PlaneGeometry(P.w, P.h);
        var mat = new THREE.MeshBasicMaterial({
          map: getTypeTex(P.type, P.hex),
          transparent: true,
          side: THREE.DoubleSide,
          fog: true
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(P.pos[0], P.pos[1], P.pos[2]);
        mesh.userData.isBillboard = true;
        mesh.userData.propType = P.type;
        layers.shrine.add(mesh);
      }
    }
    buildShrineProps();

    // ─── Mossy stone cliff on left edge (concept6 dark cliff face) ──
    var cliffMat = new THREE.MeshBasicMaterial({
      color: 0x2a3022,
      side: THREE.DoubleSide,
      fog: true
    });
    injectVertexSnap(cliffMat);
    var cliffGeo = new THREE.BoxGeometry(3, 8, 12);
    var cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.set(-6.5, 3.5, 9);
    cliffMesh.rotation.y = 0.15;
    layers.foreground.add(cliffMesh);
    // A second slimmer protrusion further back-left
    var cliff2Geo = new THREE.BoxGeometry(2, 5, 6);
    var cliff2 = new THREE.Mesh(cliff2Geo, cliffMat);
    cliff2.position.set(-7.0, 2.0, 16);
    cliff2.rotation.y = -0.2;
    layers.foreground.add(cliff2);

    // ─── Stone steps ascending up the path (concept6) ─────────
    // 12 stacked low-poly slabs rising in z + y. Replaces flat dirt path.
    var stepMat = new THREE.MeshBasicMaterial({
      color: 0x4a4438,
      side: THREE.DoubleSide,
      fog: true
    });
    injectVertexSnap(stepMat);
    var STEP_COUNT = 14;
    var STEP_DEPTH = 1.2;       // each step's z-extent
    var STEP_RISE = 0.18;       // each step lifts y by this much
    var STEP_WIDTH = 3.2;
    for (var sti = 0; sti < STEP_COUNT; sti++) {
      var slabGeo = new THREE.BoxGeometry(
        STEP_WIDTH + (Math.random() - 0.5) * 0.6,
        0.3,
        STEP_DEPTH + (Math.random() - 0.5) * 0.2
      );
      var slab = new THREE.Mesh(slabGeo, stepMat);
      slab.position.set(
        (Math.random() - 0.5) * 0.3,
        sti * STEP_RISE + 0.0,
        2 + sti * STEP_DEPTH
      );
      slab.rotation.y = (Math.random() - 0.5) * 0.06;
      layers.road.add(slab);
    }

    // ─── Moss patch texture (consumed by lantern receivers below) ──
    // Sparse green moss for the small lit zones under stone lanterns.
    function makePlaceholderMoss() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#1a2a14';
      ctx.fillRect(0, 0, 64, 64);
      for (var i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(50,80,30,0.5)';
        ctx.fillRect(
          Math.floor(Math.random() * 64),
          Math.floor(Math.random() * 64), 2, 2);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var mossTex = (opts.textures && opts.textures.moss) || makePlaceholderMoss();

    // ─── Layer 5: Foreground rocks + grass tufts ──────────────
    // Rocky outcrops on left + right (concept4) plus a few grass billboards.
    var rockMat = new THREE.MeshBasicMaterial({
      color: 0x4a3a2a,
      side: THREE.DoubleSide,
      fog: true
    });
    injectVertexSnap(rockMat);
    function makeRock(x, y, z, sx, sy, sz, rotY) {
      var geo = new THREE.DodecahedronGeometry(1, 0); // 12-face low-poly
      var mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.y = rotY;
      return mesh;
    }
    // Mossy boulders scattered around steps (concept6 ground stones)
    layers.foreground.add(makeRock(-1.6, 0.2, 2.5,  0.7, 0.5, 0.8,  0.4));
    layers.foreground.add(makeRock( 1.8, 0.2, 3.0,  0.6, 0.4, 0.7, -0.6));
    layers.foreground.add(makeRock(-1.3, 0.15, 8.5, 0.5, 0.4, 0.6,  0.3));
    layers.foreground.add(makeRock( 1.5, 0.15, 9.0, 0.6, 0.4, 0.7, -0.4));
    layers.foreground.add(makeRock( 5.0, 0.4, 12.0, 1.2, 0.9, 1.0,  0.2));
    layers.foreground.add(makeRock(-5.5, 0.3, 22.0, 1.4, 1.0, 1.2, -0.3));

    // Grass tufts — billboard quads with grass-clump texture, scattered on
    // path edges. Procedural canvas (CC photos can replace later).
    function makeGrassTexture() {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 32, 32);
      // Vertical green blades from bottom
      for (var i = 0; i < 14; i++) {
        var bx = Math.floor(Math.random() * 32);
        var bh = 12 + Math.random() * 16;
        ctx.strokeStyle = (Math.random() < 0.5) ? '#3a5a2a' : '#2a3a1a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, 32);
        ctx.lineTo(bx + (Math.random() - 0.5) * 4, 32 - bh);
        ctx.stroke();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
    var grassTex = makeGrassTexture();
    var grassMat = new THREE.MeshBasicMaterial({
      map: grassTex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.4,
      fog: true
    });
    function makeGrassTuft(x, z, scale) {
      var geo = new THREE.PlaneGeometry(0.6 * scale, 0.4 * scale);
      var mesh = new THREE.Mesh(geo, grassMat);
      mesh.position.set(x, 0.2 * scale, z);
      mesh.userData.isBillboard = true; // face camera each frame
      return mesh;
    }
    var GRASS_LAYOUT = [
      [-1.5, 4, 1.0], [-2.2, 6, 0.9], [1.8, 5, 1.0], [2.3, 7, 1.1],
      [-1.0, 9, 0.8], [1.2, 11, 0.9], [-1.8, 14, 0.8], [1.6, 16, 0.9],
      [-3.5, 7, 1.2], [3.2, 9, 1.0]
    ];
    for (var gti = 0; gti < GRASS_LAYOUT.length; gti++) {
      var GT = GRASS_LAYOUT[gti];
      layers.foreground.add(makeGrassTuft(GT[0], GT[1], GT[2]));
    }

    // (Stone steps already added above — no flat dirt path needed.)
    // Mossy ground plane fills around the steps so it doesn't look floating.
    var groundMat = new THREE.MeshBasicMaterial({
      color: 0x2a2820,
      side: THREE.DoubleSide,
      fog: true
    });
    injectVertexSnap(groundMat);
    var groundGeo = new THREE.PlaneGeometry(60, 60);
    var groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(0, -0.05, 18);
    layers.road.add(groundMesh);

    // ─── PS1 vertex-snap shader injection ─────────────────────
    // Quantize clip-space xy to integer pixel grid → wobble effect.
    var SNAP_RES = 240;
    function injectVertexSnap(mat) {
      if (mat.userData && mat.userData.psSnap) return;
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uSnapRes = { value: SNAP_RES };
        shader.vertexShader = 'uniform float uSnapRes;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          [
            '#include <project_vertex>',
            'gl_Position.xy = floor(gl_Position.xy * uSnapRes / gl_Position.w)',
            '              * gl_Position.w / uSnapRes;'
          ].join('\n')
        );
      };
      mat.userData = mat.userData || {};
      mat.userData.psSnap = true;
      mat.needsUpdate = true;
    }
    // Apply to all opaque MeshBasicMaterials currently in layers
    function applySnapToAllLayers() {
      Object.keys(layers).forEach(function (k) {
        layers[k].traverse(function (obj) {
          if (obj.material && obj.material.isMeshBasicMaterial) {
            injectVertexSnap(obj.material);
          }
        });
      });
    }
    applySnapToAllLayers();

    // ─── God rays (cheap fake — additive billboards) ──────────
    function makeGodRayTexture() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      var ctx = c.getContext('2d');
      var grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0,    'rgba(255,200,120,0.0)');
      grad.addColorStop(0.45, 'rgba(255,200,120,0.55)');
      grad.addColorStop(1,    'rgba(255,200,120,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 256);
      var hgrad = ctx.createLinearGradient(0, 0, 64, 0);
      hgrad.addColorStop(0, 'rgba(0,0,0,0.7)');
      hgrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      hgrad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = hgrad;
      ctx.fillRect(0, 0, 64, 256);
      return new THREE.CanvasTexture(c);
    }
    var godRayTex = makeGodRayTexture();
    var godRayMaterials = [];
    function buildGodRay(x, y, z, scaleX, scaleY, rotZ, basePhase) {
      var geo = new THREE.PlaneGeometry(scaleX, scaleY);
      var mat = new THREE.MeshBasicMaterial({
        map: godRayTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.55
      });
      mat.userData.godRayPhase = basePhase;
      godRayMaterials.push(mat);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotZ;
      mesh.rotation.x = -0.4;
      mesh.renderOrder = 5;
      layers.godRays.add(mesh);
      return mesh;
    }
    // Two big god rays slanting through trees — concept5 sun-through-trees
    var GOD_RAY_LAYOUT = [
      [ 0.5, 7, 18, 5, 14,  0.15, 0.0],   // primary shaft, near center
      [-1.0, 6, 24, 4, 12,  0.25, 2.4]    // secondary, deeper + offset
    ];
    function buildGodRays(count) {
      for (var i = 0; i < Math.min(count, GOD_RAY_LAYOUT.length); i++) {
        var L = GOD_RAY_LAYOUT[i];
        buildGodRay(L[0], L[1], L[2], L[3], L[4], L[5], L[6]);
      }
    }
    buildGodRays(2);

    // ─── Drifting fog wisps (instanced billboards) ────────────
    function makeFogWispTexture() {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      var ctx = c.getContext('2d');
      var grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 60);
      grad.addColorStop(0,    'rgba(220,180,130,0.6)');
      grad.addColorStop(0.5,  'rgba(180,140,100,0.25)');
      grad.addColorStop(1,    'rgba(180,140,100,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 64);
      return new THREE.CanvasTexture(c);
    }
    var fogWispTex = makeFogWispTexture();
    var FOG_WISP_COUNT = 12;
    var fogWispGeo = new THREE.PlaneGeometry(3, 1.2);
    var fogWispMat = new THREE.MeshBasicMaterial({
      map: fogWispTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    var fogWispMesh = new THREE.InstancedMesh(fogWispGeo, fogWispMat, FOG_WISP_COUNT);
    var fogWispData = [];
    var dummy = new THREE.Object3D();
    for (var fi = 0; fi < FOG_WISP_COUNT; fi++) {
      var fwx = (Math.random() - 0.5) * 30;
      var fwy = 0.3 + Math.random() * 1.5;
      var fwz = 8 + Math.random() * 30;
      fogWispData.push({
        baseX: fwx, baseY: fwy, baseZ: fwz,
        driftPhase: Math.random() * 6.28,
        speed: 0.05 + Math.random() * 0.05
      });
      dummy.position.set(fwx, fwy, fwz);
      dummy.updateMatrix();
      fogWispMesh.setMatrixAt(fi, dummy.matrix);
    }
    fogWispMesh.instanceMatrix.needsUpdate = true;
    layers.fogWisps.add(fogWispMesh);

    // ─── Falling needles ──────────────────────────────────────
    var NEEDLE_COUNT = 60;
    var needleGeo = new THREE.PlaneGeometry(0.04, 0.18);
    var needleMat = new THREE.MeshBasicMaterial({
      color: 0x6a4020,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      fog: true
    });
    var needleMesh = new THREE.InstancedMesh(needleGeo, needleMat, NEEDLE_COUNT);
    var needleData = [];
    for (var ni = 0; ni < NEEDLE_COUNT; ni++) {
      needleData.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 14,
        z: 6 + Math.random() * 30,
        rotZ: Math.random() * 6.28,
        vy: -0.03 - Math.random() * 0.04,
        vx: (Math.random() - 0.5) * 0.01,
        spin: (Math.random() - 0.5) * 0.4
      });
    }
    layers.particles.add(needleMesh);

    // ─── Distant bird ─────────────────────────────────────────
    var birdGeo = new THREE.PlaneGeometry(0.5, 0.15);
    var birdMat = new THREE.MeshBasicMaterial({
      color: 0x1a0a04,
      transparent: true,
      opacity: 0.8,
      fog: false
    });
    var birdMesh = new THREE.Mesh(birdGeo, birdMat);
    birdMesh.position.set(-30, 8, 60);
    birdMesh.visible = false;
    layers.particles.add(birdMesh);
    var birdNextStart = 30;

    // ─── Lantern point lights ─────────────────────────────────
    var lanternLights = [];
    var lanternMossPatches = [];
    function makeMossPatch(x, z, radius) {
      var geo = new THREE.CircleGeometry(radius, 12);
      var mat = new THREE.MeshLambertMaterial({
        map: mossTex,
        side: THREE.DoubleSide,
        fog: true
      });
      injectVertexSnap(mat);
      var patch = new THREE.Mesh(geo, mat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.02, z);
      layers.shrine.add(patch);
      return patch;
    }
    function buildLanterns() {
      for (var li = 0; li < SHRINE_PROPS.length; li++) {
        var P = SHRINE_PROPS[li];
        if (P.type !== 'ishidoro') continue;
        var light = new THREE.PointLight(0xff7820, 0.4, 4.0, 2.0);
        light.position.set(P.pos[0], P.pos[1] + 0.5, P.pos[2]);
        light.userData.basePhase = Math.random() * 6.28;
        light.userData.baseIntensity = 0.4;
        layers.shrine.add(light);
        lanternLights.push(light);
        lanternMossPatches.push(makeMossPatch(P.pos[0], P.pos[2], 1.5));
      }
    }
    buildLanterns();

    // ─── Phosphor scintillation grain ─────────────────────────
    function makeNoiseTexture() {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(128, 128);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.floor(Math.random() * 256);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
    // Phosphor scintillation grain DISABLED — the CPU-side dither already
    // adds its own pixel-noise; layering grain on top reads as visual mud.
    // Tier matrix keeps the flag for future toggling.
    var grainTex = makeNoiseTexture();
    void grainTex; // keep texture builder warm for now (helper compiles)

    // (Fog already initialized near top of create() so tree shader can
    // bind to it. applyPreset below just updates near/far per preset.)

    // Apply preset to camera
    function applyPreset(p) {
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      camera.lookAt(p.look[0], p.look[1], p.look[2]);
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      cameraBasePos.copy(camera.position);
      cameraBaseQuat.copy(camera.quaternion);
      scene.fog.near = p.fog.near;
      scene.fog.far  = p.fog.far;
    }
    applyPreset(currentPreset);

    function setCameraPreset(name) {
      if (!PRESETS[name]) return;
      currentPreset = PRESETS[name];
      applyPreset(currentPreset);
    }

    // Handheld float (Perlin replacement: smoothed noise from sin sums)
    function smoothNoise(t, seed) {
      return (
        Math.sin(t * 0.73 + seed) * 0.5 +
        Math.sin(t * 1.37 + seed * 2.1) * 0.3 +
        Math.sin(t * 2.11 + seed * 3.7) * 0.2
      );
    }
    var prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function applyHandheldFloat(t) {
      if (prefersReducedMotion) {
        camera.position.copy(cameraBasePos);
        camera.quaternion.copy(cameraBaseQuat);
        return;
      }
      var p = currentPreset.float.pos;
      var r = currentPreset.float.rot;
      var w = (2 * Math.PI) / currentPreset.float.period;
      camera.position.x = cameraBasePos.x + smoothNoise(t * w, 0)   * p;
      camera.position.y = cameraBasePos.y + smoothNoise(t * w, 100) * p;
      camera.position.z = cameraBasePos.z + smoothNoise(t * w, 200) * p;
      var rx = smoothNoise(t * w * 1.2, 300) * r;
      var ry = smoothNoise(t * w * 1.2, 400) * r;
      camera.rotation.set(camera.rotation.x + rx, camera.rotation.y + ry, 0);
    }

    // Update loop — called every frame from screensaver.js
    function update(t, scrollY) {
      applyHandheldFloat(t);
      // Animate shide sway
      for (var smi = 0; smi < shideMaterials.length; smi++) {
        shideMaterials[smi].uniforms.uTime.value = t;
      }
      // Billboards face camera
      for (var bi = 0; bi < layers.shrine.children.length; bi++) {
        var b = layers.shrine.children[bi];
        if (b.userData && b.userData.isBillboard) b.lookAt(camera.position);
      }
      // God-ray slow opacity breath
      for (var gi = 0; gi < godRayMaterials.length; gi++) {
        var phase = godRayMaterials[gi].userData.godRayPhase;
        godRayMaterials[gi].opacity = 0.50 + Math.sin(t * 0.4 + phase) * 0.08;
      }
      // Fog wisp drift
      for (var wi = 0; wi < fogWispData.length; wi++) {
        var d = fogWispData[wi];
        dummy.position.set(
          d.baseX + Math.sin(t * d.speed + d.driftPhase) * 1.2,
          d.baseY + Math.sin(t * d.speed * 1.3 + d.driftPhase) * 0.2,
          d.baseZ + Math.cos(t * d.speed + d.driftPhase) * 0.6
        );
        dummy.lookAt(camera.position);
        dummy.updateMatrix();
        fogWispMesh.setMatrixAt(wi, dummy.matrix);
      }
      fogWispMesh.instanceMatrix.needsUpdate = true;
      // Falling needles
      for (var npi = 0; npi < needleData.length; npi++) {
        var nd = needleData[npi];
        nd.x += nd.vx;
        nd.y += nd.vy;
        nd.rotZ += nd.spin * 0.02;
        if (nd.y < -0.2) {
          nd.y = 14;
          nd.x = (Math.random() - 0.5) * 20;
          nd.z = 6 + Math.random() * 30;
        }
        dummy.position.set(nd.x, nd.y, nd.z);
        dummy.rotation.set(0, 0, nd.rotZ);
        dummy.updateMatrix();
        needleMesh.setMatrixAt(npi, dummy.matrix);
      }
      needleMesh.instanceMatrix.needsUpdate = true;
      // Bird scripted flight
      if (t > birdNextStart && !birdMesh.visible) {
        birdMesh.visible = true;
        birdMesh.position.set(-30, 7 + Math.random() * 3, 50 + Math.random() * 15);
        birdMesh.userData.startT = t;
      }
      if (birdMesh.visible) {
        var bdt = t - birdMesh.userData.startT;
        birdMesh.position.x = -30 + bdt * 6;
        if (birdMesh.position.x > 30) {
          birdMesh.visible = false;
          birdNextStart = t + 30 + Math.random() * 30;
        }
      }
      // Lantern flicker
      for (var li2 = 0; li2 < lanternLights.length; li2++) {
        var L = lanternLights[li2];
        var noise = (
          Math.sin(t * 7.3 + L.userData.basePhase) * 0.5 +
          Math.sin(t * 13.1 + L.userData.basePhase * 2.1) * 0.3
        ) * 0.15;
        L.intensity = L.userData.baseIntensity + noise;
      }
      // Moss glow pulse
      for (var mpi = 0; mpi < lanternMossPatches.length; mpi++) {
        var mp = lanternMossPatches[mpi];
        var pulse = 1.0 + Math.sin(t * 0.5 + mpi * 1.7) * 0.12;
        mp.material.color.setRGB(pulse, pulse, pulse);
      }
      // (Grain disabled — see scene assembly above)
      // ─── Scroll parallax ──────────────────────────────────
      var SCROLL_PIXELS_PER_UNIT = 200;
      var sUnits = -(scrollY || 0) / SCROLL_PIXELS_PER_UNIT;
      layers.silhouette.position.y = sUnits * 0.05;
      layers.midGrove.position.y   = sUnits * 0.15;
      layers.hero.position.y       = sUnits * 0.40;
      layers.shrine.position.y     = sUnits * 0.60;
      layers.foreground.position.y = sUnits * 1.00;
    }

    // ─── Tier matrix ──────────────────────────────────────────
    var TIER_MATRIX = {
      high: {
        midGroveCount: 8, shrineCount: 13,
        needles: 60, fogWisps: 20, godRays: 5,
        bird: true, lanternRealLights: true, flickerActive: true,
        mossGlow: true, scintillation: true,
        phosphorMix: 0.7, renderScale: 1.0, pixelRatioCap: 2.0
      },
      med: {
        midGroveCount: 8, shrineCount: 11,
        needles: 30, fogWisps: 8, godRays: 3,
        bird: true, lanternRealLights: true, flickerActive: true,
        mossGlow: false, scintillation: true,
        phosphorMix: 0.7, renderScale: 0.85, pixelRatioCap: 1.5
      },
      low: {
        midGroveCount: 7, shrineCount: 8,
        needles: 0, fogWisps: 0, godRays: 0,
        bird: false, lanternRealLights: false, flickerActive: false,
        mossGlow: false, scintillation: false,
        phosphorMix: 0.5, renderScale: 0.6, pixelRatioCap: 1.0
      }
    };
    var tierFlags = TIER_MATRIX.high;
    var currentPhosphorMix = 0.7;

    function setTier(tier) {
      if (!TIER_MATRIX[tier]) return;
      currentTier = tier;
      var T = TIER_MATRIX[tier];
      tierFlags = T;
      // Mid-grove count
      for (var i = 0; i < layers.midGrove.children.length; i++) {
        layers.midGrove.children[i].visible = i < T.midGroveCount;
      }
      // Shrine billboards count
      var billboardIdx = 0;
      for (var si = 0; si < layers.shrine.children.length; si++) {
        var ch = layers.shrine.children[si];
        if (ch.userData && ch.userData.isBillboard) {
          ch.visible = billboardIdx < T.shrineCount;
          billboardIdx++;
        }
      }
      // Particles
      if (needleMesh) needleMesh.count = T.needles;
      if (fogWispMesh) fogWispMesh.count = T.fogWisps;
      // God rays
      for (var gi = 0; gi < layers.godRays.children.length; gi++) {
        layers.godRays.children[gi].visible = gi < T.godRays;
      }
      // Bird
      if (birdMesh && !T.bird) birdMesh.visible = false;
      // Lanterns
      for (var li3 = 0; li3 < lanternLights.length; li3++) {
        lanternLights[li3].visible = T.lanternRealLights;
      }
      // Grain
      // Scintillation grain currently disabled at scene assembly.
      void T;
      // Phosphor mix (consumed by getCurrentPhosphorMix())
      currentPhosphorMix = T.phosphorMix;
    }

    // ─── Tsuno anchors (sub-plan 2) ───────────────────────────
    var tsunoAnchors = null;
    function getTsunoAnchors() {
      if (tsunoAnchors) return tsunoAnchors;
      tsunoAnchors = [];
      // Tree anchors — one per hero cedar (just to side of trunk at mid-height)
      for (var hi = 0; hi < heroCedars.length; hi++) {
        var L = heroCedars[hi].layout;
        tsunoAnchors.push({
          id: 'hero_cedar_' + hi,
          pos: [L[0] + (L[3] + 0.3), L[2] * 0.5, L[1]],
          weight: 1.0,
          type: 'tree',
          trunkX: L[0],
          trunkZ: L[1],
          trunkRadius: L[3]
        });
      }
      // Shrine anchors — derived from SHRINE_PROPS
      for (var pi = 0; pi < SHRINE_PROPS.length; pi++) {
        var P = SHRINE_PROPS[pi];
        var atype, weight;
        if (P.type === 'hokora')        { atype = 'shrine';  weight = 1.5; }
        else if (P.type === 'jizo')     { atype = 'shrine';  weight = 1.2; }
        else if (P.type === 'ishidoro') { atype = 'lantern'; weight = 0.6; }
        else if (P.type === 'sotoba')   { atype = 'grave';   weight = 0.9; }
        else if (P.type === 'haka')     { atype = 'grave';   weight = 0.8; }
        else continue;
        tsunoAnchors.push({
          id: P.type + '_' + pi,
          pos: [P.pos[0], P.pos[1] + P.h * 0.7, P.pos[2]],
          weight: weight,
          type: atype
        });
      }
      // Rope anchors — one per hero rope
      for (var ri = 0; ri < heroCedars.length; ri++) {
        var rL = heroCedars[ri].layout;
        var ropeY = rL[2] * 0.45;
        tsunoAnchors.push({
          id: 'shide_rope_' + ri,
          pos: [rL[0] + 0.6, ropeY, rL[1] + 0.6],
          weight: 0.7,
          type: 'rope'
        });
      }
      return tsunoAnchors;
    }

    var trunkColliders = null;
    function getTrunkColliders() {
      if (trunkColliders) return trunkColliders;
      trunkColliders = [];
      for (var hi = 0; hi < heroCedars.length; hi++) {
        var L = heroCedars[hi].layout;
        trunkColliders.push({
          x: L[0], z: L[1],
          radius: L[3] + 0.15,
          height: L[2]
        });
      }
      for (var mi = 0; mi < MID_GROVE_LAYOUT.length; mi++) {
        var ML = MID_GROVE_LAYOUT[mi];
        trunkColliders.push({
          x: ML[0], z: ML[1],
          radius: ML[3] + 0.15,
          height: ML[2]
        });
      }
      return trunkColliders;
    }

    // Phosphor mix accessor (consumed by screensaver's RTT pass)
    function getCurrentPhosphorMix() { return currentPhosphorMix; }

    function dispose() {
      Object.keys(layers).forEach(function (k) {
        scene.remove(layers[k]);
        layers[k].traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        });
      });
      scene.fog = null;
    }

    return {
      update: update,
      setTier: setTier,
      setCameraPreset: setCameraPreset,
      getTsunoAnchors: getTsunoAnchors,
      getTrunkColliders: getTrunkColliders,
      getCurrentPhosphorMix: getCurrentPhosphorMix,
      dispose: dispose,
      // Internal handles for later tasks:
      _layers: layers,
      _presets: PRESETS,
      _currentTier: function () { return currentTier; }
    };
  }

  window.JJ_Forest = { create: create };
})();
