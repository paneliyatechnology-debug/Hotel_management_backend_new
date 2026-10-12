/**
 * Migration: Drop employee_id and status from users table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasEmployeeId = await knex.schema.hasColumn('users', 'employee_id');
    const hasStatus = await knex.schema.hasColumn('users', 'status');

    await knex.schema.alterTable('users', (table) => {
      if (hasEmployeeId) {
        table.dropColumn('employee_id');
      }
      if (hasStatus) {
        table.dropColumn('status');
      }
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasEmployeeId = await knex.schema.hasColumn('users', 'employee_id');
    const hasStatus = await knex.schema.hasColumn('users', 'status');

    await knex.schema.alterTable('users', (table) => {
      if (!hasEmployeeId) {
        table.string('employee_id', 50).defaultTo('');
      }
      if (!hasStatus) {
        table.string('status', 50).defaultTo('ACTIVE').index();
      }
    });
  }
};
