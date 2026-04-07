/**
 * Japanjunky - Mouse Parallax
 *
 * Proximity-based: each [data-parallax-layer] element responds
 * independently to the mouse based on its own distance from the cursor.
 * Movement ramps from 0 (far) to max (close) with quadratic ease-in.
 */

(function () {
  'use strict';

  var config = window.JJ_PARALLAX_CONFIG;
  if (!config || !config.enabled) return;

  var intensity = config.intensity || 6;
  var RADIUS = 350; // px — activation radius around each element

  var layers = document.querySelectorAll('[data-parallax-layer]');
  if (!layers.length) return;

  var mouseX = -9999;
  var mouseY = -9999;
  var ticking = false;

  // Per-layer smooth interpolation state
  var states = [];
  for (var i = 0; i < layers.length; i++) {
    states.push({ x: 0, y: 0 });
  }

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  });

  function tick() {
    var settling = false;

    for (var i = 0; i < layers.length; i++) {
      var rect = layers[i].getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;

      // Vector from element center to mouse
      var dx = mouseX - cx;
      var dy = mouseY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Proximity: 1 when on element, 0 at RADIUS or beyond
      var prox = Math.max(0, 1 - dist / RADIUS);
      prox *= prox; // quadratic ease-in — gentle ramp near edge

      // Target offset — element shifts toward mouse, scaled by proximity
      var tx = (dx / RADIUS) * intensity * prox;
      var ty = (dy / RADIUS) * intensity * prox;

      // Smooth interpolation
      var s = states[i];
      s.x += (tx - s.x) * 0.1;
      s.y += (ty - s.y) * 0.1;

      if (Math.abs(s.x) > 0.01 || Math.abs(s.y) > 0.01) {
        layers[i].style.transform = 'translate(' + s.x + 'px, ' + s.y + 'px)';
        settling = true;
      } else {
        s.x = 0;
        s.y = 0;
        layers[i].style.transform = '';
      }
    }

    if (settling) {
      requestAnimationFrame(tick);
    } else {
      ticking = false;
    }
  }
})();
