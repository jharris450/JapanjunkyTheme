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

  // ─── Box texture pipeline ─────────────────────────────────────
  // The cardboard photos were shot under uneven light, so each face reads
  // a different shade. Normalize every face to a common mean luminance
  // (with a mild grain-preserving contrast boost + fixed warm kraft tint),
  // then Floyd-Steinberg dither with the product-image kernel against the
  // palette's NEUTRAL subset (full phosphor palette speckles a near-flat
  // neutral surface with green/red confetti). Knobs tuned via headless
  // A/B renders against the raw photos.
  var BOX_TEX_LUMA = 168;      // shared brightness target across faces
  var BOX_TEX_CONTRAST = 1.4;  // amplifies cardboard grain past the palette step
  var BOX_TEX_DIM = 256;       // plenty next to the 240px shader res
  var TAPE_FRAC = 0.14;        // kraft half-strip width, fraction of a flap face

  function normalizeLuma(data, target) {
    var sum = 0;
    for (var i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    var mean = sum / (data.length / 4) || 1;
    var gain = Math.max(0.6, Math.min(1.8, target / mean)); // no blowouts
    for (var j = 0; j < data.length; j += 4) {
      var L = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
      var Lc = target + (L * gain - target) * BOX_TEX_CONTRAST;
      // per-pixel chroma survives (safe against the NEUTRAL palette —
      // greys/warm tones only, nothing to confetti into)
      data[j] = Math.max(0, Math.min(255, Lc + (data[j] - L) * 1.2));
      data[j + 1] = Math.max(0, Math.min(255, Lc + (data[j + 1] - L) * 1.2));
      data[j + 2] = Math.max(0, Math.min(255, Lc + (data[j + 2] - L) * 1.2));
    }
  }

  // tapeEdge ('left'|'right'): composite half of the kraft tape strip along
  // that edge — the two front flaps each carry one half, joining into a
  // single strip down the box's center seam.
  function loadBoxTex(url, tapeEdge) {
    if (!url) return null;
    // One fixed-size canvas for the texture's whole life: the image is
    // drawn + processed into it in place. Swapping in a DIFFERENT canvas
    // after upload never reaches the GPU (immutable texture storage) —
    // that bug rendered the box as a solid grey slab.
    var c = document.createElement('canvas');
    c.width = BOX_TEX_DIM; c.height = BOX_TEX_DIM;
    var x = c.getContext('2d');
    x.fillStyle = '#8a8a86'; x.fillRect(0, 0, BOX_TEX_DIM, BOX_TEX_DIM);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;

    function compose(img, tapeImg) {
      x.drawImage(img, 0, 0, BOX_TEX_DIM, BOX_TEX_DIM);
      try {
        // Normalize the cardboard FIRST — the tape must not skew the face
        // mean, and both flaps' tape halves must get identical treatment.
        var id = x.getImageData(0, 0, BOX_TEX_DIM, BOX_TEX_DIM);
        normalizeLuma(id.data, BOX_TEX_LUMA);
        x.putImageData(id, 0, 0);
        if (tapeImg) {
          // Adjacent CENTER slices of the kraft photo, so the two halves
          // join into one continuous strip at the seam.
          var wpx = Math.round(BOX_TEX_DIM * TAPE_FRAC);
          var kw = tapeImg.naturalWidth;
          var slice = kw * 0.15;
          if (tapeEdge === 'right') {
            x.drawImage(tapeImg, kw * 0.5 - slice, 0, slice, tapeImg.naturalHeight,
              BOX_TEX_DIM - wpx, 0, wpx, BOX_TEX_DIM);
          } else {
            x.drawImage(tapeImg, kw * 0.5, 0, slice, tapeImg.naturalHeight,
              0, 0, wpx, BOX_TEX_DIM);
          }
        }
        id = x.getImageData(0, 0, BOX_TEX_DIM, BOX_TEX_DIM);
        if (window.JJ_Dither && window.JJ_Dither.ditherImageData) {
          window.JJ_Dither.ditherImageData(id, BOX_TEX_DIM, BOX_TEX_DIM,
            window.JJ_Dither.NEUTRAL_PALETTE);
        }
        x.putImageData(id, 0, 0);
      } catch (e) { /* tainted canvas — keep the raw draw */ }
      tex.needsUpdate = true;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      if (tapeEdge && TEX.kraft) {
        var tapeImg = new Image();
        tapeImg.crossOrigin = 'anonymous';
        tapeImg.onload = function () { compose(img, tapeImg); };
        tapeImg.onerror = function () { compose(img, null); };
        tapeImg.src = TEX.kraft;
      } else {
        compose(img, null);
      }
    };
    img.src = url;
    return tex;
  }
  function psMat(tex) {
    return new THREE.ShaderMaterial({
      uniforms: { uResolution: { value: shaderRes }, uTexture: { value: tex || fallbackTex() } },
      vertexShader: PS1.vert, fragmentShader: PS1.frag, side: THREE.DoubleSide
    });
  }

  // ─── Box: body (4 faces) + fixed left flap + hinged end lid ──
  var boxGroup = new THREE.Group();
  var leftFlap, endLid; // pivot Object3Ds

  // Slimmer crate: depth (the side panels' width) reduced twice by 30%
  // (×0.7 → ×0.49 of the flagship recordbox) — vertical size unchanged.
  var BOX_DEPTH = DIMS.d * 0.49;

  function buildBox() {
    var w = DIMS.w, h = DIMS.h, d = BOX_DEPTH;

    // Body: BoxGeometry with the front (+Z) and right (+X) faces transparent
    // — front is covered by the flaps, right by the hinged side door.
    var bodyGeo = new THREE.BoxGeometry(w, h, d);
    var invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    // BoxGeometry face order [+X,-X,+Y,-Y,+Z,-Z]:
    var bodyMats = [
      invisible,                        // +X right (covered by side door)
      psMat(loadBoxTex(TEX.sideLeft)),  // -X
      psMat(loadBoxTex(TEX.top)),       // +Y
      psMat(loadBoxTex(TEX.bottom)),    // -Y
      invisible,                        // +Z front (covered by flaps)
      psMat(loadBoxTex(TEX.back))       // -Z
    ];
    var body = new THREE.Mesh(bodyGeo, bodyMats);
    boxGroup.add(body);

    var halfW = w / 2;
    var frontZ = d / 2 + 0.001;

    // Left flap: half-width plane covering the front-left quadrant.
    // Stays CLOSED — the box opens on its right end only.
    leftFlap = new THREE.Object3D();
    leftFlap.position.set(-halfW, 0, frontZ);
    var lGeo = new THREE.PlaneGeometry(halfW, h);
    var lMesh = new THREE.Mesh(lGeo, psMat(loadBoxTex(TEX.frontLeft, 'right')));
    lMesh.position.set(halfW / 2, 0, 0); // shift so inner edge meets center
    leftFlap.add(lMesh);
    boxGroup.add(leftFlap);

    // End lid: front-right flap + right side panel as ONE attached L-piece
    // (like a real record box end), hinged on the side panel's REAR
    // vertical edge — swings open rightward/back as a unit.
    endLid = new THREE.Object3D();
    endLid.position.set(halfW, 0, -d / 2);

    // Right side panel: faces +X, spans hinge (rear) → front edge.
    var sGeo = new THREE.PlaneGeometry(d, h);
    var sMesh = new THREE.Mesh(sGeo, psMat(loadBoxTex(TEX.sideRight)));
    sMesh.rotation.y = Math.PI / 2; // face +X; width now runs along z
    sMesh.position.set(0.001, 0, d / 2);
    endLid.add(sMesh);

    // Front-right flap: faces +Z, attached at the panel's front corner,
    // spans corner → box center.
    var rGeo = new THREE.PlaneGeometry(halfW, h);
    var rMesh = new THREE.Mesh(rGeo, psMat(loadBoxTex(TEX.frontRight, 'left')));
    rMesh.position.set(-halfW / 2, 0, d + 0.001);
    endLid.add(rMesh);

    boxGroup.add(endLid);

    scene.add(boxGroup);
  }

  // ─── Lid open/close (t: 0 closed → 1 open) ───────────────────
  // The attached flap+side end lid swings OUTWARD about its rear vertical
  // hinge and stays outstretched. ~150°: any less and the outstretched
  // flap ends up crossing the records' straight +x exit path (they'd
  // visibly slide through the cardboard).
  var OPEN_ANGLE = 2.6; // ~150deg
  function setFlaps(t) {
    if (endLid) endLid.rotation.y = OPEN_ANGLE * t;
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
  // Thin textured planes stacked front-to-back behind the flaps. They never
  // animate: each mesh blinks off the instant its DOM cover launches from
  // the same screen spot (ring's onLaunch callback) — one record, one
  // continuous motion. The stack is rebuilt only while the box is CLOSED.
  var stack = []; // meshes (children of boxGroup)
  var STACK_SIZE = 1.5;

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
      // Stacked front-to-back, spread across whatever depth the crate has
      // (small margin keeps the front plane behind the flap).
      var zFront = BOX_DEPTH / 2 - 0.015;
      var zStep = pool.length > 1 ? (zFront * 2) / (pool.length - 1) : 0;
      mesh.position.set(
        (Math.random() - 0.5) * 0.06,
        (Math.random() - 0.5) * 0.06 - 0.1, // sit slightly low in the crate
        zFront - i * zStep
      );
      mesh.rotation.z = (Math.random() - 0.5) * 0.08;
      boxGroup.add(mesh);
      stack.push(mesh);
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

  // ─── Drag-spin (open box) ─────────────────────────────────────
  // While open, the cursor can grab and spin the box; released momentum
  // decays and the gentle swivel keeps breathing around the spun angle.
  var TWO_PI = Math.PI * 2;
  var dragging = false, dragLastX = 0, spinVel = 0, userSpin = 0;

  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'open') return;
    dragging = true;
    dragLastX = e.clientX;
    spinVel = 0;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var d = (e.clientX - dragLastX) * 0.012;
    dragLastX = e.clientX;
    userSpin += d;
    spinVel = d;
  });
  window.addEventListener('pointerup', function () {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = state === 'open' ? 'grab' : 'pointer';
  });

  // Spin the box the rest of the way forward to face front (no snap),
  // easing the idle bob out at the same time. Resets any user spin.
  var aligning = false;
  function alignFront(ms, done) {
    aligning = true;
    userSpin = 0;
    spinVel = 0;
    var r = ((boxGroup.rotation.y % TWO_PI) + TWO_PI) % TWO_PI;
    var remaining = (TWO_PI - r) % TWO_PI;
    var sr = boxGroup.rotation.y, sy = boxGroup.position.y;
    tween(ms, function (e) {
      boxGroup.rotation.y = sr + remaining * e;
      boxGroup.position.y = sy * (1 - e);
    }, function () {
      aligning = false;
      if (done) done();
    });
  }

  // Closed: box floats + slowly spins (idle attract state), inviting a click.
  // Open: gentle float + slight swivel around the user's spun angle.
  function updateBox(now) {
    if (!boxGroup || aligning) return;
    if (state === 'closed') {
      boxGroup.rotation.y += 0.008;
      boxGroup.position.y = Math.sin(now * 0.0011) * 0.08;
    } else if (state === 'open') {
      if (!dragging) {
        userSpin += spinVel;   // release momentum…
        spinVel *= 0.94;       // …decaying
      }
      var targetRot = Math.sin(now * 0.0007) * 0.10 + userSpin;
      var targetY = Math.sin(now * 0.0011) * 0.05;
      boxGroup.rotation.y += (targetRot - boxGroup.rotation.y) * (dragging ? 0.35 : 0.04);
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
    var ring = ringAPI();
    if (ring) {
      // Hide each stack mesh the instant its cover launches — the cover
      // spawns at the same screen spot/size, so the record reads as one
      // continuous object leaving the box.
      ring.deal(pool, function (idx) {
        if (stack[idx]) stack[idx].visible = false;
      });
    }
  }

  function reroll() {
    if (state !== 'open') return;
    var ring = ringAPI();
    if (ring && ring.isBusy()) return;
    setState(FSM.next(state, 'reroll')); // → retracting
    canvas.style.cursor = 'pointer';
    var retractFn = ring ? ring.retract : function (cb) { cb(); };
    retractFn(function () {
      // Covers have flown back inside — shut the lid, THEN restock the
      // crate (new random 5) while it's closed, out of sight.
      setState(FSM.next(state, 'retracted')); // → closing
      closeFlaps(function () {
        setState(FSM.next(state, 'closed')); // → shaking
        var pool = pickPool();
        buildStack(pool);
        // Spin any user drag-rotation back to front before the shake
        alignFront(350, function () {
          shakeBox(function () {
            setState(FSM.next(state, 'shaken')); // → opening
            tween(600, function (e) { setFlaps(e); }, function () {
              setState(FSM.next(state, 'opened')); // → open
              canvas.style.cursor = 'grab';
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
    if (FSM.isLocked(state) || state !== 'closed' || aligning) return;
    // Wake Tsuno exactly like the scroll-to-grid does: dissolves the
    // greeting bubble AND engages his roaming personality (peek gesture).
    // No-op if he's already awake.
    document.dispatchEvent(new CustomEvent('jj:tsuno-wake'));
    var pool = pickPool();
    buildStack(pool);
    // Finish the idle spin forward to face front (no snap), then open.
    alignFront(500, function () {
      openFlaps(function () {
        canvas.style.cursor = 'grab';
        dealOut(pool);
      });
    });
  });

  var rerollBtn = document.getElementById('jj-bundle-reroll');
  if (rerollBtn) {
    rerollBtn.addEventListener('click', function () {
      if (FSM.isLocked(state)) return;
      var ring = ringAPI();
      if (ring && ring.isBusy()) return;
      var proceed = function () {
        if (state === 'closed') {
          // Reroll before first open = just open the box
          canvas.dispatchEvent(new MouseEvent('click'));
          return;
        }
        reroll();
      };
      // The daruma doll IS the reroll button — let it open and spill its
      // dice first, then kick the actual reroll as they fade.
      var daruma = window.JJ_DARUMA;
      if (daruma) {
        if (daruma.isBusy()) return;
        daruma.play(proceed);
      } else {
        proceed();
      }
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
