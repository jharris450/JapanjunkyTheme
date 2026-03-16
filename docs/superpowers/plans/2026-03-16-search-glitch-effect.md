# Enhanced Search Materialization — ASCII Glitch Effect Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-based brightness/contrast materialization with a JS frame-based ASCII glitch + progressive image pixelation effect on search results.

**Architecture:** Remove all CSS keyframe rules for materialization. Replace the JS `applyMaterialization` function with a `setInterval`-based glitch engine that scrambles text cells with random colored ASCII characters, steps images through Shopify size suffixes with `image-rendering: pixelated`, then resolves to real content over 7 frames (350ms).

**Tech Stack:** Vanilla JS, Shopify Liquid/CDN, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-16-search-glitch-effect-design.md`

---

## Chunk 1: Remove CSS Materialization Rules

### Task 1: Delete materialization CSS

**Files:**
- Modify: `assets/japanjunky-homepage.css`

- [ ] **Step 1: Remove the materialization CSS block**

In `assets/japanjunky-homepage.css`, delete lines 833-877 — the entire `/* ── Search materialization effect ── */` block including:
- `@keyframes jj-materialize`
- `@keyframes jj-static-fade`
- `.jj-row--materializing td`
- `.jj-row--materializing td::after`

The line `@media (max-width: 600px) {` should immediately follow `.jj-row--hidden { display: none; }` after the deletion.

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-homepage.css
git commit -m "refactor: remove CSS materialization keyframes (replaced by JS glitch)"
```

---

## Chunk 2: JS Glitch Engine

### Task 2: Replace materialization with glitch engine in japanjunky-search.js

**Files:**
- Modify: `assets/japanjunky-search.js`

- [ ] **Step 1: Replace the materialization section**

In `assets/japanjunky-search.js`, replace everything from line 61 (`// Materialize visible rows`) through line 121 (the closing `}` of `applyMaterialization`) with the new glitch engine. Also update the function call on line 62 from `materializeVisibleRows` to `glitchVisibleRows`.

The call site on line 62 changes from:

```js
    // Materialize visible rows — all matches when searching, only newly visible when clearing
    materializeVisibleRows(rows, wasVisible, query !== '');
```

To:

```js
    // Glitch visible rows — all matches when searching, only newly visible when clearing
    glitchVisibleRows(rows, wasVisible, query !== '');
```

Replace the entire `// ── Materialization ──` section (lines 65-121) with:

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-search.js
git commit -m "feat: replace CSS materialization with ASCII glitch + progressive image pixelation"
```

---

## Chunk 3: Manual Testing

### Task 3: Test the glitch effect

- [ ] **Step 1: Basic search glitch**

Type a product title into the search bar. Confirm:
- Text cells display rapidly cycling colored ASCII characters (`░▒▓█╳¤§` etc.) in CRT phosphor colors (amber, cyan, green, magenta, red)
- After ~200ms, real characters reveal left-to-right while remaining glitch chars fade toward normal text color
- After ~350ms, cells snap back to their real HTML content
- Product images step from extremely blocky (pixelated) → recognizable → sharp

- [ ] **Step 2: Staggered cascade**

Clear search, then type a broad term. Confirm rows glitch in with staggered delays (not all at once).

- [ ] **Step 3: Rapid typing**

Type quickly. Confirm no visual glitches or stuck animation state — each new keystroke cancels in-flight animations cleanly.

- [ ] **Step 4: Search + sidebar filter**

Type a search term, then click a sidebar filter. Confirm both work together.

- [ ] **Step 5: Clear All**

Type a search term + sidebar filter. Click Clear All. Confirm everything resets.

- [ ] **Step 6: Push**

```bash
git push
```
