/**
 * Room Type (Category) Controller.
 * HTTP interface delegating business operations to roomTypeService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const roomTypeService = require('../services/roomTypeService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * GET /api/v1/room-types
 * Get all active room categories, with optional hotel_id filtering
 */
const getAllRoomTypes = async (req, res, next) => {
  try {
    const data = await roomTypeService.getAllRoomTypes(req.query, req.user);
    return success(
      res,
      MESSAGES.ROOM_TYPES_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/room-types/:id
 * Get a single room category by ID
 */
const getRoomTypeById = async (req, res, next) => {
  try {
    const data = await roomTypeService.getRoomTypeById(req.params.id, req.user);
    return success(
      res,
      MESSAGES.ROOM_TYPE_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/room-types
 * Create a new room category using hotel_id, name, description, and images[]
 */
const createRoomType = async (req, res, next) => {
  try {
    const data = await roomTypeService.createRoomType(req.body, req.files, req.user);
    return success(
      res,
      MESSAGES.ROOM_TYPE_CREATED_SUCCESS,
      data,
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/room-types/:id
 * Update an existing room category with proper validation
 */
const updateRoomType = async (req, res, next) => {
  try {
    const data = await roomTypeService.updateRoomType(req.params.id, req.body, req.files, req.user);
    return success(
      res,
      MESSAGES.ROOM_TYPE_UPDATED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/room-types/:id
 * Safely delete a category only if no physical rooms are assigned to it
 */
const deleteRoomType = async (req, res, next) => {
  try {
    const data = await roomTypeService.deleteRoomType(req.params.id, req.user);
    return success(
      res,
      MESSAGES.ROOM_TYPE_DELETED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  deleteRoomType,
};
