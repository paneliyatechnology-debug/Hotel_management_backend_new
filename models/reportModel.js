/**
 * GST report queries.
 *
 * There is no invoice table. One booking is one invoice, dated by its check-out. Room rent, extra charges and the
 * late check-out charge are already inside the taxable amount and the GST stored on the booking, so each invoice
 * is one line. Tax is never recalculated here.
 *
 * Rooms and payments are read with a lookup per invoice, so a multi-room stay or a stay with many payments is
 * counted once. Every value reaches the SQL as a bound parameter. The only text put into the SQL is fixed here.
 */
const db = require('../database/knex');
const { money } = require('../utils/dateRange');

const MONEY_FIELDS = [
  'invoice_total',
  'gross_amount',
  'discount_amount',
  'taxable_amount',
  'gst_rate',
  'cgst_amount',
  'sgst_amount',
  'igst_amount',
  'gst_total',
  'refunded_amount',
  'credit_taxable_value',
  'credit_cgst_amount',
  'credit_sgst_amount',
  'credit_igst_amount',
];

const TOTAL_FIELDS = [
  'gross_amount',
  'discount_amount',
  'total_taxable_value',
  'total_cgst',
  'total_sgst',
  'total_igst',
  'total_gst',
  'total_invoice_value',
  'total_stored_invoice',
  'credit_note_taxable_value',
  'credit_note_cgst',
  'credit_note_sgst',
  'credit_note_igst',
  'credit_note_total',
  'net_taxable_value',
  'net_gst',
  'refunded_amount',
];

const PERIOD_SQL = `
  b.hotel_id = ?
  AND b.deleted_at IS NULL
  AND (
    (b.actual_check_out >= ? AND b.actual_check_out < ?)
    OR (b.actual_check_out IS NULL AND b.check_out_date >= ? AND b.check_out_date < ?)
  )`;

// Fixed fragments only. The request value is matched against this map and never copied into the SQL.
const INVOICE_STATUS_SQL = {
  CANCELLED: "b.booking_status IN ('CANCELLED', 'NO_SHOW')",
  FINAL: "b.booking_status = 'CHECKED_OUT'",
  PROVISIONAL: "b.booking_status NOT IN ('CANCELLED', 'NO_SHOW', 'CHECKED_OUT')",
};

/**
 * @returns {Object}
 */
const emptyTotals = () => {
  const totals = { total_invoices: 0, credit_note_count: 0, line_count: 0 };
  TOTAL_FIELDS.forEach((field) => {
    totals[field] = 0;
  });
  return totals;
};

/**
 * @param {Object} row
 * @returns {Object}
 */
const toTotals = (row = {}) => {
  const totals = {
    total_invoices: Number(row.total_invoices) || 0,
    credit_note_count: Number(row.credit_note_count) || 0,
    line_count: Number(row.line_count) || 0,
  };
  TOTAL_FIELDS.forEach((field) => {
    totals[field] = money(row[field]);
  });
  return totals;
};

/**
 * @param {Object} row
 * @returns {Object}
 */
const toLine = (row) => {
  const line = { ...row };
  MONEY_FIELDS.forEach((field) => {
    line[field] = money(row[field]);
  });
  line.booking_id = Number(row.booking_id);
  line.room_count = Number(row.room_count) || 1;
  line.service_type = 'ROOM_BOOKING';
  return line;
};

/**
 * @param {number} hotelId
 * @param {{ start: string, endExclusive: string }} period
 * @param {Object} [filters]
 * @returns {{ whereSql: string, bindings: Array, empty: boolean }}
 */
const buildWhere = (hotelId, period, filters = {}) => {
  // Extras and the late fee are part of the room invoice, so an other-charges filter matches nothing.
  if (filters.service_type && filters.service_type !== 'ROOM_BOOKING') {
    return { whereSql: '', bindings: [], empty: true };
  }

  let whereSql = PERIOD_SQL;
  const bindings = [hotelId, period.start, period.endExclusive, period.start, period.endExclusive];

  if (filters.gst_rate !== undefined && filters.gst_rate !== null) {
    whereSql += ' AND b.gst_rate = ?';
    bindings.push(filters.gst_rate);
  }
  if (filters.invoice_status && INVOICE_STATUS_SQL[filters.invoice_status]) {
    whereSql += ` AND ${INVOICE_STATUS_SQL[filters.invoice_status]}`;
  }

  return { whereSql, bindings, empty: false };
};

const LINE_SQL = `
  SELECT
    b.id AS booking_id,
    b.booking_number,
    b.primary_guest_name AS guest_name,
    b.booking_status,
    CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN 'CANCELLED'
      WHEN b.booking_status = 'CHECKED_OUT' THEN 'FINAL'
      ELSE 'PROVISIONAL'
    END AS invoice_status,
    DATE_FORMAT(COALESCE(b.actual_check_out, b.check_out_date), '%d-%m-%Y') AS invoice_date,
    ROUND(
      COALESCE(b.base_amount, 0) + COALESCE(b.extra_charges_total, 0) + COALESCE(b.late_checkout_charge, 0),
      2
    ) AS gross_amount,
    COALESCE(b.discount_amount, 0) AS discount_amount,
    COALESCE(b.taxable_amount, 0) AS taxable_amount,
    COALESCE(b.gst_rate, 0) AS gst_rate,
    COALESCE(b.cgst_amount, 0) AS cgst_amount,
    COALESCE(b.sgst_amount, 0) AS sgst_amount,
    CAST(0 AS DECIMAL(12, 2)) AS igst_amount,
    COALESCE(b.gst_amount, 0) AS gst_total,
    COALESCE(b.total_amount, 0) AS invoice_total,
    GREATEST(COALESCE((SELECT COUNT(*) FROM booking_rooms br WHERE br.booking_id = b.id), 0), 1) AS room_count,
    COALESCE((
      SELECT SUM(ABS(p.amount))
      FROM booking_payments p
      WHERE p.booking_id = b.id AND p.status = 'REFUNDED'
    ), 0) AS refunded_amount,
    CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN COALESCE(b.taxable_amount, 0) ELSE 0
    END AS credit_taxable_value,
    CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN COALESCE(b.cgst_amount, 0) ELSE 0
    END AS credit_cgst_amount,
    CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN COALESCE(b.sgst_amount, 0) ELSE 0
    END AS credit_sgst_amount,
    CAST(0 AS DECIMAL(12, 2)) AS credit_igst_amount
  FROM bookings b
  WHERE `;

const TOTALS_SQL = `
  SELECT
    COUNT(*) AS total_invoices,
    COALESCE(SUM(CASE WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN 1 ELSE 0 END), 0) AS credit_note_count,
    COUNT(*) AS line_count,
    ROUND(COALESCE(SUM(
      COALESCE(b.base_amount, 0) + COALESCE(b.extra_charges_total, 0) + COALESCE(b.late_checkout_charge, 0)
    ), 0), 2) AS gross_amount,
    ROUND(COALESCE(SUM(b.discount_amount), 0), 2) AS discount_amount,
    ROUND(COALESCE(SUM(b.taxable_amount), 0), 2) AS total_taxable_value,
    ROUND(COALESCE(SUM(b.cgst_amount), 0), 2) AS total_cgst,
    ROUND(COALESCE(SUM(b.sgst_amount), 0), 2) AS total_sgst,
    CAST(0 AS DECIMAL(12, 2)) AS total_igst,
    ROUND(COALESCE(SUM(b.gst_amount), 0), 2) AS total_gst,
    ROUND(COALESCE(SUM(COALESCE(b.taxable_amount, 0) + COALESCE(b.cgst_amount, 0) + COALESCE(b.sgst_amount, 0)), 0), 2) AS total_invoice_value,
    ROUND(COALESCE(SUM(b.total_amount), 0), 2) AS total_stored_invoice,
    ROUND(COALESCE(SUM(CASE WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN b.taxable_amount ELSE 0 END), 0), 2) AS credit_note_taxable_value,
    ROUND(COALESCE(SUM(CASE WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN b.cgst_amount ELSE 0 END), 0), 2) AS credit_note_cgst,
    ROUND(COALESCE(SUM(CASE WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN b.sgst_amount ELSE 0 END), 0), 2) AS credit_note_sgst,
    CAST(0 AS DECIMAL(12, 2)) AS credit_note_igst,
    ROUND(COALESCE(SUM(CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW')
        THEN COALESCE(b.taxable_amount, 0) + COALESCE(b.cgst_amount, 0) + COALESCE(b.sgst_amount, 0)
      ELSE 0
    END), 0), 2) AS credit_note_total,
    ROUND(COALESCE(SUM(CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN 0 ELSE b.taxable_amount
    END), 0), 2) AS net_taxable_value,
    ROUND(COALESCE(SUM(CASE
      WHEN b.booking_status IN ('CANCELLED', 'NO_SHOW') THEN 0 ELSE b.gst_amount
    END), 0), 2) AS net_gst,
    ROUND(COALESCE(SUM(COALESCE((
      SELECT SUM(ABS(p.amount))
      FROM booking_payments p
      WHERE p.booking_id = b.id AND p.status = 'REFUNDED'
    ), 0)), 0), 2) AS refunded_amount
  FROM bookings b
  WHERE `;

/**
 * Invoice lines for one hotel and period, and optionally the totals of that whole set.
 * Pass limit null to return every line. The page query does not scan the summary tables.
 * @param {Object} params
 * @param {number} params.hotelId
 * @param {{ start: string, endExclusive: string }} params.period
 * @param {Object} [params.filters]
 * @param {number} [params.offset=0]
 * @param {number|null} [params.limit=null] - Null returns every matching invoice.
 * @param {boolean} [params.includeTotals=true]
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ rows: Object[], totals: Object|null }>}
 */
const findGstReport = async ({
  hotelId,
  period,
  filters = {},
  offset = 0,
  limit = null,
  includeTotals = true,
}, client = db) => {
  const { whereSql, bindings, empty } = buildWhere(hotelId, period, filters);
  if (empty) {
    return { rows: [], totals: emptyTotals() };
  }

  const limited = limit !== null && limit !== undefined;
  const rowSql = `${LINE_SQL}${whereSql} ORDER BY COALESCE(b.actual_check_out, b.check_out_date), b.booking_number${limited ? ' LIMIT ? OFFSET ?' : ''}`;
  const rowBindings = limited ? [...bindings, Number(limit), Number(offset)] : bindings;

  const tasks = [client.raw(rowSql, rowBindings)];
  if (includeTotals) tasks.push(client.raw(`${TOTALS_SQL}${whereSql}`, bindings));

  const [rowResult, totalResult] = await Promise.all(tasks);

  return {
    rows: rowResult[0].map(toLine),
    totals: includeTotals ? toTotals(totalResult[0][0]) : null,
  };
};

/**
 * The hotel's registered business details printed on the report.
 * @param {number} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findHotelBusinessDetails = async (hotelId, client = db) => {
  const row = await client('hotels')
    .where({ id: hotelId })
    .whereNull('deleted_at')
    .select('id', 'name', 'address', 'city', 'state', 'pincode', 'country', 'gst_number', 'pan_number')
    .first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gst_number: row.gst_number || '',
    pan_number: row.pan_number || '',
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country || '',
  };
};

module.exports = {
  findGstReport,
  findHotelBusinessDetails,
  emptyTotals,
};
