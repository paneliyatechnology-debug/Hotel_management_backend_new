/**
 * Adds payment_method and status to booking_payments.
 * Existing rows become CASH. Their status follows the booking: PAID when the bill is paid,
 * otherwise PARTIALLY_PAID.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasMethod = await knex.schema.hasColumn('booking_payments', 'payment_method');
  if (hasMethod) return;

  await knex.schema.alterTable('booking_payments', (table) => {
    table.string('payment_method', 20).notNullable().defaultTo('CASH').after('amount');
    table.string('status', 20).notNullable().defaultTo('PAID').after('payment_method');
  });

  await knex.raw(`
    UPDATE booking_payments
    JOIN bookings ON bookings.id = booking_payments.booking_id
    SET booking_payments.status = IF(bookings.payment_status = 'PAID', 'PAID', 'PARTIALLY_PAID')
    WHERE booking_payments.amount > 0
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasMethod = await knex.schema.hasColumn('booking_payments', 'payment_method');
  if (hasMethod) {
    await knex.schema.alterTable('booking_payments', (table) => {
      table.dropColumn('payment_method');
      table.dropColumn('status');
    });
  }
};
