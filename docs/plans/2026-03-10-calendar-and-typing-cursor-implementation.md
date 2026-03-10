# Calendar Popover & Typing Cursor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Win95-style calendar popover (with Japanese holidays, product releases, and CRT analog clock) to the taskbar clock, and add a sequential blinking block cursor to the product detail typewriter effect.

**Architecture:** Four new asset files (JS for holidays, JS for calendar, CSS for calendar, CSS for cursor blink animation) plus modifications to existing clock snippet, clock JS, product-select JS, and theme layout. Calendar data for scheduled products is embedded as JSON by Liquid at render time. Japanese holidays computed algorithmically client-side.

**Tech Stack:** Vanilla JS, CSS animations, Liquid (Shopify), SVG (analog clock face)

---

### Task 1: Add Blinking Cursor CSS Animation

**Files:**
- Modify: `assets/japanjunky-homepage.css` (append after line 634)

**Step 1: Add the cursor blink keyframes and class to the homepage CSS**

Append to the end of the render-in effects section in `assets/japanjunky-homepage.css`:

```css
/* ===== TYPING CURSOR ===== */
@keyframes jj-cursor-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.jj-typing-cursor {
  animation: jj-cursor-blink 1.06s step-end infinite;
  font-weight: 400;
}
```

The 1.06s duration gives ~530ms on, ~530ms off. `step-end` ensures hard on/off (no fade).

**Step 2: Commit**

```bash
git add assets/japanjunky-homepage.css
git commit -m "feat: add blinking cursor CSS animation for typewriter effect"
```

---

### Task 2: Refactor Typewriter to Sequential with Block Cursor

**Files:**
- Modify: `assets/japanjunky-product-select.js:30-50` (replace `typeIn` function)
- Modify: `assets/japanjunky-product-select.js:93-96` (replace typeIn calls in click handler)

**Step 1: Replace the `typeIn` function and `pendingTypes` with a sequential typing system**

Replace lines 30-50 in `assets/japanjunky-product-select.js` (from `// Pending typewriter timeouts` through end of `typeIn` function):

```js
  // ─── Sequential Typewriter with Block Cursor ─────────────────
  var typeSequenceTimer = null;
  var typeCursorSpan = null;

  function clearTypeSequence() {
    if (typeSequenceTimer) { clearTimeout(typeSequenceTimer); typeSequenceTimer = null; }
    if (typeCursorSpan && typeCursorSpan.parentNode) { typeCursorSpan.parentNode.removeChild(typeCursorSpan); }
    typeCursorSpan = null;
  }

  function typeField(el, text, msPerChar, cb) {
    if (!el || text == null) { if (cb) cb(); return; }
    var str = String(text);
    el.textContent = '';
    // Create cursor span
    var cursor = document.createElement('span');
    cursor.className = 'jj-typing-cursor';
    cursor.textContent = '\u2588'; // █
    cursor.style.color = 'inherit';
    el.appendChild(cursor);
    typeCursorSpan = cursor;
    var i = 0;
    function tick() {
      if (i < str.length) {
        // Insert character before cursor
        el.insertBefore(document.createTextNode(str[i]), cursor);
        i++;
        typeSequenceTimer = setTimeout(tick, msPerChar);
      } else {
        // Typing done — remove cursor from this field
        if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
        typeCursorSpan = null;
        if (cb) cb();
      }
    }
    tick();
  }

  function typeSequence(fields) {
    // fields: [{ el, text, ms }, ...]
    // Types each field in order, 150ms pause between.
    // Final field keeps blinking cursor.
    clearTypeSequence();
    var idx = 0;
    function next() {
      if (idx >= fields.length) return;
      var f = fields[idx];
      var isLast = idx === fields.length - 1;
      idx++;
      typeField(f.el, f.text, f.ms, function () {
        if (isLast) {
          // Re-append cursor to last field, keep blinking
          var cursor = document.createElement('span');
          cursor.className = 'jj-typing-cursor';
          cursor.textContent = '\u2588';
          cursor.style.color = 'inherit';
          f.el.appendChild(cursor);
          typeCursorSpan = cursor;
        } else {
          typeSequenceTimer = setTimeout(next, 150);
        }
      });
    }
    next();
  }
```

**Step 2: Replace the three `typeIn` calls in the click handler**

Replace lines 93-96 (the three `typeIn` calls) with:

```js
    // Sequential typewriter: Artist → Title → Price (cursor stays on price)
    typeSequence([
      { el: elArtist, text: (artist || vendor).toUpperCase(), ms: 24 },
      { el: elTitle, text: title, ms: 18 },
      { el: elPrice, text: price, ms: 14 }
    ]);
```

**Step 3: Verify no other references to old `typeIn` or `pendingTypes`**

Search the file for `typeIn` and `pendingTypes` — there should be none remaining after this change.

**Step 4: Commit**

```bash
git add assets/japanjunky-product-select.js
git commit -m "feat: sequential typewriter with traveling block cursor"
```

---

### Task 3: Add Tokyo Kanji to Clock Display

**Files:**
- Modify: `assets/japanjunky-win95-menu.js:59` (clock text update)
- Modify: `assets/japanjunky-win95-menu.js:67` (fallback clock text)

**Step 1: Append 東京 to the clock text in both the try and catch blocks**

In `assets/japanjunky-win95-menu.js`, change line 59 from:
```js
        clockEl.textContent = jstString;
```
to:
```js
        clockEl.textContent = jstString + ' \u6771\u4EAC';
```

And change line 67 from:
```js
        clockEl.textContent = h + ':' + m;
```
to:
```js
        clockEl.textContent = h + ':' + m + ' \u6771\u4EAC';
```

(`\u6771\u4EAC` = 東京)

**Step 2: Widen the clock tray to accommodate the extra text**

In `assets/japanjunky-win95.css`, change line 120:
```css
  min-width: 80px;
```
to:
```css
  min-width: 110px;
```

**Step 3: Commit**

```bash
git add assets/japanjunky-win95-menu.js assets/japanjunky-win95.css
git commit -m "feat: add Tokyo kanji to taskbar clock display"
```

---

### Task 4: Create Japanese Holiday Calculator

**Files:**
- Create: `assets/japanjunky-holidays.js`

**Step 1: Create the holiday calculator module**

Create `assets/japanjunky-holidays.js`:

```js
/**
 * Japanjunky - Japanese National Holiday Calculator
 *
 * Computes all Japanese national holidays for a given year.
 * Covers 16 holidays + substitute (振替休日) + sandwiched (国民の休日) rules.
 * Equinox formulas accurate 1980-2099.
 *
 * Usage: window.JJ_Holidays.getHolidays(year)
 *   Returns: { 'YYYY-MM-DD': { ja: '元日', en: 'New Year\'s Day' }, ... }
 *
 * Usage: window.JJ_Holidays.getHolidaysForMonth(year, month)
 *   Returns same format, filtered to given month (0-indexed).
 */
(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function dayOfWeek(y, m, d) { return new Date(y, m, d).getDay(); } // 0=Sun

  // Nth weekday of month (e.g., 2nd Monday: nthWeekday(y, 0, 1, 2))
  function nthWeekday(year, month, weekday, n) {
    var first = new Date(year, month, 1).getDay();
    var day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return day;
  }

  // Vernal equinox (spring) — accurate 1980-2099
  function vernalEquinox(year) {
    if (year <= 1979) return 21; // fallback
    if (year <= 2099) return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    return 21; // fallback
  }

  // Autumnal equinox — accurate 1980-2099
  function autumnalEquinox(year) {
    if (year <= 1979) return 23; // fallback
    if (year <= 2099) return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    return 23; // fallback
  }

  function getHolidays(year) {
    var holidays = {};

    function add(m, d, ja, en) {
      holidays[dateKey(year, m, d)] = { ja: ja, en: en };
    }

    // --- Fixed-date holidays ---
    add(0, 1, '元日', "New Year's Day");
    add(1, 11, '建国記念の日', 'National Foundation Day');
    add(1, 23, '天皇誕生日', "Emperor's Birthday");
    add(3, 29, '昭和の日', 'Showa Day');
    add(4, 3, '憲法記念日', 'Constitution Memorial Day');
    add(4, 4, 'みどりの日', 'Greenery Day');
    add(4, 5, 'こどもの日', "Children's Day");
    add(7, 11, '山の日', 'Mountain Day');
    add(10, 3, '文化の日', 'Culture Day');
    add(10, 23, '勤労感謝の日', 'Labor Thanksgiving Day');

    // --- Happy Monday holidays ---
    add(0, nthWeekday(year, 0, 1, 2), '成人の日', 'Coming of Age Day');
    add(6, nthWeekday(year, 6, 1, 3), '海の日', 'Marine Day');
    add(8, nthWeekday(year, 8, 1, 3), '敬老の日', 'Respect for the Aged Day');

    // --- Equinox holidays ---
    add(2, vernalEquinox(year), '春分の日', 'Vernal Equinox Day');
    add(8, autumnalEquinox(year), '秋分の日', 'Autumnal Equinox Day');

    // --- Substitute holidays (振替休日) ---
    // If a holiday falls on Sunday, next Monday (or next non-holiday weekday) is substitute
    var keys = Object.keys(holidays);
    keys.forEach(function (key) {
      var parts = key.split('-');
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      if (dayOfWeek(y, m, d) === 0) { // Sunday
        var subDay = d + 1;
        var subKey = dateKey(y, m, subDay);
        while (holidays[subKey]) {
          subDay++;
          subKey = dateKey(y, m, subDay);
        }
        holidays[subKey] = { ja: '振替休日', en: 'Substitute Holiday' };
      }
    });

    // --- Sandwiched holidays (国民の休日) ---
    // A non-holiday weekday sandwiched between two holidays becomes a holiday
    var allKeys = Object.keys(holidays).sort();
    for (var i = 0; i < allKeys.length - 1; i++) {
      var d1 = new Date(allKeys[i] + 'T00:00:00');
      var d2 = new Date(d1);
      d2.setDate(d2.getDate() + 2);
      var midDate = new Date(d1);
      midDate.setDate(midDate.getDate() + 1);
      var midKey = midDate.getFullYear() + '-' + pad(midDate.getMonth() + 1) + '-' + pad(midDate.getDate());
      var d2Key = d2.getFullYear() + '-' + pad(d2.getMonth() + 1) + '-' + pad(d2.getDate());
      if (!holidays[midKey] && holidays[d2Key] && midDate.getDay() !== 0) {
        holidays[midKey] = { ja: '国民の休日', en: 'Citizens\' Holiday' };
      }
    }

    return holidays;
  }

  function getHolidaysForMonth(year, month) {
    var all = getHolidays(year);
    var prefix = year + '-' + pad(month + 1) + '-';
    var result = {};
    Object.keys(all).forEach(function (key) {
      if (key.indexOf(prefix) === 0) result[key] = all[key];
    });
    return result;
  }

  window.JJ_Holidays = {
    getHolidays: getHolidays,
    getHolidaysForMonth: getHolidaysForMonth
  };
})();
```

**Step 2: Commit**

```bash
git add assets/japanjunky-holidays.js
git commit -m "feat: add Japanese national holiday calculator"
```

---

### Task 5: Add Upcoming Releases Liquid Data + Collection Setup

**Files:**
- Modify: `snippets/win95-clock.liquid` (add Liquid JSON output for upcoming releases)
- Modify: `sections/jj-footer-win95.liquid` (no schema change needed yet — collection accessed via global handle)

**Step 1: Add release data JSON to the clock snippet**

Replace the entire contents of `snippets/win95-clock.liquid` with:

```liquid
{%- comment -%}
  JST clock display for the Win95 taskbar tray.
  Time is updated by japanjunky-win95-menu.js
  Hover clock to show date popover.
  Click clock to open calendar popover.
{%- endcomment -%}

{%- comment -%} Gather upcoming releases for calendar {%- endcomment -%}
{%- assign upcoming_collection = collections['upcoming-releases'] -%}
<script id="jj-upcoming-releases-data" type="application/json">
[
  {%- if upcoming_collection -%}
    {%- for product in upcoming_collection.products limit: 50 -%}
      {%- assign release_date = product.metafields.custom.release_date -%}
      {%- if release_date != blank -%}
        {%- unless forloop.first -%},{%- endunless -%}
        {
          "date": {{ release_date | json }},
          "title": {{ product.title | json }},
          "artist": {{ product.metafields.custom.artist | default: product.vendor | json }}
        }
      {%- endif -%}
    {%- endfor -%}
  {%- endif -%}
]
</script>

<div class="jj-clock-tray" id="jj-clock-tray">
  <span class="jj-clock-tray__time" id="jj-clock">--:--</span>
  <div class="jj-clock-popover" id="jj-clock-popover">
    <div class="jj-clock-popover__date" id="jj-popover-date">--/--/----</div>
  </div>
  <div class="jj-calendar-popover" id="jj-calendar-popover"></div>
</div>
```

**Step 2: Commit**

```bash
git add snippets/win95-clock.liquid
git commit -m "feat: add upcoming releases JSON data and calendar popover container"
```

---

### Task 6: Create Calendar Popover CSS

**Files:**
- Create: `assets/japanjunky-calendar.css`

**Step 1: Create the calendar CSS file**

Create `assets/japanjunky-calendar.css`:

```css
/* ============================================
   JAPANJUNKY CALENDAR POPOVER
   Win95-style Date/Time Properties (CRT theme)
   ============================================ */

/* --- Popover Container --- */
.jj-calendar-popover {
  display: none;
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background: #0a0a0a;
  border: 1px solid #444;
  z-index: 2001;
  font-family: 'IBM Plex Mono', monospace;
  padding: 10px;
  width: 380px;
}

.jj-calendar-popover--open {
  display: flex;
  gap: 10px;
}

/* --- Left Column: Calendar --- */
.jj-cal-left {
  flex: 1;
  min-width: 0;
}

/* Month/Year Navigation */
.jj-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 4px;
}

.jj-cal-nav__btn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: #888;
  background: transparent;
  border: 1px solid #333;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  padding: 0;
  line-height: 1;
}
.jj-cal-nav__btn:hover {
  color: var(--jj-text);
  border-color: #666;
}

.jj-cal-nav__label {
  font-size: 11px;
  color: var(--jj-text);
  text-align: center;
  flex: 1;
  white-space: nowrap;
}

/* Day Grid */
.jj-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1;
}

.jj-cal-grid__header {
  color: #555;
  font-size: 10px;
  padding: 2px 0 4px;
  font-weight: 700;
}
.jj-cal-grid__header--sun {
  color: var(--jj-primary);
}

.jj-cal-grid__day {
  padding: 3px 0;
  color: var(--jj-text, #d4c9a8);
  cursor: default;
  position: relative;
}

.jj-cal-grid__day--outside {
  color: #333;
}

.jj-cal-grid__day--today {
  outline: 1px solid var(--jj-text);
  background: #111;
}

.jj-cal-grid__day--holiday {
  color: var(--jj-primary);
}

.jj-cal-grid__day--release {
  color: var(--jj-secondary);
}

/* Holiday takes precedence in color, but release dot could show */
.jj-cal-grid__day--holiday.jj-cal-grid__day--release {
  color: var(--jj-primary);
  text-decoration: underline;
  text-decoration-color: var(--jj-secondary);
  text-underline-offset: 2px;
}

/* Tooltip */
.jj-cal-grid__day[title]:hover {
  text-shadow: 0 0 6px currentColor;
}

/* Today Button */
.jj-cal-today-btn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #888;
  background: transparent;
  border: 1px solid #333;
  padding: 2px 8px;
  margin-top: 6px;
  cursor: default;
  display: block;
  width: 100%;
  text-align: center;
}
.jj-cal-today-btn:hover {
  color: var(--jj-text);
  border-color: #666;
}

/* --- Right Column: Analog Clock --- */
.jj-cal-right {
  width: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Clock Face SVG Container */
.jj-cal-clock {
  width: 130px;
  height: 130px;
  position: relative;
}

.jj-cal-clock svg {
  width: 100%;
  height: 100%;
}

/* Digital Time */
.jj-cal-digital {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  color: var(--jj-text);
  text-align: center;
  letter-spacing: 1px;
}

/* JST Label */
.jj-cal-tz-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #555;
  text-align: center;
}
```

**Step 2: Add CSS to theme layout**

In `layout/theme.liquid`, after line 32 (`{{ 'japanjunky-homepage.css' | asset_url | stylesheet_tag }}`), add:

```liquid
  {{ 'japanjunky-calendar.css' | asset_url | stylesheet_tag }}
```

**Step 3: Commit**

```bash
git add assets/japanjunky-calendar.css layout/theme.liquid
git commit -m "feat: add calendar popover CSS with CRT styling"
```

---

### Task 7: Create Calendar Popover JS

**Files:**
- Create: `assets/japanjunky-calendar.js`

**Step 1: Create the calendar popover JS**

Create `assets/japanjunky-calendar.js`:

```js
/**
 * Japanjunky - Calendar Popover
 *
 * Win95-style Date/Time popover anchored to taskbar clock.
 * Shows calendar with Japanese holidays + scheduled product releases.
 * CRT-styled analog clock with live JST hands.
 *
 * Depends on: JJ_Holidays (japanjunky-holidays.js)
 */
(function () {
  'use strict';

  var clockTray = document.getElementById('jj-clock-tray');
  var calPopover = document.getElementById('jj-calendar-popover');
  var datePopover = document.getElementById('jj-clock-popover');
  if (!clockTray || !calPopover) return;

  // ─── Load Upcoming Releases ───────────────────────────────
  var releases = [];
  try {
    var dataEl = document.getElementById('jj-upcoming-releases-data');
    if (dataEl) releases = JSON.parse(dataEl.textContent);
  } catch (e) { /* no data */ }

  // Index releases by date string
  var releasesByDate = {};
  releases.forEach(function (r) {
    if (!r.date) return;
    if (!releasesByDate[r.date]) releasesByDate[r.date] = [];
    releasesByDate[r.date].push(r);
  });

  // ─── State ────────────────────────────────────────────────
  var isOpen = false;
  var viewYear, viewMonth; // 0-indexed month
  var clockInterval = null;

  function getJSTNow() {
    var now = new Date();
    try {
      // Get JST components
      var s = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour12: false });
      var parts = s.split(/[\/,\s:]+/);
      return {
        year: parseInt(parts[2], 10),
        month: parseInt(parts[0], 10) - 1,
        day: parseInt(parts[1], 10),
        hours: parseInt(parts[3], 10),
        minutes: parseInt(parts[4], 10),
        seconds: parseInt(parts[5], 10)
      };
    } catch (e) {
      var utc = now.getTime() + now.getTimezoneOffset() * 60000;
      var jst = new Date(utc + 9 * 3600000);
      return {
        year: jst.getFullYear(),
        month: jst.getMonth(),
        day: jst.getDate(),
        hours: jst.getHours(),
        minutes: jst.getMinutes(),
        seconds: jst.getSeconds()
      };
    }
  }

  // ─── Render Calendar Grid ─────────────────────────────────
  function renderCalendar() {
    var jst = getJSTNow();
    var todayKey = jst.year + '-' + pad(jst.month + 1) + '-' + pad(jst.day);

    var holidays = window.JJ_Holidays ? window.JJ_Holidays.getHolidaysForMonth(viewYear, viewMonth) : {};

    // First day of month and days in month
    var firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    // Month names in English
    var monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

    var html = '';

    // ── Left column: calendar ──
    html += '<div class="jj-cal-left">';

    // Navigation
    html += '<div class="jj-cal-nav">';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-prev-year" title="Previous year">\u00AB</button>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-prev-month" title="Previous month">\u25C4</button>';
    html += '<span class="jj-cal-nav__label">' + monthNames[viewMonth] + ' ' + viewYear + '</span>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-next-month" title="Next month">\u25BA</button>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-next-year" title="Next year">\u00BB</button>';
    html += '</div>';

    // Day headers
    html += '<div class="jj-cal-grid">';
    var dayHeaders = ['\u65E5','\u6708','\u706B','\u6C34','\u6728','\u91D1','\u571F'];
    dayHeaders.forEach(function (d, i) {
      var cls = 'jj-cal-grid__header';
      if (i === 0) cls += ' jj-cal-grid__header--sun';
      html += '<div class="' + cls + '">' + d + '</div>';
    });

    // Previous month trailing days
    for (var p = firstDay - 1; p >= 0; p--) {
      var pDay = daysInPrev - p;
      html += '<div class="jj-cal-grid__day jj-cal-grid__day--outside">' + pDay + '</div>';
    }

    // Current month days
    for (var d = 1; d <= daysInMonth; d++) {
      var key = dateKey(viewYear, viewMonth, d);
      var classes = ['jj-cal-grid__day'];
      var titleParts = [];

      if (key === todayKey) classes.push('jj-cal-grid__day--today');

      var holiday = holidays[key];
      if (holiday) {
        classes.push('jj-cal-grid__day--holiday');
        titleParts.push(holiday.ja + ' / ' + holiday.en);
      }

      var dayReleases = releasesByDate[key];
      if (dayReleases) {
        classes.push('jj-cal-grid__day--release');
        dayReleases.forEach(function (r) {
          titleParts.push(r.artist + ' - ' + r.title);
        });
      }

      var titleAttr = titleParts.length ? ' title="' + escapeAttr(titleParts.join('\n')) + '"' : '';
      html += '<div class="' + classes.join(' ') + '"' + titleAttr + '>' + d + '</div>';
    }

    // Next month leading days (fill to 6 rows = 42 cells)
    var totalCells = firstDay + daysInMonth;
    var remaining = (totalCells <= 35 ? 35 : 42) - totalCells;
    for (var n = 1; n <= remaining; n++) {
      html += '<div class="jj-cal-grid__day jj-cal-grid__day--outside">' + n + '</div>';
    }

    html += '</div>'; // end grid

    // Today button
    html += '<button class="jj-cal-today-btn" id="jj-cal-today">[Today]</button>';
    html += '</div>'; // end left

    // ── Right column: analog clock ──
    html += '<div class="jj-cal-right">';
    html += '<div class="jj-cal-clock" id="jj-cal-clock-face">';
    html += buildClockSVG();
    html += '</div>';
    html += '<div class="jj-cal-digital" id="jj-cal-digital">--:--:--</div>';
    html += '<div class="jj-cal-tz-label">\u6771\u4EAC / JST</div>';
    html += '</div>'; // end right

    calPopover.innerHTML = html;

    // Bind nav buttons
    var prevYear = document.getElementById('jj-cal-prev-year');
    var prevMonth = document.getElementById('jj-cal-prev-month');
    var nextMonth = document.getElementById('jj-cal-next-month');
    var nextYear = document.getElementById('jj-cal-next-year');
    var todayBtn = document.getElementById('jj-cal-today');

    if (prevYear) prevYear.addEventListener('click', function (e) { e.stopPropagation(); viewYear--; renderCalendar(); });
    if (prevMonth) prevMonth.addEventListener('click', function (e) { e.stopPropagation(); viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
    if (nextMonth) nextMonth.addEventListener('click', function (e) { e.stopPropagation(); viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });
    if (nextYear) nextYear.addEventListener('click', function (e) { e.stopPropagation(); viewYear++; renderCalendar(); });
    if (todayBtn) todayBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var now = getJSTNow();
      viewYear = now.year; viewMonth = now.month;
      renderCalendar();
    });

    // Start clock updates
    updateClockHands();
  }

  // ─── Analog Clock SVG ─────────────────────────────────────
  function buildClockSVG() {
    var svg = '<svg viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">';

    // Face background
    svg += '<circle cx="65" cy="65" r="62" fill="#0a0a0a" stroke="#444" stroke-width="1"/>';

    // Glow ring
    svg += '<circle cx="65" cy="65" r="60" fill="none" stroke="#222" stroke-width="0.5"/>';

    // Hour ticks
    for (var i = 0; i < 12; i++) {
      var angle = (i * 30) * Math.PI / 180;
      var isCardinal = i % 3 === 0;
      var outerR = 56;
      var innerR = isCardinal ? 48 : 51;
      var x1 = 65 + outerR * Math.sin(angle);
      var y1 = 65 - outerR * Math.cos(angle);
      var x2 = 65 + innerR * Math.sin(angle);
      var y2 = 65 - innerR * Math.cos(angle);
      var sw = isCardinal ? 2 : 1;
      svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#d4c9a8" stroke-width="' + sw + '"/>';
    }

    // Cardinal numbers
    var nums = [{ n: '12', x: 65, y: 20 }, { n: '3', x: 110, y: 69 }, { n: '6', x: 65, y: 118 }, { n: '9', x: 20, y: 69 }];
    nums.forEach(function (nm) {
      svg += '<text x="' + nm.x + '" y="' + nm.y + '" text-anchor="middle" fill="#d4c9a8" font-family="IBM Plex Mono, monospace" font-size="10">' + nm.n + '</text>';
    });

    // Clock hands (positioned by JS)
    svg += '<line id="jj-cal-hand-hour" x1="65" y1="65" x2="65" y2="32" stroke="var(--jj-primary, #e8313a)" stroke-width="3" stroke-linecap="round" style="filter: drop-shadow(0 0 3px rgba(232,49,58,0.6))"/>';
    svg += '<line id="jj-cal-hand-min" x1="65" y1="65" x2="65" y2="22" stroke="var(--jj-secondary, #f5d742)" stroke-width="2" stroke-linecap="round" style="filter: drop-shadow(0 0 3px rgba(245,215,66,0.6))"/>';
    svg += '<line id="jj-cal-hand-sec" x1="65" y1="65" x2="65" y2="18" stroke="var(--jj-accent, #00e5ff)" stroke-width="1" stroke-linecap="round" style="filter: drop-shadow(0 0 3px rgba(0,229,255,0.6))"/>';

    // Center dot
    svg += '<circle cx="65" cy="65" r="3" fill="#d4c9a8"/>';

    svg += '</svg>';
    return svg;
  }

  function updateClockHands() {
    var jst = getJSTNow();
    var h = jst.hours % 12;
    var m = jst.minutes;
    var s = jst.seconds;

    var hourAngle = (h + m / 60) * 30; // 360/12 = 30 deg per hour
    var minAngle = (m + s / 60) * 6;   // 360/60 = 6 deg per min
    var secAngle = s * 6;

    setHandAngle('jj-cal-hand-hour', hourAngle, 33);
    setHandAngle('jj-cal-hand-min', minAngle, 43);
    setHandAngle('jj-cal-hand-sec', secAngle, 47);

    // Update digital display
    var digitalEl = document.getElementById('jj-cal-digital');
    if (digitalEl) {
      digitalEl.textContent = pad(jst.hours) + ':' + pad(m) + ':' + pad(s);
    }
  }

  function setHandAngle(id, angleDeg, length) {
    var hand = document.getElementById(id);
    if (!hand) return;
    var rad = (angleDeg - 90) * Math.PI / 180;
    // Small tail behind center
    var tailLen = 8;
    var x1 = 65 - tailLen * Math.cos(rad);
    var y1 = 65 - tailLen * Math.sin(rad);
    var x2 = 65 + length * Math.cos(rad);
    var y2 = 65 + length * Math.sin(rad);
    hand.setAttribute('x1', x1);
    hand.setAttribute('y1', y1);
    hand.setAttribute('x2', x2);
    hand.setAttribute('y2', y2);
  }

  // ─── Helpers ──────────────────────────────────────────────
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function escapeAttr(str) { return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ─── Toggle Logic ─────────────────────────────────────────
  clockTray.addEventListener('click', function (e) {
    e.stopPropagation();

    if (isOpen) {
      close();
    } else {
      open();
    }
  });

  function open() {
    // Hide date popover while calendar is open
    if (datePopover) datePopover.style.display = 'none';

    var jst = getJSTNow();
    viewYear = jst.year;
    viewMonth = jst.month;

    renderCalendar();
    calPopover.classList.add('jj-calendar-popover--open');
    isOpen = true;

    // Tick clock every second
    clockInterval = setInterval(updateClockHands, 1000);
  }

  function close() {
    calPopover.classList.remove('jj-calendar-popover--open');
    calPopover.innerHTML = '';
    isOpen = false;
    if (datePopover) datePopover.style.display = '';
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (isOpen && !calPopover.contains(e.target)) {
      close();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  // Prevent hover popover when calendar is open
  clockTray.addEventListener('mouseenter', function () {
    if (isOpen && datePopover) datePopover.style.display = 'none';
  });
})();
```

**Step 2: Add JS to theme layout**

In `layout/theme.liquid`, after line 144 (`{{ 'japanjunky-win95-menu.js' | asset_url | script_tag }}`... actually it uses `defer`), add the two new script tags. After the existing `japanjunky-win95-menu.js` line, add:

```liquid
  <script src="{{ 'japanjunky-holidays.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-calendar.js' | asset_url }}" defer></script>
```

Note: `japanjunky-holidays.js` must load before `japanjunky-calendar.js` since the calendar depends on it.

**Step 3: Commit**

```bash
git add assets/japanjunky-calendar.js layout/theme.liquid
git commit -m "feat: add calendar popover JS with analog clock and holiday/release display"
```

---

### Task 8: Prevent Hover Popover Conflict with Click Calendar

**Files:**
- Modify: `assets/japanjunky-win95.css:298-301` (clock popover hover rule)

**Step 1: Update the hover rule so it doesn't show when calendar is open**

In `assets/japanjunky-win95.css`, replace lines 298-301:

```css
.jj-clock-popover--open,
.jj-clock-tray:hover .jj-clock-popover {
  display: block;
}
```

with:

```css
.jj-clock-popover--open,
.jj-clock-tray:hover .jj-clock-popover {
  display: block;
}
.jj-clock-tray:hover .jj-calendar-popover--open ~ .jj-clock-popover,
.jj-calendar-popover--open + .jj-clock-popover {
  display: none;
}
```

Wait — the calendar popover is a sibling of the date popover inside `.jj-clock-tray`. The JS already handles hiding via `datePopover.style.display = 'none'` in the open/close functions, but the CSS `:hover` rule would override the inline style. We need a CSS class approach instead.

Replace the entire block at lines 298-301 with:

```css
.jj-clock-popover--open,
.jj-clock-tray:not(.jj-calendar-open):hover .jj-clock-popover {
  display: block;
}
```

Then in the calendar JS `open()` function, add `clockTray.classList.add('jj-calendar-open');` and in `close()`, add `clockTray.classList.remove('jj-calendar-open');`.

**Step 2: Update calendar JS open/close to toggle the class**

In `assets/japanjunky-calendar.js`, in the `open()` function, after the first line add:
```js
    clockTray.classList.add('jj-calendar-open');
```

In the `close()` function, after the first line add:
```js
    clockTray.classList.remove('jj-calendar-open');
```

**Step 3: Commit**

```bash
git add assets/japanjunky-win95.css assets/japanjunky-calendar.js
git commit -m "fix: prevent date hover popover from showing when calendar is open"
```

---

### Task 9: Visual Testing & Polish

**Step 1: Open the Shopify theme preview and test these scenarios:**

- [ ] Clock displays `HH:MM 東京` in the taskbar
- [ ] Hovering the clock shows the date popover
- [ ] Clicking the clock opens the calendar popover, date popover hides
- [ ] Calendar shows current month with Japanese day headers (日月火水木金土)
- [ ] Today's date has a border/highlight
- [ ] Navigate months with ◄/► arrows, years with «/»
- [ ] [Today] button returns to current month
- [ ] Japanese holidays show in red (check January for 元日 and 成人の日)
- [ ] Analog clock hands move every second, colors: red hour, gold minute, cyan second
- [ ] Digital time shows below clock with seconds
- [ ] 東京 / JST label shows below digital time
- [ ] Clicking outside the calendar closes it
- [ ] Pressing Escape closes the calendar
- [ ] After closing, hovering clock shows date popover again

- [ ] Click a product row — Artist types first with █ cursor, then Title, then Price
- [ ] Cursor color matches field: red for artist, cream for title, gold for price
- [ ] After Price finishes, cursor stays blinking on price
- [ ] Click another product mid-typing — sequence restarts cleanly

**Step 2: Fix any issues found during testing**

**Step 3: Final commit**

```bash
git add -A
git commit -m "polish: calendar popover and typing cursor refinements"
```

---

### Summary of All Files

| Action | File |
|--------|------|
| Modify | `assets/japanjunky-homepage.css` (cursor blink animation) |
| Modify | `assets/japanjunky-product-select.js` (sequential typewriter) |
| Modify | `assets/japanjunky-win95-menu.js` (東京 in clock) |
| Modify | `assets/japanjunky-win95.css` (clock width + hover fix) |
| Modify | `snippets/win95-clock.liquid` (releases JSON + calendar container) |
| Modify | `layout/theme.liquid` (load new CSS + JS) |
| Create | `assets/japanjunky-holidays.js` (holiday calculator) |
| Create | `assets/japanjunky-calendar.js` (calendar popover) |
| Create | `assets/japanjunky-calendar.css` (calendar styles) |
