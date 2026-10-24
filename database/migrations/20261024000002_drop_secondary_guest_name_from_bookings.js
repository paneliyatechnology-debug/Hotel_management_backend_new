/**
 * Guest names live in booking_guests. Drop the unused secondary column.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('bookings', 'secondary_guest_name');
  if (hasColumn) {
    await knex.schema.alterTable('bookings', (table) => {
      table.dropColumn('secondary_guest_name');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('bookings', 'secondary_guest_name');
  if (!hasColumn) {
    await knex.schema.alterTable('bookings', (table) => {
      table.string('secondary_guest_name', 255).nullable();
    });
  }
};
