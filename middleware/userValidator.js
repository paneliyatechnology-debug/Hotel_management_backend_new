/**
 * Request validation schemas for User Management.
 * Uses consistent snake_case.
 */
const { body, param, query } = require('express-validator');
const { ROLE_CODES } = require('../constants');

const VALID_ROLES = Object.values(ROLE_CODES);
const STAFF_LIST_ROLES = [
  ROLE_CODES.RECEPTIONIST,
  ROLE_CODES.MANAGER,
  ROLE_CODES.HOUSEKEEPING,
  ROLE_CODES.ACCOUNTANT,
];

/**
 * Validation schema for POST /api/v1/users
 */
const createUserValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters.'),

  body('email')
    .notEmpty()
    .withMessage('Email address is required.')
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .toLowerCase(),

  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long.'),

  body('phone')
    .notEmpty()
    .withMessage('Phone number is required.')
    .isLength({ min: 5, max: 20 })
    .withMessage('Phone number must be between 5 and 20 characters.'),

  body('role')
    .notEmpty()
    .withMessage('User role is required.')
    .toUpperCase()
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(', ')}.`),

  body('hotel_id')
    .optional({ nullable: true, checkFalsy: false })
    .isInt({ min: 1 })
    .withMessage('Hotel ID must be a positive integer.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),

  body('is_disabled')
    .optional()
    .isBoolean()
    .withMessage('is_disabled must be a boolean value.'),

  body('must_change_password')
    .optional()
    .isBoolean()
    .withMessage('must_change_password must be a boolean value.'),
];

/**
 * Validation schema for PUT /api/v1/users/:id
 */
const updateUserValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required.')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer.'),

  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters.'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .toLowerCase(),

  body('phone')
    .optional()
    .isLength({ min: 5, max: 20 })
    .withMessage('Phone number must be between 5 and 20 characters.'),

  body('role')
    .optional()
    .toUpperCase()
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(', ')}.`),

  body('hotel_id')
    .optional({ nullable: true, checkFalsy: false })
    .isInt({ min: 1 })
    .withMessage('Hotel ID must be a positive integer.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),

  body('must_change_password')
    .optional()
    .isBoolean()
    .withMessage('must_change_password must be a boolean value.'),
];

/**
 * Validation schema for GET /api/v1/users/:id
 */
const getUserByIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required.')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer.'),
];

/**
 * Validation schema for DELETE /api/v1/users/:id
 */
const deleteUserValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required.')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer.'),
];

/**
 * Validation schema for GET /api/v1/users (query params)
 */
const getUsersQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),

  query('sort_by')
    .optional()
    .isIn(['id', 'name', 'email', 'role', 'is_active', 'created_at', 'updated_at', 'last_login_at'])
    .withMessage('Invalid sort_by field.'),

  query('sort_order')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage("sort_order must be 'asc' or 'desc'."),

  query('role')
    .optional()
    .toUpperCase()
    .isIn(STAFF_LIST_ROLES)
    .withMessage(`Role filter must be one of: ${STAFF_LIST_ROLES.join(', ')}.`),

  query('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active query filter must be a boolean.'),

  query('is_disabled')
    .optional()
    .isBoolean()
    .withMessage('is_disabled query filter must be a boolean.'),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id filter must be a positive integer.'),

  query('search')
    .optional()
    .isString()
    .withMessage('search query must be a string.'),
];

/**
 * Validation schema for PATCH /api/v1/users/:id/account-status
 */
const updateAccountStatusValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required.')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),

  body('is_disabled')
    .optional()
    .isBoolean()
    .withMessage('is_disabled must be a boolean value.'),
];

module.exports = {
  createUserValidator,
  updateUserValidator,
  updateAccountStatusValidator,
  getUserByIdValidator,
  deleteUserValidator,
  getUsersQueryValidator,
};
