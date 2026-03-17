/**
 * JapanJunky Screensaver — Three.js Lacquer Landscape
 *
 * Low-poly Japanese landscape (Mt. Fuji, wireframe ocean, trees)
 * with floating geometric primitives, rendered at low resolution
 * with VGA 256-color dithering and PS1-style vertex snapping.
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

  // Accessibility: respect high-contrast preference
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersHighContrast) return;

  // ─── Resolution ──────────────────────────────────────────────
  var resH = parseInt(config.resolution, 10) || 240;
  var resW = Math.round(resH * (4 / 3)); // 4:3 fixed aspect

  // ─── Renderer ────────────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    // WebGL not available — leave canvas transparent (black bg shows through)
    return;
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  // Camera positioning handled by orbit system (see updateCameraOrbit)

  // ─── Custom PS1-Style ShaderMaterial ───────────────────────────
  // Vertex shader: snaps positions to a coarse screen-space grid.
  // Fragment shader: simple directional + ambient lighting with flat color.
  var VERT_SHADER = [
    'uniform float uResolution;',
    'varying vec3 vNormal;',
    'varying vec3 vWorldPos;',
    '',
    'void main() {',
    '  vNormal = normalize(normalMatrix * normal);',
    '  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    '',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '',
    '  // PS1-style screen-space vertex snapping',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var FRAG_SHADER = [
    'uniform vec3 uColor;',
    'uniform vec3 uLightDir;',
    'uniform vec3 uAmbient;',
    'varying vec3 vNormal;',
    '',
    'void main() {',
    '  float diff = max(dot(vNormal, uLightDir), 0.0);',
    '  vec3 lit = uColor * (uAmbient + diff * vec3(0.8));',
    '  gl_FragColor = vec4(lit, 1.0);',
    '}'
  ].join('\n');

  // Wireframe variant — no lighting, flat color
  var FRAG_SHADER_WIRE = [
    'uniform vec3 uColor;',
    '',
    'void main() {',
    '  gl_FragColor = vec4(uColor, 1.0);',
    '}'
  ].join('\n');

  // Light direction: from upper-right, matching lacquer reference illumination
  var lightDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

  function makePS1Material(color, wireframe) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uColor: { value: new THREE.Color(color) },
        uLightDir: { value: lightDir },
        uAmbient: { value: new THREE.Vector3(0.25, 0.22, 0.18) }
      },
      vertexShader: VERT_SHADER,
      fragmentShader: wireframe ? FRAG_SHADER_WIRE : FRAG_SHADER,
      wireframe: !!wireframe,
      side: THREE.DoubleSide
    });
  }

  // ─── Sky Gradient ─────────────────────────────────────────────
  function buildSky() {
    var geo = new THREE.PlaneGeometry(80, 60);
    var colors = new Float32Array(geo.attributes.position.count * 3);
    var pos = geo.attributes.position;
    var topColor = new THREE.Color(0xAA5500);
    var bottomColor = new THREE.Color(0x0a0800);
    for (var i = 0; i < pos.count; i++) {
      var t = (pos.getY(i) + 30) / 60;
      t = Math.max(0, Math.min(1, t));
      var col = new THREE.Color().lerpColors(bottomColor, topColor, t);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var mat = new THREE.ShaderMaterial({
      vertexShader: [
        'varying vec3 vColor;',
        'void main() {',
        '  vColor = color;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor;',
        'void main() {',
        '  gl_FragColor = vec4(vColor, 1.0);',
        '}'
      ].join('\n'),
      vertexColors: true,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 8, -35);
    scene.add(mesh);
  }

  // ─── Mt. Fuji ─────────────────────────────────────────────────
  function buildFuji() {
    var fujiGeo = new THREE.ConeGeometry(8, 10, 8);
    var fujiMat = makePS1Material(0x1a1008, false);
    var fuji = new THREE.Mesh(fujiGeo, fujiMat);
    fuji.position.set(0, 3, -20);
    scene.add(fuji);

    var capGeo = new THREE.ConeGeometry(2.5, 2.5, 8);
    var capMat = makePS1Material(0xAAAA88, false);
    var cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, 7.8, -20);
    scene.add(cap);

    var hill1Geo = new THREE.ConeGeometry(5, 4, 6);
    var hill1Mat = makePS1Material(0x0f0a05, false);
    var hill1 = new THREE.Mesh(hill1Geo, hill1Mat);
    hill1.position.set(-8, 0.5, -16);
    scene.add(hill1);

    var hill2Geo = new THREE.ConeGeometry(4, 3, 5);
    var hill2Mat = makePS1Material(0x120d06, false);
    var hill2 = new THREE.Mesh(hill2Geo, hill2Mat);
    hill2.position.set(7, 0, -14);
    scene.add(hill2);
  }

  // ─── Wireframe Ocean ──────────────────────────────────────────
  var oceanGeo, oceanPositions;

  function buildOcean() {
    oceanGeo = new THREE.PlaneGeometry(40, 30, 30, 30);
    oceanGeo.rotateX(-Math.PI / 2);
    oceanPositions = new Float32Array(oceanGeo.attributes.position.count);
    var pos = oceanGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      oceanPositions[i] = pos.getY(i);
    }
    var mat = makePS1Material(0xAA5522, true);
    var ocean = new THREE.Mesh(oceanGeo, mat);
    ocean.position.set(0, -1.5, -5);
    scene.add(ocean);
  }

  function animateOcean(time) {
    if (!oceanGeo) return;
    var pos = oceanGeo.attributes.position;
    var t = time * 0.001;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i);
      var wave = Math.sin(x * 0.3 + t * 0.8) * 0.4
               + Math.sin(z * 0.5 + t * 0.5) * 0.3
               + Math.sin((x + z) * 0.2 + t * 1.2) * 0.2;
      pos.setY(i, oceanPositions[i] + wave);
    }
    pos.needsUpdate = true;
  }

  // ─── Tokyo Cityscape ──────────────────────────────────────────
  // Iconic structures as low-poly silhouettes, clustered to the
  // left of Fuji. Scaled small so Fuji remains the anchor.
  function buildCityscape() {
    // Cityscape origin — front-right of Fuji, near the right tree
    var cx = 5.5;
    var cz = -7;
    var ground = -0.5; // base y for buildings

    // Helper: add a box-shaped building
    function addBox(w, h, d, x, y, z, color) {
      var geo = new THREE.BoxGeometry(w, h, d);
      var mat = makePS1Material(color, false);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx + x, ground + y + h / 2, cz + z);
      scene.add(mesh);
      return mesh;
    }

    // Helper: add a cylinder
    function addCyl(rTop, rBot, h, segs, x, y, z, color) {
      var geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
      var mat = makePS1Material(color, false);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx + x, ground + y + h / 2, cz + z);
      scene.add(mesh);
      return mesh;
    }

    // --- Generic background buildings (fill the skyline) ---
    var bgColor = 0x0f0e12;
    var bgColor2 = 0x12111a;
    var bgColor3 = 0x0a0a10;
    addBox(0.6, 1.8, 0.5, -2.0, 0, 0.3, bgColor);
    addBox(0.5, 2.2, 0.5, -1.3, 0, -0.2, bgColor2);
    addBox(0.7, 1.5, 0.6, -0.5, 0, 0.5, bgColor3);
    addBox(0.4, 2.0, 0.4,  1.8, 0, 0.1, bgColor);
    addBox(0.6, 1.6, 0.5,  2.5, 0, -0.3, bgColor2);
    addBox(0.5, 1.3, 0.5,  3.2, 0, 0.4, bgColor3);
    addBox(0.5, 1.7, 0.4, -2.7, 0, -0.1, bgColor2);
    addBox(0.4, 1.4, 0.5,  0.3, 0, 0.6, bgColor);
    addBox(0.6, 1.9, 0.5,  3.8, 0, 0.2, bgColor3);

    // === Tokyo Skytree (634m — tallest, narrow lattice tower) ===
    // Tapered shaft with two observation deck bulges
    var skytreeColor = 0x1a1a2a;
    addCyl(0.06, 0.15, 4.5, 4, 1.0, 0, 0, skytreeColor); // main shaft
    addCyl(0.22, 0.18, 0.3, 6, 1.0, 2.8, 0, 0x222233);   // lower deck
    addCyl(0.16, 0.14, 0.2, 6, 1.0, 3.6, 0, 0x222233);   // upper deck
    // Antenna spire
    addCyl(0.02, 0.02, 0.8, 3, 1.0, 4.5, 0, 0x2a2a3a);

    // === Tokyo Tower (333m — red/orange lattice) ===
    var towerColor = 0xAA2200;
    addCyl(0.04, 0.3, 3.0, 4, -0.8, 0, 0.2, towerColor);  // tapered body
    addCyl(0.12, 0.1, 0.2, 4, -0.8, 1.8, 0.2, 0xAA3300);  // observation deck
    addCyl(0.02, 0.02, 0.6, 3, -0.8, 3.0, 0.2, towerColor); // antenna

    // === NTT Docomo Yoyogi Building (clock tower with pyramid top) ===
    var docomoColor = 0x151520;
    addBox(0.7, 2.8, 0.6, 2.2, 0, -0.5, docomoColor);
    // Stepped pyramid crown
    addBox(0.55, 0.3, 0.5, 2.2, 2.8, -0.5, 0x1a1a28);
    addBox(0.4, 0.3, 0.35, 2.2, 3.1, -0.5, 0x1f1f30);
    // Spire
    addCyl(0.02, 0.02, 0.4, 3, 2.2, 3.4, -0.5, 0x2a2a3a);

    // === Tokyo Metropolitan Government Building (twin towers) ===
    var metroColor = 0x121218;
    // Left tower
    addBox(0.45, 3.2, 0.5, -1.8, 0, -0.5, metroColor);
    // Right tower
    addBox(0.45, 3.2, 0.5, -1.25, 0, -0.5, metroColor);
    // Connecting base
    addBox(1.0, 1.2, 0.6, -1.52, 0, -0.5, 0x0e0e14);
    // Notched tops (indentations via small lighter boxes)
    addBox(0.15, 0.3, 0.55, -1.8, 3.2, -0.5, 0x1a1a22);
    addBox(0.15, 0.3, 0.55, -1.25, 3.2, -0.5, 0x1a1a22);

    // === Senso-ji (Buddhist temple — tiered pagoda) ===
    var templeColor = 0x2a0808;
    var roofColor = 0x1a0505;
    // Main hall base
    addBox(0.8, 0.5, 0.6, 0.0, 0, 0.8, templeColor);
    // Tiered pagoda beside it
    addBox(0.4, 0.4, 0.4, 0.5, 0, 1.2, roofColor);
    addBox(0.35, 0.35, 0.35, 0.5, 0.4, 1.2, templeColor);
    addBox(0.28, 0.3, 0.28, 0.5, 0.75, 1.2, roofColor);
    addBox(0.2, 0.25, 0.2, 0.5, 1.05, 1.2, templeColor);
    addBox(0.14, 0.2, 0.14, 0.5, 1.3, 1.2, roofColor);
    // Pagoda spire
    addCyl(0.02, 0.02, 0.3, 3, 0.5, 1.5, 1.2, 0xAA5500);

    // === Meiji Jingu (Shinto shrine — low profile with torii) ===
    var shrineColor = 0x1a1008;
    var toriiColor = 0xAA2200;
    // Main shrine hall — low and wide
    addBox(0.9, 0.35, 0.5, -0.3, 0, 1.5, shrineColor);
    // Sloped roof (wider box on top, slight overhang)
    addBox(1.1, 0.12, 0.65, -0.3, 0.35, 1.5, 0x0f0a05);
    // Torii gate in front
    // Vertical pillars
    addCyl(0.03, 0.03, 0.6, 4, -0.55, 0, 2.0, toriiColor);
    addCyl(0.03, 0.03, 0.6, 4, -0.05, 0, 2.0, toriiColor);
    // Top crossbar (kasagi)
    addBox(0.7, 0.04, 0.04, -0.3, 0.6, 2.0, toriiColor);
    // Lower crossbar (nuki)
    addBox(0.55, 0.03, 0.03, -0.3, 0.45, 2.0, toriiColor);

    // === Fuji Television Building (sphere on rectangular frame) ===
    var fujiTVColor = 0x151822;
    // Main rectangular frame
    addBox(0.8, 1.4, 0.5, 3.5, 0, 0.8, fujiTVColor);
    // Observation sphere
    var sphereGeo = new THREE.IcosahedronGeometry(0.25, 1);
    var sphereMat = makePS1Material(0xAAAAAA, false);
    var sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(cx + 3.5, ground + 1.1, cz + 0.8);
    scene.add(sphere);
    // Support legs (open frame look)
    addBox(0.15, 0.6, 0.5, 3.2, 0, 0.8, 0x0f1018);
    addBox(0.15, 0.6, 0.5, 3.8, 0, 0.8, 0x0f1018);
  }

  // ─── Trees ────────────────────────────────────────────────────
  function buildTrees() {
    var treePositions = [
      [-6, -1, -8],
      [-3, -1.2, -10],
      [5, -0.8, -9]
    ];
    for (var i = 0; i < treePositions.length; i++) {
      var p = treePositions[i];
      var trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 4);
      var trunkMat = makePS1Material(0x5a3410, false);
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(p[0], p[1] + 0.75, p[2]);
      scene.add(trunk);

      var canopyGeo = new THREE.ConeGeometry(1.2, 2.5, 5);
      var canopyMat = makePS1Material(0x005500, false);
      var canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(p[0], p[1] + 2.5, p[2]);
      scene.add(canopy);
    }
  }

  // ─── Floating Primitives ──────────────────────────────────────
  var floatingObjects = [];

  function buildFloatingPrimitives() {
    var shapes = [
      { geo: new THREE.IcosahedronGeometry(0.4, 0), color: 0xAA5500, wire: false },
      { geo: new THREE.OctahedronGeometry(0.35, 0), color: 0xAA0000, wire: false },
      { geo: new THREE.TetrahedronGeometry(0.5, 0), color: 0xAA5522, wire: true },
      { geo: new THREE.IcosahedronGeometry(0.3, 0), color: 0xFFFF55, wire: false },
      { geo: new THREE.OctahedronGeometry(0.45, 0), color: 0x005500, wire: true },
      { geo: new THREE.TetrahedronGeometry(0.35, 0), color: 0xAA5500, wire: false },
      { geo: new THREE.IcosahedronGeometry(0.5, 0), color: 0x000055, wire: true },
      { geo: new THREE.OctahedronGeometry(0.4, 0), color: 0xAA0000, wire: false }
    ];

    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      var mat = makePS1Material(s.color, s.wire);
      var mesh = new THREE.Mesh(s.geo, mat);

      var angle = (i / shapes.length) * Math.PI * 2;
      var radius = 4 + Math.random() * 6;
      var homePos = new THREE.Vector3(
        Math.cos(angle) * radius,
        0.5 + Math.random() * 3,
        Math.sin(angle) * radius - 5
      );
      mesh.position.copy(homePos);

      mesh.userData = {
        homePos: homePos.clone(),
        displacement: new THREE.Vector3(),
        rotSpeedX: (Math.random() - 0.5) * 0.02,
        rotSpeedY: (Math.random() - 0.5) * 0.03,
        driftFreqX: 0.2 + Math.random() * 0.3,
        driftFreqY: 0.15 + Math.random() * 0.25,
        driftAmpX: 0.3 + Math.random() * 0.5,
        driftAmpY: 0.2 + Math.random() * 0.3,
        driftPhase: Math.random() * Math.PI * 2
      };

      scene.add(mesh);
      floatingObjects.push(mesh);
    }
  }

  function animateFloatingPrimitives(time) {
    var t = time * 0.001;
    for (var i = 0; i < floatingObjects.length; i++) {
      var obj = floatingObjects[i];
      var ud = obj.userData;
      obj.rotation.x += ud.rotSpeedX;
      obj.rotation.y += ud.rotSpeedY;
      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmpX;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmpY;
      obj.position.x = ud.homePos.x + driftX + ud.displacement.x;
      obj.position.y = ud.homePos.y + driftY + ud.displacement.y;
      obj.position.z = ud.homePos.z + ud.displacement.z;
      ud.displacement.multiplyScalar(0.97);
    }
  }

  // ─── Particle Lattice Clusters ────────────────────────────────
  var latticeClusters = [];

  function buildParticleLattices() {
    var clusterConfigs = [
      { center: new THREE.Vector3(6, 3, -3), count: 12, spread: 1.5, color: 0xAA5500 },
      { center: new THREE.Vector3(-5, 4, -7), count: 10, spread: 1.2, color: 0xFFFF55 },
      { center: new THREE.Vector3(3, 2, -12), count: 8, spread: 1.0, color: 0xAA5522 }
    ];

    for (var ci = 0; ci < clusterConfigs.length; ci++) {
      var cfg = clusterConfigs[ci];
      var group = new THREE.Group();
      group.position.copy(cfg.center);

      var points = [];
      for (var i = 0; i < cfg.count; i++) {
        points.push(new THREE.Vector3(
          (Math.random() - 0.5) * cfg.spread * 2,
          (Math.random() - 0.5) * cfg.spread * 2,
          (Math.random() - 0.5) * cfg.spread * 2
        ));
      }

      // Connect nearest neighbors with lines
      var lineGeo = new THREE.BufferGeometry();
      var lineVerts = [];
      var CONNECTION_DIST = cfg.spread * 1.5;

      for (var a = 0; a < points.length; a++) {
        for (var b = a + 1; b < points.length; b++) {
          if (points[a].distanceTo(points[b]) < CONNECTION_DIST) {
            lineVerts.push(points[a].x, points[a].y, points[a].z);
            lineVerts.push(points[b].x, points[b].y, points[b].z);
          }
        }
      }

      lineGeo.setAttribute('position',
        new THREE.Float32BufferAttribute(lineVerts, 3));

      var lineMat = makePS1Material(cfg.color, true);
      lineMat.wireframe = false;
      var lines = new THREE.LineSegments(lineGeo, lineMat);
      group.add(lines);

      // SET userData FIRST so dotMeshes array exists
      group.userData = {
        homePos: cfg.center.clone(),
        displacement: new THREE.Vector3(),
        rotSpeed: 0.003 + Math.random() * 0.005,
        lineGeo: lineGeo,
        baseLineVerts: new Float32Array(lineVerts),
        points: points.map(function (p) { return p.clone(); }),
        dotMeshes: []
      };

      // THEN create dot meshes and push to the array
      for (var p = 0; p < points.length; p++) {
        var dotGeo = new THREE.SphereGeometry(0.05, 4, 4);
        var dotMat = makePS1Material(cfg.color, false);
        var dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(points[p]);
        group.add(dot);
        group.userData.dotMeshes.push(dot);
      }

      scene.add(group);
      latticeClusters.push(group);
      floatingObjects.push(group);
    }
  }

  function animateLatticeClusters(time) {
    var t = time * 0.001;
    for (var i = 0; i < latticeClusters.length; i++) {
      var cluster = latticeClusters[i];
      var ud = cluster.userData;

      cluster.rotation.y += ud.rotSpeed;
      cluster.rotation.x += ud.rotSpeed * 0.3;

      // Apply cursor displacement + damping
      cluster.position.x = ud.homePos.x + ud.displacement.x;
      cluster.position.y = ud.homePos.y + ud.displacement.y;
      cluster.position.z = ud.homePos.z + ud.displacement.z;
      ud.displacement.multiplyScalar(0.97);

      // Per-vertex morphing
      for (var p = 0; p < ud.points.length; p++) {
        var base = ud.points[p];
        var phase = p * 1.7;
        var dx = Math.sin(t * 0.4 + phase) * 0.15;
        var dy = Math.sin(t * 0.3 + phase * 1.3) * 0.12;
        var dz = Math.sin(t * 0.5 + phase * 0.7) * 0.15;

        if (ud.dotMeshes[p]) {
          ud.dotMeshes[p].position.set(
            base.x + dx, base.y + dy, base.z + dz
          );
        }
      }

      // Rebuild line geometry from morphed dot positions
      if (ud.lineGeo && ud.dotMeshes.length > 0) {
        var pos = ud.lineGeo.attributes.position;
        var vertIdx = 0;
        for (var a = 0; a < ud.dotMeshes.length; a++) {
          for (var b = a + 1; b < ud.dotMeshes.length; b++) {
            if (ud.points[a].distanceTo(ud.points[b]) < 2.25) {
              var da = ud.dotMeshes[a].position;
              var db = ud.dotMeshes[b].position;
              pos.setXYZ(vertIdx, da.x, da.y, da.z); vertIdx++;
              pos.setXYZ(vertIdx, db.x, db.y, db.z); vertIdx++;
            }
          }
        }
        pos.needsUpdate = true;
      }
    }
  }

  // ─── Rotating Wireframe Shapes ────────────────────────────────
  var wireframeShapes = [];

  function buildWireframeShapes() {
    var sphereGeo = new THREE.SphereGeometry(1.2, 8, 6);
    var sphereMat = makePS1Material(0x000055, true);
    var sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(-4, 3, -4);
    sphere.userData.rotSpeed = 0.005;
    scene.add(sphere);
    wireframeShapes.push(sphere);

    var torusGeo = new THREE.TorusGeometry(0.8, 0.3, 6, 8);
    var torusMat = makePS1Material(0x005555, true);
    var torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(8, 2, -6);
    torus.userData.rotSpeed = 0.008;
    scene.add(torus);
    wireframeShapes.push(torus);
  }

  function animateWireframeShapes() {
    for (var i = 0; i < wireframeShapes.length; i++) {
      var shape = wireframeShapes[i];
      shape.rotation.y += shape.userData.rotSpeed;
      shape.rotation.x += shape.userData.rotSpeed * 0.7;
    }
  }

  // ─── Build Scene ──────────────────────────────────────────────
  buildSky();
  buildFuji();
  buildCityscape();
  buildOcean();
  buildTrees();
  buildFloatingPrimitives();
  buildParticleLattices();
  buildWireframeShapes();

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

  // The original #jj-screensaver canvas becomes the offscreen WebGL context
  // holder (hidden). The new display canvas is the visible output.
  canvas.style.display = 'none';

  displayCanvas.id = 'jj-screensaver-display';
  displayCanvas.setAttribute('aria-hidden', 'true');
  displayCanvas.tabIndex = -1;
  displayCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100vw', 'height:100vh',
    'z-index:0', 'pointer-events:none',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges'
  ].join(';');
  canvas.parentNode.insertBefore(displayCanvas, canvas.nextSibling);

  // ─── Reusable render pipeline ─────────────────────────────────
  // Used by both the animate loop and the reduced-motion static frame.
  function renderOneFrame() {
    // 1. Render scene to offscreen target
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // 2. Read pixels back to CPU
    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    // 3. Copy to ImageData (WebGL reads bottom-up, flip vertically)
    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    // 4. VGA palette quantization + Floyd-Steinberg dither
    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    // 5. Draw dithered frame to display canvas
    displayCtx.putImageData(displayImageData, 0, 0);
  }

  // ─── Camera Orbit ─────────────────────────────────────────────
  var ORBIT = {
    radiusX: 14,
    radiusZ: 12,
    baseHeight: 5,
    bobAmount: 0.25,
    lookTarget: new THREE.Vector3(0, 1.5, -10),
    // 2*PI / desired_seconds: slow=~100s, medium=~60s, fast=~40s
    speed: { slow: 0.063, medium: 0.105, fast: 0.157 }
  };
  var orbitSpeed = ORBIT.speed[config.orbitSpeed] || ORBIT.speed.slow;

  function updateCameraOrbit(time) {
    var t = time * 0.001 * orbitSpeed;

    camera.position.x = Math.cos(t) * ORBIT.radiusX;
    camera.position.z = Math.sin(t) * ORBIT.radiusZ;
    camera.position.y = ORBIT.baseHeight
      + Math.sin(t * 0.3) * ORBIT.bobAmount;

    camera.lookAt(ORBIT.lookTarget);
  }

  // ─── Mouse Parallax ──────────────────────────────────────────
  var mouseNorm = { x: 0, y: 0 };
  var parallaxOffset = { x: 0, y: 0 };
  var MAX_PARALLAX = 0.5; // world units offset on look target
  var PARALLAX_LERP = 0.05;
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  if (config.mouseInteraction !== false && !isMobile) {
    window.addEventListener('mousemove', function (e) {
      mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Ease back when mouse leaves window
    document.addEventListener('mouseleave', function () {
      mouseNorm.x = 0;
      mouseNorm.y = 0;
    });
  }

  function updateParallax() {
    parallaxOffset.x += (mouseNorm.x * MAX_PARALLAX - parallaxOffset.x) * PARALLAX_LERP;
    parallaxOffset.y += (mouseNorm.y * MAX_PARALLAX - parallaxOffset.y) * PARALLAX_LERP;
  }

  // ─── Object Cursor Reaction ───────────────────────────────────
  var raycaster = new THREE.Raycaster();
  var mouseVec2 = new THREE.Vector2();
  var REACTION_RADIUS = 3;
  var REPULSION_STRENGTH = 0.15;
  var MAX_DISPLACEMENT = 0.5;
  var DAMPING = 0.97;

  // Scratch vectors (reused per frame to avoid GC pressure)
  var _closestPoint = new THREE.Vector3();
  var _pushDir = new THREE.Vector3();

  function updateCursorReaction() {
    if (config.mouseInteraction === false || isMobile) return;

    mouseVec2.set(mouseNorm.x, -mouseNorm.y); // flip Y for Three.js coords
    raycaster.setFromCamera(mouseVec2, camera);

    var ray = raycaster.ray;

    for (var i = 0; i < floatingObjects.length; i++) {
      var obj = floatingObjects[i];
      var ud = obj.userData;
      if (!ud.displacement) continue;

      ray.closestPointToPoint(obj.position, _closestPoint);
      var dist = obj.position.distanceTo(_closestPoint);

      if (dist < REACTION_RADIUS) {
        var force = REPULSION_STRENGTH / (dist * dist + 0.1);
        force = Math.min(force, MAX_DISPLACEMENT);

        _pushDir.subVectors(obj.position, _closestPoint).normalize();
        ud.displacement.add(_pushDir.multiplyScalar(force));

        // Clamp total displacement
        if (ud.displacement.length() > MAX_DISPLACEMENT) {
          ud.displacement.normalize().multiplyScalar(MAX_DISPLACEMENT);
        }
      }
    }
  }

  // ─── Performance Safeguards ───────────────────────────────────
  var pauseReasons = { hidden: false, scrolled: false };

  function isPaused() {
    return pauseReasons.hidden || pauseReasons.scrolled;
  }

  function resumeIfNeeded() {
    if (!isPaused()) {
      lastFrame = performance.now(); // prevent time jump on resume
      requestAnimationFrame(animate);
    }
  }

  document.addEventListener('visibilitychange', function () {
    pauseReasons.hidden = document.hidden;
    resumeIfNeeded();
  });

  // Scroll sentinel — pause when user scrolls past the fold
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:100vh;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(sentinel);

  if (window.IntersectionObserver) {
    var scrollObserver = new IntersectionObserver(function (entries) {
      // Sentinel is at the fold. When it's NOT intersecting,
      // the user has scrolled past the viewport height.
      pauseReasons.scrolled = !entries[0].isIntersecting;
      resumeIfNeeded();
    }, { threshold: 0 });
    scrollObserver.observe(sentinel);
  }

  // ─── Render Loop ─────────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    if (isPaused()) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    animateOcean(time);
    updateCursorReaction();
    animateFloatingPrimitives(time);
    animateLatticeClusters(time);
    animateWireframeShapes();

    updateCameraOrbit(time);
    updateParallax();

    // Apply parallax offset to look target
    var lookX = ORBIT.lookTarget.x + parallaxOffset.x;
    var lookY = ORBIT.lookTarget.y - parallaxOffset.y;
    camera.lookAt(lookX, lookY, ORBIT.lookTarget.z);

    renderOneFrame();
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
