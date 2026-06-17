import { describe, it, expect } from 'vitest';
import Physics from '../assets/japanjunky-player-physics.js';

// Standard opts fixture. bounds inset by body size already.
function opts(over) {
  return Object.assign({
    gravity: 2000,
    restitution: 0.5,
    friction: 4.0,
    restThreshold: 24,
    bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 }
  }, over || {});
}

describe('clamp', () => {
  it('clamps below, within, above', () => {
    expect(Physics.clamp(-5, 0, 10)).toBe(0);
    expect(Physics.clamp(5, 0, 10)).toBe(5);
    expect(Physics.clamp(15, 0, 10)).toBe(10);
  });
});

describe('step — gravity (free fall, no collision)', () => {
  it('increases downward velocity and position', () => {
    var b = Physics.step({ x: 50, y: 0, vx: 0, vy: 0 }, 0.1, opts());
    expect(b.vy).toBeCloseTo(200, 5); // 0 + 2000*0.1
    expect(b.y).toBeCloseTo(20, 5);   // 0 + 200*0.1
    expect(b.x).toBe(50);
    expect(b.vx).toBe(0);
  });
});

describe('step — floor bounce', () => {
  it('clamps to floor and reverses vy with energy loss', () => {
    var b = Physics.step({ x: 100, y: 199, vx: 0, vy: 100 }, 0.1, opts());
    expect(b.y).toBe(200);       // clamped to floor (maxY)
    expect(b.vy).toBeLessThan(0); // reversed (now upward)
    expect(Math.abs(b.vy)).toBeLessThan(300); // less than pre-bounce speed
    expect(b.vy).toBeCloseTo(-150, 5); // pre-bounce 100+2000*0.1=300; reversed*0.5
  });
});

describe('step — wall bounce', () => {
  it('reverses vx at the right wall', () => {
    var b = Physics.step({ x: 295, y: 50, vx: 200, vy: 0 }, 0.1, opts());
    expect(b.x).toBe(300);       // clamped to maxX
    expect(b.vx).toBeLessThan(0); // reversed
    expect(b.vx).toBeCloseTo(-100, 5); // 200 * 0.5
  });
  it('reverses vx at the left wall', () => {
    var b = Physics.step({ x: 5, y: 50, vx: -200, vy: 0 }, 0.1, opts());
    expect(b.x).toBe(0);          // clamped to minX
    expect(b.vx).toBeGreaterThan(0);
    expect(b.vx).toBeCloseTo(100, 5); // 200 * 0.5
  });
});

describe('step — never escapes bounds', () => {
  it('stays in bounds across many steps from a corner with high velocity', () => {
    var o = opts();
    var b = { x: 0, y: 0, vx: 900, vy: -300 };
    for (var i = 0; i < 800; i++) {
      b = Physics.step(b, 0.016, o);
      expect(b.x).toBeGreaterThanOrEqual(o.bounds.minX);
      expect(b.x).toBeLessThanOrEqual(o.bounds.maxX);
      expect(b.y).toBeGreaterThanOrEqual(o.bounds.minY);
      expect(b.y).toBeLessThanOrEqual(o.bounds.maxY);
    }
  });
});

describe('step — floor friction', () => {
  it('reduces horizontal speed while on the floor', () => {
    var b = Physics.step({ x: 100, y: 200, vx: 200, vy: 0 }, 0.016, opts());
    expect(Math.abs(b.vx)).toBeLessThan(200);
    expect(Math.abs(b.vx)).toBeGreaterThan(0);
  });
});

describe('step + isAtRest — settling', () => {
  it('snaps tiny floor motion to a dead stop and reports rest', () => {
    var o = opts();
    var b = Physics.step({ x: 100, y: 200, vx: 5, vy: 0 }, 0.016, o);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.y).toBe(200);
    expect(Physics.isAtRest(b, o)).toBe(true);
  });
  it('is not at rest while airborne', () => {
    var o = opts();
    expect(Physics.isAtRest({ x: 100, y: 50, vx: 0, vy: 0 }, o)).toBe(false);
  });
});

describe('step — purity', () => {
  it('does not mutate the input body', () => {
    var input = { x: 50, y: 0, vx: 10, vy: -20 };
    var frozen = JSON.stringify(input);
    Physics.step(input, 0.1, opts());
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe('step — ceiling bounce', () => {
  it('reverses vy at the ceiling', () => {
    var o = opts({ gravity: 0 }); // isolate the reflection from gravity
    var b = Physics.step({ x: 100, y: 10, vx: 0, vy: -200 }, 0.1, o);
    expect(b.y).toBe(0);                // clamped to ceiling (minY)
    expect(b.vy).toBeCloseTo(100, 5);  // -(-200) * 0.5
  });
});

describe('step — settles at low framerate (I1 regression)', () => {
  it('sleeps a grounded slow body even at ~20fps (dt=0.05)', () => {
    var o = opts({ gravity: 2600, restitution: 0.55 });
    var b = Physics.step({ x: 100, y: 200, vx: 3, vy: 0 }, 0.05, o);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(Physics.isAtRest(b, o)).toBe(true);
  });
});
