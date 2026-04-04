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

  // ─── Nearest palette color (lookup table) ────────────────────
  // Pre-build a 32×32×32 RGB lookup table so per-pixel palette
  // search is a single array read instead of scanning 256 entries.
  var LUT_BITS = 5; // 5 bits per channel → 32 levels
  var LUT_SIZE = 1 << LUT_BITS; // 32
  var LUT_SHIFT = 8 - LUT_BITS; // 3 (shift right to quantize 0-255 → 0-31)
  var colorLUT = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * 3);
  (function buildLUT() {
    for (var ri = 0; ri < LUT_SIZE; ri++) {
      var r = (ri << LUT_SHIFT) | ((1 << LUT_SHIFT) >> 1); // midpoint of bin
      for (var gi = 0; gi < LUT_SIZE; gi++) {
        var g = (gi << LUT_SHIFT) | ((1 << LUT_SHIFT) >> 1);
        for (var bi = 0; bi < LUT_SIZE; bi++) {
          var b = (bi << LUT_SHIFT) | ((1 << LUT_SHIFT) >> 1);
          var minDist = Infinity;
          var bestR = 0, bestG = 0, bestB = 0;
          for (var pi = 0; pi < PALETTE.length; pi++) {
            var pr = PALETTE[pi][0];
            var pg = PALETTE[pi][1];
            var pb = PALETTE[pi][2];
            var dr = r - pr;
            var dg = g - pg;
            var db = b - pb;
            var dist = dr * dr + dg * dg + db * db;
            if (dist < minDist) {
              minDist = dist;
              bestR = pr; bestG = pg; bestB = pb;
              if (dist === 0) break;
            }
          }
          var idx = (ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi) * 3;
          colorLUT[idx] = bestR;
          colorLUT[idx + 1] = bestG;
          colorLUT[idx + 2] = bestB;
        }
      }
    }
  })();

  // ─── Floyd-Steinberg dithering on ImageData ──────────────────
  // Modifies imageData in place. Operates on a float buffer for
  // error accumulation precision.
  //
  // Error distribution:
  //        *    7/16
  //  3/16  5/16  1/16
  //
  // Buffer is pre-allocated and reused to avoid per-frame GC pressure.
  var ditherBuf = null;
  var ditherBufLen = 0;

  function dither(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;

    // Reuse buffer if size matches, otherwise reallocate once
    if (data.length !== ditherBufLen) {
      ditherBuf = new Float32Array(data.length);
      ditherBufLen = data.length;
    }
    var buf = ditherBuf;
    for (var i = 0; i < data.length; i++) {
      buf[i] = data[i];
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;

        var oldR = Math.max(0, Math.min(255, buf[idx]));
        var oldG = Math.max(0, Math.min(255, buf[idx + 1]));
        var oldB = Math.max(0, Math.min(255, buf[idx + 2]));

        // LUT lookup: quantize to 5 bits per channel
        var li = ((oldR >> LUT_SHIFT) * LUT_SIZE * LUT_SIZE
                + (oldG >> LUT_SHIFT) * LUT_SIZE
                + (oldB >> LUT_SHIFT)) * 3;
        var newR = colorLUT[li];
        var newG = colorLUT[li + 1];
        var newB = colorLUT[li + 2];

        buf[idx] = newR;
        buf[idx + 1] = newG;
        buf[idx + 2] = newB;

        var errR = oldR - newR;
        var errG = oldG - newG;
        var errB = oldB - newB;

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
