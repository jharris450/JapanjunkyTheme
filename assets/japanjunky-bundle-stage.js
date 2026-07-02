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

  // Generic eased tween driver (0→1) used by open/close/slide.
  function tween(durationMs, onUpdate, onDone) {
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
    updateRecords(now);
    renderer.render(scene, camera);
  }
  function startLoop() {
    if (animating) return;
    animating = true; lastTime = performance.now(); resize();
    rafId = requestAnimationFrame(tick);
  }

  // ─── Sample records (crescent fold-out) ──────────────────────
  // 5 slots down a vertical crescent to the box's right, mirroring the
  // ring-carousel ARC (px offsets / 90 → scene units).
  var ARC_TARGETS = [
    { x: 2.0, y: 0.83,  scale: 0.98 },
    { x: 2.0, y: 0.28,  scale: 0.98 },
    { x: 2.4, y: -0.28, scale: 0.86 },
    { x: 2.4, y: -0.83, scale: 0.86 },
    { x: 2.9, y: -1.38, scale: 0.72 }
  ];

  var records = []; // { mesh, slot, data, phase }
  var RECORD_SIZE = 1.4;

  function clearRecords() {
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
    mesh.position.set(0, 0, 0.1);
    mesh.scale.setScalar(0.2);
    mesh.visible = false;
    mesh.userData.isRecord = true;
    scene.add(mesh);
    return mesh;
  }

  function dealRecords() {
    clearRecords();
    var pool = (window.JJ_BundlePool && window.JJ_PRODUCTS)
      ? window.JJ_BundlePool.pickRecords(window.JJ_PRODUCTS, 5, (window.JJ_BUNDLE && window.JJ_BUNDLE.productId))
      : [];
    for (var i = 0; i < pool.length && i < ARC_TARGETS.length; i++) {
      records.push({ mesh: buildRecordMesh(pool[i]), slot: ARC_TARGETS[i], data: pool[i], phase: Math.random() * Math.PI * 2 });
    }
  }

  var recordsOut = false;

  function slideOut(done) {
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec, idx) {
        rec.mesh.visible = true;
        var sx = 0, sy = 0, ss = 0.2;
        var tx = rec.slot.x, ty = rec.slot.y, ts = rec.slot.scale;
        setTimeout(function () {
          tween(500, function (e) {
            rec.mesh.position.x = sx + (tx - sx) * e;
            rec.mesh.position.y = sy + (ty - sy) * e;
            var s = ss + (ts - ss) * e;
            rec.mesh.scale.setScalar(s);
          }, function () { pending--; if (pending === 0) { recordsOut = true; if (done) done(); } });
        }, idx * 90); // staggered deal
      })(records[i], i);
    }
  }

  function slideIn(done) {
    recordsOut = false;
    var pending = records.length;
    if (!pending) { if (done) done(); return; }
    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var sx = rec.mesh.position.x, sy = rec.mesh.position.y, ss = rec.mesh.scale.x;
        tween(360, function (e) {
          rec.mesh.position.x = sx * (1 - e);
          rec.mesh.position.y = sy * (1 - e);
          rec.mesh.scale.setScalar(ss + (0.2 - ss) * e);
        }, function () { rec.mesh.visible = false; pending--; if (pending === 0 && done) done(); });
      })(records[i]);
    }
  }

  // ─── Preview selection (raycast) ─────────────────────────────
  var raycaster = new THREE.Raycaster();
  var focused = null; // { rec, homeX, homeY, homeScale }

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

  function focusRecord(rec) {
    if (focused && focused.rec === rec) return;
    deselect();
    focused = { rec: rec, homeX: rec.slot.x, homeY: rec.slot.y, homeScale: rec.slot.scale };
    tween(300, function (e) {
      rec.mesh.position.x = focused.homeX * (1 - e) + 0 * e;
      rec.mesh.position.y = focused.homeY * (1 - e) + 0 * e;
      rec.mesh.position.z = 0.1 + 1.4 * e; // pull toward camera
      rec.mesh.scale.setScalar(focused.homeScale + (1.3 - focused.homeScale) * e);
    });
    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: recordDetail(rec.data) }));
  }

  function deselect() {
    if (!focused) return;
    var rec = focused.rec, hx = focused.homeX, hy = focused.homeY, hs = focused.homeScale;
    var sx = rec.mesh.position.x, sy = rec.mesh.position.y, sz = rec.mesh.position.z, ss = rec.mesh.scale.x;
    focused = null;
    tween(280, function (e) {
      rec.mesh.position.x = sx + (hx - sx) * e;
      rec.mesh.position.y = sy + (hy - sy) * e;
      rec.mesh.position.z = sz + (0.1 - sz) * e;
      rec.mesh.scale.setScalar(ss + (hs - ss) * e);
    });
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }

  function updateRecords(now) {
    if (!recordsOut) return;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      rec.mesh.position.y = rec.slot.y + Math.sin(now * 0.001 + rec.phase) * 0.04;
    }
    if (focused) focused.rec.mesh.rotation.y += 0.01;
  }

  // ─── Init ────────────────────────────────────────────────────
  buildBox();
  setFlaps(0); // closed
  startLoop();

  canvas.addEventListener('click', function (e) {
    if (FSM.isLocked(state)) return;
    var r = canvas.getBoundingClientRect();
    var mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var my = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera({ x: mx, y: my }, camera);

    if (state === 'open' && records.length) {
      var meshes = records.map(function (rec) { return rec.mesh; });
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        var hitMesh = hits[0].object;
        for (var i = 0; i < records.length; i++) {
          if (records[i].mesh === hitMesh) { focusRecord(records[i]); return; }
        }
      }
      deselect(); // clicked empty space while open
      return;
    }
    if (state === 'closed') {
      dealRecords();
      openFlaps(function () { slideOut(); });
    }
  });

  // Expose internals for later tasks in this same file (they extend this IIFE).
  window.__JJ_BUNDLE_STAGE__ = {
    scene: scene, camera: camera, renderer: renderer, boxGroup: boxGroup,
    psMat: psMat, loadTex: loadTex, tween: tween,
    getState: function () { return state; }, setState: setState,
    openFlaps: openFlaps, closeFlaps: closeFlaps, startLoop: startLoop
  };
})();
