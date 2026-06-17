/**
 * japanjunky-media-format.js
 * Format normalization + player matching for the toolbox media player.
 *
 * UMD: attaches to window.JJ_MediaFormat as a classic <script>, exports via
 * module.exports under Vitest. No DOM access.
 *
 * normalizeFormat mirrors the Liquid logic in snippets/jj-product-json.liquid.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_MediaFormat = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeFormat(raw) {
    var s = (raw == null ? '' : String(raw)).toLowerCase().trim();
    if (!s) return '';
    if (s.indexOf('vinyl') >= 0 || s.indexOf('lp') >= 0 || s.indexOf('record') >= 0) return 'record';
    if (s.indexOf('cd') >= 0 || s.indexOf('compact disc') >= 0) return 'cd';
    if (s.indexOf('cassette') >= 0 || s.indexOf('tape') >= 0) return 'cassette';
    if (s.indexOf('minidisc') >= 0 || s.indexOf('mini disc') >= 0 || s.indexOf('md') >= 0) return 'minidisc';
    if (s.indexOf('hardware') >= 0 || s.indexOf('player') >= 0 ||
        s.indexOf('walkman') >= 0 || s.indexOf('stereo') >= 0) return 'hardware';
    return '';
  }

  // Only record/cassette/cd are playable, and only on their matching player.
  function matchesPlayer(playerType, productFormat) {
    if (playerType !== 'record' && playerType !== 'cassette' && playerType !== 'cd') {
      return false;
    }
    return playerType === productFormat;
  }

  return { normalizeFormat: normalizeFormat, matchesPlayer: matchesPlayer };
});
