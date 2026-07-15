/**
 * Japanjunky — CRT Pixel Cursor via CSS cursor:url()
 *
 * Uses pre-generated PNG cursors in Win95 arrow shape with CRT phosphor colors.
 * Swaps between 4 color variants on mousemove (counter-based, no CSS animations).
 * Picks cursor size set based on screen width to match CSS zoom breakpoints.
 * Fully reduced-motion compliant — no animations used at all.
 *
 * Requires window.JJ_CURSOR_SETS set by theme.liquid with Shopify asset URLs.
 */
(function () {
  'use strict';

  // Handheld mode: no pointer, no cursor — skip installing cursor sets.
  if (window.JJ_MOBILE) return;

  var sets = window.JJ_CURSOR_SETS;
  if (!sets || !sets.std) return;

  // Pick the right cursor set based on screen width
  // Matches the CSS zoom breakpoints in japanjunky-base.css:
  //   >= 3200px → zoom 2.0 → use "hh" (2.5x cursors)
  //   >= 1600px → zoom 1.15 → use "hi" (1.5x cursors)
  //   else      → zoom 1.0  → use "std" (1x cursors)
  var isGecko = typeof CSS !== 'undefined' && CSS.supports
    && CSS.supports('-moz-appearance', 'none');

  // Chromium tier scale by screen width (matches the zoom breakpoints).
  function tierScale() {
    var w = screen.width;
    if (w >= 3200 && sets.hh) return 2.5;
    if (w >= 1600 && sets.hi) return 1.5;
    return 1;
  }

  function pickSet() {
    // Gecko scales cursor:url() images by the CSS zoom itself (Chromium
    // doesn't — that's why the pre-scaled hi/hh sets exist). Handing
    // Firefox a pre-scaled set double-scales it into a giant cursor.
    // Start Gecko on the 1x std set; buildGeckoSet() swaps in exact-size
    // copies asynchronously.
    if (isGecko) return sets.std;
    var t = tierScale();
    if (t === 2.5) return sets.hh;
    if (t === 1.5) return sets.hi;
    return sets.std;
  }

  var active = pickSet();

  // Gecko parity: downscale the std art by tierScale/zoom (nearest) so
  // that after Gecko multiplies by the CSS zoom, the on-screen cursor is
  // pixel-identical in size to what Chromium shows on the same screen.
  function buildGeckoSet(done) {
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var f = tierScale() / zoom;
    if (Math.abs(f - 1) < 0.01) return; // std already exact
    var out = { hotspots: {} };
    var types = ['arrow', 'hand', 'text', 'wait', 'rsns', 'rsew', 'rsnesw', 'rsnwse'];
    var pending = 0;
    var failed = false;
    types.forEach(function (type) {
      out[type] = [];
      out.hotspots[type] = [
        Math.round(sets.std.hotspots[type][0] * f),
        Math.round(sets.std.hotspots[type][1] * f)
      ];
      sets.std[type].forEach(function (url, i) {
        pending++;
        var img = new Image();
        img.crossOrigin = 'anonymous'; // Shopify CDN sends ACAO:* — keeps the canvas readable
        img.onload = function () {
          if (failed) return;
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * f));
          c.height = Math.max(1, Math.round(img.height * f));
          var ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = false; // nearest — keeps the phosphor arrow crisp
          ctx.drawImage(img, 0, 0, c.width, c.height);
          try {
            out[type][i] = c.toDataURL('image/png');
          } catch (e) {
            failed = true; // tainted canvas — stay on std
            return;
          }
          if (--pending === 0) done(out);
        };
        img.onerror = function () { failed = true; };
        img.src = url;
      });
    });
  }

  var FALLBACKS = {
    arrow: 'auto', hand: 'pointer', text: 'text', wait: 'wait',
    rsns: 'ns-resize', rsew: 'ew-resize', rsnesw: 'nesw-resize', rsnwse: 'nwse-resize'
  };

  function cursorVal(type, variant) {
    var url = active[type][variant % 4];
    var hs = active.hotspots[type];
    return 'url("' + url + '") ' + hs[0] + ' ' + hs[1] + ', ' + (FALLBACKS[type] || 'auto');
  }

  // Inject a <style> element for cursor rules
  var style = document.createElement('style');
  style.id = 'jj-cursor-style';

  function buildCSS(variant) {
    var v = variant % 4;
    return [
      'html, body, * { cursor: ' + cursorVal('arrow', v) + ' !important; }',
      // "a *"/"button *" keep the hand over link/button children (e.g. grid
      // card canvas + text divs) — the bare "*" arrow rule won on them
      'a, a *, button, button *, [role="button"], label, summary, select, .jj-start-btn, .jj-taskbar-tab, .jj-start-menu__item, .jj-start-submenu__item { cursor: ' + cursorVal('hand', v) + ' !important; }',
      'input, textarea, [contenteditable="true"] { cursor: ' + cursorVal('text', v) + ' !important; }',
      '.jj-loading, [aria-busy="true"] { cursor: ' + cursorVal('wait', v) + ' !important; }',
      // window resize handles (explorer window): phosphor Win95 double
      // arrows from the same cursor set, like the OS swapping the pointer
      // at a window edge — the bare "*" arrow rule would otherwise
      // swallow them
      '[data-rs="n"], [data-rs="s"] { cursor: ' + cursorVal('rsns', v) + ' !important; }',
      '[data-rs="e"], [data-rs="w"] { cursor: ' + cursorVal('rsew', v) + ' !important; }',
      '[data-rs="ne"], [data-rs="sw"] { cursor: ' + cursorVal('rsnesw', v) + ' !important; }',
      '[data-rs="nw"], [data-rs="se"] { cursor: ' + cursorVal('rsnwse', v) + ' !important; }'
    ].join('\n');
  }

  var currentVariant = 0;
  style.textContent = buildCSS(0);
  document.head.appendChild(style);

  if (isGecko) {
    buildGeckoSet(function (set) {
      active = set;
      style.textContent = buildCSS(currentVariant);
    });
  }

  // Swap variants on mousemove (every 8th move)
  var moveCount = 0;

  document.addEventListener('mousemove', function () {
    moveCount++;
    if (moveCount % 8 === 0) {
      currentVariant = (currentVariant + 1) % 4;
      style.textContent = buildCSS(currentVariant);
    }
  });
})();
