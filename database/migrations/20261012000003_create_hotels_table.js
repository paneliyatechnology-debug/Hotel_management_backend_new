/**
 * Migration: Create hotels table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('hotels');
  if (!exists) {
    return knex.schema.createTable('hotels', (table) => {
      table.increments('id').primary();
      table.string('name', 150).notNullable();
      table.string('slug', 191).notNullable().unique().index();
      table.string('owner_name', 150).notNullable();
      table.string('owner_email', 191).notNullable().unique().index();
      table.string('owner_phone', 50).notNullable();
      table.text('address').notNullable();
      table.string('city', 100).notNullable();
      table.string('state', 100).notNullable();
      table.string('country', 100).defaultTo('India');
      table.string('pincode', 20).notNullable();
      table.string('gst_number', 50).defaultTo('');
      table.string('pan_number', 50).defaultTo('');
      table.integer('total_rooms').defaultTo(0);
      table.string('hotel_type', 100).defaultTo('Boutique Hotel');
      table.string('website', 255).defaultTo('');
      table.text('logo').nullable();
      table.text('id_proof_document').nullable();
      table.text('business_proof_document').nullable();
      table.string('status', 50).defaultTo('ACTIVE').index();
      table.text('status_reason').nullable();
      table.text('rejection_reason').nullable();

      // Subscription & Free Trial
      table.string('subscription_plan', 50).defaultTo('TRIAL');
      table.string('subscription_status', 50).defaultTo('TRIAL').index();
      table.timestamp('trial_start_date').nullable();
      table.timestamp('trial_end_date').nullable();
      table.timestamp('subscription_start_date').nullable();
      table.timestamp('subscription_end_date').nullable();
      table.timestamp('grace_period_until').nullable();
      table.boolean('auto_renew').defaultTo(false);

      // Operational Settings
      table.string('check_in_time', 10).defaultTo('14:00');
      table.string('check_out_time', 10).defaultTo('12:00');
      table.string('timezone', 50).defaultTo('Asia/Kolkata');
      table.string('currency', 10).defaultTo('INR');
      table.decimal('tax_percentage', 5, 2).defaultTo(18.00);
      table.boolean('gst_enabled').defaultTo(true);
      table.string('gstin', 50).defaultTo('');
      table.decimal('default_gst_rate', 5, 2).defaultTo(18.00);
      table.decimal('default_cgst_rate', 5, 2).defaultTo(9.00);
      table.decimal('default_sgst_rate', 5, 2).defaultTo(9.00);
      table.boolean('tax_inclusive').defaultTo(false);
      table.string('upi_id', 100).defaultTo('jatinkakadiya234-1@okicici');
      table.json('bank_details').nullable();
      table.integer('late_checkout_grace_minutes').defaultTo(10);
      table.json('amenities').nullable();
      table.json('policies').nullable();

      table.boolean('is_deleted').defaultTo(false).index();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('hotels');
};
