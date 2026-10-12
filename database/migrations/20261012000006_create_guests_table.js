/**
 * Migration: Create guests table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('guests');
  if (!exists) {
    return knex.schema.createTable('guests', (table) => {
      table.increments('id').primary();
      table
        .integer('hotel_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('hotels')
        .onDelete('CASCADE')
        .index();
      table.string('full_name', 150).notNullable();
      table.string('mobile_number', 50).notNullable().index();
      table.string('email', 191).nullable().index();
      table.boolean('is_deleted').defaultTo(false).index();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('guests');
};
