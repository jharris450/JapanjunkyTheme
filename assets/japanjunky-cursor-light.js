/**
 * Japanjunky — CRT Pixel Cursor via CSS cursor:url()
 *
 * Uses pre-generated PNG cursors in Win95 arrow shape with CRT phosphor colors.
 * Swaps between 4 color variants on mousemove (counter-based, no CSS animations).
 * Fully reduced-motion compliant — no animations used at all.
 *
 * Requires window.JJ_CURSOR_URLS set by theme.liquid with Shopify asset URLs.
 */
(function () {
  'use strict';

  var urls = window.JJ_CURSOR_URLS;
  if (!urls || !urls.arrow) return;

  // Build CSS cursor values for each variant
  var arrowCursors = urls.arrow.map(function (u) {
    return 'url("' + u + '") 0 0, auto';
  });
  var handCursors = urls.hand.map(function (u) {
    return 'url("' + u + '") 3 0, pointer';
  });
  var textCursor = 'url("' + urls.text + '") 3 8, text';
  var waitCursors = urls.wait.map(function (u) {
    return 'url("' + u + '") 5 6, wait';
  });

  // Inject a <style> element for cursor rules
  var style = document.createElement('style');
  style.id = 'jj-cursor-style';

  function buildCSS(variant) {
    var v = variant % 4;
    return [
      // Default: arrow
      'html, body, * { cursor: ' + arrowCursors[v] + ' !important; }',
      // Interactive: hand
      'a, button, [role="button"], label, summary, select, .jj-start-btn, .jj-taskbar-tab, .jj-start-menu__item, .jj-start-submenu__item { cursor: ' + handCursors[v] + ' !important; }',
      // Text inputs: I-beam
      'input, textarea, [contenteditable="true"] { cursor: ' + textCursor + ' !important; }',
      // Wait states
      '.jj-loading, [aria-busy="true"] { cursor: ' + waitCursors[v] + ' !important; }'
    ].join('\n');
  }

  style.textContent = buildCSS(0);
  document.head.appendChild(style);

  // Swap variants on mousemove (every 8th move)
  var moveCount = 0;
  var currentVariant = 0;

  document.addEventListener('mousemove', function () {
    moveCount++;
    if (moveCount % 8 === 0) {
      currentVariant = (currentVariant + 1) % 4;
      style.textContent = buildCSS(currentVariant);
    }
  });
})();
