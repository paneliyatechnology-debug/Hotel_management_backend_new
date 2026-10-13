/**
 * Migration: Add booking_status for the guest stay.
 * This column is separate from payment_status.
 * Existing rows default to PENDING so current bookings keep blocking their dates.
 * New bookings created by the API default to CHECKED_IN in the service, not in this column.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) return;

  const hasStatus = await knex.schema.hasColumn('bookings', 'booking_status');
  if (!hasStatus) {
    await knex.schema.alterTable('bookings', (table) => {
      table.string('booking_status', 30).notNullable().defaultTo('PENDING').index();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) return;

  const hasStatus = await knex.schema.hasColumn('bookings', 'booking_status');
  if (hasStatus) {
    await knex.schema.alterTable('bookings', (table) => {
      table.dropColumn('booking_status');
    });
  }
};
