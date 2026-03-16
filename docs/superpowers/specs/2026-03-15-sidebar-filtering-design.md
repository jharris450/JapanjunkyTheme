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
- `data-product-condition` — from variant option1 (e.g. "NM", "VG+", "M")

**Condition data alignment:** The sidebar currently reads conditions from product tags (`condition:` prefix), but table rows source condition from `variant.option1`. These may use different vocabularies. Fix: change the sidebar's Condition section to derive values from the same source as the rows — iterate variant option1 values across the featured collection's products. This ensures filter values match row data exactly.

## 2. Sidebar Markup

**File:** `snippets/category-list.liquid`

Each `<li>` becomes a clickable filter toggle with two data attributes:

| Attribute | Purpose |
|---|---|
| `data-filter-group` | Dimension name: `collection`, `format`, `vendor`, `condition` |
| `data-filter-value` | Value to match against the corresponding `data-product-*` attribute on table rows |

Values are normalized to lowercase for matching. The `<li>` elements get `role="button"`, `tabindex="0"`, and `aria-pressed="false"` for accessibility. The JS toggles `aria-pressed` alongside the visual active class.

### Categories section
- `data-filter-group="collection"`
- `data-filter-value="{{ collection.handle }}"` — matches against comma-separated `data-product-collections`
- **Remove the `<a href>` wrappers** — category items currently contain `<a href="{{ collection.url }}">` which would navigate away from the page. Replace with `<span>` elements so clicks toggle filters instead of navigating.

### Format section
- `data-filter-group="format"`
- `data-filter-value` uses the same normalized keys as the product row: vinyl, cd, cassette, minidisc, hardware

### Brand section
- `data-filter-group="vendor"`
- `data-filter-value="{{ product.vendor | downcase }}"` — matches against lowercased `data-product-vendor`

### Condition section
- `data-filter-group="condition"`
- `data-filter-value` uses lowercased variant option1 values (not tag-based `condition:` values) — matches against lowercased `data-product-condition`
- Sidebar Condition section rewritten to iterate variant option1 values from the featured collection, deduplicating unique condition strings

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
- Toggles `jj-filter-item--active` class on the clicked `<li>` (BEM-compliant with project convention)
- Toggles `aria-pressed` attribute for accessibility
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

Update `.jj-table-footer__left` to reflect filtered state. The element contains two `<span>` children: one for total count and one for "showing 1-N". When filters are active:
- First span: "X of Y items"
- Second span: hidden (not meaningful when filtering)

When no filters are active, restore original text.

## 6. Detail Pane Integration

When filters change, check if the currently highlighted row (in the right sidebar detail pane) is now hidden. If so, clear the detail pane or select the first visible row.

### Keyboard navigation

`japanjunky-product-select.js` has keyboard handlers that cycle through `tr[data-product-handle]` rows with arrow keys. Update the selector to exclude hidden rows: `tr[data-product-handle]:not(.jj-row--hidden)`. This prevents keyboard navigation from landing on filtered-out rows.

### Sort interaction

The sort handler in `japanjunky-product-select.js` re-appends all rows to the tbody. Since it preserves CSS classes, `jj-row--hidden` survives sorting. No special handling needed, but the filter engine should re-read rows from the DOM after sort (or sort should trigger a filter reapply) to keep the footer count accurate.

## 7. CSS Additions

**File:** `assets/japanjunky-homepage.css`

```css
/* Active sidebar filter item — BEM-compliant */
.jj-filter-list li.jj-filter-item--active {
  color: var(--jj-primary);
  border-left-color: var(--jj-primary);
  background: #111;
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.3);
}

/* Hidden product row */
.jj-row--hidden {
  display: none;
}
```

**Existing `.jj-filter-tag` styles** are already defined in `japanjunky-homepage.css` (accent color, line-through on hover). These match the terminal aesthetic and will be kept as-is. The filter engine will add `cursor: pointer` to `.jj-filter-tag` to indicate clickability.

## 8. Script Loading

**File:** `layout/theme.liquid`

Add before `</body>`, **after** `japanjunky-product-select.js` (both use `defer`, so DOM order determines execution order — filter engine needs product-select to be initialized first for detail pane integration):
```liquid
<script src="{{ 'japanjunky-filter.js' | asset_url }}" defer></script>
```

## Files Changed

| File | Change |
|---|---|
| `snippets/product-table-row.liquid` | Add `data-product-collections` attribute |
| `snippets/category-list.liquid` | Add filter data attrs, remove `<a>` wrappers, rewrite Condition to use variant option1 |
| `assets/japanjunky-filter.js` | New file — filter engine, click handlers, filter bar, footer update |
| `assets/japanjunky-homepage.css` | Active state, hidden row class, filter-tag cursor tweak |
| `assets/japanjunky-product-select.js` | Update keyboard nav selector to exclude `.jj-row--hidden` |
| `layout/theme.liquid` | Load filter JS |
