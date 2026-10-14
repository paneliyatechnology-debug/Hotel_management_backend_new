/**
 * Physical Room Router.
 * Mounts endpoints for Physical Rooms:
 * 1. POST /api/v1/rooms – Create a physical room with validation and S3 image uploads.
 * 2. GET /api/v1/rooms – List rooms with pagination, filters, and floor sort (asc or desc).
 * 3. GET /api/v1/rooms/:id – Get a single room by ID.
 * 4. PUT /api/v1/rooms/:id – Update room details.
 * 5. PATCH /api/v1/rooms/:id/status – Update only the room status.
 * 6. DELETE /api/v1/rooms/:id – Soft-delete a room.
 *
 * Every route requires a logged-in HOTEL_ADMIN or RECEPTIONIST of that hotel.
 */
const express = require('express');
const roomController = require('../controllers/roomController');
const {
  createRoomValidator,
  updateRoomValidator,
  updateRoomStatusValidator,
  getRoomByIdValidator,
  deleteRoomValidator,
  getRoomsQueryValidator,
} = require('../middleware/roomValidator');
const { validate } = require('../middleware/validation');
const { uploadRoomImages } = require('../middleware/upload');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// ==========================================
// Authentication and role guard
// ==========================================
router.use(authenticateUser);
router.use(requireRole(ROLE_CODES.HOTEL_ADMIN, ROLE_CODES.RECEPTIONIST));

// ==========================================
// Physical Room Endpoints
// ==========================================

/**
 * POST /api/v1/rooms
 * Create a physical room
 */
router.post(
  '/',
  uploadRoomImages,
  createRoomValidator,
  validate,
  roomController.createRoom
);

/**
 * GET /api/v1/rooms
 * List physical rooms with pagination and filters
 */
router.get(
  '/',
  getRoomsQueryValidator,
  validate,
  roomController.getRooms
);

/**
 * GET /api/v1/rooms/:id
 * Get a single physical room by ID
 */
router.get(
  '/:id',
  getRoomByIdValidator,
  validate,
  roomController.getRoomById
);

/**
 * PUT /api/v1/rooms/:id
 * Update physical room details
 */
router.put(
  '/:id',
  uploadRoomImages,
  updateRoomValidator,
  validate,
  roomController.updateRoom
);

/**
 * PATCH /api/v1/rooms/:id/status
 * Update only the room status
 */
router.patch(
  '/:id/status',
  updateRoomStatusValidator,
  validate,
  roomController.updateRoomStatus
);

/**
 * DELETE /api/v1/rooms/:id
 * Soft-delete a physical room
 */
router.delete(
  '/:id',
  deleteRoomValidator,
  validate,
  roomController.deleteRoom
);

module.exports = router;
