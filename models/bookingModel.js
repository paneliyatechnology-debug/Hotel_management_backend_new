/**
 * Booking database operations using Knex.
 */
const db = require('../database/knex');
const { buildImageUrl, deleteFile } = require('../services/s3Service');
const { HTTP_STATUS, NON_BLOCKING_BOOKING_STATUSES } = require('../constants');
const { AppError } = require('../utils/response');
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

  // Photos and signatures live only in the images table.
  const imageUrls = imageRecords.map((img) => buildImageUrl(img.image_url)).filter(Boolean);
  const signatureUrls = signatureRecords.map((sig) => buildImageUrl(sig.image_url)).filter(Boolean);

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
      room_type_name: row.room_type_name || null,
    }]
    : (row.room_id ? [{ id: row.room_id, room_number: null, floor: null, room_type_name: null }] : []);
  const rooms = linkedRooms.length > 0 ? linkedRooms : fallbackRoom;

  // room_id is every room id on this stay. rooms has the details of each one.
  booking.room_id = rooms.map((room) => room.id);
  booking.rooms = rooms;

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
 * Short shape used by the booking list.
 * @param {Object} row
 * @param {Array<Object>} rooms
 * @returns {Object}
 */
const formatBookingListItem = (row, rooms = []) => ({
  id: row.id,
  hotel_id: row.hotel_id,
  booking_number: row.booking_number,
  primary_guest_name: row.primary_guest_name,
  mobile_number: row.mobile_number,
  booking_status: row.booking_status,
  rooms,
});

/**
 * Initials of the hotel name. "BLUE OCEAN" becomes "BO".
 * Words are split on anything that is not a letter or digit.
 * @param {string} hotelName
 * @returns {string}
 */
const buildHotelCode = (hotelName) => {
  const words = String(hotelName || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
  return words.map((word) => word.charAt(0)).join('').slice(0, 12);
};

/**
 * Indian financial year label for a moment, using Asia/Kolkata.
 * 1 April 2026 through 31 March 2027 is "2026-27".
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
const getIndianFinancialYear = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

/**
 * Code taken from this hotel's name. Another hotel may use the same initials.
 * The code is saved on the first booking so a later rename keeps the same series.
 * Two creates at once can both see an empty code. The conditional update lets only one of them write it.
 * @param {import('knex').Knex.Transaction} trx
 * @param {{ id: number, name: string, booking_code: string|null }} hotel
 * @returns {Promise<string>}
 */
const allocateHotelCode = async (trx, hotel) => {
  if (hotel.booking_code) return hotel.booking_code;

  const code = (buildHotelCode(hotel.name) || `H${hotel.id}`).slice(0, 20);
  const updated = await trx('hotels')
    .where({ id: hotel.id })
    .whereNull('booking_code')
    .update({ booking_code: code, updated_at: new Date() });
  if (updated === 1) return code;

  const current = await trx('hotels').where({ id: hotel.id }).select('booking_code').first();
  if (current && current.booking_code) return current.booking_code;

  throw new AppError(
    'Unable to assign a hotel code for the booking number.',
    HTTP_STATUS.CONFLICT
  );
};

/**
 * Knex raw() for mysql2 returns [header, fields]. Some versions return the header itself.
 * @param {*} result
 * @returns {Object}
 */
const rawHeader = (result) => (Array.isArray(result) ? result[0] : result);

/**
 * Take the next sequence for this hotel and financial year.
 * One UPDATE locks only that counter row. The hotel row is not locked, so other
 * bookings at the hotel are not queued behind this one.
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} hotelId
 * @param {string} financialYear
 * @returns {Promise<number>}
 */
const claimNextSequence = async (trx, hotelId, financialYear) => {
  const now = new Date();
  const claim = async () => {
    const header = rawHeader(await trx.raw(
      `UPDATE booking_sequences
       SET last_sequence = LAST_INSERT_ID(last_sequence + 1), updated_at = ?
       WHERE hotel_id = ? AND financial_year = ?`,
      [now, hotelId, financialYear]
    ));
    if (!header || Number(header.affectedRows) !== 1) return null;

    // mysql2 puts LAST_INSERT_ID(expr) on the OK packet. Read it from the same
    // connection when the driver leaves insertId empty.
    let sequence = Number(header.insertId);
    if (!sequence) {
      const rows = rawHeader(await trx.raw('SELECT LAST_INSERT_ID() AS seq'));
      sequence = Number(Array.isArray(rows) ? rows[0]?.seq : rows?.seq);
    }
    return sequence > 0 ? sequence : null;
  };

  const existing = await claim();
  if (existing) return existing;

  await trx.raw(
    `INSERT IGNORE INTO booking_sequences (hotel_id, financial_year, last_sequence, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)`,
    [hotelId, financialYear, now, now]
  );

  const created = await claim();
  if (created) return created;

  throw new AppError('Unable to allocate a booking number.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
};

/**
 * Next booking number for one hotel, locked so two creates cannot take the same sequence.
 * Format: HOTEL_CODE/YYYY-YY/SEQUENCE, for example BO/2026-27/0001.
 * The sequence starts at 0001 for each hotel and financial year, then resets on 1 April.
 * The same number may exist at another hotel. It may not be repeated for this hotel.
 * @param {import('knex').Knex.Transaction} trx
 * @param {number|string} hotelId
 * @returns {Promise<string>}
 */
const generateBookingNumber = async (trx, hotelId) => {
  const id = Number(hotelId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('A valid hotel is required to generate a booking number.', HTTP_STATUS.BAD_REQUEST);
  }

  const hotel = await trx('hotels')
    .where({ id })
    .select('id', 'name', 'booking_code')
    .first();
  if (!hotel) {
    throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
  }

  const code = await allocateHotelCode(trx, hotel);
  const financialYear = getIndianFinancialYear();
  const next = await claimNextSequence(trx, id, financialYear);

  return `${code}/${financialYear}/${String(next).padStart(4, '0')}`;
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
 * Stays that still block a room: not deleted, not checked out, and not cancelled or no-show.
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {Date} inDate
 * @param {Date} outDate
 * @param {number|string|null} excludeBookingId
 * @returns {import('knex').Knex.QueryBuilder}
 */
const whereStayBlocksDates = (query, inDate, outDate, excludeBookingId) => {
  query
    .whereNull('bookings.deleted_at')
    .whereNull('bookings.actual_check_out')
    .whereNotIn('bookings.booking_status', NON_BLOCKING_BOOKING_STATUSES)
    .where('bookings.check_in_date', '<', outDate)
    .where('bookings.check_out_date', '>', inDate);
  if (excludeBookingId) query.whereNot('bookings.id', Number(excludeBookingId));
  return query;
};

const OVERLAP_COLUMNS = [
  'bookings.id as booking_id',
  'bookings.booking_number',
  'bookings.check_in_date',
  'bookings.check_out_date',
  'bookings.room_id',
];

/**
 * One row per blocking stay and room. conflict_room_id is the room that overlaps.
 * Primary-room stays and booking_rooms stays are read together, once for the whole list.
 * @param {Array<number|string>} roomIds
 * @param {Date|string} checkInDate
 * @param {Date|string} checkOutDate
 * @param {Object} [options={}]
 * @param {number|string|null} [options.excludeBookingId=null]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Array<Object>>}
 */
const checkRoomsOverlaps = async (
  roomIds,
  checkInDate,
  checkOutDate,
  { excludeBookingId = null } = {},
  client = db
) => {
  const ids = [...new Set(roomIds.map((roomId) => Number(roomId)).filter((roomId) => roomId > 0))];
  if (!ids.length) return [];

  const inDate = new Date(checkInDate);
  const outDate = new Date(checkOutDate);

  const primary = whereStayBlocksDates(client('bookings'), inDate, outDate, excludeBookingId)
    .whereIn('bookings.room_id', ids)
    .select(...OVERLAP_COLUMNS, client.raw('bookings.room_id as conflict_room_id'));

  const linked = whereStayBlocksDates(
    client('bookings').innerJoin('booking_rooms', 'booking_rooms.booking_id', 'bookings.id'),
    inDate,
    outDate,
    excludeBookingId
  )
    .whereIn('booking_rooms.room_id', ids)
    .select(...OVERLAP_COLUMNS, 'booking_rooms.room_id as conflict_room_id');

  return primary.union(linked);
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
  options = {},
  client = db
) => {
  const rows = await checkRoomsOverlaps([roomId], checkInDate, checkOutDate, options, client);
  const seen = new Set();
  const conflicts = [];
  for (const row of rows) {
    if (Number(row.conflict_room_id) !== Number(roomId)) continue;
    if (seen.has(row.booking_id)) continue;
    seen.add(row.booking_id);
    conflicts.push({
      booking_id: row.booking_id,
      booking_number: row.booking_number,
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
      room_id: row.room_id,
    });
  }
  return conflicts;
};

/**
 * Find booking by ID (excludes soft-deleted by default)
 * @param {number|string} id
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {boolean} [options.includeMedia=true] - Guest photos and the signature. The bill does not print them.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findBookingById = async (id, { includeDeleted = false, includeMedia = true } = {}, client = db) => {
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

  const [media, roomsMap] = await Promise.all([
    includeMedia
      ? loadBookingMedia([row.id], client)
      : Promise.resolve({ imagesMap: {}, signaturesMap: {} }),
    loadRoomsByBookingIds([row.id], client),
  ]);
  const { imagesMap, signaturesMap } = media;

  return formatBooking(row, {
    images: imagesMap[row.id] || [],
    signatures: signaturesMap[row.id] || [],
    rooms: roomsMap[row.id] || [],
  });
};

/**
 * Booking columns plus every assigned room id.
 * Used by checkout, which does not need photos, the hotel profile, or the creator.
 * @param {number|string} id
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findBookingForWrite = async (id, client = db) => {
  const numericId = Number(id);
  const [row, roomRows] = await Promise.all([
    client('bookings').where('id', numericId).whereNull('deleted_at').first(),
    client('booking_rooms').where({ booking_id: numericId }).orderBy('id', 'asc').select('room_id'),
  ]);
  if (!row) return null;

  const linked = roomRows
    .map((room) => Number(room.room_id))
    .filter((roomId) => Number.isInteger(roomId) && roomId > 0);
  const money = (value) => Number(value) || 0;

  // Same number and text shape as the full booking read, so checkout audit diffs stay accurate.
  return {
    ...row,
    room_id: linked.length ? linked : (row.room_id ? [Number(row.room_id)] : []),
    number_of_nights: Number(row.number_of_nights) || 1,
    adults: Number(row.adults) || 1,
    children: Number(row.children) || 0,
    base_amount: money(row.base_amount),
    tax_amount: money(row.tax_amount),
    gst_rate: Number(row.gst_rate) || 18,
    cgst_rate: Number(row.cgst_rate) || 9,
    sgst_rate: Number(row.sgst_rate) || 9,
    gst_amount: money(row.gst_amount),
    cgst_amount: money(row.cgst_amount),
    sgst_amount: money(row.sgst_amount),
    taxable_amount: money(row.taxable_amount),
    discount_amount: money(row.discount_amount),
    extra_charges_total: money(row.extra_charges_total),
    late_checkout_charge: money(row.late_checkout_charge),
    late_checkout_hours: Number(row.late_checkout_hours) || 0,
    total_amount: money(row.total_amount),
    paid_amount: money(row.paid_amount),
    due_amount: money(row.due_amount),
    notes: row.notes || '',
    address: row.address || '',
  };
};

/**
 * Write booking columns without opening a transaction or reloading photos and rooms.
 * @param {number|string} id
 * @param {Object} updateData
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ id: number }>}
 */
const saveBookingColumns = async (id, updateData, client = db) => {
  const {
    room_ids: _roomIds,
    images: _images,
    signatures: _signatures,
    ...columnUpdates
  } = updateData;

  await client('bookings').where({ id }).update({
    ...columnUpdates,
    updated_at: new Date(),
  });

  return { id: Number(id) };
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

  // The count and the page do not depend on each other.
  const countQuery = client('bookings');
  applyFilters(countQuery);

  const dataQuery = client('bookings').select(
    'bookings.id',
    'bookings.hotel_id',
    'bookings.booking_number',
    'bookings.primary_guest_name',
    'bookings.mobile_number',
    'bookings.booking_status'
  );
  applyFilters(dataQuery);

  const [totalResult, rows] = await Promise.all([
    countQuery.count('bookings.id as total').first(),
    dataQuery.orderBy('bookings.created_at', 'desc').offset(offset).limit(limit),
  ]);
  const total = Number(totalResult?.total || 0);
  const roomsMap = rows.length
    ? await loadRoomsByBookingIds(rows.map((row) => row.id), client)
    : {};

  const bookings = rows.map((row) => formatBookingListItem(row, roomsMap[row.id] || []));

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
    const roomIds = Array.isArray(bookingData.room_ids) ? bookingData.room_ids : [];
    const {
      room_ids: _roomIds,
      images: _clientImages,
      signatures: _clientSignatures,
      booking_number: _clientBookingNumber,
      ...bookingColumns
    } = bookingData;

    // Always assigned here. A number sent by the client is ignored.
    const bookingNumber = await generateBookingNumber(trx, bookingColumns.hotel_id);

    const insertPayload = {
      ...bookingColumns,
      room_id: roomIds[0] || bookingColumns.room_id,
      booking_number: bookingNumber,
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

    // The create API only needs these fields. Reloading photos, rooms, and the
    // hotel here kept the sequence lock open for several extra queries.
    const assignedRooms = roomIds.length
      ? roomIds.map(Number)
      : [Number(insertPayload.room_id)].filter((roomId) => roomId > 0);

    return {
      id: bookingId,
      hotel_id: insertPayload.hotel_id,
      booking_number: insertPayload.booking_number,
      booking_status: insertPayload.booking_status || null,
      actual_check_in: insertPayload.actual_check_in || null,
      actual_check_out: insertPayload.actual_check_out || null,
      room_id: assignedRooms,
    };
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

      // 3. Delete old signature rows from database
      await trx('images').where({ booking_id: id, is_signature: 1 }).delete();
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

      // 3. Delete old photo rows from database
      await trx('images').where({ booking_id: id, is_signature: 0 }).delete();
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

    return { id: Number(id) };
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

module.exports = {
  formatBooking,
  buildHotelCode,
  getIndianFinancialYear,
  generateBookingNumber,
  checkRoomOverlaps,
  checkRoomsOverlaps,
  findBookingById,
  findBookingForWrite,
  findBookings,
  createBooking,
  updateBooking,
  saveBookingColumns,
  softDeleteBooking,
};
