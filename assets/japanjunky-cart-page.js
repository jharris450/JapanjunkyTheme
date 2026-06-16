/**
 * japanjunky-cart-page.js
 * Progressive enhancement for the cart page. Without it the form POSTs to
 * /cart normally. With it, qty steppers/inputs and remove links update via
 * /cart/change.js and re-render line totals + subtotal, keeping the
 * start-menu badge in sync via window.jjRefreshCart().
 */
(function () {
  'use strict';

  var form = document.getElementById('jj-cart-form');
  if (!form) return;

  function money(cents) {
    return (window.Shopify && Shopify.formatMoney)
      ? Shopify.formatMoney(cents)
      : '$' + (cents / 100).toFixed(2);
  }

  function changeLine(key, quantity, row) {
    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: key, quantity: quantity })
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        if (quantity === 0 && row) {
          row.parentNode.removeChild(row);
        } else if (row) {
          var match = null;
          for (var i = 0; i < cart.items.length; i++) {
            if (cart.items[i].key === key) { match = cart.items[i]; break; }
          }
          if (match) {
            var lt = row.querySelector('.jj-cart__line-total');
            if (lt) lt.textContent = money(match.final_line_price);
          }
        }
        var sub = document.getElementById('jj-cart-subtotal');
        if (sub) sub.textContent = money(cart.total_price);
        if (window.jjRefreshCart) window.jjRefreshCart();
        if (cart.item_count === 0) window.location.reload();
      })
      .catch(function () { form.submit(); });
  }

  form.addEventListener('click', function (e) {
    var step = e.target.closest('.jj-cart__step');
    if (step) {
      e.preventDefault();
      var row = step.closest('.jj-cart__item');
      var input = row.querySelector('.jj-cart__qty-input');
      var next = Math.max(0, parseInt(input.value, 10) + parseInt(step.getAttribute('data-step'), 10));
      input.value = next;
      changeLine(row.getAttribute('data-key'), next, row);
      return;
    }
    var remove = e.target.closest('.jj-cart__remove');
    if (remove) {
      e.preventDefault();
      var rrow = remove.closest('.jj-cart__item');
      changeLine(rrow.getAttribute('data-key'), 0, rrow);
    }
  });

  form.addEventListener('change', function (e) {
    var input = e.target.closest('.jj-cart__qty-input');
    if (!input) return;
    var row = input.closest('.jj-cart__item');
    var qty = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = qty;
    changeLine(row.getAttribute('data-key'), qty, row);
  });
})();
