# Gift Card + Password Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two standalone CRT "gate" pages Shopify renders outside the storefront — a pre-launch password lock screen and a gift-card page (balance/code/QR/copy/print/Apple Wallet) — each with its own lean layout.

**Architecture:** Each page = a lean layout (own `<!doctype>`, loads only base + CRT-overlay + a shared gate stylesheet, no taskbar/scene/scripts) + a plain Liquid template. A shared `japanjunky-gate.css` styles both. Gift-card copy is a tiny JS file; its QR is rendered by Shopify's own `shopify_gift_card.js` with the visible code as fallback.

**Tech Stack:** Shopify OS2.0 Liquid, CSS, vanilla ES5 JS. No build/test runner — verify with `node --check` (JS) + grep + the spec's in-browser checks. Deploy = push to `main` (Shopify GitHub sync), built on a feature branch.

**Spec:** `docs/superpowers/specs/2026-06-17-giftcard-and-password-pages-design.md`

**Codebase facts the implementer needs:**
- Fonts + CRT color-var usage come from `assets/japanjunky-base.css` (it `@import`s the webfonts at the top). The CRT scanline overlay `.jj-crt-overlay` is styled by `assets/japanjunky-crt.css`.
- `assets/japanjunky-base.css` sets `html { overflow:hidden; height:100% }` for the storefront; the gate pages must override that to scroll/print — done in `japanjunky-gate.css` (which loads after base.css).
- The CRT color vars (`--jj-bg/-primary/-secondary/-accent/-text`) are injected per-page from theme settings via a `:root` `<style>` block; the lean layouts replicate that block.

---

## File Structure

New:
- `assets/japanjunky-gate.css` — shared CRT gate styling (shell, password block, gift-card block, print rules, html/body override).
- `layout/password.liquid` — lean layout for the password page.
- `templates/password.liquid` — password lock-screen markup (`storefront_password` form).
- `layout/gift_card.liquid` — lean layout for the gift-card page (+ Shopify QR scripts + giftcard JS).
- `templates/gift_card.liquid` — gift-card markup (`{% layout 'gift_card' %}`).
- `assets/japanjunky-giftcard.js` — copy-to-clipboard + print binding.

Modified: none.

---

## Task 1: Shared gate stylesheet

**Files:**
- Create: `assets/japanjunky-gate.css`

- [ ] **Step 1: Create `assets/japanjunky-gate.css`**

```css
/* ============================================
   JAPANJUNKY GATE PAGES
   Standalone CRT pages (password lock screen + gift card),
   rendered outside the storefront chrome via their own lean layouts.
   ============================================ */

/* Gate pages scroll + print normally (override base.css's fixed storefront
   html/body — this file loads after japanjunky-base.css). */
html { height: auto; overflow: auto; }
body.jj-gate-body {
  min-height: 100vh;
  height: auto;
  overflow: visible;
  margin: 0;
  background: var(--jj-bg, #000);
  color: var(--jj-text, #e0d5c0);
}

/* --- Shared shell --- */
.jj-gate {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}
.jj-gate__panel {
  width: 100%;
  max-width: 420px;
  border: 1px solid var(--jj-primary, #e8313a);
  background: rgba(8, 5, 3, 0.85);
  padding: 20px 24px;
}
.jj-gate__prompt {
  color: var(--jj-accent, #33ff33);
  font-size: 12px;
  margin-bottom: 12px;
}
.jj-gate__title {
  color: var(--jj-secondary, #f5d742);
  font-size: 18px;
  margin: 0 0 12px;
}

/* Shared action button (gate pages don't load the storefront stylesheets) */
.jj-gate-btn {
  font-family: inherit;
  font-size: 12px;
  color: var(--jj-primary, #e8313a);
  background: transparent;
  border: 1px solid var(--jj-primary, #e8313a);
  padding: 4px 10px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.jj-gate-btn:hover {
  color: var(--jj-secondary, #f5d742);
  border-color: var(--jj-secondary, #f5d742);
}

/* --- Password lock screen --- */
.jj-password__msg { font-size: 13px; line-height: 1.6; margin: 0 0 14px; }
.jj-password__form { display: flex; gap: 8px; }
.jj-password__input {
  flex: 1 1 auto;
  padding: 6px 8px;
  background: transparent;
  color: var(--jj-text, #e0d5c0);
  border: 1px solid var(--jj-primary, #e8313a);
  font-family: inherit;
  font-size: 13px;
}
.jj-password__input:focus {
  outline: none;
  border-color: var(--jj-secondary, #f5d742);
  box-shadow: 0 0 6px rgba(245, 215, 66, 0.4);
}
.jj-password__error { color: var(--jj-primary, #e8313a); margin: 10px 0 0; font-size: 12px; }
.jj-password__owner { display: block; margin-top: 16px; font-size: 11px; color: var(--jj-secondary, #f5d742); }
.jj-password__shop { margin-top: 18px; font-size: 11px; opacity: 0.6; text-align: center; }

/* --- Gift card --- */
.jj-giftcard { max-width: 360px; }
.jj-giftcard__balance { color: var(--jj-secondary, #f5d742); font-size: 26px; margin: 0 0 4px; }
.jj-giftcard__initial { font-size: 11px; opacity: 0.6; margin: 0 0 14px; }
.jj-giftcard__label { font-size: 11px; color: var(--jj-accent, #33ff33); margin: 12px 0 2px; }
.jj-giftcard__code-row { display: flex; align-items: center; gap: 8px; }
.jj-giftcard__code { font-size: 16px; letter-spacing: 1px; word-break: break-all; }
.jj-giftcard__qr { margin: 16px auto; width: 120px; height: 120px; }
.jj-giftcard__qr img, .jj-giftcard__qr canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.jj-giftcard__expiry { font-size: 11px; opacity: 0.7; margin-top: 8px; }
.jj-giftcard__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.jj-giftcard__notice { color: var(--jj-primary, #e8313a); margin-top: 12px; }
.jj-giftcard--inactive .jj-giftcard__balance,
.jj-giftcard--inactive .jj-giftcard__code { opacity: 0.45; }

/* --- Print: clean gift card only --- */
@media print {
  body { background: #fff !important; color: #000 !important; }
  .jj-crt-overlay, .jj-giftcard__actions, .jj-gate__prompt { display: none !important; }
  .jj-gate__panel { border-color: #000; background: #fff; color: #000; }
  .jj-gate__title, .jj-giftcard__balance, .jj-giftcard__label { color: #000 !important; }
}
```

- [ ] **Step 2: Verify the file is present and non-trivial**

Run: `grep -c "jj-gate\|jj-password\|jj-giftcard" assets/japanjunky-gate.css`
Expected: a count well above 1.

- [ ] **Step 3: Commit**

```bash
git add assets/japanjunky-gate.css
git commit -m "feat(gate): shared CRT stylesheet for password + gift card pages"
```

---

## Task 2: Password page

**Files:**
- Create: `layout/password.liquid`
- Create: `templates/password.liquid`

- [ ] **Step 1: Create `layout/password.liquid`**

```liquid
<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ shop.name }}</title>
  {{ content_for_header }}
  <style>
    :root {
      --jj-bg: {{ settings.color_background }};
      --jj-primary: {{ settings.color_primary }};
      --jj-secondary: {{ settings.color_secondary }};
      --jj-accent: {{ settings.color_accent }};
      --jj-text: {{ settings.color_text }};
    }
  </style>
  {{ 'japanjunky-base.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-crt.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-gate.css' | asset_url | stylesheet_tag }}
</head>
<body class="jj-gate-body">
  <div class="jj-crt-overlay" aria-hidden="true"></div>
  {{ content_for_layout }}
</body>
</html>
```

- [ ] **Step 2: Create `templates/password.liquid`**

```liquid
{%- comment -%}
  Pre-launch lock screen. Shopify renders this inside layout/password.liquid
  automatically while store password protection is enabled.
{%- endcomment -%}
<div class="jj-gate">
  <div class="jj-gate__panel jj-password">
    <div class="jj-gate__prompt">C:\&gt; access /store</div>
    <h1 class="jj-gate__title">ACCESS RESTRICTED</h1>
    <p class="jj-password__msg">enter passkey to continue:</p>
    {%- form 'storefront_password' -%}
      <div class="jj-password__form">
        <input type="password" name="password" class="jj-password__input"
               autocomplete="current-password" aria-label="Store passkey" autofocus>
        <button type="submit" class="jj-gate-btn">[ENTER]</button>
      </div>
      {%- if form.errors -%}
        <p class="jj-password__error">&gt; wrong passkey. access denied.</p>
      {%- endif -%}
    {%- endform -%}
    <a href="/admin" class="jj-password__owner">store owner? log in &rarr;</a>
  </div>
  <p class="jj-password__shop">{{ shop.name }}</p>
</div>
```

- [ ] **Step 3: Verify the files exist and reference the right form/classes**

Run: `grep -n "storefront_password\|jj-gate-body\|japanjunky-gate.css" layout/password.liquid templates/password.liquid`
Expected: the `storefront_password` form + `jj-password` markup in the template, and `jj-gate-body` + the three stylesheets in the layout.

- [ ] **Step 4: Commit**

```bash
git add layout/password.liquid templates/password.liquid
git commit -m "feat(gate): CRT pre-launch password lock screen"
```

- [ ] **Step 5: Manual verification (after deploy + enable password protection in admin)**

With store password protection ON (Online Store → Preferences): visiting the store shows the CRT ACCESS RESTRICTED screen (no taskbar/scene). A wrong passkey shows `> wrong passkey. access denied.` and keeps the field; the correct passkey enters the store. The "store owner? log in →" link is present. Works with JS disabled.

---

## Task 3: Gift card page

**Files:**
- Create: `layout/gift_card.liquid`
- Create: `templates/gift_card.liquid`
- Create: `assets/japanjunky-giftcard.js`

- [ ] **Step 1: Create `assets/japanjunky-giftcard.js`**

```javascript
/**
 * japanjunky-giftcard.js
 * Gift card page: copy-to-clipboard + print binding. The QR is rendered by
 * Shopify's shopify_gift_card.js (into #QrCode); the visible code is the
 * fallback if that script is unavailable.
 */
(function () {
  'use strict';

  var copyBtn = document.getElementById('jj-giftcard-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var code = copyBtn.getAttribute('data-code') || '';

      function flash() {
        copyBtn.textContent = '[COPIED]';
        setTimeout(function () { copyBtn.textContent = '[COPY]'; }, 1200);
      }

      function legacyCopy() {
        try {
          var ta = document.createElement('textarea');
          ta.value = code;
          ta.setAttribute('readonly', '');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          flash();
        } catch (e) { /* code stays selectable on screen */ }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(flash, legacyCopy);
      } else {
        legacyCopy();
      }
    });
  }

  var printBtn = document.getElementById('jj-giftcard-print');
  if (printBtn) {
    printBtn.addEventListener('click', function () { window.print(); });
  }
})();
```

- [ ] **Step 2: Verify the JS syntax**

Run: `node --check assets/japanjunky-giftcard.js`
Expected: no output (exit 0).

- [ ] **Step 3: Create `layout/gift_card.liquid`**

```liquid
<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ shop.name }} Gift Card</title>
  {{ content_for_header }}
  <style>
    :root {
      --jj-bg: {{ settings.color_background }};
      --jj-primary: {{ settings.color_primary }};
      --jj-secondary: {{ settings.color_secondary }};
      --jj-accent: {{ settings.color_accent }};
      --jj-text: {{ settings.color_text }};
    }
  </style>
  {{ 'japanjunky-base.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-crt.css' | asset_url | stylesheet_tag }}
  {{ 'japanjunky-gate.css' | asset_url | stylesheet_tag }}
</head>
<body class="jj-gate-body">
  <div class="jj-crt-overlay" aria-hidden="true"></div>
  {{ content_for_layout }}
  {{ 'shopify_common.js' | shopify_asset_url | script_tag }}
  {{ 'shopify_gift_card.js' | shopify_asset_url | script_tag }}
  <script src="{{ 'japanjunky-giftcard.js' | asset_url }}" defer></script>
</body>
</html>
```

- [ ] **Step 4: Create `templates/gift_card.liquid`**

```liquid
{% layout 'gift_card' %}
{%- comment -%} Gift card display: balance, code, Shopify QR (#QrCode), actions. {%- endcomment -%}
<div class="jj-gate">
  <div class="jj-gate__panel jj-giftcard{% if gift_card.expired or gift_card.enabled == false %} jj-giftcard--inactive{% endif %}">
    <div class="jj-gate__prompt">C:\&gt; gift_card</div>
    <h1 class="jj-gate__title">{{ shop.name }} GIFT CARD</h1>

    <div class="jj-giftcard__balance">{{ gift_card.balance | money }}</div>
    {%- if gift_card.balance != gift_card.initial_value -%}
      <div class="jj-giftcard__initial">initial value: {{ gift_card.initial_value | money }}</div>
    {%- endif -%}

    <div class="jj-giftcard__label">code</div>
    <div class="jj-giftcard__code-row">
      <span class="jj-giftcard__code">{{ gift_card.code | format_code }}</span>
      <button type="button" class="jj-gate-btn" id="jj-giftcard-copy" data-code="{{ gift_card.code }}">[COPY]</button>
    </div>

    <div id="QrCode" class="jj-giftcard__qr" data-identifier="{{ gift_card.qr_identifier }}"></div>

    {%- if gift_card.expires_on -%}
      <div class="jj-giftcard__expiry">expires: {{ gift_card.expires_on | date: '%Y-%m-%d' }}</div>
    {%- endif -%}

    {%- if gift_card.expired -%}
      <div class="jj-giftcard__notice">&gt; expired</div>
    {%- elsif gift_card.enabled == false -%}
      <div class="jj-giftcard__notice">&gt; inactive</div>
    {%- else -%}
      <div class="jj-giftcard__actions">
        <button type="button" class="jj-gate-btn" id="jj-giftcard-print">[PRINT]</button>
        {%- if gift_card.pass_url -%}
          <a href="{{ gift_card.pass_url }}" class="jj-gate-btn">Add to Apple Wallet</a>
        {%- endif -%}
      </div>
    {%- endif -%}
  </div>
</div>
```

- [ ] **Step 5: Verify the files reference the right objects/ids**

Run: `grep -n "layout 'gift_card'\|gift_card.balance\|gift_card.code\|QrCode\|qr_identifier\|pass_url" templates/gift_card.liquid && grep -n "shopify_gift_card.js\|japanjunky-giftcard.js\|jj-gate-body" layout/gift_card.liquid`
Expected: the template shows the layout tag, balance/code, the `#QrCode` div with `qr_identifier`, and `pass_url`; the layout shows the Shopify QR script, the giftcard JS, and `jj-gate-body`.

- [ ] **Step 6: Commit**

```bash
git add layout/gift_card.liquid templates/gift_card.liquid assets/japanjunky-giftcard.js
git commit -m "feat(gate): CRT gift card page (balance/code/QR/copy/print/wallet)"
```

- [ ] **Step 7: Manual verification (after deploy, open a real gift-card URL)**

The CRT gift card shows balance, code, and a scannable QR; `[COPY]` copies the raw code and flashes `[COPIED]` (and the code stays selectable if JS/clipboard is unavailable); `[PRINT]` prints a clean card-only page; "Add to Apple Wallet" appears only when the card has a `pass_url`; an expired or disabled card shows `> expired` / `> inactive` and hides the action buttons. No taskbar/scene.

---

## Final verification (whole change, after deploy to main)

- [ ] `node --check assets/japanjunky-giftcard.js` passes.
- [ ] Password page gates correctly (wrong/right passkey), no-JS works, no storefront chrome.
- [ ] Gift card page renders balance/code/QR + copy/print/wallet + expired/disabled states.
- [ ] Both pages are CRT-styled, scroll/print correctly, and don't pull in the taskbar/scene.

## Notes for the implementer

- No theme-check/linter assumed; `node --check` + grep + the manual browser checklist are the verification. Do NOT add unit tests.
- ES5-style vanilla JS (var, no arrow functions) to match existing assets.
- The QR is Shopify's responsibility (`shopify_gift_card.js` renders into `#QrCode` via `data-identifier`). Do not hand-write a QR generator; the visible code is the intended fallback.
- Admin (not code): the password page only appears while password protection is enabled (Online Store → Preferences); preview the gift card via a real gift-card URL.
