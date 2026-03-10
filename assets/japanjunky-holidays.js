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
