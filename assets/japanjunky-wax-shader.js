/**
 * japanjunky-wax-shader.js
 * GLSL for the lava-lamp wax: orthographic raymarch of metaball blobs
 * with a subtractive Tsuno carve. UMD: window.JJ_WaxShader / module.exports.
 * No THREE dependency — screensaver.js builds the ShaderMaterial + uniforms.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_WaxShader = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BLOBS = 8;
  var N = String(MAX_BLOBS);

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'uniform float uHeatGlow;',
    'uniform int   uBlobCount;',
    'uniform vec4  uBlobs[' + N + '];',     // xy = uv center, z = slab, w = radius
    'uniform float uBlobTemp[' + N + '];',
    'uniform vec4  uTsuno;',                 // xy = uv, z = slab, w = radius
    'uniform float uTsunoActive;',
    'uniform sampler2D uAsciiTex;',          // dark->bright glyph ramp atlas (1 row)
    'uniform float uAsciiCount;',            // number of ramp glyphs
    'uniform int   uAsciiBlob;',             // blob index drawn as ASCII (-1 = none)
    'uniform float uAsciiCell;',             // character cell size in pixels
    'uniform vec2  uResolution;',            // render target px (for the cell grid)
    'varying vec2 vUv;',
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float smax(float a, float b, float k) { return -smin(-a, -b, k); }',
    '',
    'float map(vec3 p) {',
    '  float d = 1e5;',
    '  for (int i = 0; i < ' + N + '; i++) {',
    '    if (i >= uBlobCount) break;',
    '    vec4 b = uBlobs[i];',
    '    vec3 c = vec3((b.x - 0.5) * uAspect, b.y, b.z);',
    '    float ds = length(p - c) - b.w;',
    '    d = smin(d, ds, 0.20);',
    '  }',
    '  if (uTsunoActive > 0.5) {',
    '    vec3 tc = vec3((uTsuno.x - 0.5) * uAspect, uTsuno.y, uTsuno.z);',
    '    float dts = length(p - tc) - uTsuno.w;',
    '    d = smax(d, -dts, 0.14);',          // wax parts/splits around Tsuno
    '  }',
    '  return d;',
    '}',
    '',
    'vec3 calcNormal(vec3 p) {',
    '  vec2 e = vec2(0.002, 0.0);',
    '  return normalize(vec3(',
    '    map(p + e.xyy) - map(p - e.xyy),',
    '    map(p + e.yxy) - map(p - e.yxy),',
    '    map(p + e.yyx) - map(p - e.yyx)));',
    '}',
    '',
    'vec3 waxColor(float h) {',              // h = height 0 (hot) .. 1 (cool)
    '  vec3 gold   = vec3(0.95, 0.75, 0.30);',
    '  vec3 orange = vec3(0.85, 0.35, 0.05);',
    '  vec3 red    = vec3(0.40, 0.05, 0.02);',
    '  return (h < 0.5) ? mix(gold, orange, h / 0.5) : mix(orange, red, (h - 0.5) / 0.5);',
    '}',
    '',
    'void main() {',
    '  vec3 ro = vec3((vUv.x - 0.5) * uAspect, vUv.y, -1.5);',
    '  vec3 rd = vec3(0.0, 0.0, 1.0);',
    '  float t = 0.0;',
    '  float hit = -1.0;',
    '  for (int s = 0; s < 56; s++) {',
    '    vec3 p = ro + rd * t;',
    '    float d = map(p);',
    '    if (d < 0.002) { hit = t; break; }',
    '    t += max(d, 0.01);',
    '    if (t > 3.0) break;',
    '  }',
    '',
    '  // Warm background (no black void) — matches the portal\'s warm zone,',
    '  // brighter toward the heated bottom, dimmer warm red up high.',
    '  vec3 bgBottom = vec3(0.72, 0.34, 0.10);',
    '  vec3 bgTop    = vec3(0.30, 0.10, 0.05);',
    '  vec3 col = mix(bgTop, bgBottom, 1.0 - vUv.y);',
    '  if (hit > 0.0) {',
    '    vec3 p = ro + rd * hit;',
    '    vec3 n = calcNormal(p);',
    '    vec3 ld = normalize(vec3(0.4, 0.7, -0.6));',
    '    float diff = clamp(dot(n, ld), 0.0, 1.0);',
    '    float spec = pow(clamp(dot(reflect(-ld, n), -rd), 0.0, 1.0), 24.0);',
    '    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.0);',
    '    vec3 base = waxColor(clamp(p.y, 0.0, 1.0));',
    '    col = base * (0.35 + 0.65 * diff) + vec3(1.0, 0.9, 0.7) * spec * 0.5;',
    '    col += base * fres * 0.4;',
    '',
    '    // One blob renders as a 3D ASCII glob: when this surface point belongs',
    '    // to that blob (it is the nearest contributor), shade it with flowing',
    '    // characters from a brightness ramp instead of solid wax. Avoid dynamic',
    '    // uniform array indexing (GLSL ES 1.0) — pick the blob inside the loop.',
    '    if (uAsciiBlob >= 0) {',
    '      float dA = 1e5; float dOther = 1e5; float abY = 0.0;',
    '      for (int i = 0; i < ' + N + '; i++) {',
    '        if (i >= uBlobCount) break;',
    '        vec4 ob = uBlobs[i];',
    '        vec3 oc = vec3((ob.x - 0.5) * uAspect, ob.y, ob.z);',
    '        float dd = length(p - oc) - ob.w;',
    '        if (i == uAsciiBlob) { dA = dd; abY = ob.y; }',
    '        else { dOther = min(dOther, dd); }',
    '      }',
    '      if (dA <= dOther + 0.001) {',
    '        float bright = clamp(0.25 + 0.75 * diff + 0.4 * spec, 0.0, 1.0);',
    '        vec2 px = vUv * uResolution;',
    '        vec2 inCell = fract(px / uAsciiCell);',
    '        vec2 cellId = floor(px / uAsciiCell);',
    '        // kinetic: ramp index flows with time and the glob\'s height (motion)',
    '        float shift = floor(uTime * 5.0 + abY * 12.0 + cellId.y * 0.5);',
    '        float ci = mod(floor(bright * (uAsciiCount - 1.0)) + shift, uAsciiCount);',
    '        vec2 aUv = vec2((ci + inCell.x) / uAsciiCount, inCell.y);',
    '        float ink = texture2D(uAsciiTex, aUv).r;',
    '        vec3 charCol = base * (0.5 + 0.9 * diff) + vec3(1.0, 0.9, 0.7) * spec * 0.4;',
    '        col = mix(base * 0.10, charCol, step(0.4, ink));',
    '      }',
    '    }',
    '  }',
    '',
    '  float glow = (1.0 - smoothstep(0.0, 0.35, vUv.y)) * uHeatGlow;',
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 1.0);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  return { MAX_BLOBS: MAX_BLOBS, vert: VERT, frag: FRAG };
});
