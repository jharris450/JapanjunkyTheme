/**
 * japanjunky-guy.js
 * "Guy" — a samurai miniature who shows up when music has been playing a while
 * and tries to kick the player to stop the song (a nudge to keep browsing).
 *
 * Flow: 2 min of continuous music -> peeks in from the left and looks around ->
 * ~1 min later hops into the viewport -> chases the player's x by hopping ->
 * kicks it when reachable (ejects the song). The user can drag and throw him;
 * tossed clear off-screen he's gone for the session and instead floats in the
 * Three.js scene with Tsuno (JJ_Portal.summonCompanion).
 *
 * DOM overlay in layout px (mirrors the player's zoom handling). Appended to
 * <body> so guy + player share one undistorted coordinate space.
 */
(function () {
  'use strict';

  var SRC = (window.JJ_SCREENSAVER_CONFIG || {}).guyTexture || '';
  if (!SRC) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // a hopping character is pure motion — respect the preference

  // ── Tuning ──────────────────────────────────────────────────
  var PEEK_AFTER = 120;   // s of continuous music before the peek
  var ENTER_AFTER = 60;   // s after the peek before he jumps in
  var GRAVITY = 2600;     // layout px/s^2
  var HOP_VX = 190;       // horizontal hop speed
  var HOP_VY = 720;       // hop launch (up)
  var HOP_PAUSE = 0.22;   // s between hops
  var KICK_RANGE = 70;    // layout px horizontal distance to land a kick
  var KICK_REACH = 90;    // player must be within this many px above the floor
  var THROW_MAX = 4200;

  var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

  var el = document.createElement('img');
  el.className = 'jj-guy';
  el.src = SRC;
  el.alt = '';
  el.setAttribute('aria-hidden', 'true');
  el.draggable = false;
  (document.body).appendChild(el);

  var guyW = 56, guyH = 96; // refreshed once the image loads
  el.addEventListener('load', function () {
    if (el.naturalWidth) { guyH = 96; guyW = Math.round(96 * el.naturalWidth / el.naturalHeight); }
    measure();
  });

  function vw() { return window.innerWidth / zoom; }
  function vh() { return window.innerHeight / zoom; }
  function taskbarH() { var t = document.querySelector('.jj-taskbar'); return t ? t.offsetHeight : 32; }
  function floorLine() { return vh() - taskbarH(); }      // the ground (taskbar top)
  function groundY() { return floorLine() - guyH; }        // top-left y when standing on the floor

  function measure() {
    guyW = el.offsetWidth || guyW;
    guyH = el.offsetHeight || guyH;
  }

  // ── State ───────────────────────────────────────────────────
  var body = { x: -200, y: 0, vx: 0, vy: 0 };
  var phase = 'dormant';
  var facing = 1;            // +1 faces right, -1 faces left
  var musicElapsed = 0;
  var hasPeeked = false;
  var peekDoneAt = 0;
  var phaseT = 0;            // seconds in the current sub-step
  var hopPause = 0;
  var goneForever = false;
  var dragId = null, grabDX = 0, grabDY = 0, lastPX = 0, lastPY = 0, lastPT = 0, velX = 0, velY = 0;

  body.y = groundY();
  render();

  function setFacing(f) { facing = f; }
  function render() {
    el.style.transform = 'translate(' + body.x + 'px,' + body.y + 'px) scaleX(' + facing + ')';
  }
  function airborne() { return body.y < groundY() - 0.5; }

  function playerCenterX() {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return null;
    var r = window.JJ_Player.getRect();
    return r ? (r.left + r.width / 2) / zoom : null;
  }
  function playerReachable() {
    if (!window.JJ_Player || !window.JJ_Player.getRect) return false;
    var r = window.JJ_Player.getRect();
    if (!r) return false;
    var pBottom = r.bottom / zoom;
    return pBottom >= floorLine() - KICK_REACH; // player low enough to reach by hopping
  }

  function startHopToward(targetX) {
    var gc = body.x + guyW / 2;
    var dir = targetX > gc ? 1 : -1;
    setFacing(dir);
    body.vx = dir * HOP_VX;
    body.vy = -HOP_VY;
  }

  // ── Phase transitions ───────────────────────────────────────
  function retreat() {
    // Slide back off the left edge and reset the timers (music stopped or kick done).
    phase = 'retreating'; phaseT = 0;
    musicElapsed = 0; hasPeeked = false;
  }
  function goDormant() { phase = 'dormant'; body.x = -guyW - 20; body.y = groundY(); body.vx = body.vy = 0; }

  function vanish() {
    goneForever = true;
    if (el.parentNode) el.parentNode.removeChild(el);
    if (window.JJ_Portal && window.JJ_Portal.summonCompanion) window.JJ_Portal.summonCompanion();
    stopLoop();
  }

  // ── Pointer drag ────────────────────────────────────────────
  el.style.pointerEvents = 'auto';
  el.addEventListener('pointerdown', function (e) {
    if (phase === 'gone') return;
    e.preventDefault();
    dragId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    phase = 'dragging';
    var px = e.clientX / zoom, py = e.clientY / zoom;
    grabDX = px - body.x; grabDY = py - body.y;
    lastPX = px; lastPY = py; lastPT = performance.now(); velX = velY = 0;
    el.classList.add('jj-guy--grabbed');
  });
  el.addEventListener('pointermove', function (e) {
    if (phase !== 'dragging' || e.pointerId !== dragId) return;
    var px = e.clientX / zoom, py = e.clientY / zoom;
    var now = performance.now(), dt = (now - lastPT) / 1000;
    if (dt > 0) { velX = (px - lastPX) / dt; velY = (py - lastPY) / dt; }
    lastPX = px; lastPY = py; lastPT = now;
    body.x = px - grabDX; body.y = py - grabDY;
    render();
  });
  function endDrag(e) {
    if (phase !== 'dragging' || e.pointerId !== dragId) return;
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    el.classList.remove('jj-guy--grabbed');
    dragId = null;
    body.vx = Math.max(-THROW_MAX, Math.min(THROW_MAX, velX));
    body.vy = Math.max(-THROW_MAX, Math.min(THROW_MAX, velY));
    phase = 'thrown';
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', function () {
    zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  });

  // ── Main loop ───────────────────────────────────────────────
  var rafId = null, lastT = 0;
  function startLoop() { if (rafId === null) { lastT = performance.now(); rafId = requestAnimationFrame(tick); } }
  function stopLoop() { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }

  function physicsStep(dt) {
    body.vy += GRAVITY * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    if (body.y >= groundY()) {
      body.y = groundY(); body.vy = 0;
      // Thrown: floor friction so a gentle toss settles (resumes hunting) while a
      // hard one slides off-screen (gone). Hops zero vx on landing.
      if (phase === 'thrown') body.vx /= (1 + 4 * dt); else body.vx = 0;
    }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (goneForever) { stopLoop(); return; }

    var ar = window.JJ_AudioReact;
    var playing = ar && ar.energy > 0.5;
    if (playing) musicElapsed += dt; else musicElapsed = 0;

    // Music stopped while he was active (not being handled by user) -> retreat.
    if (!playing && (phase === 'peeking' || phase === 'waiting' || phase === 'hunting' || phase === 'kicking')) {
      retreat();
    }

    phaseT += dt;

    if (phase === 'dormant') {
      body.x = -guyW - 20; body.y = groundY();
      if (playing && musicElapsed >= PEEK_AFTER) { phase = 'peeking'; phaseT = 0; }

    } else if (phase === 'peeking') {
      // 0–1.2s slide in to peek, 1.2–3.2s flip/look, 3.2–4.4s slide out.
      var peekX = -guyW * 0.62; // head/shoulder showing
      if (phaseT < 1.2) {
        body.x = -guyW + (peekX + guyW) * (phaseT / 1.2);
      } else if (phaseT < 3.2) {
        body.x = peekX;
        setFacing(Math.sin(phaseT * 6) > 0 ? 1 : -1); // glance side to side
      } else if (phaseT < 4.4) {
        body.x = peekX + (-guyW - peekX) * ((phaseT - 3.2) / 1.2);
      } else {
        hasPeeked = true; peekDoneAt = musicElapsed; phase = 'waiting'; phaseT = 0;
        setFacing(1);
      }
      body.y = groundY();

    } else if (phase === 'waiting') {
      body.x = -guyW - 20; body.y = groundY();
      if (musicElapsed - peekDoneAt >= ENTER_AFTER) {
        phase = 'hunting'; phaseT = 0; hopPause = 0;
        body.x = -guyW * 0.5; setFacing(1);
        body.vx = HOP_VX; body.vy = -HOP_VY; // leap in
      }

    } else if (phase === 'hunting') {
      physicsStep(dt);
      if (!airborne()) {
        hopPause -= dt;
        var target = playerCenterX();
        if (target != null && Math.abs((body.x + guyW / 2) - target) < KICK_RANGE && playerReachable()) {
          phase = 'kicking'; phaseT = 0;
          setFacing(target > body.x + guyW / 2 ? 1 : -1);
          el.classList.add('jj-guy--kick');
        } else if (hopPause <= 0) {
          startHopToward(target != null ? target : body.x);
          hopPause = HOP_PAUSE;
        }
      }

    } else if (phase === 'kicking') {
      // brief wind-up, then the kick connects and the song pops out
      if (phaseT > 0.18 && !el.__kicked) {
        el.__kicked = true;
        if (window.JJ_Player && window.JJ_Player.ejectCurrent) window.JJ_Player.ejectCurrent();
      }
      if (phaseT > 0.5) { el.classList.remove('jj-guy--kick'); el.__kicked = false; retreat(); }

    } else if (phase === 'retreating') {
      body.y = groundY();
      body.x -= 240 * dt; setFacing(-1);
      if (body.x < -guyW - 20) goDormant();

    } else if (phase === 'thrown') {
      physicsStep(dt);
      var W = vw(), H = vh();
      // No wall bounce — he can be tossed clear out. Off any edge => gone.
      if (body.x > W + guyW || body.x + guyW < -guyW || body.y > H + guyH) { vanish(); return; }
      if (!airborne() && Math.abs(body.vx) < 30) {
        body.vx = 0;
        phase = playing ? 'hunting' : 'retreating';
        phaseT = 0; hopPause = 0;
      }
    }
    // 'dragging' position is set by pointermove.

    if (phase !== 'dragging') render();
  }

  startLoop();
})();
