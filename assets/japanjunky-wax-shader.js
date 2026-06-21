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
    'uniform float uBlobStretch[' + N + '];', // per-blob vertical stretch (teardrop)
    'uniform float uHorizon;',           // horizon line (uv.y); sky above, water below
    'uniform sampler2D uSunTex;',        // cut-out rising sun (alpha = sun)
    'uniform float uSunActive;',         // 1 = draw the sun
    'uniform float uPortalRot;',         // portal spin speed (rot term negated in jjPortal)
    'uniform float uSunRot;',            // sun spin speed (CCW, opposite the portal)
    'uniform float uSunSize;',           // sun scale (larger = covers more of the page)
    'uniform float uRipple;',            // water ripple amplitude
    'uniform float uWaterDark;',         // water reflection darken factor
    'varying vec2 vUv;',
    '',
    // Lava-lamp shape constants (tune here, no rebuild of uniforms needed).
    'const float POOL_TOP = 0.15;',  // y of the reservoir surface (dome top)
    'const float POOL_R   = 4.0;',   // big radius -> gentle wide dome (exact sphere SDF)
    'const float ELONG    = 0.4;',   // mild column length (keep blobs round -> liquid, not pill)
    'const float BLEND    = 0.30;',  // metaball smooth-union (higher = thinner, longer necks)
    'const float SUBMERGE = 0.5;',   // wax opacity below the horizon (blends with the reflective pool)
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float smax(float a, float b, float k) { return -smin(-a, -b, k); }',
    '',
    '// A blob as a vertical capsule — an EXACT SDF, so no raymarch artifacts at',
    '// high elongation (a stretched ellipsoid streaks/spikes). sy>1 extends the',
    '// segment into a rounded column; sy=1 collapses it to a sphere.',
    'float blobSD(vec3 p, vec4 b, float sy) {',
    '  vec3 c = vec3((b.x - 0.5) * uAspect, b.y, b.z);',
    '  float sx = inversesqrt(max(sy, 1e-4));',
    '  float rr = b.w * sx;',
    '  float h = b.w * (sy - 1.0) * ELONG;',
    '  vec3 q = p - c;',
    '  q.y -= clamp(q.y, -h, h);',
    '  return length(q) - rr;',
    '}',
    '',
    '// Wide gentle reservoir dome from a big sphere — exact SDF, no eccentricity',
    '// artifacts (a very flat ellipsoid streaks horizontally off the screen).',
    'float poolSD(vec3 p) {',
    '  return length(p - vec3(0.0, POOL_TOP - POOL_R, 0.0)) - POOL_R;',
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
    'vec3 calcNormal(vec3 p) {',          // 4-tap tetrahedron (cheaper than 6-tap)
    '  vec2 k = vec2(1.0, -1.0);',
    '  float h = 0.002;',
    '  return normalize(',
    '    k.xyy * map(p + k.xyy * h) +',
    '    k.yyx * map(p + k.yyx * h) +',
    '    k.yxy * map(p + k.yxy * h) +',
    '    k.xxx * map(p + k.xxx * h));',
    '}',
    '',
    'vec3 waxColor(float h) {',              // h = height 0 (hot) .. 1 (cool)
    '  vec3 gold   = vec3(0.95, 0.75, 0.30);',
    '  vec3 orange = vec3(0.85, 0.35, 0.05);',
    '  vec3 red    = vec3(0.40, 0.05, 0.02);',
    '  return (h < 0.5) ? mix(gold, orange, h / 0.5) : mix(orange, red, (h - 0.5) / 0.5);',
    '}',
    '',
    '// ── Sky: portal vortex (recovered tunnel, ported to 2D polar) ──',
    'vec3 jjPortal(vec2 uv) {',
    '  vec2 d = uv - vec2(0.5, uHorizon); d.x *= uAspect;',
    '  float angle = atan(d.y, d.x) / 6.2832 + 0.5;',
    '  float depth = clamp(length(d) / 1.1, 0.0, 1.0);',
    '  float a = angle * 6.2832;',
    '  float rot = -uTime * uPortalRot;',
    '  float tightness = 3.0 + depth * 5.0;',
    '  float s1 = sin(a*2.0 + depth*tightness*6.2832 - rot)*0.5+0.5;',
    '  float s2 = sin(a*3.0 - depth*(tightness-1.0)*4.5 + rot*0.6)*0.5+0.5;',
    '  float s3 = sin(a*5.0 + depth*tightness*8.0 - rot*1.4)*0.5+0.5;',
    '  float pattern = s1*0.5 + s2*0.3 + s3*0.2;',
    '  vec3 w1=vec3(0.4,0.05,0.02), w2=vec3(0.85,0.35,0.05), w3=vec3(0.95,0.75,0.3);',
    '  vec3 warm=mix(w1,w2,smoothstep(0.0,0.5,pattern)); warm=mix(warm,w3,smoothstep(0.5,1.0,pattern));',
    '  vec3 color = warm;',                 // warm/orange only — no purple at the rim
    '  float falloff = smoothstep(0.0,0.1,depth)*(1.0 - smoothstep(0.5,1.0,depth));',
    '  color *= 0.45 + 0.55*falloff;',
    '  float glow = smoothstep(0.7,1.0,depth);',
    '  color += vec3(0.95,0.75,0.5)*glow*0.3;',
    '  return color;',
    '}',
    '',
    'vec4 jjSun(vec2 uv) {',
    '  if (uSunActive < 0.5) return vec4(0.0);',
    '  vec2 d = uv - vec2(0.5, uHorizon); d.x *= uAspect;',
    '  float ang = uTime * uSunRot;',
    '  float ca = cos(ang), sa = sin(ang);',
    '  vec2 r = vec2(d.x*ca - d.y*sa, d.x*sa + d.y*ca);',
    '  vec2 suv = r / uSunSize + 0.5;',
    '  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return vec4(0.0);',
    '  float alpha = texture2D(uSunTex, vec2(suv.x, 1.0 - suv.y)).a;',
    '  return vec4(vec3(1.0, 0.667, 0.0), alpha);',   // amber phosphor #ffaa00
    '}',
    '',
    'vec3 jjSky(vec2 uv) {',
    '  vec3 col = jjPortal(uv) * 0.72;',   // dim the portal so the bright amber sun stands out
    '  vec4 s = jjSun(uv);',
    '  return mix(col, s.rgb, s.a);',
    '}',
    '',
    '// Sky above the horizon; below it, the sky mirrored about the horizon and',
    '// rippled (the reflective water), warm-darkened, plus a horizon glow line.',
    'vec3 jjSkyWater(vec2 uv) {',
    '  vec3 col;',
    '  if (uv.y >= uHorizon) {',
    '    col = jjSky(uv);',
    '  } else {',
    '    float below = (uHorizon - uv.y) / uHorizon;',
    '    vec2 ref = vec2(uv.x, 2.0*uHorizon - uv.y);',
    '    ref.x += sin(uv.y*60.0 - uTime*1.5) * uRipple * below;',
    '    ref.y += sin(uv.x*40.0 - uTime*1.2) * uRipple * 0.3 * below;',
    '    col = jjSky(ref) * uWaterDark;',
    '  }',
    '  float dh = (uv.y - uHorizon) * 40.0;',
    '  float hg = exp(-dh * dh);',
    '  col += vec3(0.95,0.6,0.2) * hg * 0.4;',
    '  return col;',
    '}',
    '',
    'void main() {',
    '  vec3 ro = vec3((vUv.x - 0.5) * uAspect, vUv.y, -1.5);',
    '  vec3 rd = vec3(0.0, 0.0, 1.0);',
    '  float t = 0.0;',
    '  float hit = -1.0;',
    '  for (int s = 0; s < 40; s++) {',          // exact SDFs converge fast -> fewer steps
    '    vec3 p = ro + rd * t;',
    '    float d = map(p);',
    '    if (d < 0.0025) { hit = t; break; }',
    '    t += max(d, 0.012);',
    '    if (t > 2.5) break;',                    // wax sits within ~t=2.2; bail early
    '  }',
    '',
    '  vec3 bg = jjSkyWater(vUv);',   // sky + reflective water behind the wax
    '  vec3 col = bg;',
    '  if (hit > 0.0) {',
    '    vec3 p = ro + rd * hit;',
    '    vec3 n = calcNormal(p);',
    '    vec3 ld = normalize(vec3(0.4, 0.7, -0.6));',
    '    float diff = clamp(dot(n, ld), 0.0, 1.0);',
    '    float spec = pow(clamp(dot(reflect(-ld, n), -rd), 0.0, 1.0), 24.0);',
    '    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.0);',
    '    vec3 base = waxColor(clamp(p.y, 0.0, 1.0));',
    '    vec3 wax = base * (0.35 + 0.65 * diff) + vec3(1.0, 0.9, 0.7) * spec * 0.5;',
    '    wax += base * fres * 0.4;',
    '    // Below the horizon the wax is submerged — blend it with the reflective',
    '    // pool so the bottom wax reservoir reads as one pool with the water.',
    '    float waxAlpha = mix(SUBMERGE, 1.0, smoothstep(uHorizon - 0.06, uHorizon + 0.04, p.y));',
    '    col = mix(bg, wax, waxAlpha);',
    '  }',
    '',
    '  float glow = (1.0 - smoothstep(0.0, 0.35, vUv.y)) * uHeatGlow;',
    '  col += vec3(0.95, 0.5, 0.12) * glow * (hit > 0.0 ? 0.25 : 0.0);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  return { MAX_BLOBS: MAX_BLOBS, vert: VERT, frag: FRAG };
});
