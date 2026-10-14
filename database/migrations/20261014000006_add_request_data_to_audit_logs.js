/**
 * Keep the data the caller sent with each audit log entry.
 * Secrets such as passwords and tokens are hidden before they are stored.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('audit_logs', 'request_data');
  if (hasColumn) return;

  await knex.schema.alterTable('audit_logs', (table) => {
    table.json('request_data').nullable().after('changes');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('audit_logs', 'request_data');
  if (!hasColumn) return;

  await knex.schema.alterTable('audit_logs', (table) => {
    table.dropColumn('request_data');
  });
};
