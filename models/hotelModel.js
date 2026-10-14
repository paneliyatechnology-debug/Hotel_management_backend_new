/**
 * Hotel database operations using Knex.
 */
const db = require('../database/knex');
const { buildImageUrl, deleteFile } = require('../services/s3Service');
const { parseJson } = require('../utils/json');

/**
 * Format raw database row to structured Hotel object
 * @param {Object} row - Raw hotel row from MySQL
 * @returns {Object|null}
 */
const formatHotel = (row) => {
  if (!row) return null;

  const hotelObj = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner_id: row.owner_id,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    pincode: row.pincode,
    gst_number: row.gst_number || '',
    pan_number: row.pan_number || '',
    total_rooms: Number(row.total_rooms) || 0,
    hotel_type: row.hotel_type || 'Boutique Hotel',
    website: row.website || '',
    logo: buildImageUrl(row.logo || ''),
    status: row.status,
    status_reason: row.status_reason || '',
    subscription_plan_id: row.subscription_plan_id !== undefined ? row.subscription_plan_id : null,
    subscription_plan_active: row.subscription_plan_active !== undefined ? Boolean(row.subscription_plan_active) : (row.subscription_plan_status !== undefined ? Boolean(row.subscription_plan_status) : true),
    subscription_plan_start_date: row.subscription_plan_start_date || null,
    subscription_plan_end_date: row.subscription_plan_end_date || null,
    subscription: {
      plan_id: row.subscription_plan_id !== undefined ? row.subscription_plan_id : null,
      active: row.subscription_plan_active !== undefined ? Boolean(row.subscription_plan_active) : (row.subscription_plan_status !== undefined ? Boolean(row.subscription_plan_status) : true),
      start_date: row.subscription_plan_start_date || null,
      end_date: row.subscription_plan_end_date || null,
      auto_renew: Boolean(row.auto_renew),
    },
    settings: {
      check_in_time: row.check_in_time || '14:00',
      check_out_time: row.check_out_time || '12:00',
      timezone: row.timezone || 'Asia/Kolkata',
      currency: row.currency || 'INR',
      tax_percentage: Number(row.tax_percentage) || 18,
      gst_enabled: Boolean(row.gst_enabled),
      upi_id: row.upi_id || '',
      late_checkout_grace_minutes: Number(row.late_checkout_grace_minutes) || 10,
      amenities: parseJson(row.amenities, ['Free WiFi', '24/7 Room Service', 'Air Conditioning']),
      policies: parseJson(row.policies, [
        'Valid Government ID required at check-in',
        'No smoking in standard rooms',
      ]),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at || null,
  };

  // If joined with users table, attach owner summary
  if (row.owner_name || row.owner_email) {
    hotelObj.owner = {
      id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
      phone: row.owner_phone || '',
    };
  }

  return hotelObj;
};

/**
 * Find hotel by ID
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
const findHotelById = async (id) => {
  const row = await db('hotels')
    .where({ id })
    .whereNull('deleted_at')
    .first();
  return formatHotel(row);
};

/**
 * Find hotel by unique slug
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
const findHotelBySlug = async (slug) => {
  if (!slug) return null;
  const row = await db('hotels')
    .where({ slug: slug.trim().toLowerCase() })
    .whereNull('deleted_at')
    .first();
  return formatHotel(row);
};

/**
 * Check if a slug already exists
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
const slugExists = async (slug) => {
  if (!slug) return false;
  const row = await db('hotels').where({ slug: slug.trim().toLowerCase() }).select('id').first();
  return Boolean(row);
};

/**
 * Find hotel by owner email (via join on users table)
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
const findHotelByEmail = async (email) => {
  if (!email) return null;
  const row = await db('hotels')
    .join('users', 'hotels.owner_id', 'users.id')
    .where({ 'users.email': email.trim().toLowerCase() })
    .whereNull('hotels.deleted_at')
    .whereNull('users.deleted_at')
    .select('hotels.*', 'users.name as owner_name', 'users.email as owner_email', 'users.phone as owner_phone')
    .first();
  return formatHotel(row);
};

/**
 * Create a new hotel record
 * @param {Object} data - Formatted hotel DB fields including owner_id
 * @returns {Promise<Object>}
 */
const createHotel = async (data) => {
  const [id] = await db('hotels').insert({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const row = await db('hotels').where({ id }).first();
  return formatHotel(row);
};

/**
 * Soft delete a hotel record by ID
 * @param {number|string} id
 * @returns {Promise<number>}
 */
const softDeleteHotel = async (id) => {
  return db('hotels')
    .where({ id })
    .update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });
};

/**
 * Update a hotel record and remove old logo from S3 if replaced
 * @param {number|string} id
 * @param {Object} updates
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const updateHotel = async (id, updates, client = db) => {
  const existing = await client('hotels').where({ id }).whereNull('deleted_at').first();
  if (!existing) return null;

  if (updates.logo !== undefined && updates.logo !== existing.logo && existing.logo) {
    await deleteFile(existing.logo);
  }

  await client('hotels').where({ id }).update({
    ...updates,
    updated_at: new Date(),
  });

  const row = await client('hotels').where({ id }).first();
  return formatHotel(row);
};

module.exports = {
  formatHotel,
  findHotelById,
  findHotelBySlug,
  slugExists,
  findHotelByEmail,
  createHotel,
  updateHotel,
  softDeleteHotel,
};
