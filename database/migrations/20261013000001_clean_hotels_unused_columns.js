/**
 * Migration: Remove unused columns from hotels table
 * Drops:
 * - id_proof_document
 * - business_proof_document
 * - rejection_reason
 * - default_gst_rate
 * - default_cgst_rate
 * - default_sgst_rate
 * - gstin
 * - tax_inclusive
 * - bank_details
 * And resets default for upi_id
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const columnsToDrop = [
    'id_proof_document',
    'business_proof_document',
    'rejection_reason',
    'default_gst_rate',
    'default_cgst_rate',
    'default_sgst_rate',
    'gstin',
    'tax_inclusive',
    'bank_details',
  ];

  for (const col of columnsToDrop) {
    const exists = await knex.schema.hasColumn('hotels', col);
    if (exists) {
      await knex.schema.alterTable('hotels', (table) => {
        table.dropColumn(col);
      });
    }
  }

  // Remove default value from upi_id column
  const hasUpiId = await knex.schema.hasColumn('hotels', 'upi_id');
  if (hasUpiId) {
    await knex.schema.alterTable('hotels', (table) => {
      table.string('upi_id', 100).nullable().defaultTo(null).alter();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('hotels', (table) => {
    table.text('id_proof_document').nullable();
    table.text('business_proof_document').nullable();
    table.text('rejection_reason').nullable();
    table.decimal('default_gst_rate', 5, 2).defaultTo(18.00);
    table.decimal('default_cgst_rate', 5, 2).defaultTo(9.00);
    table.decimal('default_sgst_rate', 5, 2).defaultTo(9.00);
    table.string('gstin', 50).defaultTo('');
    table.boolean('tax_inclusive').defaultTo(false);
    table.json('bank_details').nullable();
    table.string('upi_id', 100).defaultTo('jatinkakadiya234-1@okicici').alter();
  });
};
