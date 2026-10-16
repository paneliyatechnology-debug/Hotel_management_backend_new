/**
 * One row each time a hotel admin purchases a subscription plan.
 * The amount and billing cycle are copied from the plan at purchase time.
 * The hotel's current plan window is updated in the same action.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('subscription_plan_purchases');
  if (exists) return;

  await knex.schema.createTable('subscription_plan_purchases', (table) => {
    table.increments('id').primary();
    table
      .integer('hotel_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('hotels')
      .onDelete('CASCADE')
      .index();
    table
      .integer('plan_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('subscription_plans')
      .onDelete('RESTRICT')
      .index();
    table
      .integer('purchased_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.decimal('amount', 10, 2).notNullable();
    table.string('billing_cycle', 20).notNullable();
    table.string('payment_method', 20).notNullable();
    table.string('status', 20).notNullable().defaultTo('PAID');
    table.boolean('auto_renew').notNullable().defaultTo(false);
    table.timestamp('starts_at').notNullable();
    table.timestamp('ends_at').notNullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('subscription_plan_purchases');
};
