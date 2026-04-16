# Login & Register Page — Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Approach:** New camera preset + Tsuno override in existing screensaver system (Approach A)

## Overview

A dedicated login page at `/account/login` with the portal vortex as background, viewed from above and angled slightly downward. A centered terminal-styled auth panel handles login, register, and password reset via screen-swap transitions. Tsuno Daishi appears massive behind the panel — a watchful presence whose gaze flips left/right as the user types.

Single page for all auth flows. No separate register page — register is a screen-swap within the same panel. Shopify's native customer account system handles all backend logic.

## 1. Camera Preset

**File:** `assets/japanjunky-screensaver.js` — `CAMERA_PRESETS` object

New preset added alongside `default` and `product`:

```javascript
login: { pos: [0, 2.5, -1], look: [0, -1, 30] }
```

- Position above center, same depth as default
- LookAt angled downward into the vortex mouth
- Clear color: warm amber `0x3a1a08` (same as product page — camera is off-axis, tunnel wall edges visible)

Detection: `var isLoginPreset = (config.cameraPreset === 'login');`

Applied in `theme.liquid` alongside the existing product preset conditional.

## 2. Page Template

**New file:** `templates/customers/login.liquid`

Shopify automatically serves this at `/account/login`. Structure follows the product page pattern:

```html
<script>
  window.JJ_SCREENSAVER_CONFIG = window.JJ_SCREENSAVER_CONFIG || {};
  window.JJ_SCREENSAVER_CONFIG.cameraPreset = 'login';
</script>

<div class="jj-auth" id="jj-auth">
  <!-- Login form (default visible) -->
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

  <!-- Register form (hidden, swapped in via JS) -->
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

  <!-- Password reset form (hidden, swapped in via JS) -->
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

<!-- No-JS fallback -->
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

All three screen divs exist in the DOM on load — JS toggles `display:none` during screen-swap. This avoids innerHTML replacement and preserves form state.

## 3. Auth Panel Styling

**New file:** `assets/japanjunky-auth.css`

### Panel container

```css
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
```

### Title

```css
.jj-auth__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--jj-secondary);
  text-transform: uppercase;
  padding: 4px 10px;
  background: #0a0a0a;
  margin-bottom: 12px;
}
.jj-auth__prompt {
  font-size: 10px;
  color: var(--jj-green, #33ff33);
  font-weight: 400;
  text-shadow: 0 0 4px rgba(51, 255, 51, 0.4);
}
```

### Form rows

```css
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
  font-size: 12px;
  color: #888;
  text-transform: none;
}
.jj-auth__row input {
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #333;
  color: var(--jj-text, #e0d5c0);
  font-family: inherit;
  font-size: 12px;
  padding: 3px 6px;
}
```

### Actions, divider, switch, error

```css
.jj-auth__actions {
  padding: 8px 10px 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.jj-auth__forgot {
  font-size: 10px;
  color: #666;
  text-decoration: none;
}
.jj-auth__forgot:hover {
  color: var(--jj-primary, #e8313a);
}
.jj-auth__divider {
  border-top: 1px solid #333;
  margin: 10px 0 8px;
}
.jj-auth__switch {
  font-size: 11px;
  color: #666;
  padding: 0 10px;
}
.jj-auth__switch-link {
  color: var(--jj-accent, #33ff33);
  text-decoration: none;
}
.jj-auth__switch-link:hover {
  text-shadow: 0 0 6px rgba(51, 255, 51, 0.6);
}
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
```

### Flash state (applied during swap)

```css
.jj-auth--flash {
  background-color: rgba(40, 30, 20, 0.9);
}
```

## 4. Screen-Swap Logic

**New file:** `assets/japanjunky-auth.js`

### Swap mechanics

All three screens exist in DOM. Swap function:

1. Add `.jj-auth--flash` class to `.jj-auth` (background brightens via CSS transition, 100ms)
2. At 100ms: hide current screen (`display:none`), show target screen (`display:block`)
3. Remove `.jj-auth--flash` class (background eases back, 100ms)
4. Focus first input of new screen

```javascript
function swapScreen(targetId) {
  var panel = document.getElementById('jj-auth');
  var screens = panel.querySelectorAll('.jj-auth__screen');
  
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
```

### Event listeners

- `jj-auth-to-register` click → `swapScreen('jj-auth-register')`
- `jj-auth-to-login` click → `swapScreen('jj-auth-login')`
- `jj-auth-forgot-link` click → `swapScreen('jj-auth-reset')`
- `jj-auth-to-login-from-reset` click → `swapScreen('jj-auth-login')`

All links call `e.preventDefault()` before swap.

### Keystroke event dispatch

```javascript
var authInputs = document.querySelectorAll('.jj-auth input');
for (var i = 0; i < authInputs.length; i++) {
  authInputs[i].addEventListener('keydown', function () {
    document.dispatchEvent(new CustomEvent('jj-auth-keystroke'));
  });
}
```

### Error parsing

On page load, check URL for Shopify error indicators:

```javascript
var params = new URLSearchParams(window.location.search);
if (window.location.hash === '#recover' || params.get('reset') === 'true') {
  // Show reset form
  swapScreen('jj-auth-reset');
}
// Shopify sets form errors via Liquid — check for inline error elements
```

### Reduced motion

```javascript
var prefersReducedMotion = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

If true, skip the flash — instant content swap.

## 5. Tsuno Login Behavior

**File:** `assets/japanjunky-screensaver.js`

### Detection

```javascript
var tsunoLoginPageMode = (config.cameraPreset === 'login');
```

Same pattern as `tsunoProductPageMode`.

### Position & Scale

```javascript
var TSUNO_LOGIN_POS = { x: 0, y: 0.5, z: 3 };
```

Scale: `vec3(-3.5, 3.5, 1)` — massive. At z:3 with camera at z:-1 (distance of 4 units), Tsuno's 1.8×5.25 plane at 3.5x scale becomes 6.3×18.375 world units — only the upper body/face is visible within the 60° FOV. The face and eyes dominate the viewport behind the translucent auth panel.

### Idle drift

Applied every frame in login mode:

```javascript
tsunoMesh.position.x = TSUNO_LOGIN_POS.x + Math.sin(t * 0.15) * 0.3;
tsunoMesh.position.y = TSUNO_LOGIN_POS.y + Math.sin(t * 0.22) * 0.15;
tsunoMesh.position.z = TSUNO_LOGIN_POS.z;
```

Very slow, subtle movement — breathing presence.

### Eye-tracking (keystroke flip)

Screensaver listens for the `jj-auth-keystroke` custom event:

```javascript
var lastFlipTime = 0;
var FLIP_THROTTLE = 0.3; // 300ms minimum between flips

document.addEventListener('jj-auth-keystroke', function () {
  var now = performance.now() * 0.001;
  if (now - lastFlipTime < FLIP_THROTTLE) return;
  if (Math.random() < 0.4) return; // 40% chance to skip — organic feel
  lastFlipTime = now;
  tsunoMesh.scale.x = tsunoMesh.scale.x > 0 ? -3.5 : 3.5;
});
```

The flip creates the illusion of eyes tracking left/right as text appears in the input field.

### Overrides

When `tsunoLoginPageMode` is true:
- Skip personality system (no moods, no behavior cycling)
- Skip mouse interaction (no lean, no proximity reactions)
- Skip bubble system (no speech)
- Alpha fixed at `0.6`
- Tint: default `vec3(1.0, 0.2, 0.08)`
- `tsunoMesh.lookAt(camera.position)` each frame (faces user)
- No judging, no orbit, no state transitions

### Integration point

In the existing `updateTsunoIdle` function, early return for login mode:

```javascript
if (tsunoLoginPageMode) {
  tsunoMesh.scale.set(-3.5, 3.5, 1);
  tsunoMesh.position.x = TSUNO_LOGIN_POS.x + Math.sin(t * 0.15) * 0.3;
  tsunoMesh.position.y = TSUNO_LOGIN_POS.y + Math.sin(t * 0.22) * 0.15;
  tsunoMesh.position.z = TSUNO_LOGIN_POS.z;
  tsunoMesh.material.uniforms.uAlpha.value = 0.6;
  tsunoMesh.lookAt(camera.position);
  return;
}
```

Same pattern as the existing `tsunoProductPageMode` early return.

## 6. Layout Integration

**File:** `layout/theme.liquid`

### CSS (in `<head>`)

```liquid
{% if template contains 'customers/login' %}
{{ 'japanjunky-auth.css' | asset_url | stylesheet_tag }}
{% endif %}
```

### Camera preset config (in screensaver config block)

```liquid
{%- if template == 'product' -%}cameraPreset: 'product',{%- endif %}
{%- if template contains 'customers/login' -%}cameraPreset: 'login',{%- endif %}
```

### JS (before closing `</body>`)

```liquid
{% if template contains 'customers/login' %}
<script src="{{ 'japanjunky-auth.js' | asset_url }}" defer></script>
{% endif %}
```

### Body class

```liquid
<body class="jj-body{% if template == 'product' %} jj-body--product{% endif %}{% if template contains 'customers/login' %} jj-body--auth{% endif %}">
```

### Hide ring carousel and product zone

The `{% unless template == 'product' %}` guard around the product zone and ring carousel needs to also exclude the login template:

```liquid
{% unless template == 'product' or template contains 'customers/login' %}
```

This hides the ring carousel and product zone on the login page — only the vortex background + Tsuno + auth panel are visible.

## 7. File Summary

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `templates/customers/login.liquid` | Template: auth panel HTML, three screen states, cameraPreset, noscript fallback | ~120 |
| `assets/japanjunky-auth.css` | Auth panel styles: layout, inputs, transitions, error states | ~100 |
| `assets/japanjunky-auth.js` | Screen-swap, keystroke dispatch, error parsing, focus management | ~80 |

### Modified Files

| File | Changes |
|------|---------|
| `layout/theme.liquid` | Auth CSS/JS conditional tags, login camera preset in config, body class, exclude login from ring/product-zone guards |
| `assets/japanjunky-screensaver.js` | `login` camera preset, `tsunoLoginPageMode` flag + login idle behavior, clear color for login preset, keystroke listener |

### Unchanged

- `snippets/member-login-box.liquid` — sidebar login stays as-is
- `snippets/win95-start-menu.liquid` — already handles customer state
- All existing CSS files
- Splash portal, ring carousel, product page systems

## 8. Accessibility

- All inputs have associated `<label>` elements
- Focus moves to first input after screen-swap
- Tab order is logical within each screen
- `prefers-reduced-motion: reduce` — skip flash animation, instant swap
- Noscript fallback provides plain HTML forms
- Auth panel has sufficient color contrast (cream text on dark background)

## 9. Post-Login Behavior

- `return_to` hidden field set to `/` — Shopify redirects to homepage after successful login
- Start menu already shows `profile` / `orders` links when `customer` is truthy
- Sidebar login box already shows `user: {{ customer.first_name | default: customer.email }}`
- No additional changes needed for post-login UI
