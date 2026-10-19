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

const getDashboardSummaryQueryValidator = [
  query('start_date')
    .trim()
    .notEmpty()
    .withMessage('start_date is required.')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date must be YYYY-MM-DD.'),

  query('end_date')
    .trim()
    .notEmpty()
    .withMessage('end_date is required.')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('end_date must be YYYY-MM-DD.'),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),
];

module.exports = {
  getDashboardQueryValidator,
  getDashboardSummaryQueryValidator,
};
