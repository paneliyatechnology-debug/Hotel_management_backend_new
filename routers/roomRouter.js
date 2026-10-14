/**
 * Physical Room Router.
 * Mounts endpoints for Physical Rooms:
 * 1. POST /api/v1/rooms – Create a physical room (HOTEL_ADMIN).
 * 2. GET /api/v1/rooms – List rooms (HOTEL_ADMIN or RECEPTIONIST).
 * 3. GET /api/v1/rooms/:id – Get a single room (HOTEL_ADMIN or RECEPTIONIST).
 * 4. PUT /api/v1/rooms/:id – Update room details (HOTEL_ADMIN).
 * 5. PATCH /api/v1/rooms/:id/status – Update only the room status (HOTEL_ADMIN or RECEPTIONIST).
 * 6. DELETE /api/v1/rooms/:id – Soft-delete a room (HOTEL_ADMIN).
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

const hotelStaff = requireRole(ROLE_CODES.HOTEL_ADMIN, ROLE_CODES.RECEPTIONIST);
const hotelAdminOnly = requireRole(ROLE_CODES.HOTEL_ADMIN);

router.use(authenticateUser);

/**
 * POST /api/v1/rooms
 * Create a physical room
 */
router.post(
  '/',
  hotelAdminOnly,
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
  hotelStaff,
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
  hotelStaff,
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
  hotelAdminOnly,
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
  hotelStaff,
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
  hotelAdminOnly,
  deleteRoomValidator,
  validate,
  roomController.deleteRoom
);

module.exports = router;
