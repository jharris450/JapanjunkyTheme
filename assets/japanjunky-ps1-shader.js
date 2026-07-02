/**
 * japanjunky-ps1-shader.js
 * Shared PS1 vertex-snapping shader (vert) + textured passthrough (frag).
 * UMD: window.JJ_PS1 as a classic <script>, module.exports under Vitest.
 * No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_PS1 = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var vert = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var frag = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  gl_FragColor = texColor;',
    '}'
  ].join('\n');

  return { vert: vert, frag: frag };
});
