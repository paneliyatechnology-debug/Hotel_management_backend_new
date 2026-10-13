/**
 * Booking Request Validators using express-validator.
 * Follows TradeNexa validator architecture.
 */
const { body, param, query } = require('express-validator');
const { BOOKING_STATUSES } = require('../constants');

/**
 * Validation schema for POST /api/v1/bookings
 */
const createBookingValidator = [
  body('primary_guest_name')
    .trim()
    .notEmpty()
    .withMessage('Primary guest name (primary_guest_name) is required.')
    .isLength({ min: 2, max: 255 })
    .withMessage('Primary guest name must be between 2 and 255 characters.'),

  body('secondary_guest_name')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Secondary guest name cannot exceed 255 characters.'),

  body('mobile_number')
    .trim()
    .notEmpty()
    .withMessage('Mobile number (mobile_number) is required.')
    .matches(/^[0-9+\-\s]{7,20}$/)
    .withMessage('Please provide a valid mobile number.'),

  body('room_id')
    .notEmpty()
    .withMessage('room_id is required.')
    .isInt({ min: 1 })
    .withMessage('room_id must be a positive integer.'),

  body('check_in_date')
    .notEmpty()
    .withMessage('Check-in date (check_in_date) is required.')
    .isISO8601()
    .withMessage('check_in_date must be a valid ISO 8601 date string.'),

  body('check_out_date')
    .notEmpty()
    .withMessage('Check-out date (check_out_date) is required.')
    .isISO8601()
    .withMessage('check_out_date must be a valid ISO 8601 date string.'),

  body('adults')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Adults count must be an integer of at least 1.'),

  body('children')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Children count must be a non-negative integer.'),

  body('base_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('base_amount must be a positive number.'),

  body('discount_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('discount_amount cannot be negative.'),

  body('paid_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('paid_amount cannot be negative.'),

  body('gst_rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('gst_rate must be between 0 and 100.'),

  // Optional. When omitted, the service stores CHECKED_IN.
  body('booking_status')
    .optional({ nullable: true })
    .trim()
    .toUpperCase()
    .isIn(BOOKING_STATUSES)
    .withMessage(`booking_status must be one of: ${BOOKING_STATUSES.join(', ')}.`),
];

/**
 * Validation schema for PUT /api/v1/bookings/:id
 */
const updateBookingValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid booking ID. Must be a positive integer.'),

  body('primary_guest_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Primary guest name cannot be empty.')
    .isLength({ min: 2, max: 255 })
    .withMessage('Primary guest name must be between 2 and 255 characters.'),

  body('mobile_number')
    .optional()
    .trim()
    .matches(/^[0-9+\-\s]{7,20}$/)
    .withMessage('Please provide a valid mobile number.'),

  body('room_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('room_id must be a positive integer.'),

  body('check_in_date')
    .optional()
    .isISO8601()
    .withMessage('check_in_date must be a valid ISO 8601 date string.'),

  body('check_out_date')
    .optional()
    .isISO8601()
    .withMessage('check_out_date must be a valid ISO 8601 date string.'),

  body('base_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('base_amount must be a positive number.'),

  body('paid_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('paid_amount cannot be negative.'),
];

/**
 * Validation schema for GET /api/v1/bookings/:id
 */
const getBookingByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid booking ID. Must be a positive integer.'),
];

/**
 * Validation schema for POST /api/v1/bookings/:id/check-out
 */
const checkOutBookingValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid booking ID. Must be a positive integer.'),

  body('paid_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('paid_amount collected at checkout cannot be negative.'),

  body('late_checkout_charge')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('late_checkout_charge cannot be negative.'),

  body('late_checkout_hours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('late_checkout_hours cannot be negative.'),

  body('notes')
    .optional()
    .isString()
    .withMessage('notes must be a string.'),
];

/**
 * Validation schema for DELETE /api/v1/bookings/:id
 */
const deleteBookingValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid booking ID. Must be a positive integer.'),
];

/**
 * Validation schema for GET /api/v1/bookings list query
 */
const getBookingsQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),

  query('room_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('room_id must be a positive integer.'),

  query('payment_status')
    .optional()
    .isIn(['PENDING', 'PARTIALLY_PAID', 'PAID'])
    .withMessage('payment_status must be PENDING, PARTIALLY_PAID, or PAID.'),

  // Stay filter. payment_status above filters the bill, not the stay.
  query('booking_status')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(BOOKING_STATUSES)
    .withMessage(`booking_status must be one of: ${BOOKING_STATUSES.join(', ')}.`),
];

/**
 * Validation schema for PATCH /api/v1/bookings/:id/status
 */
const updateBookingStatusValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid booking ID. Must be a positive integer.'),

  body('booking_status')
    .trim()
    .notEmpty()
    .withMessage('booking_status is required.')
    .toUpperCase()
    .isIn(BOOKING_STATUSES)
    .withMessage(`booking_status must be one of: ${BOOKING_STATUSES.join(', ')}.`),
];

module.exports = {
  createBookingValidator,
  updateBookingValidator,
  getBookingByIdValidator,
  checkOutBookingValidator,
  deleteBookingValidator,
  getBookingsQueryValidator,
  updateBookingStatusValidator,
};
