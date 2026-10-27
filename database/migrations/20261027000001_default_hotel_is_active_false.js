/**
 * Migration: Change default value of hotels.is_active to false.
 * Newly created hotels are inactive by default until activated by a super admin.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasIsActive = await knex.schema.hasColumn('hotels', 'is_active');
  if (hasIsActive) {
    await knex.schema.alterTable('hotels', (table) => {
      table.boolean('is_active').notNullable().defaultTo(false).alter();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasIsActive = await knex.schema.hasColumn('hotels', 'is_active');
  if (hasIsActive) {
    await knex.schema.alterTable('hotels', (table) => {
      table.boolean('is_active').notNullable().defaultTo(true).alter();
    });
  }
};

