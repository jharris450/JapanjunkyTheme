// tools/risingsun-cutout/build.js
// Remove the light background from risingsun.jpg -> assets/risingsun.png (RGBA).
// Alpha = "redness" of each pixel: saturated-red sun stays opaque, near-white/grey
// background becomes transparent. The alpha is then hardened (faint fringe -> 0)
// and despeckled (isolated stray pixels removed) so the scene's hue-shift can't
// light up leftover specks. No runtime chroma-key needed.
// Run: node tools/risingsun-cutout/build.js [sourcePath]
var sharp = require('sharp');
var path = require('path');

var SRC = process.argv[2] || process.env.RISINGSUN_SRC || 'C:/Users/Jacob/Desktop/risingsun.jpg';
var OUT = path.join(__dirname, '..', '..', 'assets', 'risingsun.png');
var GAIN = 3.0;     // redness gain (matches the preview's chroma-key)
var LO = 0.30, HI = 0.60; // alpha remap: below LO -> 0, above HI -> 1 (kills fringe)
var MIN_NEIGHBORS = 3;    // despeckle: opaque pixels with fewer opaque neighbors are dropped

function smoothstep(a, b, x) {
  var t = (x - a) / (b - a);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t * t * (3 - 2 * t);
}

sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  .then(function (res) {
    var data = res.data, info = res.info;
    var w = info.width, h = info.height, ch = info.channels, n = w * h;

    // Pass 1: redness -> hardened alpha.
    var alpha = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * ch;
      var redness = (data[o] - Math.max(data[o + 1], data[o + 2])) / 255 * GAIN;
      alpha[i] = Math.round(smoothstep(LO, HI, redness) * 255);
    }

    // Pass 2: despeckle — drop opaque pixels that are nearly isolated (stray
    // specks / 1px fringe the chroma-key left behind).
    var cleaned = new Uint8Array(alpha); // copy so neighbor checks use the originals
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (alpha[idx] < 24) continue; // already transparent
        var opaque = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (alpha[ny * w + nx] >= 24) opaque++;
          }
        }
        if (opaque < MIN_NEIGHBORS) cleaned[idx] = 0;
      }
    }

    for (var j = 0; j < n; j++) data[j * ch + 3] = cleaned[j];

    return sharp(data, { raw: { width: w, height: h, channels: ch } })
      .trim()           // crop the now-transparent margins
      .png()
      .toFile(OUT);
  })
  .then(function () { console.log('wrote', OUT); })
  .catch(function (e) { console.error(e); process.exit(1); });
