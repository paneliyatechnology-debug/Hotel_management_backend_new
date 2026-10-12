/**
 * Room Type (Category) Service.
 * Implements business logic for managing room categories, image storage in S3,
 * uniqueness constraints, and physical room assignment deletion checks.
 * Follows TradeNexa service architecture.
 */
const roomTypeModel = require('../models/roomTypeModel');
const s3Service = require('./s3Service');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Filter uploaded file array to only valid image buffers
 * @param {Array<Object>} files
 * @returns {Array<Object>}
 */
const extractImageFiles = (files) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  return files.filter(
    (file) =>
      file &&
      file.buffer &&
      (file.mimetype?.startsWith('image/') ||
        ['images', 'images[]', 'image'].includes(file.fieldname))
  );
};

/**
 * Get all active room categories with optional hotel_id filter
 * @param {Object} query - { hotel_id }
 * @returns {Promise<Object[]>}
 */
const getAllRoomTypes = async (query = {}) => {
  const filters = {};
  if (query.hotel_id) {
    const hotelIdNum = Number(query.hotel_id);
    if (!isNaN(hotelIdNum) && hotelIdNum > 0) {
      filters.hotel_id = hotelIdNum;
    }
  }

  return roomTypeModel.findActiveRoomTypes(filters);
};

/**
 * Get single room category by ID
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const getRoomTypeById = async (id) => {
  const roomType = await roomTypeModel.findRoomTypeById(id);
  if (!roomType) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }
  return roomType;
};

/**
 * Create a new room category with S3 image upload and uniqueness check
 * @param {Object} body - { hotel_id, name, description }
 * @param {Array<Object>} [files=[]] - Uploaded image files
 * @returns {Promise<Object>}
 */
const createRoomType = async (body, files = []) => {
  const hotelId = Number(body.hotel_id);
  if (!hotelId || isNaN(hotelId) || hotelId <= 0) {
    throw new AppError('A valid hotel_id is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'hotel_id', message: 'hotel_id must be a positive integer.' },
    ]);
  }

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
  const newRoomType = await roomTypeModel.createRoomType(
    {
      hotel_id: hotelId,
      name,
      description: body.description ? String(body.description).trim() : '',
    },
    imageRecords
  );

  return newRoomType;
};

/**
 * Update an existing room category with validation and optional new S3 images
 * @param {number|string} id
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @returns {Promise<Object>}
 */
const updateRoomType = async (id, body, files = []) => {
  const existing = await roomTypeModel.findRoomTypeById(id);
  if (!existing) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }

  const updates = {};
  const targetHotelId = body.hotel_id ? Number(body.hotel_id) : existing.hotel_id;

  if (body.hotel_id !== undefined) {
    if (isNaN(targetHotelId) || targetHotelId <= 0) {
      throw new AppError('hotel_id must be a valid positive integer.', HTTP_STATUS.BAD_REQUEST);
    }
    const hotelExists = await roomTypeModel.hotelExists(targetHotelId);
    if (!hotelExists) {
      throw new AppError(`Hotel with ID ${targetHotelId} does not exist.`, HTTP_STATUS.NOT_FOUND);
    }
    updates.hotel_id = targetHotelId;
  }

  if (body.name !== undefined) {
    const newName = body.name.trim();
    if (!newName) {
      throw new AppError('Room category name cannot be empty.', HTTP_STATUS.BAD_REQUEST, [
        { field: 'name', message: 'Room category name cannot be empty.' },
      ]);
    }

    // Enforce uniqueness within the hotel
    const duplicate = await roomTypeModel.findRoomTypeByNameAndHotel(newName, targetHotelId, {
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

  const updated = await roomTypeModel.updateRoomType(id, updates, newImageRecords);
  return updated;
};

/**
 * Safely delete a category only if no physical rooms are assigned to it
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const deleteRoomType = async (id) => {
  const existing = await roomTypeModel.findRoomTypeById(id);
  if (!existing) {
    throw new AppError('Room category not found.', HTTP_STATUS.NOT_FOUND);
  }

  // Safely check if physical rooms are assigned to it
  const assignedRoomsCount = await roomTypeModel.countAssignedRooms(id);
  if (assignedRoomsCount > 0) {
    throw new AppError(
      `Cannot delete room category. There are ${assignedRoomsCount} physical room(s) assigned to this category. Please reassign or delete the physical rooms first.`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const deleted = await roomTypeModel.softDeleteRoomType(id);
  return deleted;
};

module.exports = {
  getAllRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  deleteRoomType,
};
