# Left Sidebar Filtering — Design Spec

## Overview

Make the left sidebar functional by turning its directory listings (Categories, Format, Brand, Condition) into client-side multi-select filters that show/hide product table rows in real time.

## Approach

Pure client-side JS filtering. Product table rows already carry `data-*` attributes for vendor, format, and condition. We add collection membership and wire up click handlers on sidebar items.

## 1. Data Layer

**File:** `snippets/product-table-row.liquid`

Add one new data attribute to each `<tr>`:

```liquid
data-product-collections="{{ product.collections | map: 'handle' | join: ',' }}"
```

Existing attributes used for filtering (no changes needed):
- `data-product-format` — normalized key: vinyl, cd, cassette, minidisc, hardware
- `data-product-vendor` — raw vendor string
- `data-product-condition` — from variant option1

## 2. Sidebar Markup

**File:** `snippets/category-list.liquid`

Each `<li>` becomes a clickable filter toggle with two data attributes:

| Attribute | Purpose |
|---|---|
| `data-filter-group` | Dimension name: `collection`, `format`, `vendor`, `condition` |
| `data-filter-value` | Value to match against the corresponding `data-product-*` attribute on table rows |

Values are normalized to lowercase for matching. The `<li>` elements get `role="button"` and `tabindex="0"` for accessibility.

### Categories section
- `data-filter-group="collection"`
- `data-filter-value="{{ collection.handle }}"` — matches against comma-separated `data-product-collections`

### Format section
- `data-filter-group="format"`
- `data-filter-value` uses the same normalized keys as the product row: vinyl, cd, cassette, minidisc, hardware

### Brand section
- `data-filter-group="vendor"`
- `data-filter-value="{{ product.vendor | downcase }}"` — matches against lowercased `data-product-vendor`

### Condition section
- `data-filter-group="condition"`
- `data-filter-value="{{ cond_val | downcase }}"` — matches against lowercased `data-product-condition`

## 3. Filter Engine

**New file:** `assets/japanjunky-filter.js`

### State

```js
const activeFilters = {
  collection: new Set(),
  format: new Set(),
  vendor: new Set(),
  condition: new Set()
};
```

### Click handler

- Attached to all `[data-filter-group]` elements via event delegation on `.jj-left-sidebar`
- Toggles value in/out of the relevant Set
- Toggles `--active` class on the clicked `<li>`
- Calls `applyFilters()`

### Filter logic

```
for each <tr> in product table:
  visible = true
  for each group with active filters:
    if row's data-product-{group} does NOT match ANY value in that group's Set:
      visible = false
      break
  show/hide row accordingly
```

- **OR within a group:** row matches if its value is in the Set (e.g. vinyl OR cd)
- **AND across groups:** row must pass every group that has active selections
- For collections: row's `data-product-collections` is comma-separated, so check if any active collection handle is present in the list

### Row visibility

Add/remove class `jj-row--hidden` on `<tr>` elements. CSS hides them with `display: none`.

## 4. Filter Bar

**Existing elements:** `#jj-filter-bar`, `#jj-filter-tags`, `#jj-filter-clear`

- Show `#jj-filter-bar` (remove `display:none`) when any filter is active
- Populate `#jj-filter-tags` with a `<span class="jj-filter-tag">` per active filter, showing the display name
- Each tag is clickable to remove that individual filter
- `#jj-filter-clear` removes all filters and resets sidebar active states
- Hide the bar again when all filters are cleared

## 5. Footer Count

Update `.jj-table-footer__left` to reflect filtered state:
- "X of Y items" when filters active
- "Y items" when no filters active

## 6. Detail Pane Integration

When filters change, check if the currently highlighted row (in the right sidebar detail pane) is now hidden. If so, clear the detail pane or select the first visible row.

## 7. CSS Additions

**File:** `assets/japanjunky-homepage.css`

```css
/* Active sidebar filter item */
.jj-filter-list li.--active {
  color: var(--jj-primary);
  border-left-color: var(--jj-primary);
  background: #111;
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.3);
}

/* Hidden product row */
.jj-row--hidden {
  display: none;
}

/* Filter tag chip */
.jj-filter-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  margin: 0 4px;
  border: 1px solid var(--jj-primary);
  color: var(--jj-primary);
  cursor: pointer;
  font-family: 'Fixedsys Excelsior 3.01', 'DotGothic16', monospace;
}

.jj-filter-tag:hover {
  background: var(--jj-primary);
  color: #000;
}
```

## 8. Script Loading

**File:** `layout/theme.liquid`

Add before `</body>`:
```liquid
<script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
```

## Files Changed

| File | Change |
|---|---|
| `snippets/product-table-row.liquid` | Add `data-product-collections` attribute |
| `snippets/category-list.liquid` | Add `data-filter-group`/`data-filter-value` to all `<li>`, make clickable |
| `assets/japanjunky-filter.js` | New file — filter engine, click handlers, filter bar, footer update |
| `assets/japanjunky-homepage.css` | Active state, hidden row, filter tag styles |
| `layout/theme.liquid` | Load filter JS |
