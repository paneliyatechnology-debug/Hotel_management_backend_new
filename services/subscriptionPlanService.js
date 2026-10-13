/**
 * Subscription Plan Service.
 * Core business logic, validation enforcement, feature synchronization, and transactions.
 * Modeled after TradeNexa service architecture.
 */
const subscriptionPlanModel = require('../models/subscriptionPlanModel');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Standard 6 Enterprise default plans
 */
const DEFAULT_PLANS = [
  {
    name: 'Starter Boutique',
    code: 'MONTHLY_STARTER',
    billingCycle: 'MONTHLY',
    price: 4999,
    discountPercent: 0,
    maxRooms: 15,
    description: 'Perfect for boutique hotels, B&Bs, and guesthouses up to 15 rooms.',
    badge: '',
    isPopular: false,
    isActive: true,
    displayOrder: 1,
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
    billingCycle: 'MONTHLY',
    price: 9999,
    discountPercent: 0,
    maxRooms: 50,
    description: 'Designed for mid-size hotels, resorts, and premium service apartments.',
    badge: 'MOST POPULAR',
    isPopular: true,
    isActive: true,
    displayOrder: 2,
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
    billingCycle: 'MONTHLY',
    price: 24999,
    discountPercent: 0,
    maxRooms: 9999,
    description: 'For large hotel chains, luxury palaces, and multi-property groups.',
    badge: 'ENTERPRISE',
    isPopular: false,
    isActive: true,
    displayOrder: 3,
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
    billingCycle: 'ANNUAL',
    price: 49999,
    discountPercent: 17,
    maxRooms: 15,
    description: 'Boutique hotels & guesthouses on annual billing (17% savings, 2 months free).',
    badge: '',
    isPopular: false,
    isActive: true,
    displayOrder: 4,
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
    billingCycle: 'ANNUAL',
    price: 99999,
    discountPercent: 17,
    maxRooms: 50,
    description: 'Mid-size hotels and luxury resorts on annual plan (17% savings, 2 months free).',
    badge: 'BEST VALUE',
    isPopular: true,
    isActive: true,
    displayOrder: 5,
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
    billingCycle: 'ANNUAL',
    price: 249999,
    discountPercent: 17,
    maxRooms: 9999,
    description: 'Large hotel chains and luxury groups on annual enterprise contract.',
    badge: 'ENTERPRISE',
    isPopular: false,
    isActive: true,
    displayOrder: 6,
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
 * @returns {Promise<Object>}
 */
const createSubscriptionPlan = async (payload) => {
  const {
    name,
    billingCycle,
    price,
    discountPercent = 0,
    maxRooms = 50,
    description = '',
    badge = '',
    isPopular = false,
    isActive = true,
    displayOrder = 1,
    features = [],
  } = payload;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Plan name is required.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'name', message: 'Plan name is required.' },
    ]);
  }

  const normalizedCycle = (billingCycle || '').trim().toUpperCase();
  if (!['MONTHLY', 'ANNUAL'].includes(normalizedCycle)) {
    throw new AppError('Invalid Billing Cycle. Must be either MONTHLY or ANNUAL.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'billingCycle', message: 'Billing cycle must be either MONTHLY or ANNUAL.' },
    ]);
  }

  const numPrice = Number(price);
  if (price === undefined || price === null || isNaN(numPrice) || numPrice < 0) {
    throw new AppError('Price must be a valid number greater than or equal to 0.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'price', message: 'Price must be a valid number greater than or equal to 0.' },
    ]);
  }

  const numDiscount = Number(discountPercent);
  if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100) {
    throw new AppError('Discount percent must be between 0 and 100.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'discountPercent', message: 'Discount percent must be between 0 and 100.' },
    ]);
  }

  const numRooms = Number(maxRooms);
  if (isNaN(numRooms) || numRooms <= 0) {
    throw new AppError('Max rooms must be a valid positive integer.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'maxRooms', message: 'Max rooms must be a valid positive integer.' },
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
    billingCycle: normalizedCycle,
    price: numPrice,
    discountPercent: numDiscount,
    maxRooms: Math.floor(numRooms),
    description: (description || '').trim(),
    badge: (badge || '').trim(),
    isPopular: Boolean(isPopular),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    displayOrder: Number(displayOrder) || 1,
  };

  return db.transaction(async (trx) => {
    return subscriptionPlanModel.createPlan(planData, cleanedFeatures, trx);
  });
};

/**
 * Retrieve non-deleted subscription plans with filtering, sorting, and pagination
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getAllSubscriptionPlans = async (query = {}) => {
  const {
    billingCycle,
    isActive,
    isPopular,
    page = 1,
    limit = 10,
    sortBy = 'display_order',
    sortOrder = 'asc',
  } = query;

  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Number(limit) || 10);

  const { plans, total } = await subscriptionPlanModel.findPlans({
    billingCycle,
    isActive,
    isPopular,
    page: numPage,
    limit: numLimit,
    sortBy,
    sortOrder,
    includeDeleted: false,
  });

  const totalPages = Math.ceil(total / numLimit) || 1;

  return {
    plans,
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
 * @returns {Promise<Object>}
 */
const updateSubscriptionPlan = async (id, payload) => {
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

  if (payload.billingCycle !== undefined) {
    const cycle = payload.billingCycle.trim().toUpperCase();
    if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
      throw new AppError('Invalid Billing Cycle. Must be either MONTHLY or ANNUAL.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.billingCycle = cycle;
  }

  if (payload.price !== undefined) {
    const numPrice = Number(payload.price);
    if (isNaN(numPrice) || numPrice < 0) {
      throw new AppError('Price must be greater than or equal to 0.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.price = numPrice;
  }

  if (payload.discountPercent !== undefined) {
    const numDiscount = Number(payload.discountPercent);
    if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100) {
      throw new AppError('Discount percent must be between 0 and 100.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.discountPercent = numDiscount;
  }

  if (payload.maxRooms !== undefined) {
    const numRooms = Number(payload.maxRooms);
    if (isNaN(numRooms) || numRooms <= 0) {
      throw new AppError('Max rooms must be a valid positive integer.', HTTP_STATUS.BAD_REQUEST);
    }
    updateData.maxRooms = Math.floor(numRooms);
  }

  if (payload.description !== undefined) {
    updateData.description = String(payload.description).trim();
  }

  if (payload.badge !== undefined) {
    updateData.badge = String(payload.badge).trim();
  }

  if (payload.isPopular !== undefined) {
    updateData.isPopular = Boolean(payload.isPopular);
  }

  if (payload.isActive !== undefined) {
    updateData.isActive = Boolean(payload.isActive);
  }

  if (payload.displayOrder !== undefined) {
    updateData.displayOrder = Number(payload.displayOrder) || 1;
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

  return db.transaction(async (trx) => {
    return subscriptionPlanModel.updatePlan(numId, updateData, cleanedFeatures, trx);
  });
};

/**
 * Soft-delete subscription plan
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const deleteSubscriptionPlan = async (id) => {
  const numId = Number(id);
  if (!id || isNaN(numId) || numId <= 0) {
    throw new AppError('Invalid subscription plan ID.', HTTP_STATUS.BAD_REQUEST);
  }

  const existingPlan = await subscriptionPlanModel.findPlanById(numId, { includeDeleted: false });
  if (!existingPlan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }

  await subscriptionPlanModel.softDeletePlan(numId);

  return {
    id: existingPlan.id,
    name: existingPlan.name,
    code: existingPlan.code,
    isActive: false,
    isDeleted: true,
    deletedAt: new Date(),
  };
};

/**
 * Reset and provision standard 6 enterprise default plans
 * @returns {Promise<Object[]>}
 */
const resetDefaultPlans = async () => {
  return db.transaction(async (trx) => {
    // 1. Soft delete all active plans
    await trx('subscription_plans')
      .whereNull('deleted_at')
      .update({
        deleted_at: new Date(),
        is_active: false,
        updated_at: new Date(),
      });

    // 2. Insert fresh default plans
    const createdPlans = [];
    for (const plan of DEFAULT_PLANS) {
      const { features, ...planData } = plan;
      // Ensure unique code in table by generating or reusing
      const created = await subscriptionPlanModel.createPlan(
        {
          ...planData,
          code: planData.code,
        },
        features,
        trx
      );
      createdPlans.push(created);
    }

    return createdPlans;
  });
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
  resetDefaultPlans,
};
