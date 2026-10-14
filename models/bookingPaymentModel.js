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

module.exports = {
  createPayment,
  findPaymentsByBookingId,
};
