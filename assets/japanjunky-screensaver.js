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
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0, 0);

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

  // ─── Build Scene ──────────────────────────────────────────────
  buildSky();
  buildFuji();
  buildOcean();
  buildTrees();

  // ─── Render Loop ─────────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    animateOcean(time);

    renderer.render(scene, camera);
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
