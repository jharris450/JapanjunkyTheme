import { describe, it, expect } from 'vitest';
import V from '../assets/japanjunky-volume.js';

var T08 = 0.5 * Math.pow(0.8, 2); // tapered default level (avoids float-literal mismatch)

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
  it('taper applies the square curve and 0.5 ceiling', () => {
    expect(V.taper(1)).toBe(0.5);     // max slider = half-scale gain
    expect(V.taper(0.5)).toBe(0.125); // 0.5 * 0.5^2
    expect(V.taper(0)).toBe(0);
    expect(V.taper(2)).toBe(0.5);     // clamps before tapering
  });
  it('effective is 0 when muted, else the tapered level', () => {
    expect(V.effective(0.5, false)).toBe(0.125);
    expect(V.effective(0.5, true)).toBe(0);
    expect(V.effective(2, false)).toBe(0.5);
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
    expect(m.getEffective()).toBe(T08); // 0.5 * 0.8^2
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
    m.subscribe(function (v) { seen.push(v); }); // fires once immediately with tapered 0.8
    m.setLevel(0.5);
    expect(m.getLevel()).toBe(0.5);
    expect(seen).toEqual([T08, 0.125]); // tapered: 0.5*0.8^2, 0.5*0.5^2
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
    expect(seen).toEqual([T08, 0]); // tapered 0.8, then muted; no event after unsubscribe
  });
});

describe('mobile perma-mute', () => {
  it('boots muted with a null store when window.JJ_MOBILE is set', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const setItem = vi.fn();
    global.window = { JJ_MOBILE: true, localStorage: { getItem: () => null, setItem } };
    const Vmobile = await import('../assets/japanjunky-volume.js').then(m => m.default || m);
    expect(Vmobile.isMuted()).toBe(true);
    expect(Vmobile.getEffective()).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
    delete global.window;
  });
});
