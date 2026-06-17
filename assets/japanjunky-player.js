/**
 * japanjunky-player.js
 * The single toolbox media player. Tranche 2: spawn/despawn a placeholder
 * box. Physics, drag, and persistence are layered on in later tasks.
 * The 3D model visual is Tranche 3.
 *
 * Exposes window.JJ_Player. Depends on window.JJ_PlayerPhysics.
 */
(function () {
  'use strict';

  var Physics = window.JJ_PlayerPhysics;
  var el = null;          // the player container element
  var currentTool = null; // 'record' | 'cassette' | 'cd' | null

  // html has zoom:2.5 — visual px (clientX, innerWidth) convert to layout px
  // (offsetWidth, transform) by dividing by this. Re-read on resize.
  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  function setPosition(x, y) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function spawn(tool, x, y) {
    despawn();
    currentTool = tool;
    el = document.createElement('div');
    el.className = 'jj-player';
    el.setAttribute('data-tool', tool);
    el.innerHTML = '<span class="jj-player__label">' + tool + '</span>';
    document.body.appendChild(el);
    setPosition(x, y);
  }

  function despawn() {
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
    currentTool = null;
  }

  window.JJ_Player = {
    spawn: spawn,
    despawn: despawn,
    getType: function () { return currentTool; }
  };
})();
