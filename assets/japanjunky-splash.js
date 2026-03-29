/**
 * JapanJunky Splash Portal — Enchanted Mirror
 *
 * Full-viewport churning mirror surface shown once per session
 * before the homepage. Uses its own WebGL renderer + 240p VGA
 * dither pipeline, then hands off to the screensaver on ENTER.
 *
 * Depends on: THREE (global), JJ_ScreensaverPost (global),
 *             JJ_SPLASH_CONFIG (global, set by theme.liquid)
 */
(function () {
  'use strict';

  // ─── Gate checks ───────────────────────────────────────────
  var config = window.JJ_SPLASH_CONFIG;
  if (!config) return;
  if (!window.JJ_SPLASH_ACTIVE) return;
  if (typeof THREE === 'undefined') return;

  // Accessibility: skip splash entirely
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var prefersHighContrast = window.matchMedia
    && window.matchMedia('(prefers-contrast: more)').matches;
  if (prefersReducedMotion || prefersHighContrast) {
    skipSplash();
    return;
  }

  // ─── Resolution (matches screensaver) ──────────────────────
  var configRes = parseInt(config.resolution, 10) || 240;
  var resH = configRes;
  var viewportAspect = (window.innerWidth && window.innerHeight)
    ? window.innerWidth / window.innerHeight : 4 / 3;
  var resW = Math.round(resH * viewportAspect);

  // ─── DOM references ────────────────────────────────────────
  var splashCanvas = document.getElementById('jj-splash');
  var enterBtn = document.getElementById('jj-splash-enter');
  var homepageDiv = document.getElementById('jj-homepage');
  if (!splashCanvas || !enterBtn || !homepageDiv) { skipSplash(); return; }

  // Hide homepage during splash
  homepageDiv.classList.add('jj-splash-active');

  // ─── WebGL Renderer ────────────────────────────────────────
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: splashCanvas, antialias: false });
  } catch (e) {
    skipSplash();
    return;
  }
  renderer.setSize(resW, resH, false);
  renderer.setClearColor(0x000000, 1);

  // ─── Scene + Camera ────────────────────────────────────────
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, resW / resH, 0.1, 100);
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  // ─── Swirl Speed ───────────────────────────────────────────
  var SWIRL_SPEEDS = { slow: 0.3, medium: 0.6, fast: 1.0 };
  var swirlSpeed = SWIRL_SPEEDS[config.swirlSpeed] || SWIRL_SPEEDS.slow;

  // ─── Mirror Shader ─────────────────────────────────────────
  var MIRROR_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var MIRROR_FRAG = [
    'uniform float uTime;',
    'uniform float uSwirlSpeed;',
    'uniform float uTransition;',
    'uniform vec2 uRippleOrigin;',
    'uniform float uRippleTime;',
    'uniform sampler2D uGhostTex;',
    'uniform float uGhostLoaded;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 center = uv - 0.5;',
    '  float dist = length(center);',
    '  float angle = atan(center.y, center.x);',
    '',
    '  // ── Swirl distortion ──',
    '  float swirlAmt = uSwirlSpeed * (1.0 + uTransition * 3.0);',
    '  float twist = angle + uTime * swirlAmt * 0.3 + dist * 3.0;',
    '  float twist2 = angle - uTime * swirlAmt * 0.5 + dist * 5.0;',
    '',
    '  // Displaced UVs for color sampling',
    '  vec2 swirled = vec2(',
    '    cos(twist) * dist + cos(twist2) * dist * 0.3,',
    '    sin(twist) * dist + sin(twist2) * dist * 0.3',
    '  ) + 0.5;',
    '',
    '  // ── Ripple distortion ──',
    '  float rippleAge = uTime - uRippleTime;',
    '  float rippleActive = step(0.0, rippleAge) * (1.0 - smoothstep(0.0, 1.5, rippleAge));',
    '  vec2 rippleDelta = uv - uRippleOrigin;',
    '  float rippleDist = length(rippleDelta);',
    '  float rippleWave = sin(rippleDist * 30.0 - rippleAge * 8.0) * 0.02;',
    '  rippleWave *= rippleActive * (1.0 - smoothstep(0.0, 0.5, rippleDist));',
    '  swirled += normalize(rippleDelta + 0.001) * rippleWave;',
    '',
    '  // ── Auto-ripple from center ──',
    '  float autoRipple = sin(dist * 20.0 - uTime * 2.5) * 0.008;',
    '  autoRipple += sin(dist * 12.0 - uTime * 1.8 + 1.0) * 0.005;',
    '  swirled += normalize(center + 0.001) * autoRipple;',
    '',
    '  // ── Color palette (tunnel-matching) ──',
    '  float pattern = sin(swirled.x * 6.0 + swirled.y * 8.0 + uTime * 0.5) * 0.5 + 0.5;',
    '  float pattern2 = sin(swirled.x * 10.0 - swirled.y * 6.0 + uTime * 0.3) * 0.5 + 0.5;',
    '  float p = pattern * 0.6 + pattern2 * 0.4;',
    '',
    '  vec3 c1 = vec3(0.4, 0.05, 0.02);',
    '  vec3 c2 = vec3(0.85, 0.35, 0.05);',
    '  vec3 c3 = vec3(0.95, 0.75, 0.3);',
    '  vec3 color = mix(c1, c2, smoothstep(0.0, 0.5, p));',
    '  color = mix(color, c3, smoothstep(0.5, 1.0, p));',
    '',
    '  // ── Surface sheen (Fresnel-like edge glow) ──',
    '  float sheen = smoothstep(0.3, 0.6, dist);',
    '  color += vec3(0.95, 0.75, 0.5) * sheen * 0.15;',
    '',
    '  // ── Tsuno silhouette ──',
    '  if (uGhostLoaded > 0.5) {',
    '    vec2 ghostUV = (swirled - 0.5) * 2.0 + 0.5;',
    '    ghostUV = clamp(ghostUV, 0.0, 1.0);',
    '    vec4 ghostTex = texture2D(uGhostTex, ghostUV);',
    '    float lum = dot(ghostTex.rgb, vec3(0.299, 0.587, 0.114));',
    '    float ghostMask = (1.0 - lum) * 0.1;',
    '    color += vec3(1.0, 0.2, 0.08) * ghostMask * (1.0 - uTransition);',
    '  }',
    '',
    '  // ── Transition: gentle brightening ──',
    '  if (uTransition > 0.0) {',
    '    float pullPhase = smoothstep(0.0, 0.6, uTransition);',
    '    color *= 1.0 + pullPhase * 0.3;',
    '  }',
    '',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  // ─── Mirror Mesh ───────────────────────────────────────────
  var mirrorGeo = new THREE.PlaneGeometry(4, 4);
  var mirrorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uSwirlSpeed: { value: swirlSpeed },
      uTransition: { value: 0.0 },
      uRippleOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleTime: { value: -10.0 },
      uGhostTex: { value: null },
      uGhostLoaded: { value: 0.0 }
    },
    vertexShader: MIRROR_VERT,
    fragmentShader: MIRROR_FRAG,
    side: THREE.FrontSide
  });
  var mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorMesh.position.set(0, 0, 0);
  scene.add(mirrorMesh);

  // ─── Ghost Texture (Tsuno) ─────────────────────────────────
  var textureLoader = new THREE.TextureLoader();
  if (config.ghostTexture) {
    textureLoader.load(config.ghostTexture, function (tex) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      mirrorMat.uniforms.uGhostTex.value = tex;
      mirrorMat.uniforms.uGhostLoaded.value = 1.0;
    });
  }

  // ─── Mouse / Touch Ripple ──────────────────────────────────
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  function onRipple(clientX, clientY) {
    // Convert screen coords to 0..1 UV space
    var nx = clientX / window.innerWidth;
    var ny = 1.0 - (clientY / window.innerHeight); // flip Y for GL
    mirrorMat.uniforms.uRippleOrigin.value.set(nx, ny);
    mirrorMat.uniforms.uRippleTime.value = performance.now() * 0.001;
  }

  function onMouseRipple(e) { onRipple(e.clientX, e.clientY); }
  function onTouchRipple(e) {
    if (e.touches.length > 0) {
      onRipple(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  if (!isMobile) {
    enterBtn.addEventListener('mouseenter', onMouseRipple);
    enterBtn.addEventListener('mousemove', onMouseRipple);
  }
  enterBtn.addEventListener('touchstart', onTouchRipple, { passive: true });
  enterBtn.addEventListener('touchmove', onTouchRipple, { passive: true });

  // ─── Offscreen Render Target ───────────────────────────────
  var renderTarget = new THREE.WebGLRenderTarget(resW, resH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat
  });

  // ─── Display Canvas (2D — visible output) ──────────────────
  var displayCanvas = document.createElement('canvas');
  displayCanvas.width = resW;
  displayCanvas.height = resH;
  var displayCtx = displayCanvas.getContext('2d');
  var displayImageData = displayCtx.createImageData(resW, resH);
  var pixelBuffer = new Uint8Array(resW * resH * 4);

  // Hide WebGL canvas, show display canvas
  splashCanvas.style.display = 'none';

  displayCanvas.id = 'jj-splash-display';
  displayCanvas.setAttribute('aria-hidden', 'true');
  displayCanvas.tabIndex = -1;
  var cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var canvasW = Math.round(window.innerWidth / cssZoom);
  var canvasH = Math.round(window.innerHeight / cssZoom);
  displayCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:' + canvasW + 'px',
    'height:' + canvasH + 'px',
    'z-index:10', 'pointer-events:none',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges'
  ].join(';');
  document.body.insertBefore(displayCanvas, document.body.firstChild);

  // Canvas now covers viewport — reveal homepage behind it so the browser
  // loads images and JS components can initialize at full opacity
  homepageDiv.classList.remove('jj-splash-active');

  // ─── Render one frame ──────────────────────────────────────
  function renderOneFrame() {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.readRenderTargetPixels(renderTarget, 0, 0, resW, resH, pixelBuffer);

    var src = pixelBuffer;
    var dst = displayImageData.data;
    for (var row = 0; row < resH; row++) {
      var srcRow = (resH - 1 - row) * resW * 4;
      var dstRow = row * resW * 4;
      for (var col = 0; col < resW * 4; col++) {
        dst[dstRow + col] = src[srcRow + col];
      }
    }

    if (window.JJ_ScreensaverPost) {
      JJ_ScreensaverPost.dither(displayImageData);
    }

    displayCtx.putImageData(displayImageData, 0, 0);
  }

  // ─── Animation Loop ────────────────────────────────────────
  var targetInterval = 1000 / (config.fps || 24);
  var lastFrame = 0;
  var running = true;
  var transitioning = false;
  var transitionStart = 0;

  function animate(time) {
    if (!running) return;
    requestAnimationFrame(animate);

    if (time - lastFrame < targetInterval) return;
    lastFrame = time;

    var t = time * 0.001;

    // Update shader uniforms
    mirrorMat.uniforms.uTime.value = t;

    // Update transition if active
    if (transitioning) {
      updateTransition(t);
    }

    if (!running) return; // completeSplash() may have disposed renderer
    renderOneFrame();
  }

  // ─── Transition ────────────────────────────────────────────
  var TRANSITION_DURATION = 2.0; // seconds

  function startTransition() {
    if (transitioning) return;
    transitioning = true;
    transitionStart = performance.now() * 0.001;

    // Ripple burst from center
    mirrorMat.uniforms.uRippleOrigin.value.set(0.5, 0.5);
    mirrorMat.uniforms.uRippleTime.value = transitionStart;

    // Fade out button
    enterBtn.classList.remove('jj-splash-enter--visible');
    enterBtn.classList.add('jj-splash-enter--fadeout');
  }

  function updateTransition(t) {
    var elapsed = t - transitionStart;
    var progress = Math.min(1.0, elapsed / TRANSITION_DURATION);

    mirrorMat.uniforms.uTransition.value = progress;

    // Drive canvas opacity from JS — smoothstep ease-in-out
    var ease = progress * progress * (3.0 - 2.0 * progress);
    displayCanvas.style.opacity = String(1.0 - ease);

    if (progress >= 1.0) {
      completeSplash();
    }
  }

  function completeSplash() {
    running = false;

    // Mark session
    try { sessionStorage.setItem('jj-entered', '1'); } catch (e) {}

    // Dispose WebGL resources
    var ghostTex = mirrorMat.uniforms.uGhostTex.value;
    if (ghostTex) ghostTex.dispose();
    renderTarget.dispose();
    renderer.dispose();
    mirrorGeo.dispose();
    mirrorMat.dispose();

    // Remove splash DOM
    if (displayCanvas.parentNode) displayCanvas.parentNode.removeChild(displayCanvas);
    if (splashCanvas.parentNode) splashCanvas.parentNode.removeChild(splashCanvas);
    if (enterBtn.parentNode) enterBtn.parentNode.removeChild(enterBtn);

    // Null references for GC
    renderer = null;
    renderTarget = null;
    displayCanvas = null;
    displayCtx = null;

    // Remove splash classes and stacking containment
    homepageDiv.classList.remove('jj-splash-active');
    homepageDiv.style.isolation = '';

    // Clear flag
    delete window.JJ_SPLASH_ACTIVE;

    // Initialize screensaver (now safe — our context is gone)
    if (window.JJ_Portal_Init) {
      window.JJ_Portal_Init();
      delete window.JJ_Portal_Init;
    }
  }

  // ─── Skip splash (accessibility, error, or session) ────────
  function skipSplash() {
    try { sessionStorage.setItem('jj-entered', '1'); } catch (e) {}
    delete window.JJ_SPLASH_ACTIVE;
    var hp = document.getElementById('jj-homepage');
    if (hp) hp.classList.remove('jj-splash-active');
    var btn = document.getElementById('jj-splash-enter');
    if (btn) btn.style.display = 'none';
    var sc = document.getElementById('jj-splash');
    if (sc) sc.style.display = 'none';
    if (window.JJ_Portal_Init) {
      window.JJ_Portal_Init();
      delete window.JJ_Portal_Init;
    }
  }

  // ─── Start ─────────────────────────────────────────────────
  // Show ENTER button with fade-in after 1 second
  enterBtn.style.display = '';
  setTimeout(function () {
    enterBtn.classList.add('jj-splash-enter--visible');
  }, 1000);

  // Click / keyboard handler
  enterBtn.addEventListener('click', function () {
    startTransition();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(animate);
    });
  } else {
    requestAnimationFrame(animate);
  }

})();
