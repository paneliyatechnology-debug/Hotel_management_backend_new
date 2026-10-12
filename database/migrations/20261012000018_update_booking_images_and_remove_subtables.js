/**
 * Migration: Remove booking_rooms and booking_guests tables.
 * Update images table to add is_signature boolean column and ensure booking_id exists.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Drop booking_guests table if exists
  await knex.schema.dropTableIfExists('booking_guests');

  // 2. Drop booking_rooms table if exists
  await knex.schema.dropTableIfExists('booking_rooms');

  // 3. Update images table: ensure booking_id and is_signature columns exist
  const hasImages = await knex.schema.hasTable('images');
  if (hasImages) {
    const hasBookingId = await knex.schema.hasColumn('images', 'booking_id');
    if (!hasBookingId) {
      await knex.schema.alterTable('images', (table) => {
        table.integer('booking_id').unsigned().nullable().index();
      });
      try {
        await knex.schema.alterTable('images', (table) => {
          table.foreign('booking_id').references('id').inTable('bookings').onDelete('CASCADE');
        });
      } catch (_) {}
    }

    const hasIsSignature = await knex.schema.hasColumn('images', 'is_signature');
    if (!hasIsSignature) {
      await knex.schema.alterTable('images', (table) => {
        table.boolean('is_signature').defaultTo(false).index();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasImages = await knex.schema.hasTable('images');
  if (hasImages) {
    const hasIsSignature = await knex.schema.hasColumn('images', 'is_signature');
    if (hasIsSignature) {
      try {
        await knex.schema.alterTable('images', (table) => {
          table.dropColumn('is_signature');
        });
      } catch (_) {}
    }
  }
};
