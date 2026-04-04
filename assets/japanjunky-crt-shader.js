/**
 * JapanJunky CRT Shader — Barrel Distortion + Overlay
 *
 * Two-layer CRT simulation inspired by Codetaur's Three.js CRT shader:
 *   Layer 1: SVG barrel distortion via displacement map + inline feDisplacementMap filter
 *   Layer 2: Three.js fullscreen quad shader (scanlines, grille, bloom, vignette, CA, beam scan)
 *
 * Generates a 256x256 displacement map on a canvas, encodes it as a data URL,
 * and injects an inline SVG filter (#jj-crt-barrel) that applies barrel distortion
 * to the #jj-crt-content wrapper via CSS filter: url(#jj-crt-barrel).
 *
 * Config: window.JJ_CRT_SHADER_CONFIG (optional overrides)
 * Loaded: <script src="{{ 'japanjunky-crt-shader.js' | asset_url }}" defer></script>
 */
(function () {
  'use strict';

  // ─── Default Configuration ───────────────────────────────────
  var defaults = {
    barrelStrength: 0.08,
    barrelScale: 18,
    displacementSize: 256,
    scanlineIntensity: 0.22,
    scanlinePeriod: 4.0,
    grilleIntensity: 0.18,
    grillePitch: 3.0,
    chromaticAberration: 2.5,
    bloomIntensity: 0.22,
    bloomRadius: 1.6,
    vignetteStart: 0.45,
    vignetteEnd: 0.95,
    vignetteIntensity: 0.35,
    overlayBarrel: 0.0,      // SVG filter on <html> handles barrel globally; shader barrel disabled to avoid double-distortion
    beamScan: false,
    beamWidth: 6.0,
    flickerIntensity: 0.025,
    warmth: 0.02,
    damperWireOpacity: 0.14
  };

  // ─── Config Merge ────────────────────────────────────────────
  function mergeConfig() {
    var overrides = window.JJ_CRT_SHADER_CONFIG || {};
    var cfg = {};
    var key;
    for (key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        cfg[key] = overrides.hasOwnProperty(key) ? overrides[key] : defaults[key];
      }
    }
    return cfg;
  }

  // ─── Displacement Map Generator ──────────────────────────────
  /**
   * Generates a barrel distortion displacement map as a data URL.
   *
   * For each pixel, normalizes coordinates to [-1, 1], computes radial
   * barrel displacement, and encodes it in R (horizontal) and G (vertical)
   * channels. 128 = neutral (no displacement).
   *
   * @param {number} size  - Map dimensions (square), default 256
   * @param {number} strength - Distortion strength, default 0.12
   * @returns {string} PNG data URL
   */
  function generateDisplacementMap(size, strength) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;

    var maxR2 = 2.0; // corners: 1^2 + 1^2
    var maxDisp = strength * maxR2;

    var x, y, idx, nx, ny, r2, dx, dy, rVal, gVal;

    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        idx = (y * size + x) * 4;

        // Normalize to [-1, 1]
        nx = (x / (size - 1)) * 2 - 1;
        ny = (y / (size - 1)) * 2 - 1;

        // Radial distance squared
        r2 = nx * nx + ny * ny;

        // Barrel displacement (quadratic increase from center)
        dx = nx * strength * r2;
        dy = ny * strength * r2;

        // Map to 0-255 range; 128 = neutral
        rVal = 128 + (dx / maxDisp) * 127;
        gVal = 128 + (dy / maxDisp) * 127;

        // Clamp
        rVal = rVal < 0 ? 0 : rVal > 255 ? 255 : rVal;
        gVal = gVal < 0 ? 0 : gVal > 255 ? 255 : gVal;

        data[idx]     = rVal; // R — horizontal displacement
        data[idx + 1] = gVal; // G — vertical displacement
        data[idx + 2] = 128;  // B — unused, neutral
        data[idx + 3] = 255;  // A — fully opaque
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // ─── SVG Barrel Distortion Filter ────────────────────────────
  /**
   * Creates an inline SVG containing an feDisplacementMap filter
   * and appends it to document.body. The filter (#jj-crt-barrel) is
   * referenced by CSS: filter: url(#jj-crt-barrel).
   */
  function initBarrelDistortion(cfg) {
    var mapUrl = generateDisplacementMap(cfg.displacementSize, cfg.barrelStrength);

    // Build SVG markup — inline so the filter is available to CSS url() refs
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';

    var defs = document.createElementNS(svgNS, 'defs');

    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', 'jj-crt-barrel');
    filter.setAttribute('x', '-5%');
    filter.setAttribute('y', '-5%');
    filter.setAttribute('width', '110%');
    filter.setAttribute('height', '110%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    // feImage: load the displacement map
    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttribute('result', 'displacementMap');
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', mapUrl);
    feImage.setAttribute('preserveAspectRatio', 'none');

    // feFlood: black fill behind displaced content (prevents white edges
    // where displacement samples outside the source graphic bounds)
    var feFlood = document.createElementNS(svgNS, 'feFlood');
    feFlood.setAttribute('flood-color', '#000000');
    feFlood.setAttribute('flood-opacity', '1');
    feFlood.setAttribute('result', 'blackFill');

    // feDisplacementMap: apply barrel distortion
    var feDisplace = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisplace.setAttribute('in', 'SourceGraphic');
    feDisplace.setAttribute('in2', 'displacementMap');
    feDisplace.setAttribute('scale', String(cfg.barrelScale));
    feDisplace.setAttribute('xChannelSelector', 'R');
    feDisplace.setAttribute('yChannelSelector', 'G');
    feDisplace.setAttribute('result', 'displaced');

    // feComposite: layer displaced content over black fill
    var feComposite = document.createElementNS(svgNS, 'feComposite');
    feComposite.setAttribute('in', 'displaced');
    feComposite.setAttribute('in2', 'blackFill');
    feComposite.setAttribute('operator', 'over');

    filter.appendChild(feImage);
    filter.appendChild(feFlood);
    filter.appendChild(feDisplace);
    filter.appendChild(feComposite);
    defs.appendChild(filter);
    svg.appendChild(defs);

    document.body.appendChild(svg);
  }

  // ─── GLSL Shaders ────────────────────────────────────────────
  var CRT_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var CRT_FRAG = [
    'precision highp float;',
    '',
    'varying vec2 vUv;',
    '',
    'uniform float uTime;',
    'uniform vec2  uResolution;',
    'uniform float uScanlineIntensity;',
    'uniform float uScanlinePeriod;',
    'uniform float uGrilleIntensity;',
    'uniform float uGrillePitch;',
    'uniform float uChromaticAberration;',
    'uniform float uBloomIntensity;',
    'uniform float uBloomRadius;',
    'uniform float uVignetteStart;',
    'uniform float uVignetteEnd;',
    'uniform float uVignetteIntensity;',
    'uniform float uBarrelDistortion;',
    'uniform bool  uBeamScan;',
    'uniform float uBeamWidth;',
    'uniform float uFlickerIntensity;',
    'uniform float uWarmth;',
    'uniform float uDamperWireOpacity;',
    '',
    '/* Barrel distortion for overlay UVs */',
    'vec2 barrelUV(vec2 uv, float k) {',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c, c);',
    '  vec2 warped = c * (1.0 + k * r2);',
    '  return warped + 0.5;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 px = uv * uResolution;',
    '',
    '  /* Apply barrel distortion to overlay coordinates */',
    '  vec2 bUv = barrelUV(uv, uBarrelDistortion);',
    '  vec2 bPx = bUv * uResolution;',
    '',
    '  /* ── Scanlines (Gaussian profile) ─────────────────────── */',
    '  float scanY = mod(bPx.y, uScanlinePeriod);',
    '  float scanCenter = uScanlinePeriod * 0.5;',
    '  float scanDist = abs(scanY - scanCenter) / scanCenter;',
    '  float scanline = 1.0 - uScanlineIntensity * exp(-scanDist * scanDist * 4.0);',
    '',
    '  /* ── Trinitron Aperture Grille (vertical RGB stripes) ── */',
    '  float grilleX = mod(bPx.x, uGrillePitch);',
    '  float grillePhase = grilleX / uGrillePitch;',
    '  vec3 grille = vec3(1.0);',
    '  float grilleR = smoothstep(0.0, 0.05, grillePhase) * (1.0 - smoothstep(0.20, 0.25, grillePhase));',
    '  float grilleG = smoothstep(0.25, 0.30, grillePhase) * (1.0 - smoothstep(0.45, 0.50, grillePhase));',
    '  float grilleB = smoothstep(0.50, 0.55, grillePhase) * (1.0 - smoothstep(0.70, 0.75, grillePhase));',
    '  float grilleGap = smoothstep(0.73, 0.75, grillePhase);',
    '  grille.r = mix(1.0, 1.0 + uGrilleIntensity, grilleR);',
    '  grille.g = mix(1.0, 1.0 + uGrilleIntensity, grilleG);',
    '  grille.b = mix(1.0, 1.0 + uGrilleIntensity, grilleB);',
    '  grille *= mix(1.0, 1.0 - uGrilleIntensity * 0.5, grilleGap);',
    '',
    '  vec2 center = bUv - 0.5;',
    '',
    '  /* ── Bloom (simplified single-pass glow) ──────────────── */',
    '  float bloomDist = length(center);',
    '  float bloom = uBloomIntensity * exp(-bloomDist * bloomDist * uBloomRadius * uBloomRadius);',
    '',
    '  /* ── Vignette ─────────────────────────────────────────── */',
    '  float vignetteDist = length(center) * 1.414;',
    '  float vignette = 1.0 - uVignetteIntensity * smoothstep(uVignetteStart, uVignetteEnd, vignetteDist);',
    '',
    '  /* ── Damper Wires (2 horizontal shadows at 1/3 and 2/3) ─ */',
    '  float wire1 = 1.0 - uDamperWireOpacity * (1.0 - smoothstep(0.0, 1.5 / uResolution.y, abs(bUv.y - 0.3333)));',
    '  float wire2 = 1.0 - uDamperWireOpacity * (1.0 - smoothstep(0.0, 1.5 / uResolution.y, abs(bUv.y - 0.6667)));',
    '  float damperWires = wire1 * wire2;',
    '',
    '  /* ── Beam Scanning ────────────────────────────────────── */',
    '  float beamBrightness = 1.0;',
    '  if (uBeamScan) {',
    '    float beamPos = mod(uTime * 60.0, uResolution.y);',
    '    float beamDist = abs(bPx.y - beamPos);',
    '    float beamFalloff = uBeamWidth * uScanlinePeriod;',
    '    beamBrightness = 0.85 + 0.15 * exp(-beamDist * beamDist / (beamFalloff * beamFalloff));',
    '  }',
    '',
    '  /* ── Screen Flicker ───────────────────────────────────── */',
    '  float flicker = 1.0 - uFlickerIntensity * sin(uTime * 188.5);',
    '',
    '  /* ── D65 Warm Tint ────────────────────────────────────── */',
    '  vec3 warmTint = vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.6, 1.0 - uWarmth * 0.4);',
    '',
    '',
    '  /* ── Power State ──────────────────────────────────────── */',
    '  float powerFade = 1.0;',
    '  if (uTime < 0.4) {',
    '    powerFade = smoothstep(0.0, 1.0, uTime / 0.4);',
    '  }',
    '',
    '  /* ── Composite ────────────────────────────────────────── */',
    '  float alpha = 0.0;',
    '  vec3 color = vec3(0.0);',
    '',
    '  float scanAlpha = (1.0 - scanline);',
    '',
    '  float grilleAlpha = (1.0 - min(grille.r, min(grille.g, grille.b)));',
    '  vec3 phosphorTint = vec3(',
    '    grilleR * 0.4,',
    '    grilleG * 0.4,',
    '    grilleB * 0.4',
    '  ) * uGrilleIntensity;',
    '',
    '  vec3 caColor = vec3(0.0);',
    '  float caAlpha = 0.0;',
    '',
    '  float vignetteAlpha = (1.0 - vignette);',
    '',
    '  float totalDarken = 1.0 - (1.0 - scanAlpha) * (1.0 - grilleAlpha) * (1.0 - vignetteAlpha);',
    '  totalDarken *= damperWires;',
    '  totalDarken *= beamBrightness;',
    '  totalDarken *= flicker;',
    '',
    '  color = phosphorTint + caColor + vec3(bloom) * warmTint;',
    '  alpha = max(totalDarken, caAlpha);',
    '',
    '  gl_FragColor = vec4(color, clamp(alpha * powerFade, 0.0, 1.0));',
    '}'
  ].join('\n');

  // ─── Three.js CRT Overlay ──────────────────────────────────────
  function initShaderOverlay(cfg) {
    if (typeof THREE === 'undefined') return;

    var canvas = document.getElementById('jj-crt-shader-canvas');
    if (!canvas) return;

    var reducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: false
      });
    } catch (e) {
      return;
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var scene = new THREE.Scene();

    var uniforms = {
      uTime:                { value: 0.0 },
      uResolution:          { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
      uScanlineIntensity:   { value: cfg.scanlineIntensity },
      uScanlinePeriod:      { value: cfg.scanlinePeriod },
      uGrilleIntensity:     { value: cfg.grilleIntensity },
      uGrillePitch:         { value: cfg.grillePitch },
      uChromaticAberration: { value: cfg.chromaticAberration },
      uBloomIntensity:      { value: cfg.bloomIntensity },
      uBloomRadius:         { value: cfg.bloomRadius },
      uVignetteStart:       { value: cfg.vignetteStart },
      uVignetteEnd:         { value: cfg.vignetteEnd },
      uVignetteIntensity:   { value: cfg.vignetteIntensity },
      uBarrelDistortion:    { value: cfg.overlayBarrel },
      uBeamScan:            { value: reducedMotion ? false : cfg.beamScan },
      uBeamWidth:           { value: cfg.beamWidth },
      uFlickerIntensity:    { value: reducedMotion ? 0.0 : cfg.flickerIntensity },
      uWarmth:              { value: cfg.warmth },
      uDamperWireOpacity:   { value: cfg.damperWireOpacity }
    };

    var material = new THREE.ShaderMaterial({
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
      uniforms: uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    var geometry = new THREE.PlaneGeometry(2, 2);
    var mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    var startTime = performance.now();
    var running = true;

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      uniforms.uTime.value = (performance.now() - startTime) / 1000.0;
      renderer.render(scene, camera);
    }

    function onResize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w * dpr, h * dpr);
    }
    window.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        startTime = performance.now() - uniforms.uTime.value * 1000.0;
        animate();
      }
    });

    animate();

    window.JJ_CRT_SHADER = {
      uniforms: uniforms,
      renderer: renderer,
      pause: function () { running = false; },
      resume: function () { running = true; animate(); }
    };
  }

  // ─── Init ────────────────────────────────────────────────────
  function init() {
    // Accessibility: respect high-contrast preference
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
      return;
    }

    var cfg = mergeConfig();

    initBarrelDistortion(cfg);

    // Add class to <html> (not body) so the SVG filter on the root element
    // doesn't break position:fixed descendants (root element is exempt from
    // creating a new containing block per CSS Filter Effects spec).
    document.documentElement.classList.add('jj-crt-shader-active');

    initShaderOverlay(cfg);
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
