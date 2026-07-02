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

  var scroll = document.getElementById('jj-scroll'); // null on standalone (collection/search) pages
  var gridEl = document.getElementById('jj-grid');
  if (!gridEl) return; // grid is required; hero (#jj-scroll) is homepage-only

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

  if (scroll) {
    var indicator = document.getElementById('jj-scroll-indicator');
    if (indicator) indicator.addEventListener('click', toGrid);

    document.addEventListener('wheel', function (e) {
      if (window.JJ_SPLASH_ACTIVE) return;                       // splash owns first interaction
      // Ring rotation owns covers via stopPropagation (ring-carousel.js);
      // wheel events it releases at the crescent ends land here → catalog.
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

    // ─── Hero UI Fade + Tsuno wake ─────────────────────────────────
    var tsunoWoken = false;
    scroll.addEventListener('scroll', function () {
      var active = scroll.scrollTop > scroll.clientHeight * 0.5;
      document.body.classList.toggle('jj-grid-active', active);
      // First time the grid takes over, wake Tsuno's personality system
      // (mirrors a ring-product selection). Fires once per page load.
      if (active && !tsunoWoken) {
        tsunoWoken = true;
        document.dispatchEvent(new CustomEvent('jj:tsuno-wake'));
      }
    }, { passive: true });
  }

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

    // Front + back planes (mirrors japanjunky-product-viewer.js): the back
    // plane is flipped 180° so a card's 2nd image rides the reverse face.
    // Both materials are shared and swapped per-card before each render.
    var frontMat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: shaderRes },
        uTexture: { value: null }
      },
      vertexShader: PS1_VERT,
      fragmentShader: PS1_FRAG,
      side: THREE.FrontSide
    });
    var backMat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: shaderRes },
        uTexture: { value: null }
      },
      vertexShader: PS1_VERT,
      fragmentShader: PS1_FRAG,
      side: THREE.FrontSide
    });
    var mesh = new THREE.Group();
    var frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), frontMat);
    var backMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), backMat);
    backMesh.rotation.y = Math.PI;
    mesh.add(frontMesh);
    mesh.add(backMesh);
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

    var cards = []; // { ctx, tex, visible }
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

      // All cards share one synchronized rotation
      mesh.rotation.y = -0.3 + clock * ROT_SPEED;

      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (!c.visible) continue;
        if (!c.frontTex.image || !c.frontTex.image.width) continue; // texture still loading
        frontMat.uniforms.uTexture.value = c.frontTex;
        // Back falls back to the front image until/unless a 2nd image loads
        var bt = (c.backTex.image && c.backTex.image.width) ? c.backTex : c.frontTex;
        backMat.uniforms.uTexture.value = bt;
        renderer.render(scene, camera);
        c.ctx.clearRect(0, 0, SIZE, SIZE);
        c.ctx.drawImage(glCanvas, 0, 0);
      }
    }

    return {
      attach: function (wrap, url, backUrl, label) {
        var cv = document.createElement('canvas');
        cv.className = 'jj-grid__card-canvas';
        cv.width = SIZE;
        cv.height = SIZE;
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', label);
        var frontTex = getTexture(url);
        var card = {
          ctx: cv.getContext('2d'),
          frontTex: frontTex,
          backTex: backUrl ? getTexture(backUrl) : frontTex, // default to 1st image
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

  // ─── Price Strobe ──────────────────────────────────────────────
  // Sequential phosphor cycle (cursor palette). Advances by index — never
  // skips a color — once the previous one has held HOLD_MS of wall-clock
  // time. Frame-count stepping fused colors together on high-refresh
  // displays; pure CSS keyframes aliased under WebGL frame drops.
  (function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Ordered so neighbors contrast hard — no warm/cool runs that blur
    var PALETTE = [
      '#e8313a', // red
      '#00e5e5', // cyan
      '#f5d742', // gold
      '#e040e0', // magenta
      '#33ff33', // green
      '#ffaa00'  // amber
    ];
    var HOLD_MS = 55; // ~18 colors/s, each distinctly visible
    var idx = 0;
    var last = 0;
    function strobe(now) {
      requestAnimationFrame(strobe);
      if (now - last < HOLD_MS) return;
      last = now;
      idx = (idx + 1) % PALETTE.length;
      gridEl.style.setProperty('--jj-price-strobe', PALETTE[idx]);
    }
    requestAnimationFrame(strobe);
  })();

  // ─── Card Rendering ────────────────────────────────────────────

  // Collapse per-condition variant entries into one card per product.
  // JJ_PRODUCTS has one entry per variant (each variant = a condition);
  // group by product id so each title shows once carrying all conditions.
  function buildCards(variants) {
    var byId = {};
    var order = [];
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var key = v.id;
      if (!byId[key]) {
        var card = {};
        for (var k in v) { if (v.hasOwnProperty(k)) card[k] = v[k]; }
        card.conditions = [];
        card.available = false;
        byId[key] = card;
        order.push(key);
      }
      var c = byId[key];
      c.conditions.push({
        condition: v.condition,
        variantId: v.variantId,
        available: v.available,
        price: v.price,
        priceCents: v.priceCents
      });
      if (v.available) c.available = true;
    }
    // Representative price for sort/strobe: cheapest in-stock, else cheapest
    var cards = [];
    for (var o = 0; o < order.length; o++) {
      var cc = byId[order[o]];
      var best = null;
      for (var j = 0; j < cc.conditions.length; j++) {
        var cond = cc.conditions[j];
        if (typeof cond.priceCents !== 'number') continue;
        var pref = cond.available ? 0 : 1;
        if (best === null || pref < best.pref ||
            (pref === best.pref && cond.priceCents < best.priceCents)) {
          best = { pref: pref, priceCents: cond.priceCents, price: cond.price };
        }
      }
      if (best) { cc.priceCents = best.priceCents; cc.price = best.price; }
      cards.push(cc);
    }
    return cards;
  }

  var allCards = buildCards(allProducts);
  var filteredProducts = allCards.slice();

  function textDiv(className, text) {
    var d = document.createElement('div');
    d.className = className;
    d.textContent = text;
    return d;
  }

  // Same mapping as japanjunky-product-viewer.js / sections/jj-product.liquid
  function getConditionClass(cond) {
    var c = (cond || '').toString().toLowerCase().trim();
    if (c === 'm' || c === 'n' || c === 'mint' || c === 'new' || c === 'sealed') return 'jj-cond-m';
    if (c === 'nm' || c === 'near mint' || c.indexOf('ex') !== -1) return 'jj-cond-nm';
    if (c === 'vg' || c === 'vg+' || c.indexOf('very') !== -1) return 'jj-cond-vg';
    return 'jj-cond-g';
  }

  // Quick add-to-cart (mirrors the viewer's ATC flow)
  function quickAdd(btn, variantId) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '[ADDING...]';
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
        btn.textContent = '[OK]';
        if (window.jjRefreshCart) window.jjRefreshCart();
        setTimeout(function () {
          btn.textContent = '[+ CART]';
          btn.disabled = false;
        }, 1200);
      })
      .catch(function () {
        btn.textContent = '[ERR]';
        setTimeout(function () {
          btn.textContent = '[+ CART]';
          btn.disabled = false;
        }, 1200);
      });
  }

  function createCard(p) {
    var card = document.createElement('a');
    card.className = 'jj-grid__card';
    card.href = '/products/' + encodeURIComponent(p.handle);
    card.setAttribute('data-format', p.format || '');
    if (p.audioUrl) card.setAttribute('data-audio-url', p.audioUrl);
    if (p.youtubeUrl) card.setAttribute('data-youtube-url', p.youtubeUrl);
    if (p.labelUrl) card.setAttribute('data-label-url', p.labelUrl);
    if (p.bpm) card.setAttribute('data-bpm', p.bpm);
    if (!p.available) card.className += ' jj-grid__card--soldout';

    var imgWrap = document.createElement('div');
    imgWrap.className = 'jj-grid__card-img-wrap';
    var alt = (p.artist ? p.artist + ' - ' : '') + p.title;
    if (p.image && spinEngine) {
      spinEngine.attach(imgWrap, p.image, p.imageBack, alt);
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
    var priceEl = textDiv('jj-grid__card-price', p.price);
    row.appendChild(priceEl);
    if (p.format) {
      var badge = document.createElement('span');
      badge.className = 'jj-grid__card-format';
      badge.setAttribute('data-format', p.format);
      badge.textContent = p.format.toUpperCase();
      row.appendChild(badge);
    }
    card.appendChild(row);

    // ─── Condition chips ─────────────────────────────────────────
    // All conditions shown together. In-stock = colored + selectable,
    // out-of-stock = greyed + struck. Selecting drives which variant the
    // add button buys and which price the row shows.
    var conds = p.conditions || [];
    var selected = null;
    for (var s = 0; s < conds.length; s++) {
      if (conds[s].available) { selected = conds[s]; break; }
    }

    // Skip placeholder 'n/a' conditions (hardware etc. have no grade)
    var showConds = [];
    for (var sc = 0; sc < conds.length; sc++) {
      var cv = (conds[sc].condition || '').toLowerCase();
      if (cv && cv !== 'n/a') showConds.push(conds[sc]);
    }

    if (showConds.length) {
      var condWrap = document.createElement('div');
      condWrap.className = 'jj-grid__card-conds';
      for (var ci = 0; ci < showConds.length; ci++) {
        (function (cond) {
          var chip = document.createElement('span');
          chip.className = 'jj-grid__card-cond-chip ' + getConditionClass(cond.condition);
          chip.textContent = (cond.condition || '').toUpperCase();
          chip.setAttribute('role', 'radio');
          if (!cond.available) {
            chip.className += ' jj-grid__card-cond-chip--out';
            chip.setAttribute('aria-disabled', 'true');
            chip.setAttribute('aria-checked', 'false');
          } else {
            chip.setAttribute('tabindex', '0');
            var isSel = cond === selected;
            if (isSel) chip.className += ' jj-grid__card-cond-chip--sel';
            chip.setAttribute('aria-checked', isSel ? 'true' : 'false');
            var selectChip = function (e) {
              if (e) { e.preventDefault(); e.stopPropagation(); }
              selected = cond;
              priceEl.textContent = cond.price;
              var chips = condWrap.querySelectorAll('.jj-grid__card-cond-chip');
              for (var x = 0; x < chips.length; x++) {
                chips[x].classList.remove('jj-grid__card-cond-chip--sel');
                chips[x].setAttribute('aria-checked', 'false');
              }
              chip.classList.add('jj-grid__card-cond-chip--sel');
              chip.setAttribute('aria-checked', 'true');
            };
            chip.addEventListener('click', selectChip);
            chip.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') selectChip(e);
            });
          }
          condWrap.appendChild(chip);
        })(showConds[ci]);
      }
      card.appendChild(condWrap);
    }

    if (selected) {
      priceEl.textContent = selected.price; // show the chosen condition's price
      var qa = document.createElement('button');
      qa.className = 'jj-grid__card-add';
      qa.type = 'button';
      qa.textContent = '[+ CART]';
      qa.setAttribute('aria-label', 'Add ' + p.title + ' to cart');
      qa.addEventListener('click', function (e) {
        e.preventDefault();  // button lives inside the card <a> — don't navigate
        e.stopPropagation();
        quickAdd(qa, selected.variantId); // selected updates as chips are clicked
      });
      card.appendChild(qa);
    } else {
      card.appendChild(textDiv('jj-grid__card-soldout', 'SOLD OUT'));
    }

    if (p.id != null) card.appendChild(createWatchStar(p));

    return card;
  }

  // Watchlist star, pinned to the card's upper-right. Symbol only. Initial state
  // from window.JJ_WATCHLIST (ids the customer already watches); clicks handled
  // by the delegated listener in japanjunky-watchlist.js.
  function createWatchStar(p) {
    var watched = !!(window.JJ_WATCHLIST && window.JJ_WATCHLIST.indexOf(p.id) >= 0);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jj-watch-star jj-watch-star--tr' + (watched ? ' jj-watch-btn--active' : '');
    btn.setAttribute('data-product-id', p.id);
    btn.setAttribute('data-watch', '');
    if (!window.JJ_LOGGED_IN) btn.setAttribute('data-guest', 'true');
    btn.setAttribute('aria-pressed', watched ? 'true' : 'false');
    btn.setAttribute('aria-label', watched ? 'Remove from watchlist' : 'Add to watchlist');
    btn.title = btn.getAttribute('aria-label');
    btn.innerHTML = '<span class="jj-watch-btn__glyph" aria-hidden="true">' + (watched ? '★' : '☆') + '</span>';
    return btn;
  }

  function renderGrid() {
    if (spinEngine) spinEngine.reset();
    gridEl.innerHTML = '';
    if (filteredProducts.length === 0) {
      gridEl.innerHTML = '<div class="jj-grid__empty">NO ITEMS FOUND</div>';
      document.dispatchEvent(new CustomEvent('jj:grid-render'));
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < filteredProducts.length; i++) {
      frag.appendChild(createCard(filteredProducts[i]));
    }
    gridEl.appendChild(frag);
    document.dispatchEvent(new CustomEvent('jj:grid-render'));
  }


  // ─── Filter State ──────────────────────────────────────────────
  var activeFilters = {
    format: {},    // value → true (plain objects as sets for ES5)
    genre: {},
    condition: {}
  };
  var searchQuery = '';
  var inStockOnly = false;

  function setHas(obj, key) { return obj.hasOwnProperty(key); }
  function setAdd(obj, key) { obj[key] = true; }
  function setDel(obj, key) { delete obj[key]; }
  function setSize(obj) { var n = 0; for (var k in obj) { if (obj.hasOwnProperty(k)) n++; } return n; }

  // ─── Filtering ─────────────────────────────────────────────────

  function matchesFilters(product) {
    if (setSize(activeFilters.format) > 0) {
      if (!setHas(activeFilters.format, product.format)) return false;
    }
    if (setSize(activeFilters.genre) > 0) {
      if (!setHas(activeFilters.genre, product.genre)) return false;
    }
    if (setSize(activeFilters.condition) > 0) {
      var condMatch = false;
      for (var ci = 0; ci < product.conditions.length; ci++) {
        if (setHas(activeFilters.condition, product.conditions[ci].condition)) {
          condMatch = true;
          break;
        }
      }
      if (!condMatch) return false;
    }
    if (inStockOnly && !product.available) return false;
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
    for (var i = 0; i < allCards.length; i++) {
      if (matchesFilters(allCards[i])) {
        filteredProducts.push(allCards[i]);
      }
    }
    applySort();
    renderGrid();
    updateCount();
    updateClearBtn(); // covers every state source, incl. search-only
  }

  // ─── Sorting ───────────────────────────────────────────────────

  var SORT_OPTIONS = [
    { key: 'featured',   label: 'FEATURED',       badge: '' },
    { key: 'date-desc',  label: 'NEWEST',         badge: 'NEW' },
    { key: 'price-asc',  label: 'PRICE LOW-HIGH', badge: 'PRICE↑' },
    { key: 'price-desc', label: 'PRICE HIGH-LOW', badge: 'PRICE↓' },
    { key: 'title-asc',  label: 'TITLE A-Z',      badge: 'TITLE' },
    { key: 'artist-asc', label: 'ARTIST A-Z',     badge: 'ARTIST' },
    { key: 'year-desc',  label: 'YEAR NEW-OLD',   badge: 'YEAR↓' },
    { key: 'year-asc',   label: 'YEAR OLD-NEW',   badge: 'YEAR↑' }
  ];
  var sortMode = 'featured';

  function priceOf(p) {
    if (typeof p.priceCents === 'number') return p.priceCents;
    // Fallback: strip currency formatting from the money string
    var n = parseFloat(String(p.price || '').replace(/[^\d.]/g, ''));
    return isNaN(n) ? Infinity : n;
  }

  function yearOf(p) {
    var y = parseInt(p.year, 10);
    return isNaN(y) ? null : y;
  }

  function dateOf(p) {
    return parseInt(p.addedAt, 10) || 0; // epoch seconds; 0 sinks to bottom on desc
  }

  function strCompare(a, b) {
    return (a || '').toLowerCase().localeCompare((b || '').toLowerCase());
  }

  function applySort() {
    if (sortMode === 'featured') return; // catalog order, preserved by build order
    filteredProducts.sort(function (a, b) {
      var ya, yb;
      switch (sortMode) {
        case 'price-asc':  return priceOf(a) - priceOf(b);
        case 'price-desc': return priceOf(b) - priceOf(a);
        case 'date-desc':  return dateOf(b) - dateOf(a);
        case 'title-asc':  return strCompare(a.title, b.title);
        case 'artist-asc': return strCompare(a.artist, b.artist);
        case 'year-desc':
        case 'year-asc':
          ya = yearOf(a);
          yb = yearOf(b);
          if (ya === null && yb === null) return 0;
          if (ya === null) return 1; // unknown years sink to the bottom
          if (yb === null) return -1;
          return sortMode === 'year-asc' ? ya - yb : yb - ya;
        default: return 0;
      }
    });
  }

  var sortBtn = document.getElementById('jj-grid-sort-btn');
  var sortBadge = document.getElementById('jj-grid-sort-badge');
  var sortDropdown = document.getElementById('jj-grid-dropdown-sort');

  if (sortBtn && sortDropdown) {
    for (var so = 0; so < SORT_OPTIONS.length; so++) {
      var opt = SORT_OPTIONS[so];
      var sItem = document.createElement('div');
      sItem.className = 'jj-grid__dropdown-item';
      sItem.setAttribute('data-sort-key', opt.key);
      sItem.setAttribute('role', 'radio');
      sItem.setAttribute('aria-checked', opt.key === sortMode ? 'true' : 'false');
      sItem.setAttribute('tabindex', '0');

      var sCheck = document.createElement('span');
      sCheck.className = 'jj-grid__dropdown-check';
      sCheck.textContent = opt.key === sortMode ? 'x' : ' ';

      var sLbl = document.createElement('span');
      sLbl.textContent = opt.label;

      sItem.appendChild(sCheck);
      sItem.appendChild(sLbl);
      if (opt.key === sortMode) sItem.classList.add('jj-grid__dropdown-item--active');
      sortDropdown.appendChild(sItem);
    }

    sortBtn.addEventListener('click', function (e) {
      if (e.target.closest('.jj-grid__dropdown')) return;
      var isOpen = sortDropdown.classList.contains('jj-grid__dropdown--open');
      closeAllDropdowns();
      if (!isOpen) sortDropdown.classList.add('jj-grid__dropdown--open');
    });

    // Apply a sort key + sync the dropdown/badge/button UI. Shared by the
    // click handler and the ?sort= URL preselect so they never diverge.
    function applySortSelection(key) {
      sortMode = key;
      var items = sortDropdown.querySelectorAll('.jj-grid__dropdown-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].getAttribute('data-sort-key') === key;
        items[i].classList.toggle('jj-grid__dropdown-item--active', on);
        items[i].querySelector('.jj-grid__dropdown-check').textContent = on ? 'x' : ' ';
        items[i].setAttribute('aria-checked', on ? 'true' : 'false');
      }
      var badge = '';
      for (var s = 0; s < SORT_OPTIONS.length; s++) {
        if (SORT_OPTIONS[s].key === key) badge = SORT_OPTIONS[s].badge;
      }
      if (sortBadge) sortBadge.textContent = badge ? '(' + badge + ')' : '';
      sortBtn.classList.toggle('jj-grid__filter-btn--active', key !== 'featured');
    }

    // Preselect from ?sort= (the start-menu "new arrivals" link → ?sort=newest)
    var urlSortMatch = window.location.search.match(/[?&]sort=([^&]+)/);
    if (urlSortMatch) {
      var urlSortVal = decodeURIComponent(urlSortMatch[1]).toLowerCase();
      if (urlSortVal === 'newest') urlSortVal = 'date-desc';
      for (var us = 0; us < SORT_OPTIONS.length; us++) {
        if (SORT_OPTIONS[us].key === urlSortVal) { applySortSelection(urlSortVal); break; }
      }
    }

    sortDropdown.addEventListener('click', function (e) {
      var itemEl = e.target.closest('.jj-grid__dropdown-item');
      if (!itemEl) return;
      e.stopPropagation();
      e.preventDefault();

      var key = itemEl.getAttribute('data-sort-key');
      if (!key || key === sortMode) {
        closeAllDropdowns();
        return;
      }
      applySortSelection(key);
      closeAllDropdowns();
      refilter();
    });

    sortDropdown.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var itemEl = e.target.closest('.jj-grid__dropdown-item');
        if (itemEl) {
          e.preventDefault();
          itemEl.click();
        }
      }
    });
  }

  // ─── Count Display ─────────────────────────────────────────────

  var countEl = document.getElementById('jj-grid-count');

  function updateCount() {
    if (!countEl) return;
    if (filteredProducts.length === allCards.length) {
      countEl.textContent = allCards.length + ' ITEMS';
    } else {
      countEl.textContent = filteredProducts.length + ' OF ' + allCards.length + ' ITEMS';
    }
  }

  // ─── Filter Bar UI ─────────────────────────────────────────────

  var searchInput = document.getElementById('jj-grid-search');
  var clearBtn = document.getElementById('jj-grid-clear');
  var inStockBtn = document.getElementById('jj-grid-instock');
  var debounceTimer = null;

  if (inStockBtn) {
    inStockBtn.addEventListener('click', function () {
      inStockOnly = !inStockOnly;
      inStockBtn.classList.toggle('jj-grid__filter-btn--active', inStockOnly);
      inStockBtn.setAttribute('aria-pressed', inStockOnly ? 'true' : 'false');
      refilter();
    });
  }

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
        } else if (group === 'genre') {
          val = allProducts[p].genre;
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
                     setSize(activeFilters.genre) > 0 ||
                     setSize(activeFilters.condition) > 0 ||
                     searchQuery !== '' ||
                     inStockOnly;
    if (hasFilters) {
      clearBtn.classList.add('jj-grid__clear-btn--visible');
    } else {
      clearBtn.classList.remove('jj-grid__clear-btn--visible');
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      activeFilters.format = {};
      activeFilters.genre = {};
      activeFilters.condition = {};
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      inStockOnly = false;
      if (inStockBtn) {
        inStockBtn.classList.remove('jj-grid__filter-btn--active');
        inStockBtn.setAttribute('aria-pressed', 'false');
      }

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
  applySort();
  renderGrid();
  updateCount();

})();
