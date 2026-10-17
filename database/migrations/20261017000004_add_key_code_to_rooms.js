/**
 * Optional door or lock code for a physical room.
 * Existing rooms stay valid with a null code.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms && !(await knex.schema.hasColumn('rooms', 'key_code'))) {
    await knex.schema.alterTable('rooms', (table) => {
      table.string('key_code', 50).nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms && (await knex.schema.hasColumn('rooms', 'key_code'))) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('key_code');
    });
  }
};
