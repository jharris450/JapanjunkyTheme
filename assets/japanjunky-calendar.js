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
    clockTray.classList.add('jj-calendar-open');

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
    clockTray.classList.remove('jj-calendar-open');
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
