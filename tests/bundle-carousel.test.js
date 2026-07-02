import { describe, it, expect } from 'vitest';
import C from '../assets/japanjunky-bundle-carousel.js';

describe('SLOTS table', () => {
  it('has 5 symmetric slots, center biggest', () => {
    expect(Object.keys(C.SLOTS).sort()).toEqual(['-1', '-2', '0', '1', '2']);
    expect(C.SLOTS['0'].scale).toBe(1.15);
    expect(C.SLOTS['1'].scale).toBe(C.SLOTS['-1'].scale);
    expect(C.SLOTS['2'].scale).toBe(C.SLOTS['-2'].scale);
    // center smaller offset y=0; outer slots mirror vertically
    expect(C.SLOTS['0'].y).toBe(0);
    expect(C.SLOTS['1'].y).toBe(-C.SLOTS['-1'].y);
    // crescent opens right: outer slots further right than center
    expect(C.SLOTS['2'].x).toBeGreaterThan(C.SLOTS['0'].x);
  });
});

describe('normalizeOffset (len=5)', () => {
  it('is 0 at the center index', () => {
    expect(C.normalizeOffset(2, 2, 5)).toBe(0);
  });
  it('wraps to the nearest signed offset', () => {
    expect(C.normalizeOffset(3, 2, 5)).toBe(1);
    expect(C.normalizeOffset(1, 2, 5)).toBe(-1);
    expect(C.normalizeOffset(4, 2, 5)).toBe(2);
    expect(C.normalizeOffset(0, 2, 5)).toBe(-2);
    // wrap-around: index 0 with center 4 → +1 (not -4)
    expect(C.normalizeOffset(0, 4, 5)).toBe(1);
    expect(C.normalizeOffset(4, 0, 5)).toBe(-1);
  });
});

describe('slotForIndex', () => {
  it('returns the center slot for the centered index', () => {
    expect(C.slotForIndex(2, 2, 5)).toBe(C.SLOTS['0']);
  });
  it('maps a wrapped index to its slot', () => {
    expect(C.slotForIndex(0, 4, 5)).toBe(C.SLOTS['1']);
  });
});
