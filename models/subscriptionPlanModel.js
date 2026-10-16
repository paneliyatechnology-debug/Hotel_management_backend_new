/**
 * Subscription Plan database operations using Knex.
 */
const db = require('../database/knex');

/**
 * Format raw database row to structured SubscriptionPlan object
 * @param {Object} row - Raw subscription plan row from MySQL
 * @param {string[]} [features=[]] - Array of feature strings
 * @returns {Object|null}
 */
const formatPlan = (row, features = []) => {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    billing_cycle: row.billing_cycle,
    price: Number(row.price),
    discount_percent: Number(row.discount_percent),
    max_rooms: Number(row.max_rooms),
    description: row.description || '',
    badge: row.badge || '',
    is_popular: Boolean(row.is_popular),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order),
    features: Array.isArray(features) ? features : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at || null,
  };
};

/**
 * Fetch feature strings for a specific plan ID
 * @param {number|string} planId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<string[]>}
 */
const getFeaturesByPlanId = async (planId, client = db) => {
  const rows = await client('subscription_plan_features')
    .where({ plan_id: planId })
    .orderBy('id', 'asc')
    .select('feature');

  return rows.map((r) => r.feature);
};

/**
 * Batch fetch feature strings for an array of plan IDs
 * @param {Array<number|string>} planIds
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Record<number, string[]>>} Map of planId -> features array
 */
const getFeaturesByPlanIds = async (planIds, client = db) => {
  if (!planIds || planIds.length === 0) return {};

  const rows = await client('subscription_plan_features')
    .whereIn('plan_id', planIds)
    .orderBy('id', 'asc')
    .select('plan_id', 'feature');

  const map = {};
  for (const id of planIds) {
    map[id] = [];
  }

  for (const row of rows) {
    if (!map[row.plan_id]) {
      map[row.plan_id] = [];
    }
    map[row.plan_id].push(row.feature);
  }

  return map;
};

/**
 * Find plan by ID (excludes soft-deleted by default)
 * @param {number|string} id
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findPlanById = async (id, { includeDeleted = false } = {}, client = db) => {
  let query = client('subscription_plans').where({ id });
  if (!includeDeleted) {
    query = query.whereNull('deleted_at');
  }

  const row = await query.first();
  if (!row) return null;

  const features = await getFeaturesByPlanId(row.id, client);
  return formatPlan(row, features);
};

/**
 * Find plan by code (excludes soft-deleted by default)
 * @param {string} code
 * @param {Object} [options={}]
 * @param {boolean} [options.includeDeleted=false]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findPlanByCode = async (code, { includeDeleted = false } = {}, client = db) => {
  if (!code) return null;

  let query = client('subscription_plans').where({ code: code.trim().toUpperCase() });
  if (!includeDeleted) {
    query = query.whereNull('deleted_at');
  }

  const row = await query.first();
  if (!row) return null;

  const features = await getFeaturesByPlanId(row.id, client);
  return formatPlan(row, features);
};

/**
 * Helper to build filter query for subscription plans
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {Object} filters
 */
const applyFilters = (query, filters) => {
  const { billing_cycle, is_active, is_popular, includeDeleted = false } = filters;

  if (!includeDeleted) {
    query.whereNull('deleted_at');
  }

  if (billing_cycle) {
    query.whereRaw('UPPER(billing_cycle) = ?', [String(billing_cycle).trim().toUpperCase()]);
  }

  if (is_active !== undefined && is_active !== null && is_active !== '') {
    const activeBool = is_active === true || is_active === 'true' || is_active === 1 || is_active === '1';
    query.where('is_active', activeBool);
  }

  if (is_popular !== undefined && is_popular !== null && is_popular !== '') {
    const popularBool = is_popular === true || is_popular === 'true' || is_popular === 1 || is_popular === '1';
    query.where('is_popular', popularBool);
  }

  return query;
};

/**
 * Count subscription plans matching filters
 * @param {Object} filters
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countPlans = async (filters = {}, client = db) => {
  const query = client('subscription_plans');
  applyFilters(query, filters);
  const result = await query.count('id as count').first();
  return Number(result?.count || 0);
};

/**
 * Query plans with filtering, sorting, pagination, and eager-loaded features
 * @param {Object} [options={}]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ plans: Object[], total: number }>}
 */
const findPlans = async (options = {}, client = db) => {
  const {
    billing_cycle,
    is_active,
    is_popular,
    includeDeleted = false,
    page = 1,
    limit = 10,
    sort_by = 'display_order',
    sort_order = 'asc',
  } = options;

  const total = await countPlans({ billing_cycle, is_active, is_popular, includeDeleted }, client);

  let query = client('subscription_plans');
  applyFilters(query, { billing_cycle, is_active, is_popular, includeDeleted });

  const validSortColumns = {
    display_order: 'display_order',
    price: 'price',
    name: 'name',
    created_at: 'created_at',
    updated_at: 'updated_at',
  };
  const sortCol = validSortColumns[sort_by] || 'display_order';
  const direction = String(sort_order).toLowerCase() === 'desc' ? 'desc' : 'asc';

  query.orderBy(sortCol, direction);
  if (sortCol !== 'id') {
    query.orderBy('id', 'asc');
  }

  // Pagination
  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Number(limit) || 10);
  const offset = (numPage - 1) * numLimit;

  query.limit(numLimit).offset(offset);

  const rows = await query;
  const planIds = rows.map((r) => r.id);
  const featuresMap = await getFeaturesByPlanIds(planIds, client);

  const plans = rows.map((row) => formatPlan(row, featuresMap[row.id] || []));

  return {
    plans,
    total,
  };
};

/**
 * Insert a new subscription plan with its features inside a transaction
 * @param {Object} planData
 * @param {string[]} [features=[]]
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const createPlan = async (planData, features = [], trx) => {
  const execute = async (client) => {
    const [id] = await client('subscription_plans').insert({
      name: planData.name,
      code: planData.code,
      billing_cycle: planData.billing_cycle,
      price: planData.price,
      discount_percent: planData.discount_percent ?? 0,
      max_rooms: planData.max_rooms ?? 50,
      description: planData.description ?? '',
      badge: planData.badge ?? '',
      is_popular: Boolean(planData.is_popular),
      is_active: planData.is_active !== undefined ? Boolean(planData.is_active) : true,
      display_order: planData.display_order ?? 1,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    });

    if (Array.isArray(features) && features.length > 0) {
      const featureRows = features.map((feat) => ({
        plan_id: id,
        feature: feat,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await client('subscription_plan_features').insert(featureRows);
    }

    const row = await client('subscription_plans').where({ id }).first();
    const storedFeatures = await getFeaturesByPlanId(id, client);
    return formatPlan(row, storedFeatures);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Update an existing subscription plan and optionally synchronize features
 * @param {number|string} id
 * @param {Object} updateData
 * @param {string[]|null|undefined} features
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object>}
 */
const updatePlan = async (id, updateData, features, trx) => {
  const execute = async (client) => {
    const updateFields = {
      updated_at: new Date(),
    };

    if (updateData.name !== undefined) updateFields.name = updateData.name;
    if (updateData.code !== undefined) updateFields.code = updateData.code;
    if (updateData.billing_cycle !== undefined) updateFields.billing_cycle = updateData.billing_cycle;
    if (updateData.price !== undefined) updateFields.price = updateData.price;
    if (updateData.discount_percent !== undefined) updateFields.discount_percent = updateData.discount_percent;
    if (updateData.max_rooms !== undefined) updateFields.max_rooms = updateData.max_rooms;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.badge !== undefined) updateFields.badge = updateData.badge;
    if (updateData.is_popular !== undefined) updateFields.is_popular = Boolean(updateData.is_popular);
    if (updateData.is_active !== undefined) updateFields.is_active = Boolean(updateData.is_active);
    if (updateData.display_order !== undefined) updateFields.display_order = updateData.display_order;

    await client('subscription_plans').where({ id }).update(updateFields);

    // Synchronize features if explicitly passed (not undefined)
    if (features !== undefined && Array.isArray(features)) {
      await client('subscription_plan_features').where({ plan_id: id }).del();
      if (features.length > 0) {
        const featureRows = features.map((feat) => ({
          plan_id: id,
          feature: feat,
          created_at: new Date(),
          updated_at: new Date(),
        }));
        await client('subscription_plan_features').insert(featureRows);
      }
    }

    const row = await client('subscription_plans').where({ id }).first();
    const currentFeatures = await getFeaturesByPlanId(id, client);
    return formatPlan(row, currentFeatures);
  };

  if (trx) {
    return execute(trx);
  }
  return db.transaction(execute);
};

/**
 * Soft delete a subscription plan by setting deleted_at timestamp
 * @param {number|string} id
 * @param {import('knex').Knex.Transaction} [trx]
 * @returns {Promise<Object|null>}
 */
const softDeletePlan = async (id, trx) => {
  const client = trx || db;
  const now = new Date();

  await client('subscription_plans')
    .where({ id })
    .update({
      deleted_at: now,
      is_active: false,
      updated_at: now,
    });

  const row = await client('subscription_plans').where({ id }).first();
  const features = await getFeaturesByPlanId(id, client);
  return formatPlan(row, features);
};

const PURCHASES_TABLE = 'subscription_plan_purchases';

const formatPurchase = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    hotel_id: row.hotel_id,
    plan_id: row.plan_id,
    purchased_by: row.purchased_by || null,
    amount: Number(row.amount),
    billing_cycle: row.billing_cycle,
    payment_method: row.payment_method,
    status: row.status,
    auto_renew: Boolean(row.auto_renew),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * @param {Object} data
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const createPurchase = async (data, client = db) => {
  const now = new Date();
  const [id] = await client(PURCHASES_TABLE).insert({
    hotel_id: data.hotel_id,
    plan_id: data.plan_id,
    purchased_by: data.purchased_by || null,
    amount: data.amount,
    billing_cycle: data.billing_cycle,
    payment_method: data.payment_method || null,
    status: data.status || 'PAID',
    auto_renew: Boolean(data.auto_renew),
    starts_at: data.starts_at,
    ends_at: data.ends_at || null,
    created_at: now,
    updated_at: now,
  });

  const row = await client(PURCHASES_TABLE).where({ id }).first();
  return formatPurchase(row);
};

/**
 * Close purchases that are still running when a hotel moves onto a new plan.
 * A purchase has not expired when it has no end date or the end date is still ahead.
 * Those rows become EXPIRED and end at `endedAt`. A purchase that already ended is left as it is.
 * @param {number|string} hotelId
 * @param {Date} endedAt
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>} Rows updated
 */
const expireOpenPurchases = async (hotelId, endedAt, client = db) => {
  const at = endedAt instanceof Date ? endedAt : new Date(endedAt);
  return client(PURCHASES_TABLE)
    .where({ hotel_id: hotelId })
    .whereNot('status', 'EXPIRED')
    .andWhere(function () {
      this.whereNull('ends_at').orWhere('ends_at', '>', at);
    })
    .update({
      status: 'EXPIRED',
      ends_at: at,
      auto_renew: false,
      updated_at: at,
    });
};

/**
 * The hotel's current plan, and whether it has ever had the free trial.
 * A missing hotel returns no current plan and trial_used false.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ currentPlanId: number|null, trialUsed: boolean }>}
 */
const findHotelPlanUsage = async (hotelId, client = db) => {
  const empty = { currentPlanId: null, trialUsed: false };
  const id = Number(hotelId);
  if (!id) return empty;

  const hotel = await client('hotels')
    .where({ id })
    .whereNull('deleted_at')
    .select('subscription_plan_id')
    .first();
  if (!hotel) return empty;

  const trial = await client('subscription_plan_purchases as pp')
    .join('subscription_plans as sp', 'sp.id', 'pp.plan_id')
    .where('pp.hotel_id', id)
    .whereRaw('UPPER(sp.code) = ?', ['TRIAL'])
    .first('pp.id');

  return {
    currentPlanId: hotel.subscription_plan_id || null,
    trialUsed: Boolean(trial),
  };
};

/**
 * Latest purchase for a hotel. That row is the hotel's current subscription window.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findCurrentByHotelId = async (hotelId, client = db) => {
  const row = await client(PURCHASES_TABLE)
    .where({ hotel_id: hotelId })
    .orderBy('id', 'desc')
    .first();
  return formatPurchase(row);
};

/**
 * @param {number|string} id
 * @param {Object} updates
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const updatePurchase = async (id, updates, client = db) => {
  await client(PURCHASES_TABLE).where({ id }).update({
    ...updates,
    updated_at: new Date(),
  });
  const row = await client(PURCHASES_TABLE).where({ id }).first();
  return formatPurchase(row);
};

/**
 * Attach the latest subscription_plan_purchases row as current_purchase.
 * Selected aliases: purchase_status, purchase_starts_at, purchase_ends_at,
 * purchase_auto_renew, purchase_amount, purchase_billing_cycle.
 * @param {import('knex').Knex.QueryBuilder} query
 * @returns {import('knex').Knex.QueryBuilder}
 */
const joinCurrentPurchase = (query) =>
  query.joinRaw(`LEFT JOIN (
    SELECT pp.hotel_id,
           pp.status AS purchase_status,
           pp.starts_at AS purchase_starts_at,
           pp.ends_at AS purchase_ends_at,
           pp.auto_renew AS purchase_auto_renew,
           pp.amount AS purchase_amount,
           pp.billing_cycle AS purchase_billing_cycle
    FROM ${PURCHASES_TABLE} pp
    INNER JOIN (
      SELECT hotel_id, MAX(id) AS id
      FROM ${PURCHASES_TABLE}
      GROUP BY hotel_id
    ) latest ON latest.id = pp.id
  ) current_purchase ON current_purchase.hotel_id = hotels.id`);

module.exports = {
  formatPlan,
  getFeaturesByPlanId,
  getFeaturesByPlanIds,
  findPlanById,
  findPlanByCode,
  countPlans,
  findPlans,
  createPlan,
  updatePlan,
  softDeletePlan,
  createPurchase,
  expireOpenPurchases,
  findHotelPlanUsage,
  findCurrentByHotelId,
  updatePurchase,
  joinCurrentPurchase,
};
