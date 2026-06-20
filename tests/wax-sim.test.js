import { describe, it, expect } from 'vitest';
import Sim from '../assets/japanjunky-wax-sim.js';

function env(over) {
  return Object.assign({}, Sim.DEFAULTS, over || {});
}

describe('createState', () => {
  it('is deterministic for a seed and respects count/MAX_BLOBS', () => {
    var a = Sim.createState({ seed: 7, count: 6 });
    var b = Sim.createState({ seed: 7, count: 6 });
    expect(a.blobs.length).toBe(6);
    expect(JSON.stringify(a.blobs)).toBe(JSON.stringify(b.blobs));
    var big = Sim.createState({ seed: 1, count: 99 });
    expect(big.blobs.length).toBe(Sim.MAX_BLOBS);
  });
});

describe('stepBlob — buoyancy', () => {
  it('a hot blob accelerates upward (vy increases)', () => {
    var e = env();
    var hot = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 5, phase: 0 };
    var out = Sim.stepBlob(hot, 0.1, e, 0);
    expect(out.vy).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0.5);
  });

  it('a cold blob sinks (vy goes negative)', () => {
    var e = env();
    var cold = { x: 0.5, y: 0.8, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 0, phase: 0 };
    var out = Sim.stepBlob(cold, 0.1, e, 0);
    expect(out.vy).toBeLessThan(0);
  });
});

describe('stepBlob — heat band', () => {
  it('gains temperature near the floor, loses it up high', () => {
    var e = env();
    var low = Sim.stepBlob({ x: 0.5, y: 0.05, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 0, phase: 0 }, 0.2, e, 0);
    expect(low.temp).toBeGreaterThan(0);
    var high = Sim.stepBlob({ x: 0.5, y: 0.95, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 }, 0.2, e, 0);
    expect(high.temp).toBeLessThan(1);
  });
});

describe('stepBlob — bounds and purity', () => {
  it('clamps below the floor and reflects vy', () => {
    var e = env({ buoyancy: 0, gravity: 0 });
    var out = Sim.stepBlob({ x: 0.5, y: 0.0, z: 0, vx: 0, vy: -1, radius: 0.15, temp: 0, phase: 0 }, 0.1, e, 0);
    expect(out.y).toBeGreaterThanOrEqual(e.floor - 1e-9);
    expect(out.vy).toBeGreaterThan(0); // reflected upward
  });

  it('does not mutate the input blob', () => {
    var input = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var frozen = JSON.stringify(input);
    Sim.stepBlob(input, 0.1, env(), 0);
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe('step — stays in bounds over many frames', () => {
  it('never escapes the field', () => {
    var s = Sim.createState({ seed: 3, count: 8 });
    for (var i = 0; i < 600; i++) {
      Sim.step(s, 0.033);
      for (var j = 0; j < s.blobs.length; j++) {
        var b = s.blobs[j];
        expect(b.y).toBeGreaterThanOrEqual(s.opts.floor - 1e-6);
        expect(b.y).toBeLessThanOrEqual(s.opts.ceil + 1e-6);
        expect(b.x).toBeGreaterThanOrEqual(0.0);
        expect(b.x).toBeLessThanOrEqual(1.0);
      }
    }
  });
});

describe('applyTsuno — push and split', () => {
  function e() { return Object.assign({}, Sim.DEFAULTS); }

  it('is a no-op when inactive or out of range', () => {
    var b = { x: 0.5, y: 0.5, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    expect(Sim.applyTsuno(b, { active: false }, e())).toBe(b);
    var far = { active: true, x: 0.0, y: 0.0, vx: 1, vy: 1, radius: 0.1 };
    expect(Sim.applyTsuno(b, far, e())).toEqual(b);
  });

  it('pushes an in-range blob along Tsuno velocity and away from him', () => {
    var env = e();
    var b = { x: 0.55, y: 0.50, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var tsuno = { active: true, x: 0.50, y: 0.50, vx: 1.0, vy: 0.0, radius: 0.20 };
    var out = Sim.applyTsuno(b, tsuno, env);
    expect(out.vx).toBeGreaterThan(0); // along +x velocity AND away (+x, blob is right of Tsuno)
    expect(out).not.toBe(b);
  });

  it('does not mutate the input blob', () => {
    var b = { x: 0.55, y: 0.50, z: 0, vx: 0, vy: 0, radius: 0.15, temp: 1, phase: 0 };
    var frozen = JSON.stringify(b);
    Sim.applyTsuno(b, { active: true, x: 0.5, y: 0.5, vx: 1, vy: 0, radius: 0.2 }, e());
    expect(JSON.stringify(b)).toBe(frozen);
  });
});

describe('step — applies Tsuno when provided', () => {
  it('moves a blob out of Tsuno path over frames', () => {
    var s = Sim.createState({ seed: 5, count: 1, gravity: 0, buoyancy: 0 });
    s.blobs[0].x = 0.52; s.blobs[0].y = 0.5; s.blobs[0].vx = 0; s.blobs[0].vy = 0;
    var tsuno = { active: true, x: 0.5, y: 0.5, vx: 2.0, vy: 0, radius: 0.2 };
    var startX = s.blobs[0].x;
    for (var i = 0; i < 10; i++) Sim.step(s, 0.033, tsuno);
    expect(s.blobs[0].x).toBeGreaterThan(startX);
  });
});
