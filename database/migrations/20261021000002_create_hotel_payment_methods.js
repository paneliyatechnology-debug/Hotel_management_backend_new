/**
 * Payment methods belong to one hotel.
 * CASH, CARD, UPI, and BANK_TRANSFER are created for every hotel and cannot be
 * changed. A hotel admin may add other methods. A soft-deleted name can be used again.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const SYSTEM_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'];

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('hotel_payment_methods');
  if (!hasTable) {
    await knex.schema.createTable('hotel_payment_methods', (table) => {
      table.increments('id').primary();
      table.integer('hotel_id').unsigned().notNullable().index();
      table.string('name', 50).notNullable();
      table.boolean('is_system').notNullable().defaultTo(false);
      table.integer('display_order').unsigned().notNullable().defaultTo(1);
      table.timestamp('deleted_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.foreign('hotel_id').references('id').inTable('hotels').onDelete('CASCADE');
    });

    await knex.raw(`
      ALTER TABLE hotel_payment_methods
      ADD COLUMN active_name_key VARCHAR(80)
      GENERATED ALWAYS AS (
        CASE
          WHEN deleted_at IS NULL THEN CONCAT(hotel_id, ':', LOWER(TRIM(name)))
          ELSE NULL
        END
      ) VIRTUAL,
      ADD UNIQUE INDEX hotel_payment_methods_name_unique (active_name_key)
    `);
  }

  const hasMethodColumn = await knex.schema.hasColumn('booking_payments', 'payment_method');
  if (hasMethodColumn) {
    await knex.raw(
      'ALTER TABLE booking_payments MODIFY payment_method VARCHAR(50) NOT NULL'
    );
  }

  const hotels = await knex('hotels').select('id');
  const now = new Date();
  for (const hotel of hotels) {
    for (let index = 0; index < SYSTEM_PAYMENT_METHODS.length; index += 1) {
      const name = SYSTEM_PAYMENT_METHODS[index];
      const existing = await knex('hotel_payment_methods')
        .where({ hotel_id: hotel.id })
        .whereRaw('LOWER(TRIM(name)) = ?', [name.toLowerCase()])
        .whereNull('deleted_at')
        .first();
      if (existing) {
        await knex('hotel_payment_methods').where({ id: existing.id }).update({
          name,
          is_system: true,
          display_order: index + 1,
          updated_at: now,
        });
        continue;
      }
      await knex('hotel_payment_methods').insert({
        hotel_id: hotel.id,
        name,
        is_system: true,
        display_order: index + 1,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('hotel_payment_methods');
  if (hasTable) {
    await knex.schema.dropTable('hotel_payment_methods');
  }

  const hasMethodColumn = await knex.schema.hasColumn('booking_payments', 'payment_method');
  if (hasMethodColumn) {
    await knex.raw(
      'ALTER TABLE booking_payments MODIFY payment_method VARCHAR(20) NOT NULL'
    );
  }
};
