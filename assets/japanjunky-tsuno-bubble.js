/**
 * japanjunky-tsuno-bubble.js
 * Tsuno Daishi greeting chat bubble (rendered in 3D scene).
 * Phases: appear → typing "..." → type JP → hold → scramble → reveal EN → hold
 *
 * Depends on: JJ_Portal (setBubbleText, setBubbleVisible)
 * Listens:    jj:product-selected (early dissolve)
 */
(function () {
  'use strict';

  // ─── Guard: need screensaver canvas in DOM ──────────────────
  var ssCanvas = document.getElementById('jj-screensaver') ||
                 document.getElementById('jj-screensaver-display');
  if (!ssCanvas) return;

  // ─── Guard: skip the welcome greeting on the product page ──
  // The product page shows Tsuno in his floating idle state; the
  // "いらっしゃいませ / Welcome!" bubble is a homepage-only greeting.
  if (window.JJ_SCREENSAVER_CONFIG &&
      window.JJ_SCREENSAVER_CONFIG.cameraPreset === 'product') {
    return;
  }

  // ─── Config ─────────────────────────────────────────────────
  var JP_TEXT = 'いらっしゃいませ';
  var EN_TEXT = 'Welcome!';
  var GLITCH_CHARS = '\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789';

  var phase = 'waiting'; // waiting|appear|typing|typeJP|holdJP|scramble|holdEN|done
  var timer = null;
  var frameInterval = null;
  var dissolved = false;
  var currentText = '';

  // ─── Portal helpers (wait for JJ_Portal to be available) ───
  function portalReady() {
    return window.JJ_Portal && window.JJ_Portal.setBubbleText;
  }

  function setBubbleText(text) {
    currentText = text;
    if (portalReady()) {
      window.JJ_Portal.setBubbleText(text);
    }
  }

  function setBubbleVisible(visible) {
    if (portalReady()) {
      window.JJ_Portal.setBubbleVisible(visible);
    }
  }

  // ─── Audio ──────────────────────────────────────────────────
  var audioDom = document.getElementById('jj-tsuno-bubble');
  var audio = null;
  var audioUnlocked = false;
  var audioPending = false;          // true = playAudio() was called before unlock
  try {
    audio = new Audio();
    audio.src = (audioDom && audioDom.getAttribute('data-audio-src')) || '';
    audio.preload = 'auto';
  } catch (e) { audio = null; }

  function playAudio() {
    if (!audio || !audio.src) return;
    try {
      var p = audio.play();
      if (p && p.then) {
        p.then(function () { audioUnlocked = true; })
         .catch(function () { audioPending = true; });   // blocked → wait for gesture
      }
    } catch (e) { audioPending = true; }
  }

  // Unlock audio on first user gesture (click / tap / key)
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    if (audioPending && audio) {
      audioPending = false;
      try { audio.play().catch(function () {}); } catch (e) {}
    }
    ['click', 'touchstart', 'keydown'].forEach(function (evt) {
      document.removeEventListener(evt, unlockAudio, true);
    });
  }
  ['click', 'touchstart', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, unlockAudio, true);
  });

  // ─── Typewriter (jittered) ─────────────────────────────────
  function typeText(text, msPerChar, cb) {
    var idx = 0;
    setBubbleText('');
    function tick() {
      if (phase === 'done' || dissolved) return;
      if (idx < text.length) {
        idx++;
        setBubbleText(text.substring(0, idx));
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
    var nextSettle = 0;
    var totalFrames = 0;
    var scrambleFrames = 8;
    var settlePause = 1;
    var framesSinceLastSettle = 0;

    frameInterval = setInterval(function () {
      if (phase === 'done' || dissolved) {
        clearInterval(frameInterval);
        frameInterval = null;
        return;
      }

      totalFrames++;

      var display = '';
      for (var c = 0; c < len; c++) {
        if (settled[c]) {
          display += toText[c] || '';
        } else {
          display += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
      }
      setBubbleText(display);

      if (totalFrames > scrambleFrames) {
        framesSinceLastSettle++;
        if (framesSinceLastSettle >= settlePause && nextSettle < len) {
          settled[settleOrder[nextSettle]] = true;
          nextSettle++;
          framesSinceLastSettle = 0;
        }
      }

      if (nextSettle >= len) {
        clearInterval(frameInterval);
        frameInterval = null;
        setBubbleText(toText);
        if (cb) cb();
      }
    }, 50);
  }

  // ─── Dissolve (hide 3D bubble) ─────────────────────────────
  function dissolve() {
    if (dissolved) return;
    dissolved = true;
    clearTimers();
    setBubbleVisible(false);
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
        setBubbleText('');
        setBubbleVisible(true);
        timer = setTimeout(function () { runPhase('typing'); }, 400);
        break;

      case 'typing':
        typeText('...', 200, function () {
          timer = setTimeout(function () {
            setBubbleText('');
            runPhase('typeJP');
          }, 600);
        });
        break;

      case 'typeJP':
        playAudio();
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
  // Wait for JJ_Portal to be available, then start
  function waitAndStart() {
    if (portalReady()) {
      timer = setTimeout(function () { runPhase('appear'); }, 1500);
    } else {
      setTimeout(waitAndStart, 100);
    }
  }
  waitAndStart();
})();
