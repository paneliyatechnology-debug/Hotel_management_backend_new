/**
 * Booking Service.
 * Implements business operations, room validation, date overlap prevention,
 * financial & GST tax calculation, S3 media uploads, and soft deletion.
 * Follows TradeNexa service architecture.
 */
const bookingModel = require('../models/bookingModel');
const roomModel = require('../models/roomModel');
const hotelModel = require('../models/hotelModel');
const userModel = require('../models/userModel');
const s3Service = require('./s3Service');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

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
  room = null,
  numberOfNights = 1,
}) => {
  let baseAmount = Number(base_amount);
  if (isNaN(baseAmount) || baseAmount <= 0) {
    const roomRate = Number(room?.custom_price_per_night) || 0;
    baseAmount = roomRate > 0 ? roomRate * numberOfNights : 0;
  }

  const discountAmount = Math.max(0, Number(discount_amount) || 0);
  const extraCharges = Math.max(0, Number(extra_charges_total) || 0);
  const lateCheckoutCharge = Math.max(0, Number(late_checkout_charge) || 0);
  const lateCheckoutHours = Math.max(0, Number(late_checkout_hours) || 0);

  // Taxable amount
  const taxableAmount = Math.max(0, (baseAmount - discountAmount) + extraCharges + lateCheckoutCharge);

  // GST rates
  const gstRate = gst_rate !== undefined && gst_rate !== null ? Math.max(0, Number(gst_rate)) : 18.00;
  const cgstRate = Math.round((gstRate / 2) * 100) / 100;
  const sgstRate = Math.round((gstRate / 2) * 100) / 100;

  // Taxes
  const gstAmount = Math.round((taxableAmount * (gstRate / 100)) * 100) / 100;
  const cgstAmount = Math.round((gstAmount / 2) * 100) / 100;
  const sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100;
  const taxAmount = gstAmount;

  // Total
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
  roomId,
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

  // 2. Hotel existence and active check
  const hotel = await hotelModel.findHotelById(hotelId);
  if (!hotel) {
    throw new AppError(`Hotel with ID ${hotelId} does not exist or has been deleted.`, HTTP_STATUS.BAD_REQUEST, [
      { field: 'hotel_id', message: `Hotel ID ${hotelId} not found.` },
    ]);
  }

  // 3. RBAC cross-hotel authorization guard
  if (reqUser && reqUser.role !== ROLE_CODES.SUPER_ADMIN && reqUser.hotel_id) {
    if (Number(reqUser.hotel_id) !== Number(hotelId)) {
      throw new AppError(
        `Unauthorized: You do not have permission to manage bookings for hotel ID ${hotelId}.`,
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  // 4. Room existence, ownership, active, and soft-delete verification
  const room = await db('rooms')
    .where({ id: roomId })
    .whereNull('deleted_at')
    .first();

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

  // 5. Overlapping booking conflict prevention
  const conflicts = await bookingModel.checkRoomOverlaps(
    roomId,
    inDate,
    outDate,
    { excludeBookingId }
  );

  if (conflicts.length > 0) {
    const first = conflicts[0];
    const confStart = new Date(first.check_in_date).toISOString().slice(0, 10);
    const confEnd = new Date(first.check_out_date).toISOString().slice(0, 10);
    throw new AppError(
      `Room '${first.room_number || roomId}' is already booked from ${confStart} to ${confEnd} (Booking #${first.booking_number}). Overlapping bookings are not allowed.`,
      HTTP_STATUS.CONFLICT,
      [
        {
          field: 'room_id',
          message: `Room overlap conflict with booking ${first.booking_number}`,
          conflicts,
        },
      ]
    );
  }

  return { inDate, outDate, numberOfNights, hotel, room };
};

/**
 * Create a new booking
 * @param {Object} body
 * @param {Array<Object>} [files=[]]
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>} Created booking
 */
const createBooking = async (body, files = [], reqUser = null) => {
  // hotel_id comes from the authenticated user token. Body hotel_id is ignored.
  const hotelId = resolveHotelId(reqUser);

  const roomId = Number(body.room_id);
  if (!roomId || isNaN(roomId) || roomId <= 0) {
    throw new AppError('room_id is required and must be a positive integer.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'room_id', message: 'room_id is required.' },
    ]);
  }

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

  // Created By user resolution
  let createdBy = body.created_by ? Number(body.created_by) : reqUser?.id;
  if (!createdBy) {
    const hotel = await hotelModel.findHotelById(hotelId);
    if (hotel?.ownerId) {
      createdBy = hotel.ownerId;
    } else {
      const firstUser = await db('users').whereNull('deleted_at').first();
      createdBy = firstUser?.id || 1;
    }
  }

  const creatorUser = await userModel.findUserById(createdBy);
  if (!creatorUser) {
    throw new AppError(`User (created_by ${createdBy}) does not exist.`, HTTP_STATUS.BAD_REQUEST, [
      { field: 'created_by', message: `User ID ${createdBy} not found.` },
    ]);
  }

  // Preconditions & Overlap check
  const { inDate, outDate, numberOfNights, room } = await validateBookingPreconditions({
    hotelId,
    roomId,
    checkInDate: body.check_in_date,
    checkOutDate: body.check_out_date,
    reqUser,
  });

  // Calculate pricing breakdown
  const pricing = calculatePricing({
    base_amount: body.base_amount,
    discount_amount: body.discount_amount,
    extra_charges_total: body.extra_charges_total,
    late_checkout_charge: body.late_checkout_charge,
    late_checkout_hours: body.late_checkout_hours,
    gst_rate: body.gst_rate,
    paid_amount: body.paid_amount,
    room,
    numberOfNights,
  });

  // Upload S3 images & signatures
  const { imageFiles, signatureFiles } = categorizeUploadedFiles(files);
  const uploadedImages = await s3Service.uploadFiles(imageFiles, 'bookings/images');
  const uploadedSignatures = await s3Service.uploadFiles(signatureFiles, 'bookings/signatures');

  // Parse any client-provided URL arrays
  let clientSignatures = [];
  if (body.signatures) {
    if (typeof body.signatures === 'string') {
      try { clientSignatures = JSON.parse(body.signatures); } catch (_) { clientSignatures = [body.signatures]; }
    } else if (Array.isArray(body.signatures)) {
      clientSignatures = body.signatures;
    }
  }

  let clientImages = [];
  if (body.images) {
    if (typeof body.images === 'string') {
      try { clientImages = JSON.parse(body.images); } catch (_) { clientImages = [body.images]; }
    } else if (Array.isArray(body.images)) {
      clientImages = body.images;
    }
  }

  const bookingData = {
    hotel_id: hotelId,
    primary_guest_name: primaryGuestName,
    secondary_guest_name: body.secondary_guest_name ? String(body.secondary_guest_name).trim() : null,
    mobile_number: mobileNumber,
    address: body.address ? String(body.address).trim() : null,
    room_id: roomId,
    created_by: createdBy,
    check_in_date: inDate,
    check_out_date: outDate,
    actual_check_in: body.actual_check_in ? new Date(body.actual_check_in) : null,
    actual_check_out: body.actual_check_out ? new Date(body.actual_check_out) : null,
    number_of_nights: numberOfNights,
    adults: Math.max(1, Number(body.adults) || 1),
    children: Math.max(0, Number(body.children) || 0),
    ...pricing,
    signatures: clientSignatures,
    images: clientImages,
    notes: body.notes ? String(body.notes).trim() : '',
    deleted_at: null,
  };

  const newBooking = await bookingModel.createBooking(bookingData, {
    imageRecords: uploadedImages,
    signatureRecords: uploadedSignatures,
  });

  return newBooking;
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
 * @returns {Promise<Object>}
 */
const getBookingById = async (id, reqUser = null) => {
  const numericId = Number(id);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    throw new AppError('Invalid booking ID. Must be a positive integer.', HTTP_STATUS.BAD_REQUEST);
  }

  const booking = await bookingModel.findBookingById(numericId);
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
 * @returns {Promise<Object>}
 */
const updateBooking = async (id, body, files = [], reqUser = null) => {
  const existing = await getBookingById(id, reqUser);

  const hotelId = existing.hotel_id;
  const inDate = body.check_in_date ? new Date(body.check_in_date) : new Date(existing.check_in_date);
  const outDate = body.check_out_date ? new Date(body.check_out_date) : new Date(existing.check_out_date);
  const roomId = body.room_id ? Number(body.room_id) : existing.room_id;

  // Preconditions & Overlap check (excluding current booking)
  const { numberOfNights, room } = await validateBookingPreconditions({
    hotelId,
    roomId,
    checkInDate: inDate,
    checkOutDate: outDate,
    excludeBookingId: existing.id,
    reqUser,
  });

  // Calculate pricing breakdown
  const pricing = calculatePricing({
    base_amount: body.base_amount !== undefined ? body.base_amount : existing.base_amount,
    discount_amount: body.discount_amount !== undefined ? body.discount_amount : existing.discount_amount,
    extra_charges_total: body.extra_charges_total !== undefined ? body.extra_charges_total : existing.extra_charges_total,
    late_checkout_charge: body.late_checkout_charge !== undefined ? body.late_checkout_charge : existing.late_checkout_charge,
    late_checkout_hours: body.late_checkout_hours !== undefined ? body.late_checkout_hours : existing.late_checkout_hours,
    gst_rate: body.gst_rate !== undefined ? body.gst_rate : existing.gst_rate,
    paid_amount: body.paid_amount !== undefined ? body.paid_amount : existing.paid_amount,
    room,
    numberOfNights,
  });

  const updatePayload = {
    room_id: roomId,
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

  // Parse client-provided URL arrays if provided in update
  if (body.signatures !== undefined) {
    if (typeof body.signatures === 'string') {
      try { updatePayload.signatures = JSON.parse(body.signatures); } catch (_) { updatePayload.signatures = [body.signatures]; }
    } else if (Array.isArray(body.signatures)) {
      updatePayload.signatures = body.signatures;
    }
  }

  if (body.images !== undefined) {
    if (typeof body.images === 'string') {
      try { updatePayload.images = JSON.parse(body.images); } catch (_) { updatePayload.images = [body.images]; }
    } else if (Array.isArray(body.images)) {
      updatePayload.images = body.images;
    }
  }

  // Upload new images and signatures
  const { imageFiles, signatureFiles } = categorizeUploadedFiles(files);
  const uploadedImages = await s3Service.uploadFiles(imageFiles, 'bookings/images');
  const uploadedSignatures = await s3Service.uploadFiles(signatureFiles, 'bookings/signatures');

  const updated = await bookingModel.updateBooking(existing.id, updatePayload, {
    imageRecords: uploadedImages,
    signatureRecords: uploadedSignatures,
  });

  return updated;
};

/**
 * Soft delete a booking setting deleted_at
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<Object>}
 */
const deleteBooking = async (id, reqUser = null) => {
  const existing = await getBookingById(id, reqUser);
  const result = await bookingModel.softDeleteBooking(existing.id);
  return result;
};

module.exports = {
  calculatePricing,
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
};
