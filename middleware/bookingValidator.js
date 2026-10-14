/**
 * Booking Request Validators using express-validator.
 */
const { body, param, query } = require('express-validator');
const { BOOKING_STATUSES, PAYMENT_METHODS } = require('../constants');

// Optional. Says how paid_amount was paid. The service stores CASH when it is omitted.
const paymentMethodValidator = body('payment_method')
  .optional({ checkFalsy: true })
  .trim()
  .toUpperCase()
  .isIn(PAYMENT_METHODS)
  .withMessage(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}.`);

/**
 * room_id is an array of room ids. A JSON string or one id is accepted.
 * Repeated ids are ignored.
 * @param {*} value
 * @returns {number[]|null}
 */
const readRoomIds = (value) => {
  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch (_) {
        return null;
      }
    } else {
      list = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
  } else if (!Array.isArray(value)) {
    list = [value];
  }

  if (!Array.isArray(list) || list.length === 0) return null;
  const ids = [...new Set(list.map((item) => Number(item)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return ids;
};

/**
 * Count uploaded files. A field name containing "sign" or "signature" is a signature.
 * @param {Array<Object>} files
 * @param {'image'|'signature'} kind
 * @returns {number}
 */
const fileCount = (files, kind) => {
  if (!Array.isArray(files)) return 0;
  return files.filter((file) => {
    if (!file || !file.buffer) return false;
    const fieldName = (file.fieldname || '').toLowerCase();
    const isSignature = fieldName.includes('signature') || fieldName.includes('sign');
    return kind === 'signature' ? isSignature : !isSignature;
  }).length;
};

/**
 * Guest photos and the signature are form-data files. A URL does not count.
 * @param {'image'|'signature'} kind
 * @param {number} [minimum=1]
 * @returns {import('express-validator').ValidationChain}
 */
const requireMedia = (kind, minimum = 1) => {
  const field = kind === 'signature' ? 'signatures' : 'images';
  const message = kind === 'signature'
    ? 'At least one signature is required.'
    : (minimum === 1
      ? 'At least one image is required.'
      : `At least ${minimum} images are required.`);

  return body(field).custom((_value, { req }) => {
    if (fileCount(req.files, kind) < minimum) {
      throw new Error(message);
    }
    return true;
  });
};

/**
 * @param {*} value
 * @param {boolean} required
 */
const assertRoomIdList = (value, required) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('room_id is required.');
    return true;
  }
  if (!readRoomIds(value)) {
    throw new Error('room_id must be an array of room ids.');
  }
  return true;
};

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

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('room_id')
    .custom((value) => assertRoomIdList(value, true)),

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

  paymentMethodValidator,

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

  requireMedia('image', 2),
  requireMedia('signature'),
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

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('room_id')
    .optional()
    .custom((value) => assertRoomIdList(value, false)),

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

  paymentMethodValidator,

  requireMedia('image'),
  requireMedia('signature'),
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

  paymentMethodValidator,

  body('extra_charges_total')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('extra_charges_total cannot be negative.'),

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
