# Gift Card + Password Pages — Design

**Date:** 2026-06-17
**Status:** Approved (design), pending implementation plan
**Context:** Tranche D of the storefront build-out, trimmed. Blog/article are out of scope (the user has a separate blog that connects later). This delivers the two remaining themeable standalone pages: the gift-card page and the pre-launch password page.

## Purpose

Give the store two on-brand CRT "gate" pages that Shopify renders outside the normal storefront flow:
1. **Gift card** — what a recipient sees at their gift-card URL: balance, code, scannable QR, and actions (copy / print / Apple Wallet).
2. **Password page** — the pre-launch lock screen shown to everyone while store password protection is on.

Both are standalone pages with their own minimal layout (no taskbar, no 3D scene) so they load fast and print cleanly, while keeping the CRT/terminal aesthetic.

## Approach

Both pages use a dedicated lean layout, a plain Liquid template (no theme-customizer editing needed, so no JSON/section), and a shared CRT "gate" stylesheet. Each lean layout has its own `<!doctype>` and loads only `japanjunky-base.css` (fonts/vars/reset), `japanjunky-crt.css` (scanline overlay), and the new `japanjunky-gate.css` — none of the storefront chrome or scripts.

## Components

### Shared

- `assets/japanjunky-gate.css` (new) — CRT gate styling: a centered terminal panel (`.jj-gate`), monospace, blinking-cursor prompt, no rounded corners, CRT palette via the existing `--jj-*` vars. Contains a `.jj-password*` block and a `.jj-giftcard*` block plus `@media print` rules for the card.

### Password page

- `layout/password.liquid` (new) — lean layout. `<!doctype html>`, `<head>` with `{{ content_for_header }}` + the three stylesheets, `<body>` with a CRT background + `.jj-crt-overlay` + `{{ content_for_layout }}`. No taskbar/scene/scripts.
- `templates/password.liquid` (new) — Shopify automatically renders this within `layout/password.liquid` when store password protection is enabled. Content:
  - Terminal header line `C:\> access /store` and the shop name (`{{ shop.name }}`).
  - **ACCESS RESTRICTED** panel with `{% form 'storefront_password' %}`: an `<input type="password" name="password">` + an `[ENTER]` submit. On failure, `form.errors` renders a CRT error line (`> wrong passkey`).
  - A subtle "store owner? log in →" link to the owner login (`/admin`).
  - No newsletter/email capture (intentionally minimal). No JS — native form POST.

### Gift card page

- `layout/gift_card.liquid` (new) — lean layout, same three stylesheets, plus it loads `assets/japanjunky-giftcard.js` (defer) and Shopify's `shopify_common.js` (for the QR). Own `<!doctype>`, CRT background, `{{ content_for_layout }}`.
- `templates/gift_card.liquid` (new) — begins with `{% layout 'gift_card' %}` to bind the lean layout explicitly. Renders the CRT gift-card panel:
  - **Balance:** `{{ gift_card.balance | money }}` (and the initial value `{{ gift_card.initial_value | money }}` when it differs, e.g. partially spent).
  - **Code:** `{{ gift_card.code | format_code }}` as selectable CRT text + a `[COPY]` button.
  - **QR:** a `#jj-giftcard-qr` element populated from `gift_card.qr_identifier` via Shopify's standard gift-card QR (`shopify_common.js`), wrapped so that if the QR can't render the code text still shows (graceful fallback).
  - **Expiry:** `{{ gift_card.expires_on | date: '%Y-%m-%d' }}` shown only when `gift_card.expires_on` is set.
  - **Actions:** `[COPY]`, `[PRINT]` (`window.print()`), and **Add to Apple Wallet** (`{{ gift_card.pass_url }}`) shown only when `pass_url` is present.
  - **States:** when `gift_card.expired` or `gift_card.enabled == false`, render a greyed card with a `> expired` / `> inactive` notice and suppress the actions.
- `assets/japanjunky-giftcard.js` (new) — small vanilla ES5:
  - Copy: `[COPY]` writes `gift_card.code` to the clipboard (via `navigator.clipboard` with an `execCommand('copy')` fallback), flashing `[COPIED]`.
  - QR: initialize the QR from the `data-identifier` on `#jj-giftcard-qr` using the Shopify QR global; on any error, leave the visible code as the fallback.

## Data flow

- Both pages are server-rendered by Shopify from the `gift_card` / `shop` / `storefront_password` form objects. No `JJ_*` globals, no storefront scripts involved.
- Password submission POSTs natively to Shopify's storefront-password handler; wrong passkey re-renders with `form.errors`.
- Gift-card copy/QR are client-side enhancements over already-rendered Liquid values.

## Error handling / edge cases

- Password: empty/wrong passkey → `form.errors` CRT line; the field stays usable. No-JS users still submit.
- Gift card: missing `expires_on` → no expiry line; missing `pass_url` → no Wallet button; `expired`/disabled → notice + no actions; clipboard API unavailable → `execCommand` fallback, and if that fails the code remains selectable; QR script unavailable → code text is the fallback.
- Print: `@media print` shows only the card panel (hides prompts/links/buttons).

## Files

New:
- `layout/password.liquid`, `templates/password.liquid`
- `layout/gift_card.liquid`, `templates/gift_card.liquid`
- `assets/japanjunky-gate.css`
- `assets/japanjunky-giftcard.js`

Modified: none (these pages use their own layouts; `theme.liquid` is untouched).

## Testing / acceptance

- Password page (with store password protection ON in admin): wrong passkey shows the CRT error and stays; correct passkey enters the store; owner link present; renders with no taskbar/scene; works with JS disabled.
- Gift card page (open a real gift-card URL): balance + code + QR render; `[COPY]` copies the code and flashes `[COPIED]` (and degrades without JS — code selectable); `[PRINT]` prints a clean card only; Apple Wallet button appears only when `pass_url` exists; an expired/disabled card shows the notice and hides actions.
- Both pages are CRT-styled and load without storefront chrome.
- In-browser regression by the user after deploy to `main`.

## Admin / deploy notes

- The password page only appears while **password protection is enabled** in Shopify admin (Online Store → Preferences). That's the user's admin toggle, not theme code.
- The gift-card page appears at the recipient's gift-card link; to preview, the user can open a test gift card's URL.
- Deploy: Shopify GitHub integration syncs `main`. Build on a feature branch, merge to `main`.
