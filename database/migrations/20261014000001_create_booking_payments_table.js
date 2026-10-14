/**
 * Payment history for bookings.
 * Each row is one change to the amount paid on a stay. A positive amount is money received.
 * A negative amount is a correction when paid_amount was lowered on an update.
 * source says where it came from: BOOKING (create), UPDATE (booking edit), or CHECKOUT.
 * Bookings that already have a paid amount get one BOOKING row so their history is not empty.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('booking_payments');
  if (hasTable) return;

  await knex.schema.createTable('booking_payments', (table) => {
    table.increments('id').primary();
    table
      .integer('hotel_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('hotels')
      .onDelete('CASCADE')
      .index();
    table
      .integer('booking_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('bookings')
      .onDelete('CASCADE')
      .index();
    table.decimal('amount', 12, 2).notNullable();
    table.string('source', 20).notNullable();
    table
      .integer('received_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamps(true, true);
  });

  await knex.raw(`
    INSERT INTO booking_payments (hotel_id, booking_id, amount, source, received_by, created_at, updated_at)
    SELECT hotel_id, id, paid_amount, 'BOOKING', created_by, created_at, NOW()
    FROM bookings
    WHERE paid_amount > 0 AND deleted_at IS NULL
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('booking_payments');
};
