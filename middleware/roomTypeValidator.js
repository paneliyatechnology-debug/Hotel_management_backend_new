/**
 * Request validation schemas for Room Categories (Room Types).
 */
const { body, param, query } = require('express-validator');

/**
 * Validation schema for GET /api/v1/room-types
 */
const getRoomTypesQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100.'),
];

/**
 * Validation schema for GET /api/v1/room-types/:id
 */
const getRoomTypeByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room category ID. Must be a positive integer.'),
];

/**
 * Validation schema for POST /api/v1/room-types
 */
const createRoomTypeValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Room category name is required.')
    .isLength({ max: 150 })
    .withMessage('Room category name must not exceed 150 characters.'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.'),
];

/**
 * Validation schema for PUT /api/v1/room-types/:id
 */
const updateRoomTypeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room category ID. Must be a positive integer.'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Room category name cannot be empty.')
    .isLength({ max: 150 })
    .withMessage('Room category name must not exceed 150 characters.'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.'),
];

/**
 * Validation schema for DELETE /api/v1/room-types/:id
 */
const deleteRoomTypeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid room category ID. Must be a positive integer.'),
];

module.exports = {
  getRoomTypesQueryValidator,
  getRoomTypeByIdValidator,
  createRoomTypeValidator,
  updateRoomTypeValidator,
  deleteRoomTypeValidator,
};
