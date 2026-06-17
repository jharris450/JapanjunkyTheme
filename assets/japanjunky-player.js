/**
 * japanjunky-player.js
 * The single toolbox media player. Tranche 2: a placeholder box with gravity,
 * edge bounce, and settling on the taskbar. Drag/throw and persistence are
 * layered on in later tasks. The 3D model visual is Tranche 3.
 *
 * Exposes window.JJ_Player. Depends on window.JJ_PlayerPhysics.
 */
(function () {
  'use strict';

  var Physics = window.JJ_PlayerPhysics;
  var el = null;          // the player container element
  var currentTool = null; // 'record' | 'cassette' | 'cd' | null
  var body = null;        // { x, y, vx, vy } in layout px
  var rafId = null;
  var lastT = 0;
  var dragging = false;
  var grabDX = 0, grabDY = 0;   // cursor-to-topleft offset at grab (layout px)
  var lastPX = 0, lastPY = 0;   // last pointer pos (layout px) for velocity
  var lastPT = 0;               // last pointer time (ms)
  var velX = 0, velY = 0;       // tracked drag velocity (layout px/s)
  var THROW_MAX = 4000;         // clamp thrown speed (layout px/s)
  var STORE_KEY = 'jj-player';

  // html has zoom:2.5 — visual px (clientX, innerWidth) convert to layout px
  // (offsetWidth, transform) by dividing by this. Re-read on resize.
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  function setPosition(x, y) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  // Build the physics options for the current viewport. Sizes from offsetWidth
  // (layout px); viewport from innerWidth/zoom (visual -> layout); floor is the
  // taskbar top.
  function buildOpts() {
    var taskbar = document.querySelector('.jj-taskbar');
    var taskbarH = taskbar ? taskbar.offsetHeight : 32;
    var w = el.offsetWidth || 96;
    var h = el.offsetHeight || 96;
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

  function startLoop() {
    if (rafId !== null) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // cap after tab switch to avoid tunneling
    var opts = buildOpts();
    body = Physics.step(body, dt, opts);
    setPosition(body.x, body.y);
    if (Physics.isAtRest(body, opts)) {
      stopLoop();
      save();
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    var px = e.clientX / zoom;
    var py = e.clientY / zoom;
    grabDX = px - body.x;
    grabDY = py - body.y;
    lastPX = px; lastPY = py; lastPT = performance.now();
    velX = 0; velY = 0;
    stopLoop();
    el.classList.add('jj-player--grabbed');
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    var px = e.clientX / zoom;
    var py = e.clientY / zoom;
    var now = performance.now();
    var dt = (now - lastPT) / 1000;
    if (dt > 0) {
      velX = (px - lastPX) / dt;
      velY = (py - lastPY) / dt;
    }
    lastPX = px; lastPY = py; lastPT = now;
    var opts = buildOpts();
    body.x = Physics.clamp(px - grabDX, opts.bounds.minX, opts.bounds.maxX);
    body.y = Physics.clamp(py - grabDY, opts.bounds.minY, opts.bounds.maxY);
    setPosition(body.x, body.y);
  }

  function onPointerUp(e) {
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    el.classList.remove('jj-player--grabbed');
    body.vx = Physics.clamp(velX, -THROW_MAX, THROW_MAX);
    body.vy = Physics.clamp(velY, -THROW_MAX, THROW_MAX);
    startLoop();
  }

  function onPointerCancel(e) {
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    el.classList.remove('jj-player--grabbed');
    body.vx = 0;
    body.vy = 0;
    startLoop();
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    var label = document.createElement('span');
    label.className = 'jj-player__label';
    label.textContent = tool;
    el.appendChild(label);
    document.body.appendChild(el);
    el.addEventListener('pointerdown', onPointerDown);

    var opts = buildOpts();
    body = {
      x: Physics.clamp(x, opts.bounds.minX, opts.bounds.maxX),
      y: Physics.clamp(y, opts.bounds.minY, opts.bounds.maxY),
      vx: 0,
      vy: 0
    };
    setPosition(body.x, body.y);
    startLoop();
    save();
  }

  function despawn() {
    stopLoop();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    body = null;
    currentTool = null;
    clearSaved();
  }

  window.addEventListener('resize', function () {
    if (!el) return;
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var opts = buildOpts();
    body.x = Physics.clamp(body.x, opts.bounds.minX, opts.bounds.maxX);
    body.y = Physics.clamp(body.y, opts.bounds.minY, opts.bounds.maxY);
    setPosition(body.x, body.y);
    if (!dragging) startLoop(); // don't hijack the body with physics mid-drag
  });

  function save() {
    try {
      if (!currentTool || !body) return;
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        tool: currentTool, x: body.x, y: body.y
      }));
    } catch (e) { /* sessionStorage unavailable — ignore */ }
  }

  function clearSaved() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.tool) {
        var rx = (typeof s.x === 'number' && isFinite(s.x)) ? s.x : 0;
        var ry = (typeof s.y === 'number' && isFinite(s.y)) ? s.y : 0;
        spawn(s.tool, rx, ry);
      }
    } catch (e) { /* malformed — ignore */ }
  }

  // Player's on-screen rectangle in VISUAL px (getBoundingClientRect), for the
  // drag system to hit-test a drop. Returns null when no player is spawned.
  function getRect() {
    return el ? el.getBoundingClientRect() : null;
  }

  // Briefly toggle a CSS class to play a one-shot feedback animation. Uses a
  // reflow to restart the animation if the class is still applied. The class
  // must not animate `transform` (the physics loop owns el's transform).
  function flashClass(cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { if (el) el.classList.remove(cls); }, 600);
  }

  // Try to load a dropped product. Format gate: a product only plays on its
  // matching player. Tranche 4 stubs audio — accept = visual confirm only;
  // Tranche 5 routes the accept path to the audio engine.
  // Returns 'no-player' | 'rejected' | 'accepted'.
  function tryLoadProduct(product) {
    if (!el || !currentTool) return 'no-player';
    var fmt = product && product.format;
    var MF = window.JJ_MediaFormat;
    if (!MF || !MF.matchesPlayer(currentTool, fmt)) {
      // Reject: shove the player (physics impulse) + red flash.
      if (body) {
        body.vy = -700;
        body.vx = (body.vx || 0) + (Math.random() < 0.5 ? -260 : 260);
      }
      startLoop();
      flashClass('jj-player--reject');
      return 'rejected';
    }
    // Accept: green flash. (Audio is wired in Tranche 5.)
    flashClass('jj-player--accept');
    return 'accepted';
  }

  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; },
    getRect: getRect,
    tryLoadProduct: tryLoadProduct
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }
})();
