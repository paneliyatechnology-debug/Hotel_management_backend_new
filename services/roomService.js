/**
 * Physical Room Service.
 * Implements business operations, verification of hotel and room types,
 * composite uniqueness per hotel and floor, S3 image uploads, and soft deletion.
 */
const roomModel = require('../models/roomModel');
const s3Service = require('./s3Service');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const { extractImageFiles } = require('../utils/files');
const { HTTP_STATUS, ROOM_STATUSES, CLEANING_DURATION_MINUTES } = require('../constants');

/**
 * Create a new physical room
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const createRoom = async (body, files = [], reqUser = null) => {
  // hotel_id comes from the authenticated user token. Body hotel_id is ignored.
  const hotelId = resolveHotelId(reqUser);

  const roomTypeId = Number(body.room_type_id);
  if (!roomTypeId || isNaN(roomTypeId) || roomTypeId <= 0) {
    throw new AppError('A valid room_type_id is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'room_type_id', message: 'room_type_id must be a positive integer.' },
    ]);
  }

  const roomNumber = body.room_number ? String(body.room_number).trim() : '';
  if (!roomNumber) {
    throw new AppError('Room number (room_number) is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'room_number', message: 'room_number cannot be empty.' },
    ]);
  }

  const floor = body.floor !== undefined ? Number(body.floor) : 1;
  if (isNaN(floor)) {
    throw new AppError('Floor must be a valid integer.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'floor', message: 'Floor must be a valid integer.' },
    ]);
  }

  // 1. Verify hotel and room type existence and relationship
  const verifyResult = await roomModel.verifyHotelAndRoomType(hotelId, roomTypeId);
  if (!verifyResult.valid) {
    throw new AppError(verifyResult.error, HTTP_STATUS.BAD_REQUEST);
  }

  // 2. Room numbers are unique per hotel and floor. Soft-deleted rooms are ignored.
  // The same room number is allowed in a different hotel.
  const duplicate = await roomModel.findRoomByHotelFloorAndNumber(hotelId, floor, roomNumber);
  if (duplicate) {
    throw new AppError(
      `Room number '${roomNumber}' already exists on floor ${floor} for this hotel.`,
      HTTP_STATUS.CONFLICT
    );
  }

  // 3. Process image uploads to S3
  const imageFiles = extractImageFiles(files);
  let imageRecords = [];
  if (imageFiles.length > 0) {
    try {
      imageRecords = await s3Service.uploadFiles(imageFiles, 'rooms');
    } catch (s3Error) {
      throw new AppError(
        `Failed to upload room images to S3: ${s3Error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 4. Parse amenities
  let amenities = [];
  if (body.amenities) {
    if (Array.isArray(body.amenities)) {
      amenities = body.amenities;
    } else if (typeof body.amenities === 'string') {
      try {
        amenities = JSON.parse(body.amenities);
      } catch (_) {
        amenities = body.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  // 5. Create room in database
  const newRoom = await roomModel.createRoom(
    {
      hotel_id: hotelId,
      room_number: roomNumber,
      room_type_id: roomTypeId,
      floor,
      status: body.status ? String(body.status).toUpperCase() : 'AVAILABLE',
      seating_capacity: body.seating_capacity !== undefined ? Number(body.seating_capacity) : 2,
      bed_count: body.bed_count !== undefined ? Number(body.bed_count) : 1,
      bed_type: body.bed_type ? String(body.bed_type).trim() : '1 King Bed',
      custom_price_per_night:
        body.custom_price_per_night !== undefined && body.custom_price_per_night !== ''
          ? Number(body.custom_price_per_night)
          : null,
      notes: body.notes ? String(body.notes).trim() : '',
      amenities,
      cleaning_started_at: body.cleaning_started_at ? new Date(body.cleaning_started_at) : null,
      cleaning_duration_minutes:
        body.cleaning_duration_minutes !== undefined ? Number(body.cleaning_duration_minutes) : 15,
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    },
    imageRecords
  );

  return newRoom;
};

/**
 * List physical rooms with pagination and filters
 * @param {Object} query
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ rooms: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const getRooms = async (query = {}, reqUser = null) => {
  const filters = {};

  if (reqUser && reqUser.hotel_id) {
    filters.hotel_id = Number(reqUser.hotel_id);
  }
  if (query.floor !== undefined && query.floor !== '') filters.floor = Number(query.floor);
  if (query.room_type_id) filters.room_type_id = Number(query.room_type_id);
  if (query.status) filters.status = String(query.status).trim();
  if (query.is_active !== undefined && query.is_active !== '') filters.is_active = query.is_active;
  if (query.search || query.room_number) filters.search = query.search || query.room_number;

  const pagination = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
  };

  const sorting = {
    sort_by: query.sort_by,
    sort_order: query.sort_order,
  };

  return roomModel.findRooms(filters, pagination, sorting);
};

/**
 * Get a single physical room by ID
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const getRoomById = async (id, reqUser = null) => {
  const room = await roomModel.findRoomById(id);
  if (!room) {
    throw new AppError('Physical room not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (reqUser && reqUser.hotel_id) {
    if (Number(room.hotel_id) !== Number(reqUser.hotel_id)) {
      throw new AppError(
        'Access denied. You do not have permission to view rooms belonging to another hotel.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }
  return room;
};

/**
 * Update an existing physical room
 * @param {number|string} id
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const updateRoom = async (id, body, files = [], reqUser = null) => {
  const existing = await roomModel.findRoomById(id);
  if (!existing) {
    throw new AppError('Physical room not found.', HTTP_STATUS.NOT_FOUND);
  }

  const hotelId = resolveHotelId(reqUser);
  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied. You do not have permission to modify rooms belonging to another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  const targetRoomTypeId = body.room_type_id !== undefined ? Number(body.room_type_id) : existing.room_type_id;
  const targetFloor = body.floor !== undefined ? Number(body.floor) : existing.floor;
  const targetRoomNumber =
    body.room_number !== undefined ? String(body.room_number).trim() : existing.room_number;

  // 1. Room category must belong to the token hotel. Body hotel_id is ignored.
  if (body.room_type_id !== undefined) {
    const verifyResult = await roomModel.verifyHotelAndRoomType(hotelId, targetRoomTypeId);
    if (!verifyResult.valid) {
      throw new AppError(verifyResult.error, HTTP_STATUS.BAD_REQUEST);
    }
  }

  // 2. Unique per hotel and floor. Exclude this room so it can keep its number.
  // Soft-deleted rooms do not count.
  const duplicate = await roomModel.findRoomByHotelFloorAndNumber(
    hotelId,
    targetFloor,
    targetRoomNumber,
    { excludeId: id }
  );
  if (duplicate) {
    throw new AppError(
      `Room number '${targetRoomNumber}' already exists on floor ${targetFloor} for this hotel.`,
      HTTP_STATUS.CONFLICT
    );
  }

  // 3. Process new S3 image uploads if provided
  const imageFiles = extractImageFiles(files);
  let newImageRecords = [];
  if (imageFiles.length > 0) {
    try {
      newImageRecords = await s3Service.uploadFiles(imageFiles, 'rooms');
    } catch (s3Error) {
      throw new AppError(
        `Failed to upload room images to S3: ${s3Error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 4. Build updates payload
  const updates = {};
  if (body.room_type_id !== undefined) updates.room_type_id = targetRoomTypeId;
  if (body.room_number !== undefined) updates.room_number = targetRoomNumber;
  if (body.floor !== undefined) updates.floor = targetFloor;
  if (body.status !== undefined) updates.status = String(body.status).toUpperCase();
  if (body.seating_capacity !== undefined) updates.seating_capacity = Number(body.seating_capacity);
  if (body.bed_count !== undefined) updates.bed_count = Number(body.bed_count);
  if (body.bed_type !== undefined) updates.bed_type = String(body.bed_type).trim();
  if (body.custom_price_per_night !== undefined) {
    updates.custom_price_per_night =
      body.custom_price_per_night !== '' && body.custom_price_per_night !== null
        ? Number(body.custom_price_per_night)
        : null;
  }
  if (body.notes !== undefined) updates.notes = String(body.notes).trim();
  if (body.amenities !== undefined) {
    if (Array.isArray(body.amenities)) {
      updates.amenities = body.amenities;
    } else if (typeof body.amenities === 'string') {
      try {
        updates.amenities = JSON.parse(body.amenities);
      } catch (_) {
        updates.amenities = body.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  if (body.cleaning_started_at !== undefined) {
    updates.cleaning_started_at = body.cleaning_started_at ? new Date(body.cleaning_started_at) : null;
  }
  if (body.cleaning_duration_minutes !== undefined) {
    updates.cleaning_duration_minutes = Number(body.cleaning_duration_minutes);
  }
  if (body.is_active !== undefined) {
    updates.is_active = body.is_active === true || body.is_active === 'true' || body.is_active === 1 || body.is_active === '1';
  }

  const updated = await roomModel.updateRoom(id, updates, newImageRecords);
  return updated;
};

/**
 * Update only the room status.
 * hotel_id comes from the authenticated user token. Price, number, and other fields are not changed.
 * @param {number|string} id
 * @param {Object} body - { status }
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const updateRoomStatus = async (id, body = {}, reqUser = null) => {
  const hotelId = resolveHotelId(reqUser);

  const existing = await roomModel.findRoomById(id);
  if (!existing) {
    throw new AppError('Physical room not found.', HTTP_STATUS.NOT_FOUND);
  }

  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied. You do not have permission to modify rooms belonging to another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  const status = body.status ? String(body.status).trim().toUpperCase() : '';
  if (!ROOM_STATUSES.includes(status)) {
    throw new AppError(
      `Status must be one of: ${ROOM_STATUSES.join(', ')}.`,
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'status', message: `Status must be one of: ${ROOM_STATUSES.join(', ')}.` }]
    );
  }

  // Setting CLEANING by hand starts the same cleaning timer that checkout starts.
  const updates = status === 'CLEANING' ? { status, cleaning_started_at: new Date() } : { status };
  return roomModel.updateRoom(id, updates);
};

/**
 * Make rooms AVAILABLE once their cleaning time has passed.
 * Rooms without a cleaning start time are left alone.
 * @param {Date} [now]
 * @returns {Promise<number>} Number of rooms released
 */
const releaseCleanedRooms = async (now = new Date()) => {
  const rooms = await roomModel.findCleaningRooms();
  let released = 0;

  for (const room of rooms) {
    const minutes = Number(room.cleaning_duration_minutes) || CLEANING_DURATION_MINUTES;
    const readyAt = new Date(room.cleaning_started_at).getTime() + minutes * 60 * 1000;
    if (readyAt > now.getTime()) continue;

    await roomModel.updateRoom(room.id, { status: 'AVAILABLE', cleaning_started_at: null });
    released += 1;
  }

  return released;
};

/**
 * Soft delete a physical room
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const deleteRoom = async (id, reqUser = null) => {
  const existing = await roomModel.findRoomById(id);
  if (!existing) {
    throw new AppError('Physical room not found.', HTTP_STATUS.NOT_FOUND);
  }

  const hotelId = resolveHotelId(reqUser);
  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied. You do not have permission to delete rooms belonging to another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Only a free room can be deleted. A room in use must be freed first.
  if (existing.status !== 'AVAILABLE') {
    const message = `Only an AVAILABLE room can be deleted. This room is ${existing.status}.`;
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST, [{ field: 'id', message }]);
  }

  const deleted = await roomModel.softDeleteRoom(id);
  return deleted;
};

module.exports = {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  updateRoomStatus,
  releaseCleanedRooms,
  deleteRoom,
};
