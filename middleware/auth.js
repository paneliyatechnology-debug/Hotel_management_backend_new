/**
 * Authentication and authorization middleware.
 * Enforces JWT authentication, Role-Based Access Control (RBAC),
 * and Multi-Tenant Hotel ID Isolation.
 */
const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

/**
 * Extract target hotel ID from standard request locations:
 * - Route params: req.params.hotelId, req.params.hotel_id
 * - Query params: req.query.hotel_id, req.query.hotelId
 * - Request body: req.body.hotel_id, req.body.hotelId
 * - Request header: req.headers['x-hotel-id']
 * @param {import('express').Request} req
 * @returns {number|null}
 */
const extractTargetHotelId = (req) => {
  const rawId =
    req.params?.hotelId ||
    req.params?.hotel_id ||
    req.query?.hotel_id ||
    req.query?.hotelId ||
    req.body?.hotel_id ||
    req.body?.hotelId ||
    req.headers?.['x-hotel-id'];

  if (rawId !== undefined && rawId !== null && rawId !== '') {
    const parsed = Number(rawId);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

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

    // Verify account active state based on is_active, is_deleted, and deleted_at (status column dropped)
    if (
      user.is_active === false ||
      user.is_active === 0 ||
      Boolean(user.is_deleted) ||
      Boolean(user.deleted_at)
    ) {
      throw new AppError(
        'Your account has been deactivated or disabled.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    req.user = user;
    req.hotel_id = user.hotel_id || null;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-Based Access Control (RBAC) & Tenant Hotel ID Isolation Guard
 * Validates role and ensures users with the same role cannot access another hotel's data.
 * @param {...string} roles - Permitted roles (e.g. HOTEL_ADMIN, RECEPTIONIST, etc.)
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED));
    }

    // SUPER_ADMIN has global unrestricted access across all hotels
    if (req.user.role === ROLE_CODES.SUPER_ADMIN) {
      return next();
    }

    // Verify role permission
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Role '${req.user.role}' is not authorized for this operation.`,
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    // Non-super admin users must be bound to a hotel
    if (!req.user.hotel_id) {
      return next(
        new AppError(
          'Access denied. Your user account is not associated with any hotel.',
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    // Multi-tenant check: ensure user cannot access another hotel
    const targetHotelId = extractTargetHotelId(req);
    if (targetHotelId !== null) {
      if (Number(targetHotelId) !== Number(req.user.hotel_id)) {
        return next(
          new AppError(
            'Access denied. You do not have permission to access another hotel.',
            HTTP_STATUS.FORBIDDEN
          )
        );
      }
    }

    // Bind authenticated hotel ID to the request
    req.hotel_id = req.user.hotel_id;
    next();
  };
};

/**
 * Standalone Tenant Isolation Guard
 * Ensures non-SUPER_ADMIN users cannot query, create, or modify data belonging to another hotel.
 */
const validateHotelAccess = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED));
  }

  // SUPER_ADMIN has global platform access
  if (req.user.role === ROLE_CODES.SUPER_ADMIN) {
    return next();
  }

  if (!req.user.hotel_id) {
    return next(
      new AppError(
        'Access denied. Your user account is not associated with any hotel.',
        HTTP_STATUS.FORBIDDEN
      )
    );
  }

  const targetHotelId = extractTargetHotelId(req);
  if (targetHotelId !== null) {
    if (Number(targetHotelId) !== Number(req.user.hotel_id)) {
      return next(
        new AppError(
          'Access denied. You do not have permission to access another hotel.',
          HTTP_STATUS.FORBIDDEN
        )
      );
    }
  }

  req.hotel_id = req.user.hotel_id;
  next();
};

/**
 * Optional Authenticator:
 * Populates req.user if a valid token is provided and user is active in the database.
 * Also performs hotel ID isolation when authenticated. Continues without error otherwise.
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

        // Validate user based on is_active and soft delete flags (status column dropped)
        const isActive =
          user &&
          user.is_active !== false &&
          user.is_active !== 0 &&
          !user.is_deleted &&
          !user.deleted_at;

        if (isActive) {
          req.user = user;
          req.hotel_id = user.hotel_id || null;

          // Tenant check: if user is not SUPER_ADMIN and specifies a foreign hotel ID, reject
          if (user.role !== ROLE_CODES.SUPER_ADMIN && user.hotel_id) {
            const targetHotelId = extractTargetHotelId(req);
            if (targetHotelId !== null && Number(targetHotelId) !== Number(user.hotel_id)) {
              return next(
                new AppError(
                  'Access denied. You do not have permission to access another hotel.',
                  HTTP_STATUS.FORBIDDEN
                )
              );
            }
          }
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
  validateHotelAccess,
  requireHotelAccess: validateHotelAccess,
  extractTargetHotelId,
};
