/**
 * Japanjunky - Cart Header Sync
 *
 * Exposes window.jjRefreshCart() which fetches /cart.js, updates the
 * cart count inside the start menu, and triggers a glow + flashing
 * cart badge on the taskbar CMD button so the user knows their item
 * landed in the menu's cart entry.
 */

(function () {
  'use strict';

  // ─── Badge Strobe ─────────────────────────────────────────────
  // Rotates currency glyphs + cycles the phosphor palette, same
  // wall-clock-hold approach as the grid price strobe (frame-count or
  // CSS keyframes alias on high-refresh / loaded displays). Colors snap
  // every HOLD_MS; the glyph swaps slower so it stays readable.
  var GLYPHS = ['¥', '$', '€', '£', '₩']; // ¥ $ € £ ₩
  var COLORS = ['#e8313a', '#00e5e5', '#f5d742', '#e040e0', '#33ff33', '#ffaa00'];
  var HOLD_MS = 55;
  var TICKS_PER_GLYPH = 3; // ~165ms per glyph
  var strobeRaf = null;
  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setBadgeStrobing(on) {
    var icon = document.querySelector('#jj-start-btn-cart-badge .jj-start-btn__cart-icon');
    if (!icon) return;
    if (!on || reducedMotion) {
      if (strobeRaf) {
        cancelAnimationFrame(strobeRaf);
        strobeRaf = null;
      }
      icon.textContent = '¥';
      icon.style.color = '';
      return;
    }
    if (strobeRaf) return; // already running

    var idx = 0;
    var last = 0;
    function tick(now) {
      strobeRaf = requestAnimationFrame(tick);
      if (now - last < HOLD_MS) return;
      last = now;
      idx++;
      icon.style.color = COLORS[idx % COLORS.length];
      if (idx % TICKS_PER_GLYPH === 0) {
        icon.textContent = GLYPHS[(idx / TICKS_PER_GLYPH) % GLYPHS.length];
      }
    }
    strobeRaf = requestAnimationFrame(tick);
  }

  // Badge can be rendered server-side on page load (cart already filled)
  var initBtn = document.getElementById('jj-start-btn');
  if (initBtn && initBtn.classList.contains('jj-start-btn--has-cart')) {
    setBadgeStrobing(true);
  }

  window.jjRefreshCart = function () {
    return fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var countEl = document.getElementById('jj-nav-cart-count');
        if (countEl) countEl.textContent = cart.item_count;

        var btn = document.getElementById('jj-start-btn');
        if (btn) {
          btn.classList.toggle('jj-start-btn--has-cart', cart.item_count > 0);
          btn.classList.remove('jj-start-btn--cart-flash');
          // Force reflow so the animation restarts on repeat clicks.
          void btn.offsetWidth;
          if (cart.item_count > 0) {
            btn.classList.add('jj-start-btn--cart-flash');
          }
          setBadgeStrobing(cart.item_count > 0);
        }
        return cart;
      })
      .catch(function () { /* silent */ });
  };
})();
