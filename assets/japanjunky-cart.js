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

  window.jjRefreshCart = function () {
    return fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var countEl = document.getElementById('jj-nav-cart-count');
        if (countEl) countEl.textContent = cart.item_count;

        var btn = document.getElementById('jj-start-btn');
        if (btn) {
          btn.classList.remove('jj-start-btn--cart-flash');
          // Force reflow so the animation restarts on repeat clicks.
          void btn.offsetWidth;
          btn.classList.add('jj-start-btn--cart-flash');
        }
        return cart;
      })
      .catch(function () { /* silent */ });
  };
})();
