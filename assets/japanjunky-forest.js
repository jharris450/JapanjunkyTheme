/**
 * JapanJunky Forest — PS1-era Japanese forest stone-path scene.
 *
 * Spec (2026-05-02): narrow stone stairway between mossy boulders,
 * two ishidoro lanterns flanking the steps, tall bare cedar trunks
 * fading into lavender-grey fog. White spore particles drift through
 * the air. Low-angle camera looking up the path.
 *
 * Rendering style: visible-faceted low-poly geometry, MeshLambertMaterial
 * with vertex colors for baked-AO look, NEAREST sampling, vertex snap +
 * subtle vertex jitter for PS1 wobble, FogExp2 thick fog. Single ambient +
 * one weak directional light only.
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
  // home: low angle at base of steps, looking up the path.
  // product/login presets keep existing convention but use new palette.
  var PRESETS = {
    home: {
      pos:    [0, 1.0, -1.5],
      look:   [0, 3.0, 16],
      fogDensity: 0.055,
      fov:    62,
      float:  { pos: 0.04, rot: 0.6 * Math.PI / 180, period: 4.0 }
    },
    product: {
      pos:    [2, 1.4, 4],
      look:   [4, 1.5, 14],
      fogDensity: 0.075,
      fov:    50,
      float:  { pos: 0.025, rot: 0.4 * Math.PI / 180, period: 5.0 }
    },
    login: {
      pos:    [0, 0.8, 6],
      look:   [0, 4.5, 18],
      fogDensity: 0.045,
      fov:    62,
      float:  { pos: 0.05, rot: 0.5 * Math.PI / 180, period: 4.5 }
    }
  };

  function create(scene, camera, clock, opts) {
    opts = opts || {};
    var currentTier = opts.tier || 'high';
    var currentPreset = PRESETS[opts.cameraPreset] || PRESETS.home;
    var cameraBasePos = new THREE.Vector3();
    var cameraBaseQuat = new THREE.Quaternion();

    // Layer roots
    var layers = {
      sky:        new THREE.Group(),
      backdrop:   new THREE.Group(),   // distant silhouette ridge
      walls:      new THREE.Group(),   // rock walls framing path
      midGrove:   new THREE.Group(),   // far cedar trunks
      hero:       new THREE.Group(),   // close cedar trunks
      lanterns:   new THREE.Group(),   // ishidoro lanterns + small props
      steps:      new THREE.Group(),   // stone stairway
      ground:     new THREE.Group(),   // forest floor + boulders
      particles:  new THREE.Group()    // floating spores
    };
    Object.keys(layers).forEach(function (k) { scene.add(layers[k]); });

    // Lavender-grey FogExp2 — thick enough to hide cedar canopies
    scene.fog = new THREE.FogExp2(0xb8a9c4, currentPreset.fogDensity);

    // Lighting — minimal, overcast
    var ambient = new THREE.AmbientLight(0xa8a4b8, 0.7);
    scene.add(ambient);
    var keyLight = new THREE.DirectionalLight(0xc8c0d4, 0.45);
    keyLight.position.set(0.3, 1.0, 0.4);
    scene.add(keyLight);

    function applyPreset(p) {
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      camera.lookAt(p.look[0], p.look[1], p.look[2]);
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      cameraBasePos.copy(camera.position);
      cameraBaseQuat.copy(camera.quaternion);
      scene.fog.density = p.fogDensity;
    }
    applyPreset(currentPreset);

    function setCameraPreset(name) {
      if (!PRESETS[name]) return;
      currentPreset = PRESETS[name];
      applyPreset(currentPreset);
    }

    // ─── Handheld float ───────────────────────────────────────
    var prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function smoothNoise(t, seed) {
      return Math.sin(t * 0.73 + seed) * 0.5
           + Math.sin(t * 1.37 + seed * 2.1) * 0.3
           + Math.sin(t * 2.11 + seed * 3.7) * 0.2;
    }
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
      camera.rotation.x += smoothNoise(t * w * 1.2, 300) * r;
      camera.rotation.y += smoothNoise(t * w * 1.2, 400) * r;
    }

    // ─── PS1 vertex-snap shader injection ─────────────────────
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
            '             * gl_Position.w / uSnapRes;'
          ].join('\n')
        );
      };
      mat.userData = mat.userData || {};
      mat.userData.psSnap = true;
      mat.needsUpdate = true;
    }

    // ─── Per-vertex AO bake helper ────────────────────────────
    // Multiply vertex color into geometry: bottom darker, top lighter.
    function bakeVertexAO(geo, axis, baseDarkness) {
      axis = axis || 'y';
      baseDarkness = baseDarkness || 0.4;
      var pos = geo.attributes.position;
      var min = Infinity, max = -Infinity;
      for (var i = 0; i < pos.count; i++) {
        var v = pos['get' + axis.toUpperCase()](i);
        if (v < min) min = v;
        if (v > max) max = v;
      }
      var range = max - min || 1;
      var colors = [];
      for (var j = 0; j < pos.count; j++) {
        var n = (pos['get' + axis.toUpperCase()](j) - min) / range;
        var b = baseDarkness + (1 - baseDarkness) * n;
        colors.push(b, b, b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    // ─── Materials (shared) ───────────────────────────────────
    var trunkMat = new THREE.MeshLambertMaterial({
      color: 0x6a4a32,
      vertexColors: true,
      flatShading: true,
      fog: true
    });
    injectVertexSnap(trunkMat);

    var rockMat = new THREE.MeshLambertMaterial({
      color: 0x4e5a48,        // mossy green-grey
      vertexColors: true,
      flatShading: true,
      fog: true
    });
    injectVertexSnap(rockMat);

    var stepMat = new THREE.MeshLambertMaterial({
      color: 0x6a685c,
      vertexColors: true,
      flatShading: true,
      fog: true
    });
    injectVertexSnap(stepMat);

    var lanternMat = new THREE.MeshLambertMaterial({
      color: 0x9890a0,
      vertexColors: true,
      flatShading: true,
      fog: true
    });
    injectVertexSnap(lanternMat);

    var groundMat = new THREE.MeshLambertMaterial({
      color: 0x3a3828,
      flatShading: true,
      fog: true
    });
    injectVertexSnap(groundMat);

    // ─── Sky billboard (lavender-grey gradient) ──────────────
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:    { value: new THREE.Color(0xb8a9c4) },
        uBottomColor: { value: new THREE.Color(0x4a4250) }
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
    var skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 100), skyMat);
    skyMesh.position.set(0, 0, 60);
    skyMesh.renderOrder = -10;
    layers.sky.add(skyMesh);

    // ─── Ground plane ─────────────────────────────────────────
    var groundGeo = new THREE.PlaneGeometry(60, 80);
    var groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(0, -0.05, 20);
    layers.ground.add(groundMesh);

    // ─── Cedar trunk builder (low-poly, faceted, BARE) ────────
    // Tall thin cylinder, 6 sides (visible facets per PS1 spec).
    // No foliage — canopy is hidden in fog above.
    function buildCedarTrunk(x, z, height, baseR, topR) {
      var geo = new THREE.CylinderGeometry(topR, baseR, height, 6, 1, false);
      bakeVertexAO(geo, 'y', 0.35);   // dark base, lighter top
      var mesh = new THREE.Mesh(geo, trunkMat);
      mesh.position.set(x, height / 2 - 0.2, z);
      // Slight random rotation around Y so all trunks aren't identical
      mesh.rotation.y = Math.random() * Math.PI * 2;
      return mesh;
    }

    // Hero trunks — closest, tallest. Flank the path tightly.
    var HERO_TRUNK_LAYOUT = [
      // [x,    z,  height, baseR, topR]
      [ -2.4,  4,   18, 0.40, 0.30],
      [ -2.6,  9,   17, 0.40, 0.28],
      [ -2.8, 14,   18, 0.35, 0.25],
      [  2.4,  3,   18, 0.40, 0.30],
      [  2.6,  8,   17, 0.40, 0.28],
      [  2.8, 13,   18, 0.35, 0.25]
    ];
    for (var hi = 0; hi < HERO_TRUNK_LAYOUT.length; hi++) {
      var H = HERO_TRUNK_LAYOUT[hi];
      layers.hero.add(buildCedarTrunk(H[0], H[1], H[2], H[3], H[4]));
    }

    // Mid-grove trunks — deeper, smaller in apparent size due to fog
    var MID_TRUNK_LAYOUT = [
      [ -3.5, 18, 16, 0.35, 0.25],
      [ -2.0, 22, 15, 0.30, 0.22],
      [ -3.2, 27, 15, 0.30, 0.22],
      [  3.5, 19, 16, 0.35, 0.25],
      [  2.0, 24, 15, 0.30, 0.22],
      [  3.2, 28, 15, 0.30, 0.22],
      [ -1.0, 32, 14, 0.28, 0.20],
      [  1.0, 34, 14, 0.28, 0.20]
    ];
    for (var mi = 0; mi < MID_TRUNK_LAYOUT.length; mi++) {
      var M = MID_TRUNK_LAYOUT[mi];
      layers.midGrove.add(buildCedarTrunk(M[0], M[1], M[2], M[3], M[4]));
    }

    // ─── Rock walls (corridor framing) ────────────────────────
    // Stack of jagged BoxGeometry chunks on both sides — moss-coloured.
    function buildRockBlock(x, y, z, sx, sy, sz, rotY) {
      var geo = new THREE.BoxGeometry(sx, sy, sz);
      bakeVertexAO(geo, 'y', 0.3);
      var mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      mesh.rotation.z = (Math.random() - 0.5) * 0.15;
      return mesh;
    }
    var WALL_LAYOUT = [
      // Left wall — irregular stack
      [ -4.5, 1.4,  3,   3.0, 2.8, 3.2,  0.20],
      [ -5.0, 2.0,  7,   2.6, 4.0, 4.0, -0.15],
      [ -4.7, 1.6, 12,   3.2, 3.2, 3.5,  0.10],
      [ -5.2, 2.4, 18,   3.0, 4.8, 4.0, -0.20],
      [ -4.6, 1.8, 24,   2.8, 3.6, 3.4,  0.15],
      // Right wall
      [  4.5, 1.4,  4,   3.0, 2.8, 3.2, -0.18],
      [  4.9, 2.2,  9,   2.8, 4.4, 4.0,  0.20],
      [  4.6, 1.6, 14,   3.0, 3.2, 3.5, -0.10],
      [  5.1, 2.4, 20,   3.0, 4.8, 4.0,  0.22],
      [  4.7, 1.8, 26,   2.8, 3.6, 3.4, -0.15]
    ];
    for (var wi = 0; wi < WALL_LAYOUT.length; wi++) {
      var W = WALL_LAYOUT[wi];
      layers.walls.add(buildRockBlock(W[0], W[1], W[2], W[3], W[4], W[5], W[6]));
    }

    // Smaller boulders scattered around the path edge
    function buildBoulder(x, y, z, scale, rotY) {
      var geo = new THREE.DodecahedronGeometry(1, 0);
      bakeVertexAO(geo, 'y', 0.4);
      var mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(scale, scale * 0.7, scale);
      mesh.rotation.y = rotY;
      return mesh;
    }
    var BOULDER_LAYOUT = [
      [-1.8, 0.3, 2.5, 0.6, 0.4],
      [ 1.7, 0.3, 3.0, 0.5, 0.7],
      [-1.6, 0.25, 7.0, 0.5, 0.2],
      [ 1.5, 0.3, 9.0, 0.6, -0.3],
      [-1.7, 0.3, 12.5, 0.5, 0.5],
      [ 1.6, 0.25, 15.0, 0.5, 0.0]
    ];
    for (var bi = 0; bi < BOULDER_LAYOUT.length; bi++) {
      var B = BOULDER_LAYOUT[bi];
      layers.ground.add(buildBoulder(B[0], B[1], B[2], B[3], B[4]));
    }

    // ─── Stone stairway (rough irregular slabs ascending) ────
    var STEP_COUNT = 14;
    var stepStartZ = 1.5;
    var stepDepth = 1.0;
    var stepRise = 0.18;
    var stepWidth = 2.6;
    for (var si = 0; si < STEP_COUNT; si++) {
      var w = stepWidth + (Math.random() - 0.5) * 0.5;
      var d = stepDepth + (Math.random() - 0.5) * 0.2;
      var slabGeo = new THREE.BoxGeometry(w, 0.32, d);
      bakeVertexAO(slabGeo, 'y', 0.5);
      var slab = new THREE.Mesh(slabGeo, stepMat);
      slab.position.set(
        (Math.random() - 0.5) * 0.25,
        si * stepRise,
        stepStartZ + si * stepDepth
      );
      slab.rotation.y = (Math.random() - 0.5) * 0.08;
      layers.steps.add(slab);
    }

    // ─── Stone lantern builder (ishidoro) ────────────────────
    // Stack: base block, body, light box, cap pyramid. 4-5 boxes total.
    function buildIshidoro(x, z, scale) {
      var s = scale;
      var group = new THREE.Group();
      // Base
      var baseG = new THREE.BoxGeometry(0.9 * s, 0.3 * s, 0.9 * s);
      bakeVertexAO(baseG, 'y', 0.5);
      var base = new THREE.Mesh(baseG, lanternMat);
      base.position.y = 0.15 * s;
      group.add(base);
      // Body (narrower cylinder/box)
      var bodyG = new THREE.CylinderGeometry(0.3 * s, 0.32 * s, 1.0 * s, 6);
      bakeVertexAO(bodyG, 'y', 0.6);
      var body = new THREE.Mesh(bodyG, lanternMat);
      body.position.y = 0.3 * s + 0.5 * s;
      group.add(body);
      // Light box
      var lightG = new THREE.BoxGeometry(0.7 * s, 0.65 * s, 0.7 * s);
      bakeVertexAO(lightG, 'y', 0.55);
      var light = new THREE.Mesh(lightG, lanternMat);
      light.position.y = 0.3 * s + 1.0 * s + 0.325 * s;
      group.add(light);
      // Cap (pyramidal — cone with 4 sides)
      var capG = new THREE.ConeGeometry(0.65 * s, 0.45 * s, 4);
      bakeVertexAO(capG, 'y', 0.6);
      var cap = new THREE.Mesh(capG, lanternMat);
      cap.position.y = 0.3 * s + 1.0 * s + 0.65 * s + 0.225 * s;
      cap.rotation.y = Math.PI / 4;
      group.add(cap);
      // Top finial (small box)
      var finG = new THREE.BoxGeometry(0.15 * s, 0.2 * s, 0.15 * s);
      bakeVertexAO(finG, 'y', 0.6);
      var fin = new THREE.Mesh(finG, lanternMat);
      fin.position.y = 0.3 * s + 1.0 * s + 0.65 * s + 0.45 * s + 0.1 * s;
      group.add(fin);

      group.position.set(x, 0, z);
      return group;
    }
    layers.lanterns.add(buildIshidoro(-2.0, 3.5, 1.8));
    layers.lanterns.add(buildIshidoro( 2.0, 4.0, 1.8));

    // ─── Floating spore particles (white dust motes) ─────────
    var PARTICLE_COUNT = 100;
    var pPositions = new Float32Array(PARTICLE_COUNT * 3);
    var pPhases = new Float32Array(PARTICLE_COUNT);
    for (var pi = 0; pi < PARTICLE_COUNT; pi++) {
      pPositions[pi * 3]     = (Math.random() - 0.5) * 16;
      pPositions[pi * 3 + 1] = 0.3 + Math.random() * 5.5;
      pPositions[pi * 3 + 2] = 1 + Math.random() * 30;
      pPhases[pi] = Math.random() * Math.PI * 2;
    }
    var particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('basePos',  new THREE.BufferAttribute(pPositions.slice(), 3));
    particleGeo.setAttribute('aPhase',   new THREE.BufferAttribute(pPhases, 1));
    var particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      fog: true
    });
    var particles = new THREE.Points(particleGeo, particleMat);
    layers.particles.add(particles);

    function updateParticles(t) {
      var pos = particleGeo.attributes.position.array;
      var base = particleGeo.attributes.basePos.array;
      var phases = particleGeo.attributes.aPhase.array;
      for (var i = 0; i < PARTICLE_COUNT; i++) {
        var p = phases[i];
        pos[i * 3]     = base[i * 3]     + Math.sin(t * 0.18 + p) * 0.4;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.12 + p * 1.7) * 0.3;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.14 + p) * 0.4;
      }
      particleGeo.attributes.position.needsUpdate = true;
    }

    // ─── PS1 vertex jitter (per-frame, applied to selected meshes) ──
    // Subtle position perturbation on world-space geometry — emulates
    // PS1 affine warp without a custom shader.
    var jitterTargets = [];
    function registerJitter(mesh, amplitude) {
      var pos = mesh.geometry.attributes.position;
      if (!pos) return;
      var orig = new Float32Array(pos.array.length);
      orig.set(pos.array);
      jitterTargets.push({
        mesh: mesh,
        orig: orig,
        amp: amplitude || 0.004
      });
    }
    // Apply jitter to step slabs + boulders + small props (small geometry).
    layers.steps.children.forEach(function (m) { registerJitter(m, 0.005); });
    layers.ground.children.forEach(function (m) {
      if (m !== groundMesh) registerJitter(m, 0.004);
    });

    function applyJitter() {
      for (var i = 0; i < jitterTargets.length; i++) {
        var jt = jitterTargets[i];
        var pos = jt.mesh.geometry.attributes.position.array;
        for (var v = 0; v < pos.length; v += 3) {
          pos[v]     = jt.orig[v]     + (Math.random() - 0.5) * jt.amp;
          pos[v + 1] = jt.orig[v + 1] + (Math.random() - 0.5) * jt.amp;
          pos[v + 2] = jt.orig[v + 2] + (Math.random() - 0.5) * jt.amp;
        }
        jt.mesh.geometry.attributes.position.needsUpdate = true;
      }
    }

    // ─── Tier matrix ──────────────────────────────────────────
    var TIER_MATRIX = {
      high: { jitter: true,  particles: PARTICLE_COUNT, fogDensityMul: 1.0,
              renderScale: 1.0, pixelRatioCap: 2.0 },
      med:  { jitter: true,  particles: 60,             fogDensityMul: 1.0,
              renderScale: 0.85, pixelRatioCap: 1.5 },
      low:  { jitter: false, particles: 30,             fogDensityMul: 0.9,
              renderScale: 0.6, pixelRatioCap: 1.0 }
    };
    var tierFlags = TIER_MATRIX.high;
    var jitterEnabled = true;

    function setTier(tier) {
      if (!TIER_MATRIX[tier]) return;
      currentTier = tier;
      tierFlags = TIER_MATRIX[tier];
      jitterEnabled = tierFlags.jitter;
      // Particle count
      particleGeo.setDrawRange(0, tierFlags.particles);
      // Fog density adjust slightly
      scene.fog.density = currentPreset.fogDensity * tierFlags.fogDensityMul;
    }

    // ─── Tsuno anchors (preserved API for sub-plan 2) ────────
    var tsunoAnchors = null;
    function getTsunoAnchors() {
      if (tsunoAnchors) return tsunoAnchors;
      tsunoAnchors = [];
      // Trees
      for (var i = 0; i < HERO_TRUNK_LAYOUT.length; i++) {
        var H = HERO_TRUNK_LAYOUT[i];
        tsunoAnchors.push({
          id: 'hero_trunk_' + i,
          pos: [H[0] + (H[3] + 0.4) * (H[0] > 0 ? 1 : -1), H[2] * 0.5, H[1]],
          weight: 1.0,
          type: 'tree',
          trunkX: H[0],
          trunkZ: H[1],
          trunkRadius: H[3]
        });
      }
      // Lanterns (foreground)
      tsunoAnchors.push({ id: 'lantern_l', pos: [-2.0, 3.0, 3.5], weight: 0.6, type: 'lantern' });
      tsunoAnchors.push({ id: 'lantern_r', pos: [ 2.0, 3.0, 4.0], weight: 0.6, type: 'lantern' });
      // Top of steps
      tsunoAnchors.push({ id: 'top_steps', pos: [0, 2.5, 18.0], weight: 0.8, type: 'shrine' });
      return tsunoAnchors;
    }

    var trunkColliders = null;
    function getTrunkColliders() {
      if (trunkColliders) return trunkColliders;
      trunkColliders = [];
      for (var i = 0; i < HERO_TRUNK_LAYOUT.length; i++) {
        var H = HERO_TRUNK_LAYOUT[i];
        trunkColliders.push({
          x: H[0], z: H[1],
          radius: H[3] + 0.15,
          height: H[2]
        });
      }
      for (var j = 0; j < MID_TRUNK_LAYOUT.length; j++) {
        var M = MID_TRUNK_LAYOUT[j];
        trunkColliders.push({
          x: M[0], z: M[1],
          radius: M[3] + 0.15,
          height: M[2]
        });
      }
      return trunkColliders;
    }

    // ─── Phosphor mix (no-op for this scene — palette stays cool) ──
    function getCurrentPhosphorMix() { return 0.0; }

    // ─── Update loop (per frame) ─────────────────────────────
    function update(t, scrollY) {
      applyHandheldFloat(t);
      updateParticles(t);
      if (jitterEnabled) applyJitter();
      // Subtle parallax on layer roots based on scrollY
      var sy = -(scrollY || 0) / 220;
      layers.midGrove.position.y = sy * 0.10;
      layers.hero.position.y     = sy * 0.30;
      layers.walls.position.y    = sy * 0.20;
      layers.ground.position.y   = sy * 0.50;
    }

    // ─── Dispose ──────────────────────────────────────────────
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
      scene.remove(ambient);
      scene.remove(keyLight);
    }

    return {
      update: update,
      setTier: setTier,
      setCameraPreset: setCameraPreset,
      getTsunoAnchors: getTsunoAnchors,
      getTrunkColliders: getTrunkColliders,
      getCurrentPhosphorMix: getCurrentPhosphorMix,
      dispose: dispose,
      // Internal handles (debug)
      _layers: layers,
      _presets: PRESETS,
      _currentTier: function () { return currentTier; }
    };
  }

  window.JJ_Forest = { create: create };
})();
