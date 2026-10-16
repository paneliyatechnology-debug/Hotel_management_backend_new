/**
 * Report service.
 *
 * GST report: the date-wise GST report of one hotel, built from the tax amounts and rates stored on its bookings,
 * and its Excel / PDF export. See models/reportModel.js for how an invoice, its service lines and its credit note
 * are derived. Reads only. The only thing written is the export file, under uploads/pdfs, which the 3-hourly
 * cleanup job deletes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const db = require('../database/knex');
const reportModel = require('../models/reportModel');
const { resolveScopedHotelId } = require('../utils/hotelScope');
const { AppError } = require('../utils/response');
const {
  renderPdfFile,
  fillTemplate,
  getFontFaceCss,
  escapeHtml,
  PDF_DIR,
} = require('./bookingPdfService');
const {
  HTTP_STATUS,
  GST_SERVICE_TYPES,
  GST_REPORT_MAX_DAYS,
  GST_REPORT_EXPORT_MAX_ROWS,
} = require('../constants');

const DEFAULT_PAGE_LIMIT = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// What this report cannot show with the data the system keeps today.
const REPORT_NOTES = [
  'One booking is one invoice. The invoice number is the booking number and the invoice date is the check-out date.',
  'Tax amounts and rates are the ones saved on each booking, so later rate changes do not change old reports.',
  'Extra charges and the late check-out charge are carried on the booking without GST and are listed as OTHER_CHARGES at 0%.',
  'A cancelled or no-show booking is reversed by a credit note for its full taxable value and tax. Refunds are shown for information only.',
  'In the GST rate and service summaries an invoice that has lines in several groups is counted once in each group. The grand total counts it once.',
  'IGST, cess and guest GSTIN are not stored on bookings, so they are reported as 0 and null. Every supply is treated as intra-state (CGST + SGST).',
];

/**
 * @param {string} value - YYYY-MM-DD
 * @returns {Date|null} Local midnight of that day, or null when it is not a real calendar date
 */
const parseDateOnly = (value) => {
  if (!DATE_PATTERN.test(String(value))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const isReal = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isReal ? date : null;
};

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD in local time
 */
const formatDateOnly = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/**
 * Report period as inclusive dates. Both dates are required and both ends are whole days.
 * @param {Object} query
 * @param {string} query.start_date - YYYY-MM-DD
 * @param {string} query.end_date - YYYY-MM-DD
 * @returns {{ start_date: string, end_date: string, start: string, endExclusive: string }}
 *   start and endExclusive are the SQL bounds: the start of the first day and the start of the day after the last.
 */
const resolveReportPeriod = (query = {}) => {
  const errors = [];

  const parse = (field) => {
    const raw = query[field] === undefined || query[field] === null ? '' : String(query[field]).trim();
    if (!raw) {
      errors.push({ field, message: `${field} is required.` });
      return null;
    }
    const date = parseDateOnly(raw);
    if (!date) errors.push({ field, message: `${field} must be a real date in YYYY-MM-DD format.` });
    return date;
  };

  const start = parse('start_date');
  const end = parse('end_date');
  if (errors.length) {
    throw new AppError('Invalid report period.', HTTP_STATUS.BAD_REQUEST, errors);
  }

  if (start > end) {
    throw new AppError('start_date must not be after end_date.', HTTP_STATUS.BAD_REQUEST, [
      { field: 'start_date', message: 'start_date must be on or before end_date.' },
    ]);
  }

  const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  if (days > GST_REPORT_MAX_DAYS) {
    throw new AppError(
      `The report period can be at most ${GST_REPORT_MAX_DAYS} days.`,
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'end_date', message: `Choose a period of ${GST_REPORT_MAX_DAYS} days or fewer.` }]
    );
  }

  const startDate = formatDateOnly(start);
  const endDate = formatDateOnly(end);
  return {
    start_date: startDate,
    end_date: endDate,
    start: `${startDate} 00:00:00`,
    endExclusive: `${formatDateOnly(addDays(end, 1))} 00:00:00`,
  };
};

/**
 * Optional filters, normalised. Unknown values are rejected by the request validator before this runs.
 * @param {Object} query
 * @returns {{ service_type: string|null, gst_rate: number|null, invoice_status: string|null }}
 */
const resolveFilters = (query = {}) => {
  const rate = query.gst_rate === undefined || query.gst_rate === '' ? null : Number(query.gst_rate);
  return {
    service_type: query.service_type ? String(query.service_type).toUpperCase() : null,
    gst_rate: rate === null || Number.isNaN(rate) ? null : Math.round(rate * 100) / 100,
    invoice_status: query.invoice_status ? String(query.invoice_status).toUpperCase() : null,
  };
};

/**
 * One report line in its response shape.
 * @param {Object} line - Row from the model
 * @returns {Object}
 */
const formatRow = (line) => ({
  invoice_date: line.invoice_date,
  invoice_number: line.booking_number,
  booking_id: line.booking_id,
  booking_status: line.booking_status,
  guest_name: line.guest_name,
  guest_gstin: null,
  room_count: line.room_count,
  service_type: line.service_type,
  hsn_sac_code: GST_SERVICE_TYPES[line.service_type]?.sac_code || null,
  gross_amount: line.gross_amount,
  discount_amount: line.discount_amount,
  taxable_amount: line.taxable_amount,
  gst_rate: line.gst_rate,
  cgst_amount: line.cgst_amount,
  sgst_amount: line.sgst_amount,
  igst_amount: line.igst_amount,
  cess_amount: line.cess_amount,
  gst_total: line.gst_total,
  line_total: line.line_total,
  invoice_total: line.invoice_total,
  invoice_status: line.invoice_status,
  refunded_amount: line.refunded_amount,
  credit_note: {
    taxable_value: line.credit_taxable_value,
    cgst_amount: line.credit_cgst_amount,
    sgst_amount: line.credit_sgst_amount,
    igst_amount: line.credit_igst_amount,
    cess_amount: line.credit_cess_amount,
    gst_total: Math.round((line.credit_cgst_amount + line.credit_sgst_amount + line.credit_igst_amount + line.credit_cess_amount) * 100) / 100,
  },
  net_taxable_value: Math.round((line.taxable_amount - line.credit_taxable_value) * 100) / 100,
});

/**
 * Hotel, period and filters every report starts from.
 * @param {Object} query
 * @param {Object} reqUser
 * @param {import('knex').Knex} client
 * @returns {Promise<{ hotelId: number, hotel: Object, period: Object, filters: Object }>}
 */
const resolveReportScope = async (query, reqUser, client) => {
  const hotelId = resolveScopedHotelId(reqUser, query);
  const hotel = await reportModel.findHotelBusinessDetails(hotelId, client);
  if (!hotel) {
    throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
  }
  return { hotelId, hotel, period: resolveReportPeriod(query), filters: resolveFilters(query) };
};

/**
 * @param {Object} scope
 * @param {Object} report - Result of reportModel.findGstReport
 * @returns {Object}
 */
const buildResponse = ({ hotelId, hotel, period, filters }, report) => ({
  filters: {
    hotel_id: hotelId,
    start_date: period.start_date,
    end_date: period.end_date,
    gst_rate: filters.gst_rate,
    service_type: filters.service_type,
    invoice_status: filters.invoice_status,
  },
  hotel: {
    id: hotel.id,
    name: hotel.name,
    gstin: hotel.gst_number,
    pan: hotel.pan_number,
    address: hotel.address,
    city: hotel.city,
    state: hotel.state,
    pincode: hotel.pincode,
    country: hotel.country,
  },
  rows: report.rows.map(formatRow),
  date_wise_summary: report.byDate,
  gst_rate_summary: report.byRate,
  service_summary: report.byService.map((item) => ({
    ...item,
    service_label: GST_SERVICE_TYPES[item.service_type]?.label || item.service_type,
    hsn_sac_code: GST_SERVICE_TYPES[item.service_type]?.sac_code || null,
  })),
  grand_totals: (({ line_count, ...totals }) => totals)(report.totals),
  notes: REPORT_NOTES,
});

/**
 * Date-wise GST report with one page of rows.
 * @param {Object} query - start_date, end_date, hotel_id (super admin only), gst_rate, service_type, invoice_status, page, limit
 * @param {Object} reqUser
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getGstReport = async (query = {}, reqUser, client = db) => {
  const scope = await resolveReportScope(query, reqUser, client);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || DEFAULT_PAGE_LIMIT));

  const report = await reportModel.findGstReport(
    {
      hotelId: scope.hotelId,
      period: scope.period,
      filters: scope.filters,
      offset: (page - 1) * limit,
      limit,
    },
    client
  );

  return {
    ...buildResponse(scope, report),
    pagination: {
      page,
      limit,
      total_rows: report.totals.line_count,
      total_pages: Math.ceil(report.totals.line_count / limit) || 1,
    },
  };
};

/**
 * The whole report for an Excel or PDF export. No pagination, but capped.
 * @param {Object} query
 * @param {Object} reqUser
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const getGstReportForExport = async (query = {}, reqUser, client = db) => {
  const scope = await resolveReportScope(query, reqUser, client);

  const report = await reportModel.findGstReport(
    {
      hotelId: scope.hotelId,
      period: scope.period,
      filters: scope.filters,
      offset: 0,
      limit: GST_REPORT_EXPORT_MAX_ROWS,
    },
    client
  );

  if (report.totals.line_count > GST_REPORT_EXPORT_MAX_ROWS) {
    throw new AppError(
      `This report has ${report.totals.line_count} rows. An export holds at most ${GST_REPORT_EXPORT_MAX_ROWS}. Choose a shorter period or add a filter.`,
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'start_date', message: 'Narrow the period or add a filter to export.' }]
    );
  }

  return buildResponse(scope, report);
};

// ---- Excel and PDF export ----------------------------------------------------------------------------------

const TEMPLATE_PATH = path.join(__dirname, '../templates/gstReport.html');
const MONEY_FORMAT = '#,##0.00';

// Columns shared by the date, rate and service summaries.
const SUMMARY_COLUMNS = [
  { header: 'Invoices', key: 'total_invoices', integer: true },
  { header: 'Taxable value', key: 'total_taxable_value' },
  { header: 'CGST', key: 'total_cgst' },
  { header: 'SGST', key: 'total_sgst' },
  { header: 'IGST', key: 'total_igst' },
  { header: 'Cess', key: 'total_cess' },
  { header: 'Total GST', key: 'total_gst' },
  { header: 'Invoice value', key: 'total_invoice_value' },
  { header: 'Credit notes (taxable)', key: 'credit_note_taxable_value' },
  { header: 'Credit notes (GST)', key: 'credit_note_gst' },
  { header: 'Net taxable value', key: 'net_taxable_value' },
  { header: 'Net GST', key: 'net_gst' },
  { header: 'Refunded', key: 'refunded_amount' },
];

const ROW_COLUMNS = [
  { header: 'Invoice date', get: (r) => r.invoice_date },
  { header: 'Invoice no.', get: (r) => r.invoice_number },
  { header: 'Booking ID', get: (r) => r.booking_id, integer: true },
  { header: 'Guest', get: (r) => r.guest_name },
  { header: 'Guest GSTIN', get: (r) => r.guest_gstin || '' },
  { header: 'Service', get: (r) => r.service_type },
  { header: 'HSN/SAC', get: (r) => r.hsn_sac_code || '' },
  { header: 'Gross amount', get: (r) => r.gross_amount, money: true },
  { header: 'Discount', get: (r) => r.discount_amount, money: true },
  { header: 'Taxable value', get: (r) => r.taxable_amount, money: true },
  { header: 'GST %', get: (r) => r.gst_rate, money: true },
  { header: 'CGST', get: (r) => r.cgst_amount, money: true },
  { header: 'SGST', get: (r) => r.sgst_amount, money: true },
  { header: 'IGST', get: (r) => r.igst_amount, money: true },
  { header: 'Cess', get: (r) => r.cess_amount, money: true },
  { header: 'Total GST', get: (r) => r.gst_total, money: true },
  { header: 'Line total', get: (r) => r.line_total, money: true },
  { header: 'Invoice total', get: (r) => r.invoice_total, money: true },
  { header: 'Status', get: (r) => r.invoice_status },
  { header: 'Refunded', get: (r) => r.refunded_amount, money: true },
  { header: 'Credit note (taxable)', get: (r) => r.credit_note.taxable_value, money: true },
  { header: 'Credit note (GST)', get: (r) => r.credit_note.gst_total, money: true },
  { header: 'Net taxable value', get: (r) => r.net_taxable_value, money: true },
];

/**
 * @param {Object} filters
 * @returns {string}
 */
const describeFilters = (filters) => {
  const parts = [
    filters.gst_rate !== null && filters.gst_rate !== undefined ? `GST rate ${filters.gst_rate}%` : '',
    filters.service_type ? `Service ${filters.service_type}` : '',
    filters.invoice_status ? `Status ${filters.invoice_status}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
};

const periodLabel = (filters) => `${filters.start_date} to ${filters.end_date}`;

const THIN_BORDER = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };

/**
 * Write one titled table at the bottom of the sheet: a title, a header row, the rows and an optional total row.
 * @param {ExcelJS.Worksheet} sheet
 * @param {string} title
 * @param {Array<{ header: string, money?: boolean, integer?: boolean }>} columns
 * @param {Array<Array<string|number|null>>} rows
 * @param {Array<string|number|null>} [totalRow]
 */
const addTable = (sheet, title, columns, rows, totalRow = null) => {
  sheet.addRow([]);
  sheet.addRow([title]).font = { bold: true, size: 12 };

  const write = (values, { bold = false, fill = null } = {}) => {
    const row = sheet.addRow(values);
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.border = THIN_BORDER;
      if (bold) cell.font = { bold: true };
      if (fill) cell.fill = fill;
      if (column.money) cell.numFmt = MONEY_FORMAT;
      else if (column.integer) cell.numFmt = '0';
    });
    return row;
  };

  const header = write(columns.map((c) => c.header), { bold: true, fill: HEADER_FILL });
  header.alignment = { wrapText: true, vertical: 'middle' };
  rows.forEach((values) => write(values));
  if (totalRow) write(totalRow, { bold: true });
};

/**
 * Excel workbook of the report. One sheet with the same tables as the PDF, top to bottom:
 * totals, date-wise summary, GST rate summary, service summary, invoice lines and notes.
 * @param {Object} report - Result of getGstReportForExport
 * @returns {ExcelJS.Workbook}
 */
const buildWorkbook = (report) => {
  const { filters, hotel, rows, grand_totals: totals } = report;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MYOWNPMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('GST report');
  sheet.addRow([`${hotel.name} - GST report`]).font = { bold: true, size: 14 };
  sheet.addRow([[hotel.address, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ')]);
  sheet.addRow([`GSTIN: ${hotel.gstin || '-'}`, `PAN: ${hotel.pan || '-'}`]);
  sheet.addRow([`Period: ${periodLabel(filters)}`, `Filters: ${describeFilters(filters)}`]);
  sheet.addRow([`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`]);

  const summaryColumns = SUMMARY_COLUMNS.map((c) => ({ header: c.header, integer: c.integer, money: !c.integer }));
  const summaryCells = (source) => SUMMARY_COLUMNS.map((c) => source[c.key]);
  const summaryTable = (title, firstHeader, items, labelOf) =>
    addTable(
      sheet,
      title,
      [{ header: firstHeader }, ...summaryColumns],
      items.map((item) => [labelOf(item), ...summaryCells(item)]),
      ['Total', ...summaryCells(totals)]
    );

  addTable(sheet, 'Totals', summaryColumns, [summaryCells(totals)]);
  summaryTable('Date-wise summary', 'Invoice date', report.date_wise_summary, (i) => i.date);
  summaryTable('GST rate summary', 'GST rate %', report.gst_rate_summary, (i) => i.gst_rate);
  summaryTable('Service summary', 'Service', report.service_summary, (i) => i.service_label);

  const totalByHeader = {
    'Gross amount': totals.gross_amount,
    Discount: totals.discount_amount,
    'Taxable value': totals.total_taxable_value,
    CGST: totals.total_cgst,
    SGST: totals.total_sgst,
    IGST: totals.total_igst,
    Cess: totals.total_cess,
    'Total GST': totals.total_gst,
    'Line total': totals.total_invoice_value,
    Refunded: totals.refunded_amount,
    'Credit note (taxable)': totals.credit_note_taxable_value,
    'Credit note (GST)': totals.credit_note_gst,
    'Net taxable value': totals.net_taxable_value,
  };
  addTable(
    sheet,
    'Invoice details',
    ROW_COLUMNS,
    rows.map((row) => ROW_COLUMNS.map((c) => c.get(row))),
    ROW_COLUMNS.map((c, index) => (index === 0 ? 'Total' : totalByHeader[c.header] ?? null))
  );

  sheet.addRow([]);
  sheet.addRow(['Notes']).font = { bold: true, size: 12 };
  report.notes.forEach((note) => sheet.addRow([note]));

  ROW_COLUMNS.forEach((spec, index) => {
    sheet.getColumn(index + 1).width = spec.header === 'Guest' ? 24 : 16;
  });

  return workbook;
};

const formatMoney = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows - Cells, already formatted
 * @param {number[]} numericColumns - Indexes of right-aligned columns
 * @param {Object} [options]
 * @param {string[]} [options.rowClasses] - Class for each row
 * @param {Array<string|number>} [options.totalRow]
 * @returns {string}
 */
const htmlTable = (headers, rows, numericColumns, { rowClasses = [], totalRow = null } = {}) => {
  const cell = (tag, value, index) =>
    `<${tag}${numericColumns.includes(index) ? ' class="num"' : ''}>${escapeHtml(value)}</${tag}>`;
  const head = `<thead><tr>${headers.map((h, i) => cell('th', h, i)).join('')}</tr></thead>`;
  const body = rows
    .map((row, rowIndex) => {
      const cls = rowClasses[rowIndex] ? ` class="${rowClasses[rowIndex]}"` : '';
      return `<tr${cls}>${row.map((value, i) => cell('td', value, i)).join('')}</tr>`;
    })
    .join('');
  const total = totalRow
    ? `<tr class="total">${totalRow.map((value, i) => cell('td', value, i)).join('')}</tr>`
    : '';
  return `<table>${head}<tbody>${body}${total}</tbody></table>`;
};

/**
 * @param {Object} report - Result of getGstReportForExport
 * @returns {string}
 */
const buildReportHtml = (report) => {
  const { filters, hotel, rows, grand_totals: totals } = report;
  const summaryHeaders = ['Invoices', ...SUMMARY_COLUMNS.slice(1).map((c) => c.header)];
  const summaryCells = (item) => SUMMARY_COLUMNS.map((c) => (c.integer ? item[c.key] : formatMoney(item[c.key])));
  const numeric = (count) => Array.from({ length: count }, (_, i) => i + 1);
  const summaryTable = (firstHeader, items, labelOf) =>
    htmlTable(
      [firstHeader, ...summaryHeaders],
      items.map((item) => [labelOf(item), ...summaryCells(item)]),
      numeric(SUMMARY_COLUMNS.length),
      { totalRow: ['Total', ...summaryCells(totals)] }
    );

  const rowHeaders = [
    'Date', 'Invoice no.', 'Guest', 'GSTIN', 'Service', 'SAC', 'Discount', 'Taxable', 'GST %',
    'CGST', 'SGST', 'IGST', 'Cess', 'Invoice value', 'Status', 'Credit note GST', 'Net taxable',
  ];
  const detailRows = rows.map((r) => [
    r.invoice_date, r.invoice_number, r.guest_name, r.guest_gstin || '', r.service_type, r.hsn_sac_code || '',
    formatMoney(r.discount_amount), formatMoney(r.taxable_amount), formatMoney(r.gst_rate),
    formatMoney(r.cgst_amount), formatMoney(r.sgst_amount), formatMoney(r.igst_amount), formatMoney(r.cess_amount),
    formatMoney(r.line_total), r.invoice_status, formatMoney(r.credit_note.gst_total), formatMoney(r.net_taxable_value),
  ]);
  const detailTable = htmlTable(
    rowHeaders,
    detailRows,
    [6, 7, 8, 9, 10, 11, 12, 13, 15, 16],
    {
      rowClasses: rows.map((r) => (r.invoice_status === 'CANCELLED' ? 'cancelled' : '')),
      totalRow: [
        'Total', '', '', '', '', '',
        formatMoney(totals.discount_amount), formatMoney(totals.total_taxable_value), '',
        formatMoney(totals.total_cgst), formatMoney(totals.total_sgst), formatMoney(totals.total_igst),
        formatMoney(totals.total_cess), formatMoney(totals.total_invoice_value), '',
        formatMoney(totals.credit_note_gst), formatMoney(totals.net_taxable_value),
      ],
    }
  );

  const totalsTable = htmlTable(
    ['Invoices', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total GST', 'Invoice value',
      'Credit notes (taxable)', 'Credit notes (GST)', 'Net taxable value', 'Net GST'],
    [[
      totals.total_invoices, formatMoney(totals.total_taxable_value), formatMoney(totals.total_cgst),
      formatMoney(totals.total_sgst), formatMoney(totals.total_igst), formatMoney(totals.total_cess),
      formatMoney(totals.total_gst), formatMoney(totals.total_invoice_value),
      formatMoney(totals.credit_note_taxable_value), formatMoney(totals.credit_note_gst),
      formatMoney(totals.net_taxable_value), formatMoney(totals.net_gst),
    ]],
    numeric(11).concat(0)
  );

  const taxLine = [
    hotel.gstin ? `GSTIN: ${hotel.gstin}` : '',
    hotel.pan ? `PAN: ${hotel.pan}` : '',
  ].filter(Boolean).join('  |  ');

  return fillTemplate(fs.readFileSync(TEMPLATE_PATH, 'utf8'), {
    FONT_FACE: getFontFaceCss(),
    HOTEL_NAME: escapeHtml(hotel.name),
    HOTEL_ADDRESS: escapeHtml([hotel.address, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ')),
    HOTEL_TAX_LINE: escapeHtml(taxLine),
    PERIOD: escapeHtml(periodLabel(filters)),
    FILTERS: escapeHtml(describeFilters(filters)),
    GENERATED_AT: escapeHtml(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })),
    TOTALS_TABLE: totalsTable,
    DATE_TABLE: summaryTable('Invoice date', report.date_wise_summary, (i) => i.date),
    RATE_TABLE: summaryTable('GST rate %', report.gst_rate_summary, (i) => formatMoney(i.gst_rate)),
    SERVICE_TABLE: summaryTable('Service', report.service_summary, (i) => i.service_label),
    ROWS_TABLE: detailTable,
    NOTES: report.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join(''),
    YEAR: String(new Date().getFullYear()),
  });
};

/**
 * Build the report file for the caller's hotel and return where to download it.
 * @param {Object} query - Report filters plus format (xlsx or pdf)
 * @param {Object} reqUser
 * @param {string} baseUrl
 * @returns {Promise<{ url: string, file_name: string, format: string, row_count: number }>}
 */
const exportGstReport = async (query, reqUser, baseUrl) => {
  const format = String(query.format).toLowerCase();
  const report = await getGstReportForExport(query, reqUser);

  const token = crypto.randomBytes(6).toString('hex');
  const fileName = `gst_report_${report.filters.hotel_id}_${report.filters.start_date}_${report.filters.end_date}_${token}.${format}`;

  if (format === 'pdf') {
    await renderPdfFile(buildReportHtml(report), fileName, 'GST report');
  } else {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    await buildWorkbook(report).xlsx.writeFile(path.join(PDF_DIR, fileName));
  }

  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
    format,
    row_count: report.rows.length,
  };
};

module.exports = {
  getGstReport,
  getGstReportForExport,
  exportGstReport,
  resolveReportPeriod,
  resolveFilters,
  formatRow,
  buildWorkbook,
  buildReportHtml,
};
