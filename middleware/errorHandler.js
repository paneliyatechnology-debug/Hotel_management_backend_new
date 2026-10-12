/**
 * Global Express error handler.
 *
 * Maps operational AppErrors and MySQL constraint violations to consistent JSON responses.
 * Modeled after TradeNexa errorHandler pattern.
 */
const { HTTP_STATUS } = require('../constants');

/**
 * Express error-handling middleware (4-argument signature).
 * @param {Error} err - Thrown or passed error
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Express next (unused)
 */
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // ==========================================
  // MySQL duplicate entry (ER_DUP_ENTRY / 1062)
  // ==========================================
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    statusCode = HTTP_STATUS.CONFLICT;
    message = 'Duplicate entry found';

    const sqlMsg = err.sqlMessage || '';
    if (sqlMsg.includes('users_email_unique') || sqlMsg.includes('users.email')) {
      message = 'An account with this email already exists';
    } else if (sqlMsg.includes('unique')) {
      const match = sqlMsg.match(/key '([^']+)'/);
      if (match && match[1]) {
        const parts = match[1].split('.');
        const keyName = parts[parts.length - 1];
        message = `${keyName.replace(/_/g, ' ').replace('unique', '').trim()} already exists`;
      }
    }
  }

  // ==========================================
  // MySQL foreign key constraints
  // ==========================================
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Invalid reference ID. Associated record does not exist.';
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
    statusCode = HTTP_STATUS.CONFLICT;
    message = 'Cannot delete or modify record. It is referenced by other items.';
  }

  // ==========================================
  // Server errors — log in console
  // ==========================================
  if (statusCode >= 500) {
    console.error(`[ErrorHandler 500] ${req.method} ${req.originalUrl}:`, err);
    if (process.env.NODE_ENV === 'production') {
      message = 'Internal server error';
    }
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

module.exports = errorHandler;
