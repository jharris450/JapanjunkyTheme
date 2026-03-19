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

      // Position the window centered, accounting for header and taskbar
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var headerEl = document.querySelector('.jj-shell-header');
      var headerH = headerEl ? headerEl.offsetHeight : 0;
      var taskbarH = 32;
      var availH = vh - headerH - taskbarH;
      var w = Math.min(Math.round(vw * 0.65), 1100);
      var h = Math.min(Math.round(availH * 0.75), 700);
      var l = Math.round((vw - w) / 2);
      var t = headerH + Math.round((availH - h) / 2);

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
