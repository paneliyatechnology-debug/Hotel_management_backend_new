/**
 * Seed: 6 Standard Subscription Plans & Features
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { DEFAULT_PLANS } = require('../../services/subscriptionPlanService');
const subscriptionPlanModel = require('../../models/subscriptionPlanModel');

exports.seed = async function(knex) {
  // Check if any subscription plans exist
  const count = await knex('subscription_plans').whereNull('deleted_at').count('id as count').first();
  if (Number(count?.count || 0) === 0) {
    for (const plan of DEFAULT_PLANS) {
      const { features, ...planData } = plan;
      // Check if plan code exists
      const existing = await knex('subscription_plans').where({ code: planData.code }).first();
      if (!existing) {
        await subscriptionPlanModel.createPlan(planData, features, knex);
      }
    }
    console.log('[Seed] 6 Standard Subscription Plans successfully seeded.');
  }
};
