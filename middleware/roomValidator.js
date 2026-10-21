/**
 * Request validation schemas for Physical Rooms.
 */
const { body, param, query } = require('express-validator');
const { ROOM_STATUSES } = require('../constants');
const { parseRoomBeds } = require('../utils/roomBeds');

const bedsValidator = () => body('beds')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value) => {
    parseRoomBeds(value);
    return true;
  });

/**
 * Validation schema for POST /api/v1/rooms
 */
const createRoomValidator = [
  body('room_number')
    .trim()
    .notEmpty()
    .withMessage('Room number (room_number) is required.')
    .isLength({ max: 50 })
    .withMessage('Room number must not exceed 50 characters.'),

  body('room_type_id')
    .notEmpty()
    .withMessage('Room category ID (room_type_id) is required.')
    .isInt({ min: 1 })
    .withMessage('Room category ID (room_type_id) must be a positive integer.'),

  body('floor')
    .optional()
    .isInt()
    .withMessage('Floor must be a valid integer.'),

  bedsValidator(),

  body('custom_price_per_night')
    .optional({ nullable: true, checkFalsy: false })
    .custom((val) => {
      if (val === null || val === '' || val === undefined) return true;
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Custom price per night must be a valid number greater than or equal to 0.');
      }
      return true;
    }),

  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string.'),

  body('key_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Key code must not exceed 50 characters.'),

  body('cleaning_duration_minutes')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cleaning duration minutes must be a positive integer.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),
];

/**
 * Validation schema for PUT /api/v1/rooms/:id
 */
const updateRoomValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room ID. Must be a positive integer.'),

  body('room_number')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Room number cannot be empty.')
    .isLength({ max: 50 })
    .withMessage('Room number must not exceed 50 characters.'),

  body('room_type_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Room category ID must be a positive integer.'),

  body('floor')
    .optional()
    .isInt()
    .withMessage('Floor must be a valid integer.'),

  bedsValidator(),

  body('custom_price_per_night')
    .optional({ nullable: true, checkFalsy: false })
    .custom((val) => {
      if (val === null || val === '' || val === undefined) return true;
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Custom price per night must be a valid number greater than or equal to 0.');
      }
      return true;
    }),

  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string.'),

  body('key_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Key code must not exceed 50 characters.'),

  body('cleaning_duration_minutes')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cleaning duration minutes must be a positive integer.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),
];

/**
 * Validation schema for PATCH /api/v1/rooms/:id/status
 */
const updateRoomStatusValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room ID. Must be a positive integer.'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Room status is required.')
    .toUpperCase()
    .isIn(ROOM_STATUSES)
    .withMessage(`Status must be one of: ${ROOM_STATUSES.join(', ')}.`),
];

/**
 * Validation schema for GET /api/v1/rooms/:id
 */
const getRoomByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room ID. Must be a positive integer.'),
];

/**
 * Validation schema for DELETE /api/v1/rooms/:id
 */
const deleteRoomValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room ID. Must be a positive integer.'),
];

/**
 * Validation schema for GET /api/v1/rooms query parameters
 */
const getRoomsQueryValidator = [
  query('floor')
    .optional()
    .isInt()
    .withMessage('floor filter must be a valid integer.'),

  query('room_type_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('room_type_id filter must be a positive integer.'),

  query('status')
    .optional()
    .toUpperCase()
    .isIn(ROOM_STATUSES)
    .withMessage(`status filter must be one of: ${ROOM_STATUSES.join(', ')}.`),

  query('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active filter must be a boolean (true or false).'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100.'),

  query('sort_by')
    .optional()
    .isIn(['floor'])
    .withMessage("sort_by must be 'floor'."),

  query('sort_order')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage("sort_order must be 'asc' or 'desc'."),
];

module.exports = {
  createRoomValidator,
  updateRoomValidator,
  updateRoomStatusValidator,
  getRoomByIdValidator,
  deleteRoomValidator,
  getRoomsQueryValidator,
};
