/**
 * japanjunky-media-drag.js
 * Hold-drag a product (grid card or PDP info column) onto the spawned player.
 * Shows a placeholder ghost following the cursor; on release over the player it
 * calls JJ_Player.tryLoadProduct. The 3D ghost graphics arrive with Tranche 3.
 *
 * Depends on window.JJ_Player (lazy) and window.JJ_MediaFormat (lazy).
 */
(function () {
  'use strict';

  var DRAG_THRESHOLD = 6; // layout px of movement before a press becomes a drag
  // Controls/links inside a draggable source that must keep their own behavior.
  var EXCLUDE = 'button, input, select, textarea, .jj-grid__card-cond-chip, .jj-pdp-back';

  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var pending = null; // { x, y, prod, srcEl }
  var dragging = false;
  var product = null;
  var ghost = null;

  function normFmt(raw) {
    return window.JJ_MediaFormat ? window.JJ_MediaFormat.normalizeFormat(raw) : (raw || '');
  }

  // Resolve the product being dragged from the pointer target, or null.
  function getProductAt(target) {
    if (!target || !target.closest) return null;
    var card = target.closest('.jj-grid__card');
    if (card) {
      var t = card.querySelector('.jj-grid__card-title');
      return {
        format: normFmt(card.getAttribute('data-format')),
        title: t ? t.textContent : '',
        srcEl: card
      };
    }
    var info = target.closest('#jj-pdp-info');
    if (info && window.JJ_PRODUCT_DATA) {
      return {
        format: normFmt(window.JJ_PRODUCT_DATA.formatLabel),
        title: window.JJ_PRODUCT_DATA.title || '',
        srcEl: info
      };
    }
    return null;
  }

  function createGhost(fmt) {
    ghost = document.createElement('div');
    ghost.className = 'jj-media-ghost';
    ghost.setAttribute('data-format', fmt || '');
    ghost.textContent = (fmt || '?').toUpperCase();
    document.body.appendChild(ghost);
  }

  function moveGhost(clientX, clientY) {
    if (!ghost) return;
    ghost.style.transform = 'translate(' + (clientX / zoom) + 'px,' + (clientY / zoom) + 'px)';
  }

  function removeGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  }

  function dropOnPlayer(clientX, clientY) {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return;
    var r = window.JJ_Player.getRect();
    if (!r) return;
    if (clientX >= r.left && clientX <= r.right &&
        clientY >= r.top && clientY <= r.bottom) {
      window.JJ_Player.tryLoadProduct(product);
    }
  }

  // After a drag, swallow the click the browser fires on the source (so an
  // <a> card doesn't navigate). Self-removes after the click or a short delay.
  function suppressNextClick(srcEl) {
    if (!srcEl) return;
    function handler(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      srcEl.removeEventListener('click', handler, true);
    }
    srcEl.addEventListener('click', handler, true);
    setTimeout(function () { srcEl.removeEventListener('click', handler, true); }, 400);
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // primary button only
    if (e.target.closest(EXCLUDE)) return;
    var prod = getProductAt(e.target);
    if (!prod) return;
    pending = { x: e.clientX, y: e.clientY, prod: prod, srcEl: prod.srcEl };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!pending) return;
    if (!dragging) {
      var dx = (e.clientX - pending.x) / zoom;
      var dy = (e.clientY - pending.y) / zoom;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      dragging = true;
      product = pending.prod;
      createGhost(product.format);
    }
    moveGhost(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (dragging) {
      removeGhost();
      dropOnPlayer(e.clientX, e.clientY);
      suppressNextClick(pending.srcEl); // a drag never navigates
    }
    dragging = false;
    pending = null;
    product = null;
  }

  document.addEventListener('pointerdown', onPointerDown);

  // Block the browser's native link/image drag-and-drop on our sources so it
  // can't hijack the gesture.
  document.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('.jj-grid__card, #jj-pdp-info')) {
      e.preventDefault();
    }
  });

  window.addEventListener('resize', function () {
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  });
})();
