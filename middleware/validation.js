/**
 * Request validation middleware and express-validator rule sets.
 * Modeled after TradeNexa validation pattern.
 */
const { body, query, validationResult } = require('express-validator');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Validation execution middleware.
 * Validates request and passes AppError to next() on error.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array().map((e) => ({
      field: e.path || e.param,
      message: e.msg,
    }));
    return next(
      new AppError(
        errorList[0].message || 'Validation failed',
        HTTP_STATUS.BAD_REQUEST,
        errorList
      )
    );
  }
  next();
};

// ==========================================
// Auth Validation Rules
// ==========================================

const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Please provide email address')
    .isEmail()
    .withMessage('Please enter a valid email address format (e.g. name@example.com)')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Please provide password'),
];

const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Please enter your registered email address')
    .isEmail()
    .withMessage('Please enter a valid email address format (e.g. name@example.com)')
    .normalizeEmail(),
];

const verifyTokenValidator = [
  (req, res, next) => {
    const token = req.query?.token || req.body?.token;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return next(
        new AppError('Reset token is required', HTTP_STATUS.BAD_REQUEST, [
          { field: 'token', message: 'Reset token is required' },
        ])
      );
    }
    next();
  },
];

const resetPasswordValidator = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

const changePasswordValidator = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
];

module.exports = {
  validate,
  loginValidator,
  forgotPasswordValidator,
  verifyTokenValidator,
  resetPasswordValidator,
  changePasswordValidator,
};
