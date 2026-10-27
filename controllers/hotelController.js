/**
 * Hotel controller.
 * Lean HTTP interface delegating business operations to hotelService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const hotelService = require('../services/hotelService');
const { success } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/hotel/register
 * Register a new hotel & immediately activate 30-day free trial.
 */
const registerHotel = async (req, res, next) => {
  try {
    const data = await hotelService.registerHotel(req.body, res, req.files, {
      request_meta: getRequestMeta(req),
    });
    return success(
      res,
      MESSAGES.HOTEL_REGISTERED_SUCCESS,
      data,
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/hotels (super admin)
 * Create a hotel and its owner account.
 */
const createHotel = async (req, res, next) => {
  try {
    const data = await hotelService.createHotel(req.body, req.files, req.user);
    return success(res, MESSAGES.HOTEL_CREATED_SUCCESS, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/hotels (super admin)
 * List hotels with filters, search, sorting and pagination.
 */
const getHotels = async (req, res, next) => {
  try {
    const data = await hotelService.getHotels(req.query);
    return success(res, MESSAGES.HOTELS_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/hotels/:id (super admin)
 */
const getHotelById = async (req, res, next) => {
  try {
    const data = await hotelService.getHotelById(req.params.id);
    return success(res, MESSAGES.HOTEL_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/hotels/:id (super admin)
 * Update hotel details and subscription.
 */
const updateHotel = async (req, res, next) => {
  try {
    const data = await hotelService.updateHotel(req.params.id, req.body, req.files, req.user);
    return success(res, MESSAGES.HOTEL_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/hotels/me (hotel admin)
 * Update the hotel profile of the logged-in hotel admin. Owner email and phone cannot be changed.
 */
const updateOwnHotel = async (req, res, next) => {
  try {
    const data = await hotelService.updateOwnHotel(req.body, req.files, req.user);
    return success(res, MESSAGES.HOTEL_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/hotels/:id/active-status (super admin)
 * Switch a hotel on or off.
 */
const updateHotelActiveStatus = async (req, res, next) => {
  try {
    const data = await hotelService.setHotelActive(req.params.id, req.body.is_active, req.user, req.body.reason);
    return success(res, MESSAGES.HOTEL_ACTIVE_STATUS_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/hotels/:id (super admin)
 * Soft delete a hotel and its users.
 */
const deleteHotel = async (req, res, next) => {
  try {
    const data = await hotelService.deleteHotel(req.params.id, req.user);
    return success(res, MESSAGES.HOTEL_DELETED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerHotel,
  createHotel,
  getHotels,
  getHotelById,
  updateHotel,
  updateOwnHotel,
  updateHotelActiveStatus,
  deleteHotel,
};
