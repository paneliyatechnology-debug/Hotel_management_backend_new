/**
 * Subscription Plan Controller.
 * HTTP interface delegating business operations to subscriptionPlanService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const subscriptionPlanService = require('../services/subscriptionPlanService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/subscription-plans
 * Create a new subscription plan with features
 */
const createPlan = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.createSubscriptionPlan(req.body);
    return success(
      res,
      MESSAGES.PLAN_CREATED_SUCCESS,
      data,
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/subscription-plans
 * Get all non-deleted subscription plans with optional filtering & pagination
 */
const getAllPlans = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.getAllSubscriptionPlans(req.query);
    return success(
      res,
      MESSAGES.PLANS_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/subscription-plans/:id
 * Get a single subscription plan by ID with features
 */
const getPlanById = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.getSubscriptionPlanById(req.params.id);
    return success(
      res,
      MESSAGES.PLAN_RETRIEVED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/subscription-plans/:id
 * Update an existing subscription plan and synchronize its features
 */
const updatePlan = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.updateSubscriptionPlan(req.params.id, req.body);
    return success(
      res,
      MESSAGES.PLAN_UPDATED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/subscription-plans/:id
 * Soft-delete a subscription plan
 */
const deletePlan = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.deleteSubscriptionPlan(req.params.id);
    return success(
      res,
      MESSAGES.PLAN_DELETED_SUCCESS,
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/subscription-plans/reset-defaults
 * Restore standard 6 pre-configured default plans
 */
const resetDefaults = async (req, res, next) => {
  try {
    const data = await subscriptionPlanService.resetDefaultPlans();
    return success(
      res,
      'Standard 6 Subscription Plans restored successfully.',
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  resetDefaults,
};
