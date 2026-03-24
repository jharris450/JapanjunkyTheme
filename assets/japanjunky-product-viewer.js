/**
 * japanjunky-product-viewer.js
 * Dedicated 3D product viewer with spring physics + idle animation.
 * Renders to its own canvas, independent from screensaver.
 *
 * Consumes: window.JJ_SCREENSAVER_CONFIG (for shader resolution)
 * Accesses: window.JJ_Portal (only for Tsuno Daishi + parallax coordination)
 * Listens:  jj:product-selected, jj:product-deselected
 */
(function () {
  'use strict';

  // ─── DOM ──────────────────────────────────────────────────────
  var canvas = document.getElementById('jj-viewer-canvas');
  var infoPanel = document.getElementById('jj-product-info');
  if (!canvas) return;

  // ─── Three.js Scene Setup ─────────────────────────────────────
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(1); // Keep pixelated
  renderer.setClearColor(0x000000, 0); // Transparent

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 5);

  var shaderRes = 240;
  if (window.JJ_SCREENSAVER_CONFIG && window.JJ_SCREENSAVER_CONFIG.resolution) {
    shaderRes = parseInt(window.JJ_SCREENSAVER_CONFIG.resolution, 10) || 240;
  }

  // ─── PS1 Shaders ──────────────────────────────────────────────
  var PS1_VERT = [
    'uniform float uResolution;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clipPos = projectionMatrix * viewPos;',
    '  clipPos.xy = floor(clipPos.xy * uResolution / clipPos.w)',
    '             * clipPos.w / uResolution;',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var PS1_FRAG = [
    'uniform sampler2D uTexture;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 texColor = texture2D(uTexture, vUv);',
    '  gl_FragColor = texColor;',
    '}'
  ].join('\n');

  // ─── State ────────────────────────────────────────────────────
  var currentModel = null;
  var currentData = null;
  var textureLoader = new THREE.TextureLoader();
  var animating = false;

  // ─── Idle Animation ───────────────────────────────────────────
  var idle = {
    rotSpeed: 0.15,       // rad/s Y rotation
    bobAmp: 0.05,         // units vertical
    bobPeriod: 2.5,       // seconds
    tiltXAmp: 0.08,       // rad
    tiltZAmp: 0.08,       // rad
    tiltXFreq: 0.7,       // Hz
    tiltZFreq: 0.5,       // Hz
    time: 0
  };

  // ─── Spring Physics ───────────────────────────────────────────
  var spring = {
    stiffness: 8,
    damping: 0.7,
    // Current angular velocity from drag
    velX: 0,
    velZ: 0,
    active: false
  };

  // ─── Drag State ───────────────────────────────────────────────
  var drag = {
    active: false,
    prevX: 0,
    prevY: 0,
    velY: 0,       // angular velocity for flick spin (Y axis)
    velX: 0,       // angular velocity for flick spin (X axis)
    lastTime: 0
  };

  // ─── Flick Momentum ────────────────────────────────────────────
  var flick = {
    active: false,
    velY: 0,
    velX: 0,
    friction: 0.96  // per-frame decay
  };

  var raycaster = new THREE.Raycaster();

  // ─── Resize ───────────────────────────────────────────────────

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);

  // ─── Model Creation ───────────────────────────────────────────

  function createModel(data) {
    removeModel();

    var geometry;
    if (data.type3d === 'box') {
      geometry = new THREE.BoxGeometry(2.0, 2.0, 0.3);
    } else {
      geometry = new THREE.PlaneGeometry(2.0, 2.0);
    }

    var frontTex = null;
    var backTex = null;

    if (data.imageUrl) {
      frontTex = textureLoader.load(data.imageUrl);
      frontTex.minFilter = THREE.NearestFilter;
      frontTex.magFilter = THREE.NearestFilter;
    }
    if (data.imageBackUrl) {
      backTex = textureLoader.load(data.imageBackUrl);
      backTex.minFilter = THREE.NearestFilter;
      backTex.magFilter = THREE.NearestFilter;
    }

    var mesh;

    if (data.type3d === 'box') {
      var frontMat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.FrontSide
      });
      var backMat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: backTex || frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.FrontSide
      });
      var sideMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

      mesh = new THREE.Mesh(geometry, [
        sideMat, sideMat,
        sideMat, sideMat,
        frontMat, backMat
      ]);
    } else {
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: shaderRes },
          uTexture: { value: frontTex || createFallbackTexture() }
        },
        vertexShader: PS1_VERT,
        fragmentShader: PS1_FRAG,
        side: THREE.DoubleSide
      });
      mesh = new THREE.Mesh(geometry, mat);

      if (backTex) {
        var backGeo = new THREE.PlaneGeometry(2.0, 2.0);
        var backPlaneMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: shaderRes },
            uTexture: { value: backTex }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var backMesh = new THREE.Mesh(backGeo, backPlaneMat);
        backMesh.rotation.y = Math.PI;
        backMesh.position.z = -0.01;
        mesh.add(backMesh);
      }
    }

    mesh.position.set(0, 0, 0);
    mesh.userData.isProductModel = true;
    scene.add(mesh);
    currentModel = mesh;
    currentData = data;

    // Reset idle and spring state
    idle.time = 0;
    spring.velX = 0;
    spring.velZ = 0;
    spring.active = false;

    // Initial entrance angle
    mesh.rotation.y = -0.3;

    startAnimating();
  }

  function createFallbackTexture() {
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#333';
    ctx.font = '10px monospace';
    ctx.fillText('NO IMG', 8, 36);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  function disposeTextures(mat) {
    if (!mat) return;
    if (mat.uniforms && mat.uniforms.uTexture && mat.uniforms.uTexture.value) {
      mat.uniforms.uTexture.value.dispose();
    }
  }

  function removeModel() {
    // Reset drag state in case model is removed mid-drag
    drag.active = false;
    canvas.classList.remove('jj-viewer--dragging');

    if (currentModel) {
      scene.remove(currentModel);
      if (currentModel.geometry) currentModel.geometry.dispose();
      if (Array.isArray(currentModel.material)) {
        for (var i = 0; i < currentModel.material.length; i++) {
          disposeTextures(currentModel.material[i]);
          currentModel.material[i].dispose();
        }
      } else if (currentModel.material) {
        disposeTextures(currentModel.material);
        currentModel.material.dispose();
      }
      var children = currentModel.children.slice();
      for (var j = 0; j < children.length; j++) {
        if (children[j].material) disposeTextures(children[j].material);
        if (children[j].geometry) children[j].geometry.dispose();
        if (children[j].material) children[j].material.dispose();
      }
      currentModel = null;
      currentData = null;
    }
    stopAnimating();
  }

  // ─── Animation Loop ───────────────────────────────────────────

  var lastTime = 0;
  var rafId = null;

  function startAnimating() {
    if (animating) return;
    animating = true;
    lastTime = performance.now();
    resize();
    rafId = requestAnimationFrame(tick);
  }

  function stopAnimating() {
    animating = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // Clear the canvas
    renderer.clear();
  }

  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);

    var dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt
    lastTime = now;

    if (!currentModel) return;

    if (drag.active) {
      // During drag, don't apply idle or spring — user controls rotation
    } else if (flick.active) {
      // Flick momentum: spin with friction decay
      idle.time += dt; // keep idle clock ticking for smooth spring transition
      currentModel.rotation.y += flick.velY;
      currentModel.rotation.x += flick.velX;
      flick.velY *= flick.friction;
      flick.velX *= flick.friction;
      // Once slow enough, transition to spring → idle
      if (Math.abs(flick.velY) < 0.001 && Math.abs(flick.velX) < 0.001) {
        flick.active = false;
        spring.active = true;
        spring.velX = 0;
        spring.velZ = 0;
      }
    } else if (spring.active) {
      // Spring is pulling back to idle orientation
      updateSpring(dt);
    } else {
      // Idle: gentle float
      updateIdle(dt);
    }

    // Bobbing always applies (even during spring settling)
    if (!drag.active) {
      currentModel.position.y = Math.sin(idle.time * (2 * Math.PI / idle.bobPeriod)) * idle.bobAmp;
    }

    renderer.render(scene, camera);
  }

  function updateIdle(dt) {
    idle.time += dt;
    var m = currentModel;
    m.rotation.y += idle.rotSpeed * dt;
    m.rotation.x = Math.sin(idle.time * idle.tiltXFreq * 2 * Math.PI) * idle.tiltXAmp;
    m.rotation.z = Math.sin(idle.time * idle.tiltZFreq * 2 * Math.PI) * idle.tiltZAmp;
  }

  function updateSpring(dt) {
    idle.time += dt;
    var m = currentModel;

    // Target: where idle animation would put the rotation right now
    var targetX = Math.sin(idle.time * idle.tiltXFreq * 2 * Math.PI) * idle.tiltXAmp;
    var targetZ = Math.sin(idle.time * idle.tiltZFreq * 2 * Math.PI) * idle.tiltZAmp;

    // Apply idle Y rotation continuously
    m.rotation.y += idle.rotSpeed * dt;

    // Spring on X axis
    var dx = targetX - m.rotation.x;
    spring.velX += dx * spring.stiffness * dt;
    spring.velX *= Math.pow(1 - spring.damping, dt * 10);
    m.rotation.x += spring.velX * dt;

    // Spring on Z axis (same damped formula as X)
    var dz = targetZ - m.rotation.z;
    spring.velZ += dz * spring.stiffness * dt;
    spring.velZ *= Math.pow(1 - spring.damping, dt * 10);
    m.rotation.z += spring.velZ * dt;

    // Check if spring has settled
    if (Math.abs(dx) < 0.005 && Math.abs(spring.velX) < 0.01 &&
        Math.abs(dz) < 0.005 && Math.abs(spring.velZ) < 0.01) {
      spring.active = false;
    }
  }

  // ─── Drag Interaction (on canvas) ─────────────────────────────

  canvas.addEventListener('mousedown', function (e) {
    if (!currentModel) return;

    var rect = canvas.getBoundingClientRect();
    var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera({ x: mx, y: my }, camera);
    var hits = raycaster.intersectObject(currentModel, true);

    if (hits.length > 0) {
      drag.active = true;
      drag.prevX = e.clientX;
      drag.prevY = e.clientY;
      drag.velY = 0;
      drag.velX = 0;
      drag.lastTime = performance.now();
      flick.active = false;
      canvas.classList.add('jj-viewer--dragging');
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', function (e) {
    if (!drag.active || !currentModel) return;
    var now = performance.now();
    var elapsed = now - drag.lastTime;
    if (elapsed < 1) elapsed = 1;

    var dx = e.clientX - drag.prevX;
    var dy = e.clientY - drag.prevY;

    currentModel.rotation.y += dx * 0.01;
    currentModel.rotation.x += dy * 0.01;

    // Track instantaneous velocity for flick
    drag.velY = (dx * 0.01) * (16 / elapsed); // normalise to ~60fps
    drag.velX = (dy * 0.01) * (16 / elapsed);

    drag.prevX = e.clientX;
    drag.prevY = e.clientY;
    drag.lastTime = now;
  });

  window.addEventListener('mouseup', function () {
    if (drag.active) {
      drag.active = false;
      canvas.classList.remove('jj-viewer--dragging');

      // If released with velocity, start flick spin
      var speed = Math.abs(drag.velY) + Math.abs(drag.velX);
      if (speed > 0.005) {
        flick.active = true;
        flick.velY = drag.velY;
        flick.velX = drag.velX;
      } else {
        // No flick — spring back to idle
        spring.active = true;
        spring.velX = 0;
        spring.velZ = 0;
      }
    }
  });

  // ─── Typewriter Animation ─────────────────────────────────────

  var typeTimer = null;

  function clearType() {
    if (typeTimer) clearTimeout(typeTimer);
    typeTimer = null;
    var cursors = document.querySelectorAll('.jj-pi-cursor');
    for (var i = 0; i < cursors.length; i++) cursors[i].remove();
  }

  function typeField(el, text, msPerChar, cb) {
    if (!el) { if (cb) cb(); return; }
    el.textContent = '';
    var textNode = document.createTextNode('');
    var cursor = document.createElement('span');
    cursor.className = 'jj-pi-cursor';
    el.appendChild(textNode);
    el.appendChild(cursor);

    var idx = 0;
    function step() {
      if (idx < text.length) {
        idx++;
        textNode.textContent = text.substring(0, idx);
        typeTimer = setTimeout(step, msPerChar);
      } else {
        cursor.remove();
        if (cb) cb();
      }
    }
    step();
  }

  function typeSequence(fields) {
    clearType();
    var i = 0;
    function next() {
      if (i >= fields.length) {
        var lastEl = fields[fields.length - 1].el;
        if (lastEl) {
          var cursor = document.createElement('span');
          cursor.className = 'jj-pi-cursor';
          lastEl.appendChild(cursor);
        }
        return;
      }
      var f = fields[i];
      i++;
      typeField(f.el, f.text, f.ms, function () {
        typeTimer = setTimeout(next, 150);
      });
    }
    next();
  }

  // ─── Canvas ↔ Info Box Positioning ────────────────────────────

  var productZone = document.getElementById('jj-product-zone');

  var selectedCoverEl = null;

  function positionCanvasOverBox() {
    if (!infoPanel || !canvas || !productZone) return;
    var zoneRect = productZone.getBoundingClientRect();
    var boxRect = infoPanel.getBoundingClientRect();
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var cw = 550; // canvas width

    // Center canvas horizontally on the box's top-right corner
    var leftPx = (boxRect.right - zoneRect.left) / zoom - cw / 2;

    // Align vertically with the selected catalogue cover, or default above box
    var topPx;
    if (selectedCoverEl) {
      var coverRect = selectedCoverEl.getBoundingClientRect();
      var coverCenterY = (coverRect.top + coverRect.height / 2 - zoneRect.top) / zoom;
      topPx = coverCenterY - cw / 2;
    } else {
      topPx = (boxRect.top - zoneRect.top) / zoom - cw / 2;
    }

    canvas.style.position = 'absolute';
    canvas.style.left = leftPx + 'px';
    canvas.style.top = topPx + 'px';
  }

  // ─── Product Info Panel ───────────────────────────────────────

  var piTitle = document.getElementById('jj-pi-title');
  var piJpTitle = document.getElementById('jj-pi-jp-title');
  var piArtist = document.getElementById('jj-pi-artist');
  var piJpName = document.getElementById('jj-pi-jp-name');
  var piMeta = document.getElementById('jj-pi-meta');
  var piPrice = document.getElementById('jj-pi-price');
  var piAddToCart = document.getElementById('jj-pi-add-to-cart');
  var piView = document.getElementById('jj-pi-view');
  var piVariantId = document.getElementById('jj-pi-variant-id');

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function buildMetaRow(label, value) {
    return '<div class="jj-meta-row"><span class="jj-meta-row__label">' +
           escapeHtml(label) + ':</span> <span class="jj-meta-row__value">' +
           escapeHtml(value) + '</span></div>';
  }

  var infoPanelShown = false;

  function showProductInfo(data) {
    if (!infoPanel) return;
    selectedCoverEl = data.el || null;

    // Artist — will be typed
    if (piArtist) piArtist.textContent = '';

    // JP name (below artist)
    if (piJpName) {
      piJpName.textContent = data.jpName || '';
      piJpName.style.display = data.jpName ? '' : 'none';
    }

    // Title — will be typed
    if (piTitle) piTitle.textContent = '';

    // JP title (below product title, above canvas)
    if (piJpTitle) {
      piJpTitle.textContent = data.jpTitle || '';
      piJpTitle.style.display = data.jpTitle ? '' : 'none';
    }

    // Meta tags — stacked rows
    if (piMeta) {
      var rows = [];
      if (data.formatLabel) rows.push(buildMetaRow('Format', data.formatLabel));
      if (data.year) rows.push(buildMetaRow('Year', data.year));
      if (data.label) rows.push(buildMetaRow('Label', data.label));
      if (data.condition) rows.push(buildMetaRow('Condition', data.condition));
      if (data.code) rows.push(buildMetaRow('Code', data.code));
      piMeta.innerHTML = rows.join('');
    }

    // Price — will be typed
    if (piPrice) piPrice.textContent = '';

    // Variant ID + ATC button
    if (piVariantId) piVariantId.value = data.variantId;
    if (piAddToCart) {
      piAddToCart.disabled = !data.available;
      piAddToCart.textContent = data.available ? '[Add to Cart]' : '[Unavailable]';
    }

    // View button
    if (piView) {
      piView.href = '/products/' + encodeURIComponent(data.handle);
      piView.style.display = '';
    }

    // Show info panel and position canvas over its top-right
    infoPanel.style.display = '';
    positionCanvasOverBox();

    // Only play CRT-on entrance animation the first time
    if (!infoPanelShown) {
      infoPanel.classList.add('jj-product-info--entering');
      infoPanelShown = true;
    }

    // Typewriter: artist → title → price
    typeSequence([
      { el: piArtist, text: (data.artist || data.vendor || '---').toUpperCase(), ms: 38 },
      { el: piTitle, text: data.title || '---', ms: 28 },
      { el: piPrice, text: data.price || '---', ms: 22 }
    ]);
  }

  function hideProductInfo() {
    // Just stop any in-progress typewriter. Keep all content visible —
    // showProductInfo will overwrite it when the next product arrives.
    clearType();
  }

  // ─── Add to Cart ──────────────────────────────────────────────

  if (piAddToCart) {
    piAddToCart.addEventListener('click', function () {
      if (piAddToCart.disabled) return;
      var variantId = piVariantId ? piVariantId.value : '';
      if (!variantId) return;

      piAddToCart.textContent = '[Adding...]';
      piAddToCart.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Cart error');
          return res.json();
        })
        .then(function () {
          piAddToCart.textContent = '[OK]';
          setTimeout(function () {
            piAddToCart.textContent = '[Add to Cart]';
            piAddToCart.disabled = false;
          }, 1500);

          fetch('/cart.js')
            .then(function (r) { return r.json(); })
            .then(function (cart) {
              var cartBtns = document.querySelectorAll('.jj-nav-action-btn');
              for (var i = 0; i < cartBtns.length; i++) {
                if (cartBtns[i].textContent.indexOf('Cart') !== -1) {
                  cartBtns[i].textContent = '[Cart:' + cart.item_count + ']';
                }
              }
            });
        })
        .catch(function () {
          piAddToCart.textContent = '[ERR]';
          setTimeout(function () {
            piAddToCart.textContent = '[Add to Cart]';
            piAddToCart.disabled = false;
          }, 1500);
        });
    });
  }

  // ─── Screensaver Coordination ─────────────────────────────────

  function coordSelect() {
    var portal = window.JJ_Portal;
    if (!portal) return;
    if (portal.tsuno && portal.tsuno.getState() !== 'orbiting') {
      portal.tsuno.setState('transitioning-out');
    }
    if (portal.setParallaxEnabled) portal.setParallaxEnabled(false);
  }

  function coordDeselect() {
    var portal = window.JJ_Portal;
    if (!portal) return;
    if (portal.tsuno && portal.tsuno.getState() !== 'idle') {
      portal.tsuno.setState('returning');
    }
    if (portal.setParallaxEnabled) portal.setParallaxEnabled(true);
  }

  // ─── Event Listeners ─────────────────────────────────────────

  document.addEventListener('jj:product-selected', function (e) {
    var data = e.detail;
    coordSelect();
    createModel(data);
    showProductInfo(data);
  });

  document.addEventListener('jj:product-deselected', function () {
    removeModel();
    coordDeselect();
    hideProductInfo();
  });
})();
