/**
 * Booking Service.
 * Implements business operations, room validation, date overlap prevention,
 * financial & GST tax calculation, local image uploads, and soft deletion.
 */
const bookingModel = require('../models/bookingModel');
const bookingPaymentModel = require('../models/bookingPaymentModel');
const paymentMethodModel = require('../models/paymentMethodModel');
const roomModel = require('../models/roomModel');
const { publishBookingDetail, scheduleHotelDashboard } = require('../sockets/roomSocket');
const uploadService = require('./uploadService');
const auditService = require('./auditService');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const {
  HTTP_STATUS,
  ROLE_CODES,
  BOOKING_STATUSES,
  NON_BLOCKING_BOOKING_STATUSES,
  CLEANING_DURATION_MINUTES,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} = require('../constants');

// Stays that can still hold the room or its dates. Derived so the list cannot drift
// from BOOKING_STATUSES.
const OPEN_BOOKING_STATUSES = BOOKING_STATUSES.filter(
  (status) => !NON_BLOCKING_BOOKING_STATUSES.includes(status)
);

/**
 * Guest email is optional and not unique. Any address is accepted, including one used by a
 * staff, hotel admin or super admin login, and many bookings can share it.
 * @param {*} value
 * @returns {string|null|undefined} undefined when the field was not sent
 */
const resolveGuestEmail = (value) => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  return String(value).trim().toLowerCase();
};

/**
 * Filter uploaded file array into image files and signature files
 * @param {Array<Object>} files
 * @returns {{ imageFiles: Array<Object>, signatureFiles: Array<Object> }}
 */
const categorizeUploadedFiles = (files) => {
  const imageFiles = [];
  const signatureFiles = [];

  if (!Array.isArray(files) || files.length === 0) {
    return { imageFiles, signatureFiles };
  }

  for (const file of files) {
    if (!file || !file.buffer) continue;
    const fieldName = (file.fieldname || '').toLowerCase();
    if (fieldName.includes('signature') || fieldName.includes('sign')) {
      signatureFiles.push(file);
    } else {
      imageFiles.push(file);
    }
  }

  return { imageFiles, signatureFiles };
};

/**
 * Accept a stay status from the client.
 * Blank input uses fallback. Create uses CHECKED_IN. The status update API requires a value.
 * @param {*} value
 * @param {{ required?: boolean, fallback?: string|null }} [options]
 * @returns {string|null}
 */
const resolveBookingStatus = (value, { required = false, fallback = 'CHECKED_IN' } = {}) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) {
      throw new AppError('booking_status is required.', HTTP_STATUS.BAD_REQUEST, [
        { field: 'booking_status', message: `Must be one of: ${BOOKING_STATUSES.join(', ')}.` },
      ]);
    }
    return fallback;
  }

  const status = String(value).trim().toUpperCase();
  if (!BOOKING_STATUSES.includes(status)) {
    throw new AppError(
      `booking_status must be one of: ${BOOKING_STATUSES.join(', ')}.`,
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'booking_status', message: `Must be one of: ${BOOKING_STATUSES.join(', ')}.` }]
    );
  }

  return status;
};

/**
 * Open stays on these rooms, other than the stay being changed.
 * Pending is included so its dates stay protected, but it does not keep the room reserved.
 * @param {Array<number|string>} roomIds
 * @param {number|string} bookingId
 * @returns {Promise<Map<number, { checkedIn: boolean, confirmed: boolean }>>}
 */
const findOtherOpenStaysForRooms = async (roomIds, bookingId) => {
  const ids = [...new Set(roomIds.map((roomId) => Number(roomId)).filter((roomId) => roomId > 0))];
  const map = new Map(ids.map((roomId) => [roomId, { checkedIn: false, confirmed: false }]));
  if (!ids.length) return map;

  const window = (query) => query
    .whereNot('bookings.id', Number(bookingId))
    .whereNull('bookings.deleted_at')
    .whereNull('bookings.actual_check_out')
    .whereIn('bookings.booking_status', OPEN_BOOKING_STATUSES);

  const primary = window(db('bookings'))
    .whereIn('bookings.room_id', ids)
    .select('bookings.booking_status', 'bookings.room_id as conflict_room_id');

  const linked = window(db('bookings').innerJoin('booking_rooms', 'booking_rooms.booking_id', 'bookings.id'))
    .whereIn('booking_rooms.room_id', ids)
    .select('bookings.booking_status', 'booking_rooms.room_id as conflict_room_id');

  const rows = await primary.union(linked);
  for (const row of rows) {
    const entry = map.get(Number(row.conflict_room_id));
    if (!entry) continue;
    if (row.booking_status === 'CHECKED_IN') entry.checkedIn = true;
    if (row.booking_status === 'CONFIRMED') entry.confirmed = true;
  }
  return map;
};

/**
 * Room status to use after this stay gives the room up.
 * Returns null when this stay was not holding the room, so MAINTENANCE and BLOCKED are left alone.
 * Another checked-in guest keeps the room OCCUPIED. Another confirmed stay keeps it RESERVED.
 * @param {string} currentRoomStatus
 * @param {string} stayStatus
 * @param {{ checkedIn: boolean, confirmed: boolean }} others
 * @returns {string|null}
 */
const roomStatusAfterRelease = (currentRoomStatus, stayStatus, others) => {
  const releasingStay = stayStatus === 'CANCELLED' || stayStatus === 'NO_SHOW' || stayStatus === 'PENDING';
  if (!releasingStay) return null;

  // Pending only reserved an available room. It must not clear an occupied room.
  const thisStayHoldsRoom = stayStatus === 'PENDING'
    ? currentRoomStatus === 'RESERVED'
    : currentRoomStatus === 'RESERVED' || currentRoomStatus === 'OCCUPIED';
  if (!thisStayHoldsRoom) return null;

  if (others.checkedIn) return 'OCCUPIED';
  if (others.confirmed) return 'RESERVED';
  return 'AVAILABLE';
};

/**
 * Room ids on a booking. room_id from the API is an array.
 * @param {Object} booking
 * @returns {number[]}
 */
const roomIdsFromBooking = (booking) => {
  if (Array.isArray(booking?.room_id) && booking.room_id.length) {
    return [...new Set(booking.room_id.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  }
  if (Array.isArray(booking?.rooms) && booking.rooms.length) {
    return [...new Set(booking.rooms.map((room) => Number(room.id)).filter((id) => id > 0))];
  }
  const single = Number(booking?.room_id);
  return Number.isInteger(single) && single > 0 ? [single] : [];
};

/**
 * Read room_id from the request. Accepts an array, a JSON array string,
 * a comma-separated string, or one room id.
 * @param {*} value
 * @param {{ required?: boolean }} [options]
 * @returns {number[]|null} null when the field was omitted and is not required
 */
const parseRoomIds = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new AppError('room_id is required.', HTTP_STATUS.BAD_REQUEST, [
        { field: 'room_id', message: 'room_id is required.' },
      ]);
    }
    return null;
  }

  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) {
        throw new AppError('room_id is required.', HTTP_STATUS.BAD_REQUEST, [
          { field: 'room_id', message: 'room_id is required.' },
        ]);
      }
      return null;
    }
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch (_) {
        list = null;
      }
    } else {
      list = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
  } else if (!Array.isArray(value)) {
    list = [value];
  }

  const ids = Array.isArray(list)
    ? [...new Set(list.map((item) => Number(item)))]
    : [];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError('room_id must be an array of room ids.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'room_id', message: 'room_id must be an array of room ids.' },
    ]);
  }
  return ids;
};

/**
 * Move every room on this stay to match the stay status.
 * Check-in occupies each room. Checkout starts cleaning on each room.
 * @param {Object} booking
 * @param {string} status
 * @param {Date} [now]
 * @param {number[]|null} [onlyRoomIds] - When set, only these rooms are updated
 * @returns {Promise<void>}
 */
const syncRoomForBookingStatus = async (booking, status, now = new Date(), onlyRoomIds = null) => {
  const roomIds = onlyRoomIds || roomIdsFromBooking(booking);
  if (!roomIds.length) return;

  const rows = await db('rooms')
    .whereIn('id', roomIds)
    .whereNull('deleted_at')
    .select('id', 'hotel_id', 'status');
  const byId = new Map(rows.map((room) => [Number(room.id), room]));
  const owned = [];
  for (const roomId of roomIds) {
    const room = byId.get(Number(roomId));
    if (!room || Number(room.hotel_id) !== Number(booking.hotel_id)) continue;
    owned.push(room);
  }
  if (!owned.length) return;

  if (status === 'CHECKED_IN') {
    await roomModel.setRoomsState(owned.map((room) => room.id), { status: 'OCCUPIED' });
    return;
  }

  if (status === 'CHECKED_OUT') {
    await roomModel.setRoomsState(owned.map((room) => room.id), {
      status: 'CLEANING',
      cleaning_started_at: now,
      cleaning_duration_minutes: CLEANING_DURATION_MINUTES,
    });
    return;
  }

  const othersByRoom = await findOtherOpenStaysForRooms(owned.map((room) => room.id), booking.id);
  const groups = new Map();
  for (const room of owned) {
    const currentStatus = room.status || 'AVAILABLE';
    const others = othersByRoom.get(Number(room.id)) || { checkedIn: false, confirmed: false };
    let nextStatus = null;

    // Confirming must not replace a guest who is already in the room.
    if (status === 'CONFIRMED' && currentStatus === 'AVAILABLE' && !others.checkedIn) {
      nextStatus = 'RESERVED';
    } else {
      nextStatus = roomStatusAfterRelease(currentStatus, status, others);
    }
    if (!nextStatus) continue;
    if (!groups.has(nextStatus)) groups.set(nextStatus, []);
    groups.get(nextStatus).push(room.id);
  }

  await Promise.all(
    [...groups.entries()].map(([nextStatus, ids]) => roomModel.setRoomsState(ids, { status: nextStatus }))
  );
};

/**
 * A guest cannot be checked out while any amount is still due.
 * The amount is the balance left after the full bill, which this request must collect.
 * @param {number} dueAmount
 */
const assertNoDueForCheckout = (dueAmount) => {
  const due = Math.round(Number(dueAmount) * 100) / 100;
  if (due > 0) {
    const message = `Checkout cannot be completed. Please collect the total due amount of ${due.toFixed(2)} in full.`;
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST, [
      { field: 'due_amount', message: due.toFixed(2) },
    ], { dueAmount: due });
  }
};

/**
 * A checkout amount from the body, or the value already stored on the booking.
 * A missing or blank field keeps the stored value. Zero is a real amount.
 * @param {*} value
 * @param {*} fallback
 * @returns {number}
 */
const readCheckoutAmount = (value, fallback) => {
  if (value === undefined || value === null || value === '') return Number(fallback) || 0;
  return Number(value);
};

/**
 * Discount for this checkout. discount_amount replaces the discount saved at booking.
 * discount is accepted as the same field. Leave both out to keep the saved discount.
 * @param {Object} body
 * @param {Object} existing
 * @returns {number}
 */
const readCheckoutDiscount = (body, existing) => {
  if (body.discount_amount !== undefined && body.discount_amount !== null && body.discount_amount !== '') {
    return Number(body.discount_amount);
  }
  if (body.discount !== undefined && body.discount !== null && body.discount !== '') {
    return Number(body.discount);
  }
  return Number(existing.discount_amount) || 0;
};

/**
 * Accept a payment method from this hotel's list. A blank value means CASH.
 * The saved name is the one stored for the hotel, so letter case matches that row.
 * @param {*} value
 * @param {number|string} hotelId
 * @returns {Promise<string>}
 */
const resolvePaymentMethod = async (value, hotelId) => {
  const requested = value === undefined || value === null || String(value).trim() === ''
    ? 'CASH'
    : String(value).trim();
  const method = await paymentMethodModel.findActiveByName(hotelId, requested);
  if (!method) {
    throw new AppError(
      'payment_method is not available for this hotel.',
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'payment_method', message: 'Choose a payment method from this hotel.' }]
    );
  }
  return method.name;
};

/**
 * Add a payment history row when the amount paid on a booking changed.
 * Money taken back (a lower paid_amount) is REFUNDED. Otherwise the row is PAID when the bill
 * is fully paid after it, and PARTIALLY_PAID while a balance is left.
 * Used by create and check-out. An update replaces the history instead of adding a row.
 * @param {Object} booking - Needs id and hotel_id
 * @param {number} amount - Signed change in paid_amount. Zero is ignored.
 * @param {Object} details
 * @param {string} details.source - BOOKING or CHECKOUT
 * @param {string} details.method - One of PAYMENT_METHODS
 * @param {string} details.bookingPaymentStatus - Booking payment_status after this change
 * @param {Object} reqUser
 * @returns {Promise<void>}
 */
const recordPayment = async (booking, amount, { source, method, bookingPaymentStatus }, reqUser) => {
  const change = Math.round(Number(amount) * 100) / 100;
  if (!change) return;

  let status = 'PARTIALLY_PAID';
  if (change < 0) status = 'REFUNDED';
  else if (bookingPaymentStatus === 'PAID') status = 'PAID';

  await bookingPaymentModel.createPayment({
    hotel_id: booking.hotel_id,
    booking_id: booking.id,
    amount: change,
    payment_method: method,
    status,
    source,
    received_by: reqUser?.id,
  });
};

/**
 * True when the client sent a value. A missing or blank field is left alone.
 * @param {*} value
 * @returns {boolean}
 */
const wasProvided = (value) => value !== undefined && value !== null && String(value).trim() !== '';

/**
 * Replace this booking's payment history with the paid amount from the update.
 * Called only when the request includes paid_amount or payment_method.
 * @param {Object} booking
 * @param {number} paidAmount
 * @param {string} method
 * @param {string} bookingPaymentStatus
 * @param {Object} reqUser
 * @returns {Promise<void>}
 */
const replaceBookingPayment = async (booking, paidAmount, method, bookingPaymentStatus, reqUser) => {
  const amount = Math.round(Number(paidAmount) * 100) / 100;
  const status = bookingPaymentStatus === 'PAID' ? 'PAID' : 'PARTIALLY_PAID';

  await bookingPaymentModel.replacePaymentsForBooking(booking.id, amount > 0 ? {
    hotel_id: booking.hotel_id,
    amount,
    payment_method: method,
    status,
    source: 'UPDATE',
    received_by: reqUser?.id,
  } : null);
};

/**
 * Push the saved booking to the hotel socket. A socket failure does not change the API result.
 * @param {number|string} bookingId
 * @returns {Promise<void>}
 */
const notifyBookingUpdated = async (bookingId) => {
  try {
    const booking = await bookingModel.findBookingById(bookingId, {
      includeDeleted: true,
      includeMedia: true,
    });
    if (!booking) return;
    const paymentHistory = await bookingPaymentModel.findPaymentsByBookingId(booking.id);
    publishBookingDetail({ ...booking, payment_history: paymentHistory });
    scheduleHotelDashboard(booking.hotel_id);
  } catch (err) {
    console.error('[Booking] Failed to publish booking update:', err.message);
  }
};

/**
 * Save booking_status and align the room.
 * Guest details, scheduled dates, and payment amounts are not changed here.
 * @param {Object} booking
 * @param {string} status
 * @returns {Promise<void>}
 */
const applyBookingStatusEffects = async (booking, status) => {
  const now = new Date();
  const updates = { booking_status: status };

  if (status === 'CHECKED_IN' && !booking.actual_check_in) {
    updates.actual_check_in = now;
  }
  if (status === 'CHECKED_OUT' && !booking.actual_check_out) {
    updates.actual_check_out = now;
  }

  const statusChanged = booking.booking_status !== status;
  const stampsCheckIn = Object.prototype.hasOwnProperty.call(updates, 'actual_check_in');
  const stampsCheckOut = Object.prototype.hasOwnProperty.call(updates, 'actual_check_out');
  // Create already stored the status and the check-in time. Skip that second write.
  if (statusChanged || stampsCheckIn || stampsCheckOut) {
    await bookingModel.saveBookingColumns(booking.id, updates);
  }
  await syncRoomForBookingStatus(booking, status, now);
};

/**
 * Calculate financial totals, taxes (GST, CGST, SGST), and derive payment status
 * @param {Object} params
 * @returns {Object}
 */
const calculatePricing = ({
  base_amount,
  discount_amount = 0,
  extra_charges_total = 0,
  late_checkout_charge = 0,
  late_checkout_hours = 0,
  gst_rate = 18.00,
  paid_amount = 0,
  rooms = [],
  numberOfNights = 1,
}) => {
  let baseAmount = Number(base_amount);
  if (isNaN(baseAmount) || baseAmount <= 0) {
    // No base amount sent: add every room's nightly rate for the whole stay.
    const nightlyTotal = rooms.reduce(
      (sum, item) => sum + (Number(item?.custom_price_per_night) || 0),
      0
    );
    baseAmount = nightlyTotal > 0 ? nightlyTotal * numberOfNights : 0;
  }

  const discountAmount = Math.max(0, Number(discount_amount) || 0);
  const extraCharges = Math.max(0, Number(extra_charges_total) || 0);
  const lateCheckoutCharge = Math.max(0, Number(late_checkout_charge) || 0);
  const lateCheckoutHours = Math.max(0, Number(late_checkout_hours) || 0);

  // Room charge, extras, and the late fee are added first. Discount comes off that sum, then GST.
  const taxableAmount = Math.max(0, baseAmount + extraCharges + lateCheckoutCharge - discountAmount);

  // GST rates
  const gstRate = gst_rate !== undefined && gst_rate !== null ? Math.max(0, Number(gst_rate)) : 18.00;
  const cgstRate = Math.round((gstRate / 2) * 100) / 100;
  const sgstRate = Math.round((gstRate / 2) * 100) / 100;

  // Taxes
  const gstAmount = Math.round((taxableAmount * (gstRate / 100)) * 100) / 100;
  const cgstAmount = Math.round((gstAmount / 2) * 100) / 100;
  const sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100;
  const taxAmount = gstAmount;

  // Total is the discounted amount plus GST. Extras and the late fee are already inside the taxable amount.
  const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

  // Paid & Due
  const paidAmount = Math.max(0, Number(paid_amount) || 0);
  const dueAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);

  // Derive payment status
  let paymentStatus = 'PENDING';
  if (totalAmount > 0 && paidAmount >= totalAmount) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0 && paidAmount < totalAmount) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return {
    base_amount: Math.round(baseAmount * 100) / 100,
    discount_amount: Math.round(discountAmount * 100) / 100,
    extra_charges_total: Math.round(extraCharges * 100) / 100,
    late_checkout_charge: Math.round(lateCheckoutCharge * 100) / 100,
    late_checkout_hours: lateCheckoutHours,
    taxable_amount: Math.round(taxableAmount * 100) / 100,
    gst_rate: gstRate,
    cgst_rate: cgstRate,
    sgst_rate: sgstRate,
    gst_amount: gstAmount,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    paid_amount: Math.round(paidAmount * 100) / 100,
    due_amount: dueAmount,
    payment_status: paymentStatus,
  };
};

/**
 * Validate and verify hotel, creator, room, dates, and overlap guards
 */
const validateBookingPreconditions = async ({
  hotelId,
  roomIds,
  checkInDate,
  checkOutDate,
  excludeBookingId = null,
  reqUser = null,
}) => {
  // 1. Date chronological validity
  const inDate = new Date(checkInDate);
  const outDate = new Date(checkOutDate);

  if (isNaN(inDate.getTime())) {
    throw new AppError('Invalid check_in_date format.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'check_in_date', message: 'check_in_date must be a valid date.' },
    ]);
  }
  if (isNaN(outDate.getTime())) {
    throw new AppError('Invalid check_out_date format.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'check_out_date', message: 'check_out_date must be a valid date.' },
    ]);
  }

  if (outDate <= inDate) {
    throw new AppError(
      'Invalid booking dates: check_out_date must be strictly after check_in_date.',
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'check_out_date', message: 'check_out_date must be greater than check_in_date.' }]
    );
  }

  const diffMs = outDate.getTime() - inDate.getTime();
  const numberOfNights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // Hotel existence and every room are independent, so they are read together.
  const [hotel, roomRows] = await Promise.all([
    db('hotels').where({ id: hotelId }).whereNull('deleted_at').select('id').first(),
    db('rooms')
      .whereIn('id', roomIds)
      .whereNull('deleted_at')
      .select('id', 'hotel_id', 'room_number', 'is_active', 'custom_price_per_night'),
  ]);

  if (!hotel) {
    throw new AppError(`Hotel with ID ${hotelId} does not exist or has been deleted.`, HTTP_STATUS.BAD_REQUEST, [
      { field: 'hotel_id', message: `Hotel ID ${hotelId} not found.` },
    ]);
  }

  // RBAC cross-hotel authorization guard
  if (reqUser && reqUser.role !== ROLE_CODES.SUPER_ADMIN && reqUser.hotel_id) {
    if (Number(reqUser.hotel_id) !== Number(hotelId)) {
      throw new AppError(
        `Unauthorized: You do not have permission to manage bookings for hotel ID ${hotelId}.`,
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  const roomsById = new Map(roomRows.map((room) => [Number(room.id), room]));
  const rooms = [];
  for (const roomId of roomIds) {
    const room = roomsById.get(Number(roomId));
    if (!room) {
      throw new AppError(
        `Room ID ${roomId} not found or has been deleted.`,
        HTTP_STATUS.BAD_REQUEST,
        [{ field: 'room_id', message: `Invalid room ID: ${roomId}` }]
      );
    }

    if (Number(room.hotel_id) !== Number(hotelId)) {
      throw new AppError(
        `Room '${room.room_number}' (ID ${room.id}) belongs to hotel ID ${room.hotel_id}, not hotel ID ${hotelId}.`,
        HTTP_STATUS.BAD_REQUEST,
        [{ field: 'room_id', message: `Room ${room.id} belongs to a different hotel.` }]
      );
    }

    if (!room.is_active) {
      throw new AppError(
        `Room '${room.room_number}' (ID ${room.id}) is currently inactive and cannot be booked.`,
        HTTP_STATUS.BAD_REQUEST,
        [{ field: 'room_id', message: `Room ${room.id} is marked inactive.` }]
      );
    }

    rooms.push(room);
  }

  // One overlap read for every room. The first room in the request still wins the error.
  const overlapRows = await bookingModel.checkRoomsOverlaps(roomIds, inDate, outDate, { excludeBookingId });
  const conflictsByRoom = new Map();
  for (const row of overlapRows) {
    const conflictRoomId = Number(row.conflict_room_id);
    if (!conflictsByRoom.has(conflictRoomId)) conflictsByRoom.set(conflictRoomId, []);
    const list = conflictsByRoom.get(conflictRoomId);
    if (list.some((item) => item.booking_id === row.booking_id)) continue;
    list.push({
      booking_id: row.booking_id,
      booking_number: row.booking_number,
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
      room_id: row.room_id,
    });
  }

  for (const room of rooms) {
    const conflicts = conflictsByRoom.get(Number(room.id)) || [];
    if (conflicts.length === 0) continue;
    const first = conflicts[0];
    const confStart = new Date(first.check_in_date).toISOString().slice(0, 10);
    const confEnd = new Date(first.check_out_date).toISOString().slice(0, 10);
    throw new AppError(
      `Room '${room.room_number}' is already booked from ${confStart} to ${confEnd} (Booking #${first.booking_number}). Overlapping bookings are not allowed.`,
      HTTP_STATUS.CONFLICT,
      [
        {
          field: 'room_id',
          message: `Room ${room.id} overlaps booking ${first.booking_number}`,
          conflicts,
        },
      ]
    );
  }

  return { inDate, outDate, numberOfNights, hotel, rooms };
};

/**
 * Create a new booking
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const createBooking = async (body, files = [], reqUser = null) => {
  // hotel_id comes from the authenticated user token. Body hotel_id is ignored.
  const hotelId = resolveHotelId(reqUser);

  const roomIds = parseRoomIds(body.room_id, { required: true });

  // Primary Guest Details
  const primaryGuestName = body.primary_guest_name ? String(body.primary_guest_name).trim() : '';
  if (!primaryGuestName) {
    throw new AppError('primary_guest_name is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'primary_guest_name', message: 'primary_guest_name cannot be empty.' },
    ]);
  }

  const mobileNumber = body.mobile_number ? String(body.mobile_number).trim() : '';
  if (!mobileNumber) {
    throw new AppError('mobile_number is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'mobile_number', message: 'mobile_number cannot be empty.' },
    ]);
  }

  const createdBy = Number(reqUser?.id);
  if (!createdBy) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }

  // Preconditions & Overlap check
  const { inDate, outDate, numberOfNights, rooms } = await validateBookingPreconditions({
    hotelId,
    roomIds,
    checkInDate: body.check_in_date,
    checkOutDate: body.check_out_date,
    reqUser,
  });

  // Calculate pricing breakdown. When base_amount is omitted, add every room's nightly rate.
  const pricing = calculatePricing({
    base_amount: body.base_amount,
    discount_amount: body.discount_amount,
    gst_rate: body.gst_rate,
    paid_amount: body.paid_amount,
    rooms,
    numberOfNights,
  });

  // Front desk create checks the guest in unless booking_status is sent.
  const bookingStatus = resolveBookingStatus(body.booking_status, { fallback: 'CHECKED_IN' });
  if (bookingStatus === 'CHECKED_OUT') assertNoDueForCheckout(pricing.due_amount);
  const paymentMethod = await resolvePaymentMethod(body.payment_method, hotelId);

  // Guest photos and signatures arrive only as form-data files. The two folders upload together.
  const { imageFiles, signatureFiles } = categorizeUploadedFiles(files);
  const now = new Date();
  const [uploadedImages, uploadedSignatures] = await Promise.all([
    uploadService.uploadFiles(imageFiles, 'bookings/images'),
    uploadService.uploadFiles(signatureFiles, 'bookings/signatures'),
  ]);

  const bookingData = {
    hotel_id: hotelId,
    primary_guest_name: primaryGuestName,
    secondary_guest_name: body.secondary_guest_name ? String(body.secondary_guest_name).trim() : null,
    mobile_number: mobileNumber,
    address: body.address ? String(body.address).trim() : null,
    room_id: roomIds[0],
    room_ids: roomIds,
    created_by: createdBy,
    check_in_date: inDate,
    check_out_date: outDate,
    actual_check_in: now,
    actual_check_out: body.actual_check_out
      ? new Date(body.actual_check_out)
      : (bookingStatus === 'CHECKED_OUT' ? now : null),
    number_of_nights: numberOfNights,
    adults: Math.max(1, Number(body.adults) || 1),
    children: Math.max(0, Number(body.children) || 0),
    ...pricing,
    notes: body.notes ? String(body.notes).trim() : '',
    // payment_status in the pricing fields is still derived only from the amount paid.
    booking_status: bookingStatus,
    deleted_at: null,
  };

  const guestEmail = resolveGuestEmail(body.email);
  if (guestEmail !== undefined) bookingData.email = guestEmail;

  const newBooking = await bookingModel.createBooking(bookingData, {
    imageRecords: uploadedImages,
    signatureRecords: uploadedSignatures,
  });

  // Payment history and room status do not depend on each other.
  const followUps = [
    recordPayment(newBooking, pricing.paid_amount, {
      source: 'BOOKING',
      method: paymentMethod,
      bookingPaymentStatus: pricing.payment_status,
    }, reqUser),
  ];

  // PENDING leaves every room unchanged. Any other status moves all rooms together.
  if (newBooking.booking_status && newBooking.booking_status !== 'PENDING') {
    followUps.push(applyBookingStatusEffects(newBooking, newBooking.booking_status));
  }

  await Promise.all(followUps);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.CREATE,
    entityType: AUDIT_ENTITIES.BOOKING,
    entityId: newBooking.id,
    hotelId,
    description: `Booking ${newBooking.booking_number} created for ${primaryGuestName}.`,
  });

  await notifyBookingUpdated(newBooking.id);
  return { id: newBooking.id };
};

/**
 * List bookings with filtering, search, and pagination
 * @param {Object} query
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const getBookings = async (query = {}, reqUser = null) => {
  const filters = {};

  if (reqUser && reqUser.hotel_id) {
    filters.hotel_id = Number(reqUser.hotel_id);
  }

  if (query.room_id) filters.room_id = Number(query.room_id);
  if (query.booking_number) filters.booking_number = query.booking_number;
  if (query.primary_guest_name) filters.primary_guest_name = query.primary_guest_name;
  if (query.guest_name) filters.guest_name = query.guest_name;
  if (query.mobile_number) filters.mobile_number = query.mobile_number;
  if (query.payment_status) filters.payment_status = query.payment_status;
  if (query.booking_status) filters.booking_status = query.booking_status;
  if (query.check_in_from) filters.check_in_from = query.check_in_from;
  if (query.check_in_to) filters.check_in_to = query.check_in_to;
  if (query.check_out_from) filters.check_out_from = query.check_out_from;
  if (query.check_out_to) filters.check_out_to = query.check_out_to;
  if (query.search) filters.search = query.search;

  const pagination = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
  };

  return bookingModel.findBookings(filters, pagination);
};

/**
 * Get booking details by ID
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @param {Object} [options]
 * @param {boolean} [options.includeMedia=true]
 * @returns {Promise<Object>}
 */
const getBookingById = async (id, reqUser = null, { includeMedia = true } = {}) => {
  const numericId = Number(id);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    throw new AppError('Invalid booking ID. Must be a positive integer.', HTTP_STATUS.BAD_REQUEST);
  }

  const booking = await bookingModel.findBookingById(numericId, { includeMedia });
  if (!booking) {
    throw new AppError(`Booking with ID ${id} not found.`, HTTP_STATUS.NOT_FOUND);
  }

  if (reqUser && reqUser.role !== ROLE_CODES.SUPER_ADMIN && reqUser.hotel_id) {
    if (Number(reqUser.hotel_id) !== Number(booking.hotel_id)) {
      throw new AppError(
        'Access denied: You cannot view bookings from another hotel.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  return booking;
};

/**
 * Booking row and room ids for a write. Photos and the hotel profile are not loaded.
 * Same id, missing-row, and hotel access errors as the detail read.
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const getBookingForWrite = async (id, reqUser = null) => {
  const numericId = Number(id);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    throw new AppError('Invalid booking ID. Must be a positive integer.', HTTP_STATUS.BAD_REQUEST);
  }

  const booking = await bookingModel.findBookingForWrite(numericId);
  if (!booking) {
    throw new AppError(`Booking with ID ${id} not found.`, HTTP_STATUS.NOT_FOUND);
  }

  if (reqUser && reqUser.role !== ROLE_CODES.SUPER_ADMIN && reqUser.hotel_id) {
    if (Number(reqUser.hotel_id) !== Number(booking.hotel_id)) {
      throw new AppError(
        'Access denied: You cannot view bookings from another hotel.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  return booking;
};

/**
 * Update booking by ID
 * @param {number|string} id
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const updateBooking = async (id, body, files = [], reqUser = null) => {
  const existing = await getBookingForWrite(id, reqUser);
  const paidAmountProvided = wasProvided(body.paid_amount);
  const paymentMethodProvided = wasProvided(body.payment_method);
  const paymentMethod = paymentMethodProvided
    ? await resolvePaymentMethod(body.payment_method, existing.hotel_id)
    : null;

  const hotelId = existing.hotel_id;
  const inDate = body.check_in_date ? new Date(body.check_in_date) : new Date(existing.check_in_date);
  const outDate = body.check_out_date ? new Date(body.check_out_date) : new Date(existing.check_out_date);
  const previousRoomIds = roomIdsFromBooking(existing);
  const roomIds = parseRoomIds(body.room_id, { required: false }) || previousRoomIds;

  // Preconditions & Overlap check (excluding current booking)
  const { numberOfNights, rooms } = await validateBookingPreconditions({
    hotelId,
    roomIds,
    checkInDate: inDate,
    checkOutDate: outDate,
    excludeBookingId: existing.id,
    reqUser,
  });

  // Calculate pricing breakdown
  const pricing = calculatePricing({
    base_amount: body.base_amount !== undefined ? body.base_amount : existing.base_amount,
    discount_amount: body.discount_amount !== undefined ? body.discount_amount : existing.discount_amount,
    // Extra charges and the late checkout charge are set only by the checkout API. An update keeps them and taxes them with the room charge.
    extra_charges_total: existing.extra_charges_total,
    late_checkout_charge: existing.late_checkout_charge,
    late_checkout_hours: existing.late_checkout_hours,
    gst_rate: body.gst_rate !== undefined ? body.gst_rate : existing.gst_rate,
    paid_amount: paidAmountProvided ? body.paid_amount : existing.paid_amount,
    rooms,
    numberOfNights,
  });

  const updatePayload = {
    room_id: roomIds[0],
    room_ids: roomIds,
    check_in_date: inDate,
    check_out_date: outDate,
    number_of_nights: numberOfNights,
    ...pricing,
  };

  if (body.primary_guest_name) updatePayload.primary_guest_name = String(body.primary_guest_name).trim();
  if (body.secondary_guest_name !== undefined) {
    updatePayload.secondary_guest_name = body.secondary_guest_name ? String(body.secondary_guest_name).trim() : null;
  }
  if (body.mobile_number) updatePayload.mobile_number = String(body.mobile_number).trim();
  if (body.email !== undefined) updatePayload.email = resolveGuestEmail(body.email);
  if (body.address !== undefined) updatePayload.address = body.address ? String(body.address).trim() : null;
  if (body.actual_check_in !== undefined) {
    updatePayload.actual_check_in = body.actual_check_in ? new Date(body.actual_check_in) : null;
  }
  if (body.actual_check_out !== undefined) {
    updatePayload.actual_check_out = body.actual_check_out ? new Date(body.actual_check_out) : null;
  }
  if (body.adults !== undefined) updatePayload.adults = Math.max(1, Number(body.adults) || 1);
  if (body.children !== undefined) updatePayload.children = Math.max(0, Number(body.children) || 0);
  if (body.notes !== undefined) updatePayload.notes = body.notes ? String(body.notes).trim() : '';

  // Guest photos and signatures arrive only as form-data files.
  const { imageFiles, signatureFiles } = categorizeUploadedFiles(files);
  const [uploadedImages, uploadedSignatures] = await Promise.all([
    uploadService.uploadFiles(imageFiles, 'bookings/images'),
    uploadService.uploadFiles(signatureFiles, 'bookings/signatures'),
  ]);

  await bookingModel.updateBooking(existing.id, updatePayload, {
    imageRecords: uploadedImages,
    signatureRecords: uploadedSignatures,
  });

  // Rooms dropped from the stay are released. Rooms added pick up the current stay status.
  const removedRoomIds = previousRoomIds.filter((roomId) => !roomIds.includes(roomId));
  const addedRoomIds = roomIds.filter((roomId) => !previousRoomIds.includes(roomId));
  const roomFollowUps = [];
  if (paidAmountProvided || paymentMethodProvided) {
    let method = paymentMethod;
    if (!method) {
      const history = await bookingPaymentModel.findPaymentsByBookingId(existing.id);
      const previous = history.find((row) => Number(row.amount) > 0 && row.payment_method);
      method = previous?.payment_method || 'CASH';
    }
    roomFollowUps.push(replaceBookingPayment(
      existing,
      pricing.paid_amount,
      method,
      pricing.payment_status,
      reqUser
    ));
  }
  if (removedRoomIds.length > 0) {
    roomFollowUps.push(syncRoomForBookingStatus(existing, 'CANCELLED', new Date(), removedRoomIds));
  }
  if (addedRoomIds.length > 0 && existing.booking_status && existing.booking_status !== 'PENDING') {
    roomFollowUps.push(syncRoomForBookingStatus(existing, existing.booking_status, new Date(), addedRoomIds));
  }
  await Promise.all(roomFollowUps);

  // room_ids is the storage form of room_id. Compare room_id as the full list, like the stored booking.
  const auditFields = { ...updatePayload, room_id: roomIds };
  delete auditFields.room_ids;

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: AUDIT_ENTITIES.BOOKING,
    entityId: existing.id,
    hotelId,
    description: `Booking ${existing.booking_number} updated.`,
    changes: auditService.diffChanges(existing, auditFields),
  });

  await notifyBookingUpdated(existing.id);
  return { id: existing.id };
};

/**
 * Check a guest out of a booking.
 * body.paid_amount is added to the amount already paid. It does not replace it.
 * Extra charges and the late fee are included before the discount and GST, so both are taxed.
 * Checkout is rejected when any due remains after that payment. Nothing is saved in that case.
 * Scheduled dates and nights stay as booked.
 * The stay becomes CHECKED_OUT and every room on the booking is marked CLEANING.
 * @param {number|string} id
 * @param {Object} [body={}]
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const checkOutBooking = async (id, body = {}, reqUser = null) => {
  const hotelId = resolveHotelId(reqUser);
  const existing = await getBookingForWrite(id, reqUser);

  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied: You cannot check out a booking from another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (existing.actual_check_out) {
    throw new AppError('This booking has already been checked out.', HTTP_STATUS.BAD_REQUEST);
  }

  const collectedNow = readCheckoutAmount(body.paid_amount, 0);
  const lateCharge = readCheckoutAmount(body.late_checkout_charge, existing.late_checkout_charge);
  const lateHours = readCheckoutAmount(body.late_checkout_hours, existing.late_checkout_hours);
  // Extra charges (minibar, laundry, ...) can be settled at checkout. The value is the full total for the stay.
  const extraCharges = readCheckoutAmount(body.extra_charges_total, existing.extra_charges_total);
  // A discount sent here replaces the one saved at booking, then the due is calculated from that bill.
  const discountAmount = readCheckoutDiscount(body, existing);

  if ([collectedNow, lateCharge, lateHours, extraCharges, discountAmount].some((value) => Number.isNaN(value) || value < 0)) {
    throw new AppError('Checkout amounts cannot be negative.', HTTP_STATUS.BAD_REQUEST);
  }

  const pricing = calculatePricing({
    base_amount: existing.base_amount,
    discount_amount: discountAmount,
    extra_charges_total: extraCharges,
    late_checkout_charge: lateCharge,
    late_checkout_hours: lateHours,
    gst_rate: existing.gst_rate,
    paid_amount: Number(existing.paid_amount) + collectedNow,
    numberOfNights: existing.number_of_nights,
  });

  const paymentMethod = await resolvePaymentMethod(body.payment_method, existing.hotel_id);

  // Due after this request's discount, extras, late fee, and GST, minus what was already paid.
  // The payment in this request is not saved unless it clears that balance.
  const dueAfterDiscount = Math.max(
    0,
    Math.round((pricing.total_amount - Number(existing.paid_amount)) * 100) / 100
  );
  if (pricing.due_amount > 0) {
    assertNoDueForCheckout(dueAfterDiscount);
  }

  const now = new Date();
  const updates = {
    ...pricing,
    actual_check_out: now,
    booking_status: 'CHECKED_OUT',
  };

  if (body.notes !== undefined && String(body.notes).trim()) {
    const note = String(body.notes).trim();
    updates.notes = existing.notes ? `${existing.notes}\n${note}` : note;
  }

  await bookingModel.saveBookingColumns(existing.id, updates);
  await Promise.all([
    recordPayment(existing, collectedNow, {
      source: 'CHECKOUT',
      method: paymentMethod,
      bookingPaymentStatus: pricing.payment_status,
    }, reqUser),
    syncRoomForBookingStatus(existing, 'CHECKED_OUT', now),
  ]);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.CHECK_OUT,
    entityType: AUDIT_ENTITIES.BOOKING,
    entityId: existing.id,
    hotelId,
    description: `Booking ${existing.booking_number} checked out.`,
    changes: auditService.diffChanges(existing, updates),
  });

  await notifyBookingUpdated(existing.id);
  return { id: existing.id };
};

/**
 * Update only booking_status.
 * hotel_id comes from the authenticated user token.
 * Guest details, dates, and payment totals are left unchanged. Every room on the booking follows the new status.
 * @param {number|string} id
 * @param {Object} body
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const updateBookingStatus = async (id, body = {}, reqUser = null) => {
  const hotelId = resolveHotelId(reqUser);
  const existing = await getBookingForWrite(id, reqUser);

  if (Number(existing.hotel_id) !== hotelId) {
    throw new AppError(
      'Access denied: You cannot update a booking from another hotel.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  const status = resolveBookingStatus(body.booking_status, { required: true, fallback: null });
  if (status === 'CHECKED_OUT') assertNoDueForCheckout(existing.due_amount);

  await applyBookingStatusEffects(existing, status);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: AUDIT_ENTITIES.BOOKING,
    entityId: existing.id,
    hotelId,
    description: `Booking ${existing.booking_number} status changed to ${status}.`,
    changes: auditService.diffChanges(existing, { booking_status: status }),
  });

  await notifyBookingUpdated(existing.id);
  return { id: existing.id };
};

/**
 * One booking with its payment history, newest payment first.
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const getBookingDetails = async (id, reqUser = null) => {
  const booking = await getBookingById(id, reqUser);
  const paymentHistory = await bookingPaymentModel.findPaymentsByBookingId(booking.id);

  return { ...booking, payment_history: paymentHistory };
};

/**
 * Soft delete a booking setting deleted_at
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const deleteBooking = async (id, reqUser = null) => {
  const existing = await getBookingForWrite(id, reqUser);
  // Free rooms this stay was holding before the row is hidden.
  await syncRoomForBookingStatus(existing, 'CANCELLED');
  await bookingModel.softDeleteBooking(existing.id);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.DELETE,
    entityType: AUDIT_ENTITIES.BOOKING,
    entityId: existing.id,
    hotelId: existing.hotel_id,
    description: `Booking ${existing.booking_number} deleted.`,
  });

  await notifyBookingUpdated(existing.id);
  return { id: existing.id };
};

module.exports = {
  calculatePricing,
  createBooking,
  getBookings,
  getBookingById,
  getBookingDetails,
  updateBooking,
  checkOutBooking,
  updateBookingStatus,
  deleteBooking,
};
