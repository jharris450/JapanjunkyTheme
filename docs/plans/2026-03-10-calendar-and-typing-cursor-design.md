# Calendar Popover & Typing Cursor Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

Two features: (1) a Win95-style Date/Time calendar popover triggered by clicking the taskbar clock, displaying Japanese holidays and scheduled product releases with a CRT-styled analog clock; (2) a sequential typing cursor effect in the product detail pane.

---

## Feature 1: Calendar Popover

### Trigger & Interaction
- **Hover** on clock: shows existing date popover (unchanged)
- **Click** on clock: opens calendar popover anchored above the clock, right-aligned to taskbar
- Date popover hides while calendar is open
- Close by clicking outside or clicking clock again

### Layout (~360-400px wide)

| Left Side | Right Side |
|-----------|------------|
| Month/Year selector with `◄`/`►` arrows | Analog clock face (CRT-styled) |
| 7-column day grid (日 月 火 水 木 金 土) | Digital time `HH:MM:SS` below clock |
| Color-coded day numbers | `東京 / JST` label below time |
| `[Today]` button at bottom | |

### Calendar Grid
- Japanese day headers: 日月火水木金土
- Current day: highlighted with border or inverse (black on cream)
- Previous/next month days: dim gray
- Day number colors:
  - **Cream** (default)
  - **Red** = Japanese national holiday
  - **Gold** = scheduled product release
- Hover tooltip on colored dates: holiday name (Japanese + English) or product name + artist

### Analog Clock (CRT-styled)
- Round face, dark background, subtle border glow
- Hour ticks in cream; 12, 3, 6, 9 as numbers
- Hour hand: `var(--jj-red)` with glow
- Minute hand: `var(--jj-gold)` with glow
- Second hand: `var(--jj-cyan)`, thin, with glow
- All hands update live in JST

### Month/Year Navigation
- `◄`/`►` arrows to change month
- Year with clickable arrows to change year
- `[Today]` button snaps back to current date

---

## Feature 2: Taskbar Clock Update

- Display changes from `HH:MM` to `HH:MM 東京`
- Tokyo kanji always visible next to the time

---

## Feature 3: Sequential Typing Cursor

### Behavior
When a product is clicked in the table:
1. **Artist** types out with block cursor `█` following each character → cursor disappears when done
2. **~150ms pause**
3. **Title** types out with `█` cursor → cursor disappears when done
4. **~150ms pause**
5. **Price** types out with `█` cursor → cursor **stays and blinks** at end

### Cursor Details
- Cursor color matches current field: red (artist) → cream (title) → gold (price)
- Blink rate: ~530ms interval, hard on/off (CSS step animation, no fade)
- On new product click mid-sequence: immediately clears all fields and restarts from artist

### Typing Speeds (existing)
- Artist: 24ms/char
- Title: 18ms/char
- Price: 14ms/char

### Fields NOT affected
- Japanese name, JP title, metadata fields, image — keep existing fade/render animations

---

## Feature 4: Data Architecture

### Japanese Holidays (Algorithmic, Client-Side)
Computed in JS for any given month/year. Covers all 16 national holidays:

**Fixed-date (10):**
- Jan 1: New Year's Day (元日)
- Feb 11: National Foundation Day (建国記念の日)
- Feb 23: Emperor's Birthday (天皇誕生日)
- Apr 29: Showa Day (昭和の日)
- May 3: Constitution Memorial Day (憲法記念日)
- May 4: Greenery Day (みどりの日)
- May 5: Children's Day (こどもの日)
- Aug 11: Mountain Day (山の日)
- Nov 3: Culture Day (文化の日)
- Nov 23: Labor Thanksgiving Day (勤労感謝の日)

**Happy Monday (3):**
- 2nd Monday of January: Coming of Age Day (成人の日)
- 3rd Monday of July: Marine Day (海の日)
- 3rd Monday of September: Respect for the Aged Day (敬老の日)

**Equinox (2):**
- Vernal Equinox Day (春分の日) — ~Mar 20-21, astronomical formula
- Autumnal Equinox Day (秋分の日) — ~Sep 22-23, astronomical formula

**Derived rules:**
- Substitute holiday (振替休日): if holiday falls on Sunday, next non-holiday weekday is a holiday
- Sandwiched holiday (国民の休日): a day between two holidays becomes a holiday

Each holiday stored with Japanese name + English name for tooltip display.

### Scheduled Products
- **Metafield:** `custom.release_date` (date type) on products
- **Collection:** "Upcoming Releases" — manually curated in Shopify admin
- **Data delivery:** Liquid renders collection products as JSON embedded in the page at load time
- **Structure:** `[{ date: "2026-03-15", title: "Timely", artist: "Anri" }, ...]`
- No external APIs or runtime fetches needed

### Workflow
Add product → set `custom.release_date` metafield → add to "Upcoming Releases" collection → appears on calendar automatically + available for newsletter content.
