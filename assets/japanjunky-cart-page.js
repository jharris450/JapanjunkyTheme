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

  // Shopify-standard money formatter, driven by the shop's money_format
  // (exposed as window.JJ_MONEY_FORMAT). Keeps AJAX-updated totals matching
  // the server-rendered `| money` output (correct currency + separators).
  function formatWithDelimiters(cents, precision, thousands, decimal) {
    precision = (typeof precision === 'undefined') ? 2 : precision;
    thousands = thousands || ',';
    decimal = decimal || '.';
    if (isNaN(cents) || cents == null) return '0';
    var number = (cents / 100.0).toFixed(precision);
    var parts = number.split('.');
    var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
    var rest = parts[1] ? (decimal + parts[1]) : '';
    return dollars + rest;
  }

  function money(cents) {
    var format = window.JJ_MONEY_FORMAT || '${{amount}}';
    var placeholder = /\{\{\s*(\w+)\s*\}\}/;
    var match = format.match(placeholder);
    if (!match) return format;
    var value = '';
    switch (match[1]) {
      case 'amount': value = formatWithDelimiters(cents, 2); break;
      case 'amount_no_decimals': value = formatWithDelimiters(cents, 0); break;
      case 'amount_with_comma_separator': value = formatWithDelimiters(cents, 2, '.', ','); break;
      case 'amount_no_decimals_with_comma_separator': value = formatWithDelimiters(cents, 0, '.', ','); break;
      case 'amount_with_apostrophe_separator': value = formatWithDelimiters(cents, 2, "'", '.'); break;
      default: value = formatWithDelimiters(cents, 2);
    }
    return format.replace(placeholder, value);
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
        // explorer window status bar tracks the live line count
        var objects = document.getElementById('jj-explorer-status-objects');
        if (objects) objects.textContent = cart.item_count + ' object(s)';
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
