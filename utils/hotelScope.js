/**
 * Resolve the hotel that owns the current request.
 * hotel_id is taken only from the user loaded by the access token.
 * Values sent in the body, query string, route params, or headers are ignored.
 */
const { AppError } = require('./response');
const hotelModel = require('../models/hotelModel');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

/**
 * @param {Object|null|undefined} reqUser - Authenticated user attached by auth middleware
 * @returns {number}
 */
const resolveHotelId = (reqUser) => {
  if (!reqUser) {
    throw new AppError(
      'Authentication required. hotel_id is taken from the authenticated user token.',
      HTTP_STATUS.UNAUTHORIZED,
      [
        {
          field: 'hotel_id',
          message: 'Do not send hotel_id. It is read from the authenticated user token.',
        },
      ]
    );
  }

  const hotelId = Number(reqUser.hotel_id);
  if (!hotelId || Number.isNaN(hotelId) || hotelId <= 0) {
    throw new AppError(
      'Your account is not associated with a hotel. hotel_id must come from the authenticated user token.',
      HTTP_STATUS.FORBIDDEN,
      [
        {
          field: 'hotel_id',
          message: 'The authenticated user token does not include a hotel.',
        },
      ]
    );
  }

  return hotelId;
};

/**
 * Hotel a hotel-scoped read should use.
 * Hotel staff always use the hotel on their token. A super admin has none, so must send hotel_id.
 * @param {Object} reqUser - Authenticated user attached by auth middleware
 * @param {Object} [query] - Request query. hotel_id is read only for a super admin.
 * @returns {number}
 */
const resolveScopedHotelId = (reqUser, query = {}) => {
  if (reqUser && reqUser.role === ROLE_CODES.SUPER_ADMIN) {
    const hotelId = Number(query.hotel_id);
    if (!hotelId || Number.isNaN(hotelId) || hotelId <= 0) {
      throw new AppError(
        'hotel_id is required when a super admin requests hotel data.',
        HTTP_STATUS.BAD_REQUEST,
        [{ field: 'hotel_id', message: 'Provide a positive hotel id.' }]
      );
    }
    return hotelId;
  }

  return resolveHotelId(reqUser);
};

// Frontend should clear the session and call logout when this code is returned.
const FORCE_LOGOUT = { forceLogout: true, code: 'FORCE_LOGOUT' };

// Plan problems block the API but keep the user signed in, so the frontend can show a renew screen.
const PLAN_INACTIVE = { code: 'PLAN_INACTIVE' };
const PLAN_EXPIRED = { code: 'PLAN_EXPIRED' };

/**
 * Block the users of a hotel that cannot be used right now. Super admins have no hotel and are never blocked.
 *
 * - Hotel deactivated or deleted: 403 with force_logout, so the frontend clears the session.
 * - Subscription plan switched off or ended: 403 with code PLAN_INACTIVE or PLAN_EXPIRED. The user is NOT
 *   logged out and keeps the session. Every protected API stays blocked until the plan is renewed.
 *
 * Auth middleware runs the full check on every protected API. Login, refresh-token and password reset
 * pass { checkPlan: false } so users of an expired plan can still sign in and see the renew message.
 * @param {Object|null|undefined} user - User row with role and hotel_id
 * @param {Object} [options]
 * @param {boolean} [options.checkPlan=true] - Also reject an inactive or ended plan
 * @returns {Promise<void>}
 */
const assertHotelActive = async (user, { checkPlan = true } = {}) => {
  if (!user || !user.hotel_id || user.role === ROLE_CODES.SUPER_ADMIN) return;

  const hotel = await hotelModel.findHotelAccessState(user.hotel_id);
  const isActive = hotel && !hotel.deleted_at && Boolean(hotel.is_active);

  if (!isActive) {
    throw new AppError(
      'Hotel is inactive or awaiting approval by Super Admin. Please contact the platform administrator.',
      HTTP_STATUS.FORBIDDEN,
      [],
      FORCE_LOGOUT
    );
  }

  // A hotel with no plan assigned is left open. The rest must have an active, unexpired plan.
  if (!checkPlan || !hotel.subscription_plan_id) return;

  const planName = hotel.plan_name || 'current';

  if (!hotel.subscription_plan_active) {
    throw new AppError(
      `Your ${planName} plan is not active. Please renew your plan to continue.`,
      HTTP_STATUS.FORBIDDEN,
      [],
      PLAN_INACTIVE
    );
  }

  const endDate = hotel.subscription_plan_end_date;
  if (endDate && new Date(endDate).getTime() < Date.now()) {
    throw new AppError(
      `Your ${planName} plan ended on ${new Date(endDate).toISOString().slice(0, 10)}. Please renew your plan to continue.`,
      HTTP_STATUS.FORBIDDEN,
      [],
      PLAN_EXPIRED
    );
  }
};

module.exports = {
  resolveHotelId,
  resolveScopedHotelId,
  assertHotelActive,
};
