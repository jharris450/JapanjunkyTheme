/**
 * Japanjunky - Cart Header Sync
 *
 * Exposes window.jjRefreshCart() which fetches /cart.js, updates the
 * header cart count element (#jj-nav-cart-count), and briefly flashes
 * the cart button so successful add-to-cart actions are visible.
 */

(function () {
  'use strict';

  window.jjRefreshCart = function () {
    return fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var countEl = document.getElementById('jj-nav-cart-count');
        if (countEl) countEl.textContent = cart.item_count;

        var btn = document.getElementById('jj-nav-cart');
        if (btn) {
          btn.classList.remove('jj-nav-cart--flash');
          // Force reflow so the animation restarts on repeat clicks.
          void btn.offsetWidth;
          btn.classList.add('jj-nav-cart--flash');
        }
        return cart;
      })
      .catch(function () { /* silent */ });
  };
})();
