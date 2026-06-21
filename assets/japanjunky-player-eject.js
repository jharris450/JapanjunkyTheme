/**
 * japanjunky-player-eject.js
 * When a new song is dropped into an occupied player, the song that was playing
 * is ejected as a small draggable token. Tokens have the same gravity/throw
 * physics as the player and settle on the taskbar. Drag a token back onto the
 * product it came from to absorb it (clear the clutter).
 *
 * Exposes window.JJ_PlayerEject = { eject(product, rect), keyOf(product) }.
 * Depends on window.JJ_PlayerPhysics; window.JJ_MediaFormat (lazy).
 */
(function () {
  'use strict';

  var Physics = window.JJ_PlayerPhysics;
  if (!Physics) return; // physics is required — without it tokens can't move

  var tokens = [];   // active token records
  var rafId = null;
  var lastT = 0;
  var THROW_MAX = 4000;

  // html has zoom — visual px (clientX/innerWidth) -> layout px by dividing.
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  function normFmt(raw) {
    return window.JJ_MediaFormat ? window.JJ_MediaFormat.normalizeFormat(raw) : (raw || '');
  }

  // Stable identity for a product, used to match a token to a card/PDP on drop.
  function keyOf(p) {
    if (!p) return '';
    return [p.audioUrl || '', p.youtubeUrl || '', p.title || '', normFmt(p.format)].join('|');
  }

  // Bounds for the current viewport: floor is the taskbar top, walls are the
  // edges, all inset by the token's own size (matches the player's convention).
  function buildOpts(el) {
    var taskbar = document.querySelector('.jj-taskbar');
    var taskbarH = taskbar ? taskbar.offsetHeight : 32;
    var w = el.offsetWidth || 72;
    var h = el.offsetHeight || 44;
    var vw = window.innerWidth / zoom;
    var vh = window.innerHeight / zoom;
    return {
      gravity: 2600,
      restitution: 0.55,
      friction: 4.0,
      restThreshold: 24,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, vw - w),
        maxY: Math.max(0, vh - taskbarH - h)
      }
    };
  }

  function setPosition(tk) {
    tk.el.style.transform = 'translate(' + tk.body.x + 'px,' + tk.body.y + 'px)';
  }

  function startLoop() {
    if (rafId !== null) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function tick(now) {
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // cap after a tab switch to avoid tunneling

    var anyMoving = false;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.dragging) { anyMoving = true; continue; } // user owns it this frame
      var opts = buildOpts(tk.el);
      tk.body = Physics.step(tk.body, dt, opts);
      setPosition(tk);
      if (!Physics.isAtRest(tk.body, opts)) anyMoving = true;
    }

    if (anyMoving) { rafId = requestAnimationFrame(tick); }
    else { rafId = null; }
  }

  // --- per-token drag ---------------------------------------------------------
  function onPointerDown(tk, e) {
    e.preventDefault();
    e.stopPropagation();
    tk.dragging = true;
    try { tk.el.setPointerCapture(e.pointerId); } catch (err) {}
    var px = e.clientX / zoom, py = e.clientY / zoom;
    tk.grabDX = px - tk.body.x;
    tk.grabDY = py - tk.body.y;
    tk.lastPX = px; tk.lastPY = py; tk.lastPT = performance.now();
    tk.velX = 0; tk.velY = 0;
    tk.el.classList.add('jj-media-token--grabbed');
  }

  function onPointerMove(tk, e) {
    if (!tk.dragging) return;
    var px = e.clientX / zoom, py = e.clientY / zoom;
    var now = performance.now();
    var dt = (now - tk.lastPT) / 1000;
    if (dt > 0) { tk.velX = (px - tk.lastPX) / dt; tk.velY = (py - tk.lastPY) / dt; }
    tk.lastPX = px; tk.lastPY = py; tk.lastPT = now;
    var opts = buildOpts(tk.el);
    tk.body.x = Physics.clamp(px - tk.grabDX, opts.bounds.minX, opts.bounds.maxX);
    tk.body.y = Physics.clamp(py - tk.grabDY, opts.bounds.minY, opts.bounds.maxY);
    setPosition(tk);
  }

  // Resolve the product key under a screen point, with the token hidden so it
  // doesn't shadow the hit-test. Returns '' when nothing matchable is there.
  function productKeyUnder(tk, clientX, clientY) {
    var prevPE = tk.el.style.pointerEvents;
    tk.el.style.pointerEvents = 'none';
    var target = document.elementFromPoint(clientX, clientY);
    tk.el.style.pointerEvents = prevPE;
    if (!target || !target.closest) return '';
    var card = target.closest('.jj-grid__card');
    if (card) {
      var t = card.querySelector('.jj-grid__card-title');
      return keyOf({
        format: card.getAttribute('data-format'),
        title: t ? t.textContent : '',
        audioUrl: card.getAttribute('data-audio-url') || '',
        youtubeUrl: card.getAttribute('data-youtube-url') || ''
      });
    }
    var info = target.closest('#jj-pdp-info');
    if (info && window.JJ_PRODUCT_DATA) {
      var d = window.JJ_PRODUCT_DATA;
      return keyOf({
        format: d.formatLabel, title: d.title || '',
        audioUrl: d.audioUrl || '', youtubeUrl: d.youtubeUrl || ''
      });
    }
    return '';
  }

  function overPlayer(clientX, clientY) {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return false;
    var r = window.JJ_Player.getRect();
    return !!r && clientX >= r.left && clientX <= r.right &&
                  clientY >= r.top && clientY <= r.bottom;
  }

  function endDrag(tk, e, cancelled) {
    tk.dragging = false;
    try { tk.el.releasePointerCapture(e.pointerId); } catch (err) {}
    tk.el.classList.remove('jj-media-token--grabbed');

    // Dropped back onto the player — load it to play again. (A song already in
    // the player gets ejected by tryLoadProduct, same as a normal drop.)
    if (!cancelled && overPlayer(e.clientX, e.clientY)) {
      if (window.JJ_Player.tryLoadProduct(tk.product) === 'accepted') {
        dismiss(tk);
        return;
      }
      // rejected / no player — fall through and let it drop.
    }

    if (!cancelled && productKeyUnder(tk, e.clientX, e.clientY) === tk.key) {
      dismiss(tk); // dropped onto its own product — absorb it
      return;
    }
    // Otherwise let it fly / fall.
    tk.body.vx = cancelled ? 0 : Physics.clamp(tk.velX, -THROW_MAX, THROW_MAX);
    tk.body.vy = cancelled ? 0 : Physics.clamp(tk.velY, -THROW_MAX, THROW_MAX);
    startLoop();
  }

  function dismiss(tk) {
    var i = tokens.indexOf(tk);
    if (i >= 0) tokens.splice(i, 1);
    tk.el.classList.add('jj-media-token--dismiss');
    setTimeout(function () {
      if (tk.el.parentNode) tk.el.parentNode.removeChild(tk.el);
    }, 240); // matches the dismiss animation
  }

  // --- public -----------------------------------------------------------------
  // Spawn a draggable token for `product`, popping out from `rect` (the player's
  // bounding rect in visual px, or null to drop from the top-right).
  function eject(product, rect) {
    if (!product) return;
    var fmt = normFmt(product.format);

    // Only one token per product — drop any existing token for this song first
    // so re-loading/popping the same product can't pile up duplicates.
    var key = keyOf(product);
    for (var di = tokens.length - 1; di >= 0; di--) {
      if (tokens[di].key === key) {
        var dup = tokens.splice(di, 1)[0];
        if (dup.el.parentNode) dup.el.parentNode.removeChild(dup.el);
      }
    }

    var el = document.createElement('div');
    el.className = 'jj-media-token';
    el.setAttribute('data-format', fmt);
    var fmtEl = document.createElement('span');
    fmtEl.className = 'jj-media-token__fmt';
    fmtEl.textContent = (fmt || '?').toUpperCase();
    var titleEl = document.createElement('span');
    titleEl.className = 'jj-media-token__title';
    titleEl.textContent = product.title || '';
    el.appendChild(fmtEl);
    el.appendChild(titleEl);
    document.body.appendChild(el);

    // Spawn at the player's position (layout px), or top-right if unknown.
    var w = el.offsetWidth || 72, h = el.offsetHeight || 44;
    var startX, startY;
    if (rect) { startX = rect.left / zoom; startY = rect.top / zoom; }
    else { startX = (window.innerWidth / zoom) - w - 8; startY = 8; }
    var opts = buildOpts(el);
    var tk = {
      el: el, product: product, key: keyOf(product), dragging: false,
      grabDX: 0, grabDY: 0, lastPX: 0, lastPY: 0, lastPT: 0, velX: 0, velY: 0,
      body: {
        x: Physics.clamp(startX, opts.bounds.minX, opts.bounds.maxX),
        y: Physics.clamp(startY, opts.bounds.minY, opts.bounds.maxY),
        // a little upward+sideways pop so it visibly ejects from the player
        vx: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 140),
        vy: -560
      }
    };
    setPosition(tk);

    el.addEventListener('pointerdown', function (e) { onPointerDown(tk, e); });
    el.addEventListener('pointermove', function (e) { onPointerMove(tk, e); });
    el.addEventListener('pointerup', function (e) { endDrag(tk, e, false); });
    el.addEventListener('pointercancel', function (e) { endDrag(tk, e, true); });

    tokens.push(tk);
    startLoop();
  }

  window.addEventListener('resize', function () {
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    if (tokens.length) startLoop();
  });

  window.JJ_PlayerEject = { eject: eject, keyOf: keyOf };
})();
