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

  // Handheld: players are desktop-only and hold-drag would fight touch
  // scrolling — the whole module stands down.
  if (window.JJ_MOBILE) return;

  var DRAG_THRESHOLD = 6; // layout px of movement before a press becomes a drag
  // Controls/links inside a draggable source that must keep their own behavior.
  var EXCLUDE = 'button, input, select, textarea, .jj-grid__card-cond-chip, .jj-pdp-back';

  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  var pending = null;   // { x, y, prod }  — prod = { format, title, srcEl }
  var dragging = false;
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
        audioUrl: card.getAttribute('data-audio-url') || '',
        youtubeUrl: card.getAttribute('data-youtube-url') || '',
        labelUrl: card.getAttribute('data-label-url') || '',
        bpm: parseFloat(card.getAttribute('data-bpm')) || 0,
        srcEl: card
      };
    }
    var info = target.closest('#jj-pdp-info');
    if (info && window.JJ_PRODUCT_DATA) {
      return {
        format: normFmt(window.JJ_PRODUCT_DATA.formatLabel),
        title: window.JJ_PRODUCT_DATA.title || '',
        audioUrl: window.JJ_PRODUCT_DATA.audioUrl || '',
        youtubeUrl: window.JJ_PRODUCT_DATA.youtubeUrl || '',
        labelUrl: (window.JJ_PRODUCT_DATA.images && window.JJ_PRODUCT_DATA.images[2]) || '',
        bpm: window.JJ_PRODUCT_DATA.bpm || 0,
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

  function dropOnPlayer(clientX, clientY, prod) {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return;
    var r = window.JJ_Player.getRect();
    if (!r) return;
    if (clientX >= r.left && clientX <= r.right &&
        clientY >= r.top && clientY <= r.bottom) {
      window.JJ_Player.tryLoadProduct(prod);
    }
  }

  // After a drag, swallow the synthetic click the browser fires on the source
  // (so an <a> card doesn't navigate). Self-removes on that click, or shortly
  // after — kept brief so a later legitimate click isn't swallowed.
  function suppressNextClick(srcEl) {
    if (!srcEl) return;
    function handler(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      srcEl.removeEventListener('click', handler, true);
    }
    srcEl.addEventListener('click', handler, true);
    setTimeout(function () { srcEl.removeEventListener('click', handler, true); }, 120);
  }

  function cleanupDrag() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    dragging = false;
    pending = null;
  }

  function onPointerDown(e) {
    if (pending) return; // re-entrant guard: ignore extra pointers mid-drag
    if (e.button !== undefined && e.button !== 0) return; // primary button only
    if (e.target.closest(EXCLUDE)) return;
    var prod = getProductAt(e.target);
    if (!prod) return;
    pending = { x: e.clientX, y: e.clientY, prod: prod };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e) {
    if (!pending) return;
    if (!dragging) {
      var dx = (e.clientX - pending.x) / zoom;
      var dy = (e.clientY - pending.y) / zoom;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      dragging = true;
      createGhost(pending.prod.format);
    }
    moveGhost(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    var wasDragging = dragging;
    var prod = pending ? pending.prod : null;
    cleanupDrag();
    if (wasDragging) {
      removeGhost();
      if (prod) {
        dropOnPlayer(e.clientX, e.clientY, prod);
        suppressNextClick(prod.srcEl); // a drag never navigates
      }
    }
  }

  function onPointerCancel() {
    removeGhost();
    cleanupDrag();
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
