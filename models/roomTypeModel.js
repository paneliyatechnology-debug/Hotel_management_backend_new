/**
 * Room Type (Category) database operations using Knex.
 */
const db = require('../database/knex');
const { getAccessibleUrl, deleteFile } = require('../services/uploadService');
const { ROOM_STATUSES } = require('../constants');

/**
 * Zero count for every room status, plus the total.
 * @returns {Object}
 */
const emptyRoomStatusCounts = () => {
  const counts = {};
  for (const status of ROOM_STATUSES) {
    counts[`${status.toLowerCase()}_count`] = 0;
  }
  counts.total_room_count = 0;
  return counts;
};

/**
 * Add each category's status counts into one hotel total.
 * @param {Array<{ room_status_counts?: Object }>} categories
 * @returns {Object}
 */
const summarizeRoomStatusCounts = (categories) => {
  const summary = emptyRoomStatusCounts();
  for (const category of categories) {
    const counts = category.room_status_counts || {};
    for (const key of Object.keys(summary)) {
      summary[key] += Number(counts[key]) || 0;
    }
  }
  return summary;
};

/**
 * Format raw database row to structured RoomType object.
 * Returns ONLY id, hotel_id, name, description, images, deleted_at, created_at, and updated_at.
 * @param {Object} row - Raw row from room_types table
 * @param {string[]} [images=[]] - Array of full image URLs
 * @returns {Object|null}
 */
const formatRoomType = (row, images = []) => {
  if (!row) return null;

  return {
    id: row.id,
    hotel_id: row.hotel_id,
    name: row.name,
    description: row.description || '',
    images: Array.isArray(images) ? images : [],
    deleted_at: row.deleted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Fetch image URLs for a single room type ID from unified images table
 * @param {number|string} roomTypeId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<string[]>}
 */
const getImagesByRoomTypeId = async (roomTypeId, client = db) => {
  const rows = await client('images')
    .where({ room_type_id: roomTypeId })
    .orderBy('id', 'asc')
    .select('*');

  return Promise.all(rows.map((r) => {
    const source = r.image_url && (r.image_url.startsWith('http://') || r.image_url.startsWith('https://'))
      ? r.image_url
      : (r.image_name || r.s3_key || '');
    return getAccessibleUrl(source);
  }));
};

/**
 * Batch fetch image URLs for multiple room type IDs from unified images table
 * @param {Array<number|string>} roomTypeIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Record<number, string[]>>}
 */
const getImagesByRoomTypeIds = async (roomTypeIds, client = db) => {
  if (!roomTypeIds || roomTypeIds.length === 0) return {};

  const rows = await client('images')
    .whereIn('room_type_id', roomTypeIds)
    .orderBy('id', 'asc')
    .select('*');

  const map = {};
  for (const id of roomTypeIds) {
    map[id] = [];
  }

  for (const row of rows) {
    if (!map[row.room_type_id]) {
      map[row.room_type_id] = [];
    }
    const source = row.image_url && (row.image_url.startsWith('http://') || row.image_url.startsWith('https://'))
      ? row.image_url
      : (row.image_name || row.s3_key || '');
    map[row.room_type_id].push(await getAccessibleUrl(source));
  }

  return map;
};

/**
 * Non-deleted room counts for each category, one number per room status.
 * @param {Array<number|string>} roomTypeIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Record<number, Object>>}
 */
const getRoomStatusCountsByRoomTypeIds = async (roomTypeIds, client = db) => {
  const map = {};
  for (const id of roomTypeIds) {
    map[id] = emptyRoomStatusCounts();
  }
  if (!roomTypeIds || roomTypeIds.length === 0) return map;

  const rows = await client('rooms')
    .whereIn('room_type_id', roomTypeIds)
    .whereNull('deleted_at')
    .select('room_type_id', 'status')
    .count('id as total')
    .groupBy('room_type_id', 'status');

  for (const row of rows) {
    const bucket = map[row.room_type_id];
    if (!bucket) continue;
    const key = `${String(row.status || '').toLowerCase()}_count`;
    if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
    const count = Number(row.total) || 0;
    bucket[key] = count;
    bucket.total_room_count += count;
  }

  return map;
};

/**
 * Check if hotel exists in hotels table
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<boolean>}
 */
const hotelExists = async (hotelId, client = db) => {
  if (!hotelId) return false;
  const hotel = await client('hotels')
    .where({ id: hotelId })
    .whereNull('deleted_at')
    .select('id')
    .first();
  return Boolean(hotel);
};

/**
 * Find room type by ID (excludes soft-deleted by default)
 * @param {number|string} id
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findRoomTypeById = async (id, { includeDeleted = false } = {}, client = db) => {
  let query = client('room_types').where({ id });
  if (!includeDeleted) {
    query = query.whereNull('deleted_at');
  }

  const row = await query.first();
  if (!row) return null;

  const images = await getImagesByRoomTypeId(row.id, client);
  return formatRoomType(row, images);
};

/**
 * Find all active room categories (excludes soft-deleted) with optional hotel_id filter
 * @param {Object} [filters={}]
 * @param {number|string} [filters.hotel_id]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object[]>}
 */
const findActiveRoomTypes = async (filters = {}, client = db) => {
  const includeImages = filters.includeImages !== false;
  let query = client('room_types').whereNull('deleted_at');

  if (filters.hotel_id) {
    query = query.where({ hotel_id: filters.hotel_id });
  }

  query = query.orderBy('id', 'asc');

  const rows = await query;
  const ids = rows.map((r) => r.id);
  const [imagesMap, statusCounts] = await Promise.all([
    includeImages ? getImagesByRoomTypeIds(ids, client) : Promise.resolve({}),
    getRoomStatusCountsByRoomTypeIds(ids, client),
  ]);

  return rows.map((row) => ({
    ...formatRoomType(row, imagesMap[row.id] || []),
    room_status_counts: statusCounts[row.id] || emptyRoomStatusCounts(),
  }));
};

/**
 * Live category counts for one hotel. Images are omitted; this is for the socket payload.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ room_categories: Object[], room_status_summary: Object }>}
 */
const getHotelRoomCategoryCounts = async (hotelId, client = db) => {
  const categories = await findActiveRoomTypes(
    { hotel_id: hotelId, includeImages: false },
    client
  );

  return {
    room_categories: categories.map((category) => ({
      id: category.id,
      hotel_id: category.hotel_id,
      name: category.name,
      room_status_counts: category.room_status_counts,
    })),
    room_status_summary: summarizeRoomStatusCounts(categories),
  };
};

/**
 * Check if category name exists within a hotel (case-insensitive, non-deleted)
 * @param {string} name
 * @param {number|string} hotelId
 * @param {Object} [options={}]
 * @param {number|string} [options.excludeId=null]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findRoomTypeByNameAndHotel = async (name, hotelId, { excludeId = null } = {}, client = db) => {
  if (!name || !hotelId) return null;

  let query = client('room_types')
    .where({ hotel_id: hotelId })
    .whereNull('deleted_at')
    .whereRaw('LOWER(TRIM(name)) = ?', [name.trim().toLowerCase()]);

  if (excludeId) {
    query = query.whereNot({ id: excludeId });
  }

  return query.first();
};

/**
 * Count physical rooms assigned to this room category (excludes soft-deleted rooms)
 * @param {number|string} roomTypeId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countAssignedRooms = async (roomTypeId, client = db) => {
  const result = await client('rooms')
    .where({ room_type_id: roomTypeId })
    .whereNull('deleted_at')
    .count('id as count')
    .first();

  return Number(result?.count || 0);
};

/**
 * Safely insert an image row into unified images table
 * @param {import('knex').Knex} client
 * @param {Object} rowData
 */
const insertImageRow = async (client, rowData) => {
  const payload = {
    room_type_id: rowData.room_type_id,
    room_id: null,
    image_name: rowData.image_name || null,
    image_url: rowData.image_url,
    s3_key: rowData.s3_key || null,
    is_primary: rowData.is_primary ? 1 : 0,
    display_order: rowData.display_order || 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  return client('images').insert(payload);
};

/**
 * Create a new room type record and associate uploaded image records
 * @param {Object} data - { hotel_id, name, description }
 * @param {Array<{ imageName: string, s3Key: string, imageUrl: string }>} [imageRecords=[]]
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const createRoomType = async (data, imageRecords = [], trx) => {
  const execute = async (client) => {
    const now = new Date();
    const [id] = await client('room_types').insert({
      hotel_id: data.hotel_id,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : '',
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });

    if (Array.isArray(imageRecords) && imageRecords.length > 0) {
      for (let i = 0; i < imageRecords.length; i++) {
        const img = imageRecords[i];
        await insertImageRow(client, {
          room_type_id: id,
          image_name: img.imageName,
          image_url: img.imageUrl,
          s3_key: img.s3Key,
          is_primary: i === 0,
          display_order: i + 1,
        });
      }
    }

    const row = await client('room_types').where({ id }).first();
    const images = await getImagesByRoomTypeId(id, client);
    return formatRoomType(row, images);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Update an existing room type and optionally add new uploaded images
 * @param {number|string} id
 * @param {Object} updates
 * @param {Array<{ imageName: string, s3Key: string, imageUrl: string }>} [newImageRecords=[]]
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const updateRoomType = async (id, updates, newImageRecords = [], trx) => {
  const execute = async (client) => {
    const updateFields = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) updateFields.name = updates.name.trim();
    if (updates.description !== undefined) updateFields.description = updates.description.trim();
    if (updates.hotel_id !== undefined) updateFields.hotel_id = updates.hotel_id;

    await client('room_types').where({ id }).update(updateFields);

    if (Array.isArray(newImageRecords) && newImageRecords.length > 0) {
      // 1. Fetch old images for this room type
      const oldImages = await client('images')
        .where({ room_type_id: id })
        .select('*');

      // 2. Delete the replaced image files
      for (const old of oldImages) {
        const key = old.s3_key || old.image_name || old.image_url;
        if (key) await deleteFile(key);
      }

      // 3. Delete old images from database table to prevent duplication
      await client('images').where({ room_type_id: id }).delete();

      // 4. Insert new images
      for (let i = 0; i < newImageRecords.length; i++) {
        const img = newImageRecords[i];
        await insertImageRow(client, {
          room_type_id: id,
          image_name: img.imageName,
          image_url: img.imageUrl,
          s3_key: img.s3Key,
          is_primary: i === 0,
          display_order: i + 1,
        });
      }
    }

    const row = await client('room_types').where({ id }).first();
    const images = await getImagesByRoomTypeId(id, client);
    return formatRoomType(row, images);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Soft delete a room category setting deleted_at
 * @param {number|string} id
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const softDeleteRoomType = async (id, trx) => {
  const client = trx || db;
  const now = new Date();

  await client('room_types')
    .where({ id })
    .update({
      deleted_at: now,
      updated_at: now,
    });

  const row = await client('room_types').where({ id }).first();
  const images = await getImagesByRoomTypeId(id, client);
  return formatRoomType(row, images);
};

module.exports = {
  formatRoomType,
  getImagesByRoomTypeId,
  getImagesByRoomTypeIds,
  hotelExists,
  findRoomTypeById,
  findActiveRoomTypes,
  summarizeRoomStatusCounts,
  getHotelRoomCategoryCounts,
  findRoomTypeByNameAndHotel,
  countAssignedRooms,
  createRoomType,
  updateRoomType,
  softDeleteRoomType,
};
