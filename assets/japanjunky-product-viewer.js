/**
 * japanjunky-product-viewer.js
 * 3D product model viewer + product info overlay + typewriter animation.
 *
 * Consumes: window.JJ_Portal (from screensaver)
 * Listens:  jj:product-selected, jj:product-deselected
 */
(function () {
  'use strict';

  // ─── Wait for JJ_Portal ──────────────────────────────────────
  var portal = null;
  var maxWait = 50; // ~5 seconds at 100ms intervals
  var waitCount = 0;

  function waitForPortal(cb) {
    if (window.JJ_Portal) {
      portal = window.JJ_Portal;
      cb();
      return;
    }
    if (++waitCount > maxWait) return; // Give up silently
    setTimeout(function () { waitForPortal(cb); }, 100);
  }

  waitForPortal(init);

  function init() {
    var interactionOverlay = document.getElementById('jj-viewer-interaction');
    var infoPanel = document.getElementById('jj-product-info');
    if (!portal || !portal.scene) return;

    var scene = portal.scene;
    var camera = portal.camera;
    var cssZoom = function () {
      return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    };

    // ─── Product Model State ───────────────────────────────────
    var currentModel = null;
    var currentData = null;
    var textureLoader = new THREE.TextureLoader();
    var isRotating = false;
    var prevMouse = { x: 0, y: 0 };

    // Model position in scene (left-center, where Tsuno Daishi was)
    var MODEL_POS = { x: -1.5, y: 0, z: 8 };

    // PS1 vertex snapping shader
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

    // ─── Model Creation ────────────────────────────────────────

    function createModel(data) {
      removeModel();

      var geometry;
      if (data.type3d === 'box') {
        geometry = new THREE.BoxGeometry(2.0, 2.8, 0.3);
      } else {
        geometry = new THREE.PlaneGeometry(2.0, 2.8);
      }

      // Load front texture
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
        // Box: 6 faces. Index: +x, -x, +y, -y, +z (front), -z (back)
        var frontMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var backMat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: backTex || frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.FrontSide
        });
        var sideMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        // Box face order: +x, -x, +y, -y, +z, -z
        mesh = new THREE.Mesh(geometry, [
          sideMat, sideMat,     // right, left
          sideMat, sideMat,     // top, bottom
          frontMat, backMat     // front, back
        ]);
      } else {
        // Plane: double-sided with front/back textures
        var mat = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: parseFloat(portal.resH) },
            uTexture: { value: frontTex || createFallbackTexture() }
          },
          vertexShader: PS1_VERT,
          fragmentShader: PS1_FRAG,
          side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(geometry, mat);

        // If back texture, add a second plane slightly behind
        if (backTex) {
          var backGeo = new THREE.PlaneGeometry(2.0, 2.8);
          var backPlaneMat = new THREE.ShaderMaterial({
            uniforms: {
              uResolution: { value: parseFloat(portal.resH) },
              uTexture: { value: backTex }
            },
            vertexShader: PS1_VERT,
            fragmentShader: PS1_FRAG,
            side: THREE.FrontSide
          });
          var backMesh = new THREE.Mesh(backGeo, backPlaneMat);
          backMesh.rotation.y = Math.PI; // Flip to face backward
          backMesh.position.z = -0.01;   // Slight offset to avoid z-fighting
          mesh.add(backMesh);
        }
      }

      mesh.position.set(MODEL_POS.x, MODEL_POS.y, MODEL_POS.z);
      mesh.userData.isProductModel = true;
      scene.add(mesh);
      currentModel = mesh;
      currentData = data;

      // Initial entrance spin
      mesh.rotation.y = -0.3;

      // Enable interaction overlay
      if (interactionOverlay) {
        interactionOverlay.classList.add('jj-viewer-interaction--active');
      }
    }

    function createFallbackTexture() {
      var canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#333';
      ctx.font = '10px monospace';
      ctx.fillText('NO IMG', 8, 36);
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      return tex;
    }

    function removeModel() {
      if (currentModel) {
        scene.remove(currentModel);
        // Dispose geometry and materials
        if (currentModel.geometry) currentModel.geometry.dispose();
        if (Array.isArray(currentModel.material)) {
          currentModel.material.forEach(function (m) { m.dispose(); });
        } else if (currentModel.material) {
          currentModel.material.dispose();
        }
        // Dispose child meshes (back face plane)
        currentModel.children.forEach(function (child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        currentModel = null;
        currentData = null;
      }

      // Disable interaction overlay
      if (interactionOverlay) {
        interactionOverlay.classList.remove('jj-viewer-interaction--active');
        interactionOverlay.classList.remove('jj-viewer-interaction--dragging');
      }
    }

    // ─── Drag to Rotate ────────────────────────────────────────

    var raycaster = new THREE.Raycaster(); // Reusable instance

    if (interactionOverlay) {
      interactionOverlay.addEventListener('mousedown', function (e) {
        if (!currentModel) return;

        // Raycast to check if clicking on the model
        var z = cssZoom();
        var rect = interactionOverlay.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera({ x: mx, y: my }, camera);

        var intersects = raycaster.intersectObject(currentModel, true);
        if (intersects.length > 0) {
          isRotating = true;
          prevMouse.x = e.clientX / z;
          prevMouse.y = e.clientY / z;
          interactionOverlay.classList.add('jj-viewer-interaction--dragging');
          e.preventDefault();
        }
      });

      window.addEventListener('mousemove', function (e) {
        if (!isRotating || !currentModel) return;
        var z = cssZoom();
        var dx = (e.clientX / z) - prevMouse.x;
        var dy = (e.clientY / z) - prevMouse.y;

        currentModel.rotation.y += dx * 0.01;
        currentModel.rotation.x += dy * 0.01;

        prevMouse.x = e.clientX / z;
        prevMouse.y = e.clientY / z;
      });

      window.addEventListener('mouseup', function () {
        if (isRotating) {
          isRotating = false;
          if (interactionOverlay) {
            interactionOverlay.classList.remove('jj-viewer-interaction--dragging');
          }
        }
      });
    }

    // ─── Typewriter Animation ──────────────────────────────────

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
      function tick() {
        if (idx < text.length) {
          idx++;
          textNode.textContent = text.substring(0, idx);
          typeTimer = setTimeout(tick, msPerChar);
        } else {
          cursor.remove();
          if (cb) cb();
        }
      }
      tick();
    }

    function typeSequence(fields) {
      clearType();
      var i = 0;
      function next() {
        if (i >= fields.length) {
          // Keep cursor on last field
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

    // ─── Product Info Overlay ──────────────────────────────────

    var piHeader = document.getElementById('jj-pi-header');
    var piArtist = document.getElementById('jj-pi-artist');
    var piTitle = document.getElementById('jj-pi-title');
    var piPrice = document.getElementById('jj-pi-price');
    var piMeta = document.getElementById('jj-pi-meta');
    var piDesc = document.getElementById('jj-pi-desc');
    var piVariants = document.getElementById('jj-pi-variants');
    var piAddToCart = document.getElementById('jj-pi-add-to-cart');
    var piVariantId = document.getElementById('jj-pi-variant-id');

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    function showProductInfo(data) {
      if (!infoPanel) return;

      // Header
      if (piHeader) piHeader.textContent = 'C:\\catalog\\' + data.handle + '.dat';

      // Clear fields for typewriter
      if (piArtist) piArtist.textContent = '';
      if (piTitle) piTitle.textContent = '';
      if (piPrice) piPrice.textContent = '';

      // Meta
      if (piMeta) {
        piMeta.innerHTML = [
          '<div><span class="jj-meta-label">Code:</span> <span class="jj-meta-value">' + escapeHtml(data.code || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Label:</span> <span class="jj-meta-value">' + escapeHtml(data.label || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Format:</span> <span class="jj-meta-value">' + escapeHtml(data.formatLabel || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Year:</span> <span class="jj-meta-value">' + escapeHtml(data.year || '---') + '</span></div>',
          '<div><span class="jj-meta-label">Condition:</span> <span class="jj-meta-value">' + escapeHtml(data.condition || '---') + '</span></div>'
        ].join('');
      }

      // Description — populated by the variant fetch
      if (piDesc) piDesc.textContent = '';

      // Variant selector — fetch product variants and build dropdown
      if (piVariants && piVariantId) {
        piVariants.innerHTML = '';
        fetch('/products/' + data.handle + '.js')
          .then(function (res) { return res.json(); })
          .then(function (product) {
            if (product.variants && product.variants.length > 1) {
              var sel = document.createElement('select');
              sel.className = 'jj-variant-select';
              for (var vi = 0; vi < product.variants.length; vi++) {
                var v = product.variants[vi];
                var opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.title + ' — ' + (v.price / 100).toFixed(2);
                if (String(v.id) === String(data.variantId)) opt.selected = true;
                if (!v.available) opt.disabled = true;
                sel.appendChild(opt);
              }
              piVariants.appendChild(sel);

              // Variant change: update price, variant ID, and swap model texture
              sel.addEventListener('change', function () {
                var newVariantId = sel.value;
                piVariantId.value = newVariantId;

                // Find the variant in the fetched data to get its image
                var selectedVariant = null;
                for (var sv = 0; sv < product.variants.length; sv++) {
                  if (String(product.variants[sv].id) === newVariantId) {
                    selectedVariant = product.variants[sv];
                    break;
                  }
                }

                // Update ATC state
                if (piAddToCart) {
                  piAddToCart.disabled = selectedVariant && !selectedVariant.available;
                  piAddToCart.textContent = (selectedVariant && selectedVariant.available) ? '[Add to Cart]' : '[Unavailable]';
                }

                // Swap 3D model texture if variant has a featured image
                if (selectedVariant && selectedVariant.featured_image && currentModel) {
                  var newTexUrl = selectedVariant.featured_image.src;
                  var newTex = textureLoader.load(newTexUrl);
                  newTex.minFilter = THREE.NearestFilter;
                  newTex.magFilter = THREE.NearestFilter;
                  // Update the front face material
                  if (Array.isArray(currentModel.material)) {
                    // Box: front face is index 4
                    if (currentModel.material[4] && currentModel.material[4].uniforms) {
                      currentModel.material[4].uniforms.uTexture.value = newTex;
                    }
                  } else if (currentModel.material && currentModel.material.uniforms) {
                    currentModel.material.uniforms.uTexture.value = newTex;
                  }
                }
              });

              // Also populate description from the same fetch
              if (piDesc && product.description) {
                var text = product.description.replace(/<[^>]*>/g, '').substring(0, 200);
                piDesc.textContent = text;
              }
            }
          })
          .catch(function () {});
      }

      // Variant ID + ATC button (initial state from row data)
      if (piVariantId) piVariantId.value = data.variantId;
      if (piAddToCart) {
        piAddToCart.disabled = !data.available;
        piAddToCart.textContent = data.available ? '[Add to Cart]' : '[Unavailable]';
      }

      // Show panel with CRT-on effect
      infoPanel.style.display = '';
      infoPanel.classList.remove('jj-product-info--entering');
      void infoPanel.offsetHeight; // Force reflow
      infoPanel.classList.add('jj-product-info--entering');

      // Typewriter sequence
      typeSequence([
        { el: piArtist, text: (data.artist || data.vendor || '---').toUpperCase(), ms: 38 },
        { el: piTitle, text: data.title || '---', ms: 28 },
        { el: piPrice, text: data.price || '---', ms: 22 }
      ]);
    }

    function hideProductInfo() {
      clearType();
      if (infoPanel) infoPanel.style.display = 'none';
    }

    // ─── Add to Cart ───────────────────────────────────────────

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

            // Update cart count in header
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

    // ─── Event Listeners ───────────────────────────────────────

    document.addEventListener('jj:product-selected', function (e) {
      var data = e.detail;

      // Transition Tsuno Daishi out
      if (portal.tsuno && portal.tsuno.getState() !== 'orbiting') {
        portal.tsuno.setState('transitioning-out');
      }

      // Disable parallax during product viewing
      portal.setParallaxEnabled(false);

      // Create 3D model
      createModel(data);

      // Show product info overlay
      showProductInfo(data);
    });

    document.addEventListener('jj:product-deselected', function () {
      // Remove 3D model
      removeModel();

      // Return Tsuno Daishi
      if (portal.tsuno && portal.tsuno.getState() !== 'idle') {
        portal.tsuno.setState('returning');
      }

      // Re-enable parallax
      portal.setParallaxEnabled(true);

      // Hide product info overlay
      hideProductInfo();
    });
  }
})();
