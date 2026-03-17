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

  // ─── Test: PS1 material on icosahedron ────────────────────────
  var testGeo = new THREE.IcosahedronGeometry(1, 1);
  var testMat = makePS1Material(0xAA5500, false);
  var testMesh = new THREE.Mesh(testGeo, testMat);
  scene.add(testMesh);

  // ─── Render Loop ─────────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    testMesh.rotation.x += 0.01;
    testMesh.rotation.y += 0.015;

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
