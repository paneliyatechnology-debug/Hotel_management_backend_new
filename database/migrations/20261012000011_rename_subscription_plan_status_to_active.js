/**
 * Migration: Rename subscription_plan_status to subscription_plan_active in hotels table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasOld = await knex.schema.hasColumn('hotels', 'subscription_plan_status');
  const hasNew = await knex.schema.hasColumn('hotels', 'subscription_plan_active');

  if (hasOld && !hasNew) {
    await knex.schema.alterTable('hotels', (table) => {
      table.renameColumn('subscription_plan_status', 'subscription_plan_active');
    });
  } else if (!hasNew) {
    await knex.schema.alterTable('hotels', (table) => {
      table.boolean('subscription_plan_active').defaultTo(true).index();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasNew = await knex.schema.hasColumn('hotels', 'subscription_plan_active');
  if (hasNew) {
    await knex.schema.alterTable('hotels', (table) => {
      table.renameColumn('subscription_plan_active', 'subscription_plan_status');
    });
  }
};
