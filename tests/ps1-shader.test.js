import { describe, it, expect } from 'vitest';
import PS1 from '../assets/japanjunky-ps1-shader.js';

describe('PS1 shader module', () => {
  it('exports vert and frag as strings', () => {
    expect(typeof PS1.vert).toBe('string');
    expect(typeof PS1.frag).toBe('string');
  });
  it('vert snaps to uResolution and passes vUv', () => {
    expect(PS1.vert).toContain('uniform float uResolution;');
    expect(PS1.vert).toContain('varying vec2 vUv;');
    expect(PS1.vert).toContain('floor(');
    expect(PS1.vert).toContain('gl_Position');
  });
  it('frag samples uTexture at vUv', () => {
    expect(PS1.frag).toContain('uniform sampler2D uTexture;');
    expect(PS1.frag).toContain('texture2D(uTexture, vUv)');
    expect(PS1.frag).toContain('gl_FragColor');
  });
});
