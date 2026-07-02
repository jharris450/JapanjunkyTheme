/**
 * japanjunky-bundle-stage.js
 * 3D mystery-box hero: box (body + two hinged flaps) only — the 5 sampled
 * records render as DOM covers in the revived ring-carousel
 * (japanjunky-ring-carousel.js), dealt/retracted via JJ_RingCarousel.
 * Consumes: THREE, JJ_PS1, JJ_Recordbox, JJ_RECORDBOX_TEX, JJ_BundleFSM,
 *           JJ_BundlePool, JJ_BUNDLE, JJ_PRODUCTS, JJ_RingCarousel.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('jj-bundle-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var TEX = window.JJ_RECORDBOX_TEX || {};
  var DIMS = (window.JJ_Recordbox && window.JJ_Recordbox.DIMS) || { w: 2.0, h: 2.0, d: 0.5 };
  var PS1 = window.JJ_PS1 || { vert: '', frag: '' };
  var FSM = window.JJ_BundleFSM;
  var shaderRes = 240;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ringAPI() { return window.JJ_RingCarousel || null; }

  // ─── Renderer / scene / camera ───────────────────────────────
  var renderer, scene, camera, rafId = null, animating = false, lastTime = 0;
  var webglOK = true;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
  } catch (e) { webglOK = false; }

  if (!webglOK) { canvas.classList.add('jj-bundle--nowebgl'); return; }

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  // Box alone in this canvas (the record crescent is DOM, to the right) —
  // frame it dead center.
  camera.position.set(0, 0, 6);

  var textureLoader = new THREE.TextureLoader();
  function loadTex(url) {
    if (!url) return null;
    var t = textureLoader.load(url);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    return t;
  }
  function fallbackTex() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var x = c.getContext('2d'); x.fillStyle = '#8a8a86'; x.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
  }
  function psMat(tex) {
    return new THREE.ShaderMaterial({
      uniforms: { uResolution: { value: shaderRes }, uTexture: { value: tex || fallbackTex() } },
      vertexShader: PS1.vert, fragmentShader: PS1.frag, side: THREE.DoubleSide
    });
  }

  // ─── Box: body (5 faces) + two hinged front flaps ────────────
  var boxGroup = new THREE.Group();
  var leftFlap, rightFlap; // pivot Object3Ds

  function buildBox() {
    var w = DIMS.w, h = DIMS.h, d = DIMS.d;

    // Body: BoxGeometry with the front (+Z) face transparent; other 5 faces textured.
    var bodyGeo = new THREE.BoxGeometry(w, h, d);
    var invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    // BoxGeometry face order [+X,-X,+Y,-Y,+Z,-Z]:
    var bodyMats = [
      psMat(loadTex(TEX.sideRight)), // +X
      psMat(loadTex(TEX.sideLeft)),  // -X
      psMat(loadTex(TEX.top)),       // +Y
      psMat(loadTex(TEX.bottom)),    // -Y
      invisible,                     // +Z front (covered by flaps)
      psMat(loadTex(TEX.back))       // -Z
    ];
    var body = new THREE.Mesh(bodyGeo, bodyMats);
    boxGroup.add(body);

    // Two front flaps, each a half-width plane hinged on its OUTER vertical edge.
    var halfW = w / 2;
    var frontZ = d / 2 + 0.001;

    // Left flap: pivot at the box's left edge (x = -w/2); plane spans pivot→center.
    leftFlap = new THREE.Object3D();
    leftFlap.position.set(-halfW, 0, frontZ);
    var lGeo = new THREE.PlaneGeometry(halfW, h);
    var lMesh = new THREE.Mesh(lGeo, psMat(loadTex(TEX.frontLeft)));
    lMesh.position.set(halfW / 2, 0, 0); // shift so inner edge meets center
    leftFlap.add(lMesh);
    boxGroup.add(leftFlap);

    // Right flap: pivot at the box's right edge (x = +w/2); plane spans center→pivot.
    rightFlap = new THREE.Object3D();
    rightFlap.position.set(halfW, 0, frontZ);
    var rGeo = new THREE.PlaneGeometry(halfW, h);
    var rMesh = new THREE.Mesh(rGeo, psMat(loadTex(TEX.frontRight)));
    rMesh.position.set(-halfW / 2, 0, 0);
    rightFlap.add(rMesh);
    boxGroup.add(rightFlap);

    scene.add(boxGroup);
  }

  // ─── Flap open/close (t: 0 closed → 1 open) ──────────────────
  var OPEN_ANGLE = 1.92; // ~110deg
  function setFlaps(t) {
    // Left flap swings to +Y (opens to the left), right flap to -Y.
    if (leftFlap) leftFlap.rotation.y = OPEN_ANGLE * t;
    if (rightFlap) rightFlap.rotation.y = -OPEN_ANGLE * t;
  }

  // Generic eased tween driver (0→1) used by open/close.
  function tween(durationMs, onUpdate, onDone) {
    if (reduceMotion) durationMs = Math.min(durationMs, 80);
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / durationMs, 1);
      var e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      onUpdate(e);
      if (p < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  var state = 'closed';
  function setState(s) { state = s; }

  function openFlaps(done) {
    setState(FSM.next(state, 'open')); // → opening
    tween(600, function (e) { setFlaps(e); }, function () {
      setState(FSM.next(state, 'opened')); // → open
      if (done) done();
    });
  }
  function closeFlaps(done) {
    tween(500, function (e) { setFlaps(1 - e); }, function () { if (done) done(); });
  }

  // ─── Resize + loop ───────────────────────────────────────────
  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    try { new ResizeObserver(resize).observe(canvas); } catch (e) {}
  }

  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);
    lastTime = now;
    updateBox(now);
    renderer.render(scene, camera);
  }
  function startLoop() {
    if (animating) return;
    animating = true; lastTime = performance.now(); resize();
    rafId = requestAnimationFrame(tick);
  }

  // ─── Record pool (dealt to the DOM ring-carousel) ────────────
  function pickPool() {
    return (window.JJ_BundlePool && window.JJ_PRODUCTS)
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (window.JJ_BUNDLE && window.JJ_BUNDLE.productId))
      : [];
  }

  // Box floats + slowly spins while closed (idle attract state), inviting a
  // click. Stops once opening begins so the flaps unfold facing the viewer.
  function updateBox(now) {
    if (!boxGroup) return;
    if (state === 'closed') {
      boxGroup.rotation.y += 0.008;
      boxGroup.position.y = Math.sin(now * 0.0011) * 0.08;
    }
  }

  // ─── Reroll ──────────────────────────────────────────────────
  function shakeBox(done) {
    var shakeDur = reduceMotion ? 80 : 420;
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / shakeDur, 1);
      boxGroup.rotation.z = Math.sin(p * Math.PI * 6) * 0.12 * (1 - p);
      if (p < 1) requestAnimationFrame(step);
      else { boxGroup.rotation.z = 0; if (done) done(); }
    }
    requestAnimationFrame(step);
  }

  function reroll() {
    if (state !== 'open') return;
    var ring = ringAPI();
    if (ring && ring.isBusy()) return;
    setState(FSM.next(state, 'reroll')); // → retracting
    var retractFn = ring ? ring.retract : function (cb) { cb(); };
    retractFn(function () {
      setState(FSM.next(state, 'retracted')); // → closing
      closeFlaps(function () {
        setState(FSM.next(state, 'closed')); // → shaking
        shakeBox(function () {
          setState(FSM.next(state, 'shaken')); // → opening
          var pool = pickPool();
          tween(600, function (e) { setFlaps(e); }, function () {
            setState(FSM.next(state, 'opened')); // → open
            var r = ringAPI();
            if (r) r.deal(pool);
          });
        });
      });
    });
  }

  // ─── Init ────────────────────────────────────────────────────
  buildBox();
  setFlaps(0); // closed
  startLoop();

  canvas.addEventListener('click', function () {
    if (FSM.isLocked(state) || state !== 'closed') return;
    boxGroup.rotation.y = 0;
    boxGroup.position.y = 0;
    var pool = pickPool();
    openFlaps(function () {
      var ring = ringAPI();
      if (ring) ring.deal(pool);
    });
  });

  // ─── Controls ────────────────────────────────────────────────
  var rerollBtn = document.getElementById('jj-bundle-reroll');
  if (rerollBtn) {
    rerollBtn.addEventListener('click', function () {
      if (FSM.isLocked(state) || state !== 'open') return;
      reroll();
    });
  }

  var addBtn = document.getElementById('jj-bundle-add');
  var BUNDLE = window.JJ_BUNDLE || null;
  if (addBtn) {
    if (!BUNDLE) {
      addBtn.style.display = 'none';
    } else if (!BUNDLE.available) {
      addBtn.textContent = '[Unavailable]';
      addBtn.disabled = true;
    } else {
      addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
      addBtn.disabled = false;
      addBtn.addEventListener('click', function () {
        if (addBtn.disabled) return;
        addBtn.textContent = '[Adding...]';
        addBtn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parseInt(BUNDLE.variantId, 10), quantity: 1 })
        }).then(function (res) {
          if (!res.ok) throw new Error('cart');
          return res.json();
        }).then(function () {
          addBtn.textContent = '[OK]';
          if (window.jjRefreshCart) window.jjRefreshCart();
          setTimeout(function () {
            addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
            addBtn.disabled = false;
          }, 1500);
        }).catch(function () {
          addBtn.textContent = '[ERR]';
          setTimeout(function () {
            addBtn.textContent = '[Add 5 Random Records — ' + BUNDLE.price + ']';
            addBtn.disabled = false;
          }, 1500);
        });
      });
    }
  }

  // Expose internals for later tasks in this same file (they extend this IIFE).
  window.__JJ_BUNDLE_STAGE__ = {
    scene: scene, camera: camera, renderer: renderer, boxGroup: boxGroup,
    psMat: psMat, loadTex: loadTex, tween: tween,
    getState: function () { return state; }, setState: setState,
    openFlaps: openFlaps, closeFlaps: closeFlaps, startLoop: startLoop
  };
})();
