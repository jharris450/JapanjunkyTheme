/**
 * Japanjunky - Mouse Parallax
 *
 * Parallax: mouse-tracked subtle shift on .jj-ascii-window elements
 */

(function () {
  'use strict';

  // ─── Mouse Parallax ───────────────────────────────────────
  const parallaxConfig = window.JJ_PARALLAX_CONFIG;
  if (parallaxConfig && parallaxConfig.enabled) {
    initParallax(parallaxConfig.intensity);
  }

  function initParallax(intensity) {
    const layers = document.querySelectorAll('[data-parallax-layer]');
    if (!layers.length) return;

    let mouseX = 0.5;
    let mouseY = 0.5;
    let currentX = 0.5;
    let currentY = 0.5;
    let ticking = false;

    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX / window.innerWidth;
      mouseY = e.clientY / window.innerHeight;

      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    });

    function updateParallax() {
      // Smooth interpolation
      currentX += (mouseX - currentX) * 0.1;
      currentY += (mouseY - currentY) * 0.1;

      const offsetX = (currentX - 0.5) * 2; // -1 to 1
      const offsetY = (currentY - 0.5) * 2;

      layers.forEach(function (layer) {
        const depth = parseInt(layer.style.getPropertyValue('--jj-depth') || '1', 10) ||
                      (layer.classList.contains('jj-depth-3') ? 3 :
                       layer.classList.contains('jj-depth-2') ? 2 : 1);

        const moveX = offsetX * intensity * (depth * 0.3);
        const moveY = offsetY * intensity * (depth * 0.2);

        layer.style.transform = 'translate(' + moveX + 'px, ' + moveY + 'px)';
      });

      // Continue animation if mouse is still moving
      if (Math.abs(mouseX - currentX) > 0.001 || Math.abs(mouseY - currentY) > 0.001) {
        requestAnimationFrame(updateParallax);
      } else {
        ticking = false;
      }
    }
  }
})();
