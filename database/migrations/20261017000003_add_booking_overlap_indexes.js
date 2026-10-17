/**
 * Indexes for booking overlap checks.
 * Create and update look up other stays on the same rooms by date.
 * Nothing in the data changes.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const BOOKING_INDEX = ['bookings_room_stay_overlap_index', ['room_id', 'actual_check_out', 'check_in_date', 'check_out_date']];
const ROOM_LINK_INDEX = ['booking_rooms_room_booking_index', ['room_id', 'booking_id']];

const hasIndex = async (knex, table, name) => {
  const [rows] = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [table, name]);
  return rows.length > 0;
};

exports.up = async function (knex) {
  if (!(await hasIndex(knex, 'bookings', BOOKING_INDEX[0]))) {
    await knex.schema.alterTable('bookings', (table) => table.index(BOOKING_INDEX[1], BOOKING_INDEX[0]));
  }

  if (!(await hasIndex(knex, 'booking_rooms', ROOM_LINK_INDEX[0]))) {
    await knex.schema.alterTable('booking_rooms', (table) => table.index(ROOM_LINK_INDEX[1], ROOM_LINK_INDEX[0]));
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  if (await hasIndex(knex, 'bookings', BOOKING_INDEX[0])) {
    await knex.schema.alterTable('bookings', (table) => table.dropIndex([], BOOKING_INDEX[0]));
  }

  if (await hasIndex(knex, 'booking_rooms', ROOM_LINK_INDEX[0])) {
    await knex.schema.alterTable('booking_rooms', (table) => table.dropIndex([], ROOM_LINK_INDEX[0]));
  }
};
