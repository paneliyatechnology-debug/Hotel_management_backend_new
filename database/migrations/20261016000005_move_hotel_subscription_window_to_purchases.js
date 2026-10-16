/**
 * The hotel keeps only subscription_plan_id.
 * Active flag, start, end, and auto_renew move to the current subscription_plan_purchases row.
 * Hotels that already have a plan and no purchase get one row copied from those columns.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw('ALTER TABLE subscription_plan_purchases MODIFY ends_at TIMESTAMP NULL');
  await knex.raw('ALTER TABLE subscription_plan_purchases MODIFY payment_method VARCHAR(20) NULL');

  const hasActive = await knex.schema.hasColumn('hotels', 'subscription_plan_active');
  if (hasActive) {
    await knex.raw(`
      INSERT INTO subscription_plan_purchases (
        hotel_id, plan_id, purchased_by, amount, billing_cycle, payment_method,
        status, auto_renew, starts_at, ends_at, created_at, updated_at
      )
      SELECT
        h.id,
        h.subscription_plan_id,
        NULL,
        COALESCE(p.price, 0),
        COALESCE(p.billing_cycle, 'MONTHLY'),
        NULL,
        CASE WHEN h.subscription_plan_active = 1 THEN 'PAID' ELSE 'INACTIVE' END,
        COALESCE(h.auto_renew, 0),
        COALESCE(h.subscription_plan_start_date, h.created_at, NOW()),
        h.subscription_plan_end_date,
        NOW(),
        NOW()
      FROM hotels h
      LEFT JOIN subscription_plans p ON p.id = h.subscription_plan_id
      WHERE h.subscription_plan_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM subscription_plan_purchases existing WHERE existing.hotel_id = h.id
        )
    `);
  }

  const dropColumns = [
    'subscription_plan_active',
    'subscription_plan_start_date',
    'subscription_plan_end_date',
    'auto_renew',
  ];
  for (const column of dropColumns) {
    if (await knex.schema.hasColumn('hotels', column)) {
      await knex.schema.alterTable('hotels', (table) => {
        table.dropColumn(column);
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('hotels', (table) => {
    table.boolean('subscription_plan_active').defaultTo(true);
    table.timestamp('subscription_plan_start_date').nullable();
    table.timestamp('subscription_plan_end_date').nullable();
    table.boolean('auto_renew').defaultTo(false);
  });

  await knex.raw(`
    UPDATE hotels h
    INNER JOIN (
      SELECT pp.hotel_id, pp.status, pp.starts_at, pp.ends_at, pp.auto_renew
      FROM subscription_plan_purchases pp
      INNER JOIN (
        SELECT hotel_id, MAX(id) AS id FROM subscription_plan_purchases GROUP BY hotel_id
      ) latest ON latest.id = pp.id
    ) current_purchase ON current_purchase.hotel_id = h.id
    SET
      h.subscription_plan_active = CASE WHEN current_purchase.status = 'PAID' THEN 1 ELSE 0 END,
      h.subscription_plan_start_date = current_purchase.starts_at,
      h.subscription_plan_end_date = current_purchase.ends_at,
      h.auto_renew = current_purchase.auto_renew
  `);
};
