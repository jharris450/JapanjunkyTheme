/**
 * japanjunky-product-page.js
 * Product page logic: entrance animations, variant selector,
 * thumbnail strip, add-to-cart, back button transition.
 *
 * Consumes: window.JJ_PRODUCT_DATA (set by jj-product.liquid)
 */
(function () {
  'use strict';

  var data = window.JJ_PRODUCT_DATA;
  if (!data) return;

  // ─── DOM ──────────────────────────────────────────────────────
  var infoPanel = document.getElementById('jj-pdp-info');
  var priceEl = document.getElementById('jj-pdp-price');
  var variantIdInput = document.getElementById('jj-pdp-variant-id');
  var addToCartBtn = document.getElementById('jj-pdp-add-to-cart');
  var cartForm = document.getElementById('jj-pdp-cart-form');
  var variantsContainer = document.getElementById('jj-pdp-variants');
  var thumbsContainer = document.getElementById('jj-pdp-thumbs');
  var backBtn = document.getElementById('jj-pdp-back');

  // ─── Entrance Animation ───────────────────────────────────────
  if (infoPanel) {
    infoPanel.classList.add('jj-pdp-info--entering');
  }
  var viewerWrap = document.getElementById('jj-pdp-viewer');
  if (viewerWrap) {
    viewerWrap.classList.add('jj-pdp-viewer--entering');
  }

  // ─── Variant Selector ─────────────────────────────────────────
  if (variantsContainer) {
    var variantBtns = variantsContainer.querySelectorAll('.jj-pdp-variant-btn');

    for (var i = 0; i < variantBtns.length; i++) {
      variantBtns[i].addEventListener('click', function () {
        var btn = this;
        var vid = btn.getAttribute('data-variant-id');
        var vprice = btn.getAttribute('data-variant-price');
        var vavail = btn.getAttribute('data-variant-available') === 'true';
        var voption1 = btn.getAttribute('data-variant-option1');

        // Update active state
        for (var j = 0; j < variantBtns.length; j++) {
          variantBtns[j].classList.remove('jj-pdp-variant-btn--active');
        }
        btn.classList.add('jj-pdp-variant-btn--active');

        // Update price
        if (priceEl) priceEl.textContent = vprice;

        // Update hidden input
        if (variantIdInput) variantIdInput.value = vid;

        // Update button state
        if (addToCartBtn) {
          addToCartBtn.disabled = !vavail;
          addToCartBtn.textContent = vavail ? '[Add to Cart]' : '[Unavailable]';
        }

        // Update condition in meta + swap color class to match the variant's grade
        var conditionEl = document.getElementById('jj-pdp-condition-value') ||
                          document.querySelector('.jj-pdp-meta .jj-meta-row:last-child .jj-meta-row__value');
        if (conditionEl && voption1) {
          conditionEl.textContent = voption1;
          var newCondClass = btn.getAttribute('data-cond-class') || 'jj-cond-g';
          conditionEl.classList.remove('jj-cond-m', 'jj-cond-nm', 'jj-cond-vg', 'jj-cond-g');
          conditionEl.classList.add(newCondClass);
        }

        // Update URL without reload
        var url = new URL(window.location);
        url.searchParams.set('variant', vid);
        history.replaceState(null, '', url);

        // Dispatch event for product viewer to pick up
        document.dispatchEvent(new CustomEvent('jj:pdp-variant-changed', {
          detail: { variantId: vid, option1: voption1, price: vprice, available: vavail }
        }));
      });
    }
  }

  // ─── Add to Cart (AJAX) ────────────────────────────────────────
  if (cartForm) {
    cartForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (addToCartBtn.disabled) return;

      var vid = variantIdInput ? variantIdInput.value : '';
      if (!vid) return;

      addToCartBtn.textContent = '[Adding...]';
      addToCartBtn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(vid, 10), quantity: 1 })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Cart error');
          return res.json();
        })
        .then(function () {
          addToCartBtn.textContent = '[OK]';
          setTimeout(function () {
            addToCartBtn.textContent = '[Add to Cart]';
            addToCartBtn.disabled = false;
          }, 1500);
          if (window.jjRefreshCart) window.jjRefreshCart();
        })
        .catch(function () {
          addToCartBtn.textContent = '[ERR]';
          setTimeout(function () {
            addToCartBtn.textContent = '[Add to Cart]';
            addToCartBtn.disabled = false;
          }, 1500);
        });
    });
  }

  // ─── Thumbnail Strip ───────────────────────────────────────────
  if (thumbsContainer) {
    var thumbBtns = thumbsContainer.querySelectorAll('.jj-pdp-thumb');

    for (var ti = 0; ti < thumbBtns.length; ti++) {
      thumbBtns[ti].addEventListener('click', function () {
        var btn = this;
        var idx = parseInt(btn.getAttribute('data-thumb-index'), 10);

        // Update active state
        for (var tj = 0; tj < thumbBtns.length; tj++) {
          thumbBtns[tj].classList.remove('jj-pdp-thumb--active');
        }
        btn.classList.add('jj-pdp-thumb--active');

        // Dispatch event for product viewer
        document.dispatchEvent(new CustomEvent('jj:pdp-thumb-selected', {
          detail: { index: idx, imageUrl: btn.getAttribute('data-image-url') }
        }));
      });
    }
  }

  // ─── Back Button ───────────────────────────────────────────────
  if (backBtn) {
    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      // Store flag so homepage knows this is a back navigation
      try { sessionStorage.setItem('jj-back-nav', '1'); } catch (err) {}
      window.location.href = '/';
    });
  }
})();
