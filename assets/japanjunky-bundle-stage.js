/**
 * japanjunky-bundle-stage.js
 * 3D mystery-box hero. The box sits in the old product-graphic spot (canvas
 * inside #jj-product-info, top-left zone); the fixed info panel shows the
 * bundle product itself. Click the box → right flap opens → the record stack
 * inside slides out → the 5 records land in the DOM ring-carousel crescent
 * (japanjunky-ring-carousel.js) via JJ_RingCarousel.deal()/retract().
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
  var BUNDLE = window.JJ_BUNDLE || null;
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
  camera.position.set(0, 0, 6); // box alone in this canvas, framed dead center

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
    // Stays CLOSED — only the right flap opens (records slide out to the right).
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
  // Only the RIGHT flap swings; the left stays shut so the opening reads
  // like a record crate mouth on the right side.
  var OPEN_ANGLE = 1.92; // ~110deg
  function setFlaps(t) {
    if (rightFlap) rightFlap.rotation.y = -OPEN_ANGLE * t;
  }

  // Generic eased tween driver (0→1) used by open/close/slide.
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

  // ─── Record stack inside the box ──────────────────────────────
  // Thin textured planes stacked front-to-back behind the flaps; on open
  // they slide out to the RIGHT (clipped by the canvas edge) while the DOM
  // crescent deals in — sells the records leaving the box.
  var stack = []; // meshes (children of boxGroup)
  var STACK_SIZE = 1.5;
  var SLIDE_OUT_X = 4.2;      // box-local x well outside the 550px canvas
  var SLIDE_OUT_Z = 1.2;      // forward out of the mouth, in front of the +X wall
  var STACK_STAGGER_MS = 90;  // matches the DOM deal stagger

  function clearStack() {
    for (var i = 0; i < stack.length; i++) {
      var m = stack[i];
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (m.material.uniforms && m.material.uniforms.uTexture && m.material.uniforms.uTexture.value) {
          m.material.uniforms.uTexture.value.dispose();
        }
        m.material.dispose();
      }
    }
    stack = [];
  }

  function buildStack(pool) {
    clearStack();
    for (var i = 0; i < pool.length; i++) {
      var geo = new THREE.PlaneGeometry(STACK_SIZE, STACK_SIZE);
      var mesh = new THREE.Mesh(geo, psMat(loadTex(pool[i].image)));
      mesh.position.set(
        (Math.random() - 0.5) * 0.06,
        (Math.random() - 0.5) * 0.06 - 0.1, // sit slightly low in the crate
        0.16 - i * 0.08                     // stacked front-to-back
      );
      mesh.rotation.z = (Math.random() - 0.5) * 0.08;
      mesh.userData.homeX = mesh.position.x;
      mesh.userData.homeZ = mesh.position.z;
      boxGroup.add(mesh);
      stack.push(mesh);
    }
  }

  function slideStackOut(done) {
    var pending = stack.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < stack.length; i++) {
      (function (mesh, idx) {
        setTimeout(function () {
          var sx = mesh.position.x, sz = mesh.position.z;
          // Out the open front mouth (z forward clears the +X wall by the
          // time the plane crosses it), then off to the right.
          tween(450, function (e) {
            mesh.position.x = sx + (SLIDE_OUT_X - sx) * e;
            mesh.position.z = sz + (SLIDE_OUT_Z - sz) * e;
          }, function () {
            mesh.visible = false;
            pending--;
            if (pending === 0 && done) done();
          });
        }, idx * STACK_STAGGER_MS);
      })(stack[i], i);
    }
  }

  function slideStackIn(done) {
    var pending = stack.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < stack.length; i++) {
      (function (mesh, idx) {
        setTimeout(function () {
          mesh.visible = true;
          mesh.position.x = SLIDE_OUT_X;
          mesh.position.z = SLIDE_OUT_Z;
          tween(400, function (e) {
            mesh.position.x = SLIDE_OUT_X + (mesh.userData.homeX - SLIDE_OUT_X) * e;
            mesh.position.z = SLIDE_OUT_Z + (mesh.userData.homeZ - SLIDE_OUT_Z) * e;
          }, function () {
            pending--;
            if (pending === 0 && done) done();
          });
        }, idx * STACK_STAGGER_MS);
      })(stack[i], i);
    }
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
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (BUNDLE && BUNDLE.productId))
      : [];
  }

  // Closed: box floats + slowly spins (idle attract state), inviting a click.
  // Open: gentle float + slight swivel (eased toward a slow sine so there is
  // no jump when the state flips mid-phase).
  function updateBox(now) {
    if (!boxGroup) return;
    if (state === 'closed') {
      boxGroup.rotation.y += 0.008;
      boxGroup.position.y = Math.sin(now * 0.0011) * 0.08;
    } else if (state === 'open') {
      var targetRot = Math.sin(now * 0.0007) * 0.10;
      var targetY = Math.sin(now * 0.0011) * 0.05;
      boxGroup.rotation.y += (targetRot - boxGroup.rotation.y) * 0.04;
      boxGroup.position.y += (targetY - boxGroup.position.y) * 0.04;
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

  function dealOut(pool) {
    slideStackOut();
    var ring = ringAPI();
    if (ring) ring.deal(pool);
  }

  function reroll() {
    if (state !== 'open') return;
    var ring = ringAPI();
    if (ring && ring.isBusy()) return;
    setState(FSM.next(state, 'reroll')); // → retracting
    var retractFn = ring ? ring.retract : function (cb) { cb(); };
    retractFn(function () {
      slideStackIn(function () {
        setState(FSM.next(state, 'retracted')); // → closing
        closeFlaps(function () {
          setState(FSM.next(state, 'closed')); // → shaking
          shakeBox(function () {
            setState(FSM.next(state, 'shaken')); // → opening
            var pool = pickPool();
            buildStack(pool);
            tween(600, function (e) { setFlaps(e); }, function () {
              setState(FSM.next(state, 'opened')); // → open
              dealOut(pool);
            });
          });
        });
      });
    });
  }

  // ─── Bundle product info (fixed top-left panel) ──────────────
  // The panel is no longer per-record (records get hover cards in the
  // crescent) — it holds the Five Random Records product itself.
  function showBundleInfo() {
    var infoPanel = document.getElementById('jj-product-info');
    if (!infoPanel) return;

    // The old 3D product viewer canvas shares this spot — the box replaces it.
    var viewerCanvas = document.getElementById('jj-viewer-canvas');
    if (viewerCanvas) viewerCanvas.style.display = 'none';

    var artist = document.getElementById('jj-pi-artist');
    var title = document.getElementById('jj-pi-title');
    var meta = document.getElementById('jj-pi-meta');
    var price = document.getElementById('jj-pi-price');
    var variantInput = document.getElementById('jj-pi-variant-id');
    var atc = document.getElementById('jj-pi-add-to-cart');
    var view = document.getElementById('jj-pi-view');
    var rerollBtn = document.getElementById('jj-bundle-reroll');

    if (BUNDLE) {
      if (artist) artist.textContent = (BUNDLE.title || 'FIVE RANDOM RECORDS').toUpperCase();
      if (meta) {
        meta.innerHTML = '<div class="jj-meta-row"><span class="jj-meta-row__label">Contents: </span>' +
          '<span class="jj-meta-row__value">5 random records</span></div>';
      }
      if (price) price.textContent = BUNDLE.price || '';
      if (variantInput) variantInput.value = String(BUNDLE.variantId || '');
      if (atc) {
        // product-viewer.js's existing click handler adds #jj-pi-variant-id
        // to the cart — the bundle variant rides the standard button.
        atc.disabled = !BUNDLE.available;
        atc.textContent = BUNDLE.available ? '[Add to Cart]' : '[Unavailable]';
      }
      if (view && BUNDLE.handle) {
        view.href = '/products/' + encodeURIComponent(BUNDLE.handle);
        view.style.display = '';
      }
    } else {
      if (artist) artist.textContent = 'FIVE RANDOM RECORDS';
      if (title) title.textContent = '';
      if (atc) atc.style.display = 'none';
      if (view) view.style.display = 'none';
    }
    if (rerollBtn) rerollBtn.style.display = '';

    infoPanel.style.display = '';
  }

  // ─── Init ────────────────────────────────────────────────────
  buildBox();
  setFlaps(0); // closed
  showBundleInfo(); // reveals the panel — the canvas gets layout here
  startLoop();

  canvas.addEventListener('click', function () {
    if (FSM.isLocked(state) || state !== 'closed') return;
    boxGroup.rotation.y = 0;
    boxGroup.position.y = 0;
    var pool = pickPool();
    buildStack(pool);
    openFlaps(function () { dealOut(pool); });
  });

  var rerollBtn = document.getElementById('jj-bundle-reroll');
  if (rerollBtn) {
    rerollBtn.addEventListener('click', function () {
      if (FSM.isLocked(state)) return;
      if (state === 'closed') {
        // Reroll before first open = just open the box
        canvas.dispatchEvent(new MouseEvent('click'));
        return;
      }
      reroll();
    });
  }

  // Expose internals for later tasks in this same file (they extend this IIFE).
  window.__JJ_BUNDLE_STAGE__ = {
    scene: scene, camera: camera, renderer: renderer, boxGroup: boxGroup,
    psMat: psMat, loadTex: loadTex, tween: tween,
    getState: function () { return state; }, setState: setState,
    openFlaps: openFlaps, closeFlaps: closeFlaps, startLoop: startLoop
  };
})();
