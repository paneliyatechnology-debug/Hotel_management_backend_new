/**
 * Migration: Replace hotels.status and hotels.status_reason with hotels.is_active.
 * A super admin switches a hotel on or off. Existing hotels keep their meaning:
 * ACTIVE becomes is_active = true, anything else becomes false.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasIsActive = await knex.schema.hasColumn('hotels', 'is_active');
  if (!hasIsActive) {
    await knex.schema.alterTable('hotels', (table) => {
      table.boolean('is_active').notNullable().defaultTo(true).index();
    });
  }

  if (await knex.schema.hasColumn('hotels', 'status')) {
    await knex('hotels').update({ is_active: knex.raw("status = 'ACTIVE'") });
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('status');
    });
  }

  if (await knex.schema.hasColumn('hotels', 'status_reason')) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('status_reason');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('hotels', 'status'))) {
    await knex.schema.alterTable('hotels', (table) => {
      table.string('status', 50).defaultTo('ACTIVE').index();
    });
  }

  if (!(await knex.schema.hasColumn('hotels', 'status_reason'))) {
    await knex.schema.alterTable('hotels', (table) => {
      table.text('status_reason').nullable();
    });
  }

  if (await knex.schema.hasColumn('hotels', 'is_active')) {
    await knex('hotels').update({ status: knex.raw("IF(is_active, 'ACTIVE', 'INACTIVE')") });
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('is_active');
    });
  }
};
