/**
 * Resolve a named dashboard date range to concrete start and end timestamps.
 * Ranges are calendar-based in the server's local time.
 */

const DATE_RANGES = ['today', 'this_week', 'this_month', 'this_year'];

/**
 * @param {Date} value
 * @returns {Date}
 */
const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Exclusive end of the calendar day (start of the next day).
 * @param {Date} value
 * @returns {Date}
 */
const endOfDayExclusive = (value) => {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
};

/**
 * @param {string} [dateRange='this_month']
 * @param {Date} [now=new Date()]
 * @returns {{ key: string, from: Date, to: Date, todayFrom: Date, todayTo: Date }}
 */
const resolveDateRange = (dateRange = 'this_month', now = new Date()) => {
  const key = String(dateRange || 'this_month').trim().toLowerCase();
  const rangeKey = DATE_RANGES.includes(key) ? key : 'this_month';
  const todayFrom = startOfDay(now);
  // Exclusive end of today. Using the end of the day (not "now") keeps the whole
  // current day inside this_week / this_month / this_year without clock-skew gaps.
  const todayTo = endOfDayExclusive(now);
  const to = todayTo;

  let from = startOfDay(now);

  if (rangeKey === 'this_week') {
    // Monday as the first day of the week.
    const day = from.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - daysFromMonday);
  } else if (rangeKey === 'this_month') {
    from = new Date(from.getFullYear(), from.getMonth(), 1);
  } else if (rangeKey === 'this_year') {
    from = new Date(from.getFullYear(), 0, 1);
  }

  return { key: rangeKey, from, to, todayFrom, todayTo };
};

/**
 * Round a money value to 2 decimal places.
 * @param {*} value
 * @returns {number}
 */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Round a percentage to 2 decimal places.
 * @param {*} value
 * @returns {number}
 */
const percent = (value) => Math.round((Number(value) || 0) * 100) / 100;

module.exports = {
  DATE_RANGES,
  resolveDateRange,
  money,
  percent,
};
