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
 * Block every user of a hotel that a super admin has deactivated (or deleted).
 * Super admins have no hotel and are never blocked.
 * @param {Object|null|undefined} user - User row with role and hotel_id
 * @returns {Promise<void>}
 */
const assertHotelActive = async (user) => {
  if (!user || !user.hotel_id || user.role === ROLE_CODES.SUPER_ADMIN) return;

  const hotel = await hotelModel.findHotelAccessState(user.hotel_id);
  const isActive = hotel && !hotel.deleted_at && Boolean(hotel.is_active);

  if (!isActive) {
    throw new AppError(
      'This hotel has been deactivated. Please contact the platform administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }
};

module.exports = {
  resolveHotelId,
  assertHotelActive,
};
