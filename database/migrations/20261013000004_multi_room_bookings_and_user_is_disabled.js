/**
 * A booking can hold more than one room, and a user can be disabled.
 * booking_rooms stores every room on a stay. Existing bookings are copied
 * from bookings.room_id so current rows keep working.
 * users.is_disabled defaults to false. A disabled user cannot sign in.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasBookingRooms = await knex.schema.hasTable('booking_rooms');
  if (!hasBookingRooms) {
    await knex.schema.createTable('booking_rooms', (table) => {
      table.increments('id').primary();
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('bookings')
        .onDelete('CASCADE')
        .index();
      table
        .integer('room_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('rooms')
        .onDelete('CASCADE')
        .index();
      table.timestamps(true, true);
      table.unique(['booking_id', 'room_id'], 'booking_rooms_booking_id_room_id_unique');
    });
  }

  const bookings = await knex('bookings').whereNotNull('room_id').select('id', 'room_id');
  for (const booking of bookings) {
    const exists = await knex('booking_rooms')
      .where({ booking_id: booking.id, room_id: booking.room_id })
      .first();
    if (!exists) {
      await knex('booking_rooms').insert({
        booking_id: booking.id,
        room_id: booking.room_id,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasIsDisabled = await knex.schema.hasColumn('users', 'is_disabled');
    if (!hasIsDisabled) {
      await knex.schema.alterTable('users', (table) => {
        table.boolean('is_disabled').notNullable().defaultTo(false).index();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('booking_rooms');

  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasIsDisabled = await knex.schema.hasColumn('users', 'is_disabled');
    if (hasIsDisabled) {
      await knex.schema.alterTable('users', (table) => {
        table.dropColumn('is_disabled');
      });
    }
  }
};
