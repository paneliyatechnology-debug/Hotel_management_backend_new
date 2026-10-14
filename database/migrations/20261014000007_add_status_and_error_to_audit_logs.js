/**
 * Let the audit trail record failed actions too.
 * status is SUCCESS for a completed action and FAILED for one that was rejected or hit an error.
 * Failed rows keep the HTTP status code, the reason, and the field errors when there are any.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('audit_logs', 'status');
  if (hasColumn) return;

  await knex.schema.alterTable('audit_logs', (table) => {
    table.string('status', 10).notNullable().defaultTo('SUCCESS').after('action').index();
    table.smallint('status_code').unsigned().nullable().after('status');
    table.string('error_message', 500).nullable().after('description');
    table.json('error_details').nullable().after('error_message');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('audit_logs', 'status');
  if (!hasColumn) return;

  await knex.schema.alterTable('audit_logs', (table) => {
    table.dropColumn('error_details');
    table.dropColumn('error_message');
    table.dropColumn('status_code');
    table.dropColumn('status');
  });
};
