# JapanJunky Visual Redesign — Design Document

> Approved 2026-03-08. Purpose-built catalog software running in a Win95 shell on a Color CRT display.

---

## 1. CONCEPT

A knowledgeable digger's tool for browsing physical Japanese media spanning the 1950s to present. The Win95 shell is the "emulator" — a framing device that gives every visual choice a reason. The CRT display characteristics aren't a theme; they're how this machine renders content. The aesthetic is felt, not announced.

**Brand identity:** Serious tools from another era, used with intention now. The website should feel like the plumbicon camera footage — warm, rich, clearly not modern, but unmistakably high-quality. Not retro as costume. Retro as craft.

**Personality:** A collector's den + curated archive + underground outpost. Dense, rewarding to explore, quietly authoritative, built by someone who cares deeply.

**Cultural blend:** Japanese and Western retro computing aesthetics. The overlap is authentic — both traditions shared constraints (limited palettes, character grids, information density). Japanese characters appear only as real product data, never as decoration.

---

## 2. VISUAL FOUNDATION — CRT DISPLAY QUALITY

### What changes from current

| Element | Current | Redesign |
|---|---|---|
| Background | Matrix rain canvas on `#000` | Pure `#000`. No canvas. Unexcited CRT void. |
| Product images | Standard photos | Auto-dithered + phosphor dot subpixel overlay |
| Image borders | `1px solid` | `1px solid` + 1px chromatic aberration (red-left, blue-right) |
| Vignette | Radial gradient, transparent 55% → black 100% | Slightly stronger: transparent 50% → black 100% |
| Interaction persistence | Instant state changes | 0.15s ease-out phosphor decay on deselection |

### What stays exactly as-is

- Scanlines at current low opacity (0.04)
- Cursor-following radial light
- Custom multi-color CRT cursor with all animation frames
- All existing glow utilities (text-shadow based)

### What gets removed

- Matrix rain canvas element
- `JJ_MATRIX_CONFIG` JS configuration
- Shopify settings for matrix rain (opacity, speed, enabled toggle)
- `japanjunky-parallax.js` (if only used for matrix rain)

---

## 3. PRODUCT IMAGE TREATMENT

### Auto-Dithering Pipeline

Client-side JS canvas process applied to all product images uniformly:

1. Image loads into an offscreen canvas
2. Floyd-Steinberg or ordered (Bayer) dithering algorithm applied
3. Dithered result rendered back to visible `<img>` or canvas element
4. Consistent across all products regardless of source image quality

### Display Treatment

- **Phosphor dot overlay**: CSS pseudo-element on `.jj-thumb-img` and `.jj-detail-image` renders a faint RGB subpixel grid pattern. Barely visible at normal distance. Visible on close inspection.
- **Chromatic aberration**: 1px red/blue shift on image container border edges via box-shadow or pseudo-element.
- **Image frame**: Simple `1px solid var(--jj-border)`. No decorative chrome. Dithering + phosphor overlay do the work.
- **Detail pane image**: On selection, existing `jj-screen-refresh` brightness flash animation plays. Previous content gets a 0.15s phosphor fade-out before new content refreshes in.

---

## 4. COLOR SYSTEM — FORMAT-CODED PHOSPHORS

### Format-to-Color Mapping

| Format | Phosphor Color | CSS Variable | Glyph |
|---|---|---|---|
| Vinyl | Amber | `--jj-amber` (#ffaa00) | ○ |
| CD | Cyan | `--jj-cyan` (#00e5e5) | ◎ |
| Cassette | Green | `--jj-green` (#33ff33) | ▭ |
| MiniDisc | Magenta | `--jj-magenta` (#e040e0) | ◇ |
| Hardware | White | `--jj-white` (#e0e0e0) | ▪ |

### How Color Appears

- **Table rows**: 2px left-border in the format's phosphor color. Format column text tinted to match.
- **Selected row**: Left-border intensifies + subtle box-shadow glow in format color. Detail pane header border picks up same color.
- **Hover**: 1px left-border flash in format color.
- **Everything else**: Neutral. Body text, prices, other columns stay in their current colors. No color overload — format color is a single consistent thread.

### Existing Color Roles (unchanged)

- Red (`--jj-primary`): Brand, primary actions, selected states
- Gold (`--jj-secondary`): Prices, headings, highlights
- Cyan/Blue (`--jj-accent`): Links, codes, informational
- Cream (`--jj-text`): Body text default

---

## 5. JAPANESE ELEMENTS — DATA, NOT DECORATION

### Rule: Every Japanese character must be real, meaningful product data.

### Where Japanese appears

| Location | Example | Implementation |
|---|---|---|
| Detail pane: original title | `原題: 真夜中のドア` below romanized name | Smaller, `--jj-muted` color |
| Label/publisher names | `東芝EMI` instead of "Toshiba EMI" | Original form when that's how they're known |
| Catalog numbers | `TOCT-5765`, `VIJL-60023` | Original format as printed on product |
| Condition grading | Japanese grading alongside Western grades | In detail pane metadata |

### Where Japanese does NOT appear

- UI labels, nav items, section headers
- Decorative elements, watermarks, background text
- Terminal prompts (`C:\>`), titlebar, taskbar
- ASCII art (Western character set only)

---

## 6. CATALOG INTERFACE

### Product Table

| Property | Current | Redesign |
|---|---|---|
| Row height | 86px | ~64px (denser, more products visible) |
| Thumbnail size | 80x80px | 56x56px |
| Product name weight | 12px bold | 12px normal (color is hierarchy, not boldness) |
| Format column | Text only | Glyph (◎○▭◇▪) + tinted text |
| Left border | None | 2px in format phosphor color |
| Keyboard nav | None | Arrow keys move selection, Enter opens product |

### Filter Sidebar

Collapsible sections using existing `jj-sidebar-section` pattern:

- **Format**: Vinyl, CD, Cassette, MiniDisc, Hardware (with phosphor-colored labels)
- **Genre**: Jazz, Rock, Pop, Electronic, Enka, Classical, Soundtrack, etc.
- **Era**: 50s, 60s, 70s, 80s, 90s, 00s, 10s, 20s (decade-based, how diggers think)
- **Condition**: Mint, Excellent, Very Good, Good, Fair
- **Price range**: Bracket-based or min/max input

### Active Filter Display

Above the table, below the table header area:
```
> FORMAT:vinyl GENRE:jazz ERA:70s    [clear all]
```
Each term is clickable to remove. Feels like a database query. Empty when no filters active.

### Table Footer

Live-updating: `showing 14 of 238 items` as filters narrow results. Sort dropdown stays.

### Detail Pane (Right Sidebar)

- Header border picks up format phosphor color on selection
- Original Japanese title below romanized name
- Dithered image with phosphor overlay as visual centerpiece
- Previous content fades out (0.15s phosphor decay) before new content refreshes in
- Existing screen-refresh animation on image change stays

---

## 7. ASCII ART — SPARSE, FUNCTIONAL

### What gets ASCII art

| Element | Description | Size |
|---|---|---|
| Format icons | 5 small glyphs: vinyl, cassette, CD, MiniDisc, hardware | ~5-7 chars wide, 3-5 lines tall |
| Empty state | Bare shelf or empty record crate | Fills center content area |
| 404 page | Dedicated scene, expressive | Full page |
| "Click a product" placeholder | Current box-drawing placeholder in detail pane | Existing size, stays |

### What does NOT get ASCII art

- No homepage heroes or banners
- No decorative section dividers
- No large ASCII text headers (VT323 display font handles that role)
- No ASCII art in the detail pane beyond the initial placeholder

### Style rules

- Western box-drawing characters (┌─┐│└┘) for structure
- Block characters (█▓▒░) for shading/fills — 16colo.rs influence
- No color on structural ASCII. Phosphor color only on the 5 small format icons.
- All ASCII art stored in Liquid snippets

---

## 8. WIN95 SHELL REFINEMENTS

### Titlebar

Current: generic gradient titlebar.
Redesign: Displays `JAPANJUNKY.EXE` or `JAPANJUNKY — Catalog`. The store name is the program name.

### Taskbar

- Active tab gets subtle text glow to differentiate from inactive tabs
- Existing structure and styling stays

### Clock

- Time display stays in taskbar as-is
- **New**: Click/tap the clock opens a small popover showing the full date with randomized retrofuture year (matching existing randomized year logic)
- Popover styled as a small Win95-style panel: `1px solid` border, dark background, monospace date text
- Click outside or click clock again to dismiss

### Start Menu

- Existing structure stays
- Vertical sidebar text with brand name stays (good detail)

---

## 9. TYPOGRAPHY

### Changes

| Element | Current | Redesign |
|---|---|---|
| Product names (table) | 12px bold | 12px normal weight |

### Everything else stays

- All headings: normal weight, color + glow for hierarchy
- Section titles: 11px uppercase + letter-spacing
- Prices: bold, gold phosphor glow
- Detail pane artist: 14px bold uppercase red glow
- All IBM Plex Mono primary, VT323 for display sizes

---

## 10. MICRO-INTERACTIONS

All CRT-authentic. No modern UI motion.

| Interaction | Behavior | Duration |
|---|---|---|
| Table row hover | Background shift + 1px left-border flash in format color | 0.06s |
| Table row selection | Background + 2px left-border + format glow | Instant on, 0.15s phosphor decay off |
| Filter activation | Brief brightness flash on filter item | 0.1s ease-out |
| Detail pane content change | Previous content phosphor fade-out, then screen-refresh in | 0.15s out, 0.35s in |
| Image load in detail pane | Existing screen-refresh animation | 0.35s |
| Clock popover | Appears/disappears (no animation, instant like Win95) | Instant |

---

## 11. RESPONSIVE BEHAVIOR

### Desktop (>960px)
Full 3-column layout. The primary experience.

### Tablet (600-960px)
- Left sidebar filters collapse into start menu sub-items
- Layout: product table (full width) + detail pane as slide-in overlay from right on row selection
- Table hides CAT# and CONDITION columns (move to detail pane only)

### Mobile (<600px)
- Single column compact list: dithered thumbnail, title, format glyph, price per row
- Tapping a product opens detail view as full-screen panel within Win95 frame
- Back button returns to list
- Taskbar stays fixed at bottom, start menu is primary navigation
- Same software, smaller monitor

---

## 12. REMOVALS

| Element | Reason |
|---|---|
| Matrix rain canvas | Visual cliche. Black void is more powerful and authentic. |
| `JJ_MATRIX_CONFIG` | No longer needed |
| Matrix rain Shopify settings | No longer needed |
| Bold weight on product names | CRT uses color for hierarchy, not weight |

---

## 13. FILES AFFECTED

### CSS (modify)
- `japanjunky-base.css` — Remove matrix canvas styles, adjust product name weight
- `japanjunky-crt.css` — Add phosphor dot overlay, chromatic aberration, strengthen vignette, add phosphor decay transitions
- `japanjunky-homepage.css` — Tighter row heights, format-coded left borders, filter query display, active filter styles
- `japanjunky-ascii.css` — Format icon styles (if needed)
- `japanjunky-win95.css` — Clock popover, active tab glow, titlebar text

### JS (new)
- `japanjunky-dither.js` — Client-side auto-dithering pipeline (canvas-based Floyd-Steinberg/Bayer)

### JS (modify)
- `japanjunky-product-select.js` — Keyboard navigation, format color on detail pane, phosphor decay transitions
- `japanjunky-win95-menu.js` — Clock popover behavior

### JS (remove)
- Matrix rain canvas code (wherever it lives)

### Liquid (modify)
- `layout/theme.liquid` — Remove matrix rain canvas, config, settings references
- `sections/jj-header.liquid` — Titlebar text change
- `sections/jj-homepage-body.liquid` — Filter query display area, tighter table structure
- `snippets/product-table-row.liquid` — Format glyph, left border, tighter dimensions
- `snippets/product-detail-pane.liquid` — Japanese title field, format color header
- `snippets/win95-clock.liquid` — Date popover markup

### Liquid (new)
- `snippets/ascii-format-icon.liquid` — Five format icon ASCII art pieces
- `snippets/ascii-empty-state.liquid` — Zero results illustration
- `templates/404.liquid` — ASCII art 404 page (if not already exists)

### Shopify settings (modify)
- Remove matrix rain settings (opacity, speed, enabled)
