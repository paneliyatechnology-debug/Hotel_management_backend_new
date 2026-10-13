/**
 * Migration: Create bookings, booking_rooms, and booking_guests tables,
 * and update images table with booking_id and category columns.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Create bookings table
  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) {
    await knex.schema.createTable('bookings', (table) => {
      table.increments('id').primary();
      table.integer('hotel_id').unsigned().notNullable().references('id').inTable('hotels').onDelete('CASCADE').index();
      table.string('booking_number', 50).notNullable().unique().index();
      table.string('primary_guest_name', 255).notNullable().index();
      table.string('secondary_guest_name', 255).nullable();
      table.string('mobile_number', 50).notNullable().index();
      table.text('address').nullable();
      table.integer('room_id').unsigned().notNullable().references('id').inTable('rooms').index();
      table.integer('created_by').unsigned().notNullable().references('id').inTable('users').index();
      table.dateTime('check_in_date').notNullable().index();
      table.dateTime('check_out_date').notNullable().index();
      table.dateTime('actual_check_in').nullable();
      table.dateTime('actual_check_out').nullable();
      table.integer('number_of_nights').notNullable().defaultTo(1);
      table.integer('adults').notNullable().defaultTo(1);
      table.integer('children').notNullable().defaultTo(0);

      // Financial & Tax Breakdown fields
      table.decimal('base_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('tax_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('gst_rate', 5, 2).notNullable().defaultTo(18.00);
      table.decimal('cgst_rate', 5, 2).notNullable().defaultTo(9.00);
      table.decimal('sgst_rate', 5, 2).notNullable().defaultTo(9.00);
      table.decimal('gst_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('cgst_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('sgst_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('taxable_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('discount_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('extra_charges_total', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('late_checkout_charge', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('late_checkout_hours', 5, 2).notNullable().defaultTo(0.00);
      table.decimal('total_amount', 12, 2).notNullable();
      table.decimal('paid_amount', 12, 2).notNullable().defaultTo(0.00);
      table.decimal('due_amount', 12, 2).notNullable().defaultTo(0.00);
      table.enu('payment_status', ['PENDING', 'PARTIALLY_PAID', 'PAID']).notNullable().defaultTo('PENDING').index();

      table.json('signatures').nullable();
      table.json('images').nullable();
      table.text('notes').nullable();
      table.dateTime('deleted_at').nullable().index();
      table.timestamps(true, true);
    });
  }

  // 2. Create booking_rooms table for multiple room allocations
  const hasBookingRooms = await knex.schema.hasTable('booking_rooms');
  if (!hasBookingRooms) {
    await knex.schema.createTable('booking_rooms', (table) => {
      table.increments('id').primary();
      table.integer('booking_id').unsigned().notNullable().references('id').inTable('bookings').onDelete('CASCADE').index();
      table.integer('room_id').unsigned().notNullable().references('id').inTable('rooms').onDelete('CASCADE').index();
      table.decimal('room_price', 12, 2).notNullable().defaultTo(0.00);
      table.timestamps(true, true);
      table.unique(['booking_id', 'room_id'], 'booking_rooms_booking_id_room_id_unique');
    });
  }

  // 3. Create booking_guests table for accompanying guests
  const hasBookingGuests = await knex.schema.hasTable('booking_guests');
  if (!hasBookingGuests) {
    await knex.schema.createTable('booking_guests', (table) => {
      table.increments('id').primary();
      table.integer('booking_id').unsigned().notNullable().references('id').inTable('bookings').onDelete('CASCADE').index();
      table.string('name', 255).notNullable();
      table.integer('age').nullable();
      table.string('gender', 50).nullable();
      table.string('id_proof_type', 100).nullable();
      table.string('id_proof_number', 100).nullable();
      table.text('id_proof_document').nullable();
      table.timestamps(true, true);
    });
  }

  // 4. Update images table with booking_id and category columns
  const hasImages = await knex.schema.hasTable('images');
  if (hasImages) {
    const hasBookingIdInImages = await knex.schema.hasColumn('images', 'booking_id');
    if (!hasBookingIdInImages) {
      await knex.schema.alterTable('images', (table) => {
        table.integer('booking_id').unsigned().nullable().after('room_id').index();
      });
      try {
        await knex.schema.alterTable('images', (table) => {
          table.foreign('booking_id').references('id').inTable('bookings').onDelete('CASCADE');
        });
      } catch (err) {
        console.warn('[Migration] Note on foreign key for booking_id in images:', err.message);
      }
    }

    const hasCategoryInImages = await knex.schema.hasColumn('images', 'category');
    if (!hasCategoryInImages) {
      await knex.schema.alterTable('images', (table) => {
        table.string('category', 50).nullable().defaultTo('ROOM').after('booking_id').index();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  try {
    const hasImages = await knex.schema.hasTable('images');
    if (hasImages) {
      const hasBookingId = await knex.schema.hasColumn('images', 'booking_id');
      const hasCategory = await knex.schema.hasColumn('images', 'category');
      if (hasBookingId || hasCategory) {
        try {
          await knex.schema.alterTable('images', (table) => {
            if (hasBookingId) {
              try { table.dropForeign('booking_id'); } catch (_) {}
              table.dropColumn('booking_id');
            }
            if (hasCategory) table.dropColumn('category');
          });
        } catch (_) {}
      }
    }

    await knex.schema.dropTableIfExists('booking_guests');
    await knex.schema.dropTableIfExists('booking_rooms');
    await knex.schema.dropTableIfExists('bookings');
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  }
};
