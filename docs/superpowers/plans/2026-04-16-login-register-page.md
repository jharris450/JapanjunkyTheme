# Login & Register Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated login/register page at `/account/login` with the portal vortex viewed from above, a centered terminal-styled auth panel, and a massive watchful Tsuno whose gaze tracks keystrokes.

**Architecture:** New Shopify customer login template + CSS + JS, plus two modifications to existing files (theme.liquid layout integration, screensaver.js camera preset + Tsuno login behavior). Follows the established product-page pattern: template sets `cameraPreset`, screensaver reacts.

**Tech Stack:** Liquid (Shopify templates), vanilla CSS, vanilla JS (ES5, IIFE pattern), Three.js (existing screensaver)

**Spec:** `docs/superpowers/specs/2026-04-16-login-register-page-design.md`

---

### Task 1: Create the Login Template

**Files:**
- Create: `templates/customers/login.liquid` (requires creating `templates/customers/` directory)

This is the Shopify template served at `/account/login`. Contains all three auth screen states (login, register, password reset), the cameraPreset script tag, and a noscript fallback.

- [ ] **Step 1: Create the customers directory**

```bash
mkdir -p templates/customers
```

- [ ] **Step 2: Create `templates/customers/login.liquid`**

```liquid
{%- comment -%}
  JapanJunky Login Page — Terminal-styled auth panel
  with screen-swap between login, register, and password reset.
{%- endcomment -%}

<script>
  window.JJ_SCREENSAVER_CONFIG = window.JJ_SCREENSAVER_CONFIG || {};
  window.JJ_SCREENSAVER_CONFIG.cameraPreset = 'login';
</script>

<div class="jj-auth" id="jj-auth">
  {%- comment -%} Login form (default visible) {%- endcomment -%}
  <div class="jj-auth__screen" id="jj-auth-login" data-screen="login">
    <div class="jj-auth__title">
      <span class="jj-auth__prompt">C:\&gt;</span> auth /login
    </div>
    <div class="jj-auth__error" id="jj-auth-error" style="display:none;"></div>
    <form action="/account/login" method="post">
      <input type="hidden" name="return_to" value="/">
      <div class="jj-auth__row">
        <label for="jj-login-email">user:</label>
        <input type="email" id="jj-login-email" name="customer[email]"
               autocomplete="email" required>
      </div>
      <div class="jj-auth__row">
        <label for="jj-login-pass">pass:</label>
        <input type="password" id="jj-login-pass" name="customer[password]"
               autocomplete="current-password" required>
      </div>
      <div class="jj-auth__actions">
        <button type="submit" class="jj-win95-btn-sm">[Login]</button>
        <a href="#" class="jj-auth__forgot" id="jj-auth-forgot-link">[Forgot?]</a>
      </div>
    </form>
    <div class="jj-auth__divider"></div>
    <div class="jj-auth__switch">
      no account? <a href="#" id="jj-auth-to-register" class="jj-auth__switch-link">[Register]</a>
    </div>
  </div>

  {%- comment -%} Register form (hidden, swapped in via JS) {%- endcomment -%}
  <div class="jj-auth__screen" id="jj-auth-register" data-screen="register" style="display:none;">
    <div class="jj-auth__title">
      <span class="jj-auth__prompt">C:\&gt;</span> auth /register
    </div>
    <div class="jj-auth__error" id="jj-auth-register-error" style="display:none;"></div>
    <form action="/account" method="post">
      <input type="hidden" name="form_type" value="create_customer">
      <input type="hidden" name="return_to" value="/">
      <div class="jj-auth__row">
        <label for="jj-reg-first">first:</label>
        <input type="text" id="jj-reg-first" name="customer[first_name]"
               autocomplete="given-name" required>
      </div>
      <div class="jj-auth__row">
        <label for="jj-reg-last">last:</label>
        <input type="text" id="jj-reg-last" name="customer[last_name]"
               autocomplete="family-name" required>
      </div>
      <div class="jj-auth__row">
        <label for="jj-reg-email">email:</label>
        <input type="email" id="jj-reg-email" name="customer[email]"
               autocomplete="email" required>
      </div>
      <div class="jj-auth__row">
        <label for="jj-reg-pass">pass:</label>
        <input type="password" id="jj-reg-pass" name="customer[password]"
               autocomplete="new-password" required>
      </div>
      <div class="jj-auth__actions">
        <button type="submit" class="jj-win95-btn-sm">[Create Account]</button>
      </div>
    </form>
    <div class="jj-auth__divider"></div>
    <div class="jj-auth__switch">
      have account? <a href="#" id="jj-auth-to-login" class="jj-auth__switch-link">[Login]</a>
    </div>
  </div>

  {%- comment -%} Password reset form (hidden, swapped in via JS) {%- endcomment -%}
  <div class="jj-auth__screen" id="jj-auth-reset" data-screen="reset" style="display:none;">
    <div class="jj-auth__title">
      <span class="jj-auth__prompt">C:\&gt;</span> auth /reset
    </div>
    <form action="/account/recover" method="post">
      <div class="jj-auth__row">
        <label for="jj-reset-email">email:</label>
        <input type="email" id="jj-reset-email" name="email"
               autocomplete="email" required>
      </div>
      <div class="jj-auth__actions">
        <button type="submit" class="jj-win95-btn-sm">[Send Reset]</button>
      </div>
    </form>
    <div class="jj-auth__divider"></div>
    <div class="jj-auth__switch">
      back to <a href="#" id="jj-auth-to-login-from-reset" class="jj-auth__switch-link">[Login]</a>
    </div>
  </div>
</div>

{%- comment -%} No-JS fallback {%- endcomment -%}
<noscript>
  <style>.jj-auth { display: none; }</style>
  <div style="padding: 20px; color: #e0d5c0; font-family: monospace;">
    <h2>Login</h2>
    <form action="/account/login" method="post">
      <input type="hidden" name="return_to" value="/">
      <label>Email: <input type="email" name="customer[email]" required></label><br>
      <label>Password: <input type="password" name="customer[password]" required></label><br>
      <button type="submit">Login</button>
    </form>
    <h2>Register</h2>
    <form action="/account" method="post">
      <input type="hidden" name="form_type" value="create_customer">
      <label>First Name: <input type="text" name="customer[first_name]" required></label><br>
      <label>Last Name: <input type="text" name="customer[last_name]" required></label><br>
      <label>Email: <input type="email" name="customer[email]" required></label><br>
      <label>Password: <input type="password" name="customer[password]" required></label><br>
      <button type="submit">Create Account</button>
    </form>
  </div>
</noscript>
```

- [ ] **Step 3: Commit**

```bash
git add templates/customers/login.liquid
git commit -m "feat(auth): add login/register template with three screen states"
```

---

### Task 2: Create Auth Panel CSS

**Files:**
- Create: `assets/japanjunky-auth.css`

All styles for the centered auth panel: layout, inputs, title bar, actions, divider, screen-swap link, error messages, and flash transition.

- [ ] **Step 1: Create `assets/japanjunky-auth.css`**

```css
/* ============================================
   JAPANJUNKY AUTH PAGE
   Terminal-styled login/register/reset panel
   centered over the portal vortex background.
   ============================================ */

/* --- Panel container --- */
.jj-auth {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 320px;
  z-index: 1;
  background: rgba(8, 5, 3, 0.7);
  border: 1px solid #333;
  padding: 16px 20px 20px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  pointer-events: auto;
  transition: background-color 100ms ease;
}

/* --- Flash state (screen-swap phosphor burst) --- */
.jj-auth--flash {
  background-color: rgba(40, 30, 20, 0.9);
}

/* --- Title bar --- */
.jj-auth__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--jj-secondary);
  text-transform: uppercase;
  padding: 4px 10px;
  background: #0a0a0a;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.jj-auth__prompt {
  font-size: 10px;
  color: var(--jj-green, #33ff33);
  font-weight: 400;
  text-shadow: 0 0 4px rgba(51, 255, 51, 0.4);
}

/* --- Form rows --- */
.jj-auth__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 13px;
  padding: 2px 10px;
}

.jj-auth__row label {
  width: 40px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  color: #888;
  text-transform: none;
  flex-shrink: 0;
}

.jj-auth__row input {
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 12px;
  padding: 3px 6px;
  outline: none;
  min-width: 0;
}

.jj-auth__row input:focus {
  border-color: var(--jj-primary, #e8313a);
  box-shadow: 0 0 4px rgba(232, 49, 58, 0.3);
}

/* --- Actions --- */
.jj-auth__actions {
  padding: 8px 10px 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --- Forgot link --- */
.jj-auth__forgot {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 10px;
  color: #666;
  text-decoration: none;
}

.jj-auth__forgot:hover {
  color: var(--jj-primary, #e8313a);
}

/* --- Divider --- */
.jj-auth__divider {
  border: none;
  border-top: 1px solid #333;
  margin: 10px 0 8px;
}

/* --- Switch link (login <-> register) --- */
.jj-auth__switch {
  font-size: 11px;
  color: #666;
  padding: 0 10px;
}

.jj-auth__switch-link {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  color: var(--jj-accent, #33ff33);
  text-decoration: none;
}

.jj-auth__switch-link:hover {
  text-shadow: 0 0 6px rgba(51, 255, 51, 0.6);
}

/* --- Error message --- */
.jj-auth__error {
  font-size: 11px;
  color: var(--jj-primary, #e8313a);
  padding: 4px 10px;
  margin-bottom: 6px;
}

.jj-auth__error::before {
  content: '> ERR: ';
  color: var(--jj-primary, #e8313a);
}

/* --- Reduced motion: skip flash --- */
@media (prefers-reduced-motion: reduce) {
  .jj-auth {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-auth.css
git commit -m "feat(auth): add auth panel CSS with terminal styling"
```

---

### Task 3: Create Auth JS (Screen-Swap + Keystroke Dispatch)

**Files:**
- Create: `assets/japanjunky-auth.js`

Handles: screen-swap between login/register/reset, CRT flash transition, keystroke event dispatch for Tsuno eye-tracking, error parsing from URL params, focus management.

- [ ] **Step 1: Create `assets/japanjunky-auth.js`**

```javascript
/**
 * JapanJunky Auth — Screen-swap, keystroke dispatch, error handling
 *
 * Manages the login/register/reset screen-swap within the jj-auth panel.
 * Dispatches 'jj-auth-keystroke' custom events on document for the
 * screensaver's Tsuno eye-tracking behavior.
 */
(function () {
  'use strict';

  var panel = document.getElementById('jj-auth');
  if (!panel) return;

  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Screen Swap ───────────────────────────────────────────
  function swapScreen(targetId) {
    var screens = panel.querySelectorAll('.jj-auth__screen');

    if (prefersReducedMotion) {
      for (var i = 0; i < screens.length; i++) {
        screens[i].style.display = 'none';
      }
      var target = document.getElementById(targetId);
      target.style.display = 'block';
      var firstInput = target.querySelector('input:not([type="hidden"])');
      if (firstInput) firstInput.focus();
      return;
    }

    panel.classList.add('jj-auth--flash');

    setTimeout(function () {
      for (var i = 0; i < screens.length; i++) {
        screens[i].style.display = 'none';
      }
      var target = document.getElementById(targetId);
      target.style.display = 'block';
      panel.classList.remove('jj-auth--flash');

      var firstInput = target.querySelector('input:not([type="hidden"])');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // ─── Swap Link Handlers ────────────────────────────────────
  var swapLinks = [
    { id: 'jj-auth-to-register',          target: 'jj-auth-register' },
    { id: 'jj-auth-to-login',             target: 'jj-auth-login' },
    { id: 'jj-auth-forgot-link',          target: 'jj-auth-reset' },
    { id: 'jj-auth-to-login-from-reset',  target: 'jj-auth-login' }
  ];

  for (var i = 0; i < swapLinks.length; i++) {
    (function (link) {
      var el = document.getElementById(link.id);
      if (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          swapScreen(link.target);
        });
      }
    })(swapLinks[i]);
  }

  // ─── Keystroke Dispatch (for Tsuno eye-tracking) ───────────
  var authInputs = panel.querySelectorAll('input:not([type="hidden"])');
  var keystrokeEvent = new CustomEvent('jj-auth-keystroke');

  for (var j = 0; j < authInputs.length; j++) {
    authInputs[j].addEventListener('keydown', function () {
      document.dispatchEvent(keystrokeEvent);
    });
  }

  // ─── Error Handling ────────────────────────────────────────
  // Shopify password recovery redirects to /account/login#recover
  if (window.location.hash === '#recover') {
    swapScreen('jj-auth-reset');
  }

  // Focus first visible input on load
  var visibleScreen = panel.querySelector('.jj-auth__screen[style=""]') ||
                      panel.querySelector('.jj-auth__screen:not([style*="display:none"])');
  if (visibleScreen) {
    var firstInput = visibleScreen.querySelector('input:not([type="hidden"])');
    if (firstInput) firstInput.focus();
  }

})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-auth.js
git commit -m "feat(auth): add screen-swap logic and keystroke dispatch"
```

---

### Task 4: Integrate Auth into Theme Layout

**Files:**
- Modify: `layout/theme.liquid`

Four changes: (1) auth CSS in head, (2) body class, (3) exclude login from ring/product-zone guards, (4) camera preset in screensaver config, (5) auth JS before closing body. Also exclude ring carousel JS.

- [ ] **Step 1: Add auth CSS conditional in `<head>`**

In `layout/theme.liquid`, find line 41 (after the splash CSS conditional):

```liquid
  {% endif %}
```

Insert after it:

```liquid
  {% if template contains 'customers/login' %}
  {{ 'japanjunky-auth.css' | asset_url | stylesheet_tag }}
  {% endif %}
```

The result should read:

```liquid
  {% if settings.splash_enabled %}
  {{ 'japanjunky-splash.css' | asset_url | stylesheet_tag }}
  {% endif %}
  {% if template contains 'customers/login' %}
  {{ 'japanjunky-auth.css' | asset_url | stylesheet_tag }}
  {% endif %}
```

- [ ] **Step 2: Add body class for auth page**

In `layout/theme.liquid`, find line 130:

```liquid
<body class="jj-body{% if template == 'product' %} jj-body--product{% endif %}">
```

Replace with:

```liquid
<body class="jj-body{% if template == 'product' %} jj-body--product{% endif %}{% if template contains 'customers/login' %} jj-body--auth{% endif %}">
```

- [ ] **Step 3: Exclude login from product zone guard**

In `layout/theme.liquid`, find line 147:

```liquid
  {% unless template == 'product' %}
```

Replace with:

```liquid
  {% unless template == 'product' or template contains 'customers/login' %}
```

- [ ] **Step 4: Add login camera preset in screensaver config**

In `layout/theme.liquid`, find line 235:

```liquid
      {%- if template == 'product' -%}cameraPreset: 'product',{%- endif %}
```

Replace with:

```liquid
      {%- if template == 'product' -%}cameraPreset: 'product',{%- endif %}
      {%- if template contains 'customers/login' -%}cameraPreset: 'login',{%- endif %}
```

- [ ] **Step 5: Exclude login from ring carousel JS guard**

In `layout/theme.liquid`, find line 257:

```liquid
  {% unless template == 'product' %}
```

Replace with:

```liquid
  {% unless template == 'product' or template contains 'customers/login' %}
```

- [ ] **Step 6: Add auth JS script tag**

In `layout/theme.liquid`, find the line (after the product-page JS):

```liquid
  <script src="{{ 'japanjunky-product-page.js' | asset_url }}" defer></script>
```

Insert after it:

```liquid
  {% if template contains 'customers/login' %}
  <script src="{{ 'japanjunky-auth.js' | asset_url }}" defer></script>
  {% endif %}
```

- [ ] **Step 7: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(auth): integrate auth CSS/JS and login camera preset into theme layout"
```

---

### Task 5: Add Login Camera Preset to Screensaver

**Files:**
- Modify: `assets/japanjunky-screensaver.js:53-70`

Add the `login` entry to `CAMERA_PRESETS`, add `isLoginPreset` flag, and extend the clear color logic.

- [ ] **Step 1: Add login preset to CAMERA_PRESETS**

In `assets/japanjunky-screensaver.js`, find (around line 53-55):

```javascript
  var CAMERA_PRESETS = {
    default: { pos: [0, 0, -1], look: [0, 0, 30] },
    product: { pos: [-3, 0.5, -1], look: [2, 0, 30] }
  };
```

Replace with:

```javascript
  var CAMERA_PRESETS = {
    default: { pos: [0, 0, -1], look: [0, 0, 30] },
    product: { pos: [-3, 0.5, -1], look: [2, 0, 30] },
    login:   { pos: [0, 2.5, -1], look: [0, -1, 30] }
  };
```

- [ ] **Step 2: Add isLoginPreset flag**

In `assets/japanjunky-screensaver.js`, find (around line 63):

```javascript
  var isProductPagePreset = (config.cameraPreset === 'product');
```

Insert after it:

```javascript
  var isLoginPreset = (config.cameraPreset === 'login');
```

- [ ] **Step 3: Extend clear color for login preset**

In `assets/japanjunky-screensaver.js`, find (around line 70):

```javascript
  var mainClearColor = isProductPagePreset ? 0x3a1a08 : 0x000000;
```

Replace with:

```javascript
  var mainClearColor = (isProductPagePreset || isLoginPreset) ? 0x3a1a08 : 0x000000;
```

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(auth): add login camera preset (above, angled down)"
```

---

### Task 6: Add Tsuno Login Page Behavior to Screensaver

**Files:**
- Modify: `assets/japanjunky-screensaver.js:642-643` (login mode flag + position constant)
- Modify: `assets/japanjunky-screensaver.js:799-811` (updateTsunoIdle early return)
- Modify: `assets/japanjunky-screensaver.js:1039` (tsunoOnProductSelected guard)
- Modify: `assets/japanjunky-screensaver.js:1146` (Tsuno start position)
- Modify: `assets/japanjunky-screensaver.js:1166-1175` (Tsuno initialization)
- Modify: `assets/japanjunky-screensaver.js:2257` (triggerTsunoGrab guard)

Adds `tsunoLoginPageMode` flag, `TSUNO_LOGIN_POS` constant, login idle behavior (massive scale, drift, keystroke flip), and guards in existing Tsuno code paths.

- [ ] **Step 1: Add login mode flag and position constant**

In `assets/japanjunky-screensaver.js`, find (around line 642-643):

```javascript
  var tsunoProductPageMode = config.cameraPreset === 'product';
  var TSUNO_PRODUCT_POS = { x: 2.5, y: -0.5, z: 8 };
```

Replace with:

```javascript
  var tsunoProductPageMode = config.cameraPreset === 'product';
  var tsunoLoginPageMode = config.cameraPreset === 'login';
  var TSUNO_PRODUCT_POS = { x: 2.5, y: -0.5, z: 8 };
  var TSUNO_LOGIN_POS = { x: 0, y: 0.5, z: 3 };
```

- [ ] **Step 2: Add keystroke flip listener variables**

Immediately after the lines added in Step 1 (after `var TSUNO_LOGIN_POS`), add before `var TSUNO_ORBIT_RADIUS`:

Find:

```javascript
  var TSUNO_ORBIT_RADIUS = 2.0;
```

Insert before it:

```javascript
  var tsunoLastFlipTime = 0;
  var TSUNO_FLIP_THROTTLE = 0.3;
```

- [ ] **Step 3: Add login idle early return in updateTsunoIdle**

In `assets/japanjunky-screensaver.js`, find the `updateTsunoIdle` function (around line 799-801):

```javascript
  function updateTsunoIdle(t) {
    if (!tsunoMesh) return;

    // Before first product selection: simple idle bob at fixed position
```

Replace with:

```javascript
  function updateTsunoIdle(t) {
    if (!tsunoMesh) return;

    if (tsunoLoginPageMode) {
      tsunoMesh.scale.set(-3.5, 3.5, 1);
      tsunoMesh.position.x = TSUNO_LOGIN_POS.x + Math.sin(t * 0.15) * 0.3;
      tsunoMesh.position.y = TSUNO_LOGIN_POS.y + Math.sin(t * 0.22) * 0.15;
      tsunoMesh.position.z = TSUNO_LOGIN_POS.z;
      tsunoMesh.material.uniforms.uAlpha.value = 0.6;
      tsunoMesh.lookAt(camera.position);
      return;
    }

    // Before first product selection: simple idle bob at fixed position
```

- [ ] **Step 4: Guard tsunoOnProductSelected for login mode**

In `assets/japanjunky-screensaver.js`, find (around line 1039):

```javascript
    if (tsunoProductPageMode) return; // Product page: Tsuno stays calm
```

Replace with:

```javascript
    if (tsunoProductPageMode || tsunoLoginPageMode) return;
```

- [ ] **Step 5: Update Tsuno start position for login mode**

In `assets/japanjunky-screensaver.js`, find (around line 1146):

```javascript
      var tsunoStartPos = tsunoProductPageMode ? TSUNO_PRODUCT_POS : TSUNO_IDLE_POS;
```

Replace with:

```javascript
      var tsunoStartPos = tsunoLoginPageMode ? TSUNO_LOGIN_POS : (tsunoProductPageMode ? TSUNO_PRODUCT_POS : TSUNO_IDLE_POS);
```

- [ ] **Step 6: Add login mode initialization alongside product mode init**

In `assets/japanjunky-screensaver.js`, find (around line 1171-1175):

```javascript
      if (tsunoProductPageMode) {
        tsunoActivated = true;
        var tInit = performance.now() * 0.001;
        startBehavior(tInit, pickNextBehavior(tsunoMoodIdx, 0));
      }
```

Replace with:

```javascript
      if (tsunoLoginPageMode) {
        tsunoMesh.scale.set(-3.5, 3.5, 1);
        tsunoMesh.position.set(TSUNO_LOGIN_POS.x, TSUNO_LOGIN_POS.y, TSUNO_LOGIN_POS.z);
        tsunoMesh.material.uniforms.uAlpha.value = 0.6;
      } else if (tsunoProductPageMode) {
        tsunoActivated = true;
        var tInit = performance.now() * 0.001;
        startBehavior(tInit, pickNextBehavior(tsunoMoodIdx, 0));
      }
```

- [ ] **Step 7: Guard triggerTsunoGrab for login mode**

In `assets/japanjunky-screensaver.js`, find (around line 2257):

```javascript
      if (!tsunoMesh || tsunoProductPageMode) {
```

Replace with:

```javascript
      if (!tsunoMesh || tsunoProductPageMode || tsunoLoginPageMode) {
```

- [ ] **Step 8: Add keystroke flip event listener**

In `assets/japanjunky-screensaver.js`, find the keystroke flip variables added in Step 2. Now we need to add the actual event listener. Find this block that exists near the end of the Tsuno initialization (inside the texture load callback, after the login/product mode init block from Step 6):

Find the closing of the texture load callback:

```javascript
    });
  }

  // ─── Speech Bubble (3D, same shader as Tsuno) ──────────────
```

Insert before `// ─── Speech Bubble`:

```javascript
  if (tsunoLoginPageMode) {
    document.addEventListener('jj-auth-keystroke', function () {
      if (!tsunoMesh) return;
      var now = performance.now() * 0.001;
      if (now - tsunoLastFlipTime < TSUNO_FLIP_THROTTLE) return;
      if (Math.random() < 0.4) return;
      tsunoLastFlipTime = now;
      tsunoMesh.scale.x = tsunoMesh.scale.x > 0 ? -3.5 : 3.5;
    });
  }

```

- [ ] **Step 9: Commit**

```bash
git add assets/japanjunky-screensaver.js
git commit -m "feat(auth): add massive watchful Tsuno with keystroke eye-tracking on login page"
```

---

### Task 7: Visual Testing & Tuning

**Files:** None new — adjustments to files from Tasks 1-6 if needed.

This task is manual browser testing on the Shopify dev store.

- [ ] **Step 1: Start the Shopify dev server**

```bash
shopify theme dev
```

- [ ] **Step 2: Navigate to `/account/login` and verify:**

1. Portal vortex renders with the camera positioned above, looking down
2. Warm amber clear color visible at tunnel edges (no black void)
3. Auth panel centered on screen with terminal styling
4. Login form visible with `C:\>` prompt, `user:` and `pass:` labels
5. Input focus shows red border glow
6. Tsuno is massive behind the panel — face/eyes dominate the viewport
7. Tsuno drifts slowly (subtle x/y sinusoidal movement)

- [ ] **Step 3: Test screen-swap**

1. Click `[Register]` — flash transition, register form appears with 4 fields
2. Click `[Login]` — flash transition back to login form
3. Click `[Forgot?]` — flash transition to reset form
4. Click `[Login]` from reset — back to login
5. Focus moves to first input after each swap

- [ ] **Step 4: Test Tsuno keystroke tracking**

1. Type in the email field — Tsuno's gaze flips left/right
2. Verify flips are throttled (not every keystroke)
3. Verify some flips are skipped (organic randomness)
4. Switch to register form, type — keystroke tracking still works

- [ ] **Step 5: Test navigation**

1. Verify ring carousel and product zone are NOT visible on login page
2. Verify taskbar is visible at bottom
3. Verify CRT overlay renders on top
4. Navigate to homepage — verify ring carousel and product zone render normally
5. Navigate to a product page — verify product camera preset still works

- [ ] **Step 6: Test accessibility**

1. Tab through all form elements — logical order
2. Verify all inputs have visible labels
3. Enable `prefers-reduced-motion` — verify flash is skipped (instant swap)

- [ ] **Step 7: Tune if needed**

If Tsuno's position/scale needs adjustment for the "eyes watching" effect:
- Adjust `TSUNO_LOGIN_POS.y` (vertical centering of face)
- Adjust scale factor (3.5 may need to be 3.0 or 4.0)
- Adjust alpha (0.6 may be too bright or too dim behind the panel)

If camera angle needs adjustment:
- Adjust `login` preset `pos[1]` (height above portal) or `look[1]` (downward angle)

- [ ] **Step 8: Commit any tuning adjustments**

```bash
git add -A
git commit -m "fix(auth): tune Tsuno position and camera angle for login page"
```
