import { describe, it, expect } from 'vitest';
import MF from '../assets/japanjunky-media-format.js';

describe('normalizeFormat', () => {
  it('maps vinyl / lp / record to record', () => {
    expect(MF.normalizeFormat('Vinyl')).toBe('record');
    expect(MF.normalizeFormat('LP')).toBe('record');
    expect(MF.normalizeFormat('Record')).toBe('record');
    expect(MF.normalizeFormat('record')).toBe('record');
  });
  it('maps cd / compact disc to cd', () => {
    expect(MF.normalizeFormat('CD')).toBe('cd');
    expect(MF.normalizeFormat('Compact Disc')).toBe('cd');
  });
  it('maps cassette / tape to cassette', () => {
    expect(MF.normalizeFormat('Cassette')).toBe('cassette');
    expect(MF.normalizeFormat('tape')).toBe('cassette');
  });
  it('maps minidisc to minidisc', () => {
    expect(MF.normalizeFormat('MiniDisc')).toBe('minidisc');
  });
  it('maps hardware-ish to hardware', () => {
    expect(MF.normalizeFormat('Walkman')).toBe('hardware');
    expect(MF.normalizeFormat('Stereo Player')).toBe('hardware');
  });
  it('returns empty string for unknown / empty / null', () => {
    expect(MF.normalizeFormat('')).toBe('');
    expect(MF.normalizeFormat('   ')).toBe('');
    expect(MF.normalizeFormat(null)).toBe('');
    expect(MF.normalizeFormat(undefined)).toBe('');
    expect(MF.normalizeFormat('something else')).toBe('');
  });
});

describe('matchesPlayer', () => {
  it('matches same playable format', () => {
    expect(MF.matchesPlayer('record', 'record')).toBe(true);
    expect(MF.matchesPlayer('cassette', 'cassette')).toBe(true);
    expect(MF.matchesPlayer('cd', 'cd')).toBe(true);
  });
  it('rejects mismatched formats', () => {
    expect(MF.matchesPlayer('record', 'cd')).toBe(false);
    expect(MF.matchesPlayer('cd', 'cassette')).toBe(false);
  });
  it('rejects non-playable product formats', () => {
    expect(MF.matchesPlayer('record', 'minidisc')).toBe(false);
    expect(MF.matchesPlayer('cd', 'hardware')).toBe(false);
    expect(MF.matchesPlayer('cassette', '')).toBe(false);
  });
  it('rejects when player type is not a known player', () => {
    expect(MF.matchesPlayer(null, 'record')).toBe(false);
    expect(MF.matchesPlayer('minidisc', 'minidisc')).toBe(false);
  });
});
