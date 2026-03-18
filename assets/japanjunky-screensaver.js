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
    'vec3 fusionPalette(float t) {',
    '  t = fract(t);',
    '  vec3 c0 = vec3(0.0, 1.0, 1.0);',
    '  vec3 c1 = vec3(1.0, 0.1, 0.8);',
    '  vec3 c2 = vec3(1.0, 0.75, 0.0);',
    '  vec3 c3 = vec3(0.2, 1.0, 0.4);',
    '  vec3 c4 = vec3(1.0, 0.4, 0.7);',
    '  float s = t * 5.0;',
    '  vec3 c = mix(c0, c1, clamp(s, 0.0, 1.0));',
    '  c = mix(c, c2, clamp(s - 1.0, 0.0, 1.0));',
    '  c = mix(c, c3, clamp(s - 2.0, 0.0, 1.0));',
    '  c = mix(c, c4, clamp(s - 3.0, 0.0, 1.0));',
    '  c = mix(c, c0, clamp(s - 4.0, 0.0, 1.0));',
    '  return c;',
    '}',
    '',
    'void main() {',
    '  float angle = vUv.x * 6.2832;',
    '  float depth = vUv.y;',
    '',
    '  float ringCount = 10.0;',
    '  float ringId = floor(depth * ringCount);',
    '  float ringFract = fract(depth * ringCount);',
    '',
    '  float ringDir = step(0.5, fract(ringId * 0.5)) * 2.0 - 1.0;',
    '  float ringSpeed = uSwirlSpeed * (1.0 + ringId * 0.12) * ringDir;',
    '',
    '  float swirl1 = angle * 2.0 + ringId * 0.7 + uTime * ringSpeed;',
    '  float swirl2 = angle * 3.0 - depth * 2.5 + uTime * ringSpeed * 1.4;',
    '  float turb = sin(angle * 5.0 + depth * 8.0 + uTime * 0.7) * 0.3;',
    '  float t = swirl1 + sin(swirl2) * 0.4 + turb;',
    '',
    '  vec3 color = fusionPalette(t);',
    '',
    '  float val = 0.7 + 0.3 * sin(depth * 6.0 - uTime * 2.0);',
    '  val *= 0.85 + 0.15 * sin(angle * 4.0 + uTime * 3.0);',
    '',
    '  float burst = pow(max(0.0, sin(angle * 6.0 + depth * 10.0 - uTime * 2.5)), 8.0);',
    '  val += burst * 0.5;',
    '',
    '  float edgeDist = min(ringFract, 1.0 - ringFract);',
    '  float edgeGlow = 1.0 - smoothstep(0.0, 0.06, edgeDist);',
    '  val += edgeGlow * 0.6;',
    '',
    '  float falloff = smoothstep(0.0, 0.15, depth) * smoothstep(1.0, 0.65, depth);',
    '  val *= 0.45 + 0.55 * falloff;',
    '  val += smoothstep(0.75, 1.0, depth) * 0.3;',
    '',
    '  color *= val;',
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

  // ─── Starburst Glow ─────────────────────────────────────────
  var GLOW_VERT = [
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

  var GLOW_FRAG = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv);',
    '  float angle = atan(uv.y, uv.x);',
    '',
    '  float rays = pow(abs(sin(angle * 8.0 + uTime * 0.5)), 4.0);',
    '  rays += pow(abs(sin(angle * 13.0 - uTime * 0.3)), 6.0) * 0.5;',
    '',
    '  float glow = 1.0 / (1.0 + dist * 6.0);',
    '  glow = pow(glow, 1.5);',
    '',
    '  float intensity = glow + rays * glow * 0.6;',
    '',
    '  vec3 color = mix(vec3(1.0, 0.3, 0.7), vec3(1.0, 0.95, 1.0), glow);',
    '',
    '  gl_FragColor = vec4(color * intensity, intensity);',
    '}'
  ].join('\n');

  function buildGlow() {
    var geo = new THREE.PlaneGeometry(4, 4);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uTime: { value: 0.0 }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var glow = new THREE.Mesh(geo, mat);
    glow.position.set(0, 0, 36);
    scene.add(glow);
    return glow;
  }

  var glow = buildGlow();

  // ─── Sparkle Particles ─────────────────────────────────────
  var SPARKLE_COUNT = 30;
  var sparkleGeo = new THREE.BufferGeometry();
  var sparklePositions = new Float32Array(SPARKLE_COUNT * 3);
  var sparkleSizes = new Float32Array(SPARKLE_COUNT);
  var sparklePhases = new Float32Array(SPARKLE_COUNT);

  for (var si = 0; si < SPARKLE_COUNT; si++) {
    var sAngle = Math.random() * Math.PI * 2;
    var sRadius = Math.random() * 2.4;
    var sDepth = 1 + Math.random() * 34;
    sparklePositions[si * 3] = Math.cos(sAngle) * sRadius;
    sparklePositions[si * 3 + 1] = Math.sin(sAngle) * sRadius;
    sparklePositions[si * 3 + 2] = sDepth;
    sparkleSizes[si] = 1.0 + Math.random() * 1.5;
    sparklePhases[si] = Math.random() * Math.PI * 2;
  }

  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  sparkleGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkleSizes, 1));
  sparkleGeo.setAttribute('aPhase', new THREE.BufferAttribute(sparklePhases, 1));

  var SPARKLE_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform float uResolution;',
    'varying float vAlpha;',
    '',
    'void main() {',
    '  float twinkle = sin(uTime * 3.0 + aPhase) * 0.5 + 0.5;',
    '  vAlpha = pow(twinkle, 3.0);',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (20.0 / -viewPos.z);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var SPARKLE_FRAG = [
    'varying float vAlpha;',
    '',
    'void main() {',
    '  float dist = length(gl_PointCoord - vec2(0.5));',
    '  if (dist > 0.5) discard;',
    '  float glow = 1.0 - dist * 2.0;',
    '  gl_FragColor = vec4(1.0, 1.0, 1.0, glow * vAlpha);',
    '}'
  ].join('\n');

  var sparkleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: { value: parseFloat(resH) }
    },
    vertexShader: SPARKLE_VERT,
    fragmentShader: SPARKLE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  var sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  scene.add(sparkles);

  // ─── Portal Rings ──────────────────────────────────────────
  var RING_FRAG = [
    'uniform float uHue;',
    'varying vec2 vUv;',
    '',
    'vec3 ringPalette(float t) {',
    '  t = fract(t);',
    '  vec3 c0 = vec3(0.0, 1.0, 1.0);',
    '  vec3 c1 = vec3(1.0, 0.1, 0.8);',
    '  vec3 c2 = vec3(1.0, 0.75, 0.0);',
    '  vec3 c3 = vec3(0.2, 1.0, 0.4);',
    '  vec3 c4 = vec3(1.0, 0.4, 0.7);',
    '  float s = t * 5.0;',
    '  vec3 c = mix(c0, c1, clamp(s, 0.0, 1.0));',
    '  c = mix(c, c2, clamp(s - 1.0, 0.0, 1.0));',
    '  c = mix(c, c3, clamp(s - 2.0, 0.0, 1.0));',
    '  c = mix(c, c4, clamp(s - 3.0, 0.0, 1.0));',
    '  c = mix(c, c0, clamp(s - 4.0, 0.0, 1.0));',
    '  return c;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv - 0.5;',
    '  float dist = length(uv) * 2.0;',
    '  float ring = smoothstep(0.6, 0.78, dist) * smoothstep(1.0, 0.88, dist);',
    '  vec3 color = ringPalette(uHue);',
    '  gl_FragColor = vec4(color * 1.5, ring);',
    '}'
  ].join('\n');

  var PORTAL_RING_COUNT = 6;
  var portalRings = [];
  var ringGeo = new THREE.PlaneGeometry(5.6, 5.6);

  for (var ri = 0; ri < PORTAL_RING_COUNT; ri++) {
    var ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: parseFloat(resH) },
        uHue: { value: ri / PORTAL_RING_COUNT }
      },
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = 4 + ri * 5;
    ringMesh.userData.rotSpeed = (0.3 + ri * 0.15) * (ri % 2 === 0 ? 1 : -1);
    scene.add(ringMesh);
    portalRings.push(ringMesh);
  }

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

  // Hide the WebGL canvas, show the 2D display canvas
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

  // ─── Render one frame (reusable) ─────────────────────────────
  function renderOneFrame() {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    // Copy pixels (WebGL reads bottom-up, flip vertically)
    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    // VGA palette quantization + Floyd-Steinberg dither
    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    displayCtx.putImageData(displayImageData, 0, 0);
  }

  // ─── Mouse Parallax ──────────────────────────────────────────
  var mouseNorm = { x: 0, y: 0 };
  var parallaxOffset = { x: 0, y: 0 };
  var MAX_PARALLAX = 0.5;
  var PARALLAX_LERP = 0.05;
  var LOOK_TARGET = { x: 0, y: 0, z: 30 };
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  if (config.mouseInteraction !== false && !isMobile) {
    window.addEventListener('mousemove', function (e) {
      mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    document.addEventListener('mouseleave', function () {
      mouseNorm.x = 0;
      mouseNorm.y = 0;
    });
  }

  function updateParallax() {
    parallaxOffset.x += (mouseNorm.x * MAX_PARALLAX - parallaxOffset.x) * PARALLAX_LERP;
    parallaxOffset.y += (mouseNorm.y * MAX_PARALLAX - parallaxOffset.y) * PARALLAX_LERP;
  }

  // ─── Performance Safeguards ───────────────────────────────────
  var pauseReasons = { hidden: false, scrolled: false };

  function isPaused() {
    return pauseReasons.hidden || pauseReasons.scrolled;
  }

  function resumeIfNeeded() {
    if (!isPaused()) {
      lastFrame = performance.now();
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
      pauseReasons.scrolled = !entries[0].isIntersecting;
      resumeIfNeeded();
    }, { threshold: 0 });
    scrollObserver.observe(sentinel);
  }

  // ─── Animation Loop ──────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;

  function animate(time) {
    if (isPaused()) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    // Update shader time uniforms
    var t = time * 0.001;
    tunnel.material.uniforms.uTime.value = t;
    glow.material.uniforms.uTime.value = t;
    sparkles.material.uniforms.uTime.value = t;

    // Spin portal rings
    for (var ri = 0; ri < portalRings.length; ri++) {
      portalRings[ri].rotation.z += portalRings[ri].userData.rotSpeed * 0.02;
    }

    // Spawn and animate flying objects
    spawnObject(time);
    animateObjects(time);

    // Update parallax
    updateParallax();
    var lookX = LOOK_TARGET.x + parallaxOffset.x;
    var lookY = LOOK_TARGET.y - parallaxOffset.y;
    camera.lookAt(lookX, lookY, LOOK_TARGET.z);

    renderOneFrame();
  }

  // ─── Reduced Motion: Static Frame ─────────────────────────────
  if (prefersReducedMotion) {
    // Render one static dithered frame, then stop
    tunnel.material.uniforms.uTime.value = 0;
    glow.material.uniforms.uTime.value = 0;
    renderOneFrame();
    return; // Exit IIFE — no animation loop
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
