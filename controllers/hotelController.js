/**
 * Hotel controller.
 * Lean HTTP interface delegating business operations to hotelService.
 * Standardizes responses using success() helper and routes errors to next(err).
 * Modeled after TradeNexa controller architecture.
 */
const hotelService = require('../services/hotelService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/hotel/register
 * Register a new hotel & immediately activate 30-day free trial.
 */
const registerHotel = async (req, res, next) => {
  try {
    const data = await hotelService.registerHotel(req.body, res);
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

module.exports = {
  registerHotel,
};
