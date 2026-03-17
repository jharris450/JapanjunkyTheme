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

  // ─── Proof of life: spinning cube ────────────────────────────
  var geo = new THREE.BoxGeometry(1, 1, 1);
  var mat = new THREE.MeshBasicMaterial({ color: 0xAA5500, wireframe: true });
  var cube = new THREE.Mesh(geo, mat);
  scene.add(cube);

  // ─── Render Loop ─────────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.015;

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
