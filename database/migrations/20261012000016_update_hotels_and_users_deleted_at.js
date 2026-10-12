/**
 * Migration: Remove is_deleted and add deleted_at in hotels and users tables.
 * Remove legacy subscription_start_date and subscription_end_date from hotels table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Update hotels table
  const hasHotels = await knex.schema.hasTable('hotels');
  if (hasHotels) {
    const hasDeletedAtInHotels = await knex.schema.hasColumn('hotels', 'deleted_at');
    if (!hasDeletedAtInHotels) {
      await knex.schema.alterTable('hotels', (table) => {
        table.dateTime('deleted_at').nullable().index();
      });
    }

    const hotelColumnsToDrop = [
      'is_deleted',
      'subscription_start_date',
      'subscription_end_date',
    ];

    for (const col of hotelColumnsToDrop) {
      const exists = await knex.schema.hasColumn('hotels', col);
      if (exists) {
        try {
          await knex.schema.alterTable('hotels', (table) => {
            table.dropColumn(col);
          });
        } catch (err) {
          console.warn(`[Migration] Warning dropping column ${col} from hotels:`, err.message);
        }
      }
    }
  }

  // 2. Update users table
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasDeletedAtInUsers = await knex.schema.hasColumn('users', 'deleted_at');
    if (!hasDeletedAtInUsers) {
      await knex.schema.alterTable('users', (table) => {
        table.dateTime('deleted_at').nullable().index();
      });
    }

    const hasIsDeletedInUsers = await knex.schema.hasColumn('users', 'is_deleted');
    if (hasIsDeletedInUsers) {
      try {
        await knex.schema.alterTable('users', (table) => {
          table.dropColumn('is_deleted');
        });
      } catch (err) {
        console.warn('[Migration] Warning dropping is_deleted from users:', err.message);
      }
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // No-op rollback for column cleanup
};
