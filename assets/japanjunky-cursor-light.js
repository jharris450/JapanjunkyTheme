/**
 * Japanjunky — Custom ASCII Cursor with Trail & Pixel Dematerialization
 *
 * - Custom cursor: a rotating ASCII glyph that follows the mouse
 * - Trail: characters spawn behind cursor as it moves
 * - Trail chars fall down, blur, then burst into pixel fragments
 * - Respects prefers-reduced-motion
 * - v2: improved reliability for Shopify CDN/stacking contexts
 */
(function () {
  'use strict';

  // Bail if reduced motion preferred or no mouse pointer available
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover)').matches) return;

  // ─── Glyph Sets ────────────────────────────────────────────
  var cursorGlyphs = [
    '\u2588', // █
    '\u2593', // ▓
    '\u2592', // ▒
    '\u2591', // ░
    '\u25C6', // ◆
    '\u25A0', // ■
    '\u2660', // ♠
    '\u2665', // ♥
    '\u2666', // ♦
    '\u2663', // ♣
    '\u2605', // ★
    '\u2302', // ⌂
    '\u00A7', // §
    '\u2020', // †
    '\u03A3', // Σ
    '\u03A9', // Ω
    '\u03C0', // π
    '\u0394', // Δ
    '\u03BB', // λ
    '\u221E', // ∞
  ];

  var trailGlyphs = [
    '\u2502', // │
    '\u2500', // ─
    '\u253C', // ┼
    '\u2524', // ┤
    '\u251C', // ├
    '\u2534', // ┴
    '\u252C', // ┬
    '\u2510', // ┐
    '\u250C', // ┌
    '\u2514', // └
    '\u2518', // ┘
    '\u2550', // ═
    '\u2551', // ║
    '\u256C', // ╬
    '\u2560', // ╠
    '\u2563', // ╣
    '\u2566', // ╦
    '\u2569', // ╩
    '\u2554', // ╔
    '\u2557', // ╗
    '\u255A', // ╚
    '\u255D', // ╝
    '\u2591', // ░
    '\u2592', // ▒
    '\u2593', // ▓
    '\u00B0', // °
    '\u00B7', // ·
    '\u2022', // •
    '\u25CB', // ○
    '\u25CF', // ●
  ];

  // Phosphor colors for trail variety (Color CRT palette)
  var trailColors = [
    { color: '#f5d742', shadow: 'rgba(245,215,66,0.4)' },  // gold
    { color: '#e8313a', shadow: 'rgba(232,49,58,0.4)' },    // red
    { color: '#4aa4e0', shadow: 'rgba(74,164,224,0.4)' },   // cyan
    { color: '#33ff33', shadow: 'rgba(51,255,51,0.4)' },    // green
    { color: '#e040e0', shadow: 'rgba(224,64,224,0.4)' },   // magenta
    { color: '#ffaa00', shadow: 'rgba(255,170,0,0.4)' },    // amber
  ];

  // ─── Create Cursor Element ─────────────────────────────────
  // Apply inline critical styles to guarantee visibility regardless of
  // CSS load order, stacking contexts, or Shopify theme editor overlays.
  var cursor = document.createElement('div');
  cursor.id = 'jj-cursor';
  cursor.textContent = cursorGlyphs[0];
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:2147483647',       // max 32-bit int — above everything
    'font-family:"IBM Plex Mono",Consolas,monospace',
    'font-size:18px',
    'line-height:1',
    'color:#e8313a',
    'text-shadow:0 0 4px #e8313a,0 0 10px rgba(232,49,58,0.5)',
    'transform:translate(-50%,-50%)',
    'will-change:left,top',
    'user-select:none',
    'left:-100px',
    'top:-100px'
  ].join(';');
  document.body.appendChild(cursor);

  // Add class to <html> to hide native cursor via CSS
  document.documentElement.classList.add('jj-cursor-active');

  var cursorX = -100;
  var cursorY = -100;
  var glyphIndex = 0;
  var moveCount = 0;

  // ─── Cursor Following ──────────────────────────────────────
  var rafId = null;

  function updateCursor() {
    cursor.style.left = cursorX + 'px';
    cursor.style.top = cursorY + 'px';
    rafId = null;
  }

  // ─── Trail Management ──────────────────────────────────────
  var trailPool = [];
  var MAX_TRAILS = 30;
  var lastTrailX = 0;
  var lastTrailY = 0;
  var TRAIL_MIN_DIST = 20; // min px between trail spawns

  function spawnTrail(x, y) {
    // Reuse or create element
    var el;
    if (trailPool.length >= MAX_TRAILS) {
      el = trailPool.shift();
      el.remove();
    }

    el = document.createElement('span');
    el.className = 'jj-trail';
    el.setAttribute('aria-hidden', 'true');

    // Random glyph and color
    el.textContent = trailGlyphs[Math.floor(Math.random() * trailGlyphs.length)];
    var c = trailColors[Math.floor(Math.random() * trailColors.length)];

    // Slight random offset for organic feel
    var ox = (Math.random() - 0.5) * 8;
    var oy = (Math.random() - 0.5) * 8;
    var sz = 11 + Math.floor(Math.random() * 7);

    el.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:2147483646',
      'font-family:"IBM Plex Mono",Consolas,monospace',
      'line-height:1',
      'transform:translate(-50%,-50%)',
      'will-change:transform,opacity',
      'user-select:none',
      'color:' + c.color,
      'text-shadow:0 0 4px ' + c.shadow,
      'font-size:' + sz + 'px',
      'left:' + (x + ox) + 'px',
      'top:' + (y + oy) + 'px'
    ].join(';');

    document.body.appendChild(el);
    trailPool.push(el);

    // When trail animation ends, spawn pixel fragments and remove
    el.addEventListener('animationend', function () {
      spawnPixels(
        parseFloat(el.style.left),
        parseFloat(el.style.top) + 90, // offset by fall distance
        c
      );
      el.remove();
      var idx = trailPool.indexOf(el);
      if (idx !== -1) trailPool.splice(idx, 1);
    }, { once: true });
  }

  // ─── Pixel Dematerialization ───────────────────────────────
  function spawnPixels(x, y, colorObj) {
    var count = 2 + Math.floor(Math.random() * 3); // 2-4 fragments
    for (var i = 0; i < count; i++) {
      var px = document.createElement('span');
      px.className = 'jj-pixel';
      px.setAttribute('aria-hidden', 'true');

      // Random scatter direction
      var angle = Math.random() * Math.PI * 2;
      var dist = 4 + Math.random() * 12;
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      var size = 2 + Math.floor(Math.random() * 3);

      px.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:2147483646',
        'width:' + size + 'px',
        'height:' + size + 'px',
        'background:' + colorObj.color,
        'box-shadow:0 0 3px ' + colorObj.shadow,
        'left:' + x + 'px',
        'top:' + y + 'px',
        '--px-x:' + dx + 'px',
        '--px-y:' + dy + 'px'
      ].join(';');

      document.body.appendChild(px);

      px.addEventListener('animationend', function () {
        this.remove();
      }, { once: true });
    }
  }

  // ─── Mouse Events ──────────────────────────────────────────
  document.addEventListener('mousemove', function (e) {
    cursorX = e.clientX;
    cursorY = e.clientY;

    if (!rafId) {
      rafId = requestAnimationFrame(updateCursor);
    }

    // Rotate cursor glyph every few moves
    moveCount++;
    if (moveCount % 3 === 0) {
      glyphIndex = (glyphIndex + 1) % cursorGlyphs.length;
      cursor.textContent = cursorGlyphs[glyphIndex];
    }

    // Spawn trail if moved enough distance
    var dx = cursorX - lastTrailX;
    var dy = cursorY - lastTrailY;
    if (dx * dx + dy * dy > TRAIL_MIN_DIST * TRAIL_MIN_DIST) {
      spawnTrail(cursorX, cursorY);
      lastTrailX = cursorX;
      lastTrailY = cursorY;
    }
  });

  // Hide cursor when leaving window
  document.addEventListener('mouseleave', function () {
    cursor.style.left = '-100px';
    cursor.style.top = '-100px';
  });

  // Show cursor when entering
  document.addEventListener('mouseenter', function (e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
    updateCursor();
  });
})();
