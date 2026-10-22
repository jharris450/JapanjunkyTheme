/**
 * JapanJunky CRT Shader — Tube-Face Warp + Overlay
 *
 * Models a Sony PVM-14M4U (1997): 14" HR Trinitron M34LHF20X, 13" viewable
 * (267.5 x 200.6 mm), 0.25 mm aperture-grille pitch, 800 TVL, SMPTE-C
 * phosphor, 90° deflection, 15.6 kHz only (240p / 480i), ONE damper wire.
 * (Same tube as the BVM-D14H5U this file used to be labelled with — the BVM
 * only adds 31-45 kHz formats and a removable light-tint glare film, neither
 * of which this overlay models.) Sources: Sony PVM-M brochure 1997, Sony
 * BVM-D brochure 2000, crtdatabase.com, Sony US5525859 (one damper line on
 * 14-16" grilles, two on 18-25").
 *
 * Two layers, inspired by Codetaur's Three.js CRT shader:
 *   Layer 1: inline SVG filter on #jj-crt-content (filter: url(#jj-crt-barrel))
 *            = per-pixel COLOUR then the tube-face WARP, over everything in
 *            the wrapper (text, images, canvases, video, the overlay canvas):
 *            - CRT gamma 2.4 vs the LCD's 2.2 (feComponentTransfer, sRGB space)
 *            - beam-current gain with a soft knee (feComponentTransfer table,
 *              linear light): the raster mask below darkens the average,
 *              the real beam puts that energy into brighter lines
 *            - SMPTE-C phosphor gamut re-expressed for an sRGB display
 *              (feColorMatrix in linear light; D65 in = D65 out, no tint)
 *            - CYLINDRICAL Trinitron face (feDisplacementMap: curved
 *              left-right, flat top-bottom — vertical lines stay straight,
 *              horizontal lines bow toward the centre row).
 *            Absent on the no-barrel paths (Firefox / handheld / lite /
 *            YouTube-tear pages), colour included — see init().
 *   Layer 2: Three.js fullscreen quad (scanlines, grille, damper wire, bloom,
 *            vignette, dither). Scanline period + beam profile, grille
 *            pitch and wire shadow are derived from the tube's physical
 *            dimensions at the current viewport + DPR (see applyTubeScale),
 *            not fixed px.
 *
 * Config: window.JJ_CRT_SHADER_CONFIG (optional overrides of `defaults`)
 * Loaded: <script src="{{ 'japanjunky-crt-shader.js' | asset_url }}" defer></script>
 * Verify: node tests/harness/crt-geometry.js (grid pattern + pixel checks)
 */
(function () {
  'use strict';

  // ─── Default Configuration ───────────────────────────────────
  var defaults = {
    // Physical tube (PVM-14M4U / M34LHF20X). Every pixel-sized raster
    // feature below is derived from these at the live viewport so the look
    // is the same at 1080p, 4K and retina instead of a fixed px count.
    tubeWidthMm: 267.5,        // viewable 4:3 raster width (Sony BVM-D brochure)
    tubeHeightMm: 200.6,       // viewable raster height
    grillePitchMm: 0.25,       // aperture-grille triad pitch -> 1070 triads across
    scanLines: 240,            // visible raster lines (240p look; 480 = 480i)
    beamSpotMm: 0.40,          // electron-beam spot FWHM at picture drive. The
                               // 800 TVL rating puts it at ~0.25 mm at the
                               // resolution test (low beam current); it blooms
                               // to ~0.4 mm at normal brightness. Sets the
                               // scanline profile (each raster line is this
                               // Gaussian, on a 200.6/240 = 0.84 mm pitch) and
                               // the width of the damper-wire shadow.
    damperWireY: 0.5,          // ONE wire on a 14" grille, centre of the tube
                               // (fraction of height from the top; < 0 = none)
    damperWireWidthMm: 0.025,  // the wire itself: 15-30 um tungsten (Sony
                               // US6166782). Far thinner than the beam spot, so
                               // its shadow is spot-wide and only wire/spot
                               // (~6 %) deep ("relatively low contrast") --
                               // see applyTubeScale
    damperWireOpacity: 1.0,    // occlusion of the wire itself (1 = opaque)
    grillePitchMin: 3.0,       // device-px floor: 0.25 mm is ~1.8 px on a 1920
                               // viewport, below what an LCD can draw as RGB
                               // stripes (it moirés instead); the physical pitch
                               // takes over once the viewport is >= ~3200 px wide
    // Colour: what the PVM's CRT gamma + SMPTE-C phosphors do to every
    // pixel. Lives in the same SVG filter chain as the face warp.
    phosphorMatrix: [            // linear sRGB -> as shown by SMPTE-C phosphors,
      0.9395, 0.0502, 0.0103,    // re-expressed for an sRGB display. Rows sum
      0.0178, 0.9658, 0.0164,    // to 1: white and greys untouched (D65 -> D65).
     -0.0016, -0.0044, 1.0060    // From SMPTE RP 145 vs sRGB primaries.
    ],
    whiteGains: [1, 1, 1],       // D65 = the U-model's calibration (chosen
                                 // 2026-10-21). D93 (NTSC-J studio setting,
                                 // bluish) would be [0.621, 0.753, 1.0].
    crtGamma: 2.4,               // CRT EOTF; the LCD shows ~2.2, so shadows
    displayGamma: 2.2,           // are deepened by v^(2.4/2.2).
    // Cylindrical face warp (see generateDisplacementMap).
    barrelStrength: 0.08,
    barrelScale: 18,           // px shift at the side edges: ~1.5% of half-height,
                               // the perspective sag of a ~1 m radius face at 60 cm
    displacementSize: 256,
    scanlineIntensity: 0.40,   // depth of the beam profile: 1 = physical (gaps
                               // between 240p lines ~85 % dark), 0 = flat.
                               // 0.40 keeps the crisp line/gap shape (gap =
                               // 0.64 of the line on white) while the mask
                               // alone leaves 80 % of the light -- see
                               // scanlineGain. Was 0.22 with an inverted
                               // profile (narrow dark gap on a bright field)
                               // until 2026-10-21; 0.45 unaided read as "too
                               // dark" on the live site.
    scanlineGain: 1.25,        // beam-current gain on the content, in linear
                               // light. A CRT puts the beam's energy into
                               // narrow lines, so the lines run brighter than
                               // a flat field and the line-averaged luminance
                               // stays at the calibrated level. With 0.40 this
                               // puts a Win95 grey field at 0.89 of flat (the
                               // 0.22 profile gave 0.90); pure white fields
                               // sit at 0.80 because an LCD can't go past
                               // white -- the gain rolls off into a soft knee
                               // there instead of clipping (192/223/255 ->
                               // 207/239/255, bevels stay distinct).
    scanlineGainKnee: 0.6,     // linear-light level where the roll-off starts
                               // (auto-lowered if the curve would go
                               // non-monotonic for a big gain)
    scanlineDepthNoGain: 0.5,  // on the no-barrel paths (Firefox / handheld)
                               // the SVG chain, and so the gain, is absent:
                               // the raster mask runs at this fraction of
                               // scanlineIntensity so the page's average
                               // brightness doesn't drop there either
    grilleIntensity: 0.18,
    chromaticAberration: 2.5,
    bloomIntensity: 0.22,
    bloomRadius: 1.6,
    vignetteStart: 0.45,
    vignetteEnd: 0.95,
    vignetteIntensity: 0.35,
    overlayBarrel: 0.0,      // SVG filter on <html> handles barrel globally; shader barrel disabled to avoid double-distortion
    beamScan: false,
    beamWidth: 6.0,
    ditherIntensity: 0.06   // checkerboard phosphor grain over the whole tube
    // Removed 2026-10-21 for accuracy: the animated "volumetric fog" wisps
    // (no such thing on a CRT), a global 30 Hz brightness flicker (the PVM
    // refreshes at 60 Hz — 240p full frames / 480i fields — and 60 Hz
    // cannot be shown on a 60 Hz display at all), and the "warm tint" on
    // the bloom (the monitor is D65-calibrated: same white as the display).
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
   * Generates the tube-face displacement map as a data URL.
   *
   * A Trinitron face is CYLINDRICAL: curved left-to-right, flat top-to-
   * bottom. Seen head-on, the glass recedes from the viewer with x² only,
   * so perspective shrinks both screen axes by the same factor s(x) ∝ x².
   * Hence dx depends on x alone (vertical lines stay straight, the side
   * edges just move inward) while dy = y · s(x) bows every horizontal line
   * toward the centre row by an amount growing with |y|: the top edge domes,
   * the bottom edge bowls, the middle row is straight. A radial (spherical)
   * map — what this used to be — also bends vertical lines, which a
   * Trinitron never does.
   *
   * R = horizontal, G = vertical displacement; 128 = neutral.
   *
   * @param {number} size  - Map dimensions (square), default 256
   * @param {number} strength - Sag at the side edges (|nx| = 1), normalised
   * @returns {string} PNG data URL
   */
  function generateDisplacementMap(size, strength) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;

    var maxDisp = strength; // |nx| = 1 at the left/right edges

    var x, y, idx, nx, ny, sag, dx, dy, rVal, gVal;

    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        idx = (y * size + x) * 4;

        // Normalize to [-1, 1]
        nx = (x / (size - 1)) * 2 - 1;
        ny = (y / (size - 1)) * 2 - 1;

        // Cylinder sag: grows with x² only, same factor on both axes
        sag = strength * nx * nx;
        dx = nx * sag;
        dy = ny * sag;

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

  // ─── Phosphor colour matrix ──────────────────────────────────
  /**
   * feColorMatrix "values" (4x5) from the 3x3 phosphor matrix with the
   * white-point drive gains folded into its columns (gain j scales how
   * hard channel j is driven, i.e. the matrix's j-th column).
   */
  function phosphorMatrixValues(cfg) {
    var m = cfg.phosphorMatrix, g = cfg.whiteGains, rows = [], r, c, row;
    for (r = 0; r < 3; r++) {
      row = [];
      for (c = 0; c < 3; c++) row.push((m[r * 3 + c] * g[c]).toFixed(5));
      row.push('0', '0');
      rows.push(row.join(' '));
    }
    rows.push('0 0 0 1 0');
    return rows.join('  ');
  }

  // ─── SVG Colour + Tube-Face Filter ───────────────────────────
  /**
   * Creates an inline SVG filter (#jj-crt-barrel) and appends it to
   * document.body; CSS references it with filter: url(#jj-crt-barrel).
   * Chain: SourceGraphic -> CRT gamma -> phosphor matrix -> cylindrical
   * displacement over a black flood.
   */
  // Beam-current gain as a 33-point feComponentTransfer table in linear
  // light: y = G x up to the knee k, then a quadratic that reaches (1, 1)
  // with a positive slope (k is pulled down if G is too big for the
  // requested knee). G <= 1 gives the identity.
  function gainTableValues(cfg) {
    var G = cfg.scanlineGain, k = cfg.scanlineGainKnee, vals = [], i, x, t, a, y;
    if (!(G > 1)) G = 1;
    k = Math.min(k, 1 - 2.2 * (G - 1) / G);
    a = (G - 1) / ((1 - k) * (1 - k));
    for (i = 0; i <= 32; i++) {
      x = i / 32;
      if (x <= k) y = G * x;
      else { t = x - k; y = G * k + G * t - a * t * t; }
      vals.push(Math.min(1, y).toFixed(5));
    }
    return vals.join(' ');
  }

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

    // ── Colour 1/2: CRT gamma. The signal value v lights the CRT at v^2.4;
    // the LCD lights v'^2.2, so v' = v^(2.4/2.2), applied to the encoded
    // value (sRGB space). Deepens shadows a touch, leaves white alone.
    var feGamma = document.createElementNS(svgNS, 'feComponentTransfer');
    feGamma.setAttribute('in', 'SourceGraphic');
    feGamma.setAttribute('result', 'crtGamma');
    feGamma.setAttribute('color-interpolation-filters', 'sRGB');
    var exponent = String(cfg.crtGamma / cfg.displayGamma);
    ['feFuncR', 'feFuncG', 'feFuncB'].forEach(function (name) {
      var fn = document.createElementNS(svgNS, name);
      fn.setAttribute('type', 'gamma');
      fn.setAttribute('amplitude', '1');
      fn.setAttribute('exponent', exponent);
      fn.setAttribute('offset', '0');
      feGamma.appendChild(fn);
    });

    // ── Colour 2/3: beam-current gain (see scanlineGain), LINEAR light.
    // The overlay's raster mask (scanlineIntensity) only ever darkens; the
    // tube would show the masked-out energy as brighter lines instead.
    var feGain = document.createElementNS(svgNS, 'feComponentTransfer');
    feGain.setAttribute('in', 'crtGamma');
    feGain.setAttribute('result', 'beamGain');
    feGain.setAttribute('color-interpolation-filters', 'linearRGB');
    var table = gainTableValues(cfg);
    ['feFuncR', 'feFuncG', 'feFuncB'].forEach(function (name) {
      var fn = document.createElementNS(svgNS, name);
      fn.setAttribute('type', 'table');
      fn.setAttribute('tableValues', table);
      feGain.appendChild(fn);
    });

    // ── Colour 3/3: SMPTE-C phosphor gamut, in LINEAR light (the matrix
    // mixes emitted light, not code values). Rows sum to 1 so D65 white
    // and every grey pass through unchanged — no tint.
    var feColor = document.createElementNS(svgNS, 'feColorMatrix');
    feColor.setAttribute('in', 'beamGain');
    feColor.setAttribute('result', 'phosphor');
    feColor.setAttribute('type', 'matrix');
    feColor.setAttribute('color-interpolation-filters', 'linearRGB');
    feColor.setAttribute('values', phosphorMatrixValues(cfg));

    // feImage: load the displacement map
    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttribute('result', 'displacementMap');
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', mapUrl);
    feImage.setAttribute('preserveAspectRatio', 'none');
    // Explicit subregion = full filter region. Without width/height, Chromium
    // renders a raster data-URL feImage at its intrinsic 256x256 at the origin,
    // so only the top-left corner gets displaced (barrel curves the left/top
    // edges, not the whole screen). These force it to stretch across the viewport.
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('width', '100%');
    feImage.setAttribute('height', '100%');

    // feFlood: black fill behind displaced content (prevents white edges
    // where displacement samples outside the source graphic bounds)
    var feFlood = document.createElementNS(svgNS, 'feFlood');
    feFlood.setAttribute('flood-color', '#000000');
    feFlood.setAttribute('flood-opacity', '1');
    feFlood.setAttribute('result', 'blackFill');

    // feDisplacementMap: the cylindrical face warp, on the colour-corrected
    // image (black flood behind it stays black either way)
    var feDisplace = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisplace.setAttribute('in', 'phosphor');
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

    filter.appendChild(feGamma);
    filter.appendChild(feGain);
    filter.appendChild(feColor);
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
    'uniform float uScanSigmaPx;',
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
    'uniform float uDamperWireOpacity;',
    'uniform float uDamperWireY;',
    'uniform float uDamperWireHalfPx;',
    'uniform float uDitherIntensity;',
    '',
    '/* Cylindrical face warp for overlay UVs (idle while the SVG filter on',
    '   #jj-crt-content warps content and this canvas together). x² only:',
    '   same shape as generateDisplacementMap. */',
    'vec2 barrelUV(vec2 uv, float k) {',
    '  vec2 c = uv - 0.5;',
    '  float sag = k * c.x * c.x * 4.0;',
    '  return c * (1.0 + sag) + 0.5;',
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
    '  /* ── Scanlines: the raster itself ─────────────────────────',
    '     Each of the 240 lines is the beam spot, a Gaussian of sigma',
    '     uScanSigmaPx (from beamSpotMm), on a uScanlinePeriod pitch. The',
    '     phosphor between lines only gets the tails, so the profile is a',
    '     narrow bright line and a wide dark gap. Summing the three nearest',
    '     lines and normalising to the on-line peak gives the transmission',
    '     the LCD can show; uScanlineIntensity scales its depth. ── */',
    '  float scanD = mod(bPx.y + uScanlinePeriod * 0.5, uScanlinePeriod) - uScanlinePeriod * 0.5;',
    '  float scanK = -0.5 / (uScanSigmaPx * uScanSigmaPx);',
    '  float scanSum = exp(scanD * scanD * scanK)',
    '                + exp((scanD - uScanlinePeriod) * (scanD - uScanlinePeriod) * scanK)',
    '                + exp((scanD + uScanlinePeriod) * (scanD + uScanlinePeriod) * scanK);',
    '  float scanPeak = 1.0 + 2.0 * exp(uScanlinePeriod * uScanlinePeriod * scanK);',
    '  float scanline = 1.0 - uScanlineIntensity * (1.0 - scanSum / scanPeak);',
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
    '  /* ── Damper Wire (ONE on a 14" Trinitron grille, at uDamperWireY) ─',
    '     Anti-aliased box uDamperWireHalfPx either side of the wire, only',
    '     uDamperWireOpacity deep (both set by applyTubeScale: beam-spot wide,',
    '     ~10 % deep). A negative uDamperWireY puts it off-screen (= no wire). ── */',
    '  float wireDist = abs(bPx.y - uDamperWireY * uResolution.y);',
    '  float damperWires = 1.0 - uDamperWireOpacity * (1.0 - smoothstep(uDamperWireHalfPx - 0.5, uDamperWireHalfPx + 0.5, wireDist));',
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
    '  /* ── Checker Dither (global phosphor grain, 2px cells) ── */',
    '  float checker = mod(floor(bPx.x * 0.5) + floor(bPx.y * 0.5), 2.0);',
    '  float ditherAlpha = uDitherIntensity * checker;',
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
    '  /* The wire is a brightness factor like the other layers, so it goes',
    '     INSIDE the transmission product. (It used to scale the darkening',
    '     amount instead, which only lightened the scanlines along the wire',
    '     rows — the wires never actually showed.) */',
    '  float totalDarken = 1.0 - (1.0 - scanAlpha) * (1.0 - grilleAlpha) * (1.0 - vignetteAlpha) * (1.0 - ditherAlpha) * damperWires;',
    '  totalDarken *= beamBrightness;',
    '',
    '  color = phosphorTint + caColor + vec3(bloom);',
    '  alpha = max(totalDarken, caAlpha);',
    '',
    '  gl_FragColor = vec4(color, clamp(alpha * powerFade, 0.0, 1.0));',
    '}'
  ].join('\n');

  // ─── Three.js CRT Overlay ──────────────────────────────────────
  function initShaderOverlay(cfg) {
    if (typeof THREE === 'undefined') return;
    // No SVG chain (Firefox / handheld / lite-undo without barrel) = no
    // beam gain to pay for the raster mask, so the mask runs shallower.
    var noGain = document.documentElement.classList.contains('jj-crt-no-barrel')
      || !document.getElementById('jj-crt-barrel');

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

    // Quality-governed DPR cap. JJ_Perf lowers this on throttled devices so
    // the fill-rate-heavy fullscreen pass renders fewer pixels. 2x on 'high'.
    var perfDprCap = 2;
    var dpr = Math.min(window.devicePixelRatio || 1, perfDprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var scene = new THREE.Scene();

    var uniforms = {
      uTime:                { value: 0.0 },
      uResolution:          { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
      uScanlineIntensity:   { value: cfg.scanlineIntensity * (noGain ? cfg.scanlineDepthNoGain : 1) },
      uScanlinePeriod:      { value: 4.0 },               // set by applyTubeScale
      uScanSigmaPx:         { value: 1.0 },               // set by applyTubeScale
      uGrilleIntensity:     { value: cfg.grilleIntensity },
      uGrillePitch:         { value: cfg.grillePitchMin }, // set by applyTubeScale
      uChromaticAberration: { value: cfg.chromaticAberration },
      uBloomIntensity:      { value: cfg.bloomIntensity },
      uBloomRadius:         { value: cfg.bloomRadius },
      uVignetteStart:       { value: cfg.vignetteStart },
      uVignetteEnd:         { value: cfg.vignetteEnd },
      uVignetteIntensity:   { value: cfg.vignetteIntensity },
      uBarrelDistortion:    { value: cfg.overlayBarrel },
      uBeamScan:            { value: reducedMotion ? false : cfg.beamScan },
      uBeamWidth:           { value: cfg.beamWidth },
      uDamperWireOpacity:   { value: 0.0 },               // set by applyTubeScale
      uDamperWireY:         { value: cfg.damperWireY },
      uDamperWireHalfPx:    { value: 1.5 },               // set by applyTubeScale
      uDitherIntensity:     { value: cfg.ditherIntensity }
    };

    // Physical -> device px. The tube's 240 raster lines, 1070 grille
    // triads and 25 um wire are spread over whatever viewport the
    // page has, so their pixel size follows viewport + DPR (a fixed "4 px"
    // period was 270 lines at 1080p and 540 lines at 4K/retina).
    function applyTubeScale(wPx, hPx) {
      uniforms.uScanlinePeriod.value = cfg.scanLines > 0 ? hPx / cfg.scanLines : 4.0;
      // Beam spot in device px: FWHM = beamSpotMm of the tubeHeightMm raster.
      // sigma = FWHM / 2.3548; floored at 0.5 px so the line profile can't
      // alias on a short viewport.
      var spotPx = hPx * cfg.beamSpotMm / cfg.tubeHeightMm;
      uniforms.uScanSigmaPx.value = Math.max(0.5, spotPx / 2.3548);
      var triads = cfg.grillePitchMm > 0 ? cfg.tubeWidthMm / cfg.grillePitchMm : 0;
      uniforms.uGrillePitch.value = Math.max(cfg.grillePitchMin, triads > 0 ? wPx / triads : 0);
      // Wire shadow. The 25 um wire is far thinner than the beam spot, so
      // the phosphor sees a spot-wide band only wire/spot (~6 %) deep --
      // Sony US6166782: "the damping wire diameter is smaller than that of
      // the visible beams' cross section, the shadow is of relatively low
      // contrast". Below 1 px the band is a single pixel row and the depth
      // scales with coverage, so the integral the eye sums is the same at
      // every viewport. The 2026-10-21 first cut drew a 0.4 mm / 25 % band
      // -- a hard line no 14" PVM shows.
      var wirePx = hPx * cfg.damperWireWidthMm / cfg.tubeHeightMm;
      var bandPx = Math.max(1.0, spotPx, wirePx);
      uniforms.uDamperWireHalfPx.value = bandPx * 0.5;
      uniforms.uDamperWireOpacity.value = cfg.damperWireOpacity * Math.min(1.0, wirePx / bandPx);
    }
    applyTubeScale(window.innerWidth * dpr, window.innerHeight * dpr);

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
    // Lite shed (japanjunky-perf.js): the fullscreen pass is a per-frame
    // full-viewport re-raster on a software compositor (measured -4 fps of a
    // 21 fps budget). A shed overlay is dead — visibility/resume are gated on
    // it; crt.css hides the canvas and shows the CSS scanlines. If lite is
    // undone, init() builds a fresh overlay on the same canvas.
    var shed = false;

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      uniforms.uTime.value = (performance.now() - startTime) / 1000.0;
      renderer.render(scene, camera);
    }

    function onResize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, perfDprCap);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w * dpr, h * dpr);
      applyTubeScale(w * dpr, h * dpr);
    }
    window.addEventListener('resize', onResize);

    // ─── Adaptive quality ────────────────────────────────────────
    // Shed the expensive per-pixel effects (bloom + chromatic aberration are
    // multi-tap) and lower render DPR when the governor reports a weak frame
    // rate. Base values captured post-reduced-motion so restoring 'high'
    // preserves the accessibility state.
    var baseBloom  = uniforms.uBloomIntensity.value;
    var baseChroma = uniforms.uChromaticAberration.value;
    if (window.JJ_Perf) {
      window.JJ_Perf.onChange(function (t) {
        if (t === 'low') {
          perfDprCap = 1;
          uniforms.uBloomIntensity.value = 0;
          uniforms.uChromaticAberration.value = 0;
        } else if (t === 'mid') {
          perfDprCap = 1.25;
          uniforms.uBloomIntensity.value = baseBloom * 0.5;
          uniforms.uChromaticAberration.value = baseChroma * 0.5;
        } else { // high
          perfDprCap = 2;
          uniforms.uBloomIntensity.value = baseBloom;
          uniforms.uChromaticAberration.value = baseChroma;
        }
        onResize();
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else if (!shed) {
        running = true;
        startTime = performance.now() - uniforms.uTime.value * 1000.0;
        animate();
      }
    });

    animate();

    window.JJ_CRT_SHADER = {
      uniforms: uniforms,
      renderer: renderer,
      config: cfg,
      pause: function () { running = false; },
      resume: function () { if (shed) return; running = true; animate(); },
      shed: function () {
        shed = true;
        running = false;
        window.removeEventListener('resize', onResize);
        // Free the GPU-side buffers; the canvas is display:none via crt.css.
        try { renderer.dispose(); } catch (e) {}
      },
      isShed: function () { return shed; }
    };
  }

  // ─── Init ────────────────────────────────────────────────────
  function init() {
    // Accessibility: respect high-contrast preference
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
      return;
    }

    var cfg = mergeConfig();

    // Firefox: Gecko executes CSS-referenced SVG filters (feDisplacementMap)
    // on the CPU and re-filters the whole viewport whenever anything inside
    // animates — measured 3-4 fps on the live homepage vs 30+ with the
    // barrel off, while Chromium runs it on the GPU at ~60 either way.
    // Skip the barrel there; the WebGL overlay (scanlines/grille/vignette)
    // is cheap everywhere and stays. jj-crt-no-barrel also turns off the
    // barrel hit-slop compensators in win95.css/crt.css.
    var isGecko = typeof CSS !== 'undefined' && CSS.supports
      && CSS.supports('-moz-appearance', 'none');

    // Handheld mode also skips the barrel (mobile GPUs + the whole-viewport
    // SVG filter are a bad mix; the gate script pre-adds jj-crt-no-barrel).
    // Lite (japanjunky-perf.js: soft-GPU probe or measured 'low', latched):
    // no barrel AND no WebGL overlay — on a software compositor the barrel
    // alone cost 6.5 -> 17 fps and the overlay 17 -> 21 (2026-09-16). The CSS
    // scanline layer takes over (crt.css, html.jj-fx-lite). A latch that
    // lands AFTER init is handled inside initShaderOverlay (shed) and by the
    // jj-crt-no-barrel class the governor adds (filter: none in crt.css).
    var lite = !!(window.JJ_Perf && window.JJ_Perf.lite);
    var barrelInjected = false;
    if (isGecko || window.JJ_MOBILE || lite) {
      document.documentElement.classList.add('jj-crt-no-barrel');
    } else {
      initBarrelDistortion(cfg);
      barrelInjected = true;
    }

    // Add class to <html> (not body) so the SVG filter on the root element
    // doesn't break position:fixed descendants (root element is exempt from
    // creating a new containing block per CSS Filter Effects spec).
    // Kept in lite too: it also pins #jj-crt-content as the fixed viewport
    // wrapper the layout expects.
    document.documentElement.classList.add('jj-crt-shader-active');

    if (!lite) initShaderOverlay(cfg);

    // Lite toggles after init: on -> shed the running overlay (the governor
    // adds jj-crt-no-barrel, crt.css drops the filter + hides the canvas);
    // off (probe-path latch undone, see perf.js) -> inject the barrel if it
    // never was, and build a fresh overlay.
    if (window.JJ_Perf && window.JJ_Perf.onLite) {
      window.JJ_Perf.onLite(function (on) {
        if (on) {
          if (window.JJ_CRT_SHADER && window.JJ_CRT_SHADER.shed) window.JJ_CRT_SHADER.shed();
        } else {
          if (!barrelInjected && !isGecko && !window.JJ_MOBILE) {
            initBarrelDistortion(cfg);
            barrelInjected = true;
          }
          if (!window.JJ_CRT_SHADER || window.JJ_CRT_SHADER.isShed()) initShaderOverlay(cfg);
        }
      });
    }
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
