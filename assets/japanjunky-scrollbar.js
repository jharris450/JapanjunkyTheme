/**
 * japanjunky-scrollbar.js
 * Win95-style vertical scrollbar (▲/▼ buttons + draggable thumb) bound to
 * the page's primary scroll container. Mouse enhancement only — native
 * scroll + keyboard still work; the widget is aria-hidden. Auto-hides when
 * there is nothing to scroll or while the splash owns interaction.
 */
(function () {
  'use strict';

  // ─── Resolve the page's primary scroll container ───────────────
  // Homepage (#jj-scroll) is intentionally excluded — its wheel-driven hero
  // scroll has no scrollbar by design.
  var el = document.querySelector('.jj-page') ||
           document.querySelector('.jj-pdp-info');
  if (!el) return; // homepage / login — no in-page scroll container

  var LINE = 40;       // px per arrow nudge
  var REPEAT_MS = 50;  // hold-to-repeat interval
  var MIN_THUMB = 24;  // px

  // Let the CSS hide this container's native scrollbar (no-JS keeps it).
  el.classList.add('jj-has-scrollbar');

  // ─── Build the widget ──────────────────────────────────────────
  var bar = document.createElement('div');
  bar.className = 'jj-scrollbar';
  bar.setAttribute('aria-hidden', 'true');

  var up = document.createElement('button');
  up.className = 'jj-scrollbar__btn jj-scrollbar__btn--up';
  up.type = 'button';
  up.tabIndex = -1;
  up.textContent = '▲';

  var track = document.createElement('div');
  track.className = 'jj-scrollbar__track';

  var thumb = document.createElement('div');
  thumb.className = 'jj-scrollbar__thumb';
  track.appendChild(thumb);

  var down = document.createElement('button');
  down.className = 'jj-scrollbar__btn jj-scrollbar__btn--down';
  down.type = 'button';
  down.tabIndex = -1;
  down.textContent = '▼';

  bar.appendChild(up);
  bar.appendChild(track);
  bar.appendChild(down);
  // Mount inside the barrel-filter wrapper so the bar warps with the rest
  // of the CRT face (on <body> it stayed straight and sat visibly off the
  // curved content edge). The wrapper is viewport-sized, so the bar's
  // position:fixed coordinates are unchanged; it only gains the filter.
  (document.getElementById('jj-crt-content') || document.body).appendChild(bar);

  // ─── Geometry ──────────────────────────────────────────────────
  function maxScroll() { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function trackH() { return track.clientHeight; }
  function clampTop(v) { return Math.max(0, Math.min(maxScroll(), v)); }
  function setTop(v) { el.scrollTop = clampTop(v); }

  // ─── Sync thumb size/position + visibility ─────────────────────
  function sync() {
    var hidden = maxScroll() <= 0 || window.JJ_SPLASH_ACTIVE;
    bar.style.display = hidden ? 'none' : '';
    if (hidden) return;
    var th = Math.max(MIN_THUMB, trackH() * el.clientHeight / el.scrollHeight);
    var travel = trackH() - th;
    var ratio = maxScroll() > 0 ? el.scrollTop / maxScroll() : 0;
    thumb.style.height = th + 'px';
    thumb.style.transform = 'translateY(' + (travel * ratio) + 'px)';
  }

  el.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  // The grid re-render changes inner scrollHeight without resizing the fixed
  // container, so ResizeObserver alone misses it — re-sync on the grid's event.
  document.addEventListener('jj:grid-render', sync);
  if (window.ResizeObserver) {
    new window.ResizeObserver(sync).observe(el); // viewport/layout changes
  }

  // ─── Arrow buttons (click + hold-to-repeat) ────────────────────
  function bindHold(btn, dir) {
    var timer = null;
    function step() { setTop(el.scrollTop + dir * LINE); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      step();
      stop();
      timer = setInterval(step, REPEAT_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (evt) {
      btn.addEventListener(evt, stop);
    });
  }
  bindHold(up, -1);
  bindHold(down, 1);

  // ─── Track click (page jump toward the click) ──────────────────
  track.addEventListener('pointerdown', function (e) {
    if (e.target === thumb) return; // thumb drag handles itself
    var page = el.clientHeight * 0.9;
    var thumbTop = thumb.getBoundingClientRect().top;
    setTop(el.scrollTop + (e.clientY < thumbTop ? -page : page));
  });

  // ─── Thumb drag ────────────────────────────────────────────────
  var dragging = false, startY = 0, startTop = 0;
  thumb.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startTop = el.scrollTop;
    try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
  });
  thumb.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var travel = trackH() - thumb.offsetHeight;
    if (travel <= 0) return;
    setTop(startTop + (e.clientY - startY) * maxScroll() / travel);
  });
  ['pointerup', 'pointercancel'].forEach(function (evt) {
    thumb.addEventListener(evt, function (e) {
      if (!dragging) return;
      dragging = false;
      try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
    });
  });

  // ─── Re-sync once the splash releases control ──────────────────
  if (window.JJ_SPLASH_ACTIVE) {
    var splashWatch = setInterval(function () {
      if (!window.JJ_SPLASH_ACTIVE) { clearInterval(splashWatch); sync(); }
    }, 200);
  }

  // ─── Init ──────────────────────────────────────────────────────
  sync();
  window.addEventListener('load', sync); // final measure after assets/images
})();
