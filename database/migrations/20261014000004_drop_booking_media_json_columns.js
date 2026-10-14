/**
 * Migration: Drop bookings.images and bookings.signatures (JSON URL lists).
 * The images table is the only place booking photos and signatures are stored.
 * Any URL that lives only in the JSON columns is copied into images first, so nothing is lost.
 */

const toUrlList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const fileNameFromUrl = (url) => {
  const clean = String(url).split('?')[0];
  return clean.substring(clean.lastIndexOf('/') + 1) || null;
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasImages = await knex.schema.hasColumn('bookings', 'images');
  const hasSignatures = await knex.schema.hasColumn('bookings', 'signatures');

  if (hasImages || hasSignatures) {
    const bookings = await knex('bookings').select(
      'id',
      ...(hasImages ? ['images'] : []),
      ...(hasSignatures ? ['signatures'] : [])
    );
    const now = new Date();

    for (const booking of bookings) {
      const existing = await knex('images')
        .where({ booking_id: booking.id })
        .select('image_url', 'is_signature');
      const known = new Set(existing.map((row) => `${row.is_signature ? 1 : 0}|${row.image_url}`));

      const rows = [];
      const collect = (urls, isSignature) => {
        urls.filter((url) => typeof url === 'string' && url).forEach((url, index) => {
          const key = `${isSignature ? 1 : 0}|${url}`;
          if (known.has(key)) return;
          known.add(key);
          rows.push({
            booking_id: booking.id,
            room_id: null,
            room_type_id: null,
            category: isSignature ? 'BOOKING_SIGNATURE' : 'BOOKING_IMAGE',
            is_signature: isSignature,
            image_name: fileNameFromUrl(url),
            image_url: url,
            s3_key: null,
            is_primary: 0,
            display_order: index,
            created_at: now,
            updated_at: now,
          });
        });
      };

      if (hasImages) collect(toUrlList(booking.images), false);
      if (hasSignatures) collect(toUrlList(booking.signatures), true);

      if (rows.length > 0) {
        await knex('images').insert(rows);
      }
    }
  }

  if (hasImages || hasSignatures) {
    await knex.schema.alterTable('bookings', (table) => {
      if (hasImages) table.dropColumn('images');
      if (hasSignatures) table.dropColumn('signatures');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasImages = await knex.schema.hasColumn('bookings', 'images');
  const hasSignatures = await knex.schema.hasColumn('bookings', 'signatures');

  await knex.schema.alterTable('bookings', (table) => {
    if (!hasSignatures) table.json('signatures').nullable();
    if (!hasImages) table.json('images').nullable();
  });

  const rows = await knex('images')
    .whereNotNull('booking_id')
    .orderBy('id', 'asc')
    .select('booking_id', 'image_url', 'is_signature');

  const byBooking = {};
  rows.forEach((row) => {
    const entry = byBooking[row.booking_id] || (byBooking[row.booking_id] = { images: [], signatures: [] });
    (row.is_signature ? entry.signatures : entry.images).push(row.image_url);
  });

  for (const [bookingId, entry] of Object.entries(byBooking)) {
    await knex('bookings').where({ id: bookingId }).update({
      images: JSON.stringify(entry.images),
      signatures: JSON.stringify(entry.signatures),
    });
  }
};
