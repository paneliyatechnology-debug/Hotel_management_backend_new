/**
 * Booking Router.
 * Mounts endpoints for Booking management:
 * 1. POST /api/v1/bookings – Create a booking. room_id is an array, and every room is occupied together.
 * 2. GET /api/v1/bookings – List bookings with pagination and filters (hotel, room, booking number, guest, mobile, status, dates).
 * 3. GET /api/v1/bookings/:id – Get complete booking details.
 * 4. PUT /api/v1/bookings/:id – Update booking details and relations.
 * 5. POST /api/v1/bookings/:id/check-out – Check out a booking and mark the room for cleaning.
 * 6. PATCH /api/v1/bookings/:id/status – Update only the booking stay status.
 * 7. DELETE /api/v1/bookings/:id – Soft-delete a booking.
 *
 * Every route requires a logged-in HOTEL_ADMIN or RECEPTIONIST of that hotel.
 * Follows TradeNexa router architecture.
 */
const express = require('express');
const bookingController = require('../controllers/bookingController');
const {
  createBookingValidator,
  updateBookingValidator,
  getBookingByIdValidator,
  checkOutBookingValidator,
  deleteBookingValidator,
  getBookingsQueryValidator,
  updateBookingStatusValidator,
} = require('../middleware/bookingValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');
const { uploadRoomImages } = require('../middleware/upload');

const router = express.Router();

// ==========================================
// Authentication and role guard
// ==========================================
router.use(authenticateUser);
router.use(requireRole(ROLE_CODES.HOTEL_ADMIN, ROLE_CODES.RECEPTIONIST));

// ==========================================
// Booking Endpoints
// ==========================================

/**
 * POST /api/v1/bookings
 * Create a new booking
 */
router.post(
  '/',
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
  uploadRoomImages,
  updateBookingValidator,
  validate,
  bookingController.updateBooking
);

/**
 * POST /api/v1/bookings/:id/check-out
 * Check the guest out and mark the room CLEANING
 */
router.post(
  '/:id/check-out',
  checkOutBookingValidator,
  validate,
  bookingController.checkOutBooking
);

/**
 * PATCH /api/v1/bookings/:id/status
 * Update only the booking stay status
 */
router.patch(
  '/:id/status',
  updateBookingStatusValidator,
  validate,
  bookingController.updateBookingStatus
);

/**
 * DELETE /api/v1/bookings/:id
 * Soft-delete a booking
 */
router.delete(
  '/:id',
  deleteBookingValidator,
  validate,
  bookingController.deleteBooking
);

module.exports = router;
