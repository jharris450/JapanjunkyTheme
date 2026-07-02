/**
 * japanjunky-ring-carousel.js
 * Radial crescent carousel of album covers — revived for the bundle hero.
 *
 * The mystery box (japanjunky-bundle-stage.js) deals the 5 sampled records
 * in via JJ_RingCarousel.deal(products); Reroll retracts them via
 * JJ_RingCarousel.retract(done). Look/animation preserved from the original
 * featured-ring carousel (arc slots, jitter, 0.4s ease-out transitions).
 *
 * Hovering a cover shows a floating product-info card next to it — the
 * fixed info panel (top-left) belongs to the bundle product itself, so the
 * ring no longer dispatches jj:product-selected.
 */
(function () {
  'use strict';

  // ─── DOM ───────────────────────────────────────────────────────
  var ring = document.getElementById('jj-ring');
  var stage = document.getElementById('jj-ring-stage');
  if (!ring || !stage) return;

  // ─── Arc Config (vertical increscent) ──────────────────────────
  // Covers stacked vertically along an increscent curve (opens LEFT,
  // toward the box mouth — records read as dealt out of the box).
  // x: horizontal offset (negative = left, toward the box)
  // y: vertical offset from center (positive = down)
  // Center cover is largest; covers shrink + shift left toward edges.
  var ARC = [
    { offset: 0,  x: 0,    y: 0,    scale: 1.15, opacity: 1.0  },
    { offset: 1,  x: -18,  y: 75,   scale: 0.88, opacity: 0.85 },
    { offset: -1, x: -18,  y: -75,  scale: 0.88, opacity: 0.85 },
    { offset: 2,  x: -55,  y: 145,  scale: 0.72, opacity: 0.6  },
    { offset: -2, x: -55,  y: -145, scale: 0.72, opacity: 0.6  },
    { offset: 3,  x: -110, y: 210,  scale: 0.58, opacity: 0.35 },
    { offset: -3, x: -110, y: -210, scale: 0.58, opacity: 0.35 }
  ];

  var DEAL_STAGGER_MS = 90;   // per-cover delay on deal-out
  var DEAL_BASE_DELAY_MS = 120; // lets the crate's mesh slide lead the hand-off
  var SETTLE_MS = 420;        // > the 0.4s CSS transform transition
  var END_RELEASE_MS = 600;   // wheel momentum settle before page scroll takes over
  var SPAWN_SCALE = 0.75;     // ≈ the crate's record-stack size on screen

  // Spawn transform: at the mystery box's actual screen position (its canvas
  // sits across the page, in the product-info zone), so covers fly the WHOLE
  // box→crescent path with no vanish/reappear gap. Falls back to just left
  // of the stage if the box canvas isn't there.
  function spawnTransform() {
    var boxCanvas = document.getElementById('jj-bundle-canvas');
    if (boxCanvas) {
      var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      var b = boxCanvas.getBoundingClientRect();
      var s = stage.getBoundingClientRect();
      if (b.width && s.width) {
        // +110px: records leave through the box's opened RIGHT side, not its center
        var dx = ((b.left + b.width / 2) - (s.left + s.width / 2)) / zoom + 110;
        var dy = ((b.top + b.height / 2) - (s.top + s.height / 2)) / zoom;
        return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + SPAWN_SCALE + ')';
      }
    }
    return 'translate(-280px, 0px) scale(' + SPAWN_SCALE + ')';
  }

  // Per-cover random jitter (applied once on creation)
  var coverJitter = {}; // keyed by product handle+variantId

  function getJitter(product) {
    var key = product.handle + ':' + product.variantId;
    if (!coverJitter[key]) {
      coverJitter[key] = {
        rotate: (Math.random() - 0.5) * 5, // ±2.5deg
        tx: (Math.random() - 0.5) * 6,     // ±3px
        ty: (Math.random() - 0.5) * 6      // ±3px
      };
    }
    return coverJitter[key];
  }

  // ─── State ─────────────────────────────────────────────────────
  var records = [];           // product data for the current bundle deal
  var centerIndex = 0;        // index into records
  var coverEls = {};          // keyed by records index → DOM element
  var locked = false;         // true while dealing/retracting

  // ─── Hover Card ────────────────────────────────────────────────
  // Floating per-record info card, shown next to the hovered cover.
  var card = document.createElement('div');
  card.className = 'jj-ring-card';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML =
    '<div class="jj-ring-card__artist"></div>' +
    '<div class="jj-ring-card__jp-name"></div>' +
    '<div class="jj-ring-card__title"></div>' +
    '<div class="jj-ring-card__jp-title"></div>' +
    '<div class="jj-ring-card__meta"></div>' +
    '<div class="jj-ring-card__price"></div>';
  ring.appendChild(card);

  function cardField(cls) { return card.querySelector('.' + cls); }

  function metaRow(label, value) {
    return '<div class="jj-meta-row"><span class="jj-meta-row__label">' + label +
           ': </span><span class="jj-meta-row__value">' + value + '</span></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showCard(coverEl) {
    var idx = parseInt(coverEl.getAttribute('data-ring-index'), 10);
    var product = records[idx];
    if (!product) return;

    cardField('jj-ring-card__artist').textContent = (product.artist || product.vendor || '---').toUpperCase();
    cardField('jj-ring-card__jp-name').textContent = product.jpName || '';
    cardField('jj-ring-card__title').textContent = product.title || '';
    cardField('jj-ring-card__jp-title').textContent = product.jpTitle || '';

    var rows = [];
    if (product.code) rows.push(metaRow('Code', esc(product.code)));
    if (product.label) rows.push(metaRow('Label', esc(product.label)));
    if (product.formatLabel) rows.push(metaRow('Format', esc(product.formatLabel)));
    if (product.year) rows.push(metaRow('Year', esc(product.year)));
    if (product.condition) rows.push(metaRow('Condition', esc(String(product.condition).toUpperCase())));
    cardField('jj-ring-card__meta').innerHTML = rows.join('');

    cardField('jj-ring-card__price').textContent = product.price || '';

    card.classList.add('jj-ring-card--visible');
    card.setAttribute('aria-hidden', 'false');

    // Position: to the LEFT of the hovered cover, vertically centered on it.
    // Style px are pre-zoom, rects are post-zoom — divide rect math by zoom
    // (same trick as product-viewer's positionCanvasOverBox).
    var zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var ringRect = ring.getBoundingClientRect();
    var coverRect = coverEl.getBoundingClientRect();
    card.style.right = ((ringRect.right - coverRect.left) / zoom + 12) + 'px';
    var top = (coverRect.top + coverRect.height / 2 - ringRect.top) / zoom - card.offsetHeight / 2;
    card.style.top = top + 'px';
  }

  function hideCard() {
    card.classList.remove('jj-ring-card--visible');
    card.setAttribute('aria-hidden', 'true');
  }

  stage.addEventListener('mouseover', function (e) {
    if (locked) return;
    var cover = e.target.closest('.jj-ring__cover');
    if (cover) showCard(cover);
  });

  stage.addEventListener('mouseout', function (e) {
    var to = e.relatedTarget;
    if (!(to && to.closest && to.closest('.jj-ring__cover'))) hideCard();
  });

  // ─── Cover Creation ────────────────────────────────────────────

  function createCoverEl(product, idx) {
    var div = document.createElement('div');
    div.className = 'jj-ring__cover';
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', 'false');
    div.setAttribute('data-ring-index', idx);
    div.setAttribute('data-format', product.format || '');
    div.setAttribute('data-handle', product.handle || '');

    var imgWrap = document.createElement('div');
    imgWrap.className = 'jj-ring__cover-img-wrap';

    if (!product.image) {
      imgWrap.innerHTML = '<span style="font-size:10px;color:var(--jj-secondary);display:flex;align-items:center;justify-content:center;height:100%;">&#9670;</span>';
    } else {
      var img = document.createElement('img');
      img.className = 'jj-ring__cover-img';
      img.alt = (product.artist ? product.artist + ' - ' : '') + product.title;
      img.width = 180;
      img.height = 180;
      img.src = product.image; // only 5 covers per deal — eager-load all
      imgWrap.appendChild(img);
    }

    div.appendChild(imgWrap);
    return div;
  }

  // ─── Arc Positioning ───────────────────────────────────────────

  function slotForOffset(offset) {
    for (var i = 0; i < ARC.length; i++) {
      if (ARC[i].offset === offset) return ARC[i];
    }
    return null;
  }

  function applySlot(el, slot, product) {
    var jit = getJitter(product);
    el.style.transform = 'translate(' + (slot.x + jit.tx) + 'px, ' + (slot.y + jit.ty) + 'px) scale(' + slot.scale + ') rotate(' + jit.rotate + 'deg)';
    el.style.opacity = slot.opacity;
    el.style.zIndex = 10 - Math.abs(slot.offset);
  }

  function positionCovers() {
    // Remove covers that are out of arc range
    var keepSet = {};
    for (var a = 0; a < ARC.length; a++) {
      var dataIdx = centerIndex + ARC[a].offset;
      if (dataIdx >= 0 && dataIdx < records.length) keepSet[dataIdx] = true;
    }
    for (var key in coverEls) {
      if (!keepSet.hasOwnProperty(key)) {
        if (coverEls[key].parentNode) coverEls[key].parentNode.removeChild(coverEls[key]);
        delete coverEls[key];
      }
    }

    // Create/position covers on the arc
    for (var i = 0; i < ARC.length; i++) {
      var slot = ARC[i];
      var dIdx = centerIndex + slot.offset;
      if (dIdx < 0 || dIdx >= records.length) continue;

      var el = coverEls[dIdx];
      if (!el) {
        el = createCoverEl(records[dIdx], dIdx);
        coverEls[dIdx] = el;
        stage.appendChild(el);
      }

      applySlot(el, slot, records[dIdx]);

      // Mark center cover (biggest, glowing border)
      if (slot.offset === 0) {
        el.classList.add('jj-ring__cover--selected');
        el.setAttribute('aria-selected', 'true');
      } else {
        el.classList.remove('jj-ring__cover--selected');
        el.setAttribute('aria-selected', 'false');
      }
    }
  }

  function clearCovers() {
    hideCard();
    for (var key in coverEls) {
      if (coverEls[key].parentNode) coverEls[key].parentNode.removeChild(coverEls[key]);
    }
    coverEls = {};
    records = [];
    centerIndex = 0;
  }

  // ─── Deal / Retract (driven by the mystery box) ────────────────

  function deal(products) {
    clearCovers();
    records = (products || []).slice();
    if (!records.length) return;
    centerIndex = Math.floor(records.length / 2); // middle record centered
    locked = true;

    // Create every cover parked at the box…
    var spawn = spawnTransform();
    for (var i = 0; i < records.length; i++) {
      var el = createCoverEl(records[i], i);
      el.style.transform = spawn;
      el.style.opacity = '0';
      el.style.zIndex = 10 - Math.abs(i - centerIndex);
      coverEls[i] = el;
      stage.appendChild(el);
    }
    // …flush styles so the spawn transform is the transition start point…
    void stage.offsetWidth;

    // …then release each to its arc slot, staggered (CSS animates the deal).
    for (var j = 0; j < records.length; j++) {
      (function (idx) {
        setTimeout(function () {
          var slot = slotForOffset(idx - centerIndex);
          if (slot && coverEls[idx]) applySlot(coverEls[idx], slot, records[idx]);
        }, DEAL_BASE_DELAY_MS + idx * DEAL_STAGGER_MS);
      })(j);
    }

    setTimeout(function () {
      locked = false;
      positionCovers(); // normalize (center class, aria, z-index)
    }, DEAL_BASE_DELAY_MS + records.length * DEAL_STAGGER_MS + SETTLE_MS);
  }

  function retract(done) {
    hideCard();
    if (!records.length) { if (done) done(); return; }
    locked = true;
    // Staggered flight back to the box's screen position — each cover
    // shrinks + fades on arrival, then the crate's mesh stack piles in.
    var spawn = spawnTransform();
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      (function (el, idx) {
        if (!el) return;
        setTimeout(function () {
          el.style.transform = spawn;
          el.style.opacity = '0';
        }, idx * DEAL_STAGGER_MS);
      })(coverEls[i], count++);
    }
    setTimeout(function () {
      clearCovers();
      locked = false;
      if (done) done();
    }, (count > 0 ? (count - 1) * DEAL_STAGGER_MS : 0) + SETTLE_MS);
  }

  // ─── Navigation (clamped — no wrap with only 5 records) ────────

  function rotateTo(newIndex) {
    if (!records.length || locked) return;
    if (newIndex < 0 || newIndex >= records.length) return;
    if (newIndex === centerIndex) return;
    hideCard();
    centerIndex = newIndex;
    positionCovers();
  }

  function rotateBy(delta) { rotateTo(centerIndex + delta); }

  // ─── Keyboard Input ────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (!records.length || locked) return;
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Grid screen owns input while hero UI is hidden — don't rotate blind
    if (document.body.classList.contains('jj-grid-active')) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      rotateBy(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      rotateBy(-1);
    }
  });

  // ─── Mouse Click on Covers ─────────────────────────────────────

  stage.addEventListener('click', function (e) {
    if (locked) return;
    var cover = e.target.closest('.jj-ring__cover');
    if (!cover) return;

    var idx = parseInt(cover.getAttribute('data-ring-index'), 10);
    if (isNaN(idx) || idx === centerIndex) return;
    rotateTo(idx); // clicking a side cover centers it
  });

  // ─── Scroll Wheel ──────────────────────────────────────────────
  // Captured only while the pointer is over an actual cover; at the
  // crescent's ends (once momentum settles) the gesture is released to the
  // page-scroll handler so the user can keep scrolling down to the catalog.

  var wheelCooldown = false;
  var lastRotateAt = 0;

  ring.addEventListener('wheel', function (e) {
    if (!records.length || locked) return;
    if (document.body.classList.contains('jj-grid-active')) return;
    if (!e.target.closest('.jj-ring__cover')) return;

    var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    var atEnd = (delta > 0 && centerIndex >= records.length - 1) ||
                (delta < 0 && centerIndex <= 0);
    if (atEnd) {
      // Swallow trailing momentum from the rotation that reached the end,
      // then hand the wheel back to the page scroll.
      if (performance.now() - lastRotateAt <= END_RELEASE_MS) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Own the gesture: no page scroll while rotating through the crescent.
    e.preventDefault();
    e.stopPropagation();
    if (wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(function () { wheelCooldown = false; }, 150);

    lastRotateAt = performance.now();
    if (delta > 0) {
      rotateBy(1);
    } else if (delta < 0) {
      rotateBy(-1);
    }
  }, { passive: false });

  // ─── Touch Swipe (vertical, one rotation per gesture) ──────────

  var touchStartX = 0;
  var touchStartY = 0;
  var touchLocked = false;

  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchLocked = false;
  }, { passive: true });

  stage.addEventListener('touchmove', function (e) {
    if (!records.length || locked || touchLocked || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    // Only register vertical swipes, one rotation per gesture
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
      // At the ends let the swipe fall through to the page scroll
      var dir = dy > 0 ? 1 : -1;
      var next = centerIndex + dir;
      if (next < 0 || next >= records.length) return;
      e.preventDefault();
      touchLocked = true;
      rotateBy(dir);
    }
  }, { passive: false });

  stage.addEventListener('touchend', function () {
    touchLocked = false;
  }, { passive: true });

  // ─── Public API (consumed by japanjunky-bundle-stage.js) ──────
  window.JJ_RingCarousel = {
    deal: deal,
    retract: retract,
    isBusy: function () { return locked; },
    hasRecords: function () { return records.length > 0; }
  };

})();
