/**
 * Migration: Add hotel_id to users table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'hotel_id');
  if (!hasColumn) {
    return knex.schema.alterTable('users', (table) => {
      table
        .integer('hotel_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('hotels')
        .onDelete('SET NULL')
        .index();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'hotel_id');
  if (hasColumn) {
    return knex.schema.alterTable('users', (table) => {
      table.dropForeign(['hotel_id']);
      table.dropColumn('hotel_id');
    });
  }
};
