/**
 * Indexes for the GST report.
 * The report reads one hotel's bookings by invoice date (the check-out date) and adds up refunds per booking.
 * Nothing in the data changes.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const BOOKING_INDEXES = [
  ['bookings_hotel_id_actual_check_out_index', ['hotel_id', 'actual_check_out']],
  ['bookings_hotel_id_check_out_date_index', ['hotel_id', 'check_out_date']],
];
const PAYMENT_INDEX = 'booking_payments_booking_id_status_index';

const hasIndex = async (knex, table, name) => {
  const [rows] = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [table, name]);
  return rows.length > 0;
};

exports.up = async function (knex) {
  for (const [name, columns] of BOOKING_INDEXES) {
    if (!(await hasIndex(knex, 'bookings', name))) {
      await knex.schema.alterTable('bookings', (table) => table.index(columns, name));
    }
  }

  if (!(await hasIndex(knex, 'booking_payments', PAYMENT_INDEX))) {
    await knex.schema.alterTable('booking_payments', (table) => {
      table.index(['booking_id', 'status'], PAYMENT_INDEX);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  for (const [name] of BOOKING_INDEXES) {
    if (await hasIndex(knex, 'bookings', name)) {
      await knex.schema.alterTable('bookings', (table) => table.dropIndex([], name));
    }
  }

  if (await hasIndex(knex, 'booking_payments', PAYMENT_INDEX)) {
    await knex.schema.alterTable('booking_payments', (table) => table.dropIndex([], PAYMENT_INDEX));
  }
};
