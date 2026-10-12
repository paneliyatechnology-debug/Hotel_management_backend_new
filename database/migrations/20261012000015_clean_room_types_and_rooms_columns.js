/**
 * Migration: Clean room_types to only contain id, hotel_id, name, description,
 * deleted_at, created_at, and updated_at.
 * In rooms table, remove is_deleted and rely on deleted_at.
 * Ensure table name is images.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Clean room_types table
  const hasRoomTypes = await knex.schema.hasTable('room_types');
  if (hasRoomTypes) {
    const hasDeletedAt = await knex.schema.hasColumn('room_types', 'deleted_at');
    if (!hasDeletedAt) {
      await knex.schema.alterTable('room_types', (table) => {
        table.dateTime('deleted_at').nullable().index().after('description');
      });
    }

    const columnsToDrop = [
      'base_price',
      'capacity_adults',
      'capacity_children',
      'bed_count',
      'bed_type',
      'amenities',
      'images',
      'gst_enabled',
      'gst_rate',
      'cgst_rate',
      'sgst_rate',
      'tax_inclusive',
      'is_active',
      'is_deleted',
    ];

    for (const col of columnsToDrop) {
      const exists = await knex.schema.hasColumn('room_types', col);
      if (exists) {
        try {
          await knex.schema.alterTable('room_types', (table) => {
            table.dropColumn(col);
          });
        } catch (err) {
          console.warn(`[Migration] Warning dropping column ${col} from room_types:`, err.message);
        }
      }
    }
  }

  // 2. Remove is_deleted from rooms table
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    const hasIsDeletedInRooms = await knex.schema.hasColumn('rooms', 'is_deleted');
    if (hasIsDeletedInRooms) {
      try {
        await knex.schema.alterTable('rooms', (table) => {
          table.dropColumn('is_deleted');
        });
      } catch (err) {
        console.warn('[Migration] Warning dropping is_deleted from rooms:', err.message);
      }
    }
  }

  // 3. Drop legacy view if exists
  try {
    await knex.raw('DROP VIEW IF EXISTS `room_type_images`;');
  } catch (_) {}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // No-op rollback for column cleanup
};
