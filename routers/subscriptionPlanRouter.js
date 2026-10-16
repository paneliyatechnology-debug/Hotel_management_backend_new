/**
 * Subscription Plan Router.
 * Mounts public query endpoints and protected Super Admin CRUD routes.
 */
const express = require('express');
const subscriptionPlanController = require('../controllers/subscriptionPlanController');
const {
  createPlanValidator,
  updatePlanValidator,
  getPlanByIdValidator,
  deletePlanValidator,
  getPlansQueryValidator,
  purchasePlanValidator,
} = require('../middleware/subscriptionPlanValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, attachUserIfPresent, allowExpiredPlan, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// ==========================================
// Public Endpoints
// ==========================================

/**
 * GET /api/v1/subscription-plans
 * Query non-deleted subscription plans with optional filtering and pagination
 */
router.get('/', attachUserIfPresent, getPlansQueryValidator, validate, subscriptionPlanController.getAllPlans);

/**
 * POST /api/v1/subscription-plans/:id/purchase
 * Hotel admin buys this plan for the hotel on their token.
 * An expired or inactive plan does not block this route. A deactivated hotel still does.
 */
router.post(
  '/:id/purchase',
  allowExpiredPlan,
  authenticateUser,
  requireRole(ROLE_CODES.HOTEL_ADMIN),
  purchasePlanValidator,
  validate,
  subscriptionPlanController.purchasePlan
);

/**
 * GET /api/v1/subscription-plans/:id
 * Retrieve a single plan by ID
 */
router.get('/:id', getPlanByIdValidator, validate, subscriptionPlanController.getPlanById);

// ==========================================
// Super Admin Protected Endpoints
// ==========================================

/**
 * POST /api/v1/subscription-plans
 * Create a new subscription plan with features
 */
router.post(
  '/',
  authenticateUser,
  requireRole(ROLE_CODES.SUPER_ADMIN),
  createPlanValidator,
  validate,
  subscriptionPlanController.createPlan
);

/**
 * PUT /api/v1/subscription-plans/:id
 * Update an existing subscription plan and synchronize features
 */
router.put(
  '/:id',
  authenticateUser,
  requireRole(ROLE_CODES.SUPER_ADMIN),
  updatePlanValidator,
  validate,
  subscriptionPlanController.updatePlan
);

/**
 * DELETE /api/v1/subscription-plans/:id
 * Soft-delete a subscription plan
 */
router.delete(
  '/:id',
  authenticateUser,
  requireRole(ROLE_CODES.SUPER_ADMIN),
  deletePlanValidator,
  validate,
  subscriptionPlanController.deletePlan
);

module.exports = router;
