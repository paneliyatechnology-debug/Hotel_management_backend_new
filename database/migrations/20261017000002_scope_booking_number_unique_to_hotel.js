/**
 * Booking numbers are unique per hotel, not across the platform.
 * BLUE OCEAN and BLUE OPERA may both use BO/2026-27/0001.
 * The same hotel cannot store that number twice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const indexColumns = async (knex, tableName) => {
  const rows = await knex('information_schema.STATISTICS')
    .whereRaw('TABLE_SCHEMA = DATABASE()')
    .andWhere({ TABLE_NAME: tableName })
    .select('INDEX_NAME', 'NON_UNIQUE', 'COLUMN_NAME', 'SEQ_IN_INDEX')
    .orderBy(['INDEX_NAME', 'SEQ_IN_INDEX']);

  const indexes = new Map();
  for (const row of rows) {
    if (!indexes.has(row.INDEX_NAME)) {
      indexes.set(row.INDEX_NAME, { unique: Number(row.NON_UNIQUE) === 0, columns: [] });
    }
    indexes.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }
  return indexes;
};

exports.up = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (hasBookings) {
    const indexes = await indexColumns(knex, 'bookings');
    const bookingNumberOnly = [...indexes.entries()].find(([, index]) => (
      index.unique && index.columns.length === 1 && index.columns[0] === 'booking_number'
    ));
    const hotelAndNumber = [...indexes.values()].some((index) => (
      index.unique
      && index.columns.length === 2
      && index.columns[0] === 'hotel_id'
      && index.columns[1] === 'booking_number'
    ));

    if (bookingNumberOnly || !hotelAndNumber) {
      await knex.schema.alterTable('bookings', (table) => {
        if (bookingNumberOnly) table.dropUnique(['booking_number'], bookingNumberOnly[0]);
        if (!hotelAndNumber) table.unique(['hotel_id', 'booking_number'], 'bookings_hotel_number_unique');
      });
    }
  }

  const hasHotels = await knex.schema.hasTable('hotels');
  if (hasHotels && (await knex.schema.hasColumn('hotels', 'booking_code'))) {
    const indexes = await indexColumns(knex, 'hotels');
    const bookingCodeUnique = [...indexes.entries()].find(([, index]) => (
      index.unique && index.columns.length === 1 && index.columns[0] === 'booking_code'
    ));
    if (bookingCodeUnique) {
      await knex.schema.alterTable('hotels', (table) => {
        table.dropUnique(['booking_code'], bookingCodeUnique[0]);
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (hasBookings) {
    const indexes = await indexColumns(knex, 'bookings');
    const hotelAndNumber = [...indexes.entries()].find(([, index]) => (
      index.unique
      && index.columns.length === 2
      && index.columns[0] === 'hotel_id'
      && index.columns[1] === 'booking_number'
    ));
    const bookingNumberOnly = [...indexes.values()].some((index) => (
      index.unique && index.columns.length === 1 && index.columns[0] === 'booking_number'
    ));

    if (hotelAndNumber || !bookingNumberOnly) {
      await knex.schema.alterTable('bookings', (table) => {
        if (hotelAndNumber) table.dropUnique(['hotel_id', 'booking_number'], hotelAndNumber[0]);
        if (!bookingNumberOnly) table.unique(['booking_number']);
      });
    }
  }

  const hasHotels = await knex.schema.hasTable('hotels');
  if (hasHotels && (await knex.schema.hasColumn('hotels', 'booking_code'))) {
    const indexes = await indexColumns(knex, 'hotels');
    const bookingCodeUnique = [...indexes.values()].some((index) => (
      index.unique && index.columns.length === 1 && index.columns[0] === 'booking_code'
    ));
    if (!bookingCodeUnique) {
      await knex.schema.alterTable('hotels', (table) => {
        table.unique(['booking_code']);
      });
    }
  }
};
