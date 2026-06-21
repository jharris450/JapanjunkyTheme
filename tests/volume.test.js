import { describe, it, expect } from 'vitest';
import V from '../assets/japanjunky-volume.js';

function fakeStore(initial) {
  var data = initial ? { 'jj-volume': initial } : {};
  return {
    data: data,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = v; }
  };
}

describe('pure helpers', () => {
  it('clamp01 bounds to [0,1] and handles junk', () => {
    expect(V.clamp01(-1)).toBe(0);
    expect(V.clamp01(0.5)).toBe(0.5);
    expect(V.clamp01(2)).toBe(1);
    expect(V.clamp01(NaN)).toBe(0);
  });
  it('effective is 0 when muted, else the clamped level', () => {
    expect(V.effective(0.5, false)).toBe(0.5);
    expect(V.effective(0.5, true)).toBe(0);
    expect(V.effective(2, false)).toBe(1);
  });
  it('parse tolerates bad/empty/missing input -> defaults (0.8, false)', () => {
    expect(V.parse('not json')).toEqual({ level: 0.8, muted: false });
    expect(V.parse('')).toEqual({ level: 0.8, muted: false });
    expect(V.parse(null)).toEqual({ level: 0.8, muted: false });
    expect(V.parse('{"level":0.3,"muted":true}')).toEqual({ level: 0.3, muted: true });
    expect(V.parse('{"level":5}')).toEqual({ level: 1, muted: false });
  });
  it('serialize -> parse round trips', () => {
    expect(V.parse(V.serialize({ level: 0.42, muted: true }))).toEqual({ level: 0.42, muted: true });
  });
});

describe('manager (injected store)', () => {
  it('loads defaults when the store is empty', () => {
    var m = V.create(fakeStore());
    expect(m.getLevel()).toBe(0.8);
    expect(m.isMuted()).toBe(false);
    expect(m.getEffective()).toBe(0.8);
  });
  it('loads persisted state', () => {
    var m = V.create(fakeStore('{"level":0.25,"muted":true}'));
    expect(m.getLevel()).toBe(0.25);
    expect(m.isMuted()).toBe(true);
    expect(m.getEffective()).toBe(0); // muted
  });
  it('setLevel clamps, persists, and notifies subscribers', () => {
    var store = fakeStore();
    var m = V.create(store);
    var seen = [];
    m.subscribe(function (v) { seen.push(v); }); // fires once immediately with 0.8
    m.setLevel(0.5);
    expect(m.getLevel()).toBe(0.5);
    expect(seen).toEqual([0.8, 0.5]);
    expect(V.parse(store.data['jj-volume'])).toEqual({ level: 0.5, muted: false });
    m.setLevel(2);
    expect(m.getLevel()).toBe(1);
  });
  it('mute zeroes effective and toggleMute flips it; unsubscribe stops updates', () => {
    var m = V.create(fakeStore());
    var seen = [];
    var off = m.subscribe(function (v) { seen.push(v); });
    m.setMuted(true);
    expect(m.getEffective()).toBe(0);
    off();
    m.toggleMute(); // back to unmuted, but unsubscribed
    expect(m.isMuted()).toBe(false);
    expect(seen).toEqual([0.8, 0]); // no event after unsubscribe
  });
});
