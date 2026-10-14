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
    billingCycle: row.billing_cycle,
    price: Number(row.price),
    discountPercent: Number(row.discount_percent),
    maxRooms: Number(row.max_rooms),
    description: row.description || '',
    badge: row.badge || '',
    isPopular: Boolean(row.is_popular),
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order),
    features: Array.isArray(features) ? features : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
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
  const { billingCycle, isActive, isPopular, includeDeleted = false } = filters;

  if (!includeDeleted) {
    query.whereNull('deleted_at');
  }

  if (billingCycle) {
    query.whereRaw('UPPER(billing_cycle) = ?', [billingCycle.trim().toUpperCase()]);
  }

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    const activeBool = isActive === true || isActive === 'true' || isActive === 1 || isActive === '1';
    query.where('is_active', activeBool);
  }

  if (isPopular !== undefined && isPopular !== null && isPopular !== '') {
    const popularBool = isPopular === true || isPopular === 'true' || isPopular === 1 || isPopular === '1';
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
    billingCycle,
    isActive,
    isPopular,
    includeDeleted = false,
    page = 1,
    limit = 10,
    sortBy = 'display_order',
    sortOrder = 'asc',
  } = options;

  const total = await countPlans({ billingCycle, isActive, isPopular, includeDeleted }, client);

  let query = client('subscription_plans');
  applyFilters(query, { billingCycle, isActive, isPopular, includeDeleted });

  // Map sort keys
  const validSortColumns = {
    displayOrder: 'display_order',
    display_order: 'display_order',
    price: 'price',
    name: 'name',
    createdAt: 'created_at',
    created_at: 'created_at',
    updatedAt: 'updated_at',
    updated_at: 'updated_at',
  };
  const sortCol = validSortColumns[sortBy] || 'display_order';
  const direction = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';

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
      billing_cycle: planData.billingCycle,
      price: planData.price,
      discount_percent: planData.discountPercent ?? 0,
      max_rooms: planData.maxRooms ?? 50,
      description: planData.description ?? '',
      badge: planData.badge ?? '',
      is_popular: Boolean(planData.isPopular),
      is_active: planData.isActive !== undefined ? Boolean(planData.isActive) : true,
      display_order: planData.displayOrder ?? 1,
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
    if (updateData.billingCycle !== undefined) updateFields.billing_cycle = updateData.billingCycle;
    if (updateData.price !== undefined) updateFields.price = updateData.price;
    if (updateData.discountPercent !== undefined) updateFields.discount_percent = updateData.discountPercent;
    if (updateData.maxRooms !== undefined) updateFields.max_rooms = updateData.maxRooms;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.badge !== undefined) updateFields.badge = updateData.badge;
    if (updateData.isPopular !== undefined) updateFields.is_popular = Boolean(updateData.isPopular);
    if (updateData.isActive !== undefined) updateFields.is_active = Boolean(updateData.isActive);
    if (updateData.displayOrder !== undefined) updateFields.display_order = updateData.displayOrder;

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
};
