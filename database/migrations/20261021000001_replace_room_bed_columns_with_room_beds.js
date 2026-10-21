/**
 * One room can have several bed types.
 * Existing bed_type and bed_count values are copied into room_beds, then those
 * columns and seating_capacity are removed from rooms. Room status stays on rooms
 * and still defaults to AVAILABLE.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) return;

  const hasBeds = await knex.schema.hasTable('room_beds');
  if (!hasBeds) {
    await knex.schema.createTable('room_beds', (table) => {
      table.increments('id').primary();
      table.integer('room_id').unsigned().notNullable().index();
      table.string('bed_type', 100).notNullable();
      table.integer('bed_count').unsigned().notNullable();
      table.integer('display_order').unsigned().notNullable().defaultTo(1);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.foreign('room_id').references('id').inTable('rooms').onDelete('CASCADE');
    });
  }

  const hasBedType = await knex.schema.hasColumn('rooms', 'bed_type');
  const hasBedCount = await knex.schema.hasColumn('rooms', 'bed_count');
  if (hasBedType || hasBedCount) {
    const columns = ['id'];
    if (hasBedType) columns.push('bed_type');
    if (hasBedCount) columns.push('bed_count');
    const rooms = await knex('rooms').select(columns);
    const existing = await knex('room_beds').distinct('room_id');
    const copied = new Set(existing.map((row) => Number(row.room_id)));
    const now = new Date();
    const rows = [];

    for (const room of rooms) {
      if (copied.has(Number(room.id))) continue;
      const bedType = String(room.bed_type || '').trim();
      const bedCount = Number(room.bed_count);
      if (!bedType && !(bedCount > 0)) continue;
      rows.push({
        room_id: room.id,
        bed_type: bedType || 'Bed',
        bed_count: Number.isInteger(bedCount) && bedCount > 0 ? bedCount : 1,
        display_order: 1,
        created_at: now,
        updated_at: now,
      });
    }

    if (rows.length > 0) {
      await knex('room_beds').insert(rows);
    }
  }

  if (hasBedType) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('bed_type');
    });
  }
  if (hasBedCount) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('bed_count');
    });
  }

  const hasSeating = await knex.schema.hasColumn('rooms', 'seating_capacity');
  if (hasSeating) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('seating_capacity');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    const hasBedType = await knex.schema.hasColumn('rooms', 'bed_type');
    const hasBedCount = await knex.schema.hasColumn('rooms', 'bed_count');
    const hasSeating = await knex.schema.hasColumn('rooms', 'seating_capacity');
    if (!hasBedType || !hasBedCount || !hasSeating) {
      await knex.schema.alterTable('rooms', (table) => {
        if (!hasSeating) table.integer('seating_capacity').defaultTo(2);
        if (!hasBedCount) table.integer('bed_count').defaultTo(1);
        if (!hasBedType) table.string('bed_type', 100).defaultTo('1 King Bed');
      });
    }
  }

  await knex.schema.dropTableIfExists('room_beds');
};
