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

    // ── STEP 2: Stone stairs ────────────────────────────────
    // 14 individual rough-cut box slabs stepping up the slope.
    // Each slab partially embedded (bottom below the slope plane at that z)
    // so they read as set into the ground, not floating.
    // Slope rises ~28° starting from z=0 area; we ramp y linearly per step.
    var STEP_COUNT = 14;
    var STEP_Z_START = 1.5;   // first step just in front of camera
    var STEP_Z_DELTA = 1.0;   // depth of each step in z
    var STEP_Y_RISE  = 0.20;  // each step lifts y by this much
    var STEP_Y_BASE  = -0.55; // first step deeper into ground
    var STEP_W       = 2.6;
    var STEP_D       = 1.0;
    var STEP_H       = 0.32;
    // Stairs curve from viewport-right to viewport-left as they ascend.
    // Base at x=+3 (where Tsuno renders), top sweeps left to x=-2.
    var STEP_X_BASE  =  3.0;
    var STEP_X_TOP   = -2.0;
    var STEP_X_CURVE = 1.4;   // exponent — higher = sharper top-end curve

    var stepMatColor = new THREE.Color(0x6a685c);
    for (var s = 0; s < STEP_COUNT; s++) {
      // Slight per-step jitter so stairs feel hand-placed
      var w = STEP_W + (Math.random() - 0.5) * 0.5;
      var d = STEP_D + (Math.random() - 0.5) * 0.2;
      var h = STEP_H + (Math.random() - 0.5) * 0.08;

      var slabGeo = new THREE.BoxGeometry(w, h, d);
      // Bake darker shading on bottom faces so embedded portion reads dark
      var slabPos = slabGeo.attributes.position;
      var slabColors = [];
      for (var v = 0; v < slabPos.count; v++) {
        var ny = slabPos.getY(v); // -h/2 (bottom) to +h/2 (top)
        var brightness = ny > 0 ? 0.95 : 0.55;
        slabColors.push(
          stepMatColor.r * brightness,
          stepMatColor.g * brightness,
          stepMatColor.b * brightness
        );
      }
      slabGeo.setAttribute('color', new THREE.Float32BufferAttribute(slabColors, 3));

      var slabMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        fog: true
      });
      var slab = new THREE.Mesh(slabGeo, slabMat);

      // Position along the curve: x = lerp(base, top) along a quadratic
      // curve, z linear, y linear. Hand-placed jitter on top.
      var t = STEP_COUNT > 1 ? s / (STEP_COUNT - 1) : 0;
      var curveT = Math.pow(t, STEP_X_CURVE);
      var curveX = STEP_X_BASE + (STEP_X_TOP - STEP_X_BASE) * curveT;

      slab.position.set(
        curveX + (Math.random() - 0.5) * 0.25,
        STEP_Y_BASE + s * STEP_Y_RISE,
        STEP_Z_START + s * STEP_Z_DELTA
      );
      // Yaw the slab so it points perpendicular to the path direction
      // (path tangent on xz plane). Approximate path slope:
      var dx = (STEP_X_TOP - STEP_X_BASE) * STEP_X_CURVE *
               Math.pow(Math.max(t, 0.001), STEP_X_CURVE - 1) /
               (STEP_COUNT - 1);
      var dz = STEP_Z_DELTA;
      var pathYaw = Math.atan2(dx, dz);     // angle the slab faces
      slab.rotation.y = pathYaw + (Math.random() - 0.5) * 0.10;
      slab.rotation.z = (Math.random() - 0.5) * 0.06;
      sceneRoot.add(slab);
    }

    // ── STEP 3: Rock walls (corridor framing) ────────────────
    // Two rows of icosahedron boulder clusters running parallel to the
    // path, on the left and right sides. Each cluster is 2-3 icos at
    // slightly different scales/offsets so it reads as a pile, not a
    // single shape. Walls rise 2.5-4m so they frame the path as a corridor.
    var WALL_COUNT = 9;             // clusters per side, evenly spaced along path
    var WALL_OFFSET = 2.6;          // perpendicular distance from path centerline
    var rockBaseColor = new THREE.Color(0x4a4238);
    var rockBaseColorAlt = new THREE.Color(0x382e26);

    function buildBoulderCluster(centerX, centerZ, side) {
      // side = +1 (right of path) or -1 (left of path); used to vary jitter
      var group = new THREE.Group();
      var rocksInCluster = 2 + Math.floor(Math.random() * 2); // 2-3
      for (var r = 0; r < rocksInCluster; r++) {
        var geo = new THREE.IcosahedronGeometry(1, 1); // detail 1 = ~80 tris
        // Bake vertex AO darkening lower verts (sit-on-ground feel)
        var pos = geo.attributes.position;
        var min = Infinity, max = -Infinity;
        for (var v = 0; v < pos.count; v++) {
          var py = pos.getY(v);
          if (py < min) min = py;
          if (py > max) max = py;
        }
        var range = max - min || 1;
        var colors = [];
        for (var v2 = 0; v2 < pos.count; v2++) {
          var n = (pos.getY(v2) - min) / range;
          var brightness = 0.45 + n * 0.55;
          // Mix the two rock colours per-rock for variety
          var base = (r % 2 === 0) ? rockBaseColor : rockBaseColorAlt;
          colors.push(base.r * brightness, base.g * brightness, base.b * brightness);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        var mat = new THREE.MeshLambertMaterial({
          vertexColors: true,
          flatShading: true,
          fog: true
        });
        var mesh = new THREE.Mesh(geo, mat);

        // Non-uniform scale → boulder shape (not spherical)
        var sx = 1.0 + Math.random() * 1.6;
        var sy = 1.6 + Math.random() * 2.0;   // taller than wide for wall feel
        var sz = 1.0 + Math.random() * 1.4;
        mesh.scale.set(sx, sy, sz);

        // Position offset within cluster: small jitter from cluster center
        var ox = (Math.random() - 0.5) * 1.2 + side * Math.random() * 0.4;
        var oz = (Math.random() - 0.5) * 1.4;
        var groundY = sy * 0.5 - 0.2;          // sit on terrain (slightly embedded)
        mesh.position.set(centerX + ox, groundY, centerZ + oz);
        mesh.rotation.set(
          (Math.random() - 0.5) * 0.4,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.4
        );
        group.add(mesh);
      }
      return group;
    }

    // Walk the path and drop a cluster on each side at each waypoint.
    // Use the SAME curve formula as the stairs so walls follow the curve.
    for (var w = 0; w < WALL_COUNT; w++) {
      var tw = WALL_COUNT > 1 ? w / (WALL_COUNT - 1) : 0;
      var pathT = Math.pow(tw, STEP_X_CURVE);
      var pathX = STEP_X_BASE + (STEP_X_TOP - STEP_X_BASE) * pathT;
      var pathZ = STEP_Z_START + tw * (STEP_COUNT - 1) * STEP_Z_DELTA;
      // Path tangent angle so walls offset perpendicular (not just ±X)
      var dx = (STEP_X_TOP - STEP_X_BASE) * STEP_X_CURVE *
               Math.pow(Math.max(tw, 0.001), STEP_X_CURVE - 1) /
               (WALL_COUNT - 1);
      var dz = (STEP_COUNT - 1) * STEP_Z_DELTA / (WALL_COUNT - 1);
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      // Perpendicular vector (rotate tangent 90° in xz plane)
      var perpX = -dz / len;
      var perpZ =  dx / len;

      // Right side
      sceneRoot.add(buildBoulderCluster(
        pathX + perpX * WALL_OFFSET,
        pathZ + perpZ * WALL_OFFSET,
        +1
      ));
      // Left side
      sceneRoot.add(buildBoulderCluster(
        pathX - perpX * WALL_OFFSET,
        pathZ - perpZ * WALL_OFFSET,
        -1
      ));
    }

    // (Steps 4-9 added incrementally — see commits.)

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
