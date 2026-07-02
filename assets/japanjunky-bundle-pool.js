/**
 * japanjunky-bundle-pool.js
 * Random-sample selection for the mystery-box hero.
 * UMD: window.JJ_BundlePool / module.exports. No DOM, no three.js.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_BundlePool = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Up to n distinct-by-id available record products, excluding excludeId.
  function pickRecords(products, n, excludeId, rng) {
    rng = rng || Math.random;
    var seen = {};
    var eligible = [];
    for (var i = 0; i < (products || []).length; i++) {
      var p = products[i];
      if (!p || p.format !== 'record' || !p.available) continue;
      if (p.id === excludeId) continue;
      if (seen[p.id]) continue;
      seen[p.id] = true;
      eligible.push(p);
    }
    // Fisher–Yates shuffle using the injected rng, then take the first n.
    for (var j = eligible.length - 1; j > 0; j--) {
      var k = Math.floor(rng() * (j + 1));
      var tmp = eligible[j];
      eligible[j] = eligible[k];
      eligible[k] = tmp;
    }
    return eligible.slice(0, Math.max(0, n));
  }

  return { pickRecords: pickRecords };
});
