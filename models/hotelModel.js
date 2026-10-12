/**
 * Hotel database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const db = require('../database/knex');

/**
 * Format raw database row to structured Hotel object
 * @param {Object} row - Raw hotel row from MySQL
 * @returns {Object|null}
 */
const formatHotel = (row) => {
  if (!row) return null;

  // Safe JSON parser for columns that might be stored as string or already parsed by mysql2
  const parseJson = (val, fallback) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch (_) {
      return fallback;
    }
  };

  const hotelObj = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    pincode: row.pincode,
    gstNumber: row.gst_number || '',
    panNumber: row.pan_number || '',
    totalRooms: Number(row.total_rooms) || 0,
    hotelType: row.hotel_type || 'Boutique Hotel',
    website: row.website || '',
    logo: row.logo || '',
    idProofDocument: row.id_proof_document || '',
    businessProofDocument: row.business_proof_document || '',
    status: row.status,
    statusReason: row.status_reason || '',
    rejectionReason: row.rejection_reason || '',
    subscription_plan_id: row.subscription_plan_id !== undefined ? row.subscription_plan_id : null,
    subscription_plan_active: row.subscription_plan_active !== undefined ? Boolean(row.subscription_plan_active) : (row.subscription_plan_status !== undefined ? Boolean(row.subscription_plan_status) : true),
    subscription_plan_start_date: row.subscription_plan_start_date || null,
    subscription_plan_end_date: row.subscription_plan_end_date || null,
    settings: {
      checkInTime: row.check_in_time || '14:00',
      checkOutTime: row.check_out_time || '12:00',
      timezone: row.timezone || 'Asia/Kolkata',
      currency: row.currency || 'INR',
      taxPercentage: Number(row.tax_percentage) || 18,
      gstEnabled: Boolean(row.gst_enabled),
      gstin: row.gstin || '',
      defaultGstRate: Number(row.default_gst_rate) || 18,
      defaultCgstRate: Number(row.default_cgst_rate) || 9,
      defaultSgstRate: Number(row.default_sgst_rate) || 9,
      taxInclusive: Boolean(row.tax_inclusive),
      upiId: row.upi_id || 'jatinkakadiya234-1@okicici',
      bankDetails: parseJson(row.bank_details, {
        bankName: '',
        accountNumber: '',
        ifscCode: '',
        beneficiaryName: '',
      }),
      lateCheckoutGraceMinutes: Number(row.late_checkout_grace_minutes) || 10,
      amenities: parseJson(row.amenities, ['Free WiFi', '24/7 Room Service', 'Air Conditioning']),
      policies: parseJson(row.policies, [
        'Valid Government ID required at check-in',
        'No smoking in standard rooms',
      ]),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const row = await db('hotels').where({ id, is_deleted: false }).first();
  return formatHotel(row);
};

/**
 * Find hotel by unique slug
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
const findHotelBySlug = async (slug) => {
  if (!slug) return null;
  const row = await db('hotels').where({ slug: slug.trim().toLowerCase(), is_deleted: false }).first();
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
    .where({ 'users.email': email.trim().toLowerCase(), 'hotels.is_deleted': false })
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

module.exports = {
  formatHotel,
  findHotelById,
  findHotelBySlug,
  slugExists,
  findHotelByEmail,
  createHotel,
};
