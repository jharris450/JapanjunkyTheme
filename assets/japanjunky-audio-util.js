/**
 * japanjunky-audio-util.js
 * Pure helpers for the player audio engine. UMD: window.JJ_AudioUtil as a
 * classic <script>, module.exports under Vitest. No Web Audio / DOM.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_AudioUtil = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Extract a YouTube video id from watch?v=, youtu.be/, /embed/, /shorts/,
  // /live/ URLs, or a bare 11-char id.
  function parseYouTubeId(url) {
    var s = (url == null ? '' : String(url)).replace(/^\s+|\s+$/g, '');
    if (!s) return '';
    var m = s.match(/\/embed\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    m = s.match(/\/shorts\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    m = s.match(/\/live\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    m = s.match(/[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s; // bare video id
    return '';
  }

  // Decide which playback path to use for a product.
  function choosePath(opts) {
    if (opts && opts.audioUrl) return 'file';
    if (opts && opts.youtubeUrl) return 'youtube';
    return 'static';
  }

  return { parseYouTubeId: parseYouTubeId, choosePath: choosePath };
});
