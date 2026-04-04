/**
 * JapanJunky Bioluminescent ASCII Background
 *
 * Reactive particle system with 2D fluid field, neuron-like activation
 * cascades, and CP437 ASCII rendering via WebGL2 GPGPU pipeline.
 *
 * Pipeline:
 *   Stage 1: Physics (render-to-texture GPGPU — fluid + particles)
 *   Stage 2: Particle render (instanced quads → offscreen FBO)
 *   Stage 3: ASCII conversion (CP437 atlas + phosphor palette)
 *   Stage 4: Bloom post-process
 *
 * Config: window.JJ_BIOLUM_CONFIG (optional overrides)
 */
(function () {
  'use strict';

  // ─── Default Configuration ───────────────────────────────────
  var defaults = {
    particleCount: 10000,
    particleSize: 14.0,
    activationScale: 1.8,
    energyAccumulation: 2.5,
    energyDecay: 0.25,
    activationThreshold: 0.5,
    activationDuration: 2.5,
    refractoryPeriod: 0.4,
    fluidResX: 128,
    fluidResY: 64,
    fluidDissipation: 0.35,
    cursorStrength: 4.0,
    cursorRadius: 0.15,
    carouselBurstStrength: 3.0,
    carouselBurstDuration: 2.0,
    bubbleCount: 14,
    bubbleSpawnInterval: 1.2,
    bubbleRiseSpeed: 0.03,
    bubbleWakeStrength: 1.8,
    lavaStrength: 0.8,
    noiseStrength: 0.4,
    displayScale: 2,
    glyphRamp: [32, 250, 7, 254, 219],
    ditherStrength: 0.6,
    bloomStrength: 1.4,
    bloomRadius: 0.5,
    bloomThreshold: 0.06,
    mobileEnabled: false
  };

  function mergeConfig() {
    var overrides = window.JJ_BIOLUM_CONFIG || {};
    var cfg = {};
    for (var key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        cfg[key] = overrides.hasOwnProperty(key) ? overrides[key] : defaults[key];
      }
    }
    return cfg;
  }

  // ─── WebGL2 Utilities ────────────────────────────────────────

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    var vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    var frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function createFloatTexture(gl, width, height, data) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0,
                  gl.RGBA, gl.FLOAT, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createFBO(gl, texture) {
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, texture, 0);
    return fbo;
  }

  function createDoubleFBO(gl, width, height) {
    var texA = createFloatTexture(gl, width, height, null);
    var texB = createFloatTexture(gl, width, height, null);
    var fboA = createFBO(gl, texA);
    var fboB = createFBO(gl, texB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      texA: texA, texB: texB,
      fboA: fboA, fboB: fboB,
      read: texA, write: texB,
      readFBO: fboA, writeFBO: fboB,
      swap: function () {
        var tmpTex = this.read;
        var tmpFBO = this.readFBO;
        this.read = this.write;
        this.readFBO = this.writeFBO;
        this.write = tmpTex;
        this.writeFBO = tmpFBO;
      }
    };
  }

  var QUAD_VERTS = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);

  function createQuadVAO(gl) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  function drawQuad(gl, vao) {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ─── GLSL Shaders ───────────────────────────────────────────

  var PASSTHROUGH_VERT = '#version 300 es\nlayout(location=0) in vec2 a_pos;out vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}';

  // --- Particle Init ---
  var PARTICLE_INIT_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'layout(location=0) out vec4 o_position;',
    'layout(location=1) out vec4 o_velocity;',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    'void main() {',
    '  float jx = (hash(v_uv * 1.0) - 0.5) * 0.01;',
    '  float jy = (hash(v_uv * 2.0) - 0.5) * 0.01;',
    '  vec2 pos = v_uv + vec2(jx, jy);',
    '  float phosphorId = floor(hash(floor(v_uv * 8.0)) * 6.0);',
    '  o_position = vec4(pos, 0.0, phosphorId);',
    '  o_velocity = vec4(0.0);',
    '}'
  ].join('\n');

  // --- Particle Update ---
  var PARTICLE_UPDATE_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_positionTex;',
    'uniform sampler2D u_velocityTex;',
    'uniform sampler2D u_fluidTex;',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform float u_energyAccum;',
    'uniform float u_energyDecay;',
    'uniform float u_activationThreshold;',
    'uniform float u_activationDuration;',
    'uniform float u_refractoryPeriod;',
    'uniform float u_noiseStrength;',
    'uniform vec2 u_cursorPos;',
    'uniform vec2 u_cursorVel;',
    'uniform float u_cursorStrength;',
    'uniform float u_cursorRadius;',
    'layout(location=0) out vec4 o_position;',
    'layout(location=1) out vec4 o_velocity;',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    'void main() {',
    '  vec4 posData = texture(u_positionTex, v_uv);',
    '  vec4 velData = texture(u_velocityTex, v_uv);',
    '  vec2 pos = posData.xy;',
    '  float phosphorId = posData.a;',
    '  vec2 vel = velData.xy;',
    '  float energy = velData.z;',
    '  float activation = velData.w;',
    '  float sparkle = mix(0.5, 1.5, hash(v_uv * 17.0));',
    '  float refractory = 0.0;',
    '  if (energy < 0.0) {',
    '    refractory = -energy;',
    '    energy = 0.0;',
    '  }',
    '  vec4 fluidSample = texture(u_fluidTex, pos);',
    '  vec2 fluidVel = fluidSample.xy;',
    '  float fluidSpeed = length(fluidVel);',
    '  refractory = max(0.0, refractory - u_dt);',
    '  energy += fluidSpeed * u_energyAccum * sparkle * u_dt;',
    '  energy -= u_energyDecay * u_dt * (1.0 - min(fluidSpeed, 1.0));',
    '  energy = max(0.0, energy);',
    '  float threshold = u_activationThreshold / max(sparkle, 0.01);',
    '  if (refractory <= 0.0 && energy > threshold) {',
    '    activation = 1.0;',
    '    energy = 0.0;',
    '    refractory = u_refractoryPeriod;',
    '  }',
    '  activation = max(0.0, activation - u_dt / max(u_activationDuration, 0.01));',
    '  vec2 accel = (fluidVel - vel) * 2.0;',
    '  vec2 toCursor = u_cursorPos - pos;',
    '  float cursorDist = length(toCursor);',
    '  float cursorInfluence = exp(-cursorDist * cursorDist / (u_cursorRadius * u_cursorRadius));',
    '  accel += u_cursorVel * u_cursorStrength * cursorInfluence;',
    '  float phase1 = hash(v_uv * 12.98) * 6.283;',
    '  float phase2 = hash(v_uv * 78.23) * 6.283;',
    '  vec2 noise = vec2(sin(u_time * 0.6 + phase1), cos(u_time * 0.8 + phase2));',
    '  accel += noise * u_noiseStrength;',
    '  vel += accel * u_dt;',
    '  vel *= (1.0 / (1.0 + 1.0 * u_dt));',
    '  pos += vel * u_dt;',
    '  pos = fract(pos);',
    '  float packedEnergy = refractory > 0.0 ? -refractory : energy;',
    '  o_position = vec4(pos, 0.0, phosphorId);',
    '  o_velocity = vec4(vel, packedEnergy, activation);',
    '}'
  ].join('\n');

  // --- Fluid Injection ---
  var FLUID_INJECT_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'out vec4 o_color;',
    'uniform vec2 u_cursorPos;',
    'uniform vec2 u_cursorVel;',
    'uniform float u_cursorStrength;',
    'uniform float u_cursorRadius;',
    'uniform vec4 u_burstPosAge[4];',
    'uniform vec2 u_burstDir[4];',
    'uniform float u_burstDuration;',
    'uniform int u_burstCount;',
    'uniform vec3 u_bubbles[12];',
    'uniform int u_bubbleCount;',
    'uniform float u_bubbleWakeStrength;',
    'uniform float u_time;',
    'uniform float u_lavaStrength;',
    'void main() {',
    '  vec2 force = vec2(0.0);',
    '  vec2 toCursor = v_uv - u_cursorPos;',
    '  float cursorDist2 = dot(toCursor, toCursor);',
    '  float cursorR2 = u_cursorRadius * u_cursorRadius;',
    '  force += u_cursorVel * u_cursorStrength * exp(-cursorDist2 / cursorR2);',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= u_burstCount) break;',
    '    vec2 bPos = u_burstPosAge[i].xy;',
    '    float bAge = u_burstPosAge[i].z;',
    '    float bStr = u_burstPosAge[i].w;',
    '    vec2 bDir = u_burstDir[i];',
    '    float fade = max(0.0, 1.0 - bAge / u_burstDuration);',
    '    vec2 toBurst = v_uv - bPos;',
    '    float bDist2 = dot(toBurst, toBurst);',
    '    force += bDir * bStr * fade * exp(-bDist2 / 0.01);',
    '  }',
    '  for (int i = 0; i < 12; i++) {',
    '    if (i >= u_bubbleCount) break;',
    '    vec2 bPos = u_bubbles[i].xy;',
    '    float bStr = u_bubbles[i].z;',
    '    vec2 toBubble = v_uv - bPos;',
    '    float bDist2 = dot(toBubble, toBubble);',
    '    float radius2 = 0.004;',
    '    float influence = exp(-bDist2 / radius2);',
    '    vec2 upForce = vec2(0.0, 1.0) * bStr * u_bubbleWakeStrength;',
    '    float belowFactor = smoothstep(0.0, 0.05, v_uv.y - bPos.y);',
    '    force += upForce * influence * (1.0 - belowFactor * 0.5);',
    '  }',
    '  float t = u_time * 0.12;',
    '  float lx = sin(v_uv.y * 3.0 + t) * cos(v_uv.x * 2.1 + t * 0.7);',
    '  float ly = cos(v_uv.x * 2.5 + t * 0.9) * sin(v_uv.y * 1.8 + t * 1.1) + 0.25;',
    '  force += vec2(lx, ly) * u_lavaStrength;',
    '  o_color = vec4(force, 0.0, 1.0);',
    '}'
  ].join('\n');

  // --- Fluid Step ---
  var FLUID_STEP_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_velocityTex;',
    'uniform sampler2D u_injectionTex;',
    'uniform float u_dissipation;',
    'uniform float u_dt;',
    'out vec4 o_color;',
    'void main() {',
    '  vec2 prevVel = texture(u_velocityTex, v_uv).xy;',
    '  vec2 injection = texture(u_injectionTex, v_uv).xy;',
    '  vec2 newVel = prevVel + injection * u_dt;',
    '  newVel *= (1.0 - u_dissipation * u_dt);',
    '  o_color = vec4(newVel, 0.0, 1.0);',
    '}'
  ].join('\n');

  // --- Particle Render (instanced billboards) ---
  var PARTICLE_RENDER_VERT = [
    '#version 300 es',
    'layout(location=0) in vec2 a_quad;',
    'layout(location=1) in float a_instanceId;',
    'uniform sampler2D u_positionTex;',
    'uniform sampler2D u_velocityTex;',
    'uniform float u_texSize;',
    'uniform float u_particleSize;',
    'uniform float u_activationScale;',
    'uniform vec2 u_resolution;',
    'out float v_activation;',
    'out float v_phosphorId;',
    'void main() {',
    '  float idx = a_instanceId;',
    '  float row = floor(idx / u_texSize);',
    '  float col = idx - row * u_texSize;',
    '  vec2 texUv = (vec2(col, row) + 0.5) / u_texSize;',
    '  vec4 posData = texture(u_positionTex, texUv);',
    '  vec4 velData = texture(u_velocityTex, texUv);',
    '  vec2 pos = posData.xy;',
    '  v_phosphorId = posData.a;',
    '  v_activation = max(0.0, velData.w);',
    '  float size = u_particleSize * mix(1.0, u_activationScale, v_activation);',
    '  vec2 pixelSize = size / u_resolution;',
    '  vec2 screenPos = pos * 2.0 - 1.0;',
    '  gl_Position = vec4(screenPos + a_quad * pixelSize, 0.0, 1.0);',
    '}'
  ].join('\n');

  var PARTICLE_RENDER_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in float v_activation;',
    'in float v_phosphorId;',
    'out vec4 o_color;',
    'const vec3 PHOSPHORS[6] = vec3[6](',
    '  vec3(0.910, 0.192, 0.227),',
    '  vec3(0.961, 0.843, 0.259),',
    '  vec3(0.290, 0.643, 0.878),',
    '  vec3(0.200, 1.000, 0.200),',
    '  vec3(1.000, 0.667, 0.000),',
    '  vec3(0.878, 0.251, 0.878)',
    ');',
    'void main() {',
    '  int pid = clamp(int(v_phosphorId), 0, 5);',
    '  vec3 color = PHOSPHORS[pid];',
    '  float alpha = mix(0.35, 1.0, v_activation);',
    '  o_color = vec4(color * alpha, alpha);',
    '}'
  ].join('\n');

  // --- ASCII Conversion ---
  var ASCII_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_sceneTex;',
    'uniform sampler2D u_fontAtlas;',
    'uniform vec2 u_resolution;',
    'uniform float u_displayScale;',
    'uniform float u_ditherStrength;',
    'uniform int u_glyphRamp[8];',
    'uniform int u_rampLength;',
    'const vec3 PALETTE[32] = vec3[32](',
    '  vec3(0,0,0), vec3(0.067,0.067,0.067), vec3(0.133,0.133,0.133),',
    '  vec3(0.267,0.267,0.267), vec3(0.400,0.400,0.400), vec3(0.533,0.533,0.533),',
    '  vec3(0.667,0.667,0.667), vec3(0.800,0.800,0.800), vec3(0.910,0.878,0.816),',
    '  vec3(0.961,0.961,0.941),',
    '  vec3(0.392,0.078,0.078), vec3(0.706,0.157,0.157), vec3(0.910,0.192,0.227),',
    '  vec3(0.471,0.353,0.0), vec3(0.784,0.627,0.078), vec3(0.961,0.843,0.259),',
    '  vec3(0.627,0.392,0.0), vec3(1.0,0.667,0.0),',
    '  vec3(0.039,0.235,0.353), vec3(0.290,0.643,0.878), vec3(0.0,0.898,0.898),',
    '  vec3(0.059,0.314,0.059), vec3(0.157,0.627,0.157), vec3(0.200,1.0,0.200),',
    '  vec3(0.353,0.078,0.353), vec3(0.878,0.251,0.878),',
    '  vec3(0.353,0.216,0.118), vec3(0.549,0.353,0.196),',
    '  vec3(0.706,0.510,0.314), vec3(0.824,0.686,0.510),',
    '  vec3(0.078,0.118,0.235), vec3(0.235,0.314,0.549)',
    ');',
    'const float BAYER[16] = float[16](',
    '  0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,',
    ' 12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,',
    '  3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,',
    ' 15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0',
    ');',
    'out vec4 o_color;',
    'vec3 nearestPaletteColor(vec3 c) {',
    '  float bestDist = 1e10;',
    '  vec3 best = vec3(0.0);',
    '  for (int i = 0; i < 32; i++) {',
    '    vec3 diff = c - PALETTE[i];',
    '    float d = dot(diff, diff);',
    '    if (d < bestDist) { bestDist = d; best = PALETTE[i]; }',
    '  }',
    '  return best;',
    '}',
    'void main() {',
    '  float tileW = 8.0 * u_displayScale;',
    '  float tileH = 16.0 * u_displayScale;',
    '  vec2 pixel = v_uv * u_resolution;',
    '  vec2 cell = floor(pixel / vec2(tileW, tileH));',
    '  vec2 cellCenter = (cell + 0.5) * vec2(tileW, tileH) / u_resolution;',
    '  vec3 sceneColor = texture(u_sceneTex, cellCenter).rgb;',
    '  float lum = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));',
    '  ivec2 cellI = ivec2(cell);',
    '  int bayerIdx = (cellI.y % 4) * 4 + (cellI.x % 4);',
    '  float dither = (BAYER[bayerIdx] - 0.5) * u_ditherStrength;',
    '  float ditheredLum = clamp(lum + dither, 0.0, 1.0);',
    '  int glyphIdx = int(ditheredLum * float(u_rampLength - 1) + 0.5);',
    '  glyphIdx = clamp(glyphIdx, 0, u_rampLength - 1);',
    '  int cp437Index = u_glyphRamp[glyphIdx];',
    '  float atlasCol = float(cp437Index % 16);',
    '  float atlasRow = float(cp437Index / 16);',
    '  vec2 subCellUv = fract(pixel / vec2(tileW, tileH));',
    '  vec2 atlasUv = (vec2(atlasCol, atlasRow) + subCellUv) / 16.0;',
    '  float glyphAlpha = texture(u_fontAtlas, atlasUv).a;',
    '  vec3 quantized = nearestPaletteColor(sceneColor);',
    '  o_color = vec4(quantized * glyphAlpha, 1.0);',
    '}'
  ].join('\n');

  // --- Bloom Threshold ---
  var BLOOM_THRESHOLD_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform float u_threshold;',
    'out vec4 o_color;',
    'void main() {',
    '  vec3 c = texture(u_tex, v_uv).rgb;',
    '  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  o_color = lum > u_threshold ? vec4(c, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  // --- Gaussian Blur (separable) ---
  var BLUR_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_direction;',
    'uniform float u_radius;',
    'out vec4 o_color;',
    'void main() {',
    '  vec3 result = vec3(0.0);',
    '  float weights[5] = float[5](0.227, 0.194, 0.122, 0.054, 0.016);',
    '  result += texture(u_tex, v_uv).rgb * weights[0];',
    '  for (int i = 1; i < 5; i++) {',
    '    vec2 off = u_direction * float(i) * u_radius;',
    '    result += texture(u_tex, v_uv + off).rgb * weights[i];',
    '    result += texture(u_tex, v_uv - off).rgb * weights[i];',
    '  }',
    '  o_color = vec4(result, 1.0);',
    '}'
  ].join('\n');

  // --- Bloom Composite ---
  var BLOOM_COMPOSITE_FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'uniform sampler2D u_sceneTex;',
    'uniform sampler2D u_bloomTex;',
    'uniform float u_bloomStrength;',
    'out vec4 o_color;',
    'void main() {',
    '  vec3 scene = texture(u_sceneTex, v_uv).rgb;',
    '  vec3 bloom = texture(u_bloomTex, v_uv).rgb;',
    '  o_color = vec4(scene + bloom * u_bloomStrength, 1.0);',
    '}'
  ].join('\n');

  // ─── Init ────────────────────────────────────────────────────

  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
      console.warn('Biolum: skipped — prefers-contrast:more');
      return;
    }

    var cfg = mergeConfig();

    if (!cfg.mobileEnabled && /Mobi|Android/i.test(navigator.userAgent)) {
      console.warn('Biolum: skipped — mobile device');
      return;
    }

    var canvas = document.getElementById('jj-biolum');
    if (!canvas) { console.warn('Biolum: skipped — #jj-biolum not found'); return; }

    var gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
    if (!gl) { console.warn('Biolum: skipped — WebGL2 not available'); return; }

    var floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) { console.warn('Biolum: skipped — EXT_color_buffer_float not available'); return; }

    var linearFloatExt = gl.getExtension('OES_texture_float_linear');
    if (!linearFloatExt) console.warn('Biolum: OES_texture_float_linear not available — using NEAREST');

    // Context loss detection & recovery
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      console.warn('Biolum: WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', function () {
      console.log('Biolum: WebGL context restored — reinitializing');
      init();
    });

    // Use NEAREST for float textures if LINEAR filtering isn't supported
    var FLOAT_FILTER = linearFloatExt ? gl.LINEAR : gl.NEAREST;

    console.log('Biolum: WebGL2 context OK, float filter=' +
      (linearFloatExt ? 'LINEAR' : 'NEAREST'));

    var reducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ─── Resize ────────────────────────────────────────────────
    function resize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    // ─── Shared Resources ──────────────────────────────────────
    var quadVAO = createQuadVAO(gl);

    // ─── Particle State ──────────────────────────────────────────
    var texSize = Math.ceil(Math.sqrt(cfg.particleCount));
    var particlePositions = createDoubleFBO(gl, texSize, texSize);
    var particleVelocities = createDoubleFBO(gl, texSize, texSize);

    var particleInitProg = createProgram(gl, PASSTHROUGH_VERT, PARTICLE_INIT_FRAG);
    if (!particleInitProg) console.error('Biolum: particleInitProg FAILED');

    // Initialize particle state via MRT
    (function initParticles() {
      gl.useProgram(particleInitProg);
      var initFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, initFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                              gl.TEXTURE_2D, particlePositions.read, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                              gl.TEXTURE_2D, particleVelocities.read, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, texSize, texSize);
      drawQuad(gl, quadVAO);
      gl.deleteFramebuffer(initFBO);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      resize();
    })();

    var particleUpdateProg = createProgram(gl, PASSTHROUGH_VERT, PARTICLE_UPDATE_FRAG);
    if (!particleUpdateProg) console.error('Biolum: particleUpdateProg FAILED');
    var particleUpdateFBO = gl.createFramebuffer();

    // ─── Fluid Field ─────────────────────────────────────────────
    var fluidField = createDoubleFBO(gl, cfg.fluidResX, cfg.fluidResY);
    [fluidField.texA, fluidField.texB].forEach(function (tex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
    });

    var injectionTex = createFloatTexture(gl, cfg.fluidResX, cfg.fluidResY, null);
    var injectionFBO = createFBO(gl, injectionTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var fluidInjectProg = createProgram(gl, PASSTHROUGH_VERT, FLUID_INJECT_FRAG);
    if (!fluidInjectProg) console.error('Biolum: fluidInjectProg FAILED');
    var fluidStepProg = createProgram(gl, PASSTHROUGH_VERT, FLUID_STEP_FRAG);
    if (!fluidStepProg) console.error('Biolum: fluidStepProg FAILED');

    // ─── Particle Render FBO ─────────────────────────────────────
    var sceneW = canvas.width;
    var sceneH = canvas.height;
    var sceneTex = createFloatTexture(gl, sceneW, sceneH, null);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
    var sceneFBO = createFBO(gl, sceneTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var particleRenderProg = createProgram(gl, PARTICLE_RENDER_VERT, PARTICLE_RENDER_FRAG);
    if (!particleRenderProg) console.error('Biolum: particleRenderProg FAILED');

    // Instance ID buffer + VAO for particle rendering
    var instanceIds = new Float32Array(texSize * texSize);
    for (var i = 0; i < instanceIds.length; i++) instanceIds[i] = i;

    var particleVAO = gl.createVertexArray();
    gl.bindVertexArray(particleVAO);
    var quadData = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var idBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instanceIds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    // ─── ASCII Shader ────────────────────────────────────────────
    var asciiProg = createProgram(gl, PASSTHROUGH_VERT, ASCII_FRAG);
    if (!asciiProg) console.error('Biolum: asciiProg FAILED');

    // ─── Font Atlas ──────────────────────────────────────────────
    var fontAtlasTex = gl.createTexture();
    var fontAtlasLoaded = false;
    var fontImg = new Image();
    fontImg.crossOrigin = 'anonymous';
    fontImg.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, fontAtlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fontImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fontAtlasLoaded = true;
      console.log('Biolum: font atlas loaded (' + fontImg.naturalWidth + 'x' + fontImg.naturalHeight + ')');
    };
    fontImg.onerror = function () {
      console.warn('Biolum: font atlas failed to load — running without ASCII conversion');
    };
    var scriptEl = document.querySelector('script[src*="japanjunky-biolum"]');
    var atlasSrc = scriptEl
      ? scriptEl.src.replace(/japanjunky-biolum\.js.*/, 'cp437-font-atlas.png')
      : 'cp437-font-atlas.png';
    console.log('Biolum: loading font atlas from', atlasSrc);
    fontImg.src = atlasSrc;

    // ─── Bloom Resources ─────────────────────────────────────────
    var asciiTex = createFloatTexture(gl, sceneW, sceneH, null);
    gl.bindTexture(gl.TEXTURE_2D, asciiTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
    var asciiFBO = createFBO(gl, asciiTex);

    var bloomW = Math.max(1, Math.floor(sceneW / 2));
    var bloomH = Math.max(1, Math.floor(sceneH / 2));
    var bloomTexA = createFloatTexture(gl, bloomW, bloomH, null);
    var bloomTexB = createFloatTexture(gl, bloomW, bloomH, null);
    [bloomTexA, bloomTexB].forEach(function (t) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
    });
    var bloomFBO_A = createFBO(gl, bloomTexA);
    var bloomFBO_B = createFBO(gl, bloomTexB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var bloomThresholdProg = createProgram(gl, PASSTHROUGH_VERT, BLOOM_THRESHOLD_FRAG);
    if (!bloomThresholdProg) console.error('Biolum: bloomThresholdProg FAILED');
    var blurProg = createProgram(gl, PASSTHROUGH_VERT, BLUR_FRAG);
    if (!blurProg) console.error('Biolum: blurProg FAILED');
    var bloomCompositeProg = createProgram(gl, PASSTHROUGH_VERT, BLOOM_COMPOSITE_FRAG);
    if (!bloomCompositeProg) console.error('Biolum: bloomCompositeProg FAILED');

    console.log('Biolum: all shaders compiled, init complete');

    // ─── Cursor State ──────────────────────────────────────────
    var cursorState = {
      pos: [0.5, 0.5],
      vel: [0, 0],
      prevPos: [0.5, 0.5]
    };

    document.addEventListener('mousemove', function (e) {
      cursorState.prevPos[0] = cursorState.pos[0];
      cursorState.prevPos[1] = cursorState.pos[1];
      cursorState.pos[0] = e.clientX / window.innerWidth;
      cursorState.pos[1] = 1.0 - (e.clientY / window.innerHeight);
    });

    // ─── Autonomous Bubbles ──────────────────────────────────────
    var bubbles = [];
    var bubbleTimer = 0;
    function updateBubbles(dt) {
      bubbleTimer += dt;
      if (bubbleTimer >= cfg.bubbleSpawnInterval && bubbles.length < cfg.bubbleCount) {
        bubbles.push({
          x: Math.random(),
          y: 0.0,
          speed: cfg.bubbleRiseSpeed * (0.8 + Math.random() * 0.4),
          drift: Math.random() * 6.283,
          strength: 0.8 + Math.random() * 0.4
        });
        bubbleTimer = 0;
      }
      for (var bi = bubbles.length - 1; bi >= 0; bi--) {
        var b = bubbles[bi];
        b.y += b.speed * dt;
        b.x += Math.sin(b.drift + b.y * 4.0) * 0.02 * dt;
        if (b.y > 1.0) bubbles.splice(bi, 1);
      }
    }

    // ─── Carousel Bursts ─────────────────────────────────────────
    var bursts = [];
    function addCarouselBurst(normalizedX, direction) {
      if (bursts.length >= 4) bursts.shift();
      bursts.push({
        x: normalizedX,
        y: 0.5,
        dirX: direction * 0.5,
        dirY: 0,
        age: 0,
        strength: cfg.carouselBurstStrength
      });
    }
    function updateBursts(dt) {
      for (var bi = bursts.length - 1; bi >= 0; bi--) {
        bursts[bi].age += dt;
        if (bursts[bi].age > cfg.carouselBurstDuration) {
          bursts.splice(bi, 1);
        }
      }
    }

    document.addEventListener('jj:ring-scroll', function (e) {
      var dir = (e.detail && e.detail.direction) || 1;
      addCarouselBurst(0.5, dir);
    });
    document.addEventListener('jj:product-selected', function () {
      addCarouselBurst(0.5, 0);
    });

    // ─── Update Functions ────────────────────────────────────────

    function updateParticles(dt, time, cursorPos, cursorVel) {
      gl.useProgram(particleUpdateProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, particlePositions.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_positionTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, particleVelocities.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_velocityTex'), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, fluidField.read);
      gl.uniform1i(gl.getUniformLocation(particleUpdateProg, 'u_fluidTex'), 2);

      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_dt'), dt);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_time'), time);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_energyAccum'), cfg.energyAccumulation);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_energyDecay'), cfg.energyDecay);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_activationThreshold'), cfg.activationThreshold);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_activationDuration'), cfg.activationDuration);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_refractoryPeriod'), cfg.refractoryPeriod);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_noiseStrength'), cfg.noiseStrength);
      gl.uniform2f(gl.getUniformLocation(particleUpdateProg, 'u_cursorPos'), cursorPos[0], cursorPos[1]);
      gl.uniform2f(gl.getUniformLocation(particleUpdateProg, 'u_cursorVel'), cursorVel[0], cursorVel[1]);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_cursorStrength'), cfg.cursorStrength);
      gl.uniform1f(gl.getUniformLocation(particleUpdateProg, 'u_cursorRadius'), cfg.cursorRadius);

      gl.bindFramebuffer(gl.FRAMEBUFFER, particleUpdateFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                              gl.TEXTURE_2D, particlePositions.write, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                              gl.TEXTURE_2D, particleVelocities.write, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, texSize, texSize);
      drawQuad(gl, quadVAO);

      particlePositions.swap();
      particleVelocities.swap();
    }

    function updateFluidInjection(cursorPos, cursorVel, time) {
      gl.useProgram(fluidInjectProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, injectionFBO);
      gl.viewport(0, 0, cfg.fluidResX, cfg.fluidResY);

      gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_cursorPos'), cursorPos[0], cursorPos[1]);
      gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_cursorVel'), cursorVel[0], cursorVel[1]);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_cursorStrength'), cfg.cursorStrength);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_cursorRadius'), cfg.cursorRadius);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_time'), time);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_lavaStrength'), cfg.lavaStrength);

      gl.uniform1i(gl.getUniformLocation(fluidInjectProg, 'u_burstCount'), bursts.length);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_burstDuration'), cfg.carouselBurstDuration);
      for (var bi = 0; bi < 4; bi++) {
        var b = bursts[bi] || { x: 0, y: 0, age: 99, strength: 0, dirX: 0, dirY: 0 };
        gl.uniform4f(gl.getUniformLocation(fluidInjectProg, 'u_burstPosAge[' + bi + ']'),
                     b.x, b.y, b.age, b.strength);
        gl.uniform2f(gl.getUniformLocation(fluidInjectProg, 'u_burstDir[' + bi + ']'),
                     b.dirX, b.dirY);
      }

      gl.uniform1i(gl.getUniformLocation(fluidInjectProg, 'u_bubbleCount'), bubbles.length);
      gl.uniform1f(gl.getUniformLocation(fluidInjectProg, 'u_bubbleWakeStrength'), cfg.bubbleWakeStrength);
      for (var bj = 0; bj < 12; bj++) {
        var bb = bubbles[bj] || { x: 0, y: 0, strength: 0 };
        gl.uniform3f(gl.getUniformLocation(fluidInjectProg, 'u_bubbles[' + bj + ']'),
                     bb.x, bb.y, bb.strength);
      }

      drawQuad(gl, quadVAO);
    }

    function stepFluid(dt) {
      gl.useProgram(fluidStepProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fluidField.writeFBO);
      gl.viewport(0, 0, cfg.fluidResX, cfg.fluidResY);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fluidField.read);
      gl.uniform1i(gl.getUniformLocation(fluidStepProg, 'u_velocityTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, injectionTex);
      gl.uniform1i(gl.getUniformLocation(fluidStepProg, 'u_injectionTex'), 1);

      gl.uniform1f(gl.getUniformLocation(fluidStepProg, 'u_dissipation'), cfg.fluidDissipation);
      gl.uniform1f(gl.getUniformLocation(fluidStepProg, 'u_dt'), dt);

      drawQuad(gl, quadVAO);
      fluidField.swap();
    }

    // ─── Render Functions ────────────────────────────────────────

    function renderParticles() {
      if (canvas.width !== sceneW || canvas.height !== sceneH) {
        sceneW = canvas.width;
        sceneH = canvas.height;
        gl.deleteTexture(sceneTex);
        gl.deleteFramebuffer(sceneFBO);
        sceneTex = createFloatTexture(gl, sceneW, sceneH, null);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
        sceneFBO = createFBO(gl, sceneTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.viewport(0, 0, sceneW, sceneH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      gl.useProgram(particleRenderProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, particlePositions.read);
      gl.uniform1i(gl.getUniformLocation(particleRenderProg, 'u_positionTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, particleVelocities.read);
      gl.uniform1i(gl.getUniformLocation(particleRenderProg, 'u_velocityTex'), 1);

      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_texSize'), texSize);
      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_particleSize'), cfg.particleSize);
      gl.uniform1f(gl.getUniformLocation(particleRenderProg, 'u_activationScale'), cfg.activationScale);
      gl.uniform2f(gl.getUniformLocation(particleRenderProg, 'u_resolution'), sceneW, sceneH);

      gl.bindVertexArray(particleVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, texSize * texSize);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
    }

    function renderASCII() {
      if (canvas.width !== sceneW || canvas.height !== sceneH) {
        gl.deleteTexture(asciiTex);
        gl.deleteFramebuffer(asciiFBO);
        asciiTex = createFloatTexture(gl, canvas.width, canvas.height, null);
        gl.bindTexture(gl.TEXTURE_2D, asciiTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
        asciiFBO = createFBO(gl, asciiTex);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, asciiFBO);
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(asciiProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_sceneTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fontAtlasTex);
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_fontAtlas'), 1);

      gl.uniform2f(gl.getUniformLocation(asciiProg, 'u_resolution'), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(asciiProg, 'u_displayScale'), cfg.displayScale);
      gl.uniform1f(gl.getUniformLocation(asciiProg, 'u_ditherStrength'), cfg.ditherStrength);
      gl.uniform1iv(gl.getUniformLocation(asciiProg, 'u_glyphRamp'), new Int32Array(cfg.glyphRamp));
      gl.uniform1i(gl.getUniformLocation(asciiProg, 'u_rampLength'), cfg.glyphRamp.length);

      drawQuad(gl, quadVAO);
    }

    function renderBloom() {
      var newBloomW = Math.max(1, Math.floor(canvas.width / 2));
      var newBloomH = Math.max(1, Math.floor(canvas.height / 2));
      if (newBloomW !== bloomW || newBloomH !== bloomH) {
        bloomW = newBloomW;
        bloomH = newBloomH;
        gl.deleteTexture(bloomTexA);
        gl.deleteTexture(bloomTexB);
        gl.deleteFramebuffer(bloomFBO_A);
        gl.deleteFramebuffer(bloomFBO_B);
        bloomTexA = createFloatTexture(gl, bloomW, bloomH, null);
        bloomTexB = createFloatTexture(gl, bloomW, bloomH, null);
        [bloomTexA, bloomTexB].forEach(function (t) {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FLOAT_FILTER);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FLOAT_FILTER);
        });
        bloomFBO_A = createFBO(gl, bloomTexA);
        bloomFBO_B = createFBO(gl, bloomTexB);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      // Pass 1: Threshold extract → bloom A
      gl.useProgram(bloomThresholdProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, asciiTex);
      gl.uniform1i(gl.getUniformLocation(bloomThresholdProg, 'u_tex'), 0);
      gl.uniform1f(gl.getUniformLocation(bloomThresholdProg, 'u_threshold'), cfg.bloomThreshold);
      drawQuad(gl, quadVAO);

      // Pass 2: Horizontal blur → bloom B
      gl.useProgram(blurProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_B);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexA);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'u_tex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), 1.0 / bloomW, 0);
      gl.uniform1f(gl.getUniformLocation(blurProg, 'u_radius'), cfg.bloomRadius);
      drawQuad(gl, quadVAO);

      // Pass 3: Vertical blur → bloom A
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexB);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), 0, 1.0 / bloomH);
      drawQuad(gl, quadVAO);

      // Pass 4: Composite → screen
      gl.useProgram(bloomCompositeProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, asciiTex);
      gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_sceneTex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexA);
      gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_bloomTex'), 1);
      gl.uniform1f(gl.getUniformLocation(bloomCompositeProg, 'u_bloomStrength'), cfg.bloomStrength);
      drawQuad(gl, quadVAO);
    }

    // ─── Animation Loop ────────────────────────────────────────
    var running = true;
    var startTime = performance.now();
    var lastTime = startTime;

    var frameCount = 0;

    function frame() {
      if (!running) return;
      if (gl.isContextLost()) { console.warn('Biolum: context lost in frame loop'); return; }

      var now = performance.now();
      var dt = Math.min((now - lastTime) / 1000.0, 0.05);
      lastTime = now;
      var time = (now - startTime) / 1000.0;

      // Cursor velocity
      if (dt > 0) {
        cursorState.vel[0] = (cursorState.pos[0] - cursorState.prevPos[0]) / dt;
        cursorState.vel[1] = (cursorState.pos[1] - cursorState.prevPos[1]) / dt;
      }
      var maxVel = 20.0;
      cursorState.vel[0] = Math.max(-maxVel, Math.min(maxVel, cursorState.vel[0]));
      cursorState.vel[1] = Math.max(-maxVel, Math.min(maxVel, cursorState.vel[1]));
      cursorState.prevPos[0] = cursorState.pos[0];
      cursorState.prevPos[1] = cursorState.pos[1];

      // CPU-side state
      updateBubbles(dt);
      updateBursts(dt);

      // Stage 1a: Fluid injection
      updateFluidInjection(cursorState.pos, cursorState.vel, time);

      // Stage 1b: Fluid step
      stepFluid(dt);

      // Stage 1c: Particle physics
      updateParticles(dt, time, cursorState.pos, cursorState.vel);

      // Stage 2: Particle render
      renderParticles();

      if (fontAtlasLoaded) {
        // Stage 3: ASCII conversion (to offscreen FBO)
        renderASCII();

        // Stage 4: Bloom → screen
        renderBloom();
      } else {
        // Fallback: blit particle scene directly to screen while atlas loads
        gl.useProgram(bloomCompositeProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_sceneTex'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(gl.getUniformLocation(bloomCompositeProg, 'u_bloomTex'), 1);
        gl.uniform1f(gl.getUniformLocation(bloomCompositeProg, 'u_bloomStrength'), 0.0);
        drawQuad(gl, quadVAO);
      }

      frameCount++;

      if (reducedMotion) {
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else {
        running = true;
        lastTime = performance.now();
        frame();
      }
    });

    frame();

    // Deferred init for splash handoff
    window.JJ_Biolum_Init = function () {
      if (!running) {
        running = true;
        lastTime = performance.now();
        frame();
      }
    };
  }

  // ─── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
