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
  var flashTimer = null;
  var model = null;       // { group, setOpen, setPlaying, update } or null
  var modelRenderer = null, modelScene = null, modelCamera = null, modelRaf = null;
  var lidT = 0, lidTarget = 0; // current/target open fraction for the tween
  var insertBeatTimer = null;
  var loadedProduct = null; // the product currently playing (for eject-on-replace)

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

  function mountModel(tool) {
    // Only the cassette model exists today; others keep the placeholder label.
    if (tool !== 'cassette') return false;
    if (typeof THREE === 'undefined' || !window.JJ_CassetteModel) return false;
    var canvas = document.createElement('canvas');
    canvas.className = 'jj-player__canvas';
    canvas.width = 96; canvas.height = 96;
    el.appendChild(canvas);
    try {
      modelRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
      modelRenderer.setClearColor(0x000000, 0);
      modelScene = new THREE.Scene();
      modelCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      modelCamera.position.set(0.45, 0.25, 3.1);
      modelCamera.lookAt(0, 0, 0);
      var tex = function (n) {
        return (window.JJ_CASSETTE_TEX && window.JJ_CASSETTE_TEX[n]) ||
               (console.error('[CassetteModel] missing texture key:', n), n);
      };
      model = window.JJ_CassetteModel.build(THREE, tex);
      modelScene.add(model.group);
      el.classList.add('jj-player--model');
    } catch (e) {
      unmountModel();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return false;
    }
    var last = performance.now();
    function render(now) {
      modelRaf = requestAnimationFrame(render);
      var dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      // ease the lid toward its target
      // lidTarget is always exactly 0 or 1; the clamps below land on exact values, so === terminates.
      if (lidT !== lidTarget) {
        var step = dt / 0.5; // ~0.5s open/close
        if (lidT < lidTarget) lidT = Math.min(lidTarget, lidT + step);
        else lidT = Math.max(lidTarget, lidT - step);
        model.setOpen(lidT);
      }
      model.group.rotation.y += dt * 0.4; // gentle idle spin
      model.update(dt);
      modelRenderer.render(modelScene, modelCamera);
    }
    modelRaf = requestAnimationFrame(render);
    return true;
  }

  function unmountModel() {
    clearTimeout(insertBeatTimer); insertBeatTimer = null;
    if (modelRaf !== null) { cancelAnimationFrame(modelRaf); modelRaf = null; }
    if (model && model.dispose) { try { model.dispose(); } catch (e) {} }
    if (modelRenderer) { try { modelRenderer.dispose(); } catch (e) {} }
    model = null; modelRenderer = null; modelScene = null; modelCamera = null;
    lidT = 0; lidTarget = 0;
  }

  // open -> brief hold -> close, used as the "insert tape" beat on accept
  function playInsertBeat() {
    if (!model) return;
    clearTimeout(insertBeatTimer);
    lidTarget = 1;
    insertBeatTimer = setTimeout(function () { lidTarget = 0; }, 650);
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    document.body.appendChild(el);
    if (!mountModel(tool)) {
      var label = document.createElement('span');
      label.className = 'jj-player__label';
      label.textContent = tool;
      el.appendChild(label);
    }
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('dblclick', popOutLoaded);

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
    unmountModel();
    if (window.JJ_PlayerAudio) window.JJ_PlayerAudio.stop();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    body = null;
    currentTool = null;
    loadedProduct = null;
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
    clearTimeout(flashTimer);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    flashTimer = setTimeout(function () { if (el) el.classList.remove(cls); }, 600);
  }

  // Try to load a dropped product. Format gate: a product only plays on its
  // matching player. Tranche 4 stubs audio — accept = visual confirm only;
  // Tranche 5 routes the accept path to the audio engine.
  // Returns 'no-player' | 'rejected' | 'accepted'.
  function rejectBounce() {
    if (body) {
      body.vy = -700;
      body.vx = (Math.random() < 0.5 ? -260 : 260); // overwrite, don't accumulate
    }
    if (!dragging) startLoop(); // don't fight a user drag in progress
    flashClass('jj-player--reject');
  }

  function tryLoadProduct(product) {
    if (!el || !currentTool) return 'no-player';
    var MF = window.JJ_MediaFormat;
    if (!MF) return 'no-player'; // format module not loaded — silently no-op
    var fmt = product && product.format;
    if (!MF.matchesPlayer(currentTool, fmt)) {
      rejectBounce();
      return 'rejected';
    }
    // One copy per song: if this product's token is already out on the field,
    // refuse to pull another (drag the existing token back to play it again).
    var EJ = window.JJ_PlayerEject;
    if (EJ && EJ.hasToken && EJ.hasToken(product)) {
      rejectBounce();
      return 'rejected';
    }
    flashClass('jj-player--accept');
    // A different song replacing the current one ejects the old one as a
    // draggable token (drag it back to its product to clear the clutter).
    if (EJ && loadedProduct && EJ.keyOf(loadedProduct) !== EJ.keyOf(product)) {
      EJ.eject(loadedProduct, getRect());
    }
    loadedProduct = product;
    if (window.JJ_PlayerAudio) {
      window.JJ_PlayerAudio.play({
        format: fmt,
        audioUrl: product.audioUrl,
        youtubeUrl: product.youtubeUrl
      });
    }
    if (model) { playInsertBeat(); model.setPlaying(true); }
    return 'accepted';
  }

  // Double-click the active player to pop the loaded song out as a draggable
  // token (drag it back to its product to dismiss) and stop playback, leaving
  // the player empty on screen. No-op when nothing is loaded.
  function popOutLoaded(e) {
    if (e) e.preventDefault();
    if (!el || !loadedProduct) return;
    if (window.JJ_PlayerEject) window.JJ_PlayerEject.eject(loadedProduct, getRect());
    if (window.JJ_PlayerAudio) window.JJ_PlayerAudio.stop();
    if (model) model.setPlaying(false);
    loadedProduct = null;
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
