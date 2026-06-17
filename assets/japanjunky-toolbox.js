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
    toolbox.classList.add('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    toolbox.classList.remove('jj-toolbox--open');
    btn.setAttribute('aria-expanded', 'false');
    // Keep the element in the DOM during the collapse transition, then hide.
    fan.hidden = true;
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
})();
