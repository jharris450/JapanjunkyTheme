/**
 * japanjunky-product-grid.js
 * Screen-2 product grid: wheel paging from hero, hero UI fade,
 * card rendering + search/filter bar (relocated from ring carousel).
 *
 * Consumes: window.JJ_PRODUCTS (from jj-homepage-body.liquid)
 */
(function () {
  'use strict';

  var allProducts = window.JJ_PRODUCTS || [];

  var scroll = document.getElementById('jj-scroll');
  var gridEl = document.getElementById('jj-grid');
  if (!scroll || !gridEl) return;

  // ─── Wheel Scroll (seamless hero ↔ grid, eased) ────────────────
  // All homepage wheel input (hero AND grid) runs through one eased
  // animator for a consistent smooth feel: each wheel event moves a
  // target offset, a rAF loop exponentially eases scrollTop toward it.
  // Scrollable overlays (filter dropdowns, start menu, taskbar) keep
  // native scrolling and are excluded.

  var scrollTarget = 0;
  var scrollAnimating = false;
  var scrollLastTime = 0;

  function maxScroll() {
    return scroll.scrollHeight - scroll.clientHeight;
  }

  function scrollTick(now) {
    if (!scrollAnimating) return;
    var dt = Math.min((now - scrollLastTime) / 1000, 0.05);
    scrollLastTime = now;
    var diff = scrollTarget - scroll.scrollTop;
    if (Math.abs(diff) < 0.5) {
      scroll.scrollTop = scrollTarget;
      scrollAnimating = false;
      return;
    }
    scroll.scrollTop += diff * (1 - Math.exp(-8 * dt));
    requestAnimationFrame(scrollTick);
  }

  function startScrollAnim() {
    if (scrollAnimating) return;
    scrollAnimating = true;
    scrollLastTime = performance.now();
    requestAnimationFrame(scrollTick);
  }

  function toGrid() {
    scrollTarget = Math.min(scroll.clientHeight, maxScroll());
    startScrollAnim();
  }

  var indicator = document.getElementById('jj-scroll-indicator');
  if (indicator) indicator.addEventListener('click', toGrid);

  document.addEventListener('wheel', function (e) {
    if (window.JJ_SPLASH_ACTIVE) return;                       // splash owns first interaction
    if (e.target.closest('.jj-ring__cover')) return;           // ring rotation owns covers only
    if (e.target.closest('.jj-grid__dropdown')) return;        // dropdown scrolls natively
    if (e.target.closest('.jj-taskbar') || e.target.closest('.jj-start-menu')) return;
    e.preventDefault(); // we drive the wrapper ourselves — no native double-scroll
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;        // line mode (Firefox)
    else if (e.deltaMode === 2) delta *= scroll.clientHeight; // page mode
    if (!scrollAnimating) scrollTarget = scroll.scrollTop; // resync after native moves
    scrollTarget = Math.max(0, Math.min(maxScroll(), scrollTarget + delta));
    startScrollAnim();
  }, { passive: false });

  // ─── Hero UI Fade ──────────────────────────────────────────────
  scroll.addEventListener('scroll', function () {
    var active = scroll.scrollTop > scroll.clientHeight * 0.5;
    document.body.classList.toggle('jj-grid-active', active);
  }, { passive: true });

  // ─── Spinning Cover Engine ─────────────────────────────────────
  // Same idle spin as the hero 3D viewer (japanjunky-product-viewer.js):
  // PS1 vertex-snap shader, slow Y rotation, sine tilt + bob. One shared
  // offscreen WebGL renderer draws every visible card into its own 2D
  // canvas — per-card WebGL contexts would exhaust the browser limit.
  var spinEngine = (function () {
    if (typeof THREE === 'undefined') return null;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

    var SIZE = 180;
    var glCanvas = document.createElement('canvas');
    glCanvas.width = SIZE;
    glCanvas.height = SIZE;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: false });
    } catch (err) {
      return null; // WebGL unavailable — cards fall back to static images
    }
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 2.9);

    var shaderRes = 240;
    if (window.JJ_SCREENSAVER_CONFIG && window.JJ_SCREENSAVER_CONFIG.resolution) {
      shaderRes = parseInt(window.JJ_SCREENSAVER_CONFIG.resolution, 10) || 240;
    }

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
      '  gl_FragColor = texture2D(uTexture, vUv);',
      '}'
    ].join('\n');

    var material = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: shaderRes },
        uTexture: { value: null }
      },
      vertexShader: PS1_VERT,
      fragmentShader: PS1_FRAG,
      side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), material);
    scene.add(mesh);

    // Pure turntable spin — no tilt sway or bob (split from the viewer's
    // idle wiggle on purpose). Faster than the viewer so the motion reads.
    var ROT_SPEED = 0.4; // rad/s (~16s per revolution)

    var textureLoader = new THREE.TextureLoader();
    var texCache = {}; // url → THREE.Texture (persists across refilters)

    function getTexture(url) {
      if (!texCache[url]) {
        var tex = textureLoader.load(url);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        texCache[url] = tex;
      }
      return texCache[url];
    }

    var cards = []; // { ctx, tex, ySeed, visible }
    var rafId = null;
    var lastTime = 0;
    var clock = 0;

    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var card = entries[i].target._jjSpinCard;
        if (card) card.visible = entries[i].isIntersecting;
      }
      syncLoop();
    });

    function anyVisible() {
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].visible) return true;
      }
      return false;
    }

    function syncLoop() {
      var run = anyVisible() && !document.hidden;
      if (run && !rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      } else if (!run && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    document.addEventListener('visibilitychange', syncLoop);

    function tick(now) {
      rafId = requestAnimationFrame(tick);
      var dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      clock += dt;

      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (!c.visible) continue;
        if (!c.tex.image || !c.tex.image.width) continue; // texture still loading
        mesh.rotation.y = c.ySeed + clock * ROT_SPEED;
        material.uniforms.uTexture.value = c.tex;
        renderer.render(scene, camera);
        c.ctx.clearRect(0, 0, SIZE, SIZE);
        c.ctx.drawImage(glCanvas, 0, 0);
      }
    }

    return {
      attach: function (wrap, url, label) {
        var cv = document.createElement('canvas');
        cv.className = 'jj-grid__card-canvas';
        cv.width = SIZE;
        cv.height = SIZE;
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', label);
        var card = {
          ctx: cv.getContext('2d'),
          tex: getTexture(url),
          ySeed: -0.3 + (Math.random() - 0.5) * 1.2,
          visible: false
        };
        cv._jjSpinCard = card;
        cards.push(card);
        wrap.appendChild(cv);
        observer.observe(cv);
      },
      reset: function () {
        observer.disconnect();
        cards = [];
        syncLoop();
      }
    };
  })();

  // ─── Card Rendering ────────────────────────────────────────────

  var filteredProducts = allProducts.slice();

  function textDiv(className, text) {
    var d = document.createElement('div');
    d.className = className;
    d.textContent = text;
    return d;
  }

  function createCard(p) {
    var card = document.createElement('a');
    card.className = 'jj-grid__card';
    card.href = '/products/' + encodeURIComponent(p.handle);
    card.setAttribute('data-format', p.format || '');

    var imgWrap = document.createElement('div');
    imgWrap.className = 'jj-grid__card-img-wrap';
    var alt = (p.artist ? p.artist + ' - ' : '') + p.title;
    if (p.image && spinEngine) {
      spinEngine.attach(imgWrap, p.image, alt);
    } else if (p.image) {
      var img = document.createElement('img');
      img.className = 'jj-grid__card-img';
      img.src = p.image;
      img.alt = alt;
      img.loading = 'lazy';
      img.width = 180;
      img.height = 180;
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = '<span class="jj-grid__card-noimg">&#9670;</span>';
    }
    card.appendChild(imgWrap);

    if (p.artist) card.appendChild(textDiv('jj-grid__card-artist', p.artist));
    card.appendChild(textDiv('jj-grid__card-title', p.title));

    var row = document.createElement('div');
    row.className = 'jj-grid__card-row';
    row.appendChild(textDiv('jj-grid__card-price', p.price));
    if (p.format) {
      var badge = document.createElement('span');
      badge.className = 'jj-grid__card-format';
      badge.setAttribute('data-format', p.format);
      badge.textContent = p.format.toUpperCase();
      row.appendChild(badge);
    }
    card.appendChild(row);

    if (p.condition && p.condition !== 'n/a') {
      card.appendChild(textDiv('jj-grid__card-cond', p.condition.toUpperCase()));
    }

    return card;
  }

  function renderGrid() {
    if (spinEngine) spinEngine.reset();
    gridEl.innerHTML = '';
    if (filteredProducts.length === 0) {
      gridEl.innerHTML = '<div class="jj-grid__empty">NO ITEMS FOUND</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < filteredProducts.length; i++) {
      frag.appendChild(createCard(filteredProducts[i]));
    }
    gridEl.appendChild(frag);
  }


  // ─── Filter State ──────────────────────────────────────────────
  var activeFilters = {
    format: {},    // value → true (plain objects as sets for ES5)
    decade: {},
    condition: {}
  };
  var searchQuery = '';

  function setHas(obj, key) { return obj.hasOwnProperty(key); }
  function setAdd(obj, key) { obj[key] = true; }
  function setDel(obj, key) { delete obj[key]; }
  function setSize(obj) { var n = 0; for (var k in obj) { if (obj.hasOwnProperty(k)) n++; } return n; }

  // ─── Filtering ─────────────────────────────────────────────────

  function matchesFilters(product) {
    if (setSize(activeFilters.format) > 0) {
      if (!setHas(activeFilters.format, product.format)) return false;
    }
    if (setSize(activeFilters.decade) > 0) {
      var year = parseInt(product.year, 10);
      if (isNaN(year)) return false;
      var decade = String(Math.floor(year / 10) * 10);
      if (!setHas(activeFilters.decade, decade)) return false;
    }
    if (setSize(activeFilters.condition) > 0) {
      if (!setHas(activeFilters.condition, product.condition)) return false;
    }
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var title = (product.title || '').toLowerCase();
      var artist = (product.artist || '').toLowerCase();
      if (title.indexOf(q) === -1 && artist.indexOf(q) === -1) return false;
    }
    return true;
  }

  function refilter() {
    filteredProducts = [];
    for (var i = 0; i < allProducts.length; i++) {
      if (matchesFilters(allProducts[i])) {
        filteredProducts.push(allProducts[i]);
      }
    }
    renderGrid();
    updateCount();
    updateClearBtn(); // covers every state source, incl. search-only
  }

  // ─── Count Display ─────────────────────────────────────────────

  var countEl = document.getElementById('jj-grid-count');

  function updateCount() {
    if (!countEl) return;
    if (filteredProducts.length === allProducts.length) {
      countEl.textContent = allProducts.length + ' ITEMS';
    } else {
      countEl.textContent = filteredProducts.length + ' OF ' + allProducts.length + ' ITEMS';
    }
  }

  // ─── Filter Bar UI ─────────────────────────────────────────────

  var searchInput = document.getElementById('jj-grid-search');
  var clearBtn = document.getElementById('jj-grid-clear');
  var debounceTimer = null;

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        searchQuery = searchInput.value.trim();
        refilter();
      }, 100);
    });
  }

  var filterBtns = document.querySelectorAll('.jj-grid__filter-btn');
  for (var b = 0; b < filterBtns.length; b++) {
    (function (btn) {
      var group = btn.getAttribute('data-filter-group');
      var dropdown = btn.querySelector('.jj-grid__dropdown');
      if (!group || !dropdown) return;

      // Build dropdown items from the catalog
      var values = {};
      for (var p = 0; p < allProducts.length; p++) {
        var val = '';
        if (group === 'format') {
          val = allProducts[p].format;
        } else if (group === 'decade') {
          var yr = parseInt(allProducts[p].year, 10);
          if (!isNaN(yr) && yr >= 1900) val = String(Math.floor(yr / 10) * 10);
        } else if (group === 'condition') {
          val = allProducts[p].condition;
        }
        if (val) values[val] = true;
      }

      var sorted = [];
      for (var v in values) { if (values.hasOwnProperty(v)) sorted.push(v); }
      sorted.sort();

      dropdown.innerHTML = '';
      for (var s = 0; s < sorted.length; s++) {
        var item = document.createElement('div');
        item.className = 'jj-grid__dropdown-item';
        item.setAttribute('data-filter-value', sorted[s]);
        item.setAttribute('role', 'checkbox');
        item.setAttribute('aria-checked', 'false');
        item.setAttribute('tabindex', '0');

        var check = document.createElement('span');
        check.className = 'jj-grid__dropdown-check';
        check.textContent = ' ';

        var lbl = document.createElement('span');
        lbl.textContent = sorted[s].toUpperCase();
        if (group === 'decade') lbl.textContent = sorted[s] + 's';

        item.appendChild(check);
        item.appendChild(lbl);
        dropdown.appendChild(item);
      }

      btn.addEventListener('click', function (e) {
        if (e.target.closest('.jj-grid__dropdown')) return;
        var isOpen = dropdown.classList.contains('jj-grid__dropdown--open');
        closeAllDropdowns();
        if (!isOpen) dropdown.classList.add('jj-grid__dropdown--open');
      });

      dropdown.addEventListener('click', function (e) {
        var itemEl = e.target.closest('.jj-grid__dropdown-item');
        if (!itemEl) return;
        e.stopPropagation();
        e.preventDefault();

        var filterVal = itemEl.getAttribute('data-filter-value');
        if (!filterVal) return;

        if (setHas(activeFilters[group], filterVal)) {
          setDel(activeFilters[group], filterVal);
          itemEl.classList.remove('jj-grid__dropdown-item--active');
          itemEl.querySelector('.jj-grid__dropdown-check').textContent = ' ';
          itemEl.setAttribute('aria-checked', 'false');
        } else {
          setAdd(activeFilters[group], filterVal);
          itemEl.classList.add('jj-grid__dropdown-item--active');
          itemEl.querySelector('.jj-grid__dropdown-check').textContent = 'x';
          itemEl.setAttribute('aria-checked', 'true');
        }

        updateFilterBtnState(btn, group);
        refilter();
      });

      dropdown.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          var itemEl = e.target.closest('.jj-grid__dropdown-item');
          if (itemEl) {
            e.preventDefault();
            itemEl.click();
          }
        }
      });
    })(filterBtns[b]);
  }

  function closeAllDropdowns() {
    var open = document.querySelectorAll('.jj-grid__dropdown--open');
    for (var i = 0; i < open.length; i++) {
      open[i].classList.remove('jj-grid__dropdown--open');
    }
  }

  function updateFilterBtnState(btn, group) {
    var count = setSize(activeFilters[group]);
    var badge = btn.querySelector('.jj-grid__filter-badge');
    if (count > 0) {
      btn.classList.add('jj-grid__filter-btn--active');
      if (badge) badge.textContent = '(' + count + ')';
    } else {
      btn.classList.remove('jj-grid__filter-btn--active');
      if (badge) badge.textContent = '';
    }
    updateClearBtn();
  }

  function updateClearBtn() {
    if (!clearBtn) return;
    var hasFilters = setSize(activeFilters.format) > 0 ||
                     setSize(activeFilters.decade) > 0 ||
                     setSize(activeFilters.condition) > 0 ||
                     searchQuery !== '';
    if (hasFilters) {
      clearBtn.classList.add('jj-grid__clear-btn--visible');
    } else {
      clearBtn.classList.remove('jj-grid__clear-btn--visible');
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      activeFilters.format = {};
      activeFilters.decade = {};
      activeFilters.condition = {};
      searchQuery = '';
      if (searchInput) searchInput.value = '';

      var items = document.querySelectorAll('.jj-grid__dropdown-item--active');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('jj-grid__dropdown-item--active');
        items[i].querySelector('.jj-grid__dropdown-check').textContent = ' ';
        items[i].setAttribute('aria-checked', 'false');
      }
      for (var b = 0; b < filterBtns.length; b++) {
        filterBtns[b].classList.remove('jj-grid__filter-btn--active');
        var badge = filterBtns[b].querySelector('.jj-grid__filter-badge');
        if (badge) badge.textContent = '';
      }

      updateClearBtn();
      refilter();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.jj-grid__filter-btn')) {
      closeAllDropdowns();
    }
  });

  // ─── Init ──────────────────────────────────────────────────────
  renderGrid();
  updateCount();

})();
