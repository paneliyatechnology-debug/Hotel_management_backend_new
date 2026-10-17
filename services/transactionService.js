/**
 * Transaction list.
 * One hotel's booking payments, filtered on created_at when dates are sent.
 */
const bookingPaymentModel = require('../models/bookingPaymentModel');
const { resolveScopedHotelId } = require('../utils/hotelScope');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

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
 * Inclusive calendar dates become a half-open window on created_at.
 * Either date may be omitted. Both must be real dates, and the start cannot be after the end.
 * @param {Object} query
 * @returns {{ start: Date|null, end: Date|null }}
 */
const resolveCreatedAtWindow = (query = {}) => {
  const start = query.start_date ? parseDateOnly(query.start_date) : null;
  const end = query.end_date ? parseDateOnly(query.end_date) : null;
  const errors = [];

  if (query.start_date && !start) {
    errors.push({ field: 'start_date', message: 'start_date must be a real date in YYYY-MM-DD format.' });
  }
  if (query.end_date && !end) {
    errors.push({ field: 'end_date', message: 'end_date must be a real date in YYYY-MM-DD format.' });
  }
  if (errors.length) {
    throw new AppError('Invalid transaction dates.', HTTP_STATUS.BAD_REQUEST, errors);
  }
  if (start && end && start > end) {
    throw new AppError('start_date must not be after end_date.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'start_date', message: 'start_date must be on or before end_date.' },
    ]);
  }

  const endExclusive = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) : null;
  return { start, end: endExclusive };
};

/**
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<Object>}
 */
const getTransactions = async (query = {}, reqUser) => {
  const hotelId = resolveScopedHotelId(reqUser, query);
  const { start, end } = resolveCreatedAtWindow(query);

  return bookingPaymentModel.findTransactions({
    hotel_id: hotelId,
    booking_id: query.booking_id || null,
    payment_method: query.payment_method ? String(query.payment_method).trim().toUpperCase() : null,
    status: query.status ? String(query.status).trim().toUpperCase() : null,
    source: query.source ? String(query.source).trim().toUpperCase() : null,
    search: query.search ? String(query.search).trim() : null,
    start,
    end,
    sort_by: query.sort_by ? String(query.sort_by).trim().toLowerCase() : 'created_at',
    sort_order: query.sort_order ? String(query.sort_order).trim().toLowerCase() : 'desc',
  }, {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
  });
};

module.exports = {
  getTransactions,
};
