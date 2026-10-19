/**
 * Dashboard Service.
 * One entry point that returns the dashboard matching the caller's role:
 * SUPER_ADMIN (platform, or a specific hotel when hotel_id is sent),
 * HOTEL_ADMIN (hotel), and front-desk staff (receptionist dashboard).
 */
const dashboardModel = require('../models/dashboardModel');
const { resolveHotelId, resolveScopedHotelId } = require('../utils/hotelScope');
const { resolveDateRange, percent, money, toDateKey, getCurrentWeekDays } = require('../utils/dateRange');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

const FRONT_DESK_ROLES = [
  ROLE_CODES.RECEPTIONIST,
  ROLE_CODES.MANAGER,
  ROLE_CODES.HOUSEKEEPING,
  ROLE_CODES.ACCOUNTANT,
];

/**
 * Days left until the plan end date. Null when there is no end date. Zero when already past.
 * @param {Date|string|null} endDate
 * @param {Date} [now=new Date()]
 * @returns {number|null}
 */
const daysLeftUntil = (endDate, now = new Date()) => {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  if (Number.isNaN(end)) return null;
  const diffMs = end - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
};

/**
 * Room status graph: count and share of the hotel's rooms for every room status.
 * @param {Object} roomStatusSummary - Status to room count
 * @param {number} totalRooms
 * @returns {{ total_rooms: number, statuses: Object[] }}
 */
const buildRoomStatusGraph = (roomStatusSummary, totalRooms) => ({
  total_rooms: totalRooms,
  statuses: Object.entries(roomStatusSummary).map(([status, count]) => ({
    status,
    count,
    percentage: totalRooms > 0 ? percent((count / totalRooms) * 100) : 0,
  })),
});

/**
 * Current week revenue graph: all seven days, Monday first, 0 for a day without collections.
 * @param {Object} dailyCollections - YYYY-MM-DD to amount collected
 * @returns {{ date: string, day: string, revenue: number }[]}
 */
const buildWeeklyRevenueGraph = (dailyCollections) =>
  getCurrentWeekDays().map((day) => {
    const date = toDateKey(day);
    return {
      date,
      day: day.toLocaleDateString('en-US', { weekday: 'long' }),
      revenue: money(dailyCollections[date]),
    };
  });

/**
 * Platform dashboard for SUPER_ADMIN.
 * @param {Object} query
 * @returns {Promise<{ message: string, data: Object }>}
 */
const getSuperAdminDashboard = async (query = {}) => {
  const range = resolveDateRange(query.date_range);

  const [
    hotelCounts,
    trialHotels,
    expiredHotels,
    estimatedMrr,
    totalPlatformRooms,
    totalStaffUsers,
    bookingStats,
    planDistribution,
  ] = await Promise.all([
    dashboardModel.countHotelsByActiveState(),
    dashboardModel.countTrialHotels(),
    dashboardModel.countExpiredHotels(),
    dashboardModel.estimatePlatformMrr(),
    dashboardModel.countPlatformRooms(),
    dashboardModel.countPlatformStaff(),
    dashboardModel.sumPlatformBookingsInRange(range.from, range.to),
    dashboardModel.getPlanDistribution(),
  ]);

  return {
    message: 'Super admin dashboard retrieved successfully.',
    data: {
      kpis: {
        total_hotels: hotelCounts.total,
        active_hotels: hotelCounts.active,
        inactive_hotels: hotelCounts.inactive,
        trial_hotels: trialHotels,
        expired_hotels: expiredHotels,
        estimated_mrr: estimatedMrr,
        total_platform_rooms: totalPlatformRooms,
        total_staff_users: totalStaffUsers,
        total_bookings_this_month: bookingStats.bookings,
        total_platform_booking_volume: bookingStats.volume,
      },
      plan_distribution: planDistribution,
    },
  };
};

/**
 * Property dashboard for HOTEL_ADMIN, or SUPER_ADMIN with hotel_id.
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<{ message: string, data: Object }>}
 */
const getHotelAdminDashboard = async (query = {}, reqUser) => {
  const hotelId = resolveScopedHotelId(reqUser, query);
  const range = resolveDateRange(query.date_range);

  // The graphs are for the hotel admin only, not a super admin looking at one hotel.
  const isHotelAdmin = reqUser.role === ROLE_CODES.HOTEL_ADMIN;
  const weekDays = getCurrentWeekDays();

  const [
    hotel,
    todayRevenue,
    monthRevenue,
    totalOutstandingDue,
    totalPhysicalRooms,
    occupiedRooms,
    activeStaffCount,
    todayPulse,
    roomStatusSummary,
    revenueByPaymentMethod,
    weeklyCollections,
  ] = await Promise.all([
    dashboardModel.findHotelDashboardHeader(hotelId),
    dashboardModel.sumHotelCollectionsInRange(hotelId, range.todayFrom, range.todayTo),
    dashboardModel.sumHotelCollectionsInRange(hotelId, range.from, range.to),
    dashboardModel.sumHotelOutstandingDue(hotelId),
    dashboardModel.countHotelRooms(hotelId),
    dashboardModel.countHotelOccupiedRooms(hotelId),
    dashboardModel.countHotelActiveStaff(hotelId),
    dashboardModel.getHotelTodayPulse(hotelId, range.todayFrom, range.todayTo),
    dashboardModel.getHotelRoomStatusSummary(hotelId),
    dashboardModel.getHotelRevenueByPaymentMethod(hotelId, range.from, range.to),
    isHotelAdmin
      ? dashboardModel.getHotelDailyCollections(
          hotelId,
          weekDays[0],
          new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate() + 1)
        )
      : null,
  ]);

  if (!hotel) {
    throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
  }

  const maxRoomsAllowed = hotel.plan_max_rooms !== null && hotel.plan_max_rooms !== undefined
    ? Number(hotel.plan_max_rooms)
    : null;
  const remainingRoomSlots =
    maxRoomsAllowed !== null && !Number.isNaN(maxRoomsAllowed)
      ? Math.max(0, maxRoomsAllowed - totalPhysicalRooms)
      : null;

  return {
    message: 'Hotel admin dashboard retrieved successfully.',
    data: {
      hotel: {
        id: hotel.id,
        name: hotel.name,
        slug: hotel.slug,
        currency: hotel.currency || 'INR',
        tax_percentage: Number(hotel.tax_percentage) || 18,
        gst_enabled: Boolean(hotel.gst_enabled),
      },
      kpis: {
        today_revenue: todayRevenue,
        month_revenue: monthRevenue,
        total_outstanding_due: totalOutstandingDue,
        occupancy_rate_percentage:
          totalPhysicalRooms > 0 ? percent((occupiedRooms / totalPhysicalRooms) * 100) : 0,
        total_physical_rooms: totalPhysicalRooms,
        active_staff_count: activeStaffCount,
      },
      today_pulse: todayPulse,
      room_status_summary: roomStatusSummary,
      revenue_by_payment_method: revenueByPaymentMethod,
      ...(isHotelAdmin && {
        room_status_graph: buildRoomStatusGraph(roomStatusSummary, totalPhysicalRooms),
        weekly_revenue_graph: buildWeeklyRevenueGraph(weeklyCollections),
      }),
      subscription_quota: {
        plan_id: hotel.subscription_plan_id,
        plan_name: hotel.plan_name || null,
        max_rooms_allowed: maxRoomsAllowed,
        rooms_configured: totalPhysicalRooms,
        remaining_room_slots: remainingRoomSlots,
        plan_start_date: hotel.subscription_plan_start_date || null,
        plan_end_date: hotel.subscription_plan_end_date || null,
        days_left: daysLeftUntil(hotel.subscription_plan_end_date),
        is_active: Boolean(hotel.subscription_plan_active),
      },
    },
  };
};

/**
 * Front-desk dashboard for receptionist and other hotel staff roles.
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<{ message: string, data: Object }>}
 */
const getFrontDeskDashboard = async (query = {}, reqUser) => {
  const hotelId = resolveHotelId(reqUser);
  const range = resolveDateRange(query.date_range || 'today');

  const [shiftCollectionsToday, roomStatusSummary] = await Promise.all([
    dashboardModel.getHotelShiftCollectionsToday(hotelId, range.todayFrom, range.todayTo),
    dashboardModel.getHotelRoomStatusSummary(hotelId),
  ]);

  return {
    message: 'Front desk dashboard retrieved successfully.',
    data: {
      shift_collections_today: shiftCollectionsToday,
      room_status_summary: roomStatusSummary,
    },
  };
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day, or null when the text is not YYYY-MM-DD.
 * @param {*} value
 * @returns {Date|null}
 */
const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!DATE_ONLY_PATTERN.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const isReal = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isReal ? date : null;
};

/**
 * @param {string} value - YYYY-MM-DD
 * @returns {string} DD-MM-YYYY
 */
const toDisplayDate = (value) => {
  const [year, month, day] = String(value).split('-');
  return `${day}-${month}-${year}`;
};

/**
 * Required inclusive dates for the period summary. end is exclusive on the next midnight.
 * @param {Object} query
 * @returns {{ start: Date, end: Date, startDate: string, endDate: string }}
 */
const resolveSummaryPeriod = (query = {}) => {
  const startText = query.start_date === undefined || query.start_date === null ? '' : String(query.start_date).trim();
  const endText = query.end_date === undefined || query.end_date === null ? '' : String(query.end_date).trim();
  const errors = [];
  if (!startText) errors.push({ field: 'start_date', message: 'start_date is required.' });
  if (!endText) errors.push({ field: 'end_date', message: 'end_date is required.' });

  const start = startText ? parseDateOnly(startText) : null;
  const end = endText ? parseDateOnly(endText) : null;
  if (startText && !start) errors.push({ field: 'start_date', message: 'start_date must be a real date in YYYY-MM-DD format.' });
  if (endText && !end) errors.push({ field: 'end_date', message: 'end_date must be a real date in YYYY-MM-DD format.' });
  if (errors.length) {
    throw new AppError('Invalid dashboard summary dates.', HTTP_STATUS.BAD_REQUEST, errors);
  }
  if (start > end) {
    throw new AppError('start_date must not be after end_date.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'start_date', message: 'start_date must be on or before end_date.' },
    ]);
  }

  return {
    start,
    end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
    startDate: startText,
    endDate: endText,
  };
};

/**
 * Hotel totals for a start and end date. Does not change the role dashboard.
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<{ message: string, data: Object }>}
 */
const getDashboardSummary = async (query = {}, reqUser) => {
  if (!reqUser) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }

  const hotelId = resolveScopedHotelId(reqUser, query);
  const period = resolveSummaryPeriod(query);
  const summary = await dashboardModel.getHotelPeriodSummary(hotelId, period.start, period.end);

  return {
    message: 'Dashboard summary retrieved successfully.',
    data: {
      period_start_date: toDisplayDate(period.startDate),
      period_end_date: toDisplayDate(period.endDate),
      ...summary,
    },
  };
};

/**
 * Auto-route to the dashboard that matches the authenticated role.
 * SUPER_ADMIN with hotel_id gets the hotel-admin dashboard for that hotel.
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<{ message: string, data: Object }>}
 */
const getDashboard = async (query = {}, reqUser) => {
  if (!reqUser) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }

  if (reqUser.role === ROLE_CODES.SUPER_ADMIN) {
    if (query.hotel_id !== undefined && query.hotel_id !== null && query.hotel_id !== '') {
      return getHotelAdminDashboard(query, reqUser);
    }
    return getSuperAdminDashboard(query);
  }

  if (reqUser.role === ROLE_CODES.HOTEL_ADMIN) {
    return getHotelAdminDashboard(query, reqUser);
  }

  if (FRONT_DESK_ROLES.includes(reqUser.role)) {
    return getFrontDeskDashboard(query, reqUser);
  }

  throw new AppError(
    `Access denied. Role '${reqUser.role}' is not authorized to view the dashboard.`,
    HTTP_STATUS.FORBIDDEN
  );
};

module.exports = {
  getDashboard,
  getDashboardSummary,
};
