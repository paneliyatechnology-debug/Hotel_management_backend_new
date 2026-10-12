/**
 * Booking Router.
 * Mounts endpoints for Booking management:
 * 1. POST /api/v1/bookings – Create a booking with guest details, room allocations, accompanying guests, S3 images & signatures.
 * 2. GET /api/v1/bookings – List bookings with pagination and filters (hotel, room, booking number, guest, mobile, status, dates).
 * 3. GET /api/v1/bookings/:id – Get complete booking details.
 * 4. PUT /api/v1/bookings/:id – Update booking details and relations.
 * 5. DELETE /api/v1/bookings/:id – Soft-delete a booking.
 *
 * Follows TradeNexa router architecture.
 */
const express = require('express');
const bookingController = require('../controllers/bookingController');
const {
  createBookingValidator,
  updateBookingValidator,
  getBookingByIdValidator,
  deleteBookingValidator,
  getBookingsQueryValidator,
} = require('../middleware/bookingValidator');
const { validate } = require('../middleware/validation');
const { optionalAuthenticate } = require('../middleware/auth');
const { uploadRoomImages } = require('../middleware/upload');

const router = express.Router();

// ==========================================
// Booking Endpoints
// ==========================================

/**
 * POST /api/v1/bookings
 * Create a new booking
 */
router.post(
  '/',
  optionalAuthenticate,
  uploadRoomImages,
  createBookingValidator,
  validate,
  bookingController.createBooking
);

/**
 * GET /api/v1/bookings
 * List bookings with filtering, search, and pagination
 */
router.get(
  '/',
  optionalAuthenticate,
  getBookingsQueryValidator,
  validate,
  bookingController.getBookings
);

/**
 * GET /api/v1/bookings/:id
 * Get complete booking details by ID
 */
router.get(
  '/:id',
  optionalAuthenticate,
  getBookingByIdValidator,
  validate,
  bookingController.getBookingById
);

/**
 * PUT /api/v1/bookings/:id
 * Update booking details
 */
router.put(
  '/:id',
  optionalAuthenticate,
  uploadRoomImages,
  updateBookingValidator,
  validate,
  bookingController.updateBooking
);

/**
 * DELETE /api/v1/bookings/:id
 * Soft-delete a booking
 */
router.delete(
  '/:id',
  optionalAuthenticate,
  deleteBookingValidator,
  validate,
  bookingController.deleteBooking
);

module.exports = router;
