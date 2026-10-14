/**
 * Global Express error handler.
 *
 * Maps operational AppErrors and MySQL constraint violations to consistent JSON responses.
 * Failed changes made by a signed-in user are also written to the audit trail.
 */
const auditService = require('../services/auditService');
const { clearAuthCookies } = require('../utils/jwt');
const { HTTP_STATUS } = require('../constants');

/**
 * Express error-handling middleware (4-argument signature).
 * @param {Error} err - Thrown or passed error
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Express next (unused)
 */
const errorHandler = async (err, req, res, _next) => {
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
    if (
      sqlMsg.includes('users_email_unique') ||
      sqlMsg.includes('users.email') ||
      sqlMsg.includes('hotels_owner_email_unique') ||
      sqlMsg.includes('owner_email')
    ) {
      message = 'An account with this email already exists';
    } else if (sqlMsg.includes('hotels_slug_unique') || sqlMsg.includes('slug')) {
      message = 'A hotel with this slug already exists';
    } else if (sqlMsg.includes('subscription_plans_code_unique') || sqlMsg.includes('subscription_plans.code')) {
      message = 'A subscription plan with this code already exists';
    } else if (sqlMsg.includes('room_types_active_name_key') || sqlMsg.includes('active_name_key')) {
      message = 'A room category with this name already exists for this hotel.';
    } else if (sqlMsg.includes('rooms_active_room_key') || sqlMsg.includes('active_room_key')) {
      message = 'A room with this number already exists on this floor for this hotel.';
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

  // The audit trail keeps the real reason of a server error. Only the response hides it in production.
  await auditService.recordFailure(req, {
    statusCode,
    message: statusCode >= 500 ? err.message || message : message,
    errors,
  });

  // Hotel deactivated / plan expired or inactive: drop cookies so a refresh-token flow cannot stay signed in.
  if (err.forceLogout) {
    clearAuthCookies(res);
  }

  const body = {
    success: false,
    message,
    errors,
  };
  if (err.forceLogout) body.force_logout = true;
  if (err.code) body.code = err.code;

  return res.status(statusCode).json(body);
};

module.exports = errorHandler;
