/**
 * Dashboard request validation.
 */
const { query } = require('express-validator');
const { DATE_RANGES } = require('../utils/dateRange');

const getDashboardQueryValidator = [
  query('date_range')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(DATE_RANGES)
    .withMessage(`date_range must be one of: ${DATE_RANGES.join(', ')}.`),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),

  query('floor')
    .optional()
    .isInt()
    .withMessage('floor must be an integer.'),
];

module.exports = {
  getDashboardQueryValidator,
};
