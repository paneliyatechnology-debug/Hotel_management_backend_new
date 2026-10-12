/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('users');
  if (!exists) {
    return knex.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name', 150).notNullable();
      table.string('email', 191).notNullable().unique();
      table.string('password', 255).notNullable();
      table.string('phone', 50).defaultTo('');
      table.string('role', 50).defaultTo('HOTEL_ADMIN').index();
      table.string('employee_id', 50).defaultTo('');
      table.string('status', 50).defaultTo('ACTIVE').index();
      table.boolean('must_change_password').defaultTo(false);
      table.timestamp('last_login_at').nullable();
      table.timestamp('password_changed_at').nullable();
      table.integer('failed_login_attempts').defaultTo(0);
      table.timestamp('account_locked_until').nullable();
      table.boolean('is_deleted').defaultTo(false).index();
      table.timestamps(true, true); // created_at, updated_at
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('users');
};
