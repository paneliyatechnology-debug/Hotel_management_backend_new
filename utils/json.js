/**
 * JSON helpers.
 */

/**
 * Parse a JSON column. mysql2 may already return an object, and a bad value must not crash the request.
 * @param {*} value - JSON string, parsed value, or empty
 * @param {*} [fallback=[]] - Returned when the value is empty or not valid JSON
 * @returns {*}
 */
const parseJson = (value, fallback = []) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

module.exports = {
  parseJson,
};
