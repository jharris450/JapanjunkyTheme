/**
 * JapanJunky Forest — PS1 Japanese forest path scene.
 * Built level-editor style: every object placed manually as explicit
 * Three.js geometry. No procedural landscape, no abstraction.
 *
 * Build order (each step verified visually before proceeding):
 *   1. Ground plane (hillside slope, vertex-displaced, vertex-coloured)
 *   2. Stone stairs
 *   3. Rock walls
 *   4. Trees (trunk + branches + foliage clusters)
 *   5. Stone lanterns (ishidoro)
 *   6. Moss
 *   7. Atmosphere (fog, particles, lights)
 *   8. PS1 rendering (320×240 RT, vertex jitter)
 *   9. Camera (low angle, idle sway)
 *
 * Depends on: THREE (global)
 * Exposes:    window.JJ_Forest.create(scene, camera, clock, opts)
 */
(function () {
  'use strict';

  // Camera presets — preserved API surface for screensaver.js consumers.
  // Step-9 will tune these; placeholders for now use a low-angle home.
  var PRESETS = {
    home:    { pos: [0, 1.0, -2], look: [0, 3.0, 14], fov: 60 },
    product: { pos: [0, 1.0, -2], look: [0, 3.0, 14], fov: 60 },
    login:   { pos: [0, 1.0, -2], look: [0, 3.0, 14], fov: 60 }
  };

  function create(scene, camera, clock, opts) {
    opts = opts || {};
    var currentPreset = PRESETS[opts.cameraPreset] || PRESETS.home;
    var cameraBasePos = new THREE.Vector3();
    var cameraBaseQuat = new THREE.Quaternion();

    // Single layer group so the dispose path stays clean.
    var sceneRoot = new THREE.Group();
    scene.add(sceneRoot);

    // ── STEP 1: Ground plane (hillside slope) ────────────────
    // 20×20 subdivided plane, tilted 28° to form a slope.
    // Vertex Y displaced for organic bumpiness. Vertex colors
    // alternate dark brown / dark green per-vertex for forest-floor look.
    var GROUND_SIZE = 60;
    var GROUND_SEGS = 20;
    var groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);

    // Displace each vertex Y by a small random offset for bumpy terrain
    var posAttr = groundGeo.attributes.position;
    var colors = [];
    var DARK_BROWN = new THREE.Color(0x3a2818);
    var DARK_GREEN = new THREE.Color(0x2a3a18);
    for (var i = 0; i < posAttr.count; i++) {
      // After PlaneGeometry, position is in XY plane (Z is up). We will
      // rotate the mesh −90° around X so XY becomes XZ ground; Y becomes
      // height. Apply displacement to Z (which becomes Y after rotation).
      var bump = (Math.random() - 0.5) * 0.5;
      posAttr.setZ(i, posAttr.getZ(i) + bump);

      // Vertex colour — mix brown/green based on noise
      var blend = Math.random();
      var c = DARK_BROWN.clone().lerp(DARK_GREEN, blend);
      colors.push(c.r, c.g, c.b);
    }
    posAttr.needsUpdate = true;
    groundGeo.computeVertexNormals();
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    var groundMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      fog: true
    });
    var groundMesh = new THREE.Mesh(groundGeo, groundMat);
    // Lay flat (rotate around X) then tilt up the back edge to slope (28°)
    groundMesh.rotation.x = -Math.PI / 2;            // flat ground first
    groundMesh.rotation.x += -28 * Math.PI / 180;    // tilt 28° so far end rises
    groundMesh.position.set(0, -0.3, 14);            // anchor with center under camera path
    sceneRoot.add(groundMesh);

    // (Steps 2-9 added incrementally — see commits.)

    // ── Minimal lighting so vertex colors register ──
    // Step 7 will replace these with the spec values.
    var tempAmbient = new THREE.AmbientLight(0xffffff, 0.7);
    var tempDir = new THREE.DirectionalLight(0xffffff, 0.6);
    tempDir.position.set(-0.5, 1, 0.3);
    scene.add(tempAmbient);
    scene.add(tempDir);

    // ── Camera (placeholder, Step 9 will refine) ──
    function applyPreset(p) {
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      camera.lookAt(p.look[0], p.look[1], p.look[2]);
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      cameraBasePos.copy(camera.position);
      cameraBaseQuat.copy(camera.quaternion);
    }
    applyPreset(currentPreset);

    function setCameraPreset(name) {
      if (!PRESETS[name]) return;
      currentPreset = PRESETS[name];
      applyPreset(currentPreset);
    }

    // ── Stub API ─────────────────────────────────────────────
    function update(t, scrollY) { /* Step-9 adds idle sway */ }
    function setTier(tier) { /* tier matrix added once scene is full */ }
    function getTsunoAnchors() { return []; }
    function getTrunkColliders() { return []; }
    function getCurrentPhosphorMix() { return 0.0; }

    function dispose() {
      scene.remove(sceneRoot);
      sceneRoot.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      scene.remove(tempAmbient);
      scene.remove(tempDir);
    }

    return {
      update: update,
      setTier: setTier,
      setCameraPreset: setCameraPreset,
      getTsunoAnchors: getTsunoAnchors,
      getTrunkColliders: getTrunkColliders,
      getCurrentPhosphorMix: getCurrentPhosphorMix,
      dispose: dispose,
      _root: sceneRoot
    };
  }

  window.JJ_Forest = { create: create };
})();
