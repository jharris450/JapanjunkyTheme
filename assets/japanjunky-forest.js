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
      // (geometry/shader/parallax updates added by later tasks)
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
