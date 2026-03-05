/**
 * Japanjunky - Product Select (AJAX detail pane)
 *
 * Click handler on product grid cards.
 * Fetches /products/{handle}.js via AJAX.
 * Renders detail into right column pane.
 */

(function () {
  'use strict';

  var grid = document.getElementById('jj-product-grid');
  var detailContent = document.getElementById('jj-detail-content');
  var detailTitleBar = document.getElementById('jj-detail-title-bar');

  if (!grid || !detailContent) return;

  // Delegate click events on the product grid
  grid.addEventListener('click', function (e) {
    var card = e.target.closest('[data-product-handle]');
    if (!card) return;

    var handle = card.getAttribute('data-product-handle');
    if (!handle) return;

    // Highlight selected card
    var allCards = grid.querySelectorAll('.jj-product-card');
    allCards.forEach(function (c) { c.classList.remove('jj-product-card--selected'); });
    card.classList.add('jj-product-card--selected');

    // Show loading state
    detailContent.innerHTML = '<div class="jj-detail-pane__empty"><p>Loading...</p></div>';
    if (detailTitleBar) detailTitleBar.textContent = 'Loading...';

    // Fetch product data
    fetch('/products/' + handle + '.js')
      .then(function (res) {
        if (!res.ok) throw new Error('Product not found');
        return res.json();
      })
      .then(function (product) {
        renderProductDetail(product);
      })
      .catch(function () {
        detailContent.innerHTML =
          '<div class="jj-detail-pane__empty"><p style="color:var(--jj-primary);">Error loading product</p></div>';
        if (detailTitleBar) detailTitleBar.textContent = 'Error';
      });
  });

  // Handle keyboard activation
  grid.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var card = e.target.closest('[data-product-handle]');
      if (card) {
        e.preventDefault();
        card.click();
      }
    }
  });

  function renderProductDetail(product) {
    if (detailTitleBar) {
      detailTitleBar.textContent = product.title;
    }

    var imageHtml = '';
    if (product.featured_image) {
      imageHtml =
        '<div class="jj-detail__image jj-ascii-img-frame">' +
          '<img src="' + getSizedImageUrl(product.featured_image, '480x480') + '" ' +
            'alt="' + escapeHtml(product.title) + '" width="480" height="480">' +
        '</div>';
    }

    var priceHtml = '<div class="jj-detail__price">' + formatMoney(product.price);
    if (product.compare_at_price && product.compare_at_price > product.price) {
      priceHtml += ' <span class="jj-detail__price--compare">' + formatMoney(product.compare_at_price) + '</span>';
    }
    priceHtml += '</div>';

    var variantsHtml = '';
    if (product.variants && product.variants.length > 1) {
      variantsHtml = '<div class="jj-detail__variants">' +
        '<select class="jj-detail__variant-select" id="jj-variant-select">';
      product.variants.forEach(function (v) {
        var available = v.available ? '' : ' (Sold Out)';
        variantsHtml += '<option value="' + v.id + '"' + (v.available ? '' : ' disabled') + '>' +
          escapeHtml(v.title) + available + ' - ' + formatMoney(v.price) +
          '</option>';
      });
      variantsHtml += '</select></div>';
    }

    var firstAvailable = product.variants ? product.variants.find(function (v) { return v.available; }) : null;
    var variantId = firstAvailable ? firstAvailable.id : (product.variants && product.variants[0] ? product.variants[0].id : '');
    var soldOut = !firstAvailable;

    var addBtnHtml =
      '<form action="/cart/add" method="post" class="jj-detail__add-form">' +
        '<input type="hidden" name="id" value="' + variantId + '" id="jj-variant-id">' +
        '<div class="jj-detail__qty">' +
          '<label for="jj-qty">Qty:</label>' +
          '<input type="number" id="jj-qty" name="quantity" value="1" min="1" max="99" class="jj-detail__qty-input">' +
        '</div>' +
        '<button type="submit" class="jj-detail__add-btn"' + (soldOut ? ' disabled' : '') + '>' +
          (soldOut ? 'Sold Out' : 'Add to Cart') +
        '</button>' +
      '</form>';

    var descHtml = '';
    if (product.description) {
      descHtml = '<div class="jj-detail__description">' + product.description + '</div>';
    }

    var viewLink = '<a href="/products/' + product.handle + '" class="jj-detail__view-link">[ View Full Page → ]</a>';

    detailContent.innerHTML =
      imageHtml +
      '<div class="jj-detail__title">' + escapeHtml(product.title) + '</div>' +
      priceHtml +
      '<div class="jj-ascii-divider">═══════════════════</div>' +
      variantsHtml +
      addBtnHtml +
      '<div class="jj-ascii-divider" style="margin:8px 0;">═══════════════════</div>' +
      descHtml +
      viewLink;

    // Variant select change handler
    var variantSelect = document.getElementById('jj-variant-select');
    if (variantSelect) {
      variantSelect.addEventListener('change', function () {
        var selectedVariant = product.variants.find(function (v) {
          return v.id === parseInt(variantSelect.value, 10);
        });
        if (selectedVariant) {
          document.getElementById('jj-variant-id').value = selectedVariant.id;
          var addBtn = detailContent.querySelector('.jj-detail__add-btn');
          if (addBtn) {
            addBtn.disabled = !selectedVariant.available;
            addBtn.textContent = selectedVariant.available ? 'Add to Cart' : 'Sold Out';
          }
        }
      });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  function formatMoney(cents) {
    // Uses shop's money format if available, otherwise default
    var amount = (cents / 100).toFixed(2);
    if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
      return window.Shopify.currency.active + amount;
    }
    return '$' + amount;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function getSizedImageUrl(src, size) {
    if (!src) return '';
    // Shopify image URL sizing: insert _SIZExSIZE before extension
    return src.replace(/\.(jpg|jpeg|png|gif|webp)/, '_' + size + '.$1');
  }
})();
