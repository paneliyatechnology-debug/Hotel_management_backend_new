/**
 * Physical Room database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const db = require('../database/knex');
const { buildImageUrl, deleteFile } = require('../services/s3Service');

/**
 * Safe JSON parser helper
 * @param {any} val
 * @param {any} fallback
 * @returns {any}
 */
const parseJson = (val, fallback = []) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
};

/**
 * Format raw database row to structured Room object.
 * @param {Object} row - Raw row from rooms table
 * @param {string[]} [images=[]] - Array of full image URLs
 * @returns {Object|null}
 */
const formatRoom = (row, images = []) => {
  if (!row) return null;

  return {
    id: row.id,
    hotel_id: row.hotel_id,
    hotel_name: row.hotel_name || null,
    room_number: row.room_number,
    room_type_id: row.room_type_id,
    room_type_name: row.room_type_name || null,
    floor: Number(row.floor),
    status: row.status || 'AVAILABLE',
    seating_capacity: Number(row.seating_capacity ?? 2),
    bed_count: Number(row.bed_count ?? 1),
    bed_type: row.bed_type || '1 King Bed',
    custom_price_per_night:
      row.custom_price_per_night !== null && row.custom_price_per_night !== undefined
        ? Number(row.custom_price_per_night)
        : null,
    notes: row.notes || '',
    amenities: parseJson(row.amenities, []),
    cleaning_started_at: row.cleaning_started_at || null,
    cleaning_duration_minutes: Number(row.cleaning_duration_minutes ?? 15),
    is_active: Boolean(row.is_active),
    deleted_at: row.deleted_at || null,
    images: Array.isArray(images) ? images : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Fetch image URLs for a single physical room ID
 * @param {number|string} roomId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<string[]>}
 */
const getImagesByRoomId = async (roomId, client = db) => {
  const rows = await client('images')
    .where({ room_id: roomId })
    .orderBy('id', 'asc')
    .select('*');

  return rows.map((r) => {
    if (r.image_url && (r.image_url.startsWith('http://') || r.image_url.startsWith('https://'))) {
      return buildImageUrl(r.image_url);
    }
    const key = r.image_name || r.s3_key || '';
    return buildImageUrl(key);
  });
};

/**
 * Batch fetch image URLs for multiple physical room IDs
 * @param {Array<number|string>} roomIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Record<number, string[]>>}
 */
const getImagesByRoomIds = async (roomIds, client = db) => {
  if (!roomIds || roomIds.length === 0) return {};

  const rows = await client('images')
    .whereIn('room_id', roomIds)
    .orderBy('id', 'asc')
    .select('*');

  const map = {};
  for (const id of roomIds) {
    map[id] = [];
  }

  for (const row of rows) {
    if (!map[row.room_id]) {
      map[row.room_id] = [];
    }
    const url =
      row.image_url && (row.image_url.startsWith('http://') || row.image_url.startsWith('https://'))
        ? buildImageUrl(row.image_url)
        : buildImageUrl(row.image_name || row.s3_key || '');
    map[row.room_id].push(url);
  }

  return map;
};

/**
 * Verify hotel and room type exist and room type belongs to hotel
 * @param {number|string} hotelId
 * @param {number|string} roomTypeId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ valid: boolean, error?: string, hotel?: Object, roomType?: Object }>}
 */
const verifyHotelAndRoomType = async (hotelId, roomTypeId, client = db) => {
  const hotel = await client('hotels')
    .where({ id: hotelId })
    .whereNull('deleted_at')
    .first();
  if (!hotel) {
    return { valid: false, error: `Hotel with ID ${hotelId} does not exist.` };
  }

  const roomType = await client('room_types')
    .where({ id: roomTypeId })
    .whereNull('deleted_at')
    .first();
  if (!roomType) {
    return { valid: false, error: `Room category (room_type_id ${roomTypeId}) does not exist.` };
  }

  if (Number(roomType.hotel_id) !== Number(hotelId)) {
    return {
      valid: false,
      error: `Room category '${roomType.name}' (ID ${roomTypeId}) belongs to hotel ID ${roomType.hotel_id}, not hotel ID ${hotelId}.`,
    };
  }

  return { valid: true, hotel, roomType };
};

/**
 * Find room by composite key (hotel_id, floor, room_number)
 * @param {number|string} hotelId
 * @param {number|string} floor
 * @param {string} roomNumber
 * @param {Object} [options={}]
 * @param {number|string} [options.excludeId=null]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findRoomByHotelFloorAndNumber = async (
  hotelId,
  floor,
  roomNumber,
  { excludeId = null, includeDeleted = false } = {},
  client = db
) => {
  if (!hotelId || !roomNumber) return null;

  let query = client('rooms')
    .where({ hotel_id: hotelId, floor: Number(floor) || 1 })
    .whereRaw('LOWER(TRIM(room_number)) = ?', [String(roomNumber).trim().toLowerCase()]);

  if (!includeDeleted) {
    query = query.whereNull('deleted_at');
  }

  if (excludeId) {
    query = query.whereNot({ id: excludeId });
  }

  return query.first();
};

/**
 * Find physical room by ID with related hotel & room_type details
 * @param {number|string} id
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findRoomById = async (id, { includeDeleted = false } = {}, client = db) => {
  let query = client('rooms')
    .leftJoin('room_types', 'rooms.room_type_id', 'room_types.id')
    .leftJoin('hotels', 'rooms.hotel_id', 'hotels.id')
    .where('rooms.id', id)
    .select(
      'rooms.*',
      'room_types.name as room_type_name',
      'hotels.name as hotel_name'
    );

  if (!includeDeleted) {
    query = query.whereNull('rooms.deleted_at');
  }

  const row = await query.first();
  if (!row) return null;

  const images = await getImagesByRoomId(row.id, client);
  return formatRoom(row, images);
};

/**
 * Apply filters to rooms query
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {Object} filters
 */
const applyRoomFilters = (query, filters = {}) => {
  const { hotel_id, floor, room_type_id, status, is_active, search } = filters;

  query.whereNull('rooms.deleted_at');

  if (hotel_id) {
    query.where('rooms.hotel_id', Number(hotel_id));
  }

  if (floor !== undefined && floor !== null && floor !== '') {
    query.where('rooms.floor', Number(floor));
  }

  if (room_type_id) {
    query.where('rooms.room_type_id', Number(room_type_id));
  }

  if (status) {
    query.whereRaw('UPPER(rooms.status) = ?', [String(status).trim().toUpperCase()]);
  }

  if (is_active !== undefined && is_active !== null && is_active !== '') {
    const activeBool = is_active === true || is_active === 'true' || is_active === 1 || is_active === '1';
    query.where('rooms.is_active', activeBool);
  }

  if (search) {
    const term = `%${String(search).trim().toLowerCase()}%`;
    query.whereRaw('LOWER(rooms.room_number) LIKE ?', [term]);
  }

  return query;
};

/**
 * Find physical rooms with pagination and filtering
 * @param {Object} [filters={}]
 * @param {Object} [pagination={}]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ rooms: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const findRooms = async (filters = {}, pagination = {}, client = db) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const offset = (page - 1) * limit;

  // Count total matching records
  const countQuery = client('rooms');
  applyRoomFilters(countQuery, filters);
  const countRes = await countQuery.count('rooms.id as count').first();
  const total = Number(countRes?.count || 0);

  // Fetch paginated rows with joined names
  const query = client('rooms')
    .leftJoin('room_types', 'rooms.room_type_id', 'room_types.id')
    .leftJoin('hotels', 'rooms.hotel_id', 'hotels.id')
    .select(
      'rooms.*',
      'room_types.name as room_type_name',
      'hotels.name as hotel_name'
    );

  applyRoomFilters(query, filters);
  query.orderBy('rooms.floor', 'asc').orderBy('rooms.room_number', 'asc');
  query.limit(limit).offset(offset);

  const rows = await query;
  const roomIds = rows.map((r) => r.id);
  const imagesMap = await getImagesByRoomIds(roomIds, client);

  const rooms = rows.map((row) => formatRoom(row, imagesMap[row.id] || []));
  const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

  return {
    rooms,
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Create physical room with uploaded images inside a transaction
 * @param {Object} roomData
 * @param {Array<{ imageName: string, s3Key: string, imageUrl: string }>} [imageRecords=[]]
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const createRoom = async (roomData, imageRecords = [], trx) => {
  const execute = async (client) => {
    const now = new Date();
    const [id] = await client('rooms').insert({
      hotel_id: roomData.hotel_id,
      room_number: String(roomData.room_number).trim(),
      room_type_id: roomData.room_type_id,
      floor: roomData.floor !== undefined ? Number(roomData.floor) : 1,
      status: roomData.status || 'AVAILABLE',
      seating_capacity: roomData.seating_capacity !== undefined ? Number(roomData.seating_capacity) : 2,
      bed_count: roomData.bed_count !== undefined ? Number(roomData.bed_count) : 1,
      bed_type: roomData.bed_type || '1 King Bed',
      custom_price_per_night:
        roomData.custom_price_per_night !== undefined && roomData.custom_price_per_night !== null
          ? Number(roomData.custom_price_per_night)
          : null,
      notes: roomData.notes || '',
      amenities: JSON.stringify(roomData.amenities || []),
      cleaning_started_at: roomData.cleaning_started_at || null,
      cleaning_duration_minutes:
        roomData.cleaning_duration_minutes !== undefined ? Number(roomData.cleaning_duration_minutes) : 15,
      is_active: roomData.is_active !== undefined ? Boolean(roomData.is_active) : true,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });

    if (Array.isArray(imageRecords) && imageRecords.length > 0) {
      for (let i = 0; i < imageRecords.length; i++) {
        const img = imageRecords[i];
        await client('images').insert({
          room_id: id,
          room_type_id: null,
          image_name: img.imageName || null,
          image_url: img.imageUrl,
          s3_key: img.s3Key || null,
          is_primary: i === 0 ? 1 : 0,
          display_order: i + 1,
          created_at: now,
          updated_at: now,
        });
      }
    }

    return findRoomById(id, { includeDeleted: true }, client);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Update an existing physical room with optional new images inside a transaction
 * @param {number|string} id
 * @param {Object} updates
 * @param {Array<{ imageName: string, s3Key: string, imageUrl: string }>} [newImageRecords=[]]
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const updateRoom = async (id, updates, newImageRecords = [], trx) => {
  const execute = async (client) => {
    const updateFields = {
      updated_at: new Date(),
    };

    if (updates.hotel_id !== undefined) updateFields.hotel_id = Number(updates.hotel_id);
    if (updates.room_number !== undefined) updateFields.room_number = String(updates.room_number).trim();
    if (updates.room_type_id !== undefined) updateFields.room_type_id = Number(updates.room_type_id);
    if (updates.floor !== undefined) updateFields.floor = Number(updates.floor);
    if (updates.status !== undefined) updateFields.status = String(updates.status).trim().toUpperCase();
    if (updates.seating_capacity !== undefined) updateFields.seating_capacity = Number(updates.seating_capacity);
    if (updates.bed_count !== undefined) updateFields.bed_count = Number(updates.bed_count);
    if (updates.bed_type !== undefined) updateFields.bed_type = String(updates.bed_type).trim();
    if (updates.custom_price_per_night !== undefined) {
      updateFields.custom_price_per_night =
        updates.custom_price_per_night !== null ? Number(updates.custom_price_per_night) : null;
    }
    if (updates.notes !== undefined) updateFields.notes = String(updates.notes).trim();
    if (updates.amenities !== undefined) {
      updateFields.amenities = JSON.stringify(updates.amenities || []);
    }
    if (updates.cleaning_started_at !== undefined) updateFields.cleaning_started_at = updates.cleaning_started_at;
    if (updates.cleaning_duration_minutes !== undefined) {
      updateFields.cleaning_duration_minutes = Number(updates.cleaning_duration_minutes);
    }
    if (updates.is_active !== undefined) updateFields.is_active = Boolean(updates.is_active);

    await client('rooms').where({ id }).update(updateFields);

    if (Array.isArray(newImageRecords) && newImageRecords.length > 0) {
      // 1. Fetch old images for this room
      const oldImages = await client('images')
        .where({ room_id: id })
        .select('*');

      // 2. Delete old images from S3
      for (const old of oldImages) {
        const key = old.s3_key || old.image_name || old.image_url;
        if (key) await deleteFile(key);
      }

      // 3. Delete old images from database table to prevent duplication
      await client('images').where({ room_id: id }).delete();

      // 4. Insert new images
      const now = new Date();
      for (let i = 0; i < newImageRecords.length; i++) {
        const img = newImageRecords[i];
        await client('images').insert({
          room_id: id,
          room_type_id: null,
          image_name: img.imageName || null,
          image_url: img.imageUrl,
          s3_key: img.s3Key || null,
          is_primary: i === 0 ? 1 : 0,
          display_order: i + 1,
          created_at: now,
          updated_at: now,
        });
      }
    }

    return findRoomById(id, { includeDeleted: true }, client);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Soft delete a physical room
 * @param {number|string} id
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const softDeleteRoom = async (id, trx) => {
  const client = trx || db;
  const now = new Date();

  await client('rooms')
    .where({ id })
    .update({
      deleted_at: now,
      is_active: false,
      updated_at: now,
    });

  return findRoomById(id, { includeDeleted: true }, client);
};

module.exports = {
  formatRoom,
  getImagesByRoomId,
  getImagesByRoomIds,
  verifyHotelAndRoomType,
  findRoomByHotelFloorAndNumber,
  findRoomById,
  findRooms,
  createRoom,
  updateRoom,
  softDeleteRoom,
};
