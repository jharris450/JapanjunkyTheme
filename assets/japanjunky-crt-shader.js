/**
 * JapanJunky CRT Shader — Barrel Distortion + Overlay
 *
 * Task 1: SVG barrel distortion via displacement map generator + inline filter.
 * Task 2: Three.js shader overlay for scanlines, grille, bloom, vignette (placeholder).
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
    barrelStrength: 0.12,
    barrelScale: 28,
    displacementSize: 256,
    scanlineIntensity: 0.15,
    scanlinePeriod: 3.0,
    grilleIntensity: 0.12,
    grillePitch: 3.2,
    chromaticAberration: 1.5,
    bloomIntensity: 0.08,
    bloomRadius: 4.0,
    vignetteStart: 0.4,
    vignetteEnd: 1.0,
    vignetteIntensity: 0.45,
    overlayBarrel: 0.03,
    beamScan: false,
    beamWidth: 8.0,
    flickerIntensity: 0.02,
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
    feImage.setAttribute('href', mapUrl);
    feImage.setAttribute('preserveAspectRatio', 'none');

    // feDisplacementMap: apply barrel distortion
    var feDisplace = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisplace.setAttribute('in', 'SourceGraphic');
    feDisplace.setAttribute('in2', 'displacementMap');
    feDisplace.setAttribute('scale', String(cfg.barrelScale));
    feDisplace.setAttribute('xChannelSelector', 'R');
    feDisplace.setAttribute('yChannelSelector', 'G');

    filter.appendChild(feImage);
    filter.appendChild(feDisplace);
    defs.appendChild(filter);
    svg.appendChild(defs);

    document.body.appendChild(svg);
  }

  // ─── Three.js Shader Overlay (placeholder) ───────────────────
  /**
   * Placeholder for Task 2: Three.js fullscreen overlay with
   * scanlines, phosphor grille, bloom, vignette, chromatic aberration.
   */
  function initShaderOverlay(cfg) {
    // Task 2 implementation goes here
    void cfg;
  }

  // ─── Init ────────────────────────────────────────────────────
  function init() {
    // Accessibility: respect high-contrast preference
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
      return;
    }

    var cfg = mergeConfig();

    initBarrelDistortion(cfg);

    document.body.classList.add('jj-crt-shader-active');

    initShaderOverlay(cfg);
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
