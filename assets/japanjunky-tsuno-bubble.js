/**
 * japanjunky-tsuno-bubble.js
 * Tsuno Daishi greeting chat bubble.
 * Phases: appear → type JP → hold → scramble → reveal EN → hold → dissolve
 *
 * Depends on: JJ_Portal (optional, for talk-bounce)
 * Listens:    jj:product-selected (early dissolve)
 */
(function () {
  'use strict';

  // ─── Guard: need screensaver canvas in DOM ──────────────────
  var ssCanvas = document.getElementById('jj-screensaver') ||
                 document.getElementById('jj-screensaver-display');
  if (!ssCanvas) return;

  var bubble = document.getElementById('jj-tsuno-bubble');
  if (!bubble) return;

  var textEl = bubble.querySelector('.jj-tsuno-bubble__text');
  if (!textEl) return;

  // ─── Config ─────────────────────────────────────────────────
  var JP_TEXT = 'いらっしゃいませ';
  var EN_TEXT = 'Welcome!';
  var GLITCH_CHARS = '\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789';

  var phase = 'waiting'; // waiting|appear|typeJP|holdJP|scramble|revealEN|holdEN|dissolve|done
  var timer = null;
  var frameInterval = null;
  var dissolved = false;

  // ─── Portal helpers (graceful if unavailable) ───────────────
  function setTalking(val) {
    if (window.JJ_Portal && window.JJ_Portal.setTalking) {
      window.JJ_Portal.setTalking(val);
    }
  }

  // ─── Audio ──────────────────────────────────────────────────
  var audio = null;
  try {
    audio = new Audio();
    audio.src = bubble.getAttribute('data-audio-src') || '';
    audio.preload = 'auto';
  } catch (e) { audio = null; }

  function playAudio() {
    if (!audio || !audio.src) return;
    try { audio.play().catch(function () {}); } catch (e) { /* autoplay blocked */ }
  }

  // ─── Typewriter (jittered, same style as product viewer) ────
  function typeText(text, msPerChar, cb) {
    var idx = 0;
    textEl.textContent = '';
    function tick() {
      if (phase === 'done' || dissolved) return;
      if (idx < text.length) {
        idx++;
        textEl.textContent = text.substring(0, idx);
        var jitter = msPerChar * (0.6 + Math.random() * 0.8);
        timer = setTimeout(tick, jitter);
      } else {
        if (cb) cb();
      }
    }
    tick();
  }

  // ─── Scramble → Reveal (per-character, staggered settle) ────
  function scrambleToReveal(fromText, toText, cb) {
    var len = Math.max(fromText.length, toText.length);
    var settled = [];
    for (var si = 0; si < len; si++) settled.push(false);
    var settleOrder = [];
    for (var i = 0; i < len; i++) settleOrder.push(i);
    // Settle left-to-right with small random variance
    var nextSettle = 0;
    var totalFrames = 0;
    var scrambleFrames = 8;  // ~400ms of pure scramble before first settle
    var settlePause = 1;     // frames between each character settling (~60ms at 50ms/frame)
    var framesSinceLastSettle = 0;

    frameInterval = setInterval(function () {
      if (phase === 'done' || dissolved) {
        clearInterval(frameInterval);
        frameInterval = null;
        return;
      }

      totalFrames++;

      // Build display string
      var display = '';
      for (var c = 0; c < len; c++) {
        if (settled[c]) {
          display += toText[c] || '';
        } else {
          display += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
      }
      textEl.textContent = display;

      // After initial scramble period, start settling characters
      if (totalFrames > scrambleFrames) {
        framesSinceLastSettle++;
        if (framesSinceLastSettle >= settlePause && nextSettle < len) {
          settled[settleOrder[nextSettle]] = true;
          nextSettle++;
          framesSinceLastSettle = 0;
        }
      }

      // All settled
      if (nextSettle >= len) {
        clearInterval(frameInterval);
        frameInterval = null;
        textEl.textContent = toText;
        if (cb) cb();
      }
    }, 50);
  }

  // ─── Pixel Dissolve ─────────────────────────────────────────
  function dissolve() {
    if (dissolved) return;
    dissolved = true;
    clearTimers();
    setTalking(false);

    // Get bubble dimensions
    var rect = bubble.getBoundingClientRect();
    var cellSize = 6;
    var cols = Math.ceil(rect.width / cellSize);
    var rows = Math.ceil(rect.height / cellSize);

    // Hide original content, speech tail, and border
    textEl.style.visibility = 'hidden';
    bubble.style.border = 'none';
    bubble.classList.add('jj-tsuno-bubble--dissolving');

    // Build grid
    var grid = document.createElement('div');
    grid.className = 'jj-pixel-dissolve-grid';
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';

    for (var i = 0; i < cols * rows; i++) {
      var cell = document.createElement('div');
      cell.style.setProperty('--d', Math.floor(Math.random() * 300) + 'ms');
      cell.style.setProperty('--dx', (Math.random() * 16 - 8) + 'px');
      cell.style.setProperty('--dy', (Math.random() * 16 - 8) + 'px');
      grid.appendChild(cell);
    }

    bubble.appendChild(grid);

    // Remove bubble after animation completes
    setTimeout(function () {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 550);
  }

  // ─── Phase Machine ──────────────────────────────────────────
  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (frameInterval) { clearInterval(frameInterval); frameInterval = null; }
  }

  function runPhase(newPhase) {
    if (dissolved) return;
    phase = newPhase;

    switch (phase) {
      case 'appear':
        bubble.classList.add('jj-tsuno-bubble--entering');
        setTalking(true);
        playAudio();
        timer = setTimeout(function () { runPhase('typeJP'); }, 400);
        break;

      case 'typeJP':
        typeText(JP_TEXT, 80, function () {
          runPhase('holdJP');
        });
        break;

      case 'holdJP':
        timer = setTimeout(function () { runPhase('scramble'); }, 1500);
        break;

      case 'scramble':
        scrambleToReveal(JP_TEXT, EN_TEXT, function () {
          runPhase('holdEN');
        });
        break;

      case 'holdEN':
        setTalking(false);
        timer = setTimeout(function () { runPhase('dissolve'); }, 3000);
        break;

      case 'dissolve':
        dissolve();
        break;
    }
  }

  // ─── Early dissolve on product select ───────────────────────
  document.addEventListener('jj:product-selected', function () {
    if (phase !== 'done' && !dissolved) {
      dissolve();
    }
  });

  // ─── Init ───────────────────────────────────────────────────
  // Always run the full animated sequence — the CRT aesthetic is core to the experience.
  // Individual CSS animations already respect prefers-reduced-motion via japanjunky-crt.css.
  timer = setTimeout(function () { runPhase('appear'); }, 1500);
})();
