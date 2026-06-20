import { describe, it, expect } from 'vitest';
import Shader from '../assets/japanjunky-wax-shader.js';
import Sim from '../assets/japanjunky-wax-sim.js';

describe('wax-shader module', () => {
  it('matches the sim blob cap', () => {
    expect(Shader.MAX_BLOBS).toBe(Sim.MAX_BLOBS);
  });

  it('exposes vert and frag GLSL with the expected uniforms', () => {
    expect(typeof Shader.vert).toBe('string');
    expect(typeof Shader.frag).toBe('string');
    ['uTime', 'uAspect', 'uHeatGlow', 'uBlobCount', 'uBlobs[8]', 'uBlobTemp[8]', 'uTsuno', 'uTsunoActive',
     'uAsciiTex', 'uAsciiCount', 'uAsciiBlob', 'uAsciiCell', 'uResolution']
      .forEach(function (decl) {
        expect(Shader.frag).toContain(decl);
      });
    expect(Shader.frag).toContain('void main()');
    expect(Shader.vert).toContain('vUv');
  });
});
