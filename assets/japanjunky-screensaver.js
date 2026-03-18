/**
 * JapanJunky Screensaver — Portal Vortex Tunnel
 *
 * Holographic swirling portal with flying objects (album covers),
 * rendered at low resolution with VGA 256-color dithering and
 * PS1-style vertex snapping.
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

  // Accessibility: high-contrast → disable entirely
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersHighContrast) return;

  // Accessibility: reduced-motion → render one static frame then stop
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Resolution ──────────────────────────────────────────────
  var resH = parseInt(config.resolution, 10) || 240;
  var resW = Math.round(resH * (4 / 3)); // 4:3 fixed aspect

  // ─── Renderer ────────────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    return; // WebGL not available — silent fallback to black bg
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ──────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 0, -1);
  camera.lookAt(0, 0, 30);

  // ─── Swirl Speed ─────────────────────────────────────────────
  var SWIRL_SPEEDS = { slow: 0.3, medium: 0.6, fast: 1.0 };
  var swirlSpeed = SWIRL_SPEEDS[config.orbitSpeed] || SWIRL_SPEEDS.slow;

  // ─── Portal Tunnel ───────────────────────────────────────────
  var TUNNEL_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var TUNNEL_FRAG = [
    'uniform float uTime;',
    'uniform float uSwirlSpeed;',
    'varying vec2 vUv;',
    '',
    'vec3 hsv2rgb(vec3 c) {',
    '  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);',
    '  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);',
    '  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);',
    '}',
    '',
    'void main() {',
    '  float angle = vUv.x * 6.2832;',
    '  float depth = vUv.y;',
    '  float hue = fract(angle * 2.0 + depth * 4.0 + uTime * uSwirlSpeed);',
    '  float sat = 0.85 + 0.15 * sin(depth * 6.0 + uTime * 2.0);',
    '  float val = 0.6 + 0.3 * sin(depth * 3.0 - uTime * 1.5);',
    '  float falloff = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.7, depth);',
    '  val *= 0.4 + 0.6 * falloff;',
    '  vec3 color = hsv2rgb(vec3(hue, sat, val));',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function buildTunnel() {
    var geo = new THREE.CylinderGeometry(3, 3, 40, 12, 20, true);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 },
        uSwirlSpeed: { value: swirlSpeed }
      },
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    var tunnel = new THREE.Mesh(geo, mat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.set(0, 0, 18);
    scene.add(tunnel);
    return tunnel;
  }

  var tunnel = buildTunnel();

  // ─── Vanishing Point Glow ────────────────────────────────────
  function buildGlow() {
    var geo = new THREE.PlaneGeometry(1.5, 1.5);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var glow = new THREE.Mesh(geo, mat);
    glow.position.set(0, 0, 36);
    scene.add(glow);
    return glow;
  }

  buildGlow();

  // ─── PS1 Textured Material ───────────────────────────────────
  var TEX_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var TEX_FRAG = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  gl_FragColor = texture2D(uTexture, vUv);',
    '}'
  ].join('\n');

  function makeTextureMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTexture: { value: texture }
      },
      vertexShader: TEX_VERT,
      fragmentShader: TEX_FRAG,
      side: THREE.DoubleSide,
      depthWrite: true
    });
  }

  // ─── Flying Objects ──────────────────────────────────────────
  var TUNNEL_RADIUS = 3;
  var SPAWN_RADIUS = TUNNEL_RADIUS * 0.7;
  var SPAWN_Z = -2;
  var DESPAWN_Z = 36;
  var OBJECT_SIZE = 0.4;
  var SPAWN_INTERVAL = 2500;
  var MAX_OBJECTS = 5;

  var flyingObjects = [];
  var loadedTextures = [];
  var lastSpawnTime = 0;
  var objectGeo = new THREE.PlaneGeometry(OBJECT_SIZE, OBJECT_SIZE);

  var textureUrls = config.textures || [];
  var textureLoader = new THREE.TextureLoader();

  for (var ti = 0; ti < textureUrls.length; ti++) {
    (function (url) {
      textureLoader.load(url, function (tex) {
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        loadedTextures.push(tex);
      });
    })(textureUrls[ti]);
  }

  function spawnObject(time) {
    if (loadedTextures.length === 0) return;
    if (flyingObjects.length >= MAX_OBJECTS) return;
    if (time - lastSpawnTime < SPAWN_INTERVAL) return;

    lastSpawnTime = time;

    var tex = loadedTextures[Math.floor(Math.random() * loadedTextures.length)];
    var mat = makeTextureMaterial(tex);
    var mesh = new THREE.Mesh(objectGeo, mat);

    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * SPAWN_RADIUS;
    mesh.position.set(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      SPAWN_Z
    );

    mesh.userData = {
      velZ: 0.2 + Math.random() * 0.1,
      accel: 0.002 + Math.random() * 0.001,
      rotVelX: (Math.random() - 0.5) * 0.08,
      rotVelY: (Math.random() - 0.5) * 0.08,
      rotVelZ: (Math.random() - 0.5) * 0.08,
      driftFreqX: 0.5 + Math.random() * 0.5,
      driftFreqY: 0.4 + Math.random() * 0.4,
      driftAmpX: 0.3 + Math.random() * 0.3,
      driftAmpY: 0.3 + Math.random() * 0.3,
      driftPhase: Math.random() * Math.PI * 2,
      baseX: mesh.position.x,
      baseY: mesh.position.y
    };

    scene.add(mesh);
    flyingObjects.push(mesh);
  }

  function animateObjects(time) {
    var t = time * 0.001;
    var i = flyingObjects.length;

    while (i--) {
      var obj = flyingObjects[i];
      var ud = obj.userData;

      ud.velZ += ud.accel;
      obj.position.z += ud.velZ;

      var driftX = Math.sin(t * ud.driftFreqX + ud.driftPhase) * ud.driftAmpX;
      var driftY = Math.sin(t * ud.driftFreqY + ud.driftPhase * 1.3) * ud.driftAmpY;
      obj.position.x = ud.baseX + driftX;
      obj.position.y = ud.baseY + driftY;

      var dist = Math.sqrt(obj.position.x * obj.position.x + obj.position.y * obj.position.y);
      if (dist > SPAWN_RADIUS) {
        var scale = SPAWN_RADIUS / dist;
        obj.position.x *= scale;
        obj.position.y *= scale;
      }

      obj.rotation.x += ud.rotVelX;
      obj.rotation.y += ud.rotVelY;
      obj.rotation.z += ud.rotVelZ;

      if (obj.position.z > DESPAWN_Z) {
        scene.remove(obj);
        obj.material.dispose();
        flyingObjects.splice(i, 1);
      }
    }
  }

  // TEMPORARY — replaced in Task 5
  function _tempAnimate(time) {
    requestAnimationFrame(_tempAnimate);
    tunnel.material.uniforms.uTime.value = time * 0.001;
    spawnObject(time);
    animateObjects(time);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(_tempAnimate);

})();
