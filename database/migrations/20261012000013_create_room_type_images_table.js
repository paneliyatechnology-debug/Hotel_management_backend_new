/**
 * Migration: Create room_type_images table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasImagesTable = await knex.schema.hasTable('room_type_images');
  if (!hasImagesTable) {
    await knex.schema.createTable('room_type_images', (table) => {
      table.increments('id').primary();
      table.integer('room_type_id').unsigned().notNullable().index();
      table.string('image_name', 255).nullable();
      table.text('image_url').notNullable();
      table.string('s3_key', 255).nullable();
      table.boolean('is_primary').defaultTo(false);
      table.integer('display_order').defaultTo(0);
      table.timestamps(true, true);
    });
  } else {
    const hasImageName = await knex.schema.hasColumn('room_type_images', 'image_name');
    if (!hasImageName) {
      await knex.schema.alterTable('room_type_images', (table) => {
        table.string('image_name', 255).nullable().after('room_type_id');
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('room_type_images');
};
