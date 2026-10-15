const BANK_COLUMNS = [
  'bank_name',
  'bank_account_holder',
  'bank_account_number',
  'bank_ifsc_code',
  'bank_branch',
];

/**
 * Bank details a hotel prints on its bills and folios.
 * All columns are optional.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasHotels = await knex.schema.hasTable('hotels');
  if (!hasHotels) return;

  const missing = [];
  for (const column of BANK_COLUMNS) {
    if (!(await knex.schema.hasColumn('hotels', column))) missing.push(column);
  }
  if (missing.length === 0) return;

  await knex.schema.alterTable('hotels', (table) => {
    if (missing.includes('bank_name')) table.string('bank_name', 150).nullable();
    if (missing.includes('bank_account_holder')) table.string('bank_account_holder', 150).nullable();
    if (missing.includes('bank_account_number')) table.string('bank_account_number', 30).nullable();
    if (missing.includes('bank_ifsc_code')) table.string('bank_ifsc_code', 20).nullable();
    if (missing.includes('bank_branch')) table.string('bank_branch', 150).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasHotels = await knex.schema.hasTable('hotels');
  if (!hasHotels) return;

  for (const column of BANK_COLUMNS) {
    if (await knex.schema.hasColumn('hotels', column)) {
      await knex.schema.alterTable('hotels', (table) => {
        table.dropColumn(column);
      });
    }
  }
};
