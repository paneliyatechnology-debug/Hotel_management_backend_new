/**
 * API response helpers.
 *
 * Operational error class and standardized success response formatter.
 */
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Operational Error class
// ==========================================

/**
 * Operational application error with HTTP status code and field-level errors.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {Array<{field?: string, message: string}>} [errors=[]] - Field-level validation errors
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }
}

// ==========================================
// Standardized Success response
// ==========================================

/**
 * Send a standardized JSON success response.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Success message
 * @param {Object} [data={}] - Response payload
 * @param {number} [statusCode=200] - HTTP status code
 * @returns {import('express').Response}
 */
const success = (res, message, data = {}, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

module.exports = {
  AppError,
  success,
};
