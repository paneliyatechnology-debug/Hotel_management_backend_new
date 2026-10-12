/**
 * Migration: Create room_types and rooms tables
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasRoomTypes = await knex.schema.hasTable('room_types');
  if (!hasRoomTypes) {
    await knex.schema.createTable('room_types', (table) => {
      table.increments('id').primary();
      table.integer('hotel_id').unsigned().notNullable().index();
      table.string('name', 150).notNullable();
      table.text('description').nullable();
      table.decimal('base_price', 10, 2).defaultTo(0.00);
      table.integer('capacity_adults').defaultTo(2);
      table.integer('capacity_children').defaultTo(0);
      table.integer('bed_count').defaultTo(1);
      table.string('bed_type', 100).defaultTo('1 King Bed');
      table.json('amenities').nullable();
      table.json('images').nullable();
      table.boolean('gst_enabled').defaultTo(true);
      table.decimal('gst_rate', 5, 2).defaultTo(18.00);
      table.decimal('cgst_rate', 5, 2).defaultTo(9.00);
      table.decimal('sgst_rate', 5, 2).defaultTo(9.00);
      table.boolean('tax_inclusive').defaultTo(false);
      table.boolean('is_active').defaultTo(true).index();
      table.boolean('is_deleted').defaultTo(false).index();
      table.timestamps(true, true);
    });
  }

  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) {
    await knex.schema.createTable('rooms', (table) => {
      table.increments('id').primary();
      table.integer('hotel_id').unsigned().notNullable().index();
      table.string('room_number', 50).notNullable();
      table.integer('room_type_id').unsigned().notNullable().index();
      table.integer('floor').defaultTo(1);
      table.string('status', 50).defaultTo('AVAILABLE').index();
      table.integer('seating_capacity').defaultTo(2);
      table.integer('bed_count').defaultTo(1);
      table.string('bed_type', 100).defaultTo('1 King Bed');
      table.decimal('custom_price_per_night', 10, 2).nullable();
      table.text('notes').nullable();
      table.json('amenities').nullable();
      table.boolean('is_active').defaultTo(true).index();
      table.boolean('is_deleted').defaultTo(false).index();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('rooms')
    .dropTableIfExists('room_types');
};
