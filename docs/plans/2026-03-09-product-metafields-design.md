# Product Metafields & Layout Overhaul — Design

**Date:** 2026-03-09

## Overview

Replace tag-based and vendor-based product data with Shopify metafields. Restructure the catalogue table's title column and the detail sidebar to display the new fields. Eliminate dead space in the sidebar.

## Data Layer — Shopify Metafields

All custom product data accessed via `product.metafields.custom.*`:

| Field     | Key                | Usage                                      |
|-----------|--------------------|---------------------------------------------|
| Artist    | `custom.artist`    | Catalogue row, detail pane (replaces vendor)|
| JP Name   | `custom.jp_name`   | Detail pane, below artist                   |
| JP Title  | `custom.jp_title`  | Detail pane, below product title            |
| Condition | `custom.condition` | Catalogue row, detail meta                  |
| Code      | `custom.code`      | Catalogue row, detail meta                  |
| Year      | `custom.year`      | Catalogue row, detail meta                  |
| Label     | `custom.label`     | Catalogue row, detail meta                  |
| Format    | `custom.format`    | Catalogue row, detail meta                  |

## Catalogue Table — Title & Description Column

Current layout:
```
Product Title
Vendor
VENDOR · Type
```

New layout:
```
Product Title
Artist
[Label] - [Year]
```

Empty fields display `---` as placeholder.

## Detail Pane — New Layout (top to bottom)

1. **Header** — terminal path (unchanged)
2. **"Recently Added"** — updated text from "type item.dat"
3. **Artist** — from `custom.artist`, larger font, replaces vendor
4. **JP Name** — from `custom.jp_name`, below artist
5. **Image** — unchanged
6. **Product Title** — moved below image
7. **JP Title** — from `custom.jp_title`, below product title
8. **Meta section** — Code, Label, Format, Year, Condition (from metafields, same CSS style as current meta)
9. **Price row** — unchanged
10. **Actions** — Add to Cart, Watchlist (unchanged)
11. **Padding** — space before marquee for readability

Marquee bar spans full page width (already positioned outside the grid).

## Sidebar Spacing

Content stacks tightly with no dead space. Padding added between actions and marquee bar for readability.

## Files Changed

- `snippets/product-table-row.liquid` — Add metafield data attributes, update title cell
- `snippets/product-detail-pane.liquid` — Reorder elements, update "Recently Added", add JP name/title slots
- `assets/japanjunky-product-select.js` — Read new data attributes, populate new fields, remove old vendor/type meta
- `assets/japanjunky-homepage.css` — Adjust detail-artist size, new meta styles, sidebar spacing
- `sections/jj-homepage-body.liquid` — Add metafield values if needed

## No Changes To

CRT filter, zoom, marquee position, header, footer, taskbar, left sidebar.
