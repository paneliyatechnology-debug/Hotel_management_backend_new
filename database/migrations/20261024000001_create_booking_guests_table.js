/**
 * Accompanying guest names for a booking (booking_guests).
 * primary_guest_name stays on bookings as the lead guest.
 * Existing secondary_guest_name column is copied into booking_guests on upgrade.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('booking_guests');
  if (!hasTable) {
    await knex.schema.createTable('booking_guests', (table) => {
      table.increments('id').primary();
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('bookings')
        .onDelete('CASCADE')
        .index();
      table.string('name', 255).notNullable();
      table.integer('display_order').unsigned().notNullable().defaultTo(1);
      table.timestamps(true, true);
      table.index(['booking_id', 'display_order'], 'booking_guests_booking_id_display_order_index');
    });
  }

  const bookings = await knex('bookings')
    .select('id', 'secondary_guest_name');

  const now = new Date();
  for (const booking of bookings) {
    const existing = await knex('booking_guests')
      .where({ booking_id: booking.id })
      .first();
    if (existing) continue;

    const secondary = String(booking.secondary_guest_name || '').trim();
    if (secondary) {
      await knex('booking_guests').insert({
        booking_id: booking.id,
        name: secondary,
        display_order: 1,
        created_at: now,
        updated_at: now,
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('booking_guests');
};
