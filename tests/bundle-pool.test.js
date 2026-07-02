import { describe, it, expect } from 'vitest';
import Pool from '../assets/japanjunky-bundle-pool.js';

function seqRng(values) {
  var i = 0;
  return function () { return values[i++ % values.length]; };
}

var sample = [
  { id: 1, format: 'record', available: true },
  { id: 1, format: 'record', available: true }, // dup product id (2nd variant)
  { id: 2, format: 'record', available: true },
  { id: 3, format: 'cd', available: true },      // wrong format
  { id: 4, format: 'record', available: false }, // unavailable
  { id: 5, format: 'record', available: true },
  { id: 6, format: 'record', available: true },
  { id: 99, format: 'record', available: true }  // the bundle itself
];

describe('pickRecords', () => {
  it('returns n distinct-by-id available records, excluding the bundle', () => {
    var out = Pool.pickRecords(sample, 3, 99, seqRng([0]));
    expect(out.length).toBe(3);
    var ids = out.map(function (r) { return r.id; });
    expect(new Set(ids).size).toBe(3);          // distinct
    expect(ids).not.toContain(99);              // excluded bundle
    expect(ids).not.toContain(3);               // no CDs
    expect(ids).not.toContain(4);               // no unavailable
  });
  it('caps at the number of eligible products when fewer than n', () => {
    var few = [
      { id: 1, format: 'record', available: true },
      { id: 2, format: 'record', available: true }
    ];
    expect(Pool.pickRecords(few, 5, 99).length).toBe(2);
  });
  it('returns empty array when nothing is eligible', () => {
    expect(Pool.pickRecords([{ id: 3, format: 'cd', available: true }], 5, 99)).toEqual([]);
    expect(Pool.pickRecords([], 5, 99)).toEqual([]);
  });
  it('is deterministic given a seeded rng', () => {
    var a = Pool.pickRecords(sample, 3, 99, seqRng([0.1, 0.9, 0.3, 0.7]));
    var b = Pool.pickRecords(sample, 3, 99, seqRng([0.1, 0.9, 0.3, 0.7]));
    expect(a.map(function (r) { return r.id; })).toEqual(b.map(function (r) { return r.id; }));
  });
});
