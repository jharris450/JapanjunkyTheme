# Left Sidebar Filtering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the left sidebar's directory listings (Categories, Format, Brand, Condition) function as client-side multi-select filters that show/hide product table rows in real time.

**Architecture:** Pure client-side JS. Product table rows already carry `data-*` attributes for format, vendor, condition. Sidebar `<li>` items get `data-filter-group`/`data-filter-value` attributes. A new `japanjunky-filter.js` reads active selections, applies OR-within-group / AND-across-groups logic, and toggles `jj-row--hidden` on table rows. The existing hidden filter bar shows active filter tags.

**Tech Stack:** Vanilla JS, Shopify Liquid, CSS

**Spec:** `docs/superpowers/specs/2026-03-15-sidebar-filtering-design.md`

---

## Chunk 1: Data Layer & Sidebar Markup

### Task 1: Add `data-product-collections` to product table rows

**Files:**
- Modify: `snippets/product-table-row.liquid:48` (inside the `<tr>` opening tag)

- [ ] **Step 1: Add the collections data attribute**

In `snippets/product-table-row.liquid`, add this attribute to the `<tr>` tag, after line 50 (`data-product-id`):

```liquid
      data-product-collections="{{ product.collections | map: 'handle' | join: ',' }}"
```

- [ ] **Step 2: Commit**

```bash
git add snippets/product-table-row.liquid
git commit -m "feat: add data-product-collections attribute to product table rows"
```

---

### Task 2: Add footer span IDs for JS targeting

**Files:**
- Modify: `sections/jj-homepage-body.liquid:61-65`

- [ ] **Step 1: Add IDs to the footer spans**

In `sections/jj-homepage-body.liquid`, update lines 61-65 from:

```liquid
        <span>{{ featured.products_count | default: 0 }} items</span>
        <span style="color:#444;">|</span>
        <span style="color:#555;">
          showing 1-{{ section.settings.products_to_show }}
        </span>
```

To:

```liquid
        <span id="jj-footer-count">{{ featured.products_count | default: 0 }} items</span>
        <span id="jj-footer-sep" style="color:#444;">|</span>
        <span id="jj-footer-showing" style="color:#555;">
          showing 1-{{ section.settings.products_to_show }}
        </span>
```

- [ ] **Step 2: Commit**

```bash
git add sections/jj-homepage-body.liquid
git commit -m "feat: add IDs to footer count spans for filter JS targeting"
```

---

### Task 3: Rewrite `category-list.liquid` with filter data attributes

**Files:**
- Modify: `snippets/category-list.liquid` (full rewrite)

This is the largest Liquid change. Each of the four sidebar sections gets `data-filter-group` and `data-filter-value` on every `<li>`. Categories lose `<a>` wrappers. Format derives from `metafields.custom.format` with `product.type` fallback. Condition derives from `variant.option1` instead of tags.

- [ ] **Step 1: Rewrite the Categories section (lines 5-28)**

Replace lines 5-28 with:

```liquid
{%- comment -%} CATEGORIES from collections {%- endcomment -%}
<div class="jj-sidebar-section">
  <div class="jj-sidebar-section__title">dir /categories</div>
  <ul class="jj-filter-list">
    {%- for collection in collections limit: 10 -%}
      {%- if collection.handle != 'all' and collection.handle != 'frontpage' -%}
        <li data-filter-group="collection" data-filter-value="{{ collection.handle }}" role="button" tabindex="0" aria-pressed="false">
          <span>
            &gt; {{ collection.title | upcase }}
            {%- if collection.products_count > 0 -%}
              <span class="jj-filter-count">{{ collection.products_count }}</span>
            {%- endif -%}
          </span>
        </li>
      {%- endif -%}
    {%- else -%}
      <li>&gt; NO COLLECTIONS</li>
    {%- endfor -%}
  </ul>
</div>
```

Key changes: removed `<a href>` wrapper, added `data-filter-group="collection"`, `data-filter-value`, `role="button"`, `tabindex="0"`, `aria-pressed="false"`.

- [ ] **Step 2: Rewrite the Format section (lines 30-65)**

Replace lines 30-65 with:

```liquid
{%- comment -%} FORMAT with phosphor colors — derives from metafields.custom.format with product.type fallback {%- endcomment -%}
<div class="jj-sidebar-section">
  <div class="jj-sidebar-section__title">dir /format</div>
  <ul class="jj-filter-list">
    {%- assign formats_seen = '|' -%}
    {%- assign featured = section.settings.collection | default: collections['all'] -%}
    {%- for product in featured.products limit: 50 -%}
      {%- assign raw_format = product.metafields.custom.format | default: product.type -%}
      {%- if raw_format != blank -%}
        {%- assign fmt_lower = raw_format | downcase -%}
        {%- assign fmt_key = '' -%}
        {%- if fmt_lower contains 'vinyl' or fmt_lower contains 'lp' or fmt_lower contains 'record' -%}
          {%- assign fmt_key = 'vinyl' -%}
        {%- elsif fmt_lower contains 'cd' or fmt_lower contains 'compact disc' -%}
          {%- assign fmt_key = 'cd' -%}
        {%- elsif fmt_lower contains 'cassette' or fmt_lower contains 'tape' -%}
          {%- assign fmt_key = 'cassette' -%}
        {%- elsif fmt_lower contains 'minidisc' or fmt_lower contains 'mini disc' or fmt_lower contains 'md' -%}
          {%- assign fmt_key = 'minidisc' -%}
        {%- elsif fmt_lower contains 'hardware' or fmt_lower contains 'player' or fmt_lower contains 'walkman' or fmt_lower contains 'stereo' -%}
          {%- assign fmt_key = 'hardware' -%}
        {%- endif -%}
        {%- if fmt_key != '' -%}
          {%- assign fmt_check = '|' | append: fmt_key | append: '|' -%}
          {%- unless formats_seen contains fmt_check -%}
            {%- assign formats_seen = formats_seen | append: fmt_key | append: '|' -%}
            {%- case fmt_key -%}
              {%- when 'vinyl' -%}
                <li data-filter-group="format" data-filter-value="vinyl" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-amber);">○</span> VINYL</li>
              {%- when 'cd' -%}
                <li data-filter-group="format" data-filter-value="cd" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-cyan);">◎</span> CD</li>
              {%- when 'cassette' -%}
                <li data-filter-group="format" data-filter-value="cassette" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-green);">▭</span> CASSETTE</li>
              {%- when 'minidisc' -%}
                <li data-filter-group="format" data-filter-value="minidisc" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-magenta);">◇</span> MINIDISC</li>
              {%- when 'hardware' -%}
                <li data-filter-group="format" data-filter-value="hardware" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-white);">▪</span> HARDWARE</li>
            {%- endcase -%}
          {%- endunless -%}
        {%- endif -%}
      {%- endif -%}
    {%- endfor -%}
    {%- if formats_seen == '' -%}
      <li data-filter-group="format" data-filter-value="vinyl" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-amber);">○</span> VINYL</li>
      <li data-filter-group="format" data-filter-value="cd" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-cyan);">◎</span> CD</li>
      <li data-filter-group="format" data-filter-value="cassette" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-green);">▭</span> CASSETTE</li>
      <li data-filter-group="format" data-filter-value="minidisc" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-magenta);">◇</span> MINIDISC</li>
      <li data-filter-group="format" data-filter-value="hardware" role="button" tabindex="0" aria-pressed="false"><span style="color:var(--jj-white);">▪</span> HARDWARE</li>
    {%- endif -%}
  </ul>
</div>
```

Key changes: derives from `metafields.custom.format` with `product.type` fallback, extracts normalized key for `data-filter-value`, adds accessibility attrs.

- [ ] **Step 3: Rewrite the Brand section (lines 67-87)**

Replace lines 67-87 with:

```liquid
{%- comment -%} VENDOR / Brand {%- endcomment -%}
<div class="jj-sidebar-section">
  <div class="jj-sidebar-section__title">dir /brand</div>
  <ul class="jj-filter-list">
    {%- assign vendors_seen = '|' -%}
    {%- for product in featured.products limit: 50 -%}
      {%- if product.vendor != blank -%}
        {%- assign vendor_lower = product.vendor | downcase -%}
        {%- assign vendor_check = '|' | append: vendor_lower | append: '|' -%}
        {%- unless vendors_seen contains vendor_check -%}
          {%- assign vendors_seen = vendors_seen | append: vendor_lower | append: '|' -%}
          <li data-filter-group="vendor" data-filter-value="{{ vendor_lower }}" role="button" tabindex="0" aria-pressed="false">&gt; {{ product.vendor | upcase }}</li>
        {%- endunless -%}
      {%- endif -%}
    {%- endfor -%}
    {%- if vendors_seen == '' -%}
      <li>&gt; NO BRANDS</li>
    {%- endif -%}
  </ul>
</div>
```

Key changes: adds filter data attrs, stores lowercased vendor for matching.

- [ ] **Step 4: Rewrite the Condition section (lines 89-113)**

Replace lines 89-113 with:

```liquid
{%- comment -%} CONDITION from variant option1 (aligned with product table row data source) {%- endcomment -%}
<div class="jj-sidebar-section">
  <div class="jj-sidebar-section__title">dir /condition</div>
  <ul class="jj-filter-list">
    {%- assign conditions_seen = '|' -%}
    {%- for product in featured.products limit: 50 -%}
      {%- for variant in product.variants -%}
        {%- if variant.option1 != blank -%}
          {%- assign cond_lower = variant.option1 | downcase | strip -%}
          {%- assign cond_check = '|' | append: cond_lower | append: '|' -%}
          {%- unless conditions_seen contains cond_check -%}
            {%- assign conditions_seen = conditions_seen | append: cond_lower | append: '|' -%}
            <li data-filter-group="condition" data-filter-value="{{ cond_lower }}" role="button" tabindex="0" aria-pressed="false">&gt; {{ variant.option1 | upcase }}</li>
          {%- endunless -%}
        {%- endif -%}
      {%- endfor -%}
    {%- endfor -%}
    {%- if conditions_seen == '' -%}
      <li data-filter-group="condition" data-filter-value="m" role="button" tabindex="0" aria-pressed="false">&gt; MINT</li>
      <li data-filter-group="condition" data-filter-value="nm" role="button" tabindex="0" aria-pressed="false">&gt; NEAR MINT</li>
      <li data-filter-group="condition" data-filter-value="vg" role="button" tabindex="0" aria-pressed="false">&gt; VERY GOOD</li>
      <li data-filter-group="condition" data-filter-value="g" role="button" tabindex="0" aria-pressed="false">&gt; GOOD</li>
    {%- endif -%}
  </ul>
</div>
```

Key changes: derives from `variant.option1` instead of tags, adds filter data attrs.

- [ ] **Step 5: Commit**

```bash
git add snippets/category-list.liquid
git commit -m "feat: rewrite sidebar with filter data attributes and aligned data sources"
```

---

## Chunk 2: CSS Additions

### Task 4: Add filter CSS rules

**Files:**
- Modify: `assets/japanjunky-homepage.css` (append after existing filter styles, ~line 774)

- [ ] **Step 1: Add active state, cursor, and hidden row CSS**

Append after the existing `.jj-filter-bar__clear:hover` rule (around line 774):

```css
/* ── Sidebar filter interactivity ── */
.jj-filter-list li[data-filter-group] {
  cursor: pointer;
}

.jj-filter-list li.jj-filter-item--active {
  color: var(--jj-primary);
  border-left-color: var(--jj-primary);
  background: #111;
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.3);
}

.jj-filter-tag {
  cursor: pointer;
}

/* ── Hidden product row ── */
.jj-row--hidden {
  display: none;
}
```

Note: The `.jj-filter-tag` rule here only adds `cursor: pointer` — the existing `.jj-filter-tag` styles (color, padding, hover) at lines 755-763 are preserved.

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-homepage.css
git commit -m "feat: add sidebar filter active state and hidden row CSS"
```

---

## Chunk 3: Filter Engine (JS)

### Task 5: Create `japanjunky-filter.js`

**Files:**
- Create: `assets/japanjunky-filter.js`

- [ ] **Step 1: Write the filter engine**

Create `assets/japanjunky-filter.js`:

```js
/**
 * japanjunky-filter.js
 * Client-side multi-select filtering for the left sidebar.
 * OR within a group, AND across groups.
 */
(function () {
  'use strict';

  var sidebar = document.querySelector('.jj-left-sidebar');
  var tbody = document.getElementById('jj-product-tbody');
  var filterBar = document.getElementById('jj-filter-bar');
  var filterTags = document.getElementById('jj-filter-tags');
  var filterClear = document.getElementById('jj-filter-clear');
  var footerCount = document.getElementById('jj-footer-count');
  var footerSep = document.getElementById('jj-footer-sep');
  var footerShowing = document.getElementById('jj-footer-showing');

  if (!sidebar || !tbody) return;

  // ── State ──
  var activeFilters = {
    collection: new Set(),
    format: new Set(),
    vendor: new Set(),
    condition: new Set()
  };

  // Store original footer text for restoring
  var originalCountText = footerCount ? footerCount.textContent : '';

  // ── Matching helpers ──

  // Map filter groups to data attribute names on <tr>
  var groupToAttr = {
    collection: 'data-product-collections',
    format: 'data-product-format',
    vendor: 'data-product-vendor',
    condition: 'data-product-condition'
  };

  function rowMatchesGroup(row, group, values) {
    var attr = row.getAttribute(groupToAttr[group]) || '';
    if (group === 'collection') {
      // Collections is comma-separated; check if any active handle is in the list
      var cols = attr.split(',');
      for (var i = 0; i < cols.length; i++) {
        if (values.has(cols[i])) return true;
      }
      return false;
    }
    if (group === 'vendor') {
      return values.has(attr.toLowerCase());
    }
    if (group === 'condition') {
      return values.has(attr.toLowerCase());
    }
    // format: already normalized lowercase in data attr
    return values.has(attr);
  }

  // ── Apply filters ──

  function applyFilters() {
    var rows = tbody.querySelectorAll('tr[data-product-handle]');
    var totalRows = rows.length;
    var visibleCount = 0;

    // Collect groups that have active selections
    var activeGroups = [];
    for (var g in activeFilters) {
      if (activeFilters[g].size > 0) {
        activeGroups.push(g);
      }
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var visible = true;

      for (var j = 0; j < activeGroups.length; j++) {
        var group = activeGroups[j];
        if (!rowMatchesGroup(row, group, activeFilters[group])) {
          visible = false;
          break;
        }
      }

      if (visible) {
        row.classList.remove('jj-row--hidden');
        visibleCount++;
      } else {
        row.classList.add('jj-row--hidden');
      }
    }

    updateFilterBar();
    updateFooterCount(visibleCount, totalRows, activeGroups.length > 0);
    checkDetailPane();
  }

  // ── Filter bar ──

  function updateFilterBar() {
    if (!filterBar || !filterTags) return;

    var hasFilters = false;
    for (var g in activeFilters) {
      if (activeFilters[g].size > 0) { hasFilters = true; break; }
    }

    if (!hasFilters) {
      filterBar.style.display = 'none';
      filterTags.innerHTML = '';
      return;
    }

    filterBar.style.display = '';
    var html = '';

    for (var group in activeFilters) {
      activeFilters[group].forEach(function (value) {
        // Find the sidebar item to get its display text
        var displayName = getDisplayName(group, value);
        html += '<span class="jj-filter-tag" data-tag-group="' + group + '" data-tag-value="' + value + '">' + displayName + '</span>';
      });
    }

    filterTags.innerHTML = html;
  }

  function getDisplayName(group, value) {
    // Find the sidebar <li> with matching group/value and read its text
    var item = sidebar.querySelector('li[data-filter-group="' + group + '"][data-filter-value="' + value + '"]');
    if (item) {
      // Clone and remove count span to get clean display text
      var clone = item.cloneNode(true);
      var countSpan = clone.querySelector('.jj-filter-count');
      if (countSpan) countSpan.remove();
      var text = clone.textContent.replace(/^\s*>\s*/, '').trim();
      return text;
    }
    return value.toUpperCase();
  }

  // ── Footer count ──

  function updateFooterCount(visible, total, isFiltered) {
    if (!footerCount) return;

    if (isFiltered) {
      footerCount.textContent = visible + ' of ' + total + ' items';
      if (footerSep) footerSep.style.display = 'none';
      if (footerShowing) footerShowing.style.display = 'none';
    } else {
      footerCount.textContent = originalCountText;
      if (footerSep) footerSep.style.display = '';
      if (footerShowing) footerShowing.style.display = '';
    }
  }

  // ── Detail pane check ──

  function checkDetailPane() {
    var selectedRow = tbody.querySelector('tr.jj-row-selected');
    if (selectedRow && selectedRow.classList.contains('jj-row--hidden')) {
      // Click the first visible row, or clear the pane
      var firstVisible = tbody.querySelector('tr[data-product-handle]:not(.jj-row--hidden)');
      if (firstVisible) {
        firstVisible.click();
      }
    }
  }

  // ── Click handler (event delegation) ──

  sidebar.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-filter-group]');
    if (!li) return;

    var group = li.getAttribute('data-filter-group');
    var value = li.getAttribute('data-filter-value');
    if (!group || !value || !activeFilters[group]) return;

    // Toggle
    if (activeFilters[group].has(value)) {
      activeFilters[group].delete(value);
      li.classList.remove('jj-filter-item--active');
      li.setAttribute('aria-pressed', 'false');
    } else {
      activeFilters[group].add(value);
      li.classList.add('jj-filter-item--active');
      li.setAttribute('aria-pressed', 'true');
    }

    applyFilters();
  });

  // Keyboard support: Enter/Space to toggle
  sidebar.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var li = e.target.closest('li[data-filter-group]');
      if (li) {
        e.preventDefault();
        li.click();
      }
    }
  });

  // ── Filter tag click (remove individual filter) ──

  if (filterTags) {
    filterTags.addEventListener('click', function (e) {
      var tag = e.target.closest('.jj-filter-tag');
      if (!tag) return;

      var group = tag.getAttribute('data-tag-group');
      var value = tag.getAttribute('data-tag-value');
      if (!group || !value || !activeFilters[group]) return;

      activeFilters[group].delete(value);

      // Deactivate the corresponding sidebar item
      var li = sidebar.querySelector('li[data-filter-group="' + group + '"][data-filter-value="' + value + '"]');
      if (li) {
        li.classList.remove('jj-filter-item--active');
        li.setAttribute('aria-pressed', 'false');
      }

      applyFilters();
    });
  }

  // ── Clear all ──

  if (filterClear) {
    filterClear.addEventListener('click', function () {
      for (var g in activeFilters) {
        activeFilters[g].clear();
      }

      // Remove all active classes
      var activeItems = sidebar.querySelectorAll('.jj-filter-item--active');
      for (var i = 0; i < activeItems.length; i++) {
        activeItems[i].classList.remove('jj-filter-item--active');
        activeItems[i].setAttribute('aria-pressed', 'false');
      }

      applyFilters();
    });
  }

  // ── Sort integration: reapply filters after sort changes ──

  var sortSelect = document.getElementById('jj-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      // Sort handler in product-select.js fires first (same event).
      // Use setTimeout to let it finish re-ordering rows, then reapply.
      setTimeout(applyFilters, 0);
    });
  }

})();
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-filter.js
git commit -m "feat: add client-side filter engine for sidebar"
```

---

## Chunk 4: Integration & Keyboard Nav Fix

### Task 6: Load the filter script in theme.liquid

**Files:**
- Modify: `layout/theme.liquid:144` (after `japanjunky-product-select.js`)

- [ ] **Step 1: Add script tag**

In `layout/theme.liquid`, add the following line after line 144 (`japanjunky-product-select.js`):

```liquid
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
```

So lines 144-145 become:

```liquid
  <script src="{{ 'japanjunky-product-select.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
```

- [ ] **Step 2: Commit**

```bash
git add layout/theme.liquid
git commit -m "feat: load filter JS after product-select in theme.liquid"
```

---

### Task 7: Update keyboard navigation to skip hidden rows

**Files:**
- Modify: `assets/japanjunky-product-select.js:330`

- [ ] **Step 1: Update the row selector**

In `assets/japanjunky-product-select.js`, line 330, change:

```js
    var rows = Array.from(tbody.querySelectorAll('tr[data-product-handle]'));
```

To:

```js
    var rows = Array.from(tbody.querySelectorAll('tr[data-product-handle]:not(.jj-row--hidden)'));
```

- [ ] **Step 2: Commit**

```bash
git add assets/japanjunky-product-select.js
git commit -m "fix: keyboard nav skips filtered-out rows"
```

---

### Task 8: Manual testing checklist

- [ ] **Step 1: Verify sidebar items are clickable and toggle active state**

Load the homepage. Click a format (e.g. VINYL). Confirm:
- The `<li>` gets a red highlight (primary color, left border glow)
- The product table filters to show only vinyl rows
- The filter bar appears with a "VINYL" tag
- Footer shows "X of Y items"

- [ ] **Step 2: Verify multi-select within a group**

Click VINYL then CD. Confirm both are highlighted and rows matching either format are visible.

- [ ] **Step 3: Verify AND across groups**

With VINYL active, click a vendor. Confirm only rows matching BOTH vinyl AND that vendor are shown.

- [ ] **Step 4: Verify filter tag removal**

Click a tag in the filter bar. Confirm it removes that filter and the sidebar item deactivates.

- [ ] **Step 5: Verify clear all**

Click `[clear all]`. Confirm all filters reset, all rows visible, filter bar hidden.

- [ ] **Step 6: Verify keyboard navigation skips hidden rows**

With filters active, use arrow keys. Confirm selection skips hidden rows.

- [ ] **Step 7: Verify sort + filter interaction**

With filters active, change the sort dropdown. Confirm filtered rows re-sort correctly and hidden rows stay hidden.

- [ ] **Step 8: Final commit and push**

```bash
git push
```
