/**
 * Japanjunky — CRT Pixel Cursor via CSS cursor:url()
 *
 * Uses pre-generated PNG cursors in Win95 arrow shape with CRT phosphor colors.
 * Swaps between 4 color variants on mousemove (counter-based, no CSS animations).
 * Dynamically scales cursors to match the CSS zoom level on <html>.
 * Fully reduced-motion compliant — no animations used at all.
 *
 * Requires window.JJ_CURSOR_URLS set by theme.liquid with Shopify asset URLs.
 */
(function () {
  'use strict';

  var urls = window.JJ_CURSOR_URLS;
  if (!urls || !urls.arrow) return;

  // Cursor hotspots (at 1x scale)
  var HOTSPOTS = {
    arrow: [0, 0],
    hand:  [3, 0],
    text:  [3, 8],
    wait:  [5, 6]
  };

  // Detect CSS zoom level on <html>
  function getZoom() {
    var z = parseFloat(getComputedStyle(document.documentElement).zoom);
    return (z && z > 0) ? z : 1;
  }

  // Scale a cursor image on a canvas with nearest-neighbor interpolation
  function scaleCursor(imgSrc, scale, callback) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var w = Math.round(img.width * scale);
      var h = Math.round(img.height * scale);
      // CSS cursors max 128x128
      if (w > 128) { scale = 128 / img.width; w = 128; h = Math.round(img.height * scale); }
      if (h > 128) { scale = 128 / img.height; h = 128; w = Math.round(img.width * scale); }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/png'), scale);
    };
    img.onerror = function () {
      callback(imgSrc, 1); // fallback to original
    };
    img.src = imgSrc;
  }

  // Scale all cursor URLs for a given zoom level
  function scaleAllCursors(zoom, done) {
    var scale = zoom; // scale cursors proportional to zoom
    if (scale <= 1.05) { done(null); return; } // no scaling needed at ~1x

    var result = { arrow: [], hand: [], text: [], wait: [] };
    var pending = 0;
    var types = ['arrow', 'hand', 'text', 'wait'];

    types.forEach(function (type) {
      var srcList = urls[type];
      for (var i = 0; i < srcList.length; i++) {
        pending++;
        (function (t, idx, src) {
          scaleCursor(src, scale, function (dataUrl) {
            result[t][idx] = dataUrl;
            pending--;
            if (pending === 0) done(result);
          });
        })(type, i, srcList[i]);
      }
    });
  }

  // Build CSS cursor values for a variant
  var activeUrls = null; // scaled URLs or null for originals
  var activeScale = 1;

  function cursorVal(type, variant) {
    var src = activeUrls ? activeUrls[type] : urls[type];
    var url = Array.isArray(src) ? src[variant % src.length] : src;
    var hs = HOTSPOTS[type];
    var hx = Math.round(hs[0] * activeScale);
    var hy = Math.round(hs[1] * activeScale);
    var fallback = type === 'hand' ? 'pointer' : type === 'text' ? 'text' : type === 'wait' ? 'wait' : 'auto';
    return 'url("' + url + '") ' + hx + ' ' + hy + ', ' + fallback;
  }

  // Inject a <style> element for cursor rules
  var style = document.createElement('style');
  style.id = 'jj-cursor-style';

  function buildCSS(variant) {
    var v = variant % 4;
    return [
      'html, body, * { cursor: ' + cursorVal('arrow', v) + ' !important; }',
      'a, button, [role="button"], label, summary, select, .jj-start-btn, .jj-taskbar-tab, .jj-start-menu__item, .jj-start-submenu__item { cursor: ' + cursorVal('hand', v) + ' !important; }',
      'input, textarea, [contenteditable="true"] { cursor: ' + cursorVal('text', v) + ' !important; }',
      '.jj-loading, [aria-busy="true"] { cursor: ' + cursorVal('wait', v) + ' !important; }'
    ].join('\n');
  }

  var currentVariant = 0;

  function applyCSS() {
    style.textContent = buildCSS(currentVariant);
  }

  // Initialize with unscaled cursors immediately, then scale if needed
  applyCSS();
  document.head.appendChild(style);

  // Scale cursors for current zoom
  var lastZoom = 1;
  function checkZoomAndScale() {
    var zoom = getZoom();
    if (Math.abs(zoom - lastZoom) < 0.05) return; // no significant change
    lastZoom = zoom;

    if (zoom <= 1.05) {
      activeUrls = null;
      activeScale = 1;
      applyCSS();
      return;
    }

    scaleAllCursors(zoom, function (scaled) {
      if (scaled) {
        activeUrls = scaled;
        activeScale = zoom;
      } else {
        activeUrls = null;
        activeScale = 1;
      }
      applyCSS();
    });
  }

  // Check zoom on load and on resize
  checkZoomAndScale();
  window.addEventListener('resize', function () {
    checkZoomAndScale();
  });

  // Swap variants on mousemove (every 8th move)
  var moveCount = 0;

  document.addEventListener('mousemove', function () {
    moveCount++;
    if (moveCount % 8 === 0) {
      currentVariant = (currentVariant + 1) % 4;
      applyCSS();
    }
  });
})();
