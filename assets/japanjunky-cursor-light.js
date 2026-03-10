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

  var sets = window.JJ_CURSOR_SETS;
  if (!sets || !sets.std) return;

  // Pick the right cursor set based on screen width
  // Matches the CSS zoom breakpoints in japanjunky-base.css:
  //   >= 3200px → zoom 2.0 → use "hh" (2.5x cursors)
  //   >= 1600px → zoom 1.15 → use "hi" (1.5x cursors)
  //   else      → zoom 1.0  → use "std" (1x cursors)
  function pickSet() {
    var w = screen.width;
    if (w >= 3200 && sets.hh) return sets.hh;
    if (w >= 1600 && sets.hi) return sets.hi;
    return sets.std;
  }

  var active = pickSet();

  function cursorVal(type, variant) {
    var url = active[type][variant % 4];
    var hs = active.hotspots[type];
    var fallback = type === 'hand' ? 'pointer' : type === 'text' ? 'text' : type === 'wait' ? 'wait' : 'auto';
    return 'url("' + url + '") ' + hs[0] + ' ' + hs[1] + ', ' + fallback;
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
  style.textContent = buildCSS(0);
  document.head.appendChild(style);

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
