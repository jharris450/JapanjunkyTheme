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
    'uniform vec4  uAsciiCenter;',           // dedicated ASCII glob: xy uv, z slab, w radius
    'uniform float uAsciiActive;',           // 1 = draw the ASCII glob
    'uniform float uAsciiCell;',             // character cell size in pixels
    'uniform vec2  uResolution;',            // render target px (for the cell grid)
    'uniform float uBlobStretch[' + N + '];', // per-blob vertical stretch (teardrop)
    'varying vec2 vUv;',
    '',
    // Lava-lamp shape constants (tune here, no rebuild of uniforms needed).
    'const float POOL_Y = 0.0;',     // bottom reservoir center y (top ~ POOL_Y+POOL_H)
    'const float POOL_W = 0.72;',    // pool x-radius as a fraction of aspect width
    'const float POOL_H = 0.16;',    // pool y-radius (rounded glowing base mound)
    'const float POOL_D = 0.40;',    // pool z-radius
    'const float BLEND  = 0.30;',    // metaball smooth-union (higher = thinner, longer necks)
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float smax(float a, float b, float k) { return -smin(-a, -b, k); }',
    '',
    'float sdEllipsoid(vec3 p, vec3 r) {',
    '  float k0 = length(p / r);',
    '  float k1 = length(p / (r * r));',
    '  return k0 * (k0 - 1.0) / max(k1, 1e-5);',
    '}',
    '',
    '// A blob as a teardrop ellipsoid: stretched along y by sy, squashed in',
    '// x/z to roughly conserve volume, so a moving blob reads as a column.',
    'float blobSD(vec3 p, vec4 b, float sy) {',
    '  vec3 c = vec3((b.x - 0.5) * uAspect, b.y, b.z);',
    '  float sx = inversesqrt(max(sy, 1e-4));',
    '  return sdEllipsoid(p - c, vec3(b.w * sx, b.w * sy, b.w * sx));',
    '}',
    '',
    'float poolSD(vec3 p) {',          // the always-present heated reservoir
    '  return sdEllipsoid(p - vec3(0.0, POOL_Y, 0.0), vec3(uAspect * POOL_W, POOL_H, POOL_D));',
    '}',
    '',
    'float map(vec3 p) {',
    '  float d = poolSD(p);',
    '  for (int i = 0; i < ' + N + '; i++) {',
    '    if (i >= uBlobCount) break;',
    '    d = smin(d, blobSD(p, uBlobs[i], uBlobStretch[i]), BLEND);',
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
    '  }',
    '',
    '  float glow = (1.0 - smoothstep(0.0, 0.35, vUv.y)) * uHeatGlow;',
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 1.0);',
    '',
    '  // ── ASCII glob ─────────────────────────────────────────────',
    '  // A separate wax sphere in FRONT of the lava, never merged with it, so',
    '  // it stays a clean stable glob. Its whole surface IS rendered as warm',
    '  // characters: the character is chosen by surface brightness (a readable',
    '  // 3D ASCII shading), and the ink modulates wax brightness — strokes are',
    '  // brighter wax, gaps are dimmer wax. No black background.',
    '  if (uAsciiActive > 0.5) {',
    '    vec3 ac = vec3((uAsciiCenter.x - 0.5) * uAspect, uAsciiCenter.y, uAsciiCenter.z);',
    '    float ar = uAsciiCenter.w;',
    '    vec2 roxy = vec2((vUv.x - 0.5) * uAspect, vUv.y);',
    '    float dxy = length(roxy - ac.xy);',
    '    if (dxy < ar) {',
    '      float zoff = sqrt(ar * ar - dxy * dxy);',
    '      vec3 ap = vec3(roxy, ac.z - zoff);',           // front surface point
    '      vec3 an = normalize(vec3(ap.xy - ac.xy, -zoff));',
    '      vec3 ld = normalize(vec3(0.4, 0.7, -0.6));',
    '      float adiff = clamp(dot(an, ld), 0.0, 1.0);',
    '      float aspec = pow(clamp(dot(reflect(-ld, an), -rd), 0.0, 1.0), 16.0);',
    '      float bright = clamp(0.18 + 0.82 * adiff + 0.3 * aspec, 0.0, 1.0);',
    '      vec2 cellUv = fract((vUv * uResolution) / uAsciiCell);',
    '      float ci = floor(bright * (uAsciiCount - 1.0));',  // brightness -> char (readable)
    '      vec2 aUv = vec2((ci + cellUv.x) / uAsciiCount, cellUv.y);',
    '      float ink = texture2D(uAsciiTex, aUv).r;',
    '      vec3 waxLit = waxColor(clamp(ap.y, 0.0, 1.0)) * (0.5 + 0.85 * adiff)',
    '                  + vec3(1.0, 0.9, 0.7) * aspec * 0.3;',
    '      col = waxLit * (0.5 + 0.6 * ink);',            // ink = brighter wax, gaps = dimmer wax
    '    }',
    '  }',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  return { MAX_BLOBS: MAX_BLOBS, vert: VERT, frag: FRAG };
});
