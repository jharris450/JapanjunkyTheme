/**
 * japanjunky-search.js
 * Live client-side search with ASCII glitch + progressive image pixelation effect.
 * Debounced input on the header search bar filters product table rows.
 */
(function () {
  'use strict';

  var searchInput = document.querySelector('.jj-nav-bar__input');
  var tbody = document.getElementById('jj-product-tbody');
  if (!searchInput || !tbody) return;

  // Prevent form submission — search is client-side only
  var form = searchInput.closest('form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
    });
  }

  var debounceTimer = null;

  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 100);
  });

  function runSearch() {
    var query = searchInput.value.trim().toLowerCase();
    var rows = tbody.querySelectorAll('tr[data-product-handle]');

    // Snapshot which rows are currently visible (before this search changes things)
    var wasVisible = new Set();
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].classList.contains('jj-row--hidden')) {
        wasVisible.add(i);
      }
    }

    // Set data-search-match on each row
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (query === '') {
        row.removeAttribute('data-search-match');
      } else {
        var title = (row.getAttribute('data-product-title') || '').toLowerCase();
        var artist = (row.getAttribute('data-product-artist') || '').toLowerCase();
        var matches = title.indexOf(query) !== -1 || artist.indexOf(query) !== -1;
        row.setAttribute('data-search-match', matches ? 'true' : 'false');
      }
    }

    // Apply filters (sidebar + search combined)
    if (typeof window.JJ_applyFilters === 'function') {
      window.JJ_applyFilters();
    }

    // Restore focus — applyFilters may trigger checkDetailPane which clicks a row
    searchInput.focus();

    // Glitch visible rows — all matches when searching, only newly visible when clearing
    glitchVisibleRows(rows, wasVisible, query !== '');
  }

  // ── Glitch Engine ──

  var GLITCH_CHARS = '\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789';
  var PHOSPHOR_COLORS = ['var(--jj-amber)', 'var(--jj-cyan)', 'var(--jj-green)', 'var(--jj-magenta)', 'var(--jj-red)'];
  var FRAME_MS = 50;
  var TOTAL_FRAMES = 7;
  var SCRAMBLE_FRAMES = 4;

  function glitchVisibleRows(rows, wasVisible, searchActive) {
    var staggerIndex = 0;
    var MAX_STAGGER = 500;
    var STAGGER_STEP = 30;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var isVisible = !row.classList.contains('jj-row--hidden');
      var shouldAnimate = isVisible && (searchActive || !wasVisible.has(i));

      if (shouldAnimate) {
        var delay = Math.min(staggerIndex * STAGGER_STEP, MAX_STAGGER);
        applyGlitch(row, delay);
        staggerIndex++;
      }
    }
  }

  // ── Per-row glitch lifecycle ──

  function cancelGlitch(row) {
    if (row._glitchTimeout) {
      clearTimeout(row._glitchTimeout);
      row._glitchTimeout = null;
    }
    if (row._glitchInterval) {
      clearInterval(row._glitchInterval);
      row._glitchInterval = null;
    }
    if (row._glitchSaved) {
      restoreRow(row, row._glitchSaved);
      row._glitchSaved = null;
    }
  }

  function restoreRow(row, saved) {
    var cells = row.querySelectorAll('td');
    for (var i = 0; i < saved.length && i < cells.length; i++) {
      if (saved[i].isImage) {
        var img = cells[i].querySelector('img');
        if (img) {
          img.src = saved[i].imgSrc;
          img.style.imageRendering = '';
        }
      } else {
        cells[i].innerHTML = saved[i].html;
      }
    }
  }

  function applyGlitch(row, delay) {
    cancelGlitch(row);

    row._glitchTimeout = setTimeout(function () {
      row._glitchTimeout = null;
      var cells = row.querySelectorAll('td');
      if (cells.length === 0) return;

      // Save state for each cell
      var saved = [];
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var img = cell.querySelector('img');
        saved.push({
          html: cell.innerHTML,
          text: cell.textContent,
          isImage: !!img,
          imgSrc: img ? img.src : null,
          imgBaseUrl: img ? stripShopifySuffix(img.src) : null
        });
      }
      row._glitchSaved = saved;

      var frame = 0;

      row._glitchInterval = setInterval(function () {
        frame++;

        for (var i = 0; i < cells.length; i++) {
          if (saved[i].isImage) {
            renderImageFrame(cells[i], saved[i], frame);
          } else {
            renderTextFrame(cells[i], saved[i], frame);
          }
        }

        if (frame >= TOTAL_FRAMES) {
          clearInterval(row._glitchInterval);
          row._glitchInterval = null;
          restoreRow(row, saved);
          row._glitchSaved = null;
        }
      }, FRAME_MS);
    }, delay);
  }

  // ── Text cell: scramble then resolve ──

  function renderTextFrame(cell, saved, frame) {
    var text = saved.text;
    var len = Math.max(text.length, 1);
    var html = '';

    if (frame <= SCRAMBLE_FRAMES) {
      // Phase 1: full scramble — random glitch chars in random phosphor colors
      for (var i = 0; i < len; i++) {
        var ch = randomGlitchChar();
        var color = PHOSPHOR_COLORS[Math.floor(Math.random() * PHOSPHOR_COLORS.length)];
        html += '<span style="color:' + color + '">' + ch + '</span>';
      }
    } else {
      // Phase 2: resolve left-to-right, colors converge to normal
      var resolveFrame = frame - SCRAMBLE_FRAMES; // 1, 2, or 3
      var resolveTotal = TOTAL_FRAMES - SCRAMBLE_FRAMES; // 3
      var revealCount = Math.ceil((resolveFrame / resolveTotal) * len);

      for (var i = 0; i < len; i++) {
        if (i < revealCount) {
          // Real character in normal text color
          html += '<span style="color:var(--jj-text)">' + escapeChar(text.charAt(i)) + '</span>';
        } else {
          // Still glitching, but probability of phosphor color decreases
          var ch = randomGlitchChar();
          var usePhosphor = Math.random() > (resolveFrame / resolveTotal);
          var color = usePhosphor
            ? PHOSPHOR_COLORS[Math.floor(Math.random() * PHOSPHOR_COLORS.length)]
            : 'var(--jj-text)';
          html += '<span style="color:' + color + '">' + ch + '</span>';
        }
      }
    }

    cell.innerHTML = html;
  }

  // ── Image cell: progressive pixelation ──

  var IMAGE_SIZES = ['_10x', '_10x', '_50x', '_50x', '_100x', '_100x', ''];

  function renderImageFrame(cell, saved, frame) {
    var img = cell.querySelector('img');
    if (!img || !saved.imgBaseUrl) return;

    var suffix = IMAGE_SIZES[frame - 1];

    if (suffix === '') {
      // Final frame — restore original
      img.src = saved.imgSrc;
      img.style.imageRendering = '';
    } else {
      img.style.imageRendering = 'pixelated';
      img.src = insertShopifySuffix(saved.imgBaseUrl, suffix);
    }
  }

  // ── URL helpers ──

  function stripShopifySuffix(url) {
    return url.replace(/_\d+x\d*(?=\.[a-z]+(\?|$))/i, '');
  }

  function insertShopifySuffix(baseUrl, suffix) {
    return baseUrl.replace(/(\.[a-z]+)(\?|$)/i, suffix + '$1$2');
  }

  // ── Char helpers ──

  function randomGlitchChar() {
    return GLITCH_CHARS.charAt(Math.floor(Math.random() * GLITCH_CHARS.length));
  }

  function escapeChar(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    if (ch === ' ') return '&nbsp;';
    return ch;
  }

})();
