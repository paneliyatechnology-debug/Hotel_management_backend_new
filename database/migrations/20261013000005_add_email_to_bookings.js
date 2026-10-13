/**
 * Guest email on a booking. This is not a login email.
 * A user account email cannot be stored here.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) return;

  const hasEmail = await knex.schema.hasColumn('bookings', 'email');
  if (!hasEmail) {
    await knex.schema.alterTable('bookings', (table) => {
      table.string('email', 191).nullable().index();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) return;

  const hasEmail = await knex.schema.hasColumn('bookings', 'email');
  if (hasEmail) {
    await knex.schema.alterTable('bookings', (table) => {
      table.dropColumn('email');
    });
  }
};
