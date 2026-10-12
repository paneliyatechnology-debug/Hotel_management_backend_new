/**
 * Migration: Create system_settings table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('system_settings');
  if (!exists) {
    await knex.schema.createTable('system_settings', (table) => {
      table.increments('id').primary();
      table.integer('free_trial_value').defaultTo(30);
      table.string('free_trial_unit', 20).defaultTo('days');
      table.timestamps(true, true);
    });

    // Seed default settings row if table is empty
    await knex('system_settings').insert({
      free_trial_value: 30,
      free_trial_unit: 'days',
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('system_settings');
};
