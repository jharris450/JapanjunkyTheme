/**
 * japanjunky-bundle-stage.js
 * 3D mystery-box hero: box (body + two hinged flaps) + 5 sample record meshes.
 * Consumes: THREE, JJ_PS1, JJ_Recordbox, JJ_RECORDBOX_TEX, JJ_BundleFSM,
 *           JJ_BundlePool, JJ_BUNDLE, JJ_PRODUCTS.
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
  // Composition = box (right, at the crescent mouth) + record crescent
  // (center/left, ring-carousel shape). Aim the camera at the midpoint so the
  // whole thing sits centered in the canvas rather than skewed to one side.
  var CAR = window.JJ_BundleCarousel;
  var BOX_X = -1.8;    // box parked on the left (source of the records)
  var CENTER_X = -0.55; // midpoint of box (left) + crescent (right) for framing
  camera.position.set(CENTER_X, 0, 6);

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

    boxGroup.position.x = BOX_X;
    scene.add(boxGroup);
  }

  // ─── Flap open/close (t: 0 closed → 1 open) ──────────────────
  var OPEN_ANGLE = 1.92; // ~110deg
  function setFlaps(t) {
    // Left flap swings to +Y (opens to the left), right flap to -Y.
    if (leftFlap) leftFlap.rotation.y = OPEN_ANGLE * t;
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
    updateRecords(now);
    renderer.render(scene, camera);
  }
  function startLoop() {
    if (animating) return;
    animating = true; lastTime = performance.now(); resize();
    rafId = requestAnimationFrame(tick);
  }

  // ─── Sample records (crescent carousel) ──────────────────────
  var records = []; // { mesh, data, phase }
  var RECORD_SIZE = 1.4;

  function clearRecords() {
    deselectCurrent();
    for (var i = 0; i < records.length; i++) {
      var m = records[i].mesh;
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (m.material.uniforms && m.material.uniforms.uTexture && m.material.uniforms.uTexture.value) {
          m.material.uniforms.uTexture.value.dispose();
        }
        m.material.dispose();
      }
    }
    records = [];
  }

  function buildRecordMesh(data) {
    var geo = new THREE.PlaneGeometry(RECORD_SIZE, RECORD_SIZE);
    var mesh = new THREE.Mesh(geo, psMat(loadTex(data.image)));
    // Start hidden at the box's front-center (inside the box mouth).
    mesh.position.set(BOX_X, 0, 0.1);
    mesh.scale.setScalar(0.2);
    mesh.visible = false;
    mesh.userData.isRecord = true;
    scene.add(mesh);
    return mesh;
  }

  var centerIndex = 0;   // index into records that is currently centered/selected
  var selectTimer = null;

  function slotFor(i) {
    return (CAR && CAR.slotForIndex(i, centerIndex, records.length)) ||
           (CAR && CAR.SLOTS && CAR.SLOTS['0']) ||
           { x: 0, y: 0, scale: 1 };
  }

  function dealRecords() {
    clearRecords();
    var pool = (window.JJ_BundlePool && window.JJ_PRODUCTS)
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (window.JJ_BUNDLE && window.JJ_BUNDLE.productId))
      : [];
    for (var i = 0; i < pool.length; i++) {
      records.push({ mesh: buildRecordMesh(pool[i]), data: pool[i], phase: Math.random() * Math.PI * 2 });
    }
    centerIndex = Math.floor(records.length / 2); // middle record centered
  }

  var raycaster = new THREE.Raycaster();

  function recordDetail(data) {
    return {
      handle: data.handle, title: data.title, artist: data.artist, vendor: data.vendor,
      price: data.price, code: data.code, condition: data.condition, format: data.format,
      formatLabel: data.formatLabel, year: data.year, label: data.label,
      jpName: data.jpName, jpTitle: data.jpTitle, imageUrl: data.image,
      imageBackUrl: data.imageBack, type3d: data.type3d, variantId: String(data.variantId),
      available: data.available, preview: true
    };
  }

  var recordsOut = false;

  // Animate every record to the slot for its offset from centerIndex.
  function layoutRecords(animated) {
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        var slot = slotFor(idx);
        var mesh = rec.mesh;
        mesh.visible = true;
        var sx = mesh.position.x, sy = mesh.position.y, ss = mesh.scale.x;
        if (!animated) {
          mesh.position.set(slot.x, slot.y, 0);
          mesh.scale.setScalar(slot.scale);
          return;
        }
        tween(320, function (e) {
          mesh.position.x = sx + (slot.x - sx) * e;
          mesh.position.y = sy + (slot.y - sy) * e;
          mesh.position.z = (1 - e) * mesh.position.z; // ease any z back to 0
          mesh.scale.setScalar(ss + (slot.scale - ss) * e);
        });
      })(records[i], i);
    }
  }

  // Deal-out: records fly from the box (BOX_X) to their carousel slots, staggered.
  function slideOut(done) {
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        var slot = slotFor(idx);
        rec.mesh.visible = true;
        var sx = BOX_X, sy = 0, ss = 0.2;
        setTimeout(function () {
          tween(500, function (e) {
            rec.mesh.position.x = sx + (slot.x - sx) * e;
            rec.mesh.position.y = sy + (slot.y - sy) * e;
            rec.mesh.scale.setScalar(ss + (slot.scale - ss) * e);
          }, function () {
            pending--;
            if (pending === 0) { recordsOut = true; armSelect(); if (done) done(); }
          });
        }, idx * 90);
      })(records[i], i);
    }
  }

  // Retract all records back into the box.
  function slideIn(done) {
    recordsOut = false;
    clearSelectTimer();
    deselectCurrent();
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var sx = rec.mesh.position.x, sy = rec.mesh.position.y, ss = rec.mesh.scale.x;
        tween(360, function (e) {
          rec.mesh.position.x = sx + (BOX_X - sx) * e;
          rec.mesh.position.y = sy + (0 - sy) * e;
          rec.mesh.scale.setScalar(ss + (0.2 - ss) * e);
        }, function () { rec.mesh.visible = false; pending--; if (pending === 0 && done) done(); });
      })(records[i]);
    }
  }

  // ─── Rotation + selection (ported from ring-carousel.js) ─────
  var rotateUntil = 0; // suppress idle-bob until the rotation tween settles
  function rotateTo(newIndex) {
    if (!records.length) return;
    if (newIndex < 0) newIndex = records.length - 1;
    if (newIndex >= records.length) newIndex = 0;
    if (newIndex === centerIndex) return;
    deselectCurrent();
    centerIndex = newIndex;
    layoutRecords(true);
    rotateUntil = performance.now() + 340; // > tween duration (320ms)
    armSelect();
  }
  function rotateBy(delta) { rotateTo(centerIndex + delta); }

  function armSelect() {
    clearSelectTimer();
    selectTimer = setTimeout(function () { selectTimer = null; selectCentered(); }, 300);
  }
  function clearSelectTimer() {
    if (selectTimer) { clearTimeout(selectTimer); selectTimer = null; }
  }
  var selectedIndex = -1;
  function selectCentered() {
    if (!records.length || centerIndex === selectedIndex) return;
    selectedIndex = centerIndex;
    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: recordDetail(records[centerIndex].data) }));
  }
  function deselectCurrent() {
    clearSelectTimer();
    if (selectedIndex === -1) return;
    selectedIndex = -1;
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
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

  // Idle bob for non-centered records; centered one holds still (it's selected).
  function updateRecords(now) {
    if (!recordsOut) return;
    if (now < rotateUntil) return; // don't fight the rotation tween's y writes
    for (var i = 0; i < records.length; i++) {
      if (i === centerIndex) continue;
      var rec = records[i];
      var slot = slotFor(i);
      rec.mesh.position.y = slot.y + Math.sin(now * 0.001 + rec.phase) * 0.04;
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
    deselectCurrent();
    setState(FSM.next(state, 'reroll')); // → retracting
    slideIn(function () {
      setState(FSM.next(state, 'retracted')); // → closing
      closeFlaps(function () {
        setState(FSM.next(state, 'closed')); // → shaking
        shakeBox(function () {
          setState(FSM.next(state, 'shaken')); // → opening
          dealRecords();
          tween(600, function (e) { setFlaps(e); }, function () {
            setState(FSM.next(state, 'opened')); // → open
            slideOut();
          });
        });
      });
    });
  }

  // ─── Init ────────────────────────────────────────────────────
  buildBox();
  setFlaps(0); // closed
  startLoop();

  canvas.addEventListener('click', function (e) {
    if (FSM.isLocked(state)) return;
    if (state === 'closed') {
      boxGroup.rotation.y = 0;
      boxGroup.position.y = 0;
      dealRecords();
      openFlaps(function () { slideOut(); });
      return;
    }
    if (state === 'open' && records.length) {
      var r = canvas.getBoundingClientRect();
      var mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var my = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera({ x: mx, y: my }, camera);
      var meshes = records.map(function (rec) { return rec.mesh; });
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].mesh === hits[0].object) {
            if (i === centerIndex) { clearSelectTimer(); selectCentered(); }
            else { rotateTo(i); }
            return;
          }
        }
      }
    }
  });

  // Keyboard (mirrors ring-carousel guards)
  document.addEventListener('keydown', function (e) {
    if (state !== 'open' || FSM.isLocked(state)) return;
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.body.classList.contains('jj-grid-active')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); rotateBy(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); rotateBy(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); clearSelectTimer(); selectCentered(); }
    else if (e.key === 'Escape') { e.preventDefault(); deselectCurrent(); }
  });

  // Scroll wheel over the canvas (throttled, one step per event)
  var wheelCooldown = false;
  canvas.addEventListener('wheel', function (e) {
    if (state !== 'open' || FSM.isLocked(state)) return;
    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(function () { wheelCooldown = false; }, 150);
    var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (delta > 0) rotateBy(1); else if (delta < 0) rotateBy(-1);
  }, { passive: false });

  // Touch swipe (vertical, one rotation per gesture)
  var touchStartY = 0, touchLocked = false;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY; touchLocked = false;
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (state !== 'open' || FSM.isLocked(state) || touchLocked || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > 50) {
      e.preventDefault(); touchLocked = true;
      if (dy > 0) rotateBy(1); else rotateBy(-1);
    }
  }, { passive: false });

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
