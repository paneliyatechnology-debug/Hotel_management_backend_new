/**
 * Migration: Replace duplicate owner details with owner_id foreign key in hotels table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasOwnerId = await knex.schema.hasColumn('hotels', 'owner_id');
  if (!hasOwnerId) {
    await knex.schema.alterTable('hotels', (table) => {
      table
        .integer('owner_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .index();
    });
  }

  const hasOwnerName = await knex.schema.hasColumn('hotels', 'owner_name');
  if (hasOwnerName) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('owner_name');
    });
  }

  const hasOwnerPhone = await knex.schema.hasColumn('hotels', 'owner_phone');
  if (hasOwnerPhone) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('owner_phone');
    });
  }

  const hasOwnerEmail = await knex.schema.hasColumn('hotels', 'owner_email');
  if (hasOwnerEmail) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('owner_email');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasOwnerId = await knex.schema.hasColumn('hotels', 'owner_id');
  if (hasOwnerId) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropForeign(['owner_id']);
      table.dropColumn('owner_id');
    });
  }

  const hasOwnerName = await knex.schema.hasColumn('hotels', 'owner_name');
  if (!hasOwnerName) {
    await knex.schema.alterTable('hotels', (table) => {
      table.string('owner_name', 150).nullable();
      table.string('owner_phone', 50).nullable();
      table.string('owner_email', 191).nullable().unique();
    });
  }
};
