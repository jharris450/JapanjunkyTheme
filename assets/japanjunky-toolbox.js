/**
 * Japanjunky - Toolbox (Tranche 1: open/close only)
 *
 * Toggles the bottom-right toolbox fan menu. Mirrors the start menu:
 * click toggles, outside click closes, Escape closes. Dragging a tool to
 * spawn a 3D player is added in Tranche 2.
 */
(function () {
  'use strict';

  var toolbox = document.getElementById('jj-toolbox');
  var btn = document.getElementById('jj-toolbox-btn');
  var fan = document.getElementById('jj-toolbox-fan');
  if (!toolbox || !btn || !fan) return;

  function open() {
    fan.hidden = false;
    // Force a reflow so the browser paints the collapsed base state before the
    // open class applies — otherwise the fan-out transition is skipped.
    void fan.offsetHeight;
    toolbox.classList.add('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    toolbox.classList.remove('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'false');
    // Hide only after the collapse transition finishes, and only if the menu
    // wasn't reopened in the meantime (guards rapid toggle).
    setTimeout(function () {
      if (!isOpen()) fan.hidden = true;
    }, 160);
  }

  function isOpen() {
    return toolbox.classList.contains('jj-toolbox--open');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isOpen()) { close(); } else { open(); }
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (isOpen() && !toolbox.contains(e.target)) close();
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      close();
      btn.focus();
    }
  });

  // --- Drag (or click) a fan tool to spawn its player (Tranche 2) ---
  var PLAYER_HALF = 48; // half of the 96px player, to centre it on the cursor

  function spawnFromTool(toolEl, clientX, clientY) {
    if (!window.JJ_Player) return;
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var x = clientX / zoom - PLAYER_HALF;
    var y = clientY / zoom - PLAYER_HALF;
    window.JJ_Player.spawn(toolEl.getAttribute('data-tool'), x, y);
    close();
  }

  var tools = toolbox.querySelectorAll('.jj-toolbox__tool');
  for (var i = 0; i < tools.length; i++) {
    (function (toolEl) {
      toolEl.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { toolEl.setPointerCapture(e.pointerId); } catch (err) {}

        function onUp(ev) {
          toolEl.removeEventListener('pointerup', onUp);
          try { toolEl.releasePointerCapture(ev.pointerId); } catch (err) {}
          spawnFromTool(toolEl, ev.clientX, ev.clientY);
        }
        toolEl.addEventListener('pointerup', onUp);
      });
    })(tools[i]);
  }
})();
