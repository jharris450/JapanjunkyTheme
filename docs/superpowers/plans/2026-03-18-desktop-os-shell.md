# Desktop OS Shell — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the JapanJunky Shopify theme into a desktop OS experience where store content lives inside a draggable window, managed by a DOM-based window manager with CSS transition minimize/restore effects.

**Architecture:** Three layers — WebGL screensaver canvas (z-0), DOM window manager (z-1, `position: fixed`), fixed taskbar (z-1000, `position: fixed`). Windows are real DOM elements that float over the screensaver. CSS transitions handle minimize/restore animations (CSS3DRenderer deferred to Phase 2 when multiple windows and richer 3D effects justify the dependency). A single persistent window wraps `content_for_layout` on every page type.

**Tech Stack:** Shopify Liquid, vanilla JS (ES5 IIFEs), CSS3 with `jj-` BEM conventions, Three.js r160 (already vendored)

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-os-shell-design.md`

**Note:** CSS3DRenderer is specified in the design spec for minimize/restore animations, but Phase 1 uses CSS transitions instead — the visual result (scale + translate toward taskbar) is equivalent and avoids loading an unused dependency on every page. CSS3DRenderer will be vendored in Phase 2 when multiple windows and 3D window-open effects justify it.

**Deploy note:** Chunks 1–3 must be deployed together. Deploying Chunk 1 alone would leave the site with empty taskbar tabs and broken layout.

---

## Chunk 1: Foundation — CSS, Liquid Restructure, Taskbar Fix

### Task 1: Create window chrome CSS

**Files:**
- Create: `assets/japanjunky-wm.css`

All window visual styles. No JS behavior yet.

- [ ] **Step 1: Create `assets/japanjunky-wm.css` with window chrome styles**

```css
/* ============================================
   JAPANJUNKY WINDOW MANAGER CSS
   Desktop OS shell — window chrome, states
   ============================================ */

/* --- Desktop Layer --- */
.jj-desktop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: calc(100vh - 32px); /* minus taskbar */
  z-index: 1;
  pointer-events: none;
}

/* --- Window Container --- */
.jj-window {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  border: 1px solid #444;
  pointer-events: auto;
  min-width: 280px;
  min-height: 180px;
  box-shadow: 2px 2px 0 #000;
}

.jj-window--focused {
  border-color: #555;
  box-shadow: 2px 2px 0 #000, 0 0 12px rgba(232, 49, 58, 0.1);
}

.jj-window--maximized {
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: calc(100vh - 32px) !important;
}

.jj-window--dragging {
  box-shadow: 4px 4px 0 #000, 0 0 20px rgba(0, 0, 0, 0.5);
  opacity: 0.95;
}

/* Override custom cursor during drag */
.jj-window--dragging,
.jj-window--dragging *,
.jj-window--dragging .jj-window__titlebar {
  cursor: move !important;
}

.jj-window--minimizing {
  transition: transform 0.3s ease-in, opacity 0.3s ease-in;
  pointer-events: none;
}

.jj-window--restoring {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
  pointer-events: none;
}

/* --- Title Bar --- */
.jj-window__titlebar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 4px 0 8px;
  background: #111;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
  user-select: none;
  cursor: default;
  gap: 6px;
}

.jj-window--focused .jj-window__titlebar {
  background: #151515;
  border-bottom-color: #444;
  text-shadow: 0 0 6px rgba(232, 49, 58, 0.3);
}

.jj-window__icon {
  font-size: 10px;
  color: var(--jj-primary);
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.jj-window--focused .jj-window__icon {
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.4);
}

.jj-window__title {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-transform: uppercase;
}

.jj-window--focused .jj-window__title {
  color: var(--jj-text);
}

/* --- Window Control Buttons --- */
.jj-window__controls {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

.jj-window-btn {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 11px;
  width: 22px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #333;
  color: #666;
  cursor: default;
  padding: 0;
  line-height: 1;
}

.jj-window-btn:hover {
  border-color: #555;
}

.jj-window-btn--minimize:hover {
  color: var(--jj-secondary);
  text-shadow: 0 0 4px rgba(207, 174, 74, 0.5);
  border-color: var(--jj-secondary);
}

.jj-window-btn--maximize:hover {
  color: var(--jj-accent);
  text-shadow: 0 0 4px rgba(55, 205, 190, 0.5);
  border-color: var(--jj-accent);
}

.jj-window-btn--close:hover {
  color: var(--jj-primary);
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.5);
  border-color: var(--jj-primary);
}

/* --- Window Content --- */
.jj-window__content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

/* Content inside windows should flow naturally */
.jj-window__content .jj-catalog-layout {
  height: auto;
  min-height: 100%;
}

/* --- Status Bar --- */
.jj-window__statusbar {
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  background: #0a0a0a;
  border-top: 1px solid #333;
  flex-shrink: 0;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 10px;
  color: #555;
  gap: 8px;
}

/* --- Taskbar Tab States (extend existing) --- */
.jj-taskbar-tab--minimized {
  opacity: 0.5;
  border-style: inset;
}

/* --- OS Shell: header becomes fixed chrome above desktop --- */
.jj-shell-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 999;
}

/* Push desktop layer below the header */
.jj-desktop {
  top: 0; /* header overlays, windows can go under it */
}

/* --- Reduced Motion --- */
@media (prefers-reduced-motion: reduce) {
  .jj-window--minimizing,
  .jj-window--restoring {
    transition: none;
  }
}

/* --- High Contrast --- */
@media (prefers-contrast: more) {
  .jj-window {
    border-width: 2px;
  }
  .jj-window--focused {
    box-shadow: none;
    border-color: #fff;
  }
  .jj-window--focused .jj-window__titlebar {
    text-shadow: none;
  }
  .jj-window--focused .jj-window__icon {
    text-shadow: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-wm.css
git commit -m "feat(wm): add window chrome CSS styles"
```

---

### Task 2: Add `position: fixed` to taskbar CSS

**Files:**
- Modify: `assets/japanjunky-win95.css`

The taskbar has `z-index: 1000` but no `position` declaration, so the z-index has no effect. It needs `position: fixed` to float above everything.

- [ ] **Step 1: Add positioning to `.jj-taskbar`**

In `assets/japanjunky-win95.css`, add `position: fixed`, `bottom: 0`, `left: 0`, `width: 100%` to the `.jj-taskbar` rule (lines 7-19):

```css
.jj-taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 32px;
  background: #0a0a0a;
  border-top: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 2px 8px;
  gap: 4px;
  flex-shrink: 0;
  z-index: 1000;
  font-size: 12px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-win95.css
git commit -m "fix(taskbar): add position:fixed so z-index takes effect"
```

---

### Task 3: Restructure theme.liquid for desktop OS shell

**Files:**
- Modify: `layout/theme.liquid`

This is the biggest structural change. Key decisions:
- Three.js + screensaver load site-wide (not index-only)
- CSS3DRenderer deferred (not loaded in Phase 1)
- Header stays as OS-level chrome (outside windows)
- `content_for_layout` gets `data-jj-window` wrapper
- Desktop layer container added
- Window manager script loaded last

- [ ] **Step 1: Add `japanjunky-wm.css` stylesheet to `<head>`**

After line 33 (`japanjunky-calendar.css`), add:

```liquid
  {{ 'japanjunky-wm.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 2: Restructure `<body>` content**

Replace the body content (lines 130–173) with this structure. The key change: header is extracted from `.jj-page-wrapper` and placed as fixed OS chrome. The `<main>` gets `data-jj-window` attributes. The `.jj-page-wrapper` is simplified. A `#jj-desktop` container is added for the window manager to move windows into.

```liquid
<body class="jj-body">
<canvas id="jj-screensaver" aria-hidden="true" tabindex="-1" style="
  position:fixed;top:0;left:0;width:100vw;height:100vh;
  z-index:0;image-rendering:pixelated;image-rendering:crisp-edges;
  pointer-events:none;
"></canvas>

  {%- comment -%} OS Shell: header as fixed chrome {%- endcomment -%}
  <div class="jj-shell-header jj-crt-frame jj-crt-on">
    {% sections 'header-group' %}
  </div>

  {%- comment -%} Desktop layer: window manager moves windows here {%- endcomment -%}
  <div class="jj-desktop" id="jj-desktop"></div>

  {%- comment -%} Page content: will be wrapped in window chrome by JS {%- endcomment -%}
  {%- case request.page_type -%}
    {%- when 'cart' -%}{%- assign jj_win_title = 'CART.EXE' -%}
    {%- when 'search' -%}{%- assign jj_win_title = 'SEARCH.EXE' -%}
    {%- when '404' -%}{%- assign jj_win_title = 'ERROR.EXE' -%}
    {%- else -%}{%- assign jj_win_title = 'CATALOG.EXE' -%}
  {%- endcase -%}

  <div id="jj-window-source" style="display:none;">
    <main id="MainContent" class="jj-main" role="main"
          data-jj-window="catalog"
          data-jj-window-title="{{ jj_win_title }}"
          data-jj-window-icon=">"
          data-jj-window-persistent="true"
          data-jj-window-statusbar="true">
      {{ content_for_layout }}
    </main>
  </div>

  {%- comment -%} Taskbar (fixed at bottom, managed by WM) {%- endcomment -%}
  {% sections 'footer-group' %}

  <script>
    window.JJ_WM_CONFIG = {
      pageType: {{ request.page_type | json }},
      windowTitle: {{ jj_win_title | json }}
    };
  </script>

  <script>
    window.JJ_SCREENSAVER_CONFIG = {
      enabled: {{ settings.screensaver_enabled | default: true }},
      resolution: {{ settings.screensaver_resolution | default: 240 }},
      fps: {{ settings.screensaver_fps | default: 24 }},
      orbitSpeed: '{{ settings.screensaver_orbit_speed | default: "slow" }}',
      mouseInteraction: {{ settings.screensaver_mouse | default: true }},
      tunnelTexture: {{ 'sample3.jpg' | asset_url | json }},
      swirlTexture: {{ 'vortex-swirl.jpg' | asset_url | json }},
      ghostTexture: {{ 'tsuno-daishi.jpg' | asset_url | json }},
      textures: []
    };
  </script>
  <script src="{{ 'three.min.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver-post.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-screensaver.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-cursor-light.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-dither.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-parallax.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-product-select.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-search.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-win95-menu.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-holidays.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-calendar.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-wm.js' | asset_url }}" defer></script>
</body>
```

Key structural decisions:
- `#jj-window-source` is a hidden container holding the `data-jj-window` content. On DOMContentLoaded, the WM JS will inject chrome around it and move it into `#jj-desktop`.
- Header is wrapped in `.jj-shell-header` (fixed position OS chrome).
- Taskbar (`footer-group`) is outside `.jj-page-wrapper` entirely — it's `position: fixed` via Task 2.
- Three.js loads on all pages (not index-only).
- `japanjunky-wm.js` loads last (after all other scripts).

- [ ] **Step 3: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(wm): restructure theme.liquid for desktop OS shell

- Move Three.js + screensaver loading site-wide (was index-only)
- Extract header as fixed OS-level shell chrome
- Add data-jj-window wrapper around content_for_layout
- Add #jj-desktop container for window manager
- Add window manager config and script load
- Page type mapped to window title via Liquid case statement"
```

---

### Task 4: Modify taskbar footer to use JS-managed tabs

**Files:**
- Modify: `sections/jj-footer-win95.liquid`
- Delete: `snippets/win95-taskbar-tab.liquid`

- [ ] **Step 1: Replace static tabs with empty container**

In `sections/jj-footer-win95.liquid`, replace lines 13–16:

Old:
```liquid
  <div class="jj-taskbar__tabs">
    {% render 'win95-taskbar-tab', label: 'catalog.exe', url: '/', icon: '>', active: true %}
    {% render 'win95-taskbar-tab', label: 'browse.exe', url: '/collections/all', icon: '>' %}
  </div>
```

New:
```liquid
  <div class="jj-taskbar__tabs" id="jj-taskbar-tabs">
    {%- comment -%} Tabs managed dynamically by japanjunky-wm.js {%- endcomment -%}
  </div>
```

- [ ] **Step 2: Delete `snippets/win95-taskbar-tab.liquid`**

```bash
git rm snippets/win95-taskbar-tab.liquid
```

- [ ] **Step 3: Commit**

```bash
git add sections/jj-footer-win95.liquid
git commit -m "feat(wm): convert taskbar tabs from static Liquid to JS-managed

Remove server-rendered taskbar tab snippet. Tabs are now created
dynamically by the window manager JS."
```

---

## Chunk 2: Window Manager Core

### Task 5: Create window manager JS — registration, chrome injection, focus, minimize, maximize, close, drag

**Files:**
- Create: `assets/japanjunky-wm.js`

This is the core window manager. Handles everything: finding `[data-jj-window]` elements in `#jj-window-source`, wrapping them in chrome, moving them into `#jj-desktop`, and managing all window behaviors.

- [ ] **Step 1: Create `assets/japanjunky-wm.js`**

```javascript
/**
 * Japanjunky - Window Manager
 *
 * DOM-based window management for the desktop OS shell.
 * Finds [data-jj-window] elements, wraps them in window chrome,
 * moves them into #jj-desktop, handles drag, focus, minimize,
 * maximize, close, and taskbar sync.
 */
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  var windows = {};        // appId -> windowState
  var zCounter = 10;       // z-index counter for focus ordering
  var focusedId = null;    // currently focused window appId
  var taskbarEl = null;    // #jj-taskbar-tabs container
  var desktopEl = null;    // #jj-desktop container
  var ANIM_TIMEOUT = 400;  // safety timeout for transition cleanup (ms)

  // ─── Window State Object ────────────────────────────────
  function createWindowState(appId, el, opts) {
    return {
      id: appId,
      el: el,                       // .jj-window wrapper
      contentEl: null,              // .jj-window__content
      persistent: opts.persistent,
      title: opts.title,
      icon: opts.icon,
      minimized: false,
      maximized: false,
      focused: false,
      // Position/size before maximize (for restore)
      prevRect: null,
      // Taskbar tab element
      tabEl: null
    };
  }

  // ─── Chrome Injection ───────────────────────────────────
  function injectChrome(sourceEl) {
    var appId = sourceEl.getAttribute('data-jj-window');
    var title = sourceEl.getAttribute('data-jj-window-title') || appId.toUpperCase() + '.EXE';
    var icon = sourceEl.getAttribute('data-jj-window-icon') || '>';
    var persistent = sourceEl.getAttribute('data-jj-window-persistent') === 'true';
    var hasStatusbar = sourceEl.getAttribute('data-jj-window-statusbar') === 'true';

    // Create window wrapper
    var win = document.createElement('div');
    win.className = 'jj-window' + (persistent ? ' jj-window--persistent' : ' jj-window--disposable');
    win.setAttribute('data-jj-wm-id', appId);
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', title);

    // Title bar
    var titlebar = document.createElement('div');
    titlebar.className = 'jj-window__titlebar';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'jj-window__icon';
    iconSpan.textContent = icon;

    var titleSpan = document.createElement('span');
    titleSpan.className = 'jj-window__title';
    titleSpan.textContent = title;

    var controls = document.createElement('div');
    controls.className = 'jj-window__controls';

    var btnMin = document.createElement('button');
    btnMin.className = 'jj-window-btn jj-window-btn--minimize';
    btnMin.textContent = '\u2500'; // ─
    btnMin.setAttribute('aria-label', 'Minimize ' + title);

    var btnMax = document.createElement('button');
    btnMax.className = 'jj-window-btn jj-window-btn--maximize';
    btnMax.textContent = '\u25A1'; // □
    btnMax.setAttribute('aria-label', 'Maximize ' + title);

    var btnClose = document.createElement('button');
    btnClose.className = 'jj-window-btn jj-window-btn--close';
    btnClose.textContent = '\u00D7'; // ×
    btnClose.setAttribute('aria-label', persistent ? 'Minimize ' + title : 'Close ' + title);

    controls.appendChild(btnMin);
    controls.appendChild(btnMax);
    controls.appendChild(btnClose);

    titlebar.appendChild(iconSpan);
    titlebar.appendChild(titleSpan);
    titlebar.appendChild(controls);

    // Content wrapper — preserve #MainContent ID and role="main" for a11y
    var content = document.createElement('div');
    content.className = 'jj-window__content';
    content.id = 'MainContent';
    content.setAttribute('role', 'main');

    // Move source element's children into content
    while (sourceEl.firstChild) {
      content.appendChild(sourceEl.firstChild);
    }

    // Status bar
    var statusbar = null;
    if (hasStatusbar) {
      statusbar = document.createElement('div');
      statusbar.className = 'jj-window__statusbar';
      statusbar.textContent = 'Ready';
    }

    // Assemble
    win.appendChild(titlebar);
    win.appendChild(content);
    if (statusbar) win.appendChild(statusbar);

    // Move window into the desktop layer (not left in page wrapper)
    desktopEl.appendChild(win);

    // Register
    var state = createWindowState(appId, win, {
      title: title,
      icon: icon,
      persistent: persistent
    });
    state.contentEl = content;
    windows[appId] = state;

    // Create taskbar tab
    createTab(state);

    // Wire control buttons
    btnMin.addEventListener('click', function (e) {
      e.stopPropagation();
      minimize(appId);
    });
    btnMax.addEventListener('click', function (e) {
      e.stopPropagation();
      maximize(appId);
    });
    btnClose.addEventListener('click', function (e) {
      e.stopPropagation();
      if (persistent) {
        minimize(appId);
      } else {
        close(appId);
      }
    });

    // Double-click title bar to toggle maximize
    titlebar.addEventListener('dblclick', function (e) {
      e.preventDefault();
      maximize(appId);
    });

    // Click window to focus
    win.addEventListener('mousedown', function () {
      focus(appId);
    });

    // Drag on title bar
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.jj-window-btn')) return;
      onDragStart(appId, e);
    });

    return state;
  }

  // ─── Taskbar Tab ────────────────────────────────────────
  function createTab(state) {
    if (!taskbarEl) return;

    var tab = document.createElement('button');
    tab.className = 'jj-taskbar-tab';
    tab.setAttribute('data-jj-wm-tab', state.id);
    tab.title = state.title;

    var iconSpan = document.createElement('span');
    iconSpan.className = 'jj-taskbar-tab__icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = state.icon;

    tab.appendChild(iconSpan);
    tab.appendChild(document.createTextNode(' ' + state.title.toLowerCase()));

    tab.addEventListener('click', function () {
      var s = windows[state.id];
      if (!s) return;
      if (s.minimized) {
        restore(state.id);
      } else if (s.focused) {
        minimize(state.id);
      } else {
        focus(state.id);
      }
    });

    taskbarEl.appendChild(tab);
    state.tabEl = tab;
  }

  function updateTab(state) {
    if (!state.tabEl) return;
    state.tabEl.classList.toggle('jj-taskbar-tab--active', state.focused && !state.minimized);
    state.tabEl.classList.toggle('jj-taskbar-tab--minimized', state.minimized);
  }

  // ─── Focus ──────────────────────────────────────────────
  function focus(appId) {
    var state = windows[appId];
    if (!state || state.minimized) return;

    // Unfocus previous
    if (focusedId && windows[focusedId]) {
      windows[focusedId].focused = false;
      windows[focusedId].el.classList.remove('jj-window--focused');
      updateTab(windows[focusedId]);
    }

    // Focus new
    zCounter++;
    state.el.style.zIndex = zCounter;
    state.focused = true;
    state.el.classList.add('jj-window--focused');
    focusedId = appId;
    updateTab(state);
  }

  // ─── Minimize ───────────────────────────────────────────
  function minimize(appId) {
    var state = windows[appId];
    if (!state || state.minimized) return;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      finishMinimize(state);
    } else {
      var tabRect = state.tabEl ? state.tabEl.getBoundingClientRect() : null;
      var winRect = state.el.getBoundingClientRect();

      if (tabRect) {
        var dx = tabRect.left + tabRect.width / 2 - (winRect.left + winRect.width / 2);
        var dy = tabRect.top + tabRect.height / 2 - (winRect.top + winRect.height / 2);

        state.el.classList.add('jj-window--minimizing');
        state.el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.05)';
        state.el.style.opacity = '0';

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          state.el.removeEventListener('transitionend', onEnd);
          state.el.classList.remove('jj-window--minimizing');
          state.el.style.transform = '';
          state.el.style.opacity = '';
          finishMinimize(state);
        }

        function onEnd(e) {
          if (e.propertyName === 'transform') cleanup();
        }

        state.el.addEventListener('transitionend', onEnd);
        setTimeout(cleanup, ANIM_TIMEOUT);
      } else {
        finishMinimize(state);
      }
    }

    state.minimized = true;
    state.focused = false;
    state.el.classList.remove('jj-window--focused');
    if (focusedId === appId) focusedId = null;
    updateTab(state);
  }

  function finishMinimize(state) {
    state.el.style.display = 'none';
  }

  // ─── Restore ────────────────────────────────────────────
  function restore(appId) {
    var state = windows[appId];
    if (!state || !state.minimized) return;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    state.el.style.display = '';
    state.minimized = false;

    if (!reducedMotion) {
      var tabRect = state.tabEl ? state.tabEl.getBoundingClientRect() : null;
      var winRect = state.el.getBoundingClientRect();

      if (tabRect) {
        var dx = tabRect.left + tabRect.width / 2 - (winRect.left + winRect.width / 2);
        var dy = tabRect.top + tabRect.height / 2 - (winRect.top + winRect.height / 2);

        state.el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.05)';
        state.el.style.opacity = '0';

        // Force reflow
        void state.el.offsetHeight;

        state.el.classList.add('jj-window--restoring');
        state.el.style.transform = '';
        state.el.style.opacity = '';

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          state.el.removeEventListener('transitionend', onEnd);
          state.el.classList.remove('jj-window--restoring');
        }

        function onEnd(e) {
          if (e.propertyName === 'transform') cleanup();
        }

        state.el.addEventListener('transitionend', onEnd);
        setTimeout(cleanup, ANIM_TIMEOUT);
      }
    }

    focus(appId);
  }

  // ─── Maximize ───────────────────────────────────────────
  function maximize(appId) {
    var state = windows[appId];
    if (!state) return;

    if (state.maximized) {
      // Restore from maximized
      state.el.classList.remove('jj-window--maximized');
      if (state.prevRect) {
        state.el.style.left = state.prevRect.left;
        state.el.style.top = state.prevRect.top;
        state.el.style.width = state.prevRect.width;
        state.el.style.height = state.prevRect.height;
      }
      state.maximized = false;
      state.prevRect = null;
    } else {
      // Save current rect then maximize
      state.prevRect = {
        left: state.el.style.left,
        top: state.el.style.top,
        width: state.el.style.width,
        height: state.el.style.height
      };
      state.el.classList.add('jj-window--maximized');
      state.maximized = true;
    }

    focus(appId);
  }

  // ─── Close (disposable only) ────────────────────────────
  function close(appId) {
    var state = windows[appId];
    if (!state) return;
    if (state.persistent) {
      minimize(appId);
      return;
    }

    // Remove tab
    if (state.tabEl && state.tabEl.parentNode) {
      state.tabEl.parentNode.removeChild(state.tabEl);
    }

    // Remove window
    if (state.el.parentNode) {
      state.el.parentNode.removeChild(state.el);
    }

    if (focusedId === appId) focusedId = null;
    delete windows[appId];
  }

  // ─── Drag ───────────────────────────────────────────────
  var dragState = null;

  function onDragStart(appId, e) {
    var state = windows[appId];
    if (!state || state.maximized) return;

    var rect = state.el.getBoundingClientRect();
    dragState = {
      appId: appId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };

    state.el.classList.add('jj-window--dragging');
    focus(appId);

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    var state = windows[dragState.appId];
    if (!state) { onDragEnd(); return; }

    var newLeft = e.clientX - dragState.offsetX;
    var newTop = e.clientY - dragState.offsetY;

    state.el.style.left = newLeft + 'px';
    state.el.style.top = newTop + 'px';

    // Edge detection: if persistent window's center leaves viewport, auto-minimize
    if (state.persistent) {
      var rect = state.el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      if (cx < 0 || cx > vw || cy < 0 || cy > vh) {
        onDragEnd();
        minimize(state.id);
      }
    }
  }

  function onDragEnd() {
    if (!dragState) return;
    var state = windows[dragState.appId];
    if (state) {
      state.el.classList.remove('jj-window--dragging');
    }
    dragState = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  // ─── Public API ─────────────────────────────────────────
  window.JJ_WM = {
    open: function (appId) {
      var state = windows[appId];
      if (state) {
        if (state.minimized) restore(appId);
        else focus(appId);
        return;
      }
      // For Phase 1, windows are created from data attributes on page load.
      // Dynamic window creation (Phase 2+) will extend this.
    },
    close: close,
    minimize: minimize,
    maximize: maximize,
    restore: restore,
    focus: focus,
    isOpen: function (appId) {
      return !!windows[appId];
    },
    getState: function (appId) {
      var s = windows[appId];
      if (!s) return null;
      return {
        position: { left: s.el.style.left, top: s.el.style.top },
        size: { width: s.el.style.width, height: s.el.style.height },
        minimized: s.minimized,
        maximized: s.maximized,
        focused: s.focused
      };
    }
  };

  // ─── Init ───────────────────────────────────────────────
  function init() {
    taskbarEl = document.getElementById('jj-taskbar-tabs');
    desktopEl = document.getElementById('jj-desktop');

    if (!desktopEl) {
      console.warn('JJ_WM: #jj-desktop not found, cannot initialize window manager.');
      return;
    }

    // Find all data-jj-window elements and inject chrome
    var sources = document.querySelectorAll('[data-jj-window]');
    for (var i = 0; i < sources.length; i++) {
      var state = injectChrome(sources[i]);

      // Position the first window centered at ~80% viewport
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var w = Math.round(vw * 0.8);
      var h = Math.round((vh - 32) * 0.8); // minus taskbar
      var l = Math.round((vw - w) / 2);
      var t = Math.round(((vh - 32) - h) / 2);

      state.el.style.left = l + 'px';
      state.el.style.top = t + 'px';
      state.el.style.width = w + 'px';
      state.el.style.height = h + 'px';

      // Focus the first window
      focus(state.id);
    }

    // Clean up the hidden source container
    var sourceContainer = document.getElementById('jj-window-source');
    if (sourceContainer) {
      sourceContainer.parentNode.removeChild(sourceContainer);
    }
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
```

- [ ] **Step 2: Verify in browser**

Open the site. Expected:
- Catalog content wrapped in a window with title bar, controls, and status bar
- Window floats over the screensaver (inside `#jj-desktop`, not `#jj-page-wrapper`)
- Window centered at ~80% of viewport
- Screensaver visible behind/around the window
- Taskbar at bottom with a tab showing the window title
- Clicking minimize: window animates toward taskbar tab and hides
- Clicking taskbar tab: window restores to previous position
- Clicking maximize: window fills viewport (minus taskbar)
- Double-click title bar: toggles maximize
- Close button on persistent window: minimizes (doesn't close)
- Drag title bar: window follows cursor, drop shadow appears
- Drag persistent window center off-screen: auto-minimizes
- Header visible as fixed OS chrome above the window
- Screensaver runs on all pages (not just homepage)
- Navigate to `/collections/all`, `/cart`, `/search` — correct window titles

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-wm.js
git commit -m "feat(wm): add window manager — chrome injection, focus, drag, minimize, maximize, close

Finds [data-jj-window] elements, wraps in window chrome, moves into
#jj-desktop layer. Manages focus z-ordering, taskbar tab sync,
minimize/restore animations with safety timeouts, maximize toggle,
drag with edge auto-minimize. Exposes JJ_WM global API."
```

---

## Chunk 3: Start Menu Integration & Testing

### Task 6: Wire start menu to window manager

**Files:**
- Modify: `assets/japanjunky-win95-menu.js`

Start menu links that point to the current page should restore/focus the catalog window instead of triggering a page reload.

- [ ] **Step 1: Add JJ_WM integration at the end of the IIFE**

Before the closing `})();` in `assets/japanjunky-win95-menu.js`, after the clock popover code (after line 103), add:

```javascript
  // ─── Window Manager Integration ───────────────────────────
  // If a start menu link points to the current page, restore/focus the window
  // instead of triggering a page reload.
  var menuLinks = document.querySelectorAll('.jj-start-menu__item[href], .jj-start-submenu__item[href]');
  for (var i = 0; i < menuLinks.length; i++) {
    (function (link) {
      link.addEventListener('click', function (e) {
        if (link.pathname === window.location.pathname && window.JJ_WM) {
          e.preventDefault();
          window.JJ_WM.open('catalog');
          // Close start menu
          if (startMenu) {
            startMenu.classList.remove('jj-start-menu--open');
            startBtn.classList.remove('jj-start-btn--active');
            startBtn.setAttribute('aria-expanded', 'false');
          }
        }
        // Otherwise, let normal navigation happen
      });
    })(menuLinks[i]);
  }
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-win95-menu.js
git commit -m "feat(wm): wire start menu to window manager

Start menu links matching current page restore/focus the window
instead of triggering a page reload."
```

---

### Task 7: Manual testing checklist

No files changed — verification only.

- [ ] **Step 1: Test all window behaviors**

1. **Page load**: Catalog window appears centered at ~80% viewport. Screensaver visible behind.
2. **Window chrome**: Title bar shows icon (`>`), title (e.g., `CATALOG.EXE`), and min/max/close buttons.
3. **Focus**: Clicking window brings it to front (title bar glows red).
4. **Drag**: Title bar drag moves window. Cursor changes to `move`. Drop shadow appears.
5. **Edge minimize**: Drag persistent window center off-screen → auto-minimizes to taskbar.
6. **Minimize button**: Click `[─]` → window animates to taskbar tab and hides.
7. **Restore**: Click minimized taskbar tab → window animates back to previous position.
8. **Maximize**: Click `[□]` → window fills viewport (minus taskbar). Click again → restores.
9. **Maximize then minimize then restore**: Maximize → minimize → click tab → window restores in maximized state.
10. **Double-click title bar**: Same as maximize toggle.
11. **Close button (persistent)**: Click `[×]` on catalog → minimizes (doesn't close).
12. **Taskbar tab states**: Active (focused) = highlighted. Minimized = dimmed/inset.
13. **Taskbar tab click cycle**: Focused → minimize. Unfocused → focus. Minimized → restore.
14. **Start menu**: Click a menu item for current page → restores/focuses window.
15. **Content scrolling**: Catalog content scrolls inside window. Product table, filters work.
16. **Other page types**: Navigate to `/collections/all`, `/cart`, `/search` — correct window titles.
17. **Reduced motion**: Enable `prefers-reduced-motion: reduce` → animations are instant.
18. **Screensaver**: Portal screensaver runs on all pages.
19. **Header visible**: Header (search, nav, cart count) visible as OS chrome above the window.
20. **Taskbar visible**: Taskbar fixed at bottom, always on top.
21. **CRT overlays**: Scanlines and vignette still render over everything.

- [ ] **Step 2: Fix any issues found and commit fixes individually**
