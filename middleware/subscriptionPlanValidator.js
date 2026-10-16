/**
 * Request validation schemas for Subscription Plans.
 */
const { body, param, query } = require('express-validator');
const { PAYMENT_METHODS } = require('../constants');

/**
 * Validation schema for POST /api/v1/subscription-plans
 */
const createPlanValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Plan name is required.')
    .isLength({ max: 150 })
    .withMessage('Plan name must not exceed 150 characters.'),

  body('billing_cycle')
    .trim()
    .notEmpty()
    .withMessage('Billing cycle is required.')
    .toUpperCase()
    .isIn(['MONTHLY', 'ANNUAL'])
    .withMessage('Billing cycle must be either MONTHLY or ANNUAL.'),

  body('price')
    .notEmpty()
    .withMessage('Price is required.')
    .isFloat({ min: 0 })
    .withMessage('Price must be a valid number greater than or equal to 0.'),

  body('code')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .matches(/^[A-Z0-9_-]+$/)
    .withMessage('Plan code must contain only uppercase letters, numbers, hyphens, and underscores.')
    .isLength({ max: 100 })
    .withMessage('Plan code must not exceed 100 characters.'),

  body('discount_percent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount percent must be between 0 and 100.'),

  body('max_rooms')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max rooms must be a valid positive integer.'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.'),

  body('badge')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Badge must not exceed 100 characters.'),

  body('is_popular')
    .optional()
    .isBoolean()
    .withMessage('is_popular must be a boolean value.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),

  body('display_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('display_order must be a non-negative integer.'),

  body('features')
    .optional()
    .custom((val) => {
      if (Array.isArray(val)) {
        if (!val.every((item) => typeof item === 'string')) {
          throw new Error('All features in the array must be strings.');
        }
      } else if (typeof val !== 'string') {
        throw new Error('Features must be an array of strings or a comma/newline separated string.');
      }
      return true;
    }),
];

/**
 * Validation schema for PUT /api/v1/subscription-plans/:id
 */
const updatePlanValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid subscription plan ID.'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Plan name cannot be empty.')
    .isLength({ max: 150 })
    .withMessage('Plan name must not exceed 150 characters.'),

  body('billing_cycle')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['MONTHLY', 'ANNUAL'])
    .withMessage('Billing cycle must be either MONTHLY or ANNUAL.'),

  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be greater than or equal to 0.'),

  body('code')
    .optional()
    .trim()
    .toUpperCase()
    .matches(/^[A-Z0-9_-]+$/)
    .withMessage('Plan code must contain only uppercase letters, numbers, hyphens, and underscores.')
    .isLength({ max: 100 })
    .withMessage('Plan code must not exceed 100 characters.'),

  body('discount_percent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount percent must be between 0 and 100.'),

  body('max_rooms')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max rooms must be a valid positive integer.'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.'),

  body('badge')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Badge must not exceed 100 characters.'),

  body('is_popular')
    .optional()
    .isBoolean()
    .withMessage('is_popular must be a boolean value.'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value.'),

  body('display_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('display_order must be a non-negative integer.'),

  body('features')
    .optional()
    .custom((val) => {
      if (Array.isArray(val)) {
        if (!val.every((item) => typeof item === 'string')) {
          throw new Error('All features in the array must be strings.');
        }
      } else if (typeof val !== 'string') {
        throw new Error('Features must be an array of strings or a comma/newline separated string.');
      }
      return true;
    }),
];

/**
 * Validation schema for GET /api/v1/subscription-plans/:id
 */
const getPlanByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid subscription plan ID.'),
];

/**
 * Validation schema for DELETE /api/v1/subscription-plans/:id
 */
const deletePlanValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid subscription plan ID.'),
];

/**
 * Validation schema for GET /api/v1/subscription-plans query parameters
 */
const getPlansQueryValidator = [
  query('billing_cycle')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['MONTHLY', 'ANNUAL'])
    .withMessage('Invalid billing cycle filter. Must be MONTHLY or ANNUAL.'),

  query('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active filter must be a boolean (true or false).'),

  query('is_popular')
    .optional()
    .isBoolean()
    .withMessage('is_popular filter must be a boolean (true or false).'),

  query('sort_by')
    .optional()
    .isIn(['display_order', 'price', 'name', 'created_at', 'updated_at'])
    .withMessage('sort_by must be display_order, price, name, created_at, or updated_at.'),

  query('sort_order')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('sort_order must be asc or desc.'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),
];

/**
 * POST /api/v1/subscription-plans/:id/purchase
 * The hotel and the price come from the token and the plan.
 * payment_method is optional and defaults to CASH.
 */
const purchasePlanValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Plan ID must be a positive integer.'),

  body('payment_method')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(PAYMENT_METHODS)
    .withMessage(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}.`),

  body('auto_renew')
    .optional()
    .isBoolean()
    .withMessage('auto_renew must be true or false.'),
];

module.exports = {
  createPlanValidator,
  updatePlanValidator,
  getPlanByIdValidator,
  deletePlanValidator,
  getPlansQueryValidator,
  purchasePlanValidator,
};
