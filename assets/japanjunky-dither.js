/**
 * Japanjunky - Auto-Dither Pipeline (Floyd-Steinberg)
 *
 * Client-side Floyd-Steinberg error-diffusion dithering for product images.
 * Dithers to a custom CRT phosphor palette for a unified retro look.
 * Applied to all images inside .jj-thumb-img and .jj-detail-image containers.
 *
 * Inspired by Hypnospace Outlaw's approach: Floyd-Steinberg dithering
 * to a fixed custom palette produces organic stipple patterns that look
 * like actual 90s-era GIF exports, not a repeating grid.
 */

(function () {
  'use strict';

  // ─── JapanJunky CRT Phosphor Palette (32 colors) ──────────────
  // Built from the site's color system: grayscale ramp + phosphor hues.
  // Covers enough range to render product photos recognizably while
  // keeping the restricted, CRT-display feel.
  var PALETTE = [
    // Grayscale ramp (10)
    [0, 0, 0],
    [17, 17, 17],
    [34, 34, 34],
    [68, 68, 68],
    [102, 102, 102],
    [136, 136, 136],
    [170, 170, 170],
    [204, 204, 204],
    [232, 224, 208],  // cream (--jj-text)
    [245, 245, 240],

    // Red / primary (3)
    [100, 20, 20],
    [180, 40, 40],
    [232, 49, 58],    // --jj-primary

    // Gold / secondary (3)
    [120, 90, 0],
    [200, 160, 20],
    [245, 215, 66],   // --jj-secondary

    // Amber (2)
    [160, 100, 0],
    [255, 170, 0],    // --jj-amber

    // Cyan / accent (3)
    [10, 60, 90],
    [74, 164, 224],   // --jj-accent
    [0, 229, 229],    // --jj-cyan

    // Green (3)
    [15, 80, 15],
    [40, 160, 40],
    [51, 255, 51],    // --jj-green

    // Magenta (2)
    [90, 20, 90],
    [224, 64, 224],   // --jj-magenta

    // Warm tones for skin/wood/vinyl (4)
    [90, 55, 30],
    [140, 90, 50],
    [180, 130, 80],
    [210, 175, 130],

    // Cool blue (2)
    [20, 30, 60],
    [60, 80, 140]
  ];

  // ─── Nearest palette color (Euclidean distance in RGB) ─────────
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

  // ─── Floyd-Steinberg dithering ─────────────────────────────────
  // Processes left-to-right, top-to-bottom. For each pixel, snaps to
  // nearest palette color and distributes the quantization error to
  // neighboring unvisited pixels:
  //
  //        *    7/16
  //  3/16  5/16  1/16
  //
  function ditherImage(img) {
    if (!img || !img.naturalWidth || img.dataset.dithered === 'true') return;

    var w = img.naturalWidth;
    var h = img.naturalHeight;

    // Cap dimensions for performance
    var maxDim = 480;
    var scale = 1;
    if (w > maxDim || h > maxDim) {
      scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, w, h);

    var imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      // CORS or tainted canvas
      img.dataset.dithered = 'failed';
      return;
    }

    var data = imageData.data;

    // Work with a float buffer so error accumulation stays precise
    var buf = new Float32Array(data.length);
    for (var i = 0; i < data.length; i++) {
      buf[i] = data[i];
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;

        var oldR = buf[idx];
        var oldG = buf[idx + 1];
        var oldB = buf[idx + 2];

        // Clamp before palette lookup
        oldR = Math.max(0, Math.min(255, oldR));
        oldG = Math.max(0, Math.min(255, oldG));
        oldB = Math.max(0, Math.min(255, oldB));

        var newC = nearestColor(oldR, oldG, oldB);

        // Write the palette color
        buf[idx] = newC[0];
        buf[idx + 1] = newC[1];
        buf[idx + 2] = newC[2];

        // Quantization error
        var errR = oldR - newC[0];
        var errG = oldG - newC[1];
        var errB = oldB - newC[2];

        // Distribute error to neighbors
        // Right: 7/16
        if (x + 1 < w) {
          var ri = idx + 4;
          buf[ri]     += errR * 0.4375;
          buf[ri + 1] += errG * 0.4375;
          buf[ri + 2] += errB * 0.4375;
        }
        // Bottom-left: 3/16
        if (x > 0 && y + 1 < h) {
          var bli = ((y + 1) * w + (x - 1)) * 4;
          buf[bli]     += errR * 0.1875;
          buf[bli + 1] += errG * 0.1875;
          buf[bli + 2] += errB * 0.1875;
        }
        // Bottom: 5/16
        if (y + 1 < h) {
          var bi = idx + w * 4;
          buf[bi]     += errR * 0.3125;
          buf[bi + 1] += errG * 0.3125;
          buf[bi + 2] += errB * 0.3125;
        }
        // Bottom-right: 1/16
        if (x + 1 < w && y + 1 < h) {
          var bri = idx + (w + 1) * 4;
          buf[bri]     += errR * 0.0625;
          buf[bri + 1] += errG * 0.0625;
          buf[bri + 2] += errB * 0.0625;
        }
      }
    }

    // Write back to imageData
    for (var j = 0; j < data.length; j++) {
      data[j] = Math.max(0, Math.min(255, Math.round(buf[j])));
    }

    ctx.putImageData(imageData, 0, 0);

    img.src = canvas.toDataURL('image/png');
    img.dataset.dithered = 'true';
  }

  // ─── Public API ────────────────────────────────────────────────

  function ditherAll() {
    var containers = document.querySelectorAll('.jj-thumb-img img, .jj-detail-image img');
    containers.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        ditherImage(img);
      } else {
        img.addEventListener('load', function () {
          ditherImage(img);
        }, { once: true });
      }
    });
  }

  function ditherSingle(img) {
    if (!img) return;
    img.dataset.dithered = '';
    if (img.complete && img.naturalWidth > 0) {
      ditherImage(img);
    } else {
      img.addEventListener('load', function () {
        ditherImage(img);
      }, { once: true });
    }
  }

  window.JJ_Dither = {
    ditherAll: ditherAll,
    ditherSingle: ditherSingle
  };

  // ─── Auto-init ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ditherAll);
  } else {
    ditherAll();
  }

  // Watch for dynamically added images
  if (window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      var needsDither = false;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG' && node.closest('.jj-thumb-img, .jj-detail-image')) {
              needsDither = true;
            } else if (node.querySelector && node.querySelector('.jj-thumb-img img, .jj-detail-image img')) {
              needsDither = true;
            }
          }
        });
      });
      if (needsDither) ditherAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
