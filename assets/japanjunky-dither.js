/**
 * Japanjunky - Auto-Dither Pipeline
 *
 * Client-side ordered (Bayer) dithering for product images.
 * Applied to all images inside .jj-thumb-img and .jj-detail-image containers.
 * Uses offscreen canvas to process, replaces src with data URL.
 */

(function () {
  'use strict';

  // 4x4 Bayer threshold matrix (normalized to 0-255)
  var BAYER_4x4 = [
    [  0, 128,  32, 160],
    [192,  64, 224,  96],
    [ 48, 176,  16, 144],
    [240, 112, 208,  80]
  ];

  var MATRIX_SIZE = 4;
  var COLOR_LEVELS = 4;

  function ditherImage(img) {
    if (!img || !img.naturalWidth || img.dataset.dithered === 'true') return;

    var w = img.naturalWidth;
    var h = img.naturalHeight;

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
      img.dataset.dithered = 'failed';
      return;
    }

    var data = imageData.data;
    var step = 256 / COLOR_LEVELS;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var threshold = BAYER_4x4[y % MATRIX_SIZE][x % MATRIX_SIZE];
        var bias = (threshold / 255 - 0.5) * step;

        for (var c = 0; c < 3; c++) {
          var val = data[idx + c] + bias;
          data[idx + c] = Math.round(Math.max(0, Math.min(255, val)) / step) * step;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    img.src = canvas.toDataURL('image/png');
    img.dataset.dithered = 'true';
  }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ditherAll);
  } else {
    ditherAll();
  }

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
