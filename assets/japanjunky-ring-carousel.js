/**
 * japanjunky-ring-carousel.js
 * Radial crescent carousel of album covers — revived for the bundle hero.
 *
 * The mystery box (japanjunky-bundle-stage.js) deals the 5 sampled records
 * in via JJ_RingCarousel.deal(products); Reroll retracts them via
 * JJ_RingCarousel.retract(done). Look/animation preserved from the original
 * featured-ring carousel (arc slots, jitter, 0.4s ease-out transitions).
 *
 * Emits: jj:product-selected (preview: true), jj:product-deselected
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

  // Spawn transform: parked at the box mouth (left of the stage), shrunk.
  // Deal/retract transitions run between this and the arc slots.
  var SPAWN_TRANSFORM = 'translate(-280px, 0px) scale(0.2)';
  var DEAL_STAGGER_MS = 90;   // per-cover delay on deal-out
  var SETTLE_MS = 420;        // > the 0.4s CSS transform transition

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
  var selectedIndex = -1;     // records index currently selected (after 300ms)
  var selectTimer = null;
  var locked = false;         // true while dealing/retracting

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

      // Mark center as selected
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
    for (var key in coverEls) {
      if (coverEls[key].parentNode) coverEls[key].parentNode.removeChild(coverEls[key]);
    }
    coverEls = {};
    records = [];
    centerIndex = 0;
  }

  // ─── Deal / Retract (driven by the mystery box) ────────────────

  function deal(products) {
    clearSelectTimer();
    selectedIndex = -1;
    clearCovers();
    records = (products || []).slice();
    if (!records.length) return;
    centerIndex = Math.floor(records.length / 2); // middle record centered
    locked = true;

    // Create every cover parked at the box mouth…
    for (var i = 0; i < records.length; i++) {
      var el = createCoverEl(records[i], i);
      el.style.transform = SPAWN_TRANSFORM;
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
        }, idx * DEAL_STAGGER_MS);
      })(j);
    }

    setTimeout(function () {
      locked = false;
      positionCovers(); // normalize (selected class, aria, z-index)
      startSelectTimer();
    }, records.length * DEAL_STAGGER_MS + SETTLE_MS);
  }

  function retract(done) {
    deselectCurrent();
    if (!records.length) { if (done) done(); return; }
    locked = true;
    for (var key in coverEls) {
      coverEls[key].style.transform = SPAWN_TRANSFORM;
      coverEls[key].style.opacity = '0';
    }
    setTimeout(function () {
      clearCovers();
      locked = false;
      if (done) done();
    }, SETTLE_MS);
  }

  // ─── Navigation (clamped — no wrap with only 5 records) ────────

  function rotateTo(newIndex) {
    if (!records.length || locked) return;
    if (newIndex < 0 || newIndex >= records.length) return;
    if (newIndex === centerIndex) return;
    deselectCurrent();
    centerIndex = newIndex;
    positionCovers();
    startSelectTimer();
  }

  function rotateBy(delta) { rotateTo(centerIndex + delta); }

  // ─── Selection Delay (300ms) ───────────────────────────────────

  function startSelectTimer() {
    clearSelectTimer();
    selectTimer = setTimeout(function () {
      selectTimer = null;
      selectCurrent();
    }, 300);
  }

  function clearSelectTimer() {
    if (selectTimer) {
      clearTimeout(selectTimer);
      selectTimer = null;
    }
  }

  function selectCurrent() {
    if (!records.length || selectedIndex === centerIndex) return;
    var product = records[centerIndex];
    if (!product) return;
    selectedIndex = centerIndex;

    // Map product fields to the detail shape expected by product-viewer.js.
    // preview: true — info panel only, no Add-to-Cart (bundle samples).
    document.dispatchEvent(new CustomEvent('jj:product-selected', { detail: {
      handle: product.handle,
      productId: product.id,
      title: product.title,
      artist: product.artist,
      vendor: product.vendor,
      price: product.price,
      code: product.code,
      condition: product.condition,
      format: product.format,
      formatLabel: product.formatLabel,
      year: product.year,
      label: product.label,
      jpName: product.jpName,
      jpTitle: product.jpTitle,
      imageUrl: product.image,
      imageBackUrl: product.imageBack,
      type3d: product.type3d,
      variantId: String(product.variantId),
      available: product.available,
      preview: true,
      el: coverEls[centerIndex] || null
    }}));
  }

  function deselectCurrent() {
    clearSelectTimer();
    if (selectedIndex === -1) return;
    selectedIndex = -1;
    document.dispatchEvent(new CustomEvent('jj:product-deselected', { detail: {} }));
  }

  // ─── Keyboard Input ────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (!records.length || locked) return;
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Grid screen owns input while hero UI is hidden — don't rotate/select blind
    if (document.body.classList.contains('jj-grid-active')) return;
    // Let focused links/buttons activate natively (Reroll, bundle Add-to-Cart)
    if (e.key === 'Enter' && e.target.closest('a, button')) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      rotateBy(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      rotateBy(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearSelectTimer();
      selectCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      deselectCurrent();
    }
  });

  // ─── Mouse Click on Covers ─────────────────────────────────────

  stage.addEventListener('click', function (e) {
    if (locked) return;
    var cover = e.target.closest('.jj-ring__cover');
    if (!cover) return;

    var idx = parseInt(cover.getAttribute('data-ring-index'), 10);
    if (isNaN(idx)) return;

    if (idx === centerIndex) {
      // Clicking center cover: immediate select
      clearSelectTimer();
      selectCurrent();
    } else {
      // Clicking side cover: rotate it to center
      rotateTo(idx);
    }
  });

  // ─── Scroll Wheel (locked to the crescent while records are out) ─

  var wheelCooldown = false;

  ring.addEventListener('wheel', function (e) {
    if (!records.length) return; // box closed — page scroll owns the wheel
    if (document.body.classList.contains('jj-grid-active')) return;
    if (!e.target.closest('.jj-ring__stage')) return; // box side falls through
    // Own the gesture: no page scroll under the crescent, and keep the
    // document-level page-scroll handler (japanjunky-product-grid.js) off it.
    e.preventDefault();
    e.stopPropagation();
    if (locked || wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(function () { wheelCooldown = false; }, 150);

    var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
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
      e.preventDefault();
      touchLocked = true;
      if (dy > 0) {
        rotateBy(1);
      } else {
        rotateBy(-1);
      }
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
