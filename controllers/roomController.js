/**
 * Physical Room Controller.
 * HTTP interface delegating business operations to roomService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const roomService = require('../services/roomService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/rooms
 * Create a physical room with validation and optional S3 image uploads
 */
const createRoom = async (req, res, next) => {
  try {
    const data = await roomService.createRoom(req.body, req.files, req.user);
    return success(res, MESSAGES.ROOM_CREATED_SUCCESS, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/rooms
 * List physical rooms with pagination and filters
 */
const getRooms = async (req, res, next) => {
  try {
    const data = await roomService.getRooms(req.query, req.user);
    return success(
      res,
      MESSAGES.ROOMS_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/rooms/:id
 * Get a single physical room by ID
 */
const getRoomById = async (req, res, next) => {
  try {
    const data = await roomService.getRoomById(req.params.id, req.user);
    return success(
      res,
      MESSAGES.ROOM_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/rooms/:id
 * Update physical room details and optionally upload new images
 */
const updateRoom = async (req, res, next) => {
  try {
    const data = await roomService.updateRoom(req.params.id, req.body, req.files, req.user);
    return success(res, MESSAGES.ROOM_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/rooms/:id/status
 * Update only the room status
 */
const updateRoomStatus = async (req, res, next) => {
  try {
    const data = await roomService.updateRoomStatus(req.params.id, req.body, req.user);
    return success(res, MESSAGES.ROOM_STATUS_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/rooms/:id
 * Soft-delete a physical room
 */
const deleteRoom = async (req, res, next) => {
  try {
    const data = await roomService.deleteRoom(req.params.id, req.user);
    return success(res, MESSAGES.ROOM_DELETED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
};
