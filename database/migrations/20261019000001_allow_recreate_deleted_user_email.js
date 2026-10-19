/**
 * A deleted user's email can be used again.
 *
 * MySQL unique indexes cannot skip deleted_at rows. A virtual key is NULL once
 * the user is soft-deleted, and a unique index allows multiple NULLs, so the
 * same email can be registered again. An active user still keeps the email.
 *
 * VIRTUAL matches the room unique-key migration. This MySQL version rejects a
 * foreign key on a base column of a STORED generated column.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const indexExists = async (knex, table, indexName) => {
  const [rows] = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [table, indexName]);
  return Array.isArray(rows) && rows.length > 0;
};

const dropIndexIfExists = async (knex, table, indexName) => {
  if (await indexExists(knex, table, indexName)) {
    await knex.raw('ALTER TABLE ?? DROP INDEX ??', [table, indexName]);
  }
};

/**
 * Unique indexes whose only column is email. The primary key is left in place.
 * @param { import("knex").Knex } knex
 * @returns {Promise<string[]>}
 */
const emailOnlyUniqueIndexes = async (knex) => {
  const [rows] = await knex.raw('SHOW INDEX FROM `users` WHERE Non_unique = 0');
  const grouped = new Map();
  for (const row of rows) {
    if (row.Key_name === 'PRIMARY') continue;
    const columns = grouped.get(row.Key_name) || [];
    columns.push(row.Column_name);
    grouped.set(row.Key_name, columns);
  }
  return [...grouped.entries()]
    .filter(([, columns]) => columns.length === 1 && columns[0] === 'email')
    .map(([name]) => name);
};

exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  await knex.raw('SET FOREIGN_KEY_CHECKS=0');
  try {
    const emailIndexes = await emailOnlyUniqueIndexes(knex);
    for (const indexName of emailIndexes) {
      await dropIndexIfExists(knex, 'users', indexName);
    }

    const hasActiveEmail = await knex.schema.hasColumn('users', 'active_email');
    if (!hasActiveEmail) {
      await knex.raw(`
        ALTER TABLE \`users\`
        ADD COLUMN \`active_email\` VARCHAR(191)
        GENERATED ALWAYS AS (
          CASE
            WHEN \`deleted_at\` IS NULL THEN LOWER(TRIM(\`email\`))
            ELSE NULL
          END
        ) VIRTUAL
      `);
    }

    if (!(await indexExists(knex, 'users', 'users_active_email_unique'))) {
      await knex.raw(
        'ALTER TABLE `users` ADD UNIQUE INDEX `users_active_email_unique` (`active_email`)'
      );
    }
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS=1');
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  await dropIndexIfExists(knex, 'users', 'users_active_email_unique');
  const hasActiveEmail = await knex.schema.hasColumn('users', 'active_email');
  if (hasActiveEmail) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('active_email');
    });
  }

  if ((await emailOnlyUniqueIndexes(knex)).length === 0) {
    await knex.schema.alterTable('users', (table) => {
      table.unique(['email'], 'users_email_unique');
    });
  }
};
