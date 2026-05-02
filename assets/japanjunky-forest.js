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
 *                   bootstrap(),
 *                   assembleFull(),
 *                   getPhosphorPass(),
 *                   getCurrentPhosphorMix(),
 *                   dispose() }
 */
(function () {
  'use strict';

  // ─── Camera presets ──────────────────────────────────────────
  var PRESETS = {
    home: {
      pos:  [-1.5, 1.6, -2],
      look: [3,    1.0, 12],
      fog:  { near: 15, far: 70 },
      fov:  55,
      float: { pos: 0.04, rot: 0.6 * Math.PI / 180, period: 4.0 }
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

    // ─── Layer 0: Sky / fog wall ──────────────────────────────
    // Single billboard plane far behind everything. Amber gradient
    // (light top → deep bottom). Always faces camera implicitly via
    // its z-far placement.
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:    { value: new THREE.Color(0xc46a28) },
        uBottomColor: { value: new THREE.Color(0x2a1208) }
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
        'uniform vec3 uBottomColor;',
        'varying vec2 vUv;',
        'void main() {',
        '  vec3 col = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, vUv.y));',
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
        '  float trunk = step(0.5, noise(floor(vUv.x * 60.0)));',
        '  float h = noise(floor(vUv.x * 60.0) + 0.7) * 0.4 + uHeight;',
        '  float opaque = (vUv.y < h) ? 1.0 : 0.0;',
        '  float a = opaque * (0.6 + 0.4 * trunk);',
        '  if (a < 0.01) discard;',
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

    // ─── Cedar trunk builder ──────────────────────────────────
    // sides: poly count (8/12/16 by tier)
    // height: world units
    // baseRadius/topRadius: tapered trunk shape
    // barkTex: THREE.Texture (cedar bark, NEAREST sampling expected)
    function buildCedar(sides, height, baseRadius, topRadius, barkTex) {
      var geo = new THREE.CylinderGeometry(topRadius, baseRadius, height, sides, 1, true);
      // Per-vertex AO: darken base, lighten top (vertex colors used as multiply)
      var colors = [];
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var y = pos.getY(i);
        var t = (y + height / 2) / height; // 0 = bottom, 1 = top
        var c = 0.45 + 0.55 * t;
        colors.push(c, c, c);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      var mat = new THREE.MeshBasicMaterial({
        map: barkTex,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.isTrunk = true;
      return mesh;
    }

    // ─── Placeholder bark (replaced by real PNG in Task 19) ──
    function makePlaceholderBark() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#3a2114';
      ctx.fillRect(0, 0, 64, 128);
      ctx.strokeStyle = '#5a3520';
      ctx.lineWidth = 1;
      for (var i = 0; i < 12; i++) {
        var x = Math.floor(Math.random() * 64);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 4, 128);
        ctx.stroke();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var barkTex = (opts.textures && opts.textures.bark) || makePlaceholderBark();

    // ─── Layer 2: Mid grove ───────────────────────────────────
    // 6-8 cedars distributed in z=30..50, smaller than hero cedars
    var MID_GROVE_LAYOUT = [
      // [x,    z,    height, baseR, topR]
      [-12, 32, 11, 0.7, 0.4],
      [ -7, 38, 10, 0.6, 0.4],
      [  4, 35, 12, 0.8, 0.5],
      [  9, 42, 11, 0.7, 0.4],
      [ 14, 48, 10, 0.6, 0.4],
      [ -3, 45, 13, 0.8, 0.5],
      [ -9, 50, 11, 0.7, 0.4],
      [  7, 50, 10, 0.6, 0.4]
    ];
    function buildMidGrove(count) {
      for (var i = 0; i < Math.min(count, MID_GROVE_LAYOUT.length); i++) {
        var L = MID_GROVE_LAYOUT[i];
        var sides = 12;
        var c = buildCedar(sides, L[2], L[3], L[4], barkTex);
        c.position.set(L[0], L[2] / 2 - 0.5, L[1]);
        layers.midGrove.add(c);
      }
    }
    buildMidGrove(8);

    // ─── Layer 3: Hero cedars (giants near camera) ────────────
    var HERO_LAYOUT = [
      // [x,   z,  height, baseR, topR]
      [ 4,   12, 18, 1.4, 0.7],
      [-2,   14, 16, 1.2, 0.6],
      [ 6,   18, 17, 1.3, 0.7],
      [-5,   20, 15, 1.1, 0.6]
    ];
    var heroCedars = [];
    function buildHeroCedars(count) {
      for (var i = 0; i < Math.min(count, HERO_LAYOUT.length); i++) {
        var L = HERO_LAYOUT[i];
        var sides = 16;
        var c = buildCedar(sides, L[2], L[3], L[4], barkTex);
        c.position.set(L[0], L[2] / 2 - 0.3, L[1]);
        layers.hero.add(c);
        heroCedars.push({ mesh: c, layout: L });
      }
    }
    buildHeroCedars(4);

    // ─── Shimenawa rope ───────────────────────────────────────
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
      var mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMap: { value: shideTex } },
        vertexShader: SHIDE_VERT,
        fragmentShader: SHIDE_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        fog: true
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

    var SHRINE_PROPS = [
      { type: 'hokora',   w: 1.0, h: 0.9, hex: '#7a6a55', pos: [3.6, 0.45, 10.6] },
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [1.2, 0.35, 9.0] },
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [0.8, 0.35, 9.3] },
      { type: 'jizo',     w: 0.4, h: 0.7, hex: '#9a8a78', pos: [1.5, 0.35, 9.4] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [2.0, 0.7, 11.0] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [4.0, 0.7, 13.5] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [-3.0, 0.7, 14.0] },
      { type: 'ishidoro', w: 0.5, h: 1.4, hex: '#8a7a64', pos: [5.5, 0.7, 16.0] },
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [4.7, 0.8, 11.0] },
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [4.9, 0.8, 11.2] },
      { type: 'sotoba',   w: 0.15, h: 1.6, hex: '#6a5040', pos: [5.1, 0.8, 11.1] },
      { type: 'haka',     w: 0.5, h: 0.4, hex: '#7a7060', pos: [-4.2, 0.2, 13.0] },
      { type: 'haka',     w: 0.5, h: 0.4, hex: '#7a7060', pos: [-4.8, 0.2, 13.3] }
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

    // ─── Layer 5: Foreground roots / moss ─────────────────────
    function makePlaceholderMoss() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#2a4a1c';
      ctx.fillRect(0, 0, 64, 64);
      for (var i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(60,90,30,0.5)';
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

    var fgGeo = new THREE.SphereGeometry(2.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    var fgMat = new THREE.MeshBasicMaterial({ map: mossTex, fog: true });
    mossTex.repeat.set(2, 2);
    var fgMound = new THREE.Mesh(fgGeo, fgMat);
    fgMound.position.set(-3, -0.5, 3);
    fgMound.scale.set(1.5, 0.6, 1.0);
    layers.foreground.add(fgMound);

    // ─── Layer 6: Road slice ──────────────────────────────────
    function makePlaceholderRoad() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, 64, 256);
      ctx.fillStyle = '#4a3e30';
      ctx.fillRect(30, 0, 4, 256);
      var tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    var roadTex = makePlaceholderRoad();
    roadTex.repeat.set(1, 8);
    var roadGeo = new THREE.PlaneGeometry(3, 30);
    var roadMat = new THREE.MeshBasicMaterial({ map: roadTex, fog: true });
    var roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(-4, 0.01, 8);
    layers.road.add(roadMesh);

    // Distance fog
    scene.fog = new THREE.Fog(0x2a1208, currentPreset.fog.near, currentPreset.fog.far);

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
    }

    // Tier setter (full implementation in perf phase)
    function setTier(tier) { currentTier = tier; }

    // Anchor/collider stubs (implemented in sub-plan 2)
    function getTsunoAnchors() { return []; }
    function getTrunkColliders() { return []; }

    // Two-phase construction stubs
    function bootstrap() { /* implemented in perf-tier task */ }
    function assembleFull() { /* implemented in perf-tier task */ }

    // Phosphor pass stubs (implemented in shader phase)
    function getPhosphorPass() { return null; }
    function getCurrentPhosphorMix() { return 0.7; }

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
      bootstrap: bootstrap,
      assembleFull: assembleFull,
      getPhosphorPass: getPhosphorPass,
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
