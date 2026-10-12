/**
 * Migration: Update rooms table with cleaning, deleted_at, unique index,
 * and migrate room_type_images into a unified images table with room_id and room_type_id.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Rename room_type_images to images (or ensure images table exists)
  const hasRoomTypeImages = await knex.schema.hasTable('room_type_images');
  const hasImages = await knex.schema.hasTable('images');

  if (hasRoomTypeImages && !hasImages) {
    await knex.schema.renameTable('room_type_images', 'images');
  } else if (!hasImages) {
    await knex.schema.createTable('images', (table) => {
      table.increments('id').primary();
      table.integer('room_type_id').unsigned().nullable().index();
      table.integer('room_id').unsigned().nullable().index();
      table.string('image_name', 255).nullable();
      table.text('image_url').notNullable();
      table.string('s3_key', 255).nullable();
      table.boolean('is_primary').defaultTo(false);
      table.integer('display_order').defaultTo(0);
      table.timestamps(true, true);
    });
  }

  // Ensure room_type_id is nullable in images table
  try {
    await knex.raw('ALTER TABLE `images` MODIFY `room_type_id` INT UNSIGNED NULL;');
  } catch (err) {
    console.warn('[Migration] Note on modifying room_type_id:', err.message);
  }

  // Ensure room_id column exists in images table
  const hasRoomIdInImages = await knex.schema.hasColumn('images', 'room_id');
  if (!hasRoomIdInImages) {
    await knex.schema.alterTable('images', (table) => {
      table.integer('room_id').unsigned().nullable().after('room_type_id').index();
    });
    try {
      await knex.schema.alterTable('images', (table) => {
        table.foreign('room_id').references('id').inTable('rooms').onDelete('CASCADE');
      });
    } catch (_) {}
  }

  // Create or replace view for room_type_images for seamless backward compatibility
  try {
    await knex.raw('CREATE OR REPLACE VIEW `room_type_images` AS SELECT * FROM `images`;');
  } catch (err) {
    console.warn('[Migration] Note on creating room_type_images view:', err.message);
  }

  // 2. Update rooms table
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    const hasCleaningStartedAt = await knex.schema.hasColumn('rooms', 'cleaning_started_at');
    const hasCleaningDuration = await knex.schema.hasColumn('rooms', 'cleaning_duration_minutes');
    const hasDeletedAt = await knex.schema.hasColumn('rooms', 'deleted_at');

    await knex.schema.alterTable('rooms', (table) => {
      if (!hasCleaningStartedAt) {
        table.dateTime('cleaning_started_at').nullable().after('amenities');
      }
      if (!hasCleaningDuration) {
        table.integer('cleaning_duration_minutes').defaultTo(15).after('cleaning_started_at');
      }
      if (!hasDeletedAt) {
        table.dateTime('deleted_at').nullable().index().after('is_deleted');
      }
    });

    // Add unique composite index on (hotel_id, floor, room_number) if not present
    try {
      const [indexes] = await knex.raw('SHOW INDEX FROM `rooms` WHERE Key_name = "rooms_hotel_floor_room_number_unique";');
      if (!indexes || indexes.length === 0) {
        await knex.schema.alterTable('rooms', (table) => {
          table.unique(['hotel_id', 'floor', 'room_number'], 'rooms_hotel_floor_room_number_unique');
        });
      }
    } catch (err) {
      console.warn('[Migration] Note on unique composite index:', err.message);
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    try {
      await knex.schema.alterTable('rooms', (table) => {
        table.dropUnique(['hotel_id', 'floor', 'room_number'], 'rooms_hotel_floor_room_number_unique');
        table.dropColumn('cleaning_started_at');
        table.dropColumn('cleaning_duration_minutes');
        table.dropColumn('deleted_at');
      });
    } catch (_) {}
  }
};
