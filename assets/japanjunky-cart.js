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
  // Cycles the phosphor palette over the pixel cart icons (fill:
  // currentColor, so an inline style.color snap recolors the sprite),
  // same wall-clock-hold approach as the grid price strobe. The old
  // rotating currency glyphs (¥ $ € £ ₩) are gone — the icon stays a
  // cart, only the color flashes.
  var COLORS = ['#e8313a', '#00e5e5', '#f5d742', '#e040e0', '#33ff33', '#ffaa00'];
  var HOLD_MS = 55;
  var strobeRaf = null;
  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Taskbar badge cart + the start menu cart row's icon strobe in sync
  function strobeTargets() {
    var els = [];
    var badge = document.querySelector('#jj-start-btn-cart-badge .jj-start-btn__cart-svg');
    var menuIcon = document.querySelector('.jj-start-menu__cart-icon');
    if (badge) els.push(badge);
    if (menuIcon) els.push(menuIcon);
    return els;
  }

  function setBadgeStrobing(on) {
    var els = strobeTargets();
    if (!els.length) return;
    if (!on || reducedMotion) {
      if (strobeRaf) {
        cancelAnimationFrame(strobeRaf);
        strobeRaf = null;
      }
      for (var i = 0; i < els.length; i++) {
        els[i].style.color = ''; // back to CSS colors (badge gold / menu grey)
      }
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
      var color = COLORS[idx % COLORS.length];
      for (var i = 0; i < els.length; i++) {
        els[i].style.color = color;
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

        var mtabCount = document.getElementById('jj-mtab-cart-count');
        if (mtabCount) mtabCount.textContent = cart.item_count > 0 ? String(cart.item_count) : '';

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
