(function () {
  'use strict';

  var frame = document.querySelector('.jj-crt-frame');
  if (!frame) return;

  var rafId = null;
  var targetX = '50%';
  var targetY = '50%';

  document.addEventListener('mousemove', function (e) {
    targetX = e.clientX + 'px';
    targetY = e.clientY + 'px';

    if (!rafId) {
      rafId = requestAnimationFrame(function () {
        frame.style.setProperty('--jj-light-x', targetX);
        frame.style.setProperty('--jj-light-y', targetY);
        rafId = null;
      });
    }
  });

  document.addEventListener('mouseleave', function () {
    frame.style.setProperty('--jj-light-x', '50%');
    frame.style.setProperty('--jj-light-y', '50%');
  });
})();
