# Calendar Degradation & Year Glitch Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

Degrade the calendar popover's analog clock from a modern SVG to a Casio-inspired segmented compartment layout, add a year glitch effect that ties into the existing retroYear system, and apply subtle terminal refinements to the calendar grid.

---

## Feature 1: Casio-Inspired Clock Panel

### Replaces
Current round SVG clock + single digital time + JST label in the calendar popover's right column.

### Layout — Segmented Compartments
Thin `#333` borders between each compartment:

```
+------------+-------+
|            |  :45  |  seconds (cream, 12px IBM Plex Mono)
|  Analog    +-------+
|  (square)  | TUE   |  day of week (cream, 10px)
|            | 03/10 |  month/day (cream, 10px)
+------------+-------+
|     12 : 30         |  digital time (VT323, ~20px, gold glow)
+---------------------+
|     Tokyo / JST      |  timezone label (#555, 10px)
+---------------------+
```

### Analog Clock (Top-Left, ~90x90px)
- Square face, dark background (`#0a0a0a`), thin `#333` border
- Simple triangle/arrow hands — flat red (hour), flat gold (minute)
- No second hand on analog (seconds displayed digitally in top-right)
- Minimal ticks — short `#555` lines at 12, 3, 6, 9 positions only
- No numbers on the clock face
- No glow, no drop-shadow — clean flat LCD look
- Small cream center dot

### Digital Time (Bottom Compartment)
- VT323 font, ~20px
- `var(--jj-secondary)` gold color with gold text-shadow glow (matching site aesthetic)
- Colon blinks at 1s interval (hard on/off)

### Seconds Sub-Display (Top-Right Upper)
- Prefixed with `:` (e.g., `:45`)
- IBM Plex Mono, 12px, cream color
- Updates every second, no glow

### Date Sub-Display (Top-Right Lower)
- Day of week abbreviated: MON, TUE, WED, etc.
- Date as MM/DD format
- IBM Plex Mono, 10px, cream color

---

## Feature 2: Year Glitch Effect

### Where
The month/year label in the calendar navigation header (e.g., "March 1987").

### Behavior
- Calendar opens showing **retroYear** (random year from page load, matching hover popover)
- Every **5-8 seconds** (random interval), a glitch burst fires:
  1. **~400ms scramble phase** — year digits rapidly cycle through random ASCII glyphs at ~50ms per frame
  2. **~200ms reveal** — real year (e.g., 2026) appears briefly
  3. **~300ms scramble back** — another rapid glyph cycle
  4. **Settles on retroYear** — returns to displaying the retro year
- **Month name unaffected** — only year digits glitch
- Calendar grid always uses **real year** for holiday and release data
- Navigating months keeps retroYear displayed (e.g., "April 1987")
- [Today] returns to current month, still shows retroYear

### Glitch Character Set
`░▒▓█╳¤§#@%&0-9` — block elements, symbols, and numerals for data-corruption aesthetic.

### Performance
- Glitch timer only runs while calendar popover is open
- Timer cleared on close

---

## Feature 3: Calendar Grid Refinements

### Cell Borders
- Faint `#222` borders between day cells (1px grid gap with background color showing through)

### Navigation Buttons
- Change from `◄`/`►`/`«`/`»` to `[<]`/`[>]`/`[<<]`/`[>>]` — bracketed, terminal-style

### Month/Year Label
- Switch to VT323 font to match the digital time in the clock panel

### Click Behavior Fix
- Clicks anywhere inside the calendar popover do NOT close it
- Only close when: clicking outside the popover, or clicking the clock tray text to toggle
- Fix the click propagation bug in the existing JS

---

## Files Affected

| File | Changes |
|------|---------|
| `assets/japanjunky-calendar.js` | Replace SVG clock builder, add Casio compartment HTML, add year glitch system, fix click propagation |
| `assets/japanjunky-calendar.css` | Replace clock styles with compartment layout, add grid cell borders, update nav button styles |
| `assets/japanjunky-win95-menu.js` | Expose retroYear to window so calendar JS can access it |
