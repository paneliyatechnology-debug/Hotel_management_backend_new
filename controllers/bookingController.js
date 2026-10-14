/**
 * Booking Controller.
 * HTTP interface delegating business operations to bookingService.
 * Standardizes responses using success() helper and routes errors to next(err).
 * Follows TradeNexa controller architecture.
 */
const bookingService = require('../services/bookingService');
const bookingPdfService = require('../services/bookingPdfService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/bookings
 * Create a new booking with room allocations, accompanying guests, and S3 media
 */
const createBooking = async (req, res, next) => {
  try {
    const data = await bookingService.createBooking(req.body, req.files, req.user);
    return success(
      res,
      MESSAGES.BOOKING_CREATED_SUCCESS,
      data,
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/bookings
 * List bookings with filtering, search, and pagination
 */
const getBookings = async (req, res, next) => {
  try {
    const data = await bookingService.getBookings(req.query, req.user);
    return success(
      res,
      MESSAGES.BOOKINGS_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/bookings/:id
 * Get full booking details and payment history by ID
 */
const getBookingById = async (req, res, next) => {
  try {
    const data = await bookingService.getBookingDetails(req.params.id, req.user);
    return success(
      res,
      MESSAGES.BOOKING_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/bookings/:id/pdf
 * Generate the booking folio and return a URL that opens the PDF.
 */
const getBookingPdf = async (req, res, next) => {
  try {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${proto}://${req.get('host')}`;
    const data = await bookingPdfService.generateBookingPdf(req.params.id, req.user, baseUrl);
    return success(
      res,
      MESSAGES.BOOKING_PDF_GENERATED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/bookings/:id
 * Update booking details, room allocations, guests, and media
 */
const updateBooking = async (req, res, next) => {
  try {
    const data = await bookingService.updateBooking(req.params.id, req.body, req.files, req.user);
    return success(
      res,
      MESSAGES.BOOKING_UPDATED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/bookings/:id/check-out
 * Check the guest out, settle optional payment, and mark the room for cleaning
 */
const checkOutBooking = async (req, res, next) => {
  try {
    const data = await bookingService.checkOutBooking(req.params.id, req.body, req.user);
    return success(
      res,
      MESSAGES.BOOKING_CHECKED_OUT_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/bookings/:id/status
 * Update only the booking stay status
 */
const updateBookingStatus = async (req, res, next) => {
  try {
    const data = await bookingService.updateBookingStatus(req.params.id, req.body, req.user);
    return success(
      res,
      MESSAGES.BOOKING_STATUS_UPDATED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/bookings/:id
 * Soft-delete a booking
 */
const deleteBooking = async (req, res, next) => {
  try {
    const data = await bookingService.deleteBooking(req.params.id, req.user);
    return success(
      res,
      MESSAGES.BOOKING_DELETED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  getBookingPdf,
  updateBooking,
  checkOutBooking,
  updateBookingStatus,
  deleteBooking,
};
