/**
 * Migration: Create subscription_plans and subscription_plan_features tables
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Subscription Plans Table
  const plansExists = await knex.schema.hasTable('subscription_plans');
  if (!plansExists) {
    await knex.schema.createTable('subscription_plans', (table) => {
      table.increments('id').primary();
      table.string('name', 150).notNullable();
      table.string('code', 100).notNullable().unique().index();
      table.string('billing_cycle', 20).notNullable().index(); // 'MONTHLY', 'ANNUAL'
      table.decimal('price', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('discount_percent', 5, 2).defaultTo(0.00);
      table.integer('max_rooms').defaultTo(50);
      table.text('description').nullable();
      table.string('badge', 100).defaultTo('');
      table.boolean('is_popular').defaultTo(false).index();
      table.boolean('is_active').defaultTo(true).index();
      table.integer('display_order').defaultTo(1).index();
      table.timestamp('deleted_at').nullable().index();
      table.timestamps(true, true); // created_at, updated_at
    });
  }

  // 2. Subscription Plan Features Table
  const featuresExists = await knex.schema.hasTable('subscription_plan_features');
  if (!featuresExists) {
    await knex.schema.createTable('subscription_plan_features', (table) => {
      table.increments('id').primary();
      table
        .integer('plan_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('subscription_plans')
        .onDelete('CASCADE')
        .index();
      table.string('feature', 255).notNullable();
      table.timestamps(true, true); // created_at, updated_at
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('subscription_plan_features');
  await knex.schema.dropTableIfExists('subscription_plans');
};
