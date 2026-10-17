/**
 * Hotel database operations using Knex.
 */
const db = require('../database/knex');
const { buildImageUrl, deleteFile } = require('../services/s3Service');
const { parseJson } = require('../utils/json');
const { joinCurrentPurchase } = require('./subscriptionPlanModel');

/**
 * Subscription window from the hotel's latest plan purchase.
 * The hotels row only stores subscription_plan_id.
 * @param {Object} row
 * @returns {{ active: boolean, start_date: Date|null, end_date: Date|null, auto_renew: boolean }}
 */
const purchaseWindow = (row) => {
  const hasPlan = row.subscription_plan_id !== undefined && row.subscription_plan_id !== null;
  const active = hasPlan ? String(row.purchase_status || '').toUpperCase() === 'PAID' : true;
  return {
    active,
    start_date: row.purchase_starts_at || null,
    end_date: row.purchase_ends_at || null,
    auto_renew: Boolean(row.purchase_auto_renew),
  };
};

/**
 * Format raw database row to structured Hotel object
 * @param {Object} row - Raw hotel row from MySQL
 * @returns {Object|null}
 */
const formatHotel = (row) => {
  if (!row) return null;

  const window = purchaseWindow(row);
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
    bank_name: row.bank_name || '',
    bank_account_holder: row.bank_account_holder || '',
    bank_account_number: row.bank_account_number || '',
    bank_ifsc_code: row.bank_ifsc_code || '',
    bank_branch: row.bank_branch || '',
    total_rooms: Number(row.total_rooms) || 0,
    hotel_type: row.hotel_type || 'Boutique Hotel',
    website: row.website || '',
    logo: buildImageUrl(row.logo || ''),
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    subscription_plan_id: row.subscription_plan_id !== undefined ? row.subscription_plan_id : null,
    subscription: {
      plan_id: row.subscription_plan_id !== undefined ? row.subscription_plan_id : null,
      active: window.active,
      start_date: window.start_date,
      end_date: window.end_date,
      auto_renew: window.auto_renew,
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
 * Short shape used by the hotel list. The full hotel comes from GET /hotels/:id.
 * @param {Object} row - Hotel row joined with its owner
 * @returns {Object}
 */
const formatHotelListItem = (row) => {
  const window = purchaseWindow(row);
  return {
  id: row.id,
  name: row.name,
  slug: row.slug,
  logo_url: buildImageUrl(row.logo || ''),
  owner: {
    id: row.owner_id,
    name: row.owner_name || null,
    email: row.owner_email || null,
    phone: row.owner_phone || '',
  },
  total_rooms: Number(row.total_rooms) || 0,
  hotel_type: row.hotel_type || 'Boutique Hotel',
  address: row.address,
  city: row.city,
  state: row.state,
  country: row.country,
  is_active: Boolean(row.is_active),
  subscription: {
    plan_id: row.subscription_plan_id ?? null,
    plan_name: row.plan_name || null,
    plan_code: row.plan_code || null,
    billing_cycle: row.plan_billing_cycle || null,
    price: row.plan_price === null || row.plan_price === undefined ? null : Number(row.plan_price),
    max_rooms: row.plan_max_rooms ?? null,
    active: window.active,
    start_date: window.start_date,
    end_date: window.end_date,
    auto_renew: window.auto_renew,
  },
  created_at: row.created_at,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at || null,
  };
};

// Columns the hotel list reads. Nothing else is loaded.
const HOTEL_LIST_COLUMNS = [
  'hotels.id',
  'hotels.name',
  'hotels.slug',
  'hotels.logo',
  'hotels.owner_id',
  'hotels.total_rooms',
  'hotels.hotel_type',
  'hotels.address',
  'hotels.city',
  'hotels.state',
  'hotels.country',
  'hotels.is_active',
  'hotels.subscription_plan_id',
  'current_purchase.purchase_status',
  'current_purchase.purchase_starts_at',
  'current_purchase.purchase_ends_at',
  'current_purchase.purchase_auto_renew',
  'hotels.created_at',
  'hotels.updated_at',
  'hotels.deleted_at',
  'users.name as owner_name',
  'users.email as owner_email',
  'users.phone as owner_phone',
  'subscription_plans.name as plan_name',
  'subscription_plans.code as plan_code',
  'subscription_plans.billing_cycle as plan_billing_cycle',
  'subscription_plans.price as plan_price',
  'subscription_plans.max_rooms as plan_max_rooms',
];

/**
 * Hotels joined with their owner (a user), so the result carries the owner summary.
 * @param {import('knex').Knex} [client=db]
 * @returns {import('knex').Knex.QueryBuilder}
 */
const hotelsWithOwner = (client = db) => {
  const query = client('hotels')
    .leftJoin('users', 'hotels.owner_id', 'users.id')
    .select(
      'hotels.*',
      'users.name as owner_name',
      'users.email as owner_email',
      'users.phone as owner_phone',
      'current_purchase.purchase_status',
      'current_purchase.purchase_starts_at',
      'current_purchase.purchase_ends_at',
      'current_purchase.purchase_auto_renew'
    );
  return joinCurrentPurchase(query);
};

/**
 * Find hotel by ID
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
const findHotelById = async (id) => {
  const row = await hotelsWithOwner()
    .where('hotels.id', id)
    .whereNull('hotels.deleted_at')
    .first();
  return formatHotel(row);
};

/**
 * Minimal state used to decide whether a hotel's users may keep working.
 * Includes soft-deleted hotels so they can be told apart from missing ones.
 * Also loads the subscription window so an expired or inactive plan can block access.
 * @param {number|string} id
 * @returns {Promise<{ is_active: number|boolean, deleted_at: Date|null, subscription_plan_id: number|null, subscription_plan_active: number|boolean, subscription_plan_end_date: Date|null, plan_name: string|null }|undefined>}
 */
const findHotelAccessState = async (id) => {
  const query = db('hotels')
    .leftJoin('subscription_plans', 'hotels.subscription_plan_id', 'subscription_plans.id')
    .where('hotels.id', id)
    .select(
      'hotels.is_active',
      'hotels.deleted_at',
      'hotels.subscription_plan_id',
      'current_purchase.purchase_status',
      'current_purchase.purchase_ends_at',
      'subscription_plans.name as plan_name'
    );
  const row = await joinCurrentPurchase(query).first();
  if (!row) return undefined;
  const window = purchaseWindow(row);
  return {
    is_active: row.is_active,
    deleted_at: row.deleted_at,
    subscription_plan_id: row.subscription_plan_id,
    subscription_plan_active: window.active,
    subscription_plan_end_date: window.end_date,
    plan_name: row.plan_name,
  };
};

/**
 * Short hotel identity returned with login and the profile: id, name, GST and PAN.
 * @param {number|string} id - Hotel id
 * @returns {Promise<{ id: number, name: string, gst_number: string, pan_number: string }|null>}
 */
const findHotelSummary = async (id) => {
  const row = await db('hotels')
    .where({ id })
    .whereNull('deleted_at')
    .select('id', 'name', 'gst_number', 'pan_number')
    .first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gst_number: row.gst_number || '',
    pan_number: row.pan_number || '',
  };
};

/**
 * The hotel's subscription plan and its limits, used to decide whether it may add rooms.
 * An archived plan is still returned: hotels already on it keep its limits.
 * @param {number|string} id - Hotel id
 * @returns {Promise<{ subscription_plan_id: number|null, subscription_plan_active: number|boolean, subscription_plan_end_date: Date|null, plan_name: string|null, plan_max_rooms: number|null }|undefined>}
 */
const findHotelSubscription = async (id) => {
  const query = db('hotels')
    .leftJoin('subscription_plans', 'hotels.subscription_plan_id', 'subscription_plans.id')
    .where('hotels.id', id)
    .select(
      'hotels.subscription_plan_id',
      'current_purchase.purchase_status',
      'current_purchase.purchase_ends_at',
      'subscription_plans.name as plan_name',
      'subscription_plans.max_rooms as plan_max_rooms'
    );
  const row = await joinCurrentPurchase(query).first();
  if (!row) return undefined;
  const window = purchaseWindow(row);
  return {
    subscription_plan_id: row.subscription_plan_id,
    subscription_plan_active: window.active,
    subscription_plan_end_date: window.end_date,
    plan_name: row.plan_name,
    plan_max_rooms: row.plan_max_rooms,
  };
};

// Columns a super admin may sort the hotel list by.
const HOTEL_SORT_FIELDS = ['id', 'name', 'city', 'is_active', 'created_at', 'updated_at'];

/**
 * List hotels with filters, search, sorting and pagination.
 * Always excludes soft-deleted hotels.
 *
 * @param {Object} [filters={}] - search, is_active, subscription_plan_id, subscription_plan_active
 * @param {Object} [pagination={}] - page, limit (max 100)
 * @param {Object} [sorting={}] - sort_by, sort_order
 * @returns {Promise<{ hotels: Object[], total: number, page: number, limit: number, total_pages: number }>}
 */
const findHotels = async (filters = {}, pagination = {}, sorting = {}) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const offset = (page - 1) * limit;

  const sortField = HOTEL_SORT_FIELDS.includes(sorting.sort_by) ? sorting.sort_by : 'created_at';
  const sortOrder = String(sorting.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const applyFilters = (qb) => {
    qb.whereNull('hotels.deleted_at');

    if (filters.is_active !== undefined && filters.is_active !== '') {
      const active = filters.is_active === true || filters.is_active === 'true';
      qb.where('hotels.is_active', active);
    }

    if (filters.subscription_plan_id) {
      qb.where('hotels.subscription_plan_id', Number(filters.subscription_plan_id));
    }

    if (filters.subscription_plan_active !== undefined && filters.subscription_plan_active !== '') {
      const active = filters.subscription_plan_active === true || filters.subscription_plan_active === 'true';
      if (active) {
        qb.where('current_purchase.purchase_status', 'PAID');
      } else {
        qb.where(function () {
          this.whereNull('current_purchase.purchase_status').orWhere(
            'current_purchase.purchase_status',
            '!=',
            'PAID'
          );
        });
      }
    }

    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.where(function () {
        this.where('hotels.name', 'like', term)
          .orWhere('hotels.slug', 'like', term)
          .orWhere('hotels.city', 'like', term)
          .orWhere('users.name', 'like', term)
          .orWhere('users.email', 'like', term)
          .orWhere('users.phone', 'like', term);
      });
    }
  };

  const countQuery = joinCurrentPurchase(db('hotels').leftJoin('users', 'hotels.owner_id', 'users.id'));
  applyFilters(countQuery);

  const dataQuery = joinCurrentPurchase(
    db('hotels')
      .leftJoin('users', 'hotels.owner_id', 'users.id')
      .leftJoin('subscription_plans', 'hotels.subscription_plan_id', 'subscription_plans.id')
      .select(HOTEL_LIST_COLUMNS)
  );
  applyFilters(dataQuery);

  const [totalResult, rows] = await Promise.all([
    countQuery.count('hotels.id as total').first(),
    dataQuery.orderBy(`hotels.${sortField}`, sortOrder).offset(offset).limit(limit),
  ]);
  const total = Number(totalResult?.total || 0);

  return {
    hotels: rows.map(formatHotelListItem),
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
  };
};

/**
 * Find hotel by unique slug
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
const findHotelBySlug = async (slug) => {
  if (!slug) return null;
  const row = await joinCurrentPurchase(
    db('hotels').where({ slug: slug.trim().toLowerCase() }).whereNull('deleted_at')
  )
    .select(
      'hotels.*',
      'current_purchase.purchase_status',
      'current_purchase.purchase_starts_at',
      'current_purchase.purchase_ends_at',
      'current_purchase.purchase_auto_renew'
    )
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
  const row = await hotelsWithOwner()
    .where({ 'users.email': email.trim().toLowerCase() })
    .whereNull('hotels.deleted_at')
    .whereNull('users.deleted_at')
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
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const softDeleteHotel = async (id, client = db) => {
  return client('hotels')
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

/**
 * Hotel fields printed on a bill, folio or GST file. Skips the subscription lookup the full profile uses.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
const findHotelForDocument = async (id) => {
  const row = await db('hotels')
    .leftJoin('users', 'hotels.owner_id', 'users.id')
    .where('hotels.id', id)
    .whereNull('hotels.deleted_at')
    .select(
      'hotels.id',
      'hotels.name',
      'hotels.hotel_type',
      'hotels.address',
      'hotels.city',
      'hotels.state',
      'hotels.country',
      'hotels.pincode',
      'hotels.gst_number',
      'hotels.pan_number',
      'hotels.bank_name',
      'hotels.bank_account_holder',
      'hotels.bank_account_number',
      'hotels.bank_ifsc_code',
      'hotels.bank_branch',
      'hotels.check_in_time',
      'hotels.check_out_time',
      'users.name as owner_name',
      'users.email as owner_email',
      'users.phone as owner_phone'
    )
    .first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    hotel_type: row.hotel_type || 'Boutique Hotel',
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country || '',
    pincode: row.pincode,
    gst_number: row.gst_number || '',
    pan_number: row.pan_number || '',
    bank_name: row.bank_name || '',
    bank_account_holder: row.bank_account_holder || '',
    bank_account_number: row.bank_account_number || '',
    bank_ifsc_code: row.bank_ifsc_code || '',
    bank_branch: row.bank_branch || '',
    settings: {
      check_in_time: row.check_in_time || '14:00',
      check_out_time: row.check_out_time || '12:00',
    },
    owner: {
      name: row.owner_name || '',
      email: row.owner_email || '',
      phone: row.owner_phone || '',
    },
  };
};

module.exports = {
  formatHotel,
  findHotelById,
  findHotelForDocument,
  findHotelAccessState,
  findHotelSubscription,
  findHotelSummary,
  findHotels,
  findHotelBySlug,
  slugExists,
  findHotelByEmail,
  createHotel,
  updateHotel,
  softDeleteHotel,
};
