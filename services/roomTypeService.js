/**
 * Room Type (Category) Service.
 * Implements business logic for managing room categories, image storage in S3,
 * uniqueness constraints, and physical room assignment deletion checks.
 */
const roomTypeModel = require('../models/roomTypeModel');
const s3Service = require('./s3Service');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const { extractImageFiles } = require('../utils/files');
const { HTTP_STATUS } = require('../constants');

/**
 * Get all active room categories for the authenticated user's hotel.
 * Query hotel_id is ignored. Unauthenticated callers receive every active category.
 * @param {Object} [_query={}]
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object[]>}
 */
const getAllRoomTypes = async (_query = {}, reqUser = null) => {
  const filters = {};
  if (reqUser && reqUser.hotel_id) {
    filters.hotel_id = Number(reqUser.hotel_id);
  }

  return roomTypeModel.findActiveRoomTypes(filters);
};

/**
 * Get single room category by ID
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const getRoomTypeById = async (id, reqUser = null) => {
  const roomType = await roomTypeModel.findRoomTypeById(id);
  if (!roomType) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (reqUser && reqUser.hotel_id) {
    if (Number(roomType.hotel_id) !== Number(reqUser.hotel_id)) {
      throw new AppError(
        'Access denied. You do not have permission to view room categories belonging to another hotel.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }
  return roomType;
};

/**
 * Create a new room category with S3 image upload and uniqueness check.
 * hotel_id comes from the authenticated user token. Body hotel_id is ignored.
 * @param {Object} body - { name, description }
 * @param {Array<Object>} [files=[]] - Uploaded image files
 * @param {Object} [reqUser=null]
 * @returns {Promise<void>}
 */
const createRoomType = async (body, files = [], reqUser = null) => {
  const hotelId = resolveHotelId(reqUser);

  const name = body.name ? body.name.trim() : '';
  if (!name) {
    throw new AppError('Room category name is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'name', message: 'Room category name cannot be empty.' },
    ]);
  }

  // 1. Verify hotel exists
  const hotelExists = await roomTypeModel.hotelExists(hotelId);
  if (!hotelExists) {
    throw new AppError(`Hotel with ID ${hotelId} does not exist.`, HTTP_STATUS.NOT_FOUND);
  }

  // 2. Enforce unique category names per hotel
  const duplicate = await roomTypeModel.findRoomTypeByNameAndHotel(name, hotelId);
  if (duplicate) {
    throw new AppError(
      `Room category with name '${name}' already exists for this hotel.`,
      HTTP_STATUS.CONFLICT
    );
  }

  // 3. Process image uploads to S3
  const imageFiles = extractImageFiles(files);
  let imageRecords = [];
  if (imageFiles.length > 0) {
    try {
      imageRecords = await s3Service.uploadFiles(imageFiles, 'room-types');
    } catch (s3Error) {
      throw new AppError(
        `Failed to upload category images to S3: ${s3Error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 4. Create database record and relational image entries
  await roomTypeModel.createRoomType(
    {
      hotel_id: hotelId,
      name,
      description: body.description ? String(body.description).trim() : '',
    },
    imageRecords
  );
};

/**
 * Update an existing room category with validation and optional new S3 images
 * @param {number|string} id
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<void>}
 */
const updateRoomType = async (id, body, files = [], reqUser = null) => {
  const existing = await roomTypeModel.findRoomTypeById(id);
  if (!existing) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }

  const hotelId = resolveHotelId(reqUser);
  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied. You do not have permission to modify room categories belonging to another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  const updates = {};

  if (body.name !== undefined) {
    const newName = body.name.trim();
    if (!newName) {
      throw new AppError('Room category name cannot be empty.', HTTP_STATUS.BAD_REQUEST, [
        { field: 'name', message: 'Room category name cannot be empty.' },
      ]);
    }

    // Same hotel only. Soft-deleted categories are ignored. This record is excluded.
    const duplicate = await roomTypeModel.findRoomTypeByNameAndHotel(newName, hotelId, {
      excludeId: id,
    });
    if (duplicate) {
      throw new AppError(
        `Room category with name '${newName}' already exists for this hotel.`,
        HTTP_STATUS.CONFLICT
      );
    }
    updates.name = newName;
  }

  if (body.description !== undefined) {
    updates.description = String(body.description).trim();
  }

  // Process new image uploads to S3 if provided
  const imageFiles = extractImageFiles(files);
  let newImageRecords = [];
  if (imageFiles.length > 0) {
    try {
      newImageRecords = await s3Service.uploadFiles(imageFiles, 'room-types');
    } catch (s3Error) {
      throw new AppError(
        `Failed to upload category images to S3: ${s3Error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  await roomTypeModel.updateRoomType(id, updates, newImageRecords);
};

/**
 * Safely delete a category only if no physical rooms are assigned to it
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<void>}
 */
const deleteRoomType = async (id, reqUser = null) => {
  const existing = await roomTypeModel.findRoomTypeById(id);
  if (!existing) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }

  const hotelId = resolveHotelId(reqUser);
  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied. You do not have permission to delete room categories belonging to another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Safely check if physical rooms are assigned to it
  const assignedRoomsCount = await roomTypeModel.countAssignedRooms(id);
  if (assignedRoomsCount > 0) {
    throw new AppError(
      `Cannot delete room category. There are ${assignedRoomsCount} physical room(s) assigned to this category. Please reassign or delete the physical rooms first.`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  await roomTypeModel.softDeleteRoomType(id);
};

module.exports = {
  getAllRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  deleteRoomType,
};
