# Storefront Tranche C — Content & Trust — Design

**Date:** 2026-06-16
**Status:** Approved (design), pending implementation plan
**Part of:** Storefront build-out — Tranche C of A→D (see `2026-06-15-storefront-tranche-a-transactional-core-design.md`). Tranche A (transactional core) built + merged; Tranche B (customer accounts) collapsed under Shopify new customer accounts (account UI is Shopify-hosted, not themeable — only a nav-link fix shipped, commit `6fbc490`).

## Purpose

Build the content & trust layer of the JapanJunky storefront: the informational pages a shopper expects (about, FAQ, contact, store policies). These fill the start-menu links that currently dead-end (`/pages/about`, `/pages/faq`, `/pages/contact`) and give the store credible, on-brand trust pages. Checkout and the `/account` area remain Shopify-hosted and out of scope.

## Scope

In scope (all four confirmed with user):

1. **Generic page template** — one flexible CRT-styled template rendering any page's title + rich-text content.
2. **Contact page + working form** — fields name, email, subject, order # (optional), message; emails the store; CRT success/error states.
3. **FAQ as structured accordion** — authored as theme-customizer section blocks (question + answer), rendered as a CRT accordion.
4. **Policy page styling** — CRT-style the Shopify-hosted `/policies/*` render (content stays admin-managed).

Out of scope: blog/article, gift card, password page (Tranche D); checkout; `/account` (hosted).

## Key constraint: Shopify policies are not section-able

Shop policies (`/policies/<handle>`) do **not** support JSON templates or sections in Online Store 2.0 — Shopify renders the policy body straight into the layout's `content_for_layout`. Therefore policies cannot get a bespoke section; they are handled by:
- CSS in the shared content stylesheet targeting the policy render markup (`.shopify-policy__container`, `.shopify-policy__title`, `.rte`), and
- a `template == 'policy'` branch in `layout/theme.liquid` that wraps `#MainContent` in the `.jj-page` scroll-layer.

Without the scroll-layer wrap, policy content (plain static flow inside the `overflow:hidden` body) would be overpainted by the fixed scene canvas and clipped below the fold — the same failure mode fixed for the storefront pages in Tranche A.

## Architecture (Approach A — separate focused sections + shared prose CSS)

Each content surface is a small single-purpose unit; all share one prose stylesheet and the existing `.jj-page` scroll-layer.

### Shared foundation

**`assets/japanjunky-content.css`** (new) — CRT prose styles for rich text and the content sections:
- Rich-text container (`.jj-prose`, plus Shopify's `.rte` for policies): headings gold (`--jj-secondary`), body cream (`--jj-text`), links red (`--jj-primary`) with the established hover glow.
- Lists rendered monospace with `>`/`-` glyph markers (override the global `list-style:none` reset locally).
- `<hr>` → CRT divider; blockquotes, tables, `<code>` styled terminal-flat (no rounded corners).
- Form controls for the contact page (inputs/textarea: transparent bg, red border, monospace, cream text) — or reuse `.jj-action-btn` and search-input patterns from `japanjunky-product-grid.css` where they fit.

**Load** `japanjunky-content.css` in `layout/theme.liquid` alongside the other stylesheets (unconditional load is fine; it is small and scoped by class).

**Scroll-layer reuse:** every content section's root carries the `jj-page` class so it inherits the fixed `inset:0; overflow-y:auto; z-index:100` scroll-layer (already defined in `japanjunky-product-grid.css`). This gives correct stacking above the scene, independent scroll, and the 40px taskbar clearance. The active-Tsuno behavior already applies because these are non-index/non-product/non-login templates (`config.tsunoActive` is true).

### 1. Generic page — `templates/page.json` → `sections/jj-page.liquid`

- Root `<div class="jj-page jj-content">`.
- Terminal-style header from `page.title` (e.g. a `C:\> ` prompt prefix + the title).
- `<div class="jj-prose">{{ page.content }}</div>`.
- Used by `/pages/about` and any plain content page (shipping info, etc.). The merchant creates the page in admin and leaves its template as the default `page`.

### 2. Contact — `templates/page.contact.json` → `sections/jj-contact.liquid`

- Root `<div class="jj-page jj-content jj-contact">`.
- Optional intro from `{{ page.content }}` (prose) above the form.
- `{% form 'contact' %}` with fields:
  - `contact[name]` — text, required
  - `contact[email]` — email, required (prefill `customer.email` if logged in)
  - `contact[Subject]` — text
  - `contact[Order number]` — text, optional (label notes "optional")
  - `contact[body]` — textarea, required (the message)
- Submit button styled like `.jj-action-btn` (`[ SEND ]`).
- Success: when `form.posted_successfully?`, render a CRT confirmation line (`> message transmitted.`) in place of / above the form.
- Errors: when `form.errors`, render them terminal-style (`! <field>: <message>`), preserving entered values where Liquid exposes them.
- Works with no JS (native form POST); no AJAX required.

### 3. FAQ — `templates/page.faq.json` → `sections/jj-faq.liquid`

- Root `<div class="jj-page jj-content jj-faq">`.
- Optional intro from `{{ page.content }}`.
- Section schema with a `faq_item` block type: `question` (text) + `answer` (richtext). Merchant adds/reorders blocks in the theme customizer.
- Render each block as a native `<details><summary>question</summary><div class="jj-prose">answer</div></details>` — accessible and functional without JS.
- CSS gives CRT expand/collapse affordance (e.g. `[+]`/`[-]` marker via `summary` `::marker`/pseudo, gold question text, indented answer). No JS required; optional progressive enhancement only if needed (not in MVP).
- Merchant creates an admin page titled per the FAQ handle and assigns the `faq` template.

### 4. Policies — `layout/theme.liquid` + `japanjunky-content.css`

- In `theme.liquid`, add `template == 'policy'` to the set of templates whose `#MainContent` is wrapped in the `.jj-page` scroll-layer (or add a `jj-page`-equivalent wrapper class on policy render). Implementation detail: simplest is to wrap `{{ content_for_layout }}` for `template == 'policy'` in a `<div class="jj-page jj-content jj-prose">`. Verify the policy body's own markup nests cleanly inside.
- CSS targets the policy render (`.shopify-policy__container`, `.shopify-policy__title`, `.rte`) so refund/privacy/terms/shipping read as CRT prose.
- Content remains admin-managed (Settings → Policies). No theme content authored.

### 5. Navigation

- Start menu already links `/pages/about`, `/pages/faq`, `/pages/contact`. After the merchant creates those pages and assigns templates (`page` default, `faq`, `contact` respectively), the links resolve to styled pages. No start-menu change required beyond confirming handles match. Policy links (if desired in footer/menu) use Shopify's `{{ shop.policies }}` / `policies` URLs — adding them to nav is optional and can be a follow-up.

## Data flow

- Page/FAQ/Contact content authored in Shopify admin (pages + the FAQ section's customizer blocks); policies in Settings → Policies.
- Contact form POSTs to Shopify's `contact` form handler → emails the store's customer-facing email; redirect back with `?contact_posted=true`.
- No client-side data fetching; no `JJ_*` globals needed. The grid/scene scripts are unaffected.

## Error handling

- Contact form: Shopify-validated; render `form.errors` terminal-style; show success state on `posted_successfully?`.
- Missing/empty content: generic page with no content renders just the header (no crash). FAQ with zero blocks renders the intro + an empty-state line (`> no entries.`).
- Policy template wrap must not break if a policy is empty (Shopify shows its own empty text).

## Testing / acceptance

- All new templates render without Liquid errors.
- Contact form: submitting with JS disabled posts and returns the CRT success state; invalid input shows errors; the four custom fields arrive in the store email.
- FAQ accordion expands/collapses with JS disabled (`<details>`), styled CRT.
- Generic page, contact, FAQ, and a policy page each: content sits above the scene, scrolls independently, clears the taskbar, no overpaint/clip.
- Tsuno is in the active (awake) state on all four (inherited from the storefront-page config).
- Visual regression by the user in-browser after deploy to `main`.

## Files

New:
- `assets/japanjunky-content.css`
- `sections/jj-page.liquid`, `sections/jj-contact.liquid`, `sections/jj-faq.liquid`
- `templates/page.json`, `templates/page.contact.json`, `templates/page.faq.json`

Modified:
- `layout/theme.liquid` (load content CSS; `template == 'policy'` scroll-layer wrap)

## Deploy

Shopify GitHub integration syncs `main`. Code must land on `main` to appear in the previewed/live theme. Merchant must also, in admin: create the about/FAQ/contact pages and assign templates, and ensure policies are filled in Settings → Policies.
