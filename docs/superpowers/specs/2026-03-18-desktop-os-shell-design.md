# Desktop OS Shell — Phase 1 Design Spec

## Overview

Transform the JapanJunky Shopify theme into an interactive desktop OS experience. The site presents as a fictional retro operating system: a CRT terminal OS with Win95/98 interaction patterns but an alien, custom aesthetic. The Three.js portal screensaver becomes the desktop wallpaper. Store content (catalog, cart, checkout) lives inside draggable, resizable windows managed by a DOM-based window manager. CSS3DRenderer handles 3D transition effects (minimize/restore animations) without disrupting normal DOM functionality.

The core experience: a user lands on what feels like a forbidden old archive machine. The catalog window opens automatically so the store is immediately functional. Everything else — terminal, media player, mystery files — is discoverable through exploration.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| First-visit experience | Hybrid: catalog auto-opens, more appears over time | Store must be immediately functional; discovery rewards engagement |
| OS aesthetic | Custom terminal OS with Win95/98 roots | Weird and unique, but familiar interaction patterns users know instinctively |
| 3D technology | CSS3DRenderer for effects only | DOM windows preserve Shopify functionality (forms, scrolling, links, a11y); 3D used surgically for transitions |
| Mobile strategy | Simplified single-window PDA/WinCE mode (Phase 3) | Full desktop doesn't work on touch; PDA framing maintains the lore |
| Phasing | 4 phases, this spec covers Phase 1 (core shell) | Manages scope; each phase is independently useful |

## Architecture

### Layer Stack

```
z-index 0    ┌─────────────────────────────┐
             │  WebGL Canvas (screensaver)  │  existing, unchanged
             └─────────────────────────────┘
z-index 1    ┌─────────────────────────────┐
             │  Window Manager Layer (DOM)  │  new — manages all windows
             └─────────────────────────────┘
z-index 2    ┌─────────────────────────────┐
             │  CSS3D Overlay (effects)     │  new — transparent, for 3D transitions
             └─────────────────────────────┘
z-index 1000 ┌─────────────────────────────┐
             │  Taskbar (DOM, fixed)        │  existing, enhanced
             └─────────────────────────────┘
```

- **Window Manager Layer**: JavaScript module creates, positions, drags, focuses, minimizes, and closes window DOM elements.
- **CSS3D Overlay**: Transparent layer. When a 3D effect is needed (minimize/restore animation), the window's DOM node is temporarily handed to CSS3DRenderer, animated in 3D space, then returned to the DOM layer.
- **Taskbar**: Fixed DOM, always on top. Receives events from the Window Manager and updates tabs accordingly.
- **Screensaver**: Continues running independently on its WebGL canvas. No changes in Phase 1.

### Window Anatomy

```
┌─[■] CATALOG.EXE ─────────────────[─][□][×]─┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░                                            ░│
│░         (Liquid template content           ░│
│░          rendered normally here)            ░│
│░                                            ░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├──────────────────────────────────────────────┤
│ STATUS: 247 items loaded          ▓▓▓░░ 60% │
└──────────────────────────────────────────────┘
```

**Title bar:**
- Left: app icon (small ASCII glyph) + window title in Fixedsys, all-caps with `.EXE` suffix
- Right: minimize `[─]`, maximize `[□]`, close `[×]`
- Dragging the title bar moves the window
- Double-clicking title bar toggles maximize
- Bevel borders from existing Win95 CSS patterns

**Content area:**
- Scrollable container receiving existing Liquid-rendered HTML
- Current `.jj-catalog-layout` (3-column: sidebar, product table, detail pane) goes inside as-is

**Status bar (optional per window):**
- Bottom strip for contextual info (item count, active filters, etc.)

**Window chrome styling — custom OS aesthetic:**
- Borders: 1px `#333/#444` bevel with CRT glow on active window title bar (`--jj-primary` red)
- Inactive windows: dimmed title bar, no glow
- No rounded corners
- Button hover colors: close = red, minimize = gold, maximize = cyan (phosphor palette)

### Window Types

**Persistent windows** (catalog, cart, checkout):
- `[×]` button minimizes to taskbar instead of closing
- If dragged so >70% leaves viewport, auto-minimizes to taskbar
- Can never be fully removed

**Disposable windows** (README, media player, etc.):
- `[×]` actually closes and removes from taskbar
- Can be dragged freely, including off-screen

## Window Management Behavior

### Dragging
- Click and hold title bar to initiate drag
- Window follows cursor with offset preserved (no jump-to-center)
- Slight CSS drop shadow while dragging to indicate "lifted" state
- Other windows remain interactive underneath

### Focus / Z-ordering
- Clicking anywhere on a window brings it to front (highest z-index in window layer)
- Corresponding taskbar tab gets active/highlighted state
- Only one window has focus at a time: active title bar glows, others dimmed

### Minimize
- Window shrinks and flies toward its taskbar tab (CSS3DRenderer handles the 3D scale+translate animation)
- After animation: DOM element set to `display: none`, taskbar tab shows minimized state (dimmed/inset)
- Clicking taskbar tab restores: reverse animation, window reappears at previous position and size

### Maximize
- Window expands to fill viewport minus taskbar height
- Maximize button and double-click title bar toggle between maximized and previous size/position

### Close (disposable only)
- Brief close animation (fade or shrink)
- DOM element removed
- Taskbar tab removed

### Taskbar Integration
- Each open window gets a tab styled like existing `.jj-taskbar-tab`
- Tab states: active (focused), inactive (open but unfocused), minimized (dimmed/inset)
- Tab click behavior: minimized → restore; unfocused → bring to front; focused → minimize (Win95 behavior)
- Start menu app entries call window manager API (`JJ_WM.open('catalog')`) instead of page navigation

### Default State on Page Load
- Catalog window opens automatically, centered, at ~80% viewport size
- Taskbar shows `CATALOG.EXE` as active tab
- Desktop (screensaver) visible around edges

## Integration with Existing Codebase

### Unchanged
- `japanjunky-screensaver.js` — runs as-is on canvas at z-index 0
- `japanjunky-screensaver-post.js` — VGA dithering, untouched
- `japanjunky-base.css`, `japanjunky-crt.css`, `japanjunky-ascii.css` — styles apply inside window content areas
- `japanjunky-filter.js`, `japanjunky-search.js`, `japanjunky-calendar.js` — work inside their window's DOM
- `three.min.js` — reused for CSS3DRenderer

### Modified
- **`layout/theme.liquid`** — `.jj-page-wrapper` restructured: header and main content become catalog window content. Taskbar footer stays as fixed DOM, wired to window manager.
- **`japanjunky-win95.css`** — extended with window chrome styles (`.jj-window`, `.jj-window__titlebar`, `.jj-window__content`, etc.). Existing taskbar styles stay, new tab states added.
- **`japanjunky-win95-menu.js`** — start menu handlers call `JJ_WM.open()` instead of direct navigation.

### New Files
- **`assets/japanjunky-wm.js`** — Window manager module. Handles: window registry, creation, drag, focus, minimize/maximize/close, taskbar sync, edge detection, CSS3D animation handoff.
- **`assets/japanjunky-wm.css`** — Window chrome styles, drag states, animation keyframes.
- **`snippets/jj-window.liquid`** — Reusable window wrapper snippet. Usage:
  ```liquid
  {% render 'jj-window',
      title: 'CATALOG.EXE',
      icon: 'catalog',
      persistent: true,
      status_bar: true %}
  ```
  Wraps section content in window chrome DOM. JS window manager finds these on page load and registers them.

### Shopify Routing
Phase 1 uses full page reloads for navigation. Clicking a collection or product triggers a normal Shopify page load, which re-renders the desktop with the appropriate window open. SPA-like behavior (opening products in new windows via AJAX) is Phase 4.

## CSS Class Structure

Following existing `jj-` BEM convention:

```
.jj-window                    — window container
.jj-window--persistent        — persistent window modifier
.jj-window--disposable        — disposable window modifier
.jj-window--focused           — currently focused
.jj-window--maximized         — maximized state
.jj-window--dragging          — being dragged
.jj-window__titlebar          — title bar
.jj-window__icon              — app icon in title bar
.jj-window__title             — title text
.jj-window__controls          — min/max/close button group
.jj-window__btn--minimize     — minimize button
.jj-window__btn--maximize     — maximize button
.jj-window__btn--close        — close button
.jj-window__content           — scrollable content area
.jj-window__statusbar         — optional status bar
.jj-taskbar-tab--active       — focused window tab
.jj-taskbar-tab--minimized    — minimized window tab
.jj-desktop                   — window manager layer container
.jj-desktop__effects          — CSS3D overlay container
```

## Window Manager API

```javascript
window.JJ_WM = {
  open(appId, options)    // open or focus a window
  close(appId)            // close a disposable window
  minimize(appId)         // minimize to taskbar
  maximize(appId)         // toggle maximize
  restore(appId)          // restore from minimized
  focus(appId)            // bring to front
  isOpen(appId)           // check if window exists
  getState(appId)         // { position, size, minimized, maximized, focused }
}
```

Exposed globally so start menu, taskbar, and future Phase 2 apps can interact with it.

## Phase Roadmap

| Phase | Scope |
|-------|-------|
| **Phase 1** (this spec) | Desktop shell, window manager, catalog window, taskbar integration, CSS3D minimize/restore effects |
| **Phase 2** | Apps & discovery: terminal, media player, file explorer, README files, settings panel, image viewer, desktop icons, progressive reveal, right-click context menu |
| **Phase 3** | Mobile: PDA/WinCE single-window mode, touch-adapted taskbar, swipe navigation |
| **Phase 4** | SPA & polish: AJAX navigation, cart/checkout as persistent windows, localStorage state persistence, keyboard shortcuts, sound effects |

## Accessibility Considerations

- All window content remains real DOM: screen readers, keyboard navigation, text selection work normally
- Window focus management follows WAI-ARIA dialog patterns (focus trap optional per window type)
- Title bar buttons are real `<button>` elements with `aria-label`
- `prefers-reduced-motion`: skip CSS3D animations, use instant show/hide
- `prefers-contrast: more`: increase window border contrast, disable glow effects
- Taskbar tabs are keyboard-navigable
