/**
 * Seed: 6 Standard Subscription Plans & Features
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { DEFAULT_PLANS } = require('../../services/subscriptionPlanService');
const subscriptionPlanModel = require('../../models/subscriptionPlanModel');

exports.seed = async function(knex) {
  const count = await knex('subscription_plans').whereNull('deleted_at').count('id as count').first();
  const plans = Number(count?.count || 0) === 0
    ? DEFAULT_PLANS
    : DEFAULT_PLANS.filter((plan) => plan.code === 'TRIAL');

  for (const plan of plans) {
    const { features, ...planData } = plan;
    const existing = await knex('subscription_plans').where({ code: planData.code }).first();
    if (!existing) {
      await subscriptionPlanModel.createPlan(planData, features, knex);
    }
  }
};
