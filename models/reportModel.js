/**
 * GST report queries.
 *
 * There is no invoice table. One booking is one invoice, dated by its check-out. Every figure comes from the
 * amounts and GST rates stored on the booking when it was saved, so a later change of rate never alters an
 * old report. Tax is never recalculated here.
 *
 * Each invoice is split into service lines (see GST_SERVICE_TYPES). Rooms are never joined, and payments are
 * added up per booking before the join, so a multi-room booking or a booking with many payments is counted once.
 *
 * Every value reaches the SQL as a bound parameter. The only text put into the SQL is fixed in this file.
 */
const db = require('../database/knex');
const { money } = require('../utils/dateRange');

// Money columns of one report line, in the order they are returned.
const MONEY_FIELDS = [
  'invoice_total',
  'gross_amount',
  'discount_amount',
  'taxable_amount',
  'gst_rate',
  'cgst_amount',
  'sgst_amount',
  'igst_amount',
  'cess_amount',
  'gst_total',
  'line_total',
  'refunded_amount',
  'credit_taxable_value',
  'credit_cgst_amount',
  'credit_sgst_amount',
  'credit_igst_amount',
  'credit_cess_amount',
];

/**
 * One row per booking with the stored amounts. Soft-deleted bookings are left out.
 * The date test is written so the (hotel_id, actual_check_out) and (hotel_id, check_out_date) indexes can be used.
 * Parameters: hotel id (refunds), hotel id, then the period start and end (exclusive) twice.
 */
const INVOICE_SQL = `
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
    DATE_FORMAT(COALESCE(b.actual_check_out, b.check_out_date), '%Y-%m-%d') AS invoice_date,
    b.base_amount,
    b.discount_amount,
    b.taxable_amount,
    b.gst_rate,
    b.cgst_amount,
    b.sgst_amount,
    b.total_amount AS invoice_total,
    GREATEST(ROUND(b.total_amount - b.taxable_amount - b.gst_amount, 2), 0) AS other_charges,
    GREATEST((SELECT COUNT(*) FROM booking_rooms br WHERE br.booking_id = b.id), 1) AS room_count,
    COALESCE(rf.refunded_amount, 0) AS refunded_amount
  FROM bookings b
  LEFT JOIN (
    SELECT booking_id, SUM(ABS(amount)) AS refunded_amount
    FROM booking_payments
    WHERE hotel_id = ? AND status = 'REFUNDED'
    GROUP BY booking_id
  ) rf ON rf.booking_id = b.id
  WHERE b.hotel_id = ?
    AND b.deleted_at IS NULL
    AND (
      (b.actual_check_out >= ? AND b.actual_check_out < ?)
      OR (b.actual_check_out IS NULL AND b.check_out_date >= ? AND b.check_out_date < ?)
    )`;

/**
 * Splits each invoice into its service lines.
 * ROOM_BOOKING carries the stored taxable amount and the stored CGST / SGST. IGST and cess are not stored, so 0.
 * OTHER_CHARGES is whatever part of the invoice total is not taxable value or GST (extra charges and the late
 * check-out charge). It carries no GST. Taking the remainder keeps the lines equal to the stored invoice total.
 */
const SERVICE_LINES_SQL = `
  SELECT
    ib.booking_id,
    ib.booking_number,
    ib.guest_name,
    ib.booking_status,
    ib.invoice_status,
    ib.invoice_date,
    ib.invoice_total,
    ib.room_count,
    svc.service_type,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.base_amount ELSE ib.other_charges END AS gross_amount,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.discount_amount ELSE 0 END AS discount_amount,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.taxable_amount ELSE ib.other_charges END AS taxable_amount,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.gst_rate ELSE 0 END AS gst_rate,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.cgst_amount ELSE 0 END AS cgst_amount,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.sgst_amount ELSE 0 END AS sgst_amount,
    CAST(0 AS DECIMAL(12, 2)) AS igst_amount,
    CAST(0 AS DECIMAL(12, 2)) AS cess_amount,
    CASE WHEN svc.service_type = 'ROOM_BOOKING' THEN ib.refunded_amount ELSE 0 END AS refunded_amount
  FROM (${INVOICE_SQL}) ib
  JOIN (SELECT 'ROOM_BOOKING' AS service_type UNION ALL SELECT 'OTHER_CHARGES') svc
    ON svc.service_type = 'ROOM_BOOKING' OR ib.other_charges > 0`;

/**
 * Adds the tax totals and the credit note of each line.
 * A cancelled invoice is reversed in full by a credit note for the same taxable value and tax.
 */
const buildLinesSql = (filterSql) => `
  SELECT
    ln.*,
    ROUND(ln.cgst_amount + ln.sgst_amount + ln.igst_amount + ln.cess_amount, 2) AS gst_total,
    ROUND(ln.taxable_amount + ln.cgst_amount + ln.sgst_amount + ln.igst_amount + ln.cess_amount, 2) AS line_total,
    CASE WHEN ln.invoice_status = 'CANCELLED' THEN ln.taxable_amount ELSE 0 END AS credit_taxable_value,
    CASE WHEN ln.invoice_status = 'CANCELLED' THEN ln.cgst_amount ELSE 0 END AS credit_cgst_amount,
    CASE WHEN ln.invoice_status = 'CANCELLED' THEN ln.sgst_amount ELSE 0 END AS credit_sgst_amount,
    CASE WHEN ln.invoice_status = 'CANCELLED' THEN ln.igst_amount ELSE 0 END AS credit_igst_amount,
    CASE WHEN ln.invoice_status = 'CANCELLED' THEN ln.cess_amount ELSE 0 END AS credit_cess_amount
  FROM (${SERVICE_LINES_SQL}) ln
  WHERE 1 = 1 ${filterSql}`;

// Totals of a set of report lines. DECIMAL sums are rounded in SQL, so no float error builds up.
const AGGREGATE_SQL = `
  COUNT(DISTINCT r.booking_id) AS total_invoices,
  COUNT(DISTINCT CASE WHEN r.invoice_status = 'CANCELLED' THEN r.booking_id END) AS credit_note_count,
  COUNT(*) AS line_count,
  ROUND(COALESCE(SUM(r.gross_amount), 0), 2) AS gross_amount,
  ROUND(COALESCE(SUM(r.discount_amount), 0), 2) AS discount_amount,
  ROUND(COALESCE(SUM(r.taxable_amount), 0), 2) AS total_taxable_value,
  ROUND(COALESCE(SUM(r.cgst_amount), 0), 2) AS total_cgst,
  ROUND(COALESCE(SUM(r.sgst_amount), 0), 2) AS total_sgst,
  ROUND(COALESCE(SUM(r.igst_amount), 0), 2) AS total_igst,
  ROUND(COALESCE(SUM(r.cess_amount), 0), 2) AS total_cess,
  ROUND(COALESCE(SUM(r.gst_total), 0), 2) AS total_gst,
  ROUND(COALESCE(SUM(r.line_total), 0), 2) AS total_invoice_value,
  ROUND(COALESCE(SUM(r.credit_taxable_value), 0), 2) AS credit_note_taxable_value,
  ROUND(COALESCE(SUM(r.credit_cgst_amount), 0), 2) AS credit_note_cgst,
  ROUND(COALESCE(SUM(r.credit_sgst_amount), 0), 2) AS credit_note_sgst,
  ROUND(COALESCE(SUM(r.credit_igst_amount), 0), 2) AS credit_note_igst,
  ROUND(COALESCE(SUM(r.credit_cess_amount), 0), 2) AS credit_note_cess,
  ROUND(COALESCE(SUM(r.credit_cgst_amount + r.credit_sgst_amount + r.credit_igst_amount + r.credit_cess_amount), 0), 2) AS credit_note_gst,
  ROUND(COALESCE(SUM(r.credit_taxable_value + r.credit_cgst_amount + r.credit_sgst_amount + r.credit_igst_amount + r.credit_cess_amount), 0), 2) AS credit_note_total,
  ROUND(COALESCE(SUM(r.taxable_amount - r.credit_taxable_value), 0), 2) AS net_taxable_value,
  ROUND(COALESCE(SUM(r.gst_total - (r.credit_cgst_amount + r.credit_sgst_amount + r.credit_igst_amount + r.credit_cess_amount)), 0), 2) AS net_gst,
  ROUND(COALESCE(SUM(r.refunded_amount), 0), 2) AS refunded_amount`;

const TOTAL_FIELDS = [
  'gross_amount',
  'discount_amount',
  'total_taxable_value',
  'total_cgst',
  'total_sgst',
  'total_igst',
  'total_cess',
  'total_gst',
  'total_invoice_value',
  'credit_note_taxable_value',
  'credit_note_cgst',
  'credit_note_sgst',
  'credit_note_igst',
  'credit_note_cess',
  'credit_note_gst',
  'credit_note_total',
  'net_taxable_value',
  'net_gst',
  'refunded_amount',
];

/**
 * @param {Object} row
 * @returns {Object}
 */
const toTotals = (row = {}) => {
  const totals = {
    total_invoices: Number(row.total_invoices) || 0,
    credit_note_count: Number(row.credit_note_count) || 0,
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
  return line;
};

/**
 * Parameters shared by every query: the period, the hotel, and the optional filters.
 * @param {number} hotelId
 * @param {{ start: string, endExclusive: string }} period - 'YYYY-MM-DD HH:mm:ss' strings
 * @param {Object} [filters]
 * @param {string} [filters.service_type]
 * @param {number} [filters.gst_rate]
 * @param {string} [filters.invoice_status]
 * @returns {{ linesSql: string, bindings: Array }}
 */
const buildReportQuery = (hotelId, period, filters = {}) => {
  const bindings = [hotelId, hotelId, period.start, period.endExclusive, period.start, period.endExclusive];
  let filterSql = '';

  if (filters.service_type) {
    filterSql += ' AND ln.service_type = ?';
    bindings.push(filters.service_type);
  }
  if (filters.gst_rate !== undefined && filters.gst_rate !== null) {
    filterSql += ' AND ln.gst_rate = ?';
    bindings.push(filters.gst_rate);
  }
  if (filters.invoice_status) {
    filterSql += ' AND ln.invoice_status = ?';
    bindings.push(filters.invoice_status);
  }

  return { linesSql: buildLinesSql(filterSql), bindings };
};

// The only columns a summary can be grouped by. The SQL text comes from here, never from the request.
const GROUP_COLUMNS = {
  invoice_date: 'r.invoice_date',
  gst_rate: 'r.gst_rate',
  service_type: 'r.service_type',
};

/**
 * Totals of every line, or one row per group when groupKey is given.
 * @param {string} linesSql
 * @param {Array} bindings
 * @param {import('knex').Knex} client
 * @param {string} [groupKey] - A key of GROUP_COLUMNS
 * @returns {Promise<Object[]>}
 */
const runAggregate = async (linesSql, bindings, client, groupKey) => {
  const column = groupKey ? GROUP_COLUMNS[groupKey] : null;
  const sql = column
    ? `SELECT ${column} AS group_key, ${AGGREGATE_SQL} FROM (${linesSql}) r GROUP BY ${column} ORDER BY ${column}`
    : `SELECT ${AGGREGATE_SQL} FROM (${linesSql}) r`;
  const [rows] = await client.raw(sql, bindings);
  return rows;
};

/**
 * Everything the report shows, from one consistent set of lines.
 * @param {Object} params
 * @param {number} params.hotelId
 * @param {{ start: string, endExclusive: string }} params.period
 * @param {Object} [params.filters]
 * @param {number} [params.offset=0]
 * @param {number} params.limit - Rows to return. The rows are ordered by invoice date, then invoice number.
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<{ rows: Object[], totals: Object, byDate: Object[], byRate: Object[], byService: Object[] }>}
 */
const findGstReport = async ({ hotelId, period, filters = {}, offset = 0, limit }, client = db) => {
  const { linesSql, bindings } = buildReportQuery(hotelId, period, filters);

  const [rowResult, totalRows, dateRows, rateRows, serviceRows] = await Promise.all([
    client.raw(
      `SELECT * FROM (${linesSql}) r ORDER BY r.invoice_date, r.booking_number, r.service_type DESC LIMIT ? OFFSET ?`,
      [...bindings, Number(limit), Number(offset)]
    ),
    runAggregate(linesSql, bindings, client),
    runAggregate(linesSql, bindings, client, 'invoice_date'),
    runAggregate(linesSql, bindings, client, 'gst_rate'),
    runAggregate(linesSql, bindings, client, 'service_type'),
  ]);

  return {
    rows: rowResult[0].map(toLine),
    totals: { ...toTotals(totalRows[0]), line_count: Number(totalRows[0]?.line_count) || 0 },
    byDate: dateRows.map((row) => ({ date: row.group_key, ...toTotals(row) })),
    byRate: rateRows.map((row) => ({ gst_rate: money(row.group_key), ...toTotals(row) })),
    byService: serviceRows.map((row) => ({ service_type: row.group_key, ...toTotals(row) })),
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
};
