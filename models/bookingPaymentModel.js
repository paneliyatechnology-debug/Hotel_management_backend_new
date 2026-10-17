/**
 * Booking payment history database operations using Knex.
 */
const db = require('../database/knex');

/**
 * Format a raw booking_payments row.
 * @param {Object} row
 * @returns {Object|null}
 */
const formatPayment = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    booking_id: row.booking_id,
    amount: Number(row.amount) || 0,
    payment_method: row.payment_method,
    status: row.status,
    source: row.source,
    received_by: row.received_by
      ? { id: row.received_by, name: row.received_by_name || null }
      : null,
    received_at: row.created_at,
  };
};

/**
 * Record one change to the amount paid on a booking.
 * @param {Object} data - { hotel_id, booking_id, amount, payment_method, status, source, received_by }
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<void>}
 */
const createPayment = async (data, client = db) => {
  const now = new Date();
  await client('booking_payments').insert({
    hotel_id: data.hotel_id,
    booking_id: data.booking_id,
    amount: data.amount,
    payment_method: data.payment_method,
    status: data.status,
    source: data.source,
    received_by: data.received_by || null,
    created_at: now,
    updated_at: now,
  });
};

/**
 * Payment history of a booking, newest first.
 * @param {number|string} bookingId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object[]>}
 */
const findPaymentsByBookingId = async (bookingId, client = db) => {
  const rows = await client('booking_payments')
    .leftJoin('users', 'booking_payments.received_by', 'users.id')
    .where('booking_payments.booking_id', bookingId)
    .orderBy('booking_payments.id', 'desc')
    .select('booking_payments.*', 'users.name as received_by_name');

  return rows.map(formatPayment);
};

const SORT_COLUMNS = {
  created_at: 'booking_payments.created_at',
  amount: 'booking_payments.amount',
  payment_method: 'booking_payments.payment_method',
  status: 'booking_payments.status',
  id: 'booking_payments.id',
};

/**
 * One payment row with the booking it belongs to.
 * @param {Object} row
 * @returns {Object}
 */
const formatTransaction = (row) => ({
  id: row.id,
  hotel_id: row.hotel_id,
  booking_id: row.booking_id,
  booking_number: row.booking_number || null,
  primary_guest_name: row.primary_guest_name || null,
  mobile_number: row.mobile_number || null,
  amount: Number(row.amount) || 0,
  payment_method: row.payment_method,
  status: row.status,
  source: row.source,
  received_by: row.received_by
    ? { id: row.received_by, name: row.received_by_name || null }
    : null,
  created_at: row.created_at,
});

/**
 * Hotel payment list. start and end are applied to booking_payments.created_at.
 * end is exclusive. Soft-deleted bookings are left out.
 * @param {Object} filters
 * @param {Object} [pagination]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ transactions: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const findTransactions = async (filters = {}, pagination = {}, client = db) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const offset = (page - 1) * limit;
  const sortColumn = SORT_COLUMNS[filters.sort_by] || SORT_COLUMNS.created_at;
  const sortOrder = String(filters.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const applyFilters = (qb) => {
    qb.where('booking_payments.hotel_id', Number(filters.hotel_id));
    qb.whereNull('bookings.deleted_at');

    if (filters.booking_id) qb.where('booking_payments.booking_id', Number(filters.booking_id));
    if (filters.payment_method) qb.where('booking_payments.payment_method', filters.payment_method);
    if (filters.status) qb.where('booking_payments.status', filters.status);
    if (filters.source) qb.where('booking_payments.source', filters.source);
    if (filters.start) qb.where('booking_payments.created_at', '>=', filters.start);
    if (filters.end) qb.where('booking_payments.created_at', '<', filters.end);

    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.where(function () {
        this.where('bookings.booking_number', 'like', term)
          .orWhere('bookings.primary_guest_name', 'like', term)
          .orWhere('bookings.mobile_number', 'like', term);
      });
    }
  };

  const countQuery = client('booking_payments').innerJoin('bookings', 'booking_payments.booking_id', 'bookings.id');
  applyFilters(countQuery);

  const dataQuery = client('booking_payments')
    .innerJoin('bookings', 'booking_payments.booking_id', 'bookings.id')
    .leftJoin('users', 'booking_payments.received_by', 'users.id')
    .select(
      'booking_payments.id',
      'booking_payments.hotel_id',
      'booking_payments.booking_id',
      'booking_payments.amount',
      'booking_payments.payment_method',
      'booking_payments.status',
      'booking_payments.source',
      'booking_payments.received_by',
      'booking_payments.created_at',
      'bookings.booking_number',
      'bookings.primary_guest_name',
      'bookings.mobile_number',
      'users.name as received_by_name'
    );
  applyFilters(dataQuery);

  const [totalResult, rows] = await Promise.all([
    countQuery.count('booking_payments.id as total').first(),
    dataQuery
      .orderBy(sortColumn, sortOrder)
      .orderBy('booking_payments.id', sortOrder)
      .offset(offset)
      .limit(limit),
  ]);

  const total = Number(totalResult?.total || 0);
  return {
    transactions: rows.map(formatTransaction),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

module.exports = {
  createPayment,
  findPaymentsByBookingId,
  findTransactions,
};
