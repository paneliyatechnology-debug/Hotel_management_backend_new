/**
 * Audit trail.
 * One row per recorded action: who did it, what it was done to, what changed, and from where.
 * Rows are only ever inserted. There is no update and no soft delete, and the table has no
 * foreign keys, so the history stays intact when a user or hotel is removed later.
 * user_name and user_role keep a snapshot of the actor at the time of the action.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('audit_logs');
  if (hasTable) return;

  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table.integer('hotel_id').unsigned().nullable().index();
    table.integer('user_id').unsigned().nullable().index();
    table.string('user_name', 150).nullable();
    table.string('user_role', 30).nullable();
    table.string('action', 30).notNullable().index();
    table.string('entity_type', 30).notNullable();
    table.integer('entity_id').unsigned().nullable();
    table.string('description', 255).notNullable();
    table.json('changes').nullable();
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();

    table.index(['entity_type', 'entity_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('audit_logs');
};
