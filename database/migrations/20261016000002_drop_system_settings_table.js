/**
 * Drop system_settings.
 * The free trial is a fixed 30 days and is no longer read from this table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('system_settings');
  if (exists) {
    await knex.schema.dropTable('system_settings');
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const exists = await knex.schema.hasTable('system_settings');
  if (exists) return;

  await knex.schema.createTable('system_settings', (table) => {
    table.increments('id').primary();
    table.integer('free_trial_value').defaultTo(30);
    table.string('free_trial_unit', 20).defaultTo('days');
    table.timestamps(true, true);
  });

  await knex('system_settings').insert({
    free_trial_value: 30,
    free_trial_unit: 'days',
  });
};
