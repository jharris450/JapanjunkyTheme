import { describe, it, expect } from 'vitest';
import FSM from '../assets/japanjunky-bundle-fsm.js';

describe('bundle FSM transitions', () => {
  it('opens from closed', () => {
    expect(FSM.next('closed', 'open')).toBe('opening');
    expect(FSM.next('opening', 'opened')).toBe('open');
  });
  it('runs the reroll cycle back to open', () => {
    expect(FSM.next('open', 'reroll')).toBe('retracting');
    expect(FSM.next('retracting', 'retracted')).toBe('closing');
    expect(FSM.next('closing', 'closed')).toBe('shaking');
    expect(FSM.next('shaking', 'shaken')).toBe('opening');
    expect(FSM.next('opening', 'opened')).toBe('open');
  });
  it('ignores illegal events (no-op)', () => {
    expect(FSM.next('closed', 'reroll')).toBe('closed');
    expect(FSM.next('open', 'open')).toBe('open');
    expect(FSM.next('opening', 'reroll')).toBe('opening');
  });
});

describe('bundle FSM isLocked', () => {
  it('is unlocked only in closed and open', () => {
    expect(FSM.isLocked('closed')).toBe(false);
    expect(FSM.isLocked('open')).toBe(false);
    ['opening', 'retracting', 'closing', 'shaking'].forEach(function (s) {
      expect(FSM.isLocked(s)).toBe(true);
    });
  });
});
