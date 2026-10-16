/**
 * Add the Free Trial plan (code TRIAL).
 * Hotel register and create assign this plan when no subscription_plan_id is sent.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const TRIAL_FEATURES = [
  '30-day free trial',
  'Up to 50 rooms',
  'Front desk and bookings',
];

exports.up = async function (knex) {
  const existing = await knex('subscription_plans').where({ code: 'TRIAL' }).first();
  if (existing) return;

  const now = new Date();
  const [planId] = await knex('subscription_plans').insert({
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
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });

  await knex('subscription_plan_features').insert(
    TRIAL_FEATURES.map((feature) => ({
      plan_id: planId,
      feature,
      created_at: now,
      updated_at: now,
    }))
  );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const plan = await knex('subscription_plans')
    .where({ code: 'TRIAL', name: 'Free Trial' })
    .first();
  if (!plan) return;

  await knex('subscription_plan_features').where({ plan_id: plan.id }).del();
  await knex('subscription_plans').where({ id: plan.id }).del();
};
