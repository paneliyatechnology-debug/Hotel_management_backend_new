/**
 * Builds a booking folio (stay, charges, payment history) from the current booking and hotel records.
 * The PDF is written under uploads/pdfs and removed by the cleanup job.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const bookingService = require('./bookingService');
const hotelModel = require('../models/hotelModel');
const bookingPaymentModel = require('../models/bookingPaymentModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const PDF_DIR = path.join(process.cwd(), 'uploads', 'pdfs');
const TEMPLATE_PATH = path.join(__dirname, '../templates/bookingFolio.html');

let browser = null;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

const formatDatePart = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const formatTimePart = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

const joinParts = (parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(', ');

// CHECKED_IN becomes "Checked in" on the page.
const humanize = (value) => {
  const text = String(value || '').replace(/_/g, ' ').trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—';
};

const STAY_TONES = {
  PENDING: 'badge-warn',
  CONFIRMED: 'badge-info',
  CHECKED_IN: 'badge-info',
  CHECKED_OUT: 'badge-muted',
  CANCELLED: 'badge-bad',
  NO_SHOW: 'badge-bad',
};

const PAYMENT_TONES = {
  PENDING: 'badge-warn',
  PARTIALLY_PAID: 'badge-warn',
  PAID: 'badge-ok',
};

const PAYMENT_ROW_TONES = {
  PAID: 'badge-ok',
  PARTIALLY_PAID: 'badge-warn',
  REFUNDED: 'badge-info',
  FAILED: 'badge-bad',
};

const METHOD_LABELS = {
  CASH: 'Cash',
  ONLINE: 'Online',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
};

const SOURCE_LABELS = {
  BOOKING: 'At booking',
  UPDATE: 'Booking update',
  CHECKOUT: 'At checkout',
};

// Roboto subsets: latin covers text and the minus sign, latin-ext covers the rupee sign.
const FONT_SUBSETS = [
  {
    name: 'latin-ext',
    range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, '
      + 'U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
  {
    name: 'latin',
    range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, '
      + 'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
];
const FONT_WEIGHTS = [400, 500, 700];

let fontFaceCss = null;

/**
 * Base64-embed Roboto once so the PDF renders without internet access.
 * Falls back to the system font stack when the package files are missing.
 * @returns {string}
 */
const getFontFaceCss = () => {
  if (fontFaceCss !== null) return fontFaceCss;
  try {
    const filesDir = path.join(path.dirname(require.resolve('@fontsource/roboto/package.json')), 'files');
    const faces = [];
    for (const subset of FONT_SUBSETS) {
      for (const weight of FONT_WEIGHTS) {
        const file = path.join(filesDir, `roboto-${subset.name}-${weight}-normal.woff2`);
        const data = fs.readFileSync(file).toString('base64');
        faces.push(
          `@font-face { font-family: 'Roboto'; font-style: normal; font-weight: ${weight}; font-display: block; `
          + `src: url(data:font/woff2;base64,${data}) format('woff2'); unicode-range: ${subset.range}; }`
        );
      }
    }
    fontFaceCss = faces.join('\n');
  } catch (_) {
    fontFaceCss = '';
  }
  return fontFaceCss;
};

/**
 * Payment rows for the folio, oldest first (the model returns newest first).
 * Refunds carry a negative amount and are shown with a minus sign.
 * @param {Array<Object>} payments
 * @returns {string}
 */
const buildPaymentRows = (payments) => {
  if (!payments.length) return '<tr><td class="empty" colspan="5">No payments recorded.</td></tr>';
  return [...payments].reverse().map((payment) => {
    const amount = Number(payment.amount || 0);
    const amountText = amount < 0 ? `−₹${money(Math.abs(amount))}` : `₹${money(amount)}`;
    const method = METHOD_LABELS[payment.payment_method] || humanize(payment.payment_method);
    const source = SOURCE_LABELS[payment.source] || '';
    return `
      <tr>
        <td>${escapeHtml(formatDateTime(payment.received_at))}${source ? `<div class="cell-sub">${escapeHtml(source)}</div>` : ''}</td>
        <td class="strong">${escapeHtml(method)}</td>
        <td><span class="badge ${PAYMENT_ROW_TONES[payment.status] || 'badge-muted'}">${escapeHtml(humanize(payment.status))}</span></td>
        <td>${escapeHtml(payment.received_by?.name || '—')}</td>
        <td class="num strong${amount < 0 ? ' refund' : ''}">${amountText}</td>
      </tr>
    `;
  }).join('');
};

/**
 * Embed a remote file so the PDF does not depend on the browser loading it later.
 * @param {string} url
 * @returns {Promise<string>}
 */
const toDataUri = async (url) => {
  if (!url) return '';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return '';
    const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (_) {
    return '';
  }
};

const fillTemplate = (template, values) => {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(value ?? '');
  }
  return html;
};

const buildHtml = async (booking, hotel, payments) => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const rooms = Array.isArray(booking.rooms) ? booking.rooms : [];
  const roomRows = rooms.length
    ? rooms.map((room) => `
      <tr>
        <td class="strong">${escapeHtml(room.room_number || room.id)}</td>
        <td>${escapeHtml(room.floor ?? '—')}</td>
        <td>${escapeHtml(room.room_type_name || '—')}</td>
      </tr>
    `).join('')
    : '<tr><td class="empty" colspan="3">No room recorded.</td></tr>';

  const imageUrls = (Array.isArray(booking.images) ? booking.images : []).filter(Boolean);
  const signatureUrls = (Array.isArray(booking.signatures) ? booking.signatures : []).filter(Boolean);
  const [imageSources, signatureSources] = await Promise.all([
    Promise.all(imageUrls.map(toDataUri)),
    Promise.all(signatureUrls.map(toDataUri)),
  ]);

  const loadedProofs = imageSources.filter(Boolean);
  const idProofs = loadedProofs.length
    ? loadedProofs.map((src, index) => `
    <figure class="proof">
      <img src="${src}" alt="ID proof ${index + 1}" />
      <figcaption>ID proof ${index + 1}</figcaption>
    </figure>
  `).join('')
    : '<p class="note">No ID proof uploaded.</p>';

  const signature = signatureSources.filter(Boolean).map((src) => (
    `<img src="${src}" alt="Guest signature" />`
  )).join('');

  const address = joinParts([hotel?.address, hotel?.city, hotel?.state, hotel?.pincode, hotel?.country]);
  const hotelMeta = [
    ['GSTIN', hotel?.gst_number],
    ['PAN', hotel?.pan_number],
    ['Phone', hotel?.owner?.phone],
  ].filter(([, value]) => value)
    .map(([label, value]) => `<span class="tag"><b>${label}</b>${escapeHtml(value)}</span>`)
    .join('');
  const guestTotal = (Number(booking.adults) || 0) + (Number(booking.children) || 0);
  const roomCount = rooms.length || (Array.isArray(booking.room_id) ? booking.room_id.length : 0);

  return fillTemplate(template, {
    HOTEL_NAME: escapeHtml(hotel?.name || 'Hotel'),
    HOTEL_TYPE: escapeHtml(hotel?.hotel_type || 'Hotel'),
    HOTEL_ADDRESS: escapeHtml(address || '—'),
    HOTEL_META: hotelMeta,
    FONT_FACE: getFontFaceCss(),
    BOOKING_NUMBER: escapeHtml(booking.booking_number),
    PRINTED_AT: escapeHtml(formatDateTime(new Date())),
    CREATED_AT: escapeHtml(formatDateTime(booking.created_at)),
    ROOM_COUNT: escapeHtml(roomCount || '—'),
    GUEST_NAME: escapeHtml(booking.primary_guest_name),
    SECONDARY_GUEST: escapeHtml(booking.secondary_guest_name || '—'),
    GUEST_MOBILE: escapeHtml(booking.mobile_number),
    GUEST_EMAIL: escapeHtml(booking.email || '—'),
    GUEST_ADDRESS: escapeHtml(booking.address || '—'),
    BOOKING_STATUS: escapeHtml(humanize(booking.booking_status)),
    STATUS_TONE: STAY_TONES[booking.booking_status] || 'badge-muted',
    CHECK_IN: escapeHtml(formatDateTime(booking.check_in_date)),
    CHECK_OUT: escapeHtml(formatDateTime(booking.check_out_date)),
    CHECK_IN_DATE: escapeHtml(formatDatePart(booking.check_in_date)),
    CHECK_IN_TIME: escapeHtml(formatTimePart(booking.check_in_date)),
    CHECK_OUT_DATE: escapeHtml(formatDatePart(booking.check_out_date)),
    CHECK_OUT_TIME: escapeHtml(formatTimePart(booking.check_out_date)),
    GUEST_TOTAL: escapeHtml(guestTotal),
    PAYMENT_ROWS: buildPaymentRows(payments),
    ACTUAL_CHECK_IN: escapeHtml(formatDateTime(booking.actual_check_in)),
    ACTUAL_CHECK_OUT: escapeHtml(formatDateTime(booking.actual_check_out)),
    NIGHTS: escapeHtml(booking.number_of_nights),
    HOUSE_CHECK_IN: escapeHtml(hotel?.settings?.check_in_time || '14:00'),
    HOUSE_CHECK_OUT: escapeHtml(hotel?.settings?.check_out_time || '12:00'),
    ADULTS: escapeHtml(booking.adults),
    CHILDREN: escapeHtml(booking.children),
    ROOM_ROWS: roomRows,
    BASE_AMOUNT: money(booking.base_amount),
    DISCOUNT_AMOUNT: money(booking.discount_amount),
    EXTRA_CHARGES: money(booking.extra_charges_total),
    LATE_FEE: money(booking.late_checkout_charge),
    LATE_HOURS: escapeHtml(booking.late_checkout_hours || 0),
    TAXABLE_AMOUNT: money(booking.taxable_amount),
    GST_RATE: escapeHtml(booking.gst_rate),
    TAX_AMOUNT: money(booking.gst_amount || booking.tax_amount),
    CGST_RATE: escapeHtml(booking.cgst_rate),
    SGST_RATE: escapeHtml(booking.sgst_rate),
    CGST_AMOUNT: money(booking.cgst_amount),
    SGST_AMOUNT: money(booking.sgst_amount),
    TOTAL_AMOUNT: money(booking.total_amount),
    PAID_AMOUNT: money(booking.paid_amount),
    DUE_AMOUNT: money(booking.due_amount),
    DUE_CLASS: Number(booking.due_amount) > 0 ? 'open' : 'clear',
    PAYMENT_STATUS: escapeHtml(humanize(booking.payment_status)),
    PAYMENT_TONE: PAYMENT_TONES[booking.payment_status] || 'badge-muted',
    YEAR: String(new Date().getFullYear()),
    NOTES: escapeHtml(booking.notes || '—'),
    PREPARED_BY: escapeHtml(booking.creator?.name || 'Front desk'),
    SIGNATURE: signature,
    ID_PROOFS: idProofs,
  });
};

const getBrowser = async () => {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  browser.on('disconnected', () => {
    browser = null;
  });
  return browser;
};

const closePdfBrowser = async () => {
  if (!browser) return;
  await browser.close();
  browser = null;
};

/**
 * @param {number|string} bookingId
 * @param {Object} reqUser
 * @param {string} baseUrl
 * @returns {Promise<{ url: string, file_name: string }>}
 */
const generateBookingPdf = async (bookingId, reqUser, baseUrl) => {
  const booking = await bookingService.getBookingById(bookingId, reqUser);
  const hotel = await hotelModel.findHotelById(booking.hotel_id);
  const payments = await bookingPaymentModel.findPaymentsByBookingId(booking.id);
  const html = await buildHtml(booking, hotel, payments);

  fs.mkdirSync(PDF_DIR, { recursive: true });
  const safeNumber = String(booking.booking_number || booking.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `booking_${safeNumber}_${Date.now()}.pdf`;
  const filePath = path.join(PDF_DIR, fileName);

  const chrome = await getBrowser();
  const page = await chrome.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      // Page size comes from the template's @page rule; the 12mm margin is padding on .sheet so the background fills the page.
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } catch (err) {
    throw new AppError(
      `Failed to generate the booking PDF: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  } finally {
    await page.close();
  }

  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
  };
};

/**
 * Delete every generated folio. The job runs every 3 hours.
 * @returns {number}
 */
const clearGeneratedPdfs = () => {
  if (!fs.existsSync(PDF_DIR)) return 0;
  const files = fs.readdirSync(PDF_DIR).filter((name) => name.toLowerCase().endsWith('.pdf'));
  for (const name of files) {
    fs.unlinkSync(path.join(PDF_DIR, name));
  }
  return files.length;
};

module.exports = {
  generateBookingPdf,
  clearGeneratedPdfs,
  closePdfBrowser,
  PDF_DIR,
};
