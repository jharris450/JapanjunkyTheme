/**
 * japanjunky-giftcard.js
 * Gift card page: copy-to-clipboard + print binding. The QR is rendered by
 * Shopify's shopify_gift_card.js (into #QrCode); the visible code is the
 * fallback if that script is unavailable.
 */
(function () {
  'use strict';

  var copyBtn = document.getElementById('jj-giftcard-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var code = copyBtn.getAttribute('data-code') || '';

      function flash() {
        copyBtn.textContent = '[COPIED]';
        setTimeout(function () { copyBtn.textContent = '[COPY]'; }, 1200);
      }

      function legacyCopy() {
        try {
          var ta = document.createElement('textarea');
          ta.value = code;
          ta.setAttribute('readonly', '');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          flash();
        } catch (e) { /* code stays selectable on screen */ }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(flash, legacyCopy);
      } else {
        legacyCopy();
      }
    });
  }

  var printBtn = document.getElementById('jj-giftcard-print');
  if (printBtn) {
    printBtn.addEventListener('click', function () { window.print(); });
  }
})();
