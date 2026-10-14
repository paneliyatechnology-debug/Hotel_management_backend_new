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
   * @param {Object} [options={}]
   * @param {boolean} [options.forceLogout=false] - Tell the frontend to clear the session and log out
   * @param {string|null} [options.code=null] - Stable machine-readable error code
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = [], options = {}) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    this.forceLogout = Boolean(options.forceLogout);
    this.code = options.code || null;
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

/**
 * Send a success response that carries only a message and no data.
 * Used by logout, reset-password and change-password.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Success message
 * @param {number} [statusCode=200] - HTTP status code
 * @returns {import('express').Response}
 */
const successMessage = (res, message, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
  });
};

module.exports = {
  AppError,
  success,
  successMessage,
};
