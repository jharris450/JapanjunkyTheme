import { describe, it, expect } from 'vitest';
import RB from '../assets/japanjunky-recordbox.js';

describe('recordbox DIMS', () => {
  it('encodes a 12:12:3 ratio', () => {
    expect(RB.DIMS.w).toBe(2.0);
    expect(RB.DIMS.h).toBe(2.0);
    expect(RB.DIMS.d).toBeCloseTo(0.5, 5);
    expect(RB.DIMS.d / RB.DIMS.w).toBeCloseTo(3 / 12, 5); // depth:width == 3:12
  });
});

describe('recordbox FACE_ORDER', () => {
  it('has six faces in BoxGeometry order [+X,-X,+Y,-Y,+Z,-Z]', () => {
    expect(RB.FACE_ORDER).toEqual(['sideRight', 'sideLeft', 'top', 'bottom', 'front', 'back']);
  });
  it('maps the vertical slotted sides to +X/-X', () => {
    expect(RB.FACE_ORDER[0]).toBe('sideRight');
    expect(RB.FACE_ORDER[1]).toBe('sideLeft');
  });
  it('maps +Z to the composited front lid and -Z to back', () => {
    expect(RB.FACE_ORDER[4]).toBe('front');
    expect(RB.FACE_ORDER[5]).toBe('back');
  });
});

describe('frontCompositeLayout', () => {
  it('splits the canvas into equal left/right halves', () => {
    const L = RB.frontCompositeLayout(512);
    expect(L.left).toEqual({ x: 0, y: 0, w: 256, h: 512 });
    expect(L.right).toEqual({ x: 256, y: 0, w: 256, h: 512 });
  });
  it('centers a non-zero seam on the vertical midline', () => {
    const L = RB.frontCompositeLayout(512);
    expect(L.seam.w).toBeGreaterThan(0);
    expect(L.seam.x + L.seam.w / 2).toBeCloseTo(256, 5);
    expect(L.seam.h).toBe(512);
  });
});
