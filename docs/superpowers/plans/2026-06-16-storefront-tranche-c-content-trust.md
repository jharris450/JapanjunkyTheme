# Tranche C — Content & Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the JapanJunky content & trust layer — a generic page template, a working contact form, a structured FAQ accordion, and CRT-styled policy pages — all on-brand and reusing the existing `.jj-page` scroll-layer.

**Architecture:** Approach A from the spec — separate single-purpose sections (`jj-page`, `jj-contact`, `jj-faq`), each wrapped in the `.jj-page` fixed scroll-layer, all drawing from one shared CRT prose stylesheet (`japanjunky-content.css`). Policies can't take sections (Shopify limitation), so they get a `template == 'policy'` scroll-layer wrap in `theme.liquid` plus prose CSS.

**Tech Stack:** Shopify Online Store 2.0 (Liquid JSON templates + sections + section blocks), CSS. No JS required (native `<form>` + `<details>`). No automated test runner — verification is JSON validity, Liquid sanity, and the spec's no-JS/in-browser acceptance checks. Deploy = push to `main` (Shopify GitHub sync).

**Spec:** `docs/superpowers/specs/2026-06-16-storefront-tranche-c-content-trust-design.md`

---

## File Structure

New:
- `assets/japanjunky-content.css` — CRT prose (`.jj-prose`), content-page chrome (`.jj-content*`), form fields (`.jj-field*`), FAQ accordion (`.jj-faq*`).
- `sections/jj-page.liquid` — generic content page (title + `page.content`).
- `sections/jj-contact.liquid` — contact form (`{% form 'contact' %}`).
- `sections/jj-faq.liquid` — FAQ accordion from customizer blocks.
- `templates/page.json` — assigns `jj-page` (default page template).
- `templates/page.contact.json` — assigns `jj-contact`.
- `templates/page.faq.json` — assigns `jj-faq`.

Modified:
- `layout/theme.liquid` — load `japanjunky-content.css`; wrap `content_for_layout` in the scroll-layer for `template == 'policy'`.

Reused (no change): `.jj-page` scroll-layer + `.jj-action-btn` from `assets/japanjunky-product-grid.css`; active-Tsuno config already covers these templates.

---

## Task 1: Shared content stylesheet

**Files:**
- Create: `assets/japanjunky-content.css`
- Modify: `layout/theme.liquid` (add stylesheet tag in the head load block, after line 40 `japanjunky-product-page.css`)

- [ ] **Step 1: Create `assets/japanjunky-content.css` with the full stylesheet**

```css
/* ============================================
   JAPANJUNKY CONTENT & TRUST
   Shared CRT prose + content-page chrome, used by
   the generic page, contact, FAQ, and policy pages.
   ============================================ */

/* --- Content column (rides the .jj-page scroll-layer) --- */
.jj-content {
  max-width: 760px;
  margin: 0 auto;
}

.jj-content__header {
  padding-top: 16px; /* .jj-page padding-top is 0 (for sticky grid bars) */
  margin-bottom: 16px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px solid #222;
  padding-bottom: 8px;
}

.jj-content__prompt {
  color: var(--jj-accent, #33ff33);
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 13px;
}

.jj-content__title {
  margin: 0;
  font-size: 18px;
}

/* --- Prose: rich text from page.content + policy .rte --- */
.jj-prose {
  color: var(--jj-text, #e0d5c0);
  font-size: 13px;
  line-height: 1.7;
}

.jj-prose h1, .jj-prose h2, .jj-prose h3,
.jj-prose h4, .jj-prose h5, .jj-prose h6 {
  color: var(--jj-secondary, #f5d742);
  margin: 1.4em 0 0.5em;
  line-height: 1.3;
}

.jj-prose p { margin: 0 0 1em; }

.jj-prose a {
  color: var(--jj-primary, #e8313a);
  text-decoration: underline;
}

.jj-prose a:hover {
  color: var(--jj-secondary, #f5d742);
  text-shadow: 0 0 4px rgba(245, 215, 66, 0.3);
}

/* Lists: re-enable markers (global reset removes them) as CRT glyphs */
.jj-prose ul, .jj-prose ol {
  margin: 0 0 1em;
  padding-left: 1.4em;
}
.jj-prose ul { list-style: none; }
.jj-prose ul > li::before {
  content: '> ';
  color: var(--jj-primary, #e8313a);
}
.jj-prose ol { list-style: decimal; }
.jj-prose li { margin: 0.2em 0; }

.jj-prose hr {
  border: none;
  border-top: 1px solid var(--jj-primary, #e8313a);
  margin: 1.5em 0;
  opacity: 0.5;
}

.jj-prose blockquote {
  border-left: 2px solid var(--jj-secondary, #f5d742);
  margin: 1em 0;
  padding-left: 12px;
  opacity: 0.85;
}

.jj-prose code, .jj-prose pre {
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 4px;
}
.jj-prose pre { padding: 8px; overflow-x: auto; }

.jj-prose img { max-width: 100%; height: auto; }

.jj-prose table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
.jj-prose th, .jj-prose td {
  border: 1px solid #222;
  padding: 4px 8px;
  text-align: left;
}

/* --- Form fields (contact page) --- */
.jj-field {
  display: block;
  margin: 0 0 12px;
}
.jj-field__label {
  display: block;
  margin-bottom: 4px;
  color: var(--jj-secondary, #f5d742);
  font-size: 12px;
}
.jj-field__opt { opacity: 0.6; }
.jj-field__input {
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  color: var(--jj-text, #e0d5c0);
  border: 1px solid var(--jj-primary, #e8313a);
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
  font-size: 13px;
}
.jj-field__input:focus {
  outline: none;
  border-color: var(--jj-secondary, #f5d742);
}
.jj-field__textarea { resize: vertical; }

.jj-contact__send { margin-top: 4px; }

.jj-contact__success {
  color: var(--jj-accent, #33ff33);
  border: 1px solid var(--jj-accent, #33ff33);
  padding: 12px;
}
.jj-contact__errors { margin-bottom: 12px; }
.jj-contact__error { color: var(--jj-primary, #e8313a); margin: 0 0 4px; }

/* --- FAQ accordion --- */
.jj-faq__intro { margin-bottom: 16px; }
.jj-faq__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.jj-faq__item {
  border: 1px solid #222;
  background: #050505;
}
.jj-faq__q {
  cursor: pointer;
  padding: 10px 12px;
  color: var(--jj-secondary, #f5d742);
  font-size: 13px;
  list-style: none; /* hide default disclosure triangle */
  display: flex;
  gap: 8px;
}
.jj-faq__q::-webkit-details-marker { display: none; }
.jj-faq__q::before {
  content: '[+]';
  color: var(--jj-primary, #e8313a);
}
.jj-faq__item[open] .jj-faq__q::before { content: '[-]'; }
.jj-faq__item[open] .jj-faq__q { border-bottom: 1px solid #222; }
.jj-faq__a { padding: 12px; }
.jj-faq__empty { color: var(--jj-text, #e0d5c0); opacity: 0.7; }
```

- [ ] **Step 2: Load the stylesheet in `layout/theme.liquid`**

Find (around line 40):

```liquid
  {{ 'japanjunky-product-page.css' | asset_url | stylesheet_tag }}
```

Add immediately after it:

```liquid
  {{ 'japanjunky-content.css' | asset_url | stylesheet_tag }}
```

- [ ] **Step 3: Verify the CSS file is non-empty and the tag was added**

Run: `grep -c "jj-prose" assets/japanjunky-content.css && grep -n "japanjunky-content.css" layout/theme.liquid`
Expected: a count ≥ 1, and one matching line in `theme.liquid`.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-content.css layout/theme.liquid
git commit -m "feat(content): shared CRT prose + form + FAQ stylesheet"
```

---

## Task 2: Generic page template

**Files:**
- Create: `sections/jj-page.liquid`
- Create: `templates/page.json`

- [ ] **Step 1: Create `sections/jj-page.liquid`**

```liquid
{%- comment -%}
  Generic content page: terminal header + rich-text body.
  Assigned by templates/page.json — the default for /pages/* (about,
  shipping info, etc.). Rides the .jj-page scroll-layer; prose via
  japanjunky-content.css.
{%- endcomment -%}
<div class="jj-page jj-content">
  <header class="jj-content__header">
    <span class="jj-content__prompt">C:\&gt;</span>
    <h1 class="jj-content__title">{{ page.title }}</h1>
  </header>
  {%- if page.content != blank -%}
    <div class="jj-prose">{{ page.content }}</div>
  {%- endif -%}
</div>

{% schema %}
{ "name": "Page", "tag": "section", "settings": [] }
{% endschema %}
```

- [ ] **Step 2: Create `templates/page.json`**

```json
{
  "sections": {
    "main": { "type": "jj-page" }
  },
  "order": ["main"]
}
```

- [ ] **Step 3: Validate the JSON template parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('templates/page.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add sections/jj-page.liquid templates/page.json
git commit -m "feat(content): generic CRT page template"
```

- [ ] **Step 5: Manual verification (after deploy to main)**

In a page with the default `page` template (e.g. `/pages/about`): the title shows with a `C:\>` prompt, body renders as CRT prose, content sits above the scene, scrolls independently, and clears the taskbar. No-JS: page is fully readable.

---

## Task 3: Contact page + form

**Files:**
- Create: `sections/jj-contact.liquid`
- Create: `templates/page.contact.json`

- [ ] **Step 1: Create `sections/jj-contact.liquid`**

```liquid
{%- comment -%}
  Contact page: optional intro prose + Shopify contact form.
  Fields: name, email, subject, order # (optional), message.
  Native POST (works without JS); emails the store. Assigned by
  templates/page.contact.json.
{%- endcomment -%}
<div class="jj-page jj-content jj-contact">
  <header class="jj-content__header">
    <span class="jj-content__prompt">C:\&gt;</span>
    <h1 class="jj-content__title">{{ page.title | default: 'Contact' }}</h1>
  </header>

  {%- if page.content != blank -%}
    <div class="jj-prose jj-contact__intro">{{ page.content }}</div>
  {%- endif -%}

  {%- form 'contact', class: 'jj-contact__form' -%}
    {%- if form.posted_successfully? -%}
      <p class="jj-contact__success">&gt; message transmitted. we'll be in touch.</p>
    {%- else -%}
      {%- if form.errors -%}
        <div class="jj-contact__errors">
          {%- for field in form.errors -%}
            <p class="jj-contact__error">! {{ field }}: {{ form.errors.messages[field] }}</p>
          {%- endfor -%}
        </div>
      {%- endif -%}

      <label class="jj-field">
        <span class="jj-field__label">name</span>
        <input class="jj-field__input" type="text" name="contact[name]"
               value="{% if form.name %}{{ form.name }}{% elsif customer %}{{ customer.name }}{% endif %}" required>
      </label>

      <label class="jj-field">
        <span class="jj-field__label">email</span>
        <input class="jj-field__input" type="email" name="contact[email]"
               value="{% if form.email %}{{ form.email }}{% elsif customer %}{{ customer.email }}{% endif %}" required>
      </label>

      <label class="jj-field">
        <span class="jj-field__label">subject</span>
        <input class="jj-field__input" type="text" name="contact[Subject]" value="{{ form.Subject }}">
      </label>

      <label class="jj-field">
        <span class="jj-field__label">order # <span class="jj-field__opt">(optional)</span></span>
        <input class="jj-field__input" type="text" name="contact[Order number]" value="{{ form['Order number'] }}">
      </label>

      <label class="jj-field">
        <span class="jj-field__label">message</span>
        <textarea class="jj-field__input jj-field__textarea" name="contact[body]" rows="6" required>{% if form.body %}{{ form.body }}{% endif %}</textarea>
      </label>

      <button class="jj-action-btn jj-contact__send" type="submit">[ SEND ]</button>
    {%- endif -%}
  {%- endform -%}
</div>

{% schema %}
{ "name": "Contact", "tag": "section", "settings": [] }
{% endschema %}
```

- [ ] **Step 2: Create `templates/page.contact.json`**

```json
{
  "sections": {
    "main": { "type": "jj-contact" }
  },
  "order": ["main"]
}
```

- [ ] **Step 3: Validate the JSON template parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('templates/page.contact.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add sections/jj-contact.liquid templates/page.contact.json
git commit -m "feat(content): CRT contact page with Shopify contact form"
```

- [ ] **Step 5: Manual verification (after deploy to main + assign template to /pages/contact)**

With JS disabled: form renders all five fields; submitting a valid message reloads to the `> message transmitted.` success state and the store receives an email containing Subject + Order number; submitting an invalid email shows a terminal-style error. Form sits above the scene and scrolls.

---

## Task 4: FAQ accordion

**Files:**
- Create: `sections/jj-faq.liquid`
- Create: `templates/page.faq.json`

- [ ] **Step 1: Create `sections/jj-faq.liquid`**

```liquid
{%- comment -%}
  FAQ page: optional intro prose + a CRT accordion built from
  customizer "Q&A" blocks (question + richtext answer). Native
  <details>/<summary> — works without JS. Assigned by
  templates/page.faq.json.
{%- endcomment -%}
<div class="jj-page jj-content jj-faq">
  <header class="jj-content__header">
    <span class="jj-content__prompt">C:\&gt;</span>
    <h1 class="jj-content__title">{{ page.title | default: 'FAQ' }}</h1>
  </header>

  {%- if page.content != blank -%}
    <div class="jj-prose jj-faq__intro">{{ page.content }}</div>
  {%- endif -%}

  {%- if section.blocks.size > 0 -%}
    <div class="jj-faq__list">
      {%- for block in section.blocks -%}
        <details class="jj-faq__item" {{ block.shopify_attributes }}>
          <summary class="jj-faq__q">{{ block.settings.question }}</summary>
          <div class="jj-prose jj-faq__a">{{ block.settings.answer }}</div>
        </details>
      {%- endfor -%}
    </div>
  {%- else -%}
    <p class="jj-faq__empty">&gt; no entries.</p>
  {%- endif -%}
</div>

{% schema %}
{
  "name": "FAQ",
  "tag": "section",
  "settings": [],
  "blocks": [
    {
      "type": "faq_item",
      "name": "Q&A",
      "settings": [
        { "type": "text", "id": "question", "label": "Question" },
        { "type": "richtext", "id": "answer", "label": "Answer" }
      ]
    }
  ],
  "presets": [
    { "name": "FAQ", "blocks": [ { "type": "faq_item" }, { "type": "faq_item" } ] }
  ]
}
{% endschema %}
```

- [ ] **Step 2: Create `templates/page.faq.json`**

```json
{
  "sections": {
    "main": { "type": "jj-faq" }
  },
  "order": ["main"]
}
```

- [ ] **Step 3: Validate the JSON template parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('templates/page.faq.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add sections/jj-faq.liquid templates/page.faq.json
git commit -m "feat(content): structured FAQ accordion from customizer blocks"
```

- [ ] **Step 5: Manual verification (after deploy + assign faq template + add Q&A blocks in customizer)**

In the theme customizer, the FAQ page shows add/reorder "Q&A" blocks. On the storefront with JS disabled: each question is a clickable `<summary>` showing `[+]`, expands to the answer prose and flips to `[-]`. Zero blocks shows `> no entries.`. Sits above the scene and scrolls.

---

## Task 5: Policy page styling

**Files:**
- Modify: `layout/theme.liquid` (the `#MainContent` block, around lines 193-196)

- [ ] **Step 1: Wrap policy content in the scroll-layer**

Find:

```liquid
  <main id="MainContent" role="main"{% if template == 'index' %} style="display:none;"{% endif %}>
    {{ content_for_layout }}
  </main>
```

Replace with:

```liquid
  <main id="MainContent" role="main"{% if template == 'index' %} style="display:none;"{% endif %}>
    {%- comment -%} Shop policies (/policies/*) can't take a section/template — wrap
        their render in the .jj-page scroll-layer + prose so they sit above the
        scene and read as CRT, like the other content pages. {%- endcomment -%}
    {%- if template == 'policy' -%}
      <div class="jj-page jj-content jj-prose">
        <header class="jj-content__header">
          <span class="jj-content__prompt">C:\&gt;</span>
          <h1 class="jj-content__title">{{ page_title }}</h1>
        </header>
        {{ content_for_layout }}
      </div>
    {%- else -%}
      {{ content_for_layout }}
    {%- endif -%}
  </main>
```

- [ ] **Step 2: Verify the conditional is balanced and present**

Run: `grep -n "template == 'policy'" layout/theme.liquid`
Expected: one matching line inside the `MainContent` block.

- [ ] **Step 3: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat(content): CRT-style hosted policy pages via scroll-layer wrap"
```

- [ ] **Step 4: Manual verification (after deploy + ensure policies filled in admin)**

Visit a policy URL (e.g. `/policies/refund-policy`): the policy title shows with a `C:\>` prompt, the policy body reads as CRT prose (gold headings, cream body, red links), sits above the scene, scrolls independently, and clears the taskbar. The duplicate Shopify policy `<h1>` (`.shopify-policy__title`), if present, still reads acceptably; if it visibly duplicates the header title, hide it with `.jj-content .shopify-policy__title { display: none; }` in `japanjunky-content.css` and re-commit.

---

## Final verification (whole tranche, after deploy to main)

- [ ] No Liquid render errors on `/pages/about` (page), `/pages/contact` (contact), `/pages/faq` (faq), and a `/policies/*` page.
- [ ] All four content surfaces: content above the scene, independent scroll, taskbar clearance, Tsuno in the active state.
- [ ] Contact form posts with JS disabled and reaches the store email with all custom fields.
- [ ] FAQ accordion works with JS disabled.
- [ ] Start-menu links `/pages/about`, `/pages/faq`, `/pages/contact` resolve to the styled pages (after the merchant creates the pages and assigns `faq`/`contact` templates in admin).

## Notes for the implementer

- **No theme-check/linter is assumed installed.** If `shopify theme check` is available, run it; otherwise JSON validity + the manual browser checklist are the verification.
- **Merchant admin steps (not code):** create the about/FAQ/contact pages, assign the `faq` and `contact` templates, fill policies in Settings → Policies. The user has said they will assign templates later.
- Do **not** add AJAX to the contact form or JS to the FAQ — native `<form>`/`<details>` are the MVP and meet the no-JS acceptance criteria.
