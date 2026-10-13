/**
 * Migration: Hotel-scoped uniqueness that ignores soft-deleted rows.
 *
 * MySQL unique indexes cannot skip deleted_at rows. A virtual generated key is
 * NULL once a row is soft-deleted, and a unique index allows multiple NULLs,
 * so a deleted name can be created again in the same hotel.
 * VIRTUAL is required: this MySQL version rejects a foreign key on a base
 * column of a STORED generated column.
 *
 * - room_types: active name is unique per hotel
 * - rooms: active room number is unique per hotel and floor
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

exports.up = async function (knex) {
  // Rebuilding these tables rechecks existing foreign keys. Orphan rows in
  // older data would otherwise abort a column add that does not touch those keys.
  await knex.raw('SET FOREIGN_KEY_CHECKS=0');

  try {
  const hasRoomTypes = await knex.schema.hasTable('room_types');
  if (hasRoomTypes) {
    const hasActiveNameKey = await knex.schema.hasColumn('room_types', 'active_name_key');
    if (!hasActiveNameKey) {
      await knex.raw(`
        ALTER TABLE \`room_types\`
        ADD COLUMN \`active_name_key\` VARCHAR(255)
        GENERATED ALWAYS AS (
          CASE
            WHEN \`deleted_at\` IS NULL THEN CONCAT(\`hotel_id\`, '#', LOWER(TRIM(\`name\`)))
            ELSE NULL
          END
        ) VIRTUAL
      `);
    }

    if (!(await indexExists(knex, 'room_types', 'room_types_active_name_key_unique'))) {
      await knex.raw(
        'ALTER TABLE `room_types` ADD UNIQUE INDEX `room_types_active_name_key_unique` (`active_name_key`)'
      );
    }
  }

  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    await dropIndexIfExists(knex, 'rooms', 'rooms_hotel_floor_room_number_unique');

    const hasActiveRoomKey = await knex.schema.hasColumn('rooms', 'active_room_key');
    if (!hasActiveRoomKey) {
      await knex.raw(`
        ALTER TABLE \`rooms\`
        ADD COLUMN \`active_room_key\` VARCHAR(255)
        GENERATED ALWAYS AS (
          CASE
            WHEN \`deleted_at\` IS NULL THEN CONCAT(\`hotel_id\`, '#', IFNULL(\`floor\`, 1), '#', LOWER(TRIM(\`room_number\`)))
            ELSE NULL
          END
        ) VIRTUAL
      `);
    }

    if (!(await indexExists(knex, 'rooms', 'rooms_active_room_key_unique'))) {
      await knex.raw(
        'ALTER TABLE `rooms` ADD UNIQUE INDEX `rooms_active_room_key_unique` (`active_room_key`)'
      );
    }
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
  const hasRoomTypes = await knex.schema.hasTable('room_types');
  if (hasRoomTypes) {
    await dropIndexIfExists(knex, 'room_types', 'room_types_active_name_key_unique');
    const hasActiveNameKey = await knex.schema.hasColumn('room_types', 'active_name_key');
    if (hasActiveNameKey) {
      await knex.schema.alterTable('room_types', (table) => {
        table.dropColumn('active_name_key');
      });
    }
  }

  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    await dropIndexIfExists(knex, 'rooms', 'rooms_active_room_key_unique');
    const hasActiveRoomKey = await knex.schema.hasColumn('rooms', 'active_room_key');
    if (hasActiveRoomKey) {
      await knex.schema.alterTable('rooms', (table) => {
        table.dropColumn('active_room_key');
      });
    }

    if (!(await indexExists(knex, 'rooms', 'rooms_hotel_floor_room_number_unique'))) {
      await knex.schema.alterTable('rooms', (table) => {
        table.unique(['hotel_id', 'floor', 'room_number'], 'rooms_hotel_floor_room_number_unique');
      });
    }
  }
};
