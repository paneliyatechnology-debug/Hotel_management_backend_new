/**
 * Migration: Update hotels subscription plan fields
 * Replaces old subscription_plan, subscription_status, trial_start_date, trial_end_date
 * with subscription_plan_id, subscription_plan_status, subscription_plan_start_date, subscription_plan_end_date
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('hotels');
  if (hasTable) {
    await knex.schema.alterTable('hotels', (table) => {
      table
        .integer('subscription_plan_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('subscription_plans')
        .onDelete('SET NULL')
        .index();
      table.boolean('subscription_plan_status').defaultTo(true).index();
      table.timestamp('subscription_plan_start_date').nullable();
      table.timestamp('subscription_plan_end_date').nullable();

      // Drop old trial/subscription columns if they exist
      table.dropColumn('subscription_plan');
      table.dropColumn('subscription_status');
      table.dropColumn('trial_start_date');
      table.dropColumn('trial_end_date');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('hotels');
  if (hasTable) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropForeign(['subscription_plan_id']);
      table.dropColumn('subscription_plan_id');
      table.dropColumn('subscription_plan_status');
      table.dropColumn('subscription_plan_start_date');
      table.dropColumn('subscription_plan_end_date');

      table.string('subscription_plan', 50).defaultTo('TRIAL');
      table.string('subscription_status', 50).defaultTo('TRIAL').index();
      table.timestamp('trial_start_date').nullable();
      table.timestamp('trial_end_date').nullable();
    });
  }
};
