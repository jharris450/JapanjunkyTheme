/**
 * Japanjunky - Calendar Popover
 *
 * Win95-style Date/Time popover anchored to taskbar clock.
 * Shows calendar with Japanese holidays + scheduled product releases.
 * Casio-inspired analog clock panel with segmented compartments.
 * Year glitch effect using retroYear from win95-menu.
 *
 * Depends on: JJ_Holidays (japanjunky-holidays.js), JJ_RetroYear (japanjunky-win95-menu.js)
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

  var releasesByDate = {};
  releases.forEach(function (r) {
    if (!r.date) return;
    if (!releasesByDate[r.date]) releasesByDate[r.date] = [];
    releasesByDate[r.date].push(r);
  });

  // ─── State ────────────────────────────────────────────────
  var isOpen = false;
  var viewYear, viewMonth; // real year, 0-indexed month
  var clockInterval = null;
  var glitchTimeout = null;
  var glitchFrameInterval = null;

  // Retro year from win95-menu.js (corrupted system clock)
  function getRetroYear() {
    return window.JJ_RetroYear || 1987;
  }

  function getJSTNow() {
    var now = new Date();
    try {
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
        year: jst.getFullYear(), month: jst.getMonth(), day: jst.getDate(),
        hours: jst.getHours(), minutes: jst.getMinutes(), seconds: jst.getSeconds()
      };
    }
  }

  // ─── Year Glitch System ───────────────────────────────────
  var GLITCH_CHARS = '\u2591\u2592\u2593\u2588\u2573\u00A4\u00A7#@%&0123456789';

  function scheduleGlitch() {
    var delay = 5000 + Math.random() * 3000; // 5-8 seconds
    glitchTimeout = setTimeout(runGlitch, delay);
  }

  function runGlitch() {
    var labelEl = document.getElementById('jj-cal-year-text');
    if (!labelEl || !isOpen) return;

    var realYear = String(viewYear);
    var retroYearStr = String(getRetroYear());
    var frame = 0;
    var totalFrames = 8; // ~400ms at 50ms/frame for scramble
    var phase = 'scramble1'; // scramble1 -> reveal -> scramble2 -> settle

    glitchFrameInterval = setInterval(function () {
      if (!labelEl || !isOpen) {
        clearInterval(glitchFrameInterval);
        glitchFrameInterval = null;
        return;
      }

      if (phase === 'scramble1') {
        // Random glyph scramble
        var glitched = '';
        for (var i = 0; i < 4; i++) {
          glitched += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
        labelEl.textContent = glitched;
        frame++;
        if (frame >= totalFrames) { phase = 'reveal'; frame = 0; }
      } else if (phase === 'reveal') {
        // Flash real year
        labelEl.textContent = realYear;
        frame++;
        if (frame >= 4) { phase = 'scramble2'; frame = 0; } // ~200ms
      } else if (phase === 'scramble2') {
        var glitched2 = '';
        for (var j = 0; j < 4; j++) {
          glitched2 += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
        labelEl.textContent = glitched2;
        frame++;
        if (frame >= 6) { phase = 'settle'; } // ~300ms
      } else {
        // Settle back to retro year
        labelEl.textContent = retroYearStr;
        clearInterval(glitchFrameInterval);
        glitchFrameInterval = null;
        scheduleGlitch();
      }
    }, 50);
  }

  function stopGlitch() {
    if (glitchTimeout) { clearTimeout(glitchTimeout); glitchTimeout = null; }
    if (glitchFrameInterval) { clearInterval(glitchFrameInterval); glitchFrameInterval = null; }
  }

  // ─── Render Calendar Grid ─────────────────────────────────
  function renderCalendar() {
    var jst = getJSTNow();
    var todayKey = jst.year + '-' + pad(jst.month + 1) + '-' + pad(jst.day);

    var holidays = window.JJ_Holidays ? window.JJ_Holidays.getHolidaysForMonth(viewYear, viewMonth) : {};

    var firstDay = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    var monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

    var displayYear = getRetroYear();
    var html = '';

    // ── Left column: calendar ──
    html += '<div class="jj-cal-left">';

    // Navigation
    html += '<div class="jj-cal-nav">';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-prev-year" title="Previous year">[&lt;&lt;]</button>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-prev-month" title="Previous month">[&lt;]</button>';
    html += '<span class="jj-cal-nav__label">' + monthNames[viewMonth] + ' <span id="jj-cal-year-text">' + displayYear + '</span></span>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-next-month" title="Next month">[&gt;]</button>';
    html += '<button class="jj-cal-nav__btn" id="jj-cal-next-year" title="Next year">[&gt;&gt;]</button>';
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
      html += '<div class="jj-cal-grid__day jj-cal-grid__day--outside">' + (daysInPrev - p) + '</div>';
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

    // Next month fill
    var totalCells = firstDay + daysInMonth;
    var remaining = (totalCells <= 35 ? 35 : 42) - totalCells;
    for (var n = 1; n <= remaining; n++) {
      html += '<div class="jj-cal-grid__day jj-cal-grid__day--outside">' + n + '</div>';
    }

    html += '</div>'; // end grid
    html += '<button class="jj-cal-today-btn" id="jj-cal-today">[Today]</button>';
    html += '</div>'; // end left

    // ── Right column: Casio clock panel ──
    html += '<div class="jj-cal-right">';

    // Top row: analog + sub-displays
    html += '<div class="jj-cal-clock-top">';

    // Analog face
    html += '<div class="jj-cal-analog" id="jj-cal-clock-face">';
    html += buildSquareClockSVG();
    html += '</div>';

    // Sub-displays
    html += '<div class="jj-cal-subdisplay">';
    html += '<div class="jj-cal-seconds" id="jj-cal-seconds">:--</div>';
    html += '<div class="jj-cal-date-sub" id="jj-cal-date-sub"><span>---</span><span>--/--</span></div>';
    html += '</div>';

    html += '</div>'; // end clock-top

    // Digital time
    html += '<div class="jj-cal-digital" id="jj-cal-digital">--<span class="jj-cal-digital__colon">:</span>--</div>';

    // TZ label
    html += '<div class="jj-cal-tz-label">\u6771\u4EAC / JST</div>';

    html += '</div>'; // end right

    calPopover.innerHTML = html;

    // ── Bind nav buttons ──
    bindNavButton('jj-cal-prev-year', function () { viewYear--; });
    bindNavButton('jj-cal-prev-month', function () { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } });
    bindNavButton('jj-cal-next-month', function () { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } });
    bindNavButton('jj-cal-next-year', function () { viewYear++; });
    bindNavButton('jj-cal-today', function () { var now = getJSTNow(); viewYear = now.year; viewMonth = now.month; });

    updateClockPanel();

    // Start glitch cycle
    stopGlitch();
    scheduleGlitch();
  }

  function bindNavButton(id, action) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) {
      e.stopPropagation();
      action();
      renderCalendar();
    });
  }

  // ─── Square Analog Clock SVG (Casio style) ────────────────
  function buildSquareClockSVG() {
    var s = 90; // viewBox size matches container
    var cx = s / 2, cy = s / 2;
    var svg = '<svg viewBox="0 0 ' + s + ' ' + s + '" xmlns="http://www.w3.org/2000/svg">';

    // Dark background (square, no circle)
    svg += '<rect width="' + s + '" height="' + s + '" fill="#0a0a0a"/>';

    // Tick marks at 12, 3, 6, 9 only
    var ticks = [
      { x1: cx, y1: 6, x2: cx, y2: 14 },       // 12
      { x1: s - 6, y1: cy, x2: s - 14, y2: cy },// 3
      { x1: cx, y1: s - 6, x2: cx, y2: s - 14 },// 6
      { x1: 6, y1: cy, x2: 14, y2: cy }          // 9
    ];
    ticks.forEach(function (t) {
      svg += '<line x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 + '" stroke="#555" stroke-width="1.5"/>';
    });

    // Hour hand (red, flat triangle/arrow)
    svg += '<line id="jj-cal-hand-hour" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="18" stroke="var(--jj-primary, #e8313a)" stroke-width="2.5" stroke-linecap="butt"/>';

    // Minute hand (gold, flat)
    svg += '<line id="jj-cal-hand-min" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="10" stroke="var(--jj-secondary, #f5d742)" stroke-width="1.5" stroke-linecap="butt"/>';

    // Center dot
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="#d4c9a8"/>';

    svg += '</svg>';
    return svg;
  }

  // ─── Update Clock Panel ───────────────────────────────────
  function updateClockPanel() {
    var jst = getJSTNow();
    var h = jst.hours % 12;
    var m = jst.minutes;
    var s = jst.seconds;

    // Analog hands
    var hourAngle = (h + m / 60) * 30;
    var minAngle = (m + s / 60) * 6;
    setHandAngle('jj-cal-hand-hour', hourAngle, 24, 45);
    setHandAngle('jj-cal-hand-min', minAngle, 32, 45);

    // Digital time with blinking colon
    var digitalEl = document.getElementById('jj-cal-digital');
    if (digitalEl) {
      var colonVisible = s % 2 === 0;
      var colonSpan = '<span class="jj-cal-digital__colon"' + (colonVisible ? '' : ' style="visibility:hidden"') + '>:</span>';
      digitalEl.innerHTML = pad(jst.hours) + colonSpan + pad(m);
    }

    // Seconds sub-display
    var secEl = document.getElementById('jj-cal-seconds');
    if (secEl) secEl.textContent = ':' + pad(s);

    // Date sub-display
    var dateSubEl = document.getElementById('jj-cal-date-sub');
    if (dateSubEl) {
      var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      var jstDate = new Date(jst.year, jst.month, jst.day);
      var dayName = dayNames[jstDate.getDay()];
      dateSubEl.innerHTML = '<span>' + dayName + '</span><span>' + pad(jst.month + 1) + '/' + pad(jst.day) + '</span>';
    }
  }

  function setHandAngle(id, angleDeg, length, viewSize) {
    var hand = document.getElementById(id);
    if (!hand) return;
    var cx = viewSize / 2;
    var rad = (angleDeg - 90) * Math.PI / 180;
    var x2 = cx + length * Math.cos(rad);
    var y2 = cx + length * Math.sin(rad);
    hand.setAttribute('x1', cx);
    hand.setAttribute('y1', cx);
    hand.setAttribute('x2', x2);
    hand.setAttribute('y2', y2);
  }

  // ─── Helpers ──────────────────────────────────────────────
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function escapeAttr(str) { return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ─── Toggle Logic ─────────────────────────────────────────
  clockTray.addEventListener('click', function (e) {
    // Only toggle if the click target is the clock tray itself or the time span,
    // not if it's inside the calendar popover
    if (calPopover.contains(e.target)) return;
    e.stopPropagation();

    if (isOpen) {
      close();
    } else {
      open();
    }
  });

  // Stop clicks inside popover from closing it
  calPopover.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  function open() {
    if (datePopover) datePopover.style.display = 'none';
    clockTray.classList.add('jj-calendar-open');

    var jst = getJSTNow();
    viewYear = jst.year;
    viewMonth = jst.month;

    renderCalendar();
    calPopover.classList.add('jj-calendar-popover--open');
    isOpen = true;

    clockInterval = setInterval(updateClockPanel, 1000);
  }

  function close() {
    calPopover.classList.remove('jj-calendar-popover--open');
    clockTray.classList.remove('jj-calendar-open');
    calPopover.innerHTML = '';
    isOpen = false;
    if (datePopover) datePopover.style.display = '';
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
    stopGlitch();
  }

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (isOpen && !calPopover.contains(e.target) && !clockTray.contains(e.target)) {
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
