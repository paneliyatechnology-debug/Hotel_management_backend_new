/**
 * Subscription Plan Service.
 * Core business logic, validation enforcement, feature synchronization, and transactions.
 */
const subscriptionPlanModel = require('../models/subscriptionPlanModel');
const hotelModel = require('../models/hotelModel');
const auditService = require('./auditService');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const { scheduleHotelDashboard } = require('../sockets/roomSocket');
const { HTTP_STATUS, AUDIT_ACTIONS, AUDIT_ENTITIES, ROLE_CODES } = require('../constants');

/**
 * Catalog plans. TRIAL is assigned when a hotel is registered or created without a plan id.
 */
const DEFAULT_PLANS = [
  {
    name: 'Free Trial',
    code: 'TRIAL',
    billing_cycle: 'MONTHLY',
    price: 0,
    discount_percent: 0,
    max_rooms: 50,
    description: '30-day free trial for a newly registered hotel.',
    badge: 'FREE TRIAL',
    is_popular: false,
    is_active: true,
    display_order: 0,
    features: [
      '30-day free trial',
      'Up to 50 rooms',
      'Front desk and bookings',
    ],
  },
  {
    name: 'Starter Boutique',
    code: 'MONTHLY_STARTER',
    billing_cycle: 'MONTHLY',
    price: 4999,
    discount_percent: 0,
    max_rooms: 15,
    description: 'Perfect for boutique hotels, B&Bs, and guesthouses up to 15 rooms.',
    badge: '',
    is_popular: false,
    is_active: true,
    display_order: 1,
    features: [
      'Up to 15 Rooms Inventory',
      'Front Desk & Instant Walk-in Wizard',
      'Govt ID Compliance & Police Ledger',
      'GST Tax Invoice & Receipt Generator',
      'Standard Email Support',
    ],
  },
  {
    name: 'Professional Resort',
    code: 'MONTHLY_PRO',
    billing_cycle: 'MONTHLY',
    price: 9999,
    discount_percent: 0,
    max_rooms: 50,
    description: 'Designed for mid-size hotels, resorts, and premium service apartments.',
    badge: 'MOST POPULAR',
    is_popular: true,
    is_active: true,
    display_order: 2,
    features: [
      'Up to 50 Rooms Inventory',
      'Full PMS Matrix & Reservation Calendar',
      'Staff Shift Roster & Housekeeping App',
      'In-Room Dining POS & Food Billing',
      'Advanced Analytics & Revenue Reports',
      'Priority 24/7 Phone & Email Support',
    ],
  },
  {
    name: 'Enterprise Multi-Property',
    code: 'MONTHLY_ENTERPRISE',
    billing_cycle: 'MONTHLY',
    price: 24999,
    discount_percent: 0,
    max_rooms: 9999,
    description: 'For large hotel chains, luxury palaces, and multi-property groups.',
    badge: 'ENTERPRISE',
    is_popular: false,
    is_active: true,
    display_order: 3,
    features: [
      'Unlimited Room Inventory (Up to 9,999 Rooms)',
      'Multi-Property Central Governance Dashboard',
      'Automated SMS & WhatsApp Guest Alerts',
      'Custom API Integration & Webhooks',
      'Dedicated Account Manager & 99.9% Uptime SLA',
    ],
  },
  {
    name: 'Starter Boutique (Annual)',
    code: 'ANNUAL_STARTER',
    billing_cycle: 'ANNUAL',
    price: 49999,
    discount_percent: 17,
    max_rooms: 15,
    description: 'Boutique hotels & guesthouses on annual billing (17% savings, 2 months free).',
    badge: '',
    is_popular: false,
    is_active: true,
    display_order: 4,
    features: [
      'Up to 15 Rooms Inventory',
      'Front Desk & Instant Walk-in Wizard',
      'Govt ID Compliance & Police Ledger',
      'GST Tax Invoice & Receipt Generator',
      'Standard Email Support',
      '2 Months Free Annual Discount',
    ],
  },
  {
    name: 'Professional Resort (Annual)',
    code: 'ANNUAL_PRO',
    billing_cycle: 'ANNUAL',
    price: 99999,
    discount_percent: 17,
    max_rooms: 50,
    description: 'Mid-size hotels and luxury resorts on annual plan (17% savings, 2 months free).',
    badge: 'BEST VALUE',
    is_popular: true,
    is_active: true,
    display_order: 5,
    features: [
      'Up to 50 Rooms Inventory',
      'Full PMS Matrix & Reservation Calendar',
      'Staff Shift Roster & Housekeeping App',
      'In-Room Dining POS & Food Billing',
      'Advanced Analytics & Revenue Reports',
      'Priority 24/7 Phone & Email Support',
      '2 Months Free Annual Discount',
    ],
  },
  {
    name: 'Enterprise Multi-Property (Annual)',
    code: 'ANNUAL_ENTERPRISE',
    billing_cycle: 'ANNUAL',
    price: 249999,
    discount_percent: 17,
    max_rooms: 9999,
    description: 'Large hotel chains and luxury groups on annual enterprise contract.',
    badge: 'ENTERPRISE',
    is_popular: false,
    is_active: true,
    display_order: 6,
    features: [
      'Unlimited Room Inventory (Up to 9,999 Rooms)',
      'Multi-Property Central Governance Dashboard',
      'Automated SMS & WhatsApp Guest Alerts',
      'Custom API Integration & Webhooks',
      'Dedicated Account Manager & 99.9% Uptime SLA',
      'Free Enterprise Setup & Custom Training',
    ],
  },
];

/**
 * Clean, trim, and deduplicate feature strings
 * @param {Array<string>|string|null|undefined} features
 * @returns {string[]}
 */
const sanitizeFeatures = (features) => {
  if (!features) return [];

  let list = [];
  if (Array.isArray(features)) {
    list = features;
  } else if (typeof features === 'string') {
    list = features
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  } else {
    return [];
  }

  const seen = new Set();
  const cleaned = [];

  for (const item of list) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0 && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        cleaned.push(trimmed);
      }
    }
  }

  return cleaned;
};

/**
 * Generate a standard uppercase plan code
 * @param {string} billingCycle
 * @param {string} name
 * @returns {string}
 */
const generatePlanCode = (billingCycle, name) => {
  const cycle = (billingCycle || 'MONTHLY').trim().toUpperCase();
  const cleanName = (name || 'PLAN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${cycle}_${cleanName}`;
};

/**
 * Create a new subscription plan with features
 * @param {Object} payload
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const createSubscriptionPlan = async (payload, reqUser = null) => {
  const {
    name,
    billing_cycle,
    price,
    discount_percent = 0,
    max_rooms = 50,
    description = '',
    badge = '',
    is_popular = false,
    is_active = true,
    display_order = 1,
    features = [],
  } = payload;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Plan name is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'name', message: 'Plan name is required.' },
    ]);
  }

  const normalizedCycle = (billing_cycle || '').trim().toUpperCase();
  if (!['MONTHLY', 'ANNUAL'].includes(normalizedCycle)) {
    throw new AppError('Invalid Billing Cycle. Must be either MONTHLY or ANNUAL.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'billing_cycle', message: 'Billing cycle must be either MONTHLY or ANNUAL.' },
    ]);
  }

  const numPrice = Number(price);
  if (price === undefined || price === null || isNaN(numPrice) || numPrice < 0) {
    throw new AppError('Price must be a valid number greater than or equal to 0.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'price', message: 'Price must be a valid number greater than or equal to 0.' },
    ]);
  }

  const numDiscount = Number(discount_percent);
  if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100) {
    throw new AppError('Discount percent must be between 0 and 100.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'discount_percent', message: 'Discount percent must be between 0 and 100.' },
    ]);
  }

  const numRooms = Number(max_rooms);
  if (isNaN(numRooms) || numRooms <= 0) {
    throw new AppError('Max rooms must be a valid positive integer.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'max_rooms', message: 'Max rooms must be a valid positive integer.' },
    ]);
  }

  // Normalize code
  const code = (payload.code && payload.code.trim())
    ? payload.code.trim().toUpperCase()
    : generatePlanCode(normalizedCycle, name);

  // Check code uniqueness
  const existingCode = await subscriptionPlanModel.findPlanByCode(code, { includeDeleted: false });
  if (existingCode) {
    throw new AppError(`A subscription plan with code '${code}' already exists.`, HTTP_STATUS.CONFLICT, [
      { field: 'code', message: `Plan code '${code}' is already in use.` },
    ]);
  }

  const cleanedFeatures = sanitizeFeatures(features);

  const planData = {
    name: name.trim(),
    code,
    billing_cycle: normalizedCycle,
    price: numPrice,
    discount_percent: numDiscount,
    max_rooms: Math.floor(numRooms),
    description: (description || '').trim(),
    badge: (badge || '').trim(),
    is_popular: Boolean(is_popular),
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    display_order: Number(display_order) || 1,
  };

  const newPlan = await db.transaction(async (trx) => {
    return subscriptionPlanModel.createPlan(planData, cleanedFeatures, trx);
  });

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.CREATE,
    entityType: AUDIT_ENTITIES.SUBSCRIPTION_PLAN,
    entityId: newPlan.id,
    description: `Subscription plan '${planData.name}' (${planData.code}) created.`,
  });

  return { id: newPlan.id };
};

/**
 * Retrieve non-deleted subscription plans with filtering, sorting, and pagination
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getAllSubscriptionPlans = async (query = {}, reqUser = null) => {
  const {
    billing_cycle,
    is_active,
    is_popular,
    page = 1,
    limit = 10,
    sort_by = 'display_order',
    sort_order = 'asc',
  } = query;

  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Number(limit) || 10);

  const [{ plans, total }, usage] = await Promise.all([
    subscriptionPlanModel.findPlans({
      billing_cycle,
      is_active,
      is_popular,
      page: numPage,
      limit: numLimit,
      sort_by,
      sort_order,
      includeDeleted: false,
    }),
    subscriptionPlanModel.findHotelPlanUsage(reqUser?.hotel_id),
  ]);

  const totalPages = Math.ceil(total / numLimit) || 1;
  const markedPlans = plans.map((plan) => ({
    ...plan,
    is_current_plan: usage.currentPlanId !== null && Number(plan.id) === Number(usage.currentPlanId),
    ...(String(plan.code).toUpperCase() === 'TRIAL' ? { is_trial_used: usage.trialUsed } : {}),
  }));

  return {
    plans: markedPlans,
    is_trial_used: usage.trialUsed,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages,
      hasNextPage: numPage < totalPages,
      hasPrevPage: numPage > 1,
    },
  };
};

/**
 * Retrieve single subscription plan by ID (excluding soft-deleted)
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const getSubscriptionPlanById = async (id) => {
  const numId = Number(id);
  if (!id || isNaN(numId) || numId <= 0) {
    throw new AppError('Invalid subscription plan ID.', HTTP_STATUS.BAD_REQUEST);
  }

  const plan = await subscriptionPlanModel.findPlanById(numId, { includeDeleted: false });
  if (!plan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }

  return plan;
};

/**
 * Update plan details and synchronize features
 * @param {number|string} id
 * @param {Object} payload
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const updateSubscriptionPlan = async (id, payload, reqUser = null) => {
  const numId = Number(id);
  if (!id || isNaN(numId) || numId <= 0) {
    throw new AppError('Invalid subscription plan ID.', HTTP_STATUS.BAD_REQUEST);
  }

  const existingPlan = await subscriptionPlanModel.findPlanById(numId, { includeDeleted: false });
  if (!existingPlan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }

  const updateData = {};

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new AppError('Plan name cannot be empty.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.name = payload.name.trim();
  }

  if (payload.billing_cycle !== undefined) {
    const cycle = payload.billing_cycle.trim().toUpperCase();
    if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
      throw new AppError('Invalid Billing Cycle. Must be either MONTHLY or ANNUAL.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.billing_cycle = cycle;
  }

  if (payload.price !== undefined) {
    const numPrice = Number(payload.price);
    if (isNaN(numPrice) || numPrice < 0) {
      throw new AppError('Price must be greater than or equal to 0.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.price = numPrice;
  }

  if (payload.discount_percent !== undefined) {
    const numDiscount = Number(payload.discount_percent);
    if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100) {
      throw new AppError('Discount percent must be between 0 and 100.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.discount_percent = numDiscount;
  }

  if (payload.max_rooms !== undefined) {
    const numRooms = Number(payload.max_rooms);
    if (isNaN(numRooms) || numRooms <= 0) {
      throw new AppError('Max rooms must be a valid positive integer.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.max_rooms = Math.floor(numRooms);
  }

  if (payload.description !== undefined) {
    updateData.description = String(payload.description).trim();
  }

  if (payload.badge !== undefined) {
    updateData.badge = String(payload.badge).trim();
  }

  if (payload.is_popular !== undefined) {
    updateData.is_popular = Boolean(payload.is_popular);
  }

  if (payload.is_active !== undefined) {
    updateData.is_active = Boolean(payload.is_active);
  }

  if (payload.display_order !== undefined) {
    updateData.display_order = Number(payload.display_order) || 1;
  }

  if (payload.code !== undefined) {
    const newCode = String(payload.code).trim().toUpperCase();
    if (!newCode) {
      throw new AppError('Plan code cannot be empty.', HTTP_STATUS.BAD_REQUEST);
    }
    if (newCode !== existingPlan.code) {
      const codeTaken = await subscriptionPlanModel.findPlanByCode(newCode, { includeDeleted: false });
      if (codeTaken && codeTaken.id !== existingPlan.id) {
        throw new AppError(`A subscription plan with code '${newCode}' already exists.`, HTTP_STATUS.CONFLICT, [
          { field: 'code', message: `Plan code '${newCode}' is already in use.` },
        ]);
      }
    }
    updateData.code = newCode;
  }

  let cleanedFeatures = undefined;
  if (payload.features !== undefined) {
    cleanedFeatures = sanitizeFeatures(payload.features);
  }

  await db.transaction(async (trx) => {
    await subscriptionPlanModel.updatePlan(numId, updateData, cleanedFeatures, trx);
  });

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: AUDIT_ENTITIES.SUBSCRIPTION_PLAN,
    entityId: existingPlan.id,
    description: `Subscription plan '${existingPlan.name}' updated.`,
    changes: auditService.diffChanges(existingPlan, updateData),
  });

  return { id: existingPlan.id };
};

/**
 * Soft-delete subscription plan
 * @param {number|string} id
 * @param {Object} [reqUser=null]
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const deleteSubscriptionPlan = async (id, reqUser = null) => {
  const numId = Number(id);
  if (!id || isNaN(numId) || numId <= 0) {
    throw new AppError('Invalid subscription plan ID.', HTTP_STATUS.BAD_REQUEST);
  }

  const existingPlan = await subscriptionPlanModel.findPlanById(numId, { includeDeleted: false });
  if (!existingPlan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }

  await subscriptionPlanModel.softDeletePlan(numId);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.DELETE,
    entityType: AUDIT_ENTITIES.SUBSCRIPTION_PLAN,
    entityId: existingPlan.id,
    description: `Subscription plan '${existingPlan.name}' archived.`,
  });

  return { id: existingPlan.id };
};

const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

/**
 * End of one billing period that starts at `start`.
 * @param {Date} start
 * @param {string} billingCycle - MONTHLY or ANNUAL
 * @returns {Date}
 */
const addBillingCycle = (start, billingCycle) => {
  const end = new Date(start.getTime());
  if (String(billingCycle).toUpperCase() === 'ANNUAL') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
};

/**
 * Purchase a plan for the logged-in hotel admin's hotel and switch the hotel onto it.
 * The price, billing cycle, and end date come from the plan. The request cannot set them.
 * @param {number|string} planId
 * @param {Object} payload - { payment_method, auto_renew }
 * @param {Object} reqUser
 * @returns {Promise<Object>}
 */
const purchasePlan = async (planId, payload = {}, reqUser) => {
  if (!reqUser || reqUser.role !== ROLE_CODES.HOTEL_ADMIN) {
    throw new AppError('Only a hotel admin can purchase a plan.', HTTP_STATUS.FORBIDDEN);
  }

  const hotelId = resolveHotelId(reqUser);

  const plan = await subscriptionPlanModel.findPlanById(planId);
  if (!plan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (!plan.is_active) {
    throw new AppError('This subscription plan is not available for purchase.', HTTP_STATUS.BAD_REQUEST);
  }
  if (String(plan.code).toUpperCase() === 'TRIAL' || Number(plan.price) <= 0) {
    throw new AppError('The free trial plan cannot be purchased.', HTTP_STATUS.BAD_REQUEST);
  }

  const hotel = await hotelModel.findHotelById(hotelId);
  if (!hotel) {
    throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
  }

  const paymentMethod = String(payload.payment_method || 'CASH').trim().toUpperCase();
  const autoRenew = payload.auto_renew !== undefined ? toBoolean(payload.auto_renew) : false;
  const startsAt = new Date();
  const endsAt = addBillingCycle(startsAt, plan.billing_cycle);

  const purchase = await db.transaction(async (trx) => {
    await subscriptionPlanModel.expireOpenPurchases(hotelId, startsAt, trx);

    const created = await subscriptionPlanModel.createPurchase(
      {
        hotel_id: hotelId,
        plan_id: plan.id,
        purchased_by: reqUser.id,
        amount: plan.price,
        billing_cycle: plan.billing_cycle,
        payment_method: paymentMethod,
        auto_renew: autoRenew,
        starts_at: startsAt,
        ends_at: endsAt,
      },
      trx
    );

    const updated = await hotelModel.updateHotel(
      hotelId,
      { subscription_plan_id: plan.id },
      trx
    );

    if (!updated) {
      throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
    }

    return created;
  });

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.CREATE,
    entityType: AUDIT_ENTITIES.PLAN_PURCHASE,
    entityId: purchase.id,
    hotelId,
    description: `Hotel '${hotel.name}' purchased plan '${plan.name}'.`,
    changes: {
      subscription_plan_id: { from: hotel.subscription_plan_id, to: plan.id },
      'subscription.end_date': { from: hotel.subscription?.end_date || null, to: endsAt },
    },
  });

  scheduleHotelDashboard(hotelId);
  return {
    ...purchase,
    plan: {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      billing_cycle: plan.billing_cycle,
      price: plan.price,
      max_rooms: plan.max_rooms,
    },
  };
};

module.exports = {
  DEFAULT_PLANS,
  sanitizeFeatures,
  generatePlanCode,
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  purchasePlan,
};
