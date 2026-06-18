import { describe, it, expect } from 'vitest';
import M from '../assets/japanjunky-cassette-math.js';

describe('clamp', () => {
  it('clamps to [0,1] by default', () => {
    expect(M.clamp(-1)).toBe(0);
    expect(M.clamp(0.5)).toBe(0.5);
    expect(M.clamp(2)).toBe(1);
  });
  it('respects explicit lo and hi', () => {
    expect(M.clamp(5, 2, 10)).toBe(5);
    expect(M.clamp(1, 2, 10)).toBe(2);
    expect(M.clamp(15, 2, 10)).toBe(10);
  });
});

describe('easeInOut', () => {
  it('is 0 at 0 and 1 at 1', () => {
    expect(M.easeInOut(0)).toBe(0);
    expect(M.easeInOut(1)).toBe(1);
  });
  it('passes through 0.5 at the midpoint and is monotonic', () => {
    expect(M.easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(M.easeInOut(0.25)).toBeLessThan(M.easeInOut(0.75));
  });
  it('clamps out-of-range input', () => {
    expect(M.easeInOut(-1)).toBe(0);
    expect(M.easeInOut(2)).toBe(1);
  });
});

describe('lidAngle', () => {
  it('is 0 radians fully closed', () => {
    expect(M.lidAngle(0)).toBe(0);
  });
  it('is the open angle (~110deg) fully open', () => {
    expect(M.lidAngle(1)).toBeCloseTo((110 * Math.PI) / 180, 5);
  });
  it('midpoint maps to exactly half the open angle', () => {
    expect(M.lidAngle(0.5)).toBeCloseTo(((110 * Math.PI) / 180) * 0.5, 5);
  });
  it('clamps input', () => {
    expect(M.lidAngle(5)).toBeCloseTo((110 * Math.PI) / 180, 5);
    expect(M.lidAngle(-5)).toBe(0);
  });
  it('exports the open angle constant (110 deg)', () => {
    expect(M.OPEN_RAD).toBeCloseTo((110 * Math.PI) / 180, 5);
  });
});
