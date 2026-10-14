/**
 * Booking database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const crypto = require('crypto');
const db = require('../database/knex');
const { buildImageUrl, deleteFile } = require('../services/s3Service');
const { NON_BLOCKING_BOOKING_STATUSES } = require('../constants');

/**
 * Safe JSON parser helper
 * @param {*} val
 * @param {*} fallback
 */
const parseJson = (val, fallback) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
};

/**
 * Format raw database row to structured Booking object
 * @param {Object} row
 * @param {Object} [relations={}]
 * @returns {Object|null}
 */
const formatBooking = (row, relations = {}) => {
  if (!row) return null;

  const imageRecords = Array.isArray(relations.images) ? relations.images : [];
  const signatureRecords = Array.isArray(relations.signatures) ? relations.signatures : [];

  // Parse JSON columns or fallback
  const storedSignatures = parseJson(row.signatures, []);
  const storedImages = parseJson(row.images, []);

  // Merge URLs
  const imageUrls = [
    ...storedImages,
    ...imageRecords.map((img) => img.image_url),
  ]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .map((u) => buildImageUrl(u));

  const signatureUrls = [
    ...storedSignatures,
    ...signatureRecords.map((sig) => sig.image_url),
  ]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .map((u) => buildImageUrl(u));

  const booking = {
    id: row.id,
    hotel_id: row.hotel_id,
    booking_number: row.booking_number,
    primary_guest_name: row.primary_guest_name,
    secondary_guest_name: row.secondary_guest_name || null,
    mobile_number: row.mobile_number,
    email: row.email || null,
    address: row.address || '',
    // Filled below from booking_rooms. Falls back to the first room column.
    room_id: [],
    created_by: row.created_by,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    actual_check_in: row.actual_check_in || null,
    actual_check_out: row.actual_check_out || null,
    number_of_nights: Number(row.number_of_nights) || 1,
    adults: Number(row.adults) || 1,
    children: Number(row.children) || 0,

    // Pricing & Tax Breakdown
    base_amount: Number(row.base_amount) || 0,
    tax_amount: Number(row.tax_amount) || 0,
    gst_rate: Number(row.gst_rate) || 18,
    cgst_rate: Number(row.cgst_rate) || 9,
    sgst_rate: Number(row.sgst_rate) || 9,
    gst_amount: Number(row.gst_amount) || 0,
    cgst_amount: Number(row.cgst_amount) || 0,
    sgst_amount: Number(row.sgst_amount) || 0,
    taxable_amount: Number(row.taxable_amount) || 0,
    discount_amount: Number(row.discount_amount) || 0,
    extra_charges_total: Number(row.extra_charges_total) || 0,
    late_checkout_charge: Number(row.late_checkout_charge) || 0,
    late_checkout_hours: Number(row.late_checkout_hours) || 0,
    total_amount: Number(row.total_amount) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    due_amount: Number(row.due_amount) || 0,
    payment_status: row.payment_status || 'PENDING',
    // Stay lifecycle. Kept separate from payment_status above.
    booking_status: row.booking_status || 'PENDING',

    signatures: signatureUrls,
    images: imageUrls,
    notes: row.notes || '',
    deleted_at: row.deleted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Attached joined summaries if available
  if (row.hotel_name) {
    booking.hotel = {
      id: row.hotel_id,
      name: row.hotel_name,
      slug: row.hotel_slug,
    };
  }

  const linkedRooms = Array.isArray(relations.rooms) ? relations.rooms.filter((room) => room && room.id) : [];
  const fallbackRoom = row.room_number
    ? [{
      id: row.room_id,
      room_number: row.room_number,
      floor: row.room_floor,
      status: row.room_status,
      room_type_name: row.room_type_name || null,
    }]
    : (row.room_id ? [{ id: row.room_id, room_number: null, floor: null, status: null, room_type_name: null }] : []);
  const rooms = linkedRooms.length > 0 ? linkedRooms : fallbackRoom;

  // room_id is every room on this stay. room is the first one, for older screens.
  booking.room_id = rooms.map((room) => room.id);
  booking.rooms = rooms;
  booking.room = rooms[0] || null;

  if (row.created_by_name) {
    booking.creator = {
      id: row.created_by,
      name: row.created_by_name,
      email: row.created_by_email,
      role: row.created_by_role,
    };
  }

  return booking;
};

/**
 * Generate a unique booking number safely under concurrent conditions.
 * Format: "BK-YYYYMMDD-XXXX" (e.g. BK-20261012-A8B9C1)
 * @param {import('knex').Knex} [trx=db]
 * @returns {Promise<string>}
 */
const generateBookingNumber = async (trx = db) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const candidate = `BK-${dateStr}-${randomSuffix}`;
    const exists = await trx('bookings').where({ booking_number: candidate }).select('id').first();
    if (!exists) {
      return candidate;
    }
  }
  return `BK-${dateStr}-${Date.now().toString(36).toUpperCase()}`;
};

/**
 * Load images and signatures from images table for one or more booking IDs
 * Filtered by is_signature flag
 * @param {number[]} bookingIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ imagesMap: Object, signaturesMap: Object }>}
 */
const loadBookingMedia = async (bookingIds, client = db) => {
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return { imagesMap: {}, signaturesMap: {} };
  }

  const mediaRows = await client('images')
    .whereIn('booking_id', bookingIds)
    .orderBy('id', 'asc');

  const imagesMap = {};
  const signaturesMap = {};

  for (const media of mediaRows) {
    if (Boolean(media.is_signature)) {
      if (!signaturesMap[media.booking_id]) signaturesMap[media.booking_id] = [];
      signaturesMap[media.booking_id].push(media);
    } else {
      if (!imagesMap[media.booking_id]) imagesMap[media.booking_id] = [];
      imagesMap[media.booking_id].push(media);
    }
  }

  return { imagesMap, signaturesMap };
};

/**
 * Rooms assigned to each booking. Order follows booking_rooms.id.
 * @param {number[]} bookingIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Record<number, Array<Object>>>}
 */
const loadRoomsByBookingIds = async (bookingIds, client = db) => {
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) return {};

  const rows = await client('booking_rooms')
    .leftJoin('rooms', 'booking_rooms.room_id', 'rooms.id')
    .leftJoin('room_types', 'rooms.room_type_id', 'room_types.id')
    .whereIn('booking_rooms.booking_id', bookingIds)
    .orderBy('booking_rooms.id', 'asc')
    .select(
      'booking_rooms.booking_id',
      'rooms.id as id',
      'rooms.room_number',
      'rooms.floor',
      'rooms.status',
      'room_types.name as room_type_name'
    );

  const map = {};
  for (const row of rows) {
    if (!row.id) continue;
    if (!map[row.booking_id]) map[row.booking_id] = [];
    map[row.booking_id].push({
      id: row.id,
      room_number: row.room_number,
      floor: row.floor,
      status: row.status,
      room_type_name: row.room_type_name || null,
    });
  }
  return map;
};

/**
 * Replace the rooms on a booking. bookings.room_id stays the first room
 * because that column is still a required foreign key.
 * @param {number|string} bookingId
 * @param {number[]} roomIds
 * @param {import('knex').Knex} client
 */
const replaceBookingRooms = async (bookingId, roomIds, client) => {
  await client('booking_rooms').where({ booking_id: bookingId }).delete();
  if (!roomIds.length) return;

  const now = new Date();
  await client('booking_rooms').insert(
    roomIds.map((roomId) => ({
      booking_id: bookingId,
      room_id: roomId,
      created_at: now,
      updated_at: now,
    }))
  );
};

/**
 * A stay blocks a room when that room is the primary room or one of booking_rooms.
 * @param {import('knex').QueryBuilder} qb
 * @param {number} roomId
 */
const whereBookingIncludesRoom = (qb, roomId) => {
  qb.where(function () {
    this.where('bookings.room_id', roomId).orWhereExists(function () {
      this.select(db.raw('1'))
        .from('booking_rooms')
        .whereRaw('booking_rooms.booking_id = bookings.id')
        .where('booking_rooms.room_id', roomId);
    });
  });
};

/**
 * Check if the room already has a stay on these dates.
 * Soft-deleted rows are ignored. A stay also stops blocking the room once it is
 * checked out, cancelled, or marked no-show. Both actual_check_out and
 * booking_status are checked so an old row is covered either way.
 *
 * Overlap condition:
 * (existing_check_in < new_check_out) AND (existing_check_out > new_check_in)
 *
 * @param {number|string} roomId - Room ID to check
 * @param {Date|string} checkInDate
 * @param {Date|string} checkOutDate
 * @param {Object} [options={}]
 * @param {number|string} [options.excludeBookingId=null] - Booking ID to ignore during updates
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Array<Object>>} Conflicting overlap records (empty if available)
 */
const checkRoomOverlaps = async (
  roomId,
  checkInDate,
  checkOutDate,
  { excludeBookingId = null } = {},
  client = db
) => {
  const inDate = new Date(checkInDate);
  const outDate = new Date(checkOutDate);

  let query = client('bookings')
    .whereNull('bookings.deleted_at')
    .whereNull('bookings.actual_check_out')
    .whereNotIn('bookings.booking_status', NON_BLOCKING_BOOKING_STATUSES)
    .where('bookings.check_in_date', '<', outDate)
    .where('bookings.check_out_date', '>', inDate);

  whereBookingIncludesRoom(query, Number(roomId));

  if (excludeBookingId) {
    query = query.whereNot('bookings.id', excludeBookingId);
  }

  return query.select(
    'bookings.id as booking_id',
    'bookings.booking_number',
    'bookings.check_in_date',
    'bookings.check_out_date',
    'bookings.room_id'
  );
};

/**
 * Find booking by ID (excludes soft-deleted by default)
 * @param {number|string} id
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findBookingById = async (id, { includeDeleted = false } = {}, client = db) => {
  let query = client('bookings')
    .leftJoin('hotels', 'bookings.hotel_id', 'hotels.id')
    .leftJoin('rooms', 'bookings.room_id', 'rooms.id')
    .leftJoin('room_types', 'rooms.room_type_id', 'room_types.id')
    .leftJoin('users', 'bookings.created_by', 'users.id')
    .where('bookings.id', id)
    .select(
      'bookings.*',
      'hotels.name as hotel_name',
      'hotels.slug as hotel_slug',
      'rooms.room_number',
      'rooms.floor as room_floor',
      'rooms.status as room_status',
      'room_types.name as room_type_name',
      'users.name as created_by_name',
      'users.email as created_by_email',
      'users.role as created_by_role'
    );

  if (!includeDeleted) {
    query = query.whereNull('bookings.deleted_at');
  }

  const row = await query.first();
  if (!row) return null;

  const { imagesMap, signaturesMap } = await loadBookingMedia([row.id], client);
  const roomsMap = await loadRoomsByBookingIds([row.id], client);

  return formatBooking(row, {
    images: imagesMap[row.id] || [],
    signatures: signaturesMap[row.id] || [],
    rooms: roomsMap[row.id] || [],
  });
};

/**
 * List bookings with filtering, search, and pagination.
 * Always excludes soft-deleted bookings (whereNull deleted_at).
 *
 * @param {Object} [filters={}]
 * @param {Object} [pagination={ page: 1, limit: 10 }]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ bookings: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const findBookings = async (filters = {}, pagination = {}, client = db) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const offset = (page - 1) * limit;

  const applyFilters = (qb) => {
    qb.whereNull('bookings.deleted_at');

    if (filters.hotel_id) {
      qb.where('bookings.hotel_id', Number(filters.hotel_id));
    }

    if (filters.room_id) {
      whereBookingIncludesRoom(qb, Number(filters.room_id));
    }

    if (filters.booking_number) {
      qb.where('bookings.booking_number', 'like', `%${String(filters.booking_number).trim()}%`);
    }

    if (filters.primary_guest_name) {
      qb.where('bookings.primary_guest_name', 'like', `%${String(filters.primary_guest_name).trim()}%`);
    }

    if (filters.guest_name) {
      const gName = String(filters.guest_name).trim();
      qb.where(function () {
        this.where('bookings.primary_guest_name', 'like', `%${gName}%`)
          .orWhere('bookings.secondary_guest_name', 'like', `%${gName}%`);
      });
    }

    if (filters.mobile_number) {
      qb.where('bookings.mobile_number', 'like', `%${String(filters.mobile_number).trim()}%`);
    }

    if (filters.payment_status) {
      qb.where('bookings.payment_status', String(filters.payment_status).trim().toUpperCase());
    }

    if (filters.booking_status) {
      qb.where('bookings.booking_status', String(filters.booking_status).trim().toUpperCase());
    }

    if (filters.check_in_from) {
      qb.where('bookings.check_in_date', '>=', new Date(filters.check_in_from));
    }
    if (filters.check_in_to) {
      qb.where('bookings.check_in_date', '<=', new Date(filters.check_in_to));
    }
    if (filters.check_out_from) {
      qb.where('bookings.check_out_date', '>=', new Date(filters.check_out_from));
    }
    if (filters.check_out_to) {
      qb.where('bookings.check_out_date', '<=', new Date(filters.check_out_to));
    }

    if (filters.search) {
      const s = `%${String(filters.search).trim()}%`;
      qb.where(function () {
        this.where('bookings.booking_number', 'like', s)
          .orWhere('bookings.primary_guest_name', 'like', s)
          .orWhere('bookings.secondary_guest_name', 'like', s)
          .orWhere('bookings.mobile_number', 'like', s);
      });
    }
  };

  // Total count
  const countQuery = client('bookings');
  applyFilters(countQuery);
  const totalResult = await countQuery.count('bookings.id as total').first();
  const total = Number(totalResult?.total || 0);

  // Paginated query
  let dataQuery = client('bookings')
    .leftJoin('hotels', 'bookings.hotel_id', 'hotels.id')
    .leftJoin('rooms', 'bookings.room_id', 'rooms.id')
    .leftJoin('room_types', 'rooms.room_type_id', 'room_types.id')
    .leftJoin('users', 'bookings.created_by', 'users.id')
    .select(
      'bookings.*',
      'hotels.name as hotel_name',
      'hotels.slug as hotel_slug',
      'rooms.room_number',
      'rooms.floor as room_floor',
      'rooms.status as room_status',
      'room_types.name as room_type_name',
      'users.name as created_by_name',
      'users.email as created_by_email',
      'users.role as created_by_role'
    );

  applyFilters(dataQuery);
  dataQuery = dataQuery.orderBy('bookings.created_at', 'desc').offset(offset).limit(limit);

  const rows = await dataQuery;
  const bookingIds = rows.map((r) => r.id);

  const { imagesMap, signaturesMap } = await loadBookingMedia(bookingIds, client);
  const roomsMap = await loadRoomsByBookingIds(bookingIds, client);

  const bookings = rows.map((row) =>
    formatBooking(row, {
      images: imagesMap[row.id] || [],
      signatures: signaturesMap[row.id] || [],
      rooms: roomsMap[row.id] || [],
    })
  );

  return {
    bookings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

/**
 * Create a new booking transactionally.
 * Inserts into bookings table, and stores image and signature records into images table.
 *
 * @param {Object} bookingData
 * @param {Object} [relations={}]
 * @param {Array<Object>} [relations.imageRecords=[]] - [{ image_name, image_url, s3_key }]
 * @param {Array<Object>} [relations.signatureRecords=[]] - [{ image_name, image_url, s3_key }]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>} Formatted created booking
 */
const createBooking = async (bookingData, relations = {}, client = db) => {
  const { imageRecords = [], signatureRecords = [] } = relations;

  return client.transaction(async (trx) => {
    // 1. Generate unique booking number if not provided
    const bookingNumber = bookingData.booking_number || (await generateBookingNumber(trx));

    // Stored URLs come from the uploaded files only.
    const storedSignatures = signatureRecords
      .map((s) => s.image_url || s.imageUrl)
      .filter(Boolean);

    const storedImages = imageRecords
      .map((i) => i.image_url || i.imageUrl)
      .filter(Boolean);

    const roomIds = Array.isArray(bookingData.room_ids) ? bookingData.room_ids : [];
    const {
      room_ids: _roomIds,
      images: _clientImages,
      signatures: _clientSignatures,
      ...bookingColumns
    } = bookingData;

    const insertPayload = {
      ...bookingColumns,
      room_id: roomIds[0] || bookingColumns.room_id,
      booking_number: bookingNumber,
      signatures: JSON.stringify(storedSignatures),
      images: JSON.stringify(storedImages),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [bookingId] = await trx('bookings').insert(insertPayload);

    if (roomIds.length > 0) {
      await replaceBookingRooms(bookingId, roomIds, trx);
    }

    // 3. Store images and signatures in images table
    const allImageInserts = [];

    for (const img of imageRecords) {
      allImageInserts.push({
        booking_id: bookingId,
        room_id: null,
        room_type_id: null,
        category: 'BOOKING_IMAGE',
        is_signature: false,
        image_name: img.image_name || img.imageName || null,
        image_url: img.image_url || img.imageUrl || '',
        s3_key: img.s3_key || img.s3Key || null,
        is_primary: img.is_primary ? 1 : 0,
        display_order: img.display_order || 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    for (const sig of signatureRecords) {
      allImageInserts.push({
        booking_id: bookingId,
        room_id: null,
        room_type_id: null,
        category: 'BOOKING_SIGNATURE',
        is_signature: true,
        image_name: sig.image_name || sig.imageName || null,
        image_url: sig.image_url || sig.imageUrl || '',
        s3_key: sig.s3_key || sig.s3Key || null,
        is_primary: 0,
        display_order: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (allImageInserts.length > 0) {
      await trx('images').insert(allImageInserts);
    }

    return findBookingById(bookingId, {}, trx);
  });
};

/**
 * Update an existing booking transactionally.
 *
 * @param {number|string} id
 * @param {Object} updateData
 * @param {Object} [relations={}]
 * @param {Array<Object>} [relations.imageRecords=[]]
 * @param {Array<Object>} [relations.signatureRecords=[]]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const updateBooking = async (id, updateData, relations = {}, client = db) => {
  const { imageRecords = [], signatureRecords = [] } = relations;

  return client.transaction(async (trx) => {
    const existing = await trx('bookings').where({ id }).whereNull('deleted_at').first();
    if (!existing) return null;

    // A new file replaces the stored signature. A URL in the body is ignored.
    let finalSignatures;
    let finalImages;

    if (signatureRecords.length > 0) {
      // 1. Fetch old signature rows for this booking
      const oldSigRows = await trx('images')
        .where({ booking_id: id, is_signature: 1 })
        .select('*');

      // 2. Delete old signatures from S3
      for (const old of oldSigRows) {
        const key = old.s3_key || old.image_name || old.image_url;
        if (key) await deleteFile(key);
      }

      const prevSigs = parseJson(existing.signatures, []);
      for (const prevUrl of prevSigs) {
        if (typeof prevUrl === 'string' && !oldSigRows.some((r) => r.image_url === prevUrl)) {
          await deleteFile(prevUrl);
        }
      }

      // 3. Delete old signature rows from database
      await trx('images').where({ booking_id: id, is_signature: 1 }).delete();

      finalSignatures = JSON.stringify(
        signatureRecords.map((s) => s.image_url || s.imageUrl).filter(Boolean)
      );
    }

    if (imageRecords.length > 0) {
      // 1. Fetch old photo rows for this booking
      const oldImageRows = await trx('images')
        .where({ booking_id: id, is_signature: 0 })
        .select('*');

      // 2. Delete old photos from S3
      for (const old of oldImageRows) {
        const key = old.s3_key || old.image_name || old.image_url;
        if (key) await deleteFile(key);
      }

      const prevImgs = parseJson(existing.images, []);
      for (const prevUrl of prevImgs) {
        if (typeof prevUrl === 'string' && !oldImageRows.some((r) => r.image_url === prevUrl)) {
          await deleteFile(prevUrl);
        }
      }

      // 3. Delete old photo rows from database
      await trx('images').where({ booking_id: id, is_signature: 0 }).delete();

      finalImages = JSON.stringify(
        imageRecords.map((i) => i.image_url || i.imageUrl).filter(Boolean)
      );
    }

    const roomIds = Array.isArray(updateData.room_ids) ? updateData.room_ids : null;
    const {
      room_ids: _roomIds,
      images: _clientImages,
      signatures: _clientSignatures,
      ...columnUpdates
    } = updateData;

    const payload = {
      ...columnUpdates,
      updated_at: new Date(),
    };

    if (roomIds && roomIds.length > 0) {
      payload.room_id = roomIds[0];
    }

    if (finalSignatures !== undefined) payload.signatures = finalSignatures;
    if (finalImages !== undefined) payload.images = finalImages;

    await trx('bookings').where({ id }).update(payload);

    if (roomIds && roomIds.length > 0) {
      await replaceBookingRooms(id, roomIds, trx);
    }

    // Insert new images and signatures in images table
    const newMediaRows = [];
    for (const img of imageRecords) {
      newMediaRows.push({
        booking_id: id,
        room_id: null,
        room_type_id: null,
        category: 'BOOKING_IMAGE',
        is_signature: false,
        image_name: img.image_name || img.imageName || null,
        image_url: img.image_url || img.imageUrl || '',
        s3_key: img.s3_key || img.s3Key || null,
        is_primary: img.is_primary ? 1 : 0,
        display_order: img.display_order || 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    for (const sig of signatureRecords) {
      newMediaRows.push({
        booking_id: id,
        room_id: null,
        room_type_id: null,
        category: 'BOOKING_SIGNATURE',
        is_signature: true,
        image_name: sig.image_name || sig.imageName || null,
        image_url: sig.image_url || sig.imageUrl || '',
        s3_key: sig.s3_key || sig.s3Key || null,
        is_primary: 0,
        display_order: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (newMediaRows.length > 0) {
      await trx('images').insert(newMediaRows);
    }

    return findBookingById(id, {}, trx);
  });
};

/**
 * Soft delete a booking setting deleted_at timestamp
 * @param {number|string} id
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const softDeleteBooking = async (id, client = db) => {
  const now = new Date();
  await client('bookings')
    .where({ id })
    .update({
      deleted_at: now,
      updated_at: now,
    });

  return { id: Number(id), is_deleted: true, deleted_at: now };
};

/**
 * True when a non-deleted booking already stores this guest email.
 * @param {string} email
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<boolean>}
 */
const emailUsedOnBooking = async (email, client = db) => {
  if (!email) return false;
  const row = await client('bookings')
    .whereNull('deleted_at')
    .whereRaw('LOWER(email) = ?', [String(email).trim().toLowerCase()])
    .select('id')
    .first();
  return Boolean(row);
};

const countBookingsByRoomId = async (roomId, client = db) => {
  const result = await client('bookings')
    .whereNull('bookings.deleted_at')
    .where(function () {
      whereBookingIncludesRoom(this, Number(roomId));
    })
    .count('bookings.id as count')
    .first();

  return Number(result?.count || 0);
};

module.exports = {
  formatBooking,
  generateBookingNumber,
  checkRoomOverlaps,
  findBookingById,
  findBookings,
  createBooking,
  updateBooking,
  softDeleteBooking,
  countBookingsByRoomId,
  emailUsedOnBooking,
};
