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
    }
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    el.innerHTML = '<span class="jj-player__label">' + tool + '</span>';
    document.body.appendChild(el);

    var opts = buildOpts();
    body = {
      x: Physics.clamp(x, opts.bounds.minX, opts.bounds.maxX),
      y: Physics.clamp(y, opts.bounds.minY, opts.bounds.maxY),
      vx: 0,
      vy: 0
    };
    setPosition(body.x, body.y);
    startLoop();
  }

  function despawn() {
    stopLoop();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    body = null;
    currentTool = null;
  }

  window.addEventListener('resize', function () {
    if (!el) return;
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var opts = buildOpts();
    body.x = Physics.clamp(body.x, opts.bounds.minX, opts.bounds.maxX);
    body.y = Physics.clamp(body.y, opts.bounds.minY, opts.bounds.maxY);
    setPosition(body.x, body.y);
    startLoop(); // re-settle if the floor moved
  });

  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; }
  };
})();
