/**
 * japanjunky-watchlist.js
 * Toggles a product on/off the logged-in customer's server-side watchlist
 * (custom.watchlist metafield) via the /apps/watchlist App Proxy. Optimistic UI
 * with revert on failure. Guests are routed to login.
 *
 * Binds any element with [data-watch] and a data-product-id. On a page that
 * lists the watchlist, a button with [data-watch-remove-row] removes its row
 * (closest [data-watch-item]) once an unwatch is confirmed.
 */
(function () {
  'use strict';

  var ENDPOINT = '/apps/watchlist';

  function setState(btn, watched) {
    btn.classList.toggle('jj-watch-btn--active', watched);
    btn.setAttribute('aria-pressed', watched ? 'true' : 'false');
    btn.title = watched ? 'Remove from watchlist' : 'Add to watchlist';
    var glyph = btn.querySelector('.jj-watch-btn__glyph');
    var label = btn.querySelector('.jj-watch-btn__label');
    if (glyph) glyph.innerHTML = watched ? '★' : '☆'; // ★ / ☆
    // Don't relabel the watchlist-page remove buttons — their row goes away.
    if (label && !btn.hasAttribute('data-watch-remove-row')) {
      label.textContent = watched ? 'Watching' : 'Watch';
    }
  }

  function removeRow(btn) {
    var row = btn.closest ? btn.closest('[data-watch-item]') : null;
    if (!row) return;
    row.classList.add('jj-watchlist__item--removing');
    setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 220);
  }

  function onClick(e) {
    var btn = e.currentTarget;
    if (btn.getAttribute('data-guest') === 'true') {
      window.location.href = '/account/login';
      return;
    }
    if (btn.disabled) return;

    var id = btn.getAttribute('data-product-id');
    if (!id) return;
    var willWatch = !btn.classList.contains('jj-watch-btn--active');

    setState(btn, willWatch); // optimistic
    btn.disabled = true;

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, action: 'toggle' })
    }).then(function (r) {
      if (r.status === 401) { window.location.href = '/account/login'; throw new Error('auth'); }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) {
      var watched = !!d.watched;
      setState(btn, watched);
      if (!watched && btn.hasAttribute('data-watch-remove-row')) removeRow(btn);
      btn.disabled = false;
    }).catch(function (err) {
      if (err && err.message === 'auth') return; // navigating away
      setState(btn, !willWatch); // revert
      btn.disabled = false;
    });
  }

  function bind(root) {
    var btns = (root || document).querySelectorAll('[data-watch]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].__jjWatchBound) continue;
      btns[i].__jjWatchBound = true;
      btns[i].addEventListener('click', onClick);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); });
  } else {
    bind();
  }

  window.JJ_Watchlist = { bind: bind };
})();
