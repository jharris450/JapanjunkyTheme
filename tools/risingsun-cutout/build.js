// tools/risingsun-cutout/build.js
// Remove the light background from risingsun.jpg -> assets/risingsun.png (RGBA).
// Alpha = "redness" of each pixel: saturated-red sun stays opaque, near-white/grey
// background becomes transparent. No runtime chroma-key needed.
// Run: node tools/risingsun-cutout/build.js [sourcePath]
var sharp = require('sharp');
var path = require('path');

var SRC = process.argv[2] || process.env.RISINGSUN_SRC || 'C:/Users/Jacob/Desktop/risingsun.jpg';
var OUT = path.join(__dirname, '..', '..', 'assets', 'risingsun.png');
var GAIN = 3.0; // redness gain (matches the preview's chroma-key)

sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  .then(function (res) {
    var data = res.data, info = res.info;
    var n = info.width * info.height, ch = info.channels;
    for (var i = 0; i < n; i++) {
      var o = i * ch;
      var r = data[o], g = data[o + 1], b = data[o + 2];
      var a = (r - Math.max(g, b)) / 255 * GAIN;
      a = a < 0 ? 0 : (a > 1 ? 1 : a);
      data[o + 3] = Math.round(a * 255);
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
      .trim()           // crop the now-transparent margins
      .png()
      .toFile(OUT);
  })
  .then(function () { console.log('wrote', OUT); })
  .catch(function (e) { console.error(e); process.exit(1); });
