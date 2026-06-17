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
})();
