# Retrofuture Glyphs — UI/UX Design Guidelines for JapanJunky

> Based on "Retrofuture Glyphs: Text Realms on Possible and Impossible Monitors" by Andrey Fomin (2026).
> These guidelines adapt the book's Color CRT display aesthetic into a practical, maintainable web design system.

---

## 1. CORE PHILOSOPHY

The Retrofuture Glyphs approach treats **text as graphics**. Every visual element — borders, icons, illustrations, UI chrome — is built from or inspired by monospaced characters on a strict grid. The display itself is a character: a **Color CRT** monitor where phosphor glow, scanline texture, and multi-color emission define the visual identity.

### Governing Principles

1. **The Grid is Sacred** — All layout snaps to a monospace character grid. Elements align to cell boundaries. Spacing is measured in character units, not arbitrary pixels.
2. **Characters are Building Blocks** — Box-drawing characters, block elements, and ASCII symbols form the visual vocabulary for borders, frames, dividers, icons, and decorative art.
3. **The Screen is Alive** — CRT displays glow, flicker, and breathe. Light bleeds at edges. Colors have phosphor warmth. The interface should feel like it's being drawn by an electron beam.
4. **Constraint Breeds Creativity** — No rotation. No scaling of glyphs. No gradients within characters. Work within the limitations of a text-mode display, even when CSS can do more.
5. **Typography IS the Interface** — The font is not decoration; it is the primary design tool. Every pixel of every glyph matters.

---

## 2. DISPLAY SIMULATION: COLOR CRT

The primary display mode is **Color CRT** — a cathode-ray tube with multiple phosphor colors.

### Visual Characteristics to Simulate

| Property | Description | CSS Technique |
|---|---|---|
| **Phosphor glow** | Characters emit light; edges bleed softly | `text-shadow` with color-matched glow (2-3 layers) |
| **Color warmth** | Colors feel emissive, not backlit | Slightly saturated, warm-shifted palette |
| **Scanline hint** | Faint horizontal line texture | Optional repeating-linear-gradient overlay at low opacity (~0.03-0.05) |
| **Screen curvature** | Subtle barrel distortion at edges | Vignette effect via radial-gradient on frame overlay |
| **Flicker / life** | Image feels constantly redrawn | Subtle brightness oscillation on transitions; blinking cursor |
| **Persistence** | Phosphor afterglow on changes | Ease-out transitions on text/element changes (0.15-0.35s) |
| **Glass depth** | Light feels like it's behind glass | Very subtle inner shadow on the page frame |

### CRT Frame Overlay (existing: `.jj-crt-frame::before`)

Keep the cursor-following radial light. Enhance with:
- A faint vignette (darker corners/edges) to simulate CRT tube curvature
- Optional scanline overlay at very low opacity for texture (not readability-impacting)

```css
/* Scanline texture — use sparingly */
.jj-crt-scanlines::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
  z-index: 9998;
}

/* Vignette — CRT edge darkening */
.jj-crt-vignette::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 60%,
    rgba(0, 0, 0, 0.3) 100%
  );
  pointer-events: none;
  z-index: 9997;
}
```

### Future Display Modes (planned)

When implementing switchable display modes, each mode overrides:
- Color palette (CSS custom properties)
- Glow behavior (text-shadow values)
- Background texture (scanlines, ghosting, etc.)
- Transition characteristics

| Mode | Key Visual Traits |
|---|---|
| **STN** | Muted gray-green, low contrast, slight ghosting/trails, no glow |
| **TFT** | Clean, neutral, sharp edges, no glow, modern flat look |
| **PLASMA** | Warm orange/amber, bright emission, high contrast |
| **PROJ** | Projected light feel, slight softness, ambient-dependent |
| **VLM** | Floating/holographic, translucent layers, 3D depth illusion |

---

## 3. THE CHARACTER GRID

### Grid Unit System

Based on the PDF's font metrics (8×14 px character cell), define a grid unit:

```
1 grid unit (1gu) = 8px horizontal, 14px vertical
```

In practice, since we use a webfont (not a custom bitmap font), calibrate the grid to the chosen monospace font's actual character width at the base size. With `IBM Plex Mono` at `13px`, one character is approximately:

```
1 character width  ≈ 7.8px  → round to 8px
1 character height ≈ 13px line × 1.5 line-height = ~20px per line
```

### Grid Rules

1. **All horizontal spacing** should be multiples of 8px (1 character width).
2. **All vertical spacing** should be multiples of the line-height unit (currently ~20px at 13px/1.5).
3. **Container widths** should be expressible as character counts (e.g., 80 columns = 640px, 40 columns = 320px).
4. **Padding and margins** use character-width multiples: 8px, 16px, 24px, 32px...
5. **Border widths** are always 1px or 2px (simulating single/double box-drawing lines).

### Responsive Grid Behavior

The grid can flex by changing the number of columns, never by stretching character cells:
- **Desktop (>960px)**: 3-column layout. Left sidebar ~28 columns, center fluid, right sidebar ~38 columns.
- **Tablet (600-960px)**: 2-column or stacked. Sidebars collapse.
- **Mobile (<600px)**: Single column, full-width. All elements stack.

---

## 4. COLOR PALETTE — COLOR CRT

The Color CRT palette draws from the book's multi-color ASCII art: vivid phosphor colors on a deep black background. Each color represents a different phosphor compound.

### Primary Palette

```css
:root {
  /* --- Backgrounds --- */
  --jj-bg:           #000000;  /* Pure black — CRT off-state / deep background */
  --jj-bg-panel:     #0a0a0a;  /* Barely-there panel backgrounds */
  --jj-bg-elevated:  #111111;  /* Elevated surfaces (titlebars, active states) */

  /* --- Core Brand Colors (existing, preserved) --- */
  --jj-primary:      #e8313a;  /* Red — high-energy phosphor, primary actions, brand */
  --jj-secondary:    #f5d742;  /* Gold/Yellow — secondary info, prices, highlights */
  --jj-accent:       #4aa4e0;  /* Cyan/Blue — links, codes, informational */
  --jj-text:         #d4c9a8;  /* Warm cream — body text, default foreground */

  /* --- Extended CRT Phosphor Colors --- */
  --jj-green:        #33ff33;  /* Green phosphor — success, online, terminal classic */
  --jj-amber:        #ffaa00;  /* Amber — warnings, caution states */
  --jj-magenta:      #e040e0;  /* Magenta phosphor — special/rare indicators */
  --jj-cyan:         #00e5e5;  /* Cyan — cool informational, alt-accent */
  --jj-white:        #e0e0e0;  /* Bright white phosphor — maximum emphasis */

  /* --- Structural Grays --- */
  --jj-border:       #333333;  /* Default borders */
  --jj-border-hover: #555555;  /* Hovered borders */
  --jj-muted:        #666666;  /* Muted text, labels */
  --jj-dim:          #444444;  /* Dim decorative elements */
  --jj-subtle:       #1a1a1a;  /* Subtle dividers, row borders */
}
```

### Color Usage Rules

1. **Background is always near-black.** Never use light backgrounds. The CRT is dark when no phosphor is excited.
2. **Text glows.** Important text gets `text-shadow` matching its color at low opacity. The glow radius and intensity indicate hierarchy.
3. **Color means something.** Each phosphor color has a semantic role:
   - **Red** (`--jj-primary`): Brand identity, primary actions, critical states, active/selected
   - **Gold** (`--jj-secondary`): Prices, values, headings, highlighted information
   - **Cyan/Blue** (`--jj-accent`): Links, codes, reference data, informational
   - **Green** (`--jj-green`): Success, online status, positive conditions, terminal prompts
   - **Amber** (`--jj-amber`): Warnings, limited stock, caution
   - **Magenta** (`--jj-magenta`): Rare items, special editions, unique states
   - **White** (`--jj-white`): Maximum emphasis, selected row text
   - **Cream** (`--jj-text`): Default body text
   - **Grays**: Structure, borders, muted/secondary information
4. **No more than 3 phosphor colors per component.** The CRT palette is vivid; overuse becomes noise.
5. **Glow intensity scales with importance:**
   - Decorative/muted: No glow
   - Body text: No glow (or 1-layer, very subtle)
   - Labels/headings: 1-layer soft glow
   - Interactive/active: 2-layer glow
   - Hero/emphasis: 3-layer glow with wider spread

### Glow Reference

```css
/* Levels of glow intensity */
.glow-subtle  { text-shadow: 0 0 4px currentColor; }
.glow-medium  { text-shadow: 0 0 4px currentColor, 0 0 8px rgba(currentColor, 0.4); }
.glow-strong  { text-shadow: 0 0 4px currentColor, 0 0 8px currentColor, 0 0 16px rgba(currentColor, 0.3); }

/* Color-specific glow examples */
.glow-red     { text-shadow: 0 0 4px #e8313a, 0 0 8px rgba(232, 49, 58, 0.4); }
.glow-gold    { text-shadow: 0 0 4px #f5d742, 0 0 8px rgba(245, 215, 66, 0.4); }
.glow-cyan    { text-shadow: 0 0 4px #4aa4e0, 0 0 8px rgba(74, 164, 224, 0.4); }
.glow-green   { text-shadow: 0 0 4px #33ff33, 0 0 8px rgba(51, 255, 51, 0.4); }

/* Box glow for containers */
.glow-box-red  { box-shadow: 0 0 6px rgba(232, 49, 58, 0.3), 0 0 12px rgba(232, 49, 58, 0.15); }
.glow-box-gold { box-shadow: 0 0 6px rgba(245, 215, 66, 0.3), 0 0 12px rgba(245, 215, 66, 0.15); }
```

---

## 5. TYPOGRAPHY

### Font Stack

```css
/* Primary — all UI, body text, everything */
font-family: 'IBM Plex Mono', 'Consolas', 'Courier New', monospace;

/* Display / Headers — pixel-style for large headings, ASCII art titles */
font-family: 'VT323', 'IBM Plex Mono', monospace;
```

**IBM Plex Mono** is the workhorse. It's monospaced, legible at small sizes, and has the right technical personality. **VT323** is used for large display text where a more overtly terminal/pixel look is desired (hero headings, ASCII art labels).

### Type Scale (Grid-Aligned)

All sizes should produce line-heights that snap to the vertical grid:

| Role | Font | Size | Weight | Line-Height | Usage |
|---|---|---|---|---|---|
| Body | IBM Plex Mono | 13px | 400 | 1.5 (~20px) | Default text, descriptions |
| Small / Labels | IBM Plex Mono | 11px | 400-700 | 1.4 (~16px) | Meta info, labels, status |
| Code / Data | IBM Plex Mono | 12px | 400 | 1.4 (~17px) | Product codes, IDs, technical |
| UI Controls | IBM Plex Mono | 12px | 600-700 | 1 | Buttons, tabs, menu items |
| Section Head | IBM Plex Mono | 11px | 700 | 1 | Section titles, uppercase + letter-spacing |
| H4 | IBM Plex Mono | 13px (1rem) | 400 | 1.2 | Sub-subsection headers |
| H3 | IBM Plex Mono | 14px | 400 | 1.2 | Subsection headers |
| H2 | IBM Plex Mono | 16px | 400 | 1.2 | Section headers |
| H1 | IBM Plex Mono | 20px | 400 | 1.2 | Page titles |
| Display / Hero | VT323 | 24-48px | 400 | 1.1 | Hero text, ASCII art titles |

### Typography Rules

1. **Everything is monospace.** No proportional fonts anywhere. The grid demands it.
2. **Headings are `font-weight: normal`.** The CRT doesn't do bold — it does *color and glow* for emphasis. Use color + glow to create hierarchy, not weight. (Exception: section titles at 11px use 700 for legibility.)
3. **`text-transform: uppercase` + `letter-spacing: 0.5-1px`** for section labels and structural headings. This mimics terminal/system headers.
4. **No decorative fonts.** The only fonts are the monospace stack.
5. **Terminal prompts as UI patterns.** Use `C:\>`, `$`, `>`, `>>` prefixes in section titles, breadcrumbs, and navigation to reinforce the terminal metaphor.
6. **Cursor blink** (`.jj-blink`) should appear on active/focused input fields and as a status indicator. Use `step-end` timing for authentic terminal feel.

---

## 6. BOX-DRAWING & BORDERS (CSS Implementation)

The PDF builds all UI frames from box-drawing characters (`┌─┐│└─┘`, `╔═╗║╚═╝`, etc.). Since we're implementing with CSS for maintainability and responsiveness:

### Border Style System

```css
/* Single-line border — most common, standard panels and cards */
.jj-border-single {
  border: 1px solid var(--jj-border);
}

/* Double-line border — emphasis, important panels, active windows */
.jj-border-double {
  border: 3px double var(--jj-border);
}

/* Thick border — maximum emphasis (hero frames, selected items) */
.jj-border-thick {
  border: 2px solid var(--jj-secondary);
}

/* Dashed border — secondary/informational panels, in-progress states */
.jj-border-dashed {
  border: 1px dashed var(--jj-border);
}
```

### Corner Characters (Decorative Enhancement)

For components where box-drawing authenticity matters, use `::before`/`::after` pseudo-elements or `data-` attributes to render corner glyphs:

```css
/* Corner decoration for important panels */
.jj-box-corners::before {
  content: '┌' attr(data-title) '┐';
  /* positioned as top border text */
}
.jj-box-corners::after {
  content: '└──────────────────┘';
  /* positioned as bottom border */
}
```

Use actual Unicode box-drawing characters in HTML for:
- Section dividers / horizontal rules: `═══════════════════`
- Decorative frames around ASCII art
- Table headers and footers in text-heavy layouts

### Panel/Card Pattern

Every panel or card-like component follows this structure:

```
┌─[ TITLE ]──────────────────┐
│                              │
│  Content area                │
│                              │
└──────────────────────────────┘
```

Implemented as:
1. Container with `border: 1px solid var(--jj-border)`
2. Title bar with darker background (`--jj-bg-panel`), border-bottom, uppercase text
3. Content area with consistent padding (8-10px)
4. On hover: border lightens to `--jj-border-hover`
5. On active/focus: border color changes to a phosphor color

---

## 7. UI COMPONENT PATTERNS

### 7.1 Windows / Panels

Based on the book's "monitor" concept — each panel is a miniature display.

```
┌─[ ■ PANEL TITLE ]──────[ - ][ □ ][ × ]─┐
│                                           │
│  Content                                  │
│                                           │
└───────────────────────────────────────────┘
```

- Titlebar: dark background, colored title text (gold for section titles), window control buttons
- Body: black background, content inside
- Active panel: brighter border color, glow on titlebar
- Inactive panel: dim borders, muted titlebar

### 7.2 Buttons

Buttons look like terminal commands, not modern UI buttons:

```css
.jj-btn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--jj-text);
  background: transparent;
  border: 1px solid var(--jj-border);
  padding: 4px 12px;
  cursor: pointer;
  text-transform: none;
  transition: border-color 0.1s, color 0.1s;
}
.jj-btn:hover {
  border-color: var(--jj-primary);
  color: var(--jj-primary);
  text-shadow: 0 0 4px rgba(232, 49, 58, 0.3);
}
.jj-btn:active {
  background: var(--jj-bg-elevated);
}
```

**Button hierarchy:**
- **Primary action**: Solid border + phosphor color text + glow on hover
- **Secondary action**: Dim border + muted text + highlight on hover
- **Destructive/special**: Colored border matching action (red for delete, green for confirm)
- **Disabled**: Very dim border + dim text, no hover effect

Prefix buttons with terminal symbols when contextual:
- `[ ADD TO CART ]`
- `[ > CHECKOUT ]`
- `[ ? HELP ]`
- `[ × CLOSE ]`

### 7.3 Tables

Tables are a core pattern (product listings). Follow existing patterns:

- Sticky header row with dark background
- Column separators using subtle borders (simulating `│` characters)
- Row selection indicated by left border highlight + color change
- Alternating row shading is NOT used (CRT screens don't shade alternately)
- Sort indicators use ASCII arrows: `▲` `▼` `△` `▽`

### 7.4 Forms & Inputs

Inputs look like terminal input fields:

```css
.jj-input {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  color: var(--jj-text);
  background: var(--jj-bg);
  border: 1px solid var(--jj-border);
  padding: 4px 8px;
  outline: none;
}
.jj-input:focus {
  border-color: var(--jj-primary);
  box-shadow: 0 0 4px rgba(232, 49, 58, 0.2);
}
.jj-input::placeholder {
  color: var(--jj-dim);
}
```

- Labels appear as terminal prompts: `ID:`, `PWD:`, `>` prefixes
- Form groups are framed in single-border panels
- Validation errors use red glow + red border
- Success states use green glow + green border

### 7.5 Navigation

Navigation uses the terminal/file-system metaphor:
- Breadcrumbs as file paths: `C:\> STORE \ VINYL \ JAZZ`
- Category lists as directory listings with `├──` or `>` prefixes
- Active item highlighted with left-border accent (like cursor position)
- The taskbar acts as the OS-level navigation

### 7.6 Modals / Overlays

Modals are "windows" that appear over the main content:
- Same window chrome as panels (titlebar + controls)
- Dark semi-transparent backdrop
- Entry animation: CRT "turn on" effect (brightness flash → settle)
- Exit animation: brightness drop + optional "turn off" horizontal line collapse

### 7.7 Status Indicators

Use block characters and color:
- `█` or `■` filled square — active/full state
- `░` light shade — empty/inactive state
- `▓` medium shade — partial/loading state
- Color encodes meaning per palette rules

Progress bars:
```
LOADING: [████████░░░░░░░░] 47%
```

### 7.8 Tooltips / Popups

Small floating panels with single-line borders. Arrow indicators use ASCII: `▲` `▼` `◄` `►`

---

## 8. ASCII ART INTEGRATION

### Where to Use ASCII Art

1. **Hero sections** — Large ASCII art illustrations as page headers (e.g., the JapanJunky logo rendered in meta-font characters)
2. **Category icons** — Small ASCII art icons for product categories (vinyl record, CD, cassette, etc.)
3. **Section dividers** — Decorative horizontal dividers using repeating ASCII patterns
4. **Empty states** — When no products match a filter, show an ASCII art illustration
5. **Loading states** — ASCII-based loading animations (spinning characters: `|`, `/`, `-`, `\`)
6. **404 / Error pages** — Full ASCII art scene
7. **Product detail accents** — Small decorative ASCII elements around product images

### ASCII Art Rules

1. **Strict monospace grid.** Every character occupies one cell. Use `<pre>` or `white-space: pre` with the monospace font.
2. **Multi-color is encouraged** (Color CRT mode). Use `<span>` tags with color classes to colorize individual characters or regions.
3. **Glow on ASCII art** should be subtle — apply to the container, not individual characters (performance).
4. **Responsive handling**: ASCII art has a fixed character width. On narrow screens, either:
   - Scale down with `font-size` (maintaining grid proportionality)
   - Show a simplified/smaller version
   - Hide and replace with a text label
5. **Keep ASCII art in Liquid snippets** (as the site already does with `snippets/ascii-icon.liquid`) for reusability.

### ASCII Art Color Classes

```css
.ascii-red     { color: var(--jj-primary); }
.ascii-gold    { color: var(--jj-secondary); }
.ascii-cyan    { color: var(--jj-accent); }
.ascii-green   { color: var(--jj-green); }
.ascii-amber   { color: var(--jj-amber); }
.ascii-magenta { color: var(--jj-magenta); }
.ascii-white   { color: var(--jj-white); }
.ascii-dim     { color: var(--jj-muted); }
```

### Meta-Font Pattern

From the PDF's "Meta-Font" concept — build large display letters from smaller ASCII characters. Use this for:
- Page titles on hero sections
- 404 error page numbers
- Special promotional headers

Each large letter is constructed from a grid of smaller characters, creating a recursive typographic effect.

---

## 9. ANIMATION & TRANSITIONS

### Guiding Principle

Animations should feel like CRT display behavior, not modern UI motion design.

### Allowed Animations

| Animation | Usage | Duration | Easing |
|---|---|---|---|
| **Blink** | Cursors, status indicators | 1s | `step-end` |
| **Screen refresh** | Panel/image content changes | 0.3-0.4s | `ease-out` |
| **Text render-in** | New text appearing | 0.2-0.3s | `ease-out` |
| **Brightness flash** | Modal open, state change | 0.15-0.25s | `ease-out` |
| **Glow pulse** | Hover states, notifications | 0.15s | `ease` |
| **Marquee scroll** | Ticker/status bar | 20-30s | `linear` |
| **Character typing** | Progressive text reveal | Per-character | `step-end` |

### Forbidden Animations

- Slide/bounce/elastic motions (not CRT behavior)
- Fade-in with transform (except subtle Y-translate for text render-in)
- Scale/zoom transitions
- Rotation of any kind
- Spring/physics-based easing

### CRT Power-On Effect (for page/modal entry)

```css
@keyframes crt-on {
  0%   { filter: brightness(3) saturate(0); opacity: 0; }
  20%  { filter: brightness(2) saturate(0.3); opacity: 0.5; }
  60%  { filter: brightness(1.3) saturate(0.8); opacity: 0.9; }
  100% { filter: none; opacity: 1; }
}
```

### CRT Power-Off Effect (for page/modal exit)

```css
@keyframes crt-off {
  0%   { filter: none; opacity: 1; transform: scaleY(1); }
  60%  { filter: brightness(2); opacity: 0.8; transform: scaleY(0.01); }
  100% { filter: brightness(0); opacity: 0; transform: scaleY(0); }
}
```

### Reduced Motion

Always respect `prefers-reduced-motion: reduce`. Disable all animations except essential state changes (color transitions are OK).

---

## 10. LAYOUT PATTERNS

### Page Structure

Every page follows the CRT-in-a-window metaphor:

```
┌─────────────────────────────────────────────────┐
│ [Nav Bar — terminal title bar]                   │
├─────────────────────────────────────────────────┤
│ [Store Header — logo + system status]            │
├─────────────────────────────────────────────────┤
│ [Marquee — scrolling status ticker]              │
├──────────┬──────────────────────┬───────────────┤
│ Left     │ Center Content       │ Right         │
│ Sidebar  │ (Product Table /     │ Sidebar       │
│ (Nav/    │  Page Content)       │ (Detail /     │
│  Filter) │                      │  Preview)     │
├──────────┴──────────────────────┴───────────────┤
│ [Taskbar — Start menu + tabs + clock]            │
└─────────────────────────────────────────────────┘
```

### Spacing Scale

Based on 8px horizontal grid unit:

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight: between related inline items |
| `--space-2` | 8px | Standard: padding, gaps |
| `--space-3` | 12px | Comfortable: section internal padding |
| `--space-4` | 16px | Generous: between sections |
| `--space-6` | 24px | Large: major section gaps |
| `--space-8` | 32px | XL: page-level margins |

### Z-Index Scale

```
0     — Background (matrix rain canvas)
1     — Page wrapper, content
10    — Active/selected windows
100   — Sticky headers
1000  — Taskbar
2000  — Start menu, dropdowns
9000  — Overlays/modals
9997  — CRT vignette
9998  — CRT scanlines
9999  — Cursor light
```

---

## 11. IMAGERY & PRODUCT PHOTOS

### Product Images Within the CRT Aesthetic

Product photos are "displayed on the CRT screen." They should feel like they're being rendered by the monitor:

1. **Frame every image** with a single-line border (`1px solid var(--jj-border)`)
2. **Dark background** behind/around images (`#000` or `#1a1a1a`)
3. **On load/change**: Apply the screen-refresh animation (brightness flash → settle)
4. **No rounded corners.** CRT pixels are square. Use `border-radius: 0` everywhere.
5. **Image rendering**: Use `image-rendering: auto` (not pixelated) for product photos. Reserve `image-rendering: pixelated` for actual pixel art or ASCII art rendered as images.

### Product Image Sizes

Keep to grid-friendly dimensions:
- Thumbnail: 80×80px (10×~6 character cells)
- Detail preview: Full sidebar width
- Gallery: Defined by container, maintain aspect ratio

---

## 12. ACCESSIBILITY

The retro aesthetic must not compromise usability:

1. **Contrast ratios**: All text must meet WCAG AA (4.5:1 for body, 3:1 for large text). The bright-on-dark palette naturally achieves this, but test muted/dim text colors carefully.
2. **Glow effects** are decorative — they enhance but must not be required for legibility.
3. **`prefers-reduced-motion`**: Disable all animations. The design should work equally well as a static layout.
4. **`prefers-contrast: more`**: Increase border brightness and text contrast. Remove subtle background differences.
5. **Focus indicators**: Use visible border-color changes (to `--jj-primary`) and/or box-shadow glow. Never rely solely on color.
6. **Screen readers**: ASCII art elements must have `aria-hidden="true"` and meaningful alt text or `aria-label` nearby.
7. **Keyboard navigation**: All interactive elements must be reachable and operable via keyboard. Focus order follows visual layout.

---

## 13. COMPONENT LIBRARY STRUCTURE (for future reuse)

Organize components as Liquid snippets and CSS classes:

```
snippets/
  ascii-frame.liquid       — Reusable box-drawing frame
  ascii-icon.liquid        — ASCII art icon renderer
  ascii-divider.liquid     — Horizontal dividers
  ascii-hero.liquid        — Large ASCII art hero blocks
  crt-panel.liquid         — Standard panel/card with titlebar
  crt-button.liquid        — Button with terminal styling
  crt-input.liquid         — Form input with terminal styling
  crt-progress.liquid      — ASCII progress bar
  crt-status.liquid        — Status indicators (dots, bars)
  crt-modal.liquid         — Modal/dialog window
  crt-table.liquid         — Data table with terminal styling

assets/
  japanjunky-base.css      — Reset, variables, typography, grid
  japanjunky-ascii.css     — ASCII frames, glow effects, art styles
  japanjunky-crt.css       — CRT display simulation (scanlines, vignette, glow)
  japanjunky-components.css — Reusable component patterns
  japanjunky-homepage.css  — Homepage-specific layout
  japanjunky-win95.css     — Taskbar, start menu, window chrome
```

### CSS Class Naming Convention

Prefix: `jj-` (JapanJunky namespace)

Pattern: `jj-[component]__[element]--[modifier]` (BEM-like)

Examples:
- `.jj-panel` — base panel
- `.jj-panel__titlebar` — panel's titlebar element
- `.jj-panel--active` — active state modifier
- `.jj-glow--red` — red glow modifier

---

## 14. DO's AND DON'Ts

### DO

- Use monospace fonts exclusively
- Keep backgrounds dark/black
- Use color + glow for hierarchy instead of font weight/size
- Frame UI elements with borders (single or double line)
- Use terminal metaphors (prompts, file paths, command syntax)
- Snap to the character grid
- Apply subtle CRT effects (glow, scanlines, vignette)
- Use ASCII art for illustrations and icons
- Prefix navigational elements with terminal symbols
- Test contrast ratios — bright on dark is usually fine, but check muted colors
- Use `step-end` easing for blinking/typing effects
- Respect `prefers-reduced-motion`

### DON'T

- Use proportional fonts
- Use light/white backgrounds
- Use rounded corners (`border-radius > 0`)
- Use gradients within text or UI chrome (except titlebar linear-gradient, which simulates selection highlighting)
- Rotate, skew, or scale text
- Use modern UI motion (bounce, spring, elastic)
- Use drop shadows (except color-matched glow)
- Use images/icons where ASCII characters can do the job
- Use more than 3 phosphor colors in a single component
- Add decorative elements that don't serve the CRT/terminal metaphor
- Skip focus states or keyboard accessibility
- Use `opacity` for text hierarchy — use color instead
