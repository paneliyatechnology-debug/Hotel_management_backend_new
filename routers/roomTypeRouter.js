/**
 * Room Type (Category) Router.
 * Mounts endpoints for Room Categories:
 * 1. GET /api/v1/room-types – List categories (HOTEL_ADMIN or RECEPTIONIST).
 * 2. GET /api/v1/room-types/:id – Get one category (HOTEL_ADMIN or RECEPTIONIST).
 * 3. POST /api/v1/room-types – Create a category (HOTEL_ADMIN).
 * 4. PUT /api/v1/room-types/:id – Update a category (HOTEL_ADMIN).
 * 5. DELETE /api/v1/room-types/:id – Delete a category (HOTEL_ADMIN).
 */
const express = require('express');
const roomTypeController = require('../controllers/roomTypeController');
const {
  getRoomTypesQueryValidator,
  getRoomTypeByIdValidator,
  createRoomTypeValidator,
  updateRoomTypeValidator,
  deleteRoomTypeValidator,
} = require('../middleware/roomTypeValidator');
const { validate } = require('../middleware/validation');
const { uploadRoomImages } = require('../middleware/upload');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

const hotelStaff = requireRole(ROLE_CODES.HOTEL_ADMIN, ROLE_CODES.RECEPTIONIST);
const hotelAdminOnly = requireRole(ROLE_CODES.HOTEL_ADMIN);

router.use(authenticateUser);

/**
 * GET /api/v1/room-types
 * Get all active room categories
 */
router.get(
  '/',
  hotelStaff,
  getRoomTypesQueryValidator,
  validate,
  roomTypeController.getAllRoomTypes
);

/**
 * GET /api/v1/room-types/:id
 * Get a single room category by ID
 */
router.get(
  '/:id',
  hotelStaff,
  getRoomTypeByIdValidator,
  validate,
  roomTypeController.getRoomTypeById
);

/**
 * POST /api/v1/room-types
 * Create a category
 */
router.post(
  '/',
  hotelAdminOnly,
  uploadRoomImages,
  createRoomTypeValidator,
  validate,
  roomTypeController.createRoomType
);

/**
 * PUT /api/v1/room-types/:id
 * Update an existing category
 */
router.put(
  '/:id',
  hotelAdminOnly,
  uploadRoomImages,
  updateRoomTypeValidator,
  validate,
  roomTypeController.updateRoomType
);

/**
 * DELETE /api/v1/room-types/:id
 * Soft-delete a category when no physical rooms use it
 */
router.delete(
  '/:id',
  hotelAdminOnly,
  deleteRoomTypeValidator,
  validate,
  roomTypeController.deleteRoomType
);

module.exports = router;
