/**
 * Per-hotel booking numbers: a stable hotel code plus a counter that
 * restarts at 1 for each Indian financial year (1 April to 31 March).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasHotels = await knex.schema.hasTable('hotels');
  if (hasHotels && !(await knex.schema.hasColumn('hotels', 'booking_code'))) {
    await knex.schema.alterTable('hotels', (table) => {
      table.string('booking_code', 20).nullable().unique();
    });
  }

  const hasSequences = await knex.schema.hasTable('booking_sequences');
  if (!hasSequences) {
    await knex.schema.createTable('booking_sequences', (table) => {
      table.increments('id').primary();
      table.integer('hotel_id').unsigned().notNullable()
        .references('id').inTable('hotels').onDelete('CASCADE');
      table.string('financial_year', 9).notNullable();
      table.integer('last_sequence').unsigned().notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['hotel_id', 'financial_year'], 'booking_sequences_hotel_year_unique');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('booking_sequences');

  const hasHotels = await knex.schema.hasTable('hotels');
  if (hasHotels && (await knex.schema.hasColumn('hotels', 'booking_code'))) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('booking_code');
    });
  }
};
