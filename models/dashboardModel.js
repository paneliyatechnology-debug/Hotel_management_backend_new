/**
 * Dashboard aggregation queries.
 * Read-only Knex helpers used by dashboardService. Soft-deleted rows are excluded.
 */
const db = require('../database/knex');
const { joinCurrentPurchase } = require('./subscriptionPlanModel');
const { money, toDateKey } = require('../utils/dateRange');
const {
  ROLE_CODES,
  ROOM_STATUSES,
  PAYMENT_METHODS,
} = require('../constants');

const COLLECTED_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_PAID'];

/**
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {string} column
 * @param {Date} from
 * @param {Date} to
 */
const whereBetweenDates = (qb, column, from, to) => {
  qb.where(column, '>=', from).where(column, '<', to);
};

/**
 * @param {*} value
 * @returns {number}
 */
const asCount = (value) => Number(value || 0);

/**
 * Monthly equivalent of one purchase. ANNUAL (and older YEARLY) prices are divided by 12.
 * @param {*} amount
 * @param {*} billingCycle
 * @returns {number}
 */
const monthlyFromPurchase = (amount, billingCycle) => {
  const price = Number(amount) || 0;
  const cycle = String(billingCycle || '').toUpperCase();
  if (cycle === 'ANNUAL' || cycle === 'YEARLY') return price / 12;
  return price;
};

/**
 * Current purchase is PAID and has not ended. A null end date never expires.
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {Date} now
 */
const wherePurchaseCoversNow = (qb, now) => {
  qb.where('current_purchase.purchase_status', 'PAID').andWhere(function () {
    this.whereNull('current_purchase.purchase_ends_at').orWhere(
      'current_purchase.purchase_ends_at',
      '>=',
      now
    );
  });
};

/**
 * Empty room-status map with every known status set to 0.
 * @returns {Object}
 */
const emptyRoomStatusSummary = () =>
  ROOM_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

/**
 * Empty payment-method map with every known method set to 0.
 * @returns {Object}
 */
const emptyPaymentMethodSummary = () =>
  PAYMENT_METHODS.reduce((acc, method) => {
    acc[method] = 0;
    return acc;
  }, {});

/**
 * Hotels still on the platform (not soft-deleted).
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ total: number, active: number, inactive: number }>}
 */
const countHotelsByActiveState = async (client = db) => {
  const rows = await client('hotels')
    .whereNull('deleted_at')
    .select('is_active')
    .count('id as total')
    .groupBy('is_active');

  let active = 0;
  let inactive = 0;
  rows.forEach((row) => {
    const total = asCount(row.total);
    if (Boolean(row.is_active)) active += total;
    else inactive += total;
  });

  return { total: active + inactive, active, inactive };
};

/**
 * Hotels on the free trial plan that are still within their trial window.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countTrialHotels = async (client = db) => {
  const now = new Date();
  const row = await joinCurrentPurchase(
    client('hotels').leftJoin('subscription_plans', 'hotels.subscription_plan_id', 'subscription_plans.id')
  )
    .whereNull('hotels.deleted_at')
    .whereRaw('UPPER(subscription_plans.code) = ?', ['TRIAL'])
    .modify((qb) => wherePurchaseCoversNow(qb, now))
    .count('hotels.id as total')
    .first();

  return asCount(row?.total);
};

/**
 * Hotels whose plan is switched off or past its end date.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countExpiredHotels = async (client = db) => {
  const now = new Date();
  const row = await joinCurrentPurchase(client('hotels'))
    .whereNull('hotels.deleted_at')
    .whereNotNull('hotels.subscription_plan_id')
    .andWhere(function () {
      this.whereNull('current_purchase.purchase_status')
        .orWhere('current_purchase.purchase_status', '!=', 'PAID')
        .orWhere('current_purchase.purchase_ends_at', '<', now);
    })
    .count('hotels.id as total')
    .first();

  return asCount(row?.total);
};

/**
 * Estimated monthly recurring revenue from active hotels whose current purchase is paid and unexpired.
 * Uses the amount stored on that purchase. ANNUAL prices are divided by 12.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const estimatePlatformMrr = async (client = db) => {
  const now = new Date();
  const rows = await joinCurrentPurchase(client('hotels'))
    .whereNull('hotels.deleted_at')
    .where('hotels.is_active', true)
    .modify((qb) => wherePurchaseCoversNow(qb, now))
    .select('current_purchase.purchase_amount', 'current_purchase.purchase_billing_cycle');

  const mrr = rows.reduce(
    (sum, row) => sum + monthlyFromPurchase(row.purchase_amount, row.purchase_billing_cycle),
    0
  );

  return money(mrr);
};

/**
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countPlatformRooms = async (client = db) => {
  const row = await client('rooms').whereNull('deleted_at').count('id as total').first();
  return asCount(row?.total);
};

/**
 * Staff accounts across the platform.
 * Hotel admins and super admins are not staff.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countPlatformStaff = async (client = db) => {
  const row = await client('users')
    .whereNull('deleted_at')
    .whereNotIn('role', [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.HOTEL_ADMIN])
    .count('id as total')
    .first();

  return asCount(row?.total);
};

/**
 * @param {Date} from
 * @param {Date} to
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ bookings: number, volume: number }>}
 */
const sumPlatformBookingsInRange = async (from, to, client = db) => {
  const row = await client('bookings')
    .whereNull('deleted_at')
    .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
    .count('id as bookings')
    .sum('total_amount as volume')
    .first();

  return {
    bookings: asCount(row?.bookings),
    volume: money(row?.volume),
  };
};

/**
 * Active hotels per plan. Monthly revenue is the sum of their current purchase amounts.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object[]>}
 */
const getPlanDistribution = async (client = db) => {
  const now = new Date();
  const [plans, hotelCounts] = await Promise.all([
    client('subscription_plans')
      .whereNull('deleted_at')
      .where('is_active', true)
      .orderBy('display_order', 'asc')
      .orderBy('id', 'asc')
      .select('id', 'name'),
    joinCurrentPurchase(client('hotels'))
      .whereNull('hotels.deleted_at')
      .where('hotels.is_active', true)
      .whereNotNull('hotels.subscription_plan_id')
      .modify((qb) => wherePurchaseCoversNow(qb, now))
      .select(
        'hotels.subscription_plan_id',
        'current_purchase.purchase_amount',
        'current_purchase.purchase_billing_cycle'
      ),
  ]);

  const statsByPlan = hotelCounts.reduce((acc, row) => {
    const planId = row.subscription_plan_id;
    if (!acc[planId]) acc[planId] = { count: 0, monthly: 0 };
    acc[planId].count += 1;
    acc[planId].monthly += monthlyFromPurchase(row.purchase_amount, row.purchase_billing_cycle);
    return acc;
  }, {});

  return plans.map((plan) => {
    const stats = statsByPlan[plan.id] || { count: 0, monthly: 0 };

    return {
      plan_id: plan.id,
      plan_name: plan.name,
      active_hotels_count: stats.count,
      monthly_revenue: money(stats.monthly),
    };
  });
};

/**
 * Hotel header fields for the hotel-admin dashboard.
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findHotelDashboardHeader = async (hotelId, client = db) => {
  const row = await joinCurrentPurchase(
    client('hotels').leftJoin('subscription_plans', 'hotels.subscription_plan_id', 'subscription_plans.id')
  )
    .where('hotels.id', hotelId)
    .whereNull('hotels.deleted_at')
    .select(
      'hotels.id',
      'hotels.name',
      'hotels.slug',
      'hotels.currency',
      'hotels.tax_percentage',
      'hotels.gst_enabled',
      'hotels.subscription_plan_id',
      'current_purchase.purchase_status',
      'current_purchase.purchase_starts_at',
      'current_purchase.purchase_ends_at',
      'subscription_plans.name as plan_name',
      'subscription_plans.max_rooms as plan_max_rooms'
    )
    .first();

  if (!row) return null;
  const hasPlan = row.subscription_plan_id !== null && row.subscription_plan_id !== undefined;
  const paid = String(row.purchase_status || '').toUpperCase() === 'PAID';
  const endsAt = row.purchase_ends_at ? new Date(row.purchase_ends_at) : null;
  const ended = Boolean(endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now());
  return {
    ...row,
    subscription_plan_active: hasPlan ? paid && !ended : true,
    subscription_plan_start_date: row.purchase_starts_at || null,
    subscription_plan_end_date: row.purchase_ends_at || null,
  };
};

/**
 * Collected payment total for a hotel between from and to.
 * @param {number} hotelId
 * @param {Date} from
 * @param {Date} to
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const sumHotelCollectionsInRange = async (hotelId, from, to, client = db) => {
  const row = await client('booking_payments')
    .where({ hotel_id: hotelId })
    .whereIn('status', COLLECTED_PAYMENT_STATUSES)
    .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
    .sum('amount as total')
    .first();

  return money(row?.total);
};

/**
 * Outstanding balance across open bookings for a hotel.
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const sumHotelOutstandingDue = async (hotelId, client = db) => {
  const row = await client('bookings')
    .where({ hotel_id: hotelId })
    .whereNull('deleted_at')
    .whereNotIn('booking_status', ['CANCELLED', 'NO_SHOW'])
    .where('due_amount', '>', 0)
    .sum('due_amount as total')
    .first();

  return money(row?.total);
};

/**
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countHotelRooms = async (hotelId, client = db) => {
  const row = await client('rooms')
    .where({ hotel_id: hotelId })
    .whereNull('deleted_at')
    .count('id as total')
    .first();

  return asCount(row?.total);
};

/**
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countHotelOccupiedRooms = async (hotelId, client = db) => {
  const row = await client('rooms')
    .where({ hotel_id: hotelId, status: 'OCCUPIED' })
    .whereNull('deleted_at')
    .count('id as total')
    .first();

  return asCount(row?.total);
};

/**
 * Active staff of a hotel.
 * Hotel admins and super admins are not counted.
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>}
 */
const countHotelActiveStaff = async (hotelId, client = db) => {
  const row = await client('users')
    .where({ hotel_id: hotelId, is_active: true })
    .whereNull('deleted_at')
    .whereNotIn('role', [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.HOTEL_ADMIN])
    .count('id as total')
    .first();

  return asCount(row?.total);
};

/**
 * Room counts by status for a hotel.
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getHotelRoomStatusSummary = async (hotelId, client = db) => {
  const summary = emptyRoomStatusSummary();
  const rows = await client('rooms')
    .where({ hotel_id: hotelId })
    .whereNull('deleted_at')
    .select('status')
    .count('id as total')
    .groupBy('status');

  rows.forEach((row) => {
    const status = String(row.status || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] = asCount(row.total);
    }
  });

  return summary;
};

/**
 * Collected payments of a hotel in a date window, added up per local calendar day.
 * Days are bucketed in the server's local time, the same clock the date ranges use.
 * @param {number} hotelId
 * @param {Date} from
 * @param {Date} to
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>} Map of YYYY-MM-DD to the amount collected that day
 */
const getHotelDailyCollections = async (hotelId, from, to, client = db) => {
  const rows = await client('booking_payments')
    .where({ hotel_id: hotelId })
    .whereIn('status', COLLECTED_PAYMENT_STATUSES)
    .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
    .select('created_at', 'amount');

  return rows.reduce((totals, row) => {
    const key = toDateKey(row.created_at);
    totals[key] = (totals[key] || 0) + (Number(row.amount) || 0);
    return totals;
  }, {});
};

/**
 * Collections grouped by payment method for a hotel in a date window.
 * @param {number} hotelId
 * @param {Date} from
 * @param {Date} to
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getHotelRevenueByPaymentMethod = async (hotelId, from, to, client = db) => {
  const summary = emptyPaymentMethodSummary();
  const rows = await client('booking_payments')
    .where({ hotel_id: hotelId })
    .whereIn('status', COLLECTED_PAYMENT_STATUSES)
    .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
    .select('payment_method')
    .sum('amount as total')
    .groupBy('payment_method');

  rows.forEach((row) => {
    const method = String(row.payment_method || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(summary, method)) {
      summary[method] = money(row.total);
    }
  });

  return summary;
};

/**
 * Today's front-desk pulse for a hotel.
 * @param {number} hotelId
 * @param {Date} todayFrom
 * @param {Date} todayTo
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getHotelTodayPulse = async (hotelId, todayFrom, todayTo, client = db) => {
  const [checkedIn, checkedOut, inHouse] = await Promise.all([
    client('bookings')
      .where({ hotel_id: hotelId })
      .whereNull('deleted_at')
      .modify((qb) => whereBetweenDates(qb, 'actual_check_in', todayFrom, todayTo))
      .count('id as total')
      .first(),
    client('bookings')
      .where({ hotel_id: hotelId })
      .whereNull('deleted_at')
      .modify((qb) => whereBetweenDates(qb, 'actual_check_out', todayFrom, todayTo))
      .count('id as total')
      .first(),
    client('bookings')
      .where({ hotel_id: hotelId, booking_status: 'CHECKED_IN' })
      .whereNull('deleted_at')
      .select(client.raw('COALESCE(SUM(adults + children), 0) as total'))
      .first(),
  ]);

  return {
    actual_checked_in_today: asCount(checkedIn?.total),
    actual_checked_out_today: asCount(checkedOut?.total),
    current_in_house_guests: asCount(inHouse?.total),
  };
};

/**
 * Shift collections for today, broken down by payment method.
 * @param {number} hotelId
 * @param {Date} todayFrom
 * @param {Date} todayTo
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getHotelShiftCollectionsToday = async (hotelId, todayFrom, todayTo, client = db) => {
  const byMethod = await getHotelRevenueByPaymentMethod(hotelId, todayFrom, todayTo, client);

  return {
    cash_collected: byMethod.CASH,
    upi_collected: byMethod.UPI,
    card_collected: byMethod.CARD,
    online_collected: byMethod.ONLINE,
    total_shift_collected: money(
      byMethod.CASH + byMethod.UPI + byMethod.CARD + byMethod.ONLINE + byMethod.BANK_TRANSFER
    ),
  };
};

/**
 * Bookings created in the window, plus money collected in the same window.
 * Collection uses booking_payments.created_at. The booking figures use bookings.created_at.
 * @param {number} hotelId
 * @param {Date} from
 * @param {Date} to
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getHotelPeriodSummary = async (hotelId, from, to, client = db) => {
  const [bookings, collection, byMethod] = await Promise.all([
    client('bookings')
      .where({ hotel_id: hotelId })
      .whereNull('deleted_at')
      .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
      .select(
        client.raw('COUNT(id) as total_bookings'),
        client.raw('COALESCE(SUM(adults + children), 0) as total_guests'),
        client.raw('COALESCE(SUM(total_amount), 0) as total_booking_amount'),
        client.raw('COALESCE(SUM(due_amount), 0) as total_due_amount'),
        client.raw('COALESCE(SUM(discount_amount), 0) as total_discount_amount'),
        client.raw('COALESCE(SUM(extra_charges_total), 0) as total_extra_charges_amount'),
        client.raw('COALESCE(SUM(late_checkout_charge), 0) as total_late_checkout_charges_amount')
      )
      .first(),
    client('booking_payments')
      .where({ hotel_id: hotelId })
      .whereIn('status', COLLECTED_PAYMENT_STATUSES)
      .modify((qb) => whereBetweenDates(qb, 'created_at', from, to))
      .sum('amount as total')
      .first(),
    getHotelRevenueByPaymentMethod(hotelId, from, to, client),
  ]);

  return {
    total_collected_amount: money(collection?.total),
    collection_by_payment_method: {
      cash_collected_amount: byMethod.CASH,
      online_collected_amount: byMethod.ONLINE,
      card_collected_amount: byMethod.CARD,
      upi_collected_amount: byMethod.UPI,
      bank_transfer_collected_amount: byMethod.BANK_TRANSFER,
    },
    total_outstanding_amount: money(bookings?.total_due_amount),
    total_booking_count: asCount(bookings?.total_bookings),
    total_guest_count: asCount(bookings?.total_guests),
    total_booking_amount: money(bookings?.total_booking_amount),
    total_discount_amount: money(bookings?.total_discount_amount),
    total_extra_charges_amount: money(bookings?.total_extra_charges_amount),
    total_late_checkout_charges_amount: money(bookings?.total_late_checkout_charges_amount),
  };
};

module.exports = {
  countHotelsByActiveState,
  countTrialHotels,
  countExpiredHotels,
  estimatePlatformMrr,
  countPlatformRooms,
  countPlatformStaff,
  sumPlatformBookingsInRange,
  getPlanDistribution,
  findHotelDashboardHeader,
  sumHotelCollectionsInRange,
  sumHotelOutstandingDue,
  countHotelRooms,
  countHotelOccupiedRooms,
  countHotelActiveStaff,
  getHotelRoomStatusSummary,
  getHotelRevenueByPaymentMethod,
  getHotelDailyCollections,
  getHotelTodayPulse,
  getHotelShiftCollectionsToday,
  getHotelPeriodSummary,
};
