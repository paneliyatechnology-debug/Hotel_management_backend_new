/**
 * Transaction request validation.
 */
const { query } = require('express-validator');
const { PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_SOURCES } = require('../constants');

const SORT_FIELDS = ['created_at', 'amount', 'payment_method', 'status', 'id'];

const getTransactionsQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),

  query('start_date')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date must be YYYY-MM-DD.'),

  query('end_date')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('end_date must be YYYY-MM-DD.'),

  query('payment_method')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(PAYMENT_METHODS)
    .withMessage(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}.`),

  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(PAYMENT_STATUSES)
    .withMessage(`status must be one of: ${PAYMENT_STATUSES.join(', ')}.`),

  query('source')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(PAYMENT_SOURCES)
    .withMessage(`source must be one of: ${PAYMENT_SOURCES.join(', ')}.`),

  query('booking_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('booking_id must be a positive integer.'),

  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must not exceed 100 characters.'),

  query('sort_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(SORT_FIELDS)
    .withMessage(`sort_by must be one of: ${SORT_FIELDS.join(', ')}.`),

  query('sort_order')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc.'),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),
];

module.exports = {
  getTransactionsQueryValidator,
};
