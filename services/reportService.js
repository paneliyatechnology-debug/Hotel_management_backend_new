/**
 * Report service.
 *
 * GST report: one invoice line per booking for one hotel, and its Excel / PDF export. Extra charges and the late
 * check-out charge are already included in the stored taxable amount and GST. Reads only. The only thing written
 * is the export file, under uploads/pdfs, which the 3-hourly cleanup job deletes.
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
  escapeHtml,
  PDF_DIR,
} = require('./bookingPdfService');
const {
  HTTP_STATUS,
  GST_SERVICE_TYPES,
} = require('../constants');

const DEFAULT_PAGE_LIMIT = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE_PATH = path.join(__dirname, '../templates/gstReport.html');
const MONEY_FORMAT = '#,##0.00';

let reportTemplate = null;

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
 * Same calendar day one year later. 29 February moves to 28 February in a non-leap year.
 * @param {Date} date
 * @returns {Date}
 */
const addOneYear = (date) => {
  const month = date.getMonth();
  const next = new Date(date.getFullYear() + 1, month, date.getDate());
  if (next.getMonth() !== month) return new Date(date.getFullYear() + 1, month + 1, 0);
  return next;
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
 * Report period as inclusive dates. Both dates are required. The last day can be at most one year after the first.
 * @param {Object} query
 * @param {string} query.start_date - YYYY-MM-DD
 * @param {string} query.end_date - YYYY-MM-DD
 * @returns {{ start_date: string, end_date: string, start: string, endExclusive: string }}
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

  const latestEnd = addOneYear(start);
  if (end > latestEnd) {
    const latest = formatDateOnly(latestEnd);
    throw new AppError(
      'A GST report can cover at most one year from start_date.',
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'end_date', message: `end_date must be on or before ${latest}, one year from start_date.` }]
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
 * @param {string} isoDate - YYYY-MM-DD
 * @returns {string} DD-MM-YYYY
 */
const toDisplayDate = (isoDate) => {
  const [year, month, day] = String(isoDate).split('-');
  return `${day}-${month}-${year}`;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * One report line in its response shape. Invoice dates are already DD-MM-YYYY from the query.
 * @param {Object} line - Row from the model
 * @returns {Object}
 */
const formatRow = (line) => ({
  invoice_date: line.invoice_date,
  invoice_number: line.booking_number,
  booking_status: line.booking_status,
  guest_name: line.guest_name,
  room_count: line.room_count,
  service_type: line.service_type,
  gross_amount: line.gross_amount,
  discount_amount: line.discount_amount,
  taxable_amount: line.taxable_amount,
  gst_rate: line.gst_rate,
  cgst_amount: line.cgst_amount,
  sgst_amount: line.sgst_amount,
  igst_amount: line.igst_amount,
  gst_total: line.gst_total,
  invoice_total: line.invoice_total,
  invoice_status: line.invoice_status,
  refunded_amount: line.refunded_amount,
  credit_note: {
    cgst_amount: line.credit_cgst_amount,
    sgst_amount: line.credit_sgst_amount,
    igst_amount: line.credit_igst_amount,
  },
  net_taxable_value: roundMoney(line.taxable_amount - line.credit_taxable_value),
});

/**
 * Totals of a full export, from the lines already loaded. Avoids a second pass over the bookings.
 * @param {Object[]} rows - formatRow results
 * @returns {Object}
 */
const totalsFromRows = (rows) => {
  const sum = (pick) => roundMoney(rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0));
  const creditGst = (row) => row.credit_note.cgst_amount + row.credit_note.sgst_amount + row.credit_note.igst_amount;
  const creditTaxable = (row) => roundMoney(row.taxable_amount - row.net_taxable_value);
  return {
    total_invoices: rows.length,
    credit_note_count: rows.filter((row) => row.invoice_status === 'CANCELLED').length,
    gross_amount: sum((row) => row.gross_amount),
    discount_amount: sum((row) => row.discount_amount),
    total_taxable_value: sum((row) => row.taxable_amount),
    total_cgst: sum((row) => row.cgst_amount),
    total_sgst: sum((row) => row.sgst_amount),
    total_igst: sum((row) => row.igst_amount),
    total_gst: sum((row) => row.gst_total),
    total_invoice_value: sum((row) => row.taxable_amount + row.cgst_amount + row.sgst_amount),
    total_stored_invoice: sum((row) => row.invoice_total),
    credit_note_taxable_value: sum(creditTaxable),
    credit_note_cgst: sum((row) => row.credit_note.cgst_amount),
    credit_note_sgst: sum((row) => row.credit_note.sgst_amount),
    credit_note_igst: sum((row) => row.credit_note.igst_amount),
    credit_note_total: sum((row) => creditTaxable(row) + creditGst(row)),
    net_taxable_value: sum((row) => row.net_taxable_value),
    net_gst: sum((row) => row.gst_total - creditGst(row)),
    refunded_amount: sum((row) => row.refunded_amount),
  };
};

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
 * @param {Object[]} rows
 * @param {Object} totals
 * @returns {Object}
 */
const buildResponse = ({ hotelId, hotel, period, filters }, rows, totals) => ({
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
  rows,
  grand_totals: totals,
});

/**
 * Invoice-wise GST report with one page of rows.
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
      includeTotals: true,
    },
    client
  );

  const { line_count: lineCount, ...totals } = report.totals;
  return {
    ...buildResponse(scope, report.rows.map(formatRow), totals),
    pagination: {
      page,
      limit,
      total_rows: lineCount,
      total_pages: Math.ceil(lineCount / limit) || 1,
    },
  };
};

/**
 * Every invoice in the period, for an Excel or PDF file. No row cap; the period is already limited to one year.
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
      limit: null,
      includeTotals: false,
    },
    client
  );
  const rows = report.rows.map(formatRow);
  return buildResponse(scope, rows, totalsFromRows(rows));
};

// ---- Excel and PDF export. Both files contain only the invoice-wise table. -------------------------------

const DETAIL_COLUMNS = [
  { header: 'Invoice date', get: (row) => row.invoice_date },
  { header: 'Invoice no.', get: (row) => row.invoice_number },
  { header: 'Guest', get: (row) => row.guest_name },
  { header: 'Service', get: (row) => GST_SERVICE_TYPES[row.service_type]?.label || row.service_type },
  { header: 'Gross amount', get: (row) => row.gross_amount, money: true },
  { header: 'Discount', get: (row) => row.discount_amount, money: true },
  { header: 'Taxable value', get: (row) => row.taxable_amount, money: true },
  { header: 'GST %', get: (row) => row.gst_rate, money: true },
  { header: 'CGST', get: (row) => row.cgst_amount, money: true },
  { header: 'SGST', get: (row) => row.sgst_amount, money: true },
  { header: 'IGST', get: (row) => row.igst_amount, money: true },
  { header: 'Total GST', get: (row) => row.gst_total, money: true },
  { header: 'Invoice total', get: (row) => row.invoice_total, money: true },
  { header: 'Status', get: (row) => row.invoice_status },
  { header: 'Refunded', get: (row) => row.refunded_amount, money: true },
  { header: 'Net taxable value', get: (row) => row.net_taxable_value, money: true },
];

const totalByHeader = (totals) => ({
  'Gross amount': totals.gross_amount,
  Discount: totals.discount_amount,
  'Taxable value': totals.total_taxable_value,
  'GST %': null,
  CGST: totals.total_cgst,
  SGST: totals.total_sgst,
  IGST: totals.total_igst,
  'Total GST': totals.total_gst,
  'Invoice total': totals.total_stored_invoice,
  Refunded: totals.refunded_amount,
  'Net taxable value': totals.net_taxable_value,
});

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

const periodLabel = (filters) => `${toDisplayDate(filters.start_date)} to ${toDisplayDate(filters.end_date)}`;

const formatGeneratedAt = () => new Date()
  .toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  .replace(/\//g, '-');

/**
 * Excel file with the hotel heading and one invoice table. Streaming keeps a long year from building a
 * second copy of every cell in memory, and column formats are applied once instead of on every cell.
 * @param {Object} report
 * @param {string} filePath
 * @returns {Promise<void>}
 */
const writeGstWorkbook = async (report, filePath) => {
  const { filters, hotel, rows, grand_totals: totals } = report;
  const footer = totalByHeader(totals);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: true,
    useSharedStrings: false,
  });
  workbook.creator = 'MYOWNPMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('GST report');
  DETAIL_COLUMNS.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = column.header === 'Guest' ? 24 : 16;
    if (column.money) excelColumn.style = { numFmt: MONEY_FORMAT };
    else if (column.integer) excelColumn.style = { numFmt: '0' };
  });

  const add = (values, bold = false) => {
    const excelRow = sheet.addRow(values);
    if (bold) excelRow.font = { bold: true };
    excelRow.commit();
  };

  add([`${hotel.name} - GST report`], true);
  add([[hotel.address, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ')]);
  add([`GSTIN: ${hotel.gstin || '-'}    PAN: ${hotel.pan || '-'}`]);
  add([`Period: ${periodLabel(filters)}    Filters: ${describeFilters(filters)}`]);
  add([`Generated: ${formatGeneratedAt()}`]);
  add([]);
  add(['Invoice-wise detail'], true);
  add(DETAIL_COLUMNS.map((column) => column.header), true);
  rows.forEach((row) => add(DETAIL_COLUMNS.map((column) => column.get(row))));
  add(DETAIL_COLUMNS.map((column, index) => (index === 0 ? 'Total' : footer[column.header] ?? null)), true);

  sheet.commit();
  await workbook.commit();
};

const formatMoney = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @param {number[]} numericColumns
 * @param {Object} [options]
 * @param {string[]} [options.rowClasses]
 * @param {Array<string|number>} [options.totalRow]
 * @returns {string}
 */
const htmlTable = (headers, rows, numericColumns, { rowClasses = [], totalRow = null } = {}) => {
  const cell = (tag, value, index) =>
    `<${tag}${numericColumns.includes(index) ? ' class="num"' : ''}>${escapeHtml(value)}</${tag}>`;
  const head = `<thead><tr>${headers.map((header, index) => cell('th', header, index)).join('')}</tr></thead>`;
  const body = rows
    .map((row, rowIndex) => {
      const cls = rowClasses[rowIndex] ? ` class="${rowClasses[rowIndex]}"` : '';
      return `<tr${cls}>${row.map((value, index) => cell('td', value, index)).join('')}</tr>`;
    })
    .join('');
  const total = totalRow
    ? `<tr class="total">${totalRow.map((value, index) => cell('td', value, index)).join('')}</tr>`
    : '';
  return `<table>${head}<tbody>${body}${total}</tbody></table>`;
};

const getReportTemplate = () => {
  if (!reportTemplate) reportTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return reportTemplate;
};

/**
 * @param {Object} report
 * @returns {string}
 */
const buildReportHtml = (report) => {
  const { filters, hotel, rows, grand_totals: totals } = report;
  const footer = totalByHeader(totals);
  const numericColumns = DETAIL_COLUMNS.map((column, index) => (column.money || column.integer ? index : -1))
    .filter((index) => index >= 0);
  const detailRows = rows.map((row) => DETAIL_COLUMNS.map((column) => (
    column.money ? formatMoney(column.get(row)) : column.get(row)
  )));
  const detailTable = htmlTable(
    DETAIL_COLUMNS.map((column) => column.header),
    detailRows,
    numericColumns,
    {
      rowClasses: rows.map((row) => (row.invoice_status === 'CANCELLED' ? 'cancelled' : '')),
      totalRow: DETAIL_COLUMNS.map((column, index) => {
        if (index === 0) return 'Total';
        const value = footer[column.header];
        if (value === undefined || value === null) return '';
        return column.money ? formatMoney(value) : value;
      }),
    }
  );

  const taxLine = [
    hotel.gstin ? `GSTIN: ${hotel.gstin}` : '',
    hotel.pan ? `PAN: ${hotel.pan}` : '',
  ].filter(Boolean).join('  |  ');

  return fillTemplate(getReportTemplate(), {
    FONT_FACE: '',
    HOTEL_NAME: escapeHtml(hotel.name),
    HOTEL_ADDRESS: escapeHtml([hotel.address, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ')),
    HOTEL_TAX_LINE: escapeHtml(taxLine),
    PERIOD: escapeHtml(periodLabel(filters)),
    FILTERS: escapeHtml(describeFilters(filters)),
    GENERATED_AT: escapeHtml(formatGeneratedAt()),
    ROWS_TABLE: detailTable,
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
  fs.mkdirSync(PDF_DIR, { recursive: true });

  if (format === 'pdf') {
    await renderPdfFile(buildReportHtml(report), fileName, 'GST report', { printBackground: false });
  } else {
    await writeGstWorkbook(report, path.join(PDF_DIR, fileName));
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
  writeGstWorkbook,
  buildReportHtml,
};
