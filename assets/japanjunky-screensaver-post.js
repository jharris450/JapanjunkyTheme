/**
 * JapanJunky Screensaver Post-Processor
 *
 * VGA 256-color palette quantization + Floyd-Steinberg dithering.
 * Processes raw ImageData from the WebGL readback and returns
 * dithered ImageData ready for display.
 *
 * Separate from japanjunky-dither.js which uses a 32-color CRT
 * phosphor palette for product images. This uses the standard
 * VGA 256-color palette for the screensaver's "PC rendering" look.
 */
(function () {
  'use strict';

  // ─── Standard VGA 256-Color Palette ──────────────────────────
  // Colors 0-15:   CGA compatibility colors
  // Colors 16-231: 6×6×6 color cube (6 levels: 0,51,102,153,204,255)
  // Colors 232-255: 24-step grayscale ramp
  var PALETTE = [];

  // CGA colors (0-15)
  var CGA = [
    [0,0,0], [0,0,170], [0,170,0], [0,170,170],
    [170,0,0], [170,0,170], [170,85,0], [170,170,170],
    [85,85,85], [85,85,255], [85,255,85], [85,255,255],
    [255,85,85], [255,85,255], [255,255,85], [255,255,255]
  ];
  for (var c = 0; c < CGA.length; c++) {
    PALETTE.push(CGA[c]);
  }

  // 6×6×6 color cube (16-231)
  var LEVELS = [0, 51, 102, 153, 204, 255];
  for (var ri = 0; ri < 6; ri++) {
    for (var gi = 0; gi < 6; gi++) {
      for (var bi = 0; bi < 6; bi++) {
        PALETTE.push([LEVELS[ri], LEVELS[gi], LEVELS[bi]]);
      }
    }
  }

  // Grayscale ramp (232-255)
  for (var g = 0; g < 24; g++) {
    var v = 8 + g * 10; // 8, 18, 28, ..., 238
    PALETTE.push([v, v, v]);
  }

  // ─── Nearest palette color (Euclidean RGB distance) ──────────
  function nearestColor(r, g, b) {
    var minDist = Infinity;
    var best = PALETTE[0];
    for (var i = 0; i < PALETTE.length; i++) {
      var pr = PALETTE[i][0];
      var pg = PALETTE[i][1];
      var pb = PALETTE[i][2];
      var dr = r - pr;
      var dg = g - pg;
      var db = b - pb;
      var dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        best = PALETTE[i];
        if (dist === 0) break;
      }
    }
    return best;
  }

  // ─── Floyd-Steinberg dithering on ImageData ──────────────────
  // Modifies imageData in place. Operates on a float buffer for
  // error accumulation precision.
  //
  // Error distribution:
  //        *    7/16
  //  3/16  5/16  1/16
  //
  function dither(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;

    var buf = new Float32Array(data.length);
    for (var i = 0; i < data.length; i++) {
      buf[i] = data[i];
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;

        var oldR = Math.max(0, Math.min(255, buf[idx]));
        var oldG = Math.max(0, Math.min(255, buf[idx + 1]));
        var oldB = Math.max(0, Math.min(255, buf[idx + 2]));

        var newC = nearestColor(oldR, oldG, oldB);

        buf[idx] = newC[0];
        buf[idx + 1] = newC[1];
        buf[idx + 2] = newC[2];

        var errR = oldR - newC[0];
        var errG = oldG - newC[1];
        var errB = oldB - newC[2];

        if (x + 1 < w) {
          var ri = idx + 4;
          buf[ri]     += errR * 0.4375;
          buf[ri + 1] += errG * 0.4375;
          buf[ri + 2] += errB * 0.4375;
        }
        if (x > 0 && y + 1 < h) {
          var bli = ((y + 1) * w + (x - 1)) * 4;
          buf[bli]     += errR * 0.1875;
          buf[bli + 1] += errG * 0.1875;
          buf[bli + 2] += errB * 0.1875;
        }
        if (y + 1 < h) {
          var bi = idx + w * 4;
          buf[bi]     += errR * 0.3125;
          buf[bi + 1] += errG * 0.3125;
          buf[bi + 2] += errB * 0.3125;
        }
        if (x + 1 < w && y + 1 < h) {
          var bri = idx + (w + 1) * 4;
          buf[bri]     += errR * 0.0625;
          buf[bri + 1] += errG * 0.0625;
          buf[bri + 2] += errB * 0.0625;
        }
      }
    }

    for (var j = 0; j < data.length; j++) {
      data[j] = Math.max(0, Math.min(255, Math.round(buf[j])));
    }

    return imageData;
  }

  // ─── Public API ──────────────────────────────────────────────
  window.JJ_ScreensaverPost = {
    dither: dither,
    PALETTE: PALETTE
  };
})();
