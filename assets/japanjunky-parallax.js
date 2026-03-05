/**
 * Japanjunky - Matrix Rain Canvas + Mouse Parallax
 *
 * Matrix rain: katakana + symbols in Famicom red/gold, fading trails
 * Parallax: mouse-tracked subtle shift on .jj-ascii-window elements
 */

(function () {
  'use strict';

  // ─── Matrix Rain ───────────────────────────────────────────
  const canvas = document.getElementById('jj-matrix-canvas');
  if (canvas) {
    initMatrixRain(canvas);
  }

  function initMatrixRain(canvas) {
    const ctx = canvas.getContext('2d');
    const config = window.JJ_MATRIX_CONFIG || { speed: 50, opacity: 0.15 };

    // Characters: katakana + half-width kana + symbols
    const chars =
      'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
      '0123456789' +
      '◆◇■□▲△●○★☆♦♣♠♥' +
      '═║╔╗╚╝╠╣╦╩╬';

    const fontSize = 14;
    let columns;
    let drops;

    // Famicom palette for rain characters
    const colors = [
      'rgba(232, 49, 58, ',   // red
      'rgba(245, 215, 66, ',  // gold
      'rgba(74, 164, 224, ',  // blue
      'rgba(240, 230, 211, ', // cream
    ];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(1);
      // Randomize initial positions
      for (let i = 0; i < drops.length; i++) {
        drops[i] = Math.random() * -100;
      }
    }

    resize();
    window.addEventListener('resize', resize);

    function draw() {
      // Fade trail
      ctx.fillStyle = 'rgba(43, 43, 43, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        if (drops[i] < 0) {
          drops[i]++;
          continue;
        }

        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Pick a color with random alpha for depth variation
        const colorBase = colors[Math.floor(Math.random() * colors.length)];
        const alpha = 0.3 + Math.random() * 0.7;
        ctx.fillStyle = colorBase + alpha + ')';

        ctx.fillText(char, x, y);

        // Reset drop when it falls off screen
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    setInterval(draw, config.speed);
  }

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
