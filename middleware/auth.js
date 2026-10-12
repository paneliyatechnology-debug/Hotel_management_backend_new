/**
 * Authentication and authorization middleware.
 * Modeled after TradeNexa auth middleware.
 */
const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

/**
 * Session Authenticator (HTTP-Only Cookie or Bearer Token)
 */
const authenticateUser = async (req, res, next) => {
  try {
    let accessToken = req.cookies?.accessToken;

    if (!accessToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      accessToken = req.headers.authorization.split(' ')[1];
    }

    if (!accessToken) {
      throw new AppError(
        'Authentication required. No session access token found in cookie or header.',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    let decoded;
    try {
      decoded = verifyAccessToken(accessToken);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError(
          'Session access token has expired. Please refresh your session.',
          HTTP_STATUS.UNAUTHORIZED
        );
      }
      throw new AppError(
        'Invalid session access token. Please login again.',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    const user = await userModel.findUserById(decoded.id);

    if (!user) {
      throw new AppError('User account not found.', HTTP_STATUS.UNAUTHORIZED);
    }

    if (
      user.is_active === false ||
      user.is_active === 0 ||
      Boolean(user.deleted_at)
    ) {
      throw new AppError(
        'Your account has been deactivated or disabled.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role Based Access Control (RBAC Guard)
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED));
    }

    if (req.user.role === ROLE_CODES.SUPER_ADMIN) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Role '${req.user.role}' is not authorized for this operation.`,
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    next();
  };
};

/**
 * Optional Authenticator: populates req.user if valid token provided, continues without error otherwise.
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    let accessToken = req.cookies?.accessToken;
    if (!accessToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      accessToken = req.headers.authorization.split(' ')[1];
    }

    if (accessToken) {
      try {
        const decoded = verifyAccessToken(accessToken);
        const user = await userModel.findUserById(decoded.id);
        if (
          user &&
          !user.deleted_at &&
          user.status !== 'INACTIVE' &&
          user.status !== 'BLOCKED' &&
          user.status !== 'DELETED'
        ) {
          req.user = user;
        }
      } catch (_) {}
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authenticateUser,
  optionalAuthenticate,
  requireRole,
};
