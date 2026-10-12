/**
 * Migration: Add is_active column to users table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
    if (!hasIsActive) {
      await knex.schema.alterTable('users', (table) => {
        table.boolean('is_active').defaultTo(true).index();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
    if (hasIsActive) {
      await knex.schema.alterTable('users', (table) => {
        table.dropColumn('is_active');
      });
    }
  }
};
