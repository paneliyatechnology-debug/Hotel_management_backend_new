/**
 * Room Type (Category) Router.
 * Mounts endpoints for Room Categories:
 * 1. GET /api/v1/room-types – Get all active room categories, with optional hotel_id filtering.
 * 2. GET /api/v1/room-types/:id – Get a single room category by ID.
 * 3. POST /api/v1/room-types – Create a category using hotel_id, name, description, and images[].
 * 4. PUT /api/v1/room-types/:id – Update an existing category with proper validation.
 * 5. DELETE /api/v1/room-types/:id – Safely delete a category only if no physical rooms are assigned to it.
 *
 * Follows TradeNexa router architecture.
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
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuthenticate);

// ==========================================
// Room Category Endpoints
// ==========================================

/**
 * GET /api/v1/room-types
 * Get all active room categories, with optional hotel_id filtering
 */
router.get(
  '/',
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
  getRoomTypeByIdValidator,
  validate,
  roomTypeController.getRoomTypeById
);

/**
 * POST /api/v1/room-types
 * Create a category using hotel_id, name, description, and images[]
 * Handles multipart/form-data image uploads to S3
 */
router.post(
  '/',
  uploadRoomImages,
  createRoomTypeValidator,
  validate,
  roomTypeController.createRoomType
);

/**
 * PUT /api/v1/room-types/:id
 * Update an existing category with proper validation and optional new S3 images
 */
router.put(
  '/:id',
  uploadRoomImages,
  updateRoomTypeValidator,
  validate,
  roomTypeController.updateRoomType
);

/**
 * DELETE /api/v1/room-types/:id
 * Safely delete a category only if no physical rooms are assigned to it
 */
router.delete(
  '/:id',
  deleteRoomTypeValidator,
  validate,
  roomTypeController.deleteRoomType
);

module.exports = router;
