/**
 * japanjunky-glyph-field.js
 * Ambient drifting glyph particles over the scene: spinning ASCII "thinking"
 * spinners (braille frames) + random hiragana/katakana that rotate. Crisp 2D
 * canvas (text stays sharp + on the monospace grid). Music-reactive — spin and
 * drift speed up with energy, glyphs brighten on the beat. Rides inside
 * #jj-crt-content so it gets the CRT barrel like everything else.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('jj-glyph-field');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Classic CLI "thinking" spinner frames.
  var SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  var COLORS = ['#ffaa00', '#f5d742', '#e0d5c0']; // amber / gold / cream — warm, on-palette

  function randKana() {
    // Hiragana U+3041–U+3096, Katakana U+30A1–U+30FA.
    return Math.random() < 0.5
      ? String.fromCharCode(0x3041 + Math.floor(Math.random() * (0x3096 - 0x3041)))
      : String.fromCharCode(0x30A1 + Math.floor(Math.random() * (0x30FA - 0x30A1)));
  }

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  var COUNT = 20;
  var parts = [];
  function spawn() {
    var type = Math.random() < 0.45 ? 'spinner' : 'kana';
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      size: 10 + Math.random() * 9,
      vx: (Math.random() - 0.5) * 10,        // px/s sway
      vy: -(5 + Math.random() * 18),          // px/s upward drift
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 2.8,  // rad/s — faster, loader-like spin
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 0.10 + Math.random() * 0.16,     // subtle
      type: type,
      char: type === 'kana' ? randKana() : SPINNER[0],
      spin: Math.random() * SPINNER.length,   // spinner frame cursor
      swap: 0.6 + Math.random() * 1.4,        // kana re-roll interval (s) — changes faster
      t: 0
    };
  }
  for (var i = 0; i < COUNT; i++) parts.push(spawn());

  var last = performance.now();
  var running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;

    var ar = window.JJ_AudioReact;
    var energy = ar ? ar.energy : 0;
    var beat = ar ? ar.beat : 0;
    var driftMul = 1 + energy * 1.5;
    var spinMul = 1 + energy * 3 + beat * 4;

    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      p.t += dt;
      p.x += p.vx * dt * driftMul;
      p.y += p.vy * dt * driftMul;
      p.rot += p.rotSpeed * dt * spinMul;

      if (p.y < -24) { p.y = H + 24; p.x = Math.random() * W; }
      if (p.x < -24) p.x = W + 24; else if (p.x > W + 24) p.x = -24;

      if (p.type === 'spinner') {
        p.spin += dt * (14 + energy * 12 + beat * 10); // loader-speed frame cycle
        p.char = SPINNER[Math.floor(p.spin) % SPINNER.length];
      } else if (p.t > p.swap) {
        p.t = 0; p.char = randKana();
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.alpha * (1 + beat * 0.5));
      ctx.fillStyle = p.color;
      ctx.font = p.size + "px 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace";
      ctx.fillText(p.char, 0, 0);
      ctx.restore();
    }
  }

  if (!reduce) requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; }
    else if (!reduce) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });
})();
