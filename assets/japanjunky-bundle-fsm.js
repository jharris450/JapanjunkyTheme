/**
 * japanjunky-bundle-fsm.js
 * Open/reroll state machine for the mystery-box hero.
 * UMD: window.JJ_BundleFSM / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundleFSM = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATES = ['closed', 'opening', 'open', 'retracting', 'closing', 'shaking'];

  // transition[state][event] = nextState
  var TRANSITIONS = {
    closed:     { open: 'opening' },
    opening:    { opened: 'open' },
    open:       { reroll: 'retracting' },
    retracting: { retracted: 'closing' },
    closing:    { closed: 'shaking' },
    shaking:    { shaken: 'opening' }
  };

  function next(state, event) {
    var row = TRANSITIONS[state];
    if (row && row[event]) return row[event];
    return state; // illegal event → no-op
  }

  function isLocked(state) {
    return state !== 'closed' && state !== 'open';
  }

  return { STATES: STATES, next: next, isLocked: isLocked };
});
