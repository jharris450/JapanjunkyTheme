/**
 * JapanJunky Nav Flash — Same-origin click interceptor.
 * Adds a brief amber wash before navigation to hide reload jank.
 *
 * Skips for: external links, target=_blank, ctrl/cmd-click, anchor #fragments,
 * download attribute, javascript: links, prefers-reduced-motion.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  function ensureOverlay() {
    var el = document.getElementById('jj-page-flash');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'jj-page-flash';
    el.className = 'jj-page-flash';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  function shouldIntercept(a, ev) {
    if (!a || !a.href) return false;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.hasAttribute('data-no-flash')) return false;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (e) { return false; }
    if (url.protocol !== window.location.protocol) return false;
    if (url.hostname !== window.location.hostname) return false;
    // Anchor jumps within same page — skip
    if (url.pathname === window.location.pathname && url.hash) return false;
    return true;
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    while (t && t.nodeType === 1 && t.tagName !== 'A') t = t.parentNode;
    if (!t || t.tagName !== 'A') return;
    if (!shouldIntercept(t, ev)) return;

    ev.preventDefault();

    var overlay = ensureOverlay();
    overlay.classList.add('jj-page-flash--active');

    if (window.JJ_Audio && window.JJ_Audio.playAccent) {
      window.JJ_Audio.playAccent('chime');
    }

    setTimeout(function () {
      window.location = t.href;
    }, 200);
  }, true);
})();
