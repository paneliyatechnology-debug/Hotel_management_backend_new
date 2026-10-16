/**
 * Builds booking PDFs (full folio and guest tax-invoice bill) from booking and hotel records.
 * Files are written under uploads/pdfs and removed by the cleanup job.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const bookingService = require('./bookingService');
const hotelModel = require('../models/hotelModel');
const roomModel = require('../models/roomModel');
const bookingPaymentModel = require('../models/bookingPaymentModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const PDF_DIR = path.join(process.cwd(), 'uploads', 'pdfs');
const FOLIO_TEMPLATE_PATH = path.join(__dirname, '../templates/bookingFolio.html');
const BILL_TEMPLATE_PATH = path.join(__dirname, '../templates/bookingBill.html');

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

/** Invoice date in DD/MM/YYYY (same style as the sales bill reference). */
const formatInvoiceDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
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

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return `${TENS[ten]}${one ? ` ${ONES[one]}` : ''}`;
};

const threeDigits = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred && rest) return `${ONES[hundred]} Hundred ${twoDigits(rest)}`;
  if (hundred) return `${ONES[hundred]} Hundred`;
  return twoDigits(rest);
};

/**
 * Indian-style amount in words for the tax invoice (e.g. "Rupees One Thousand Only").
 * @param {number|string} value
 * @returns {string}
 */
const amountInWords = (value) => {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  if (amount === 0) return 'Rupees Zero Only';

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const convert = (num) => {
    if (num === 0) return '';
    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const hundredRest = num % 1000;
    const parts = [];
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
    if (hundredRest) parts.push(threeDigits(hundredRest));
    return parts.join(' ');
  };

  let words = `Rupees ${convert(rupees)}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
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
 * Methods the guest actually paid with, for example "via Cash, UPI".
 * Refunds and failed payments are not counted. Returns an empty string when nothing was paid.
 * @param {Array<Object>} payments
 * @returns {string}
 */
const buildPaidMethods = (payments) => {
  const methods = [...new Set(
    [...payments]
      .reverse()
      .filter((payment) => Number(payment.amount) > 0 && payment.status !== 'FAILED')
      .map((payment) => METHOD_LABELS[payment.payment_method] || humanize(payment.payment_method))
  )];
  return methods.length ? `<div class="tile-sub">via ${escapeHtml(methods.join(', '))}</div>` : '';
};

/**
 * Bank details the hotel has filled in, as [label, value] pairs.
 * Empty when the hotel has not added any, so the PDFs can leave the section out.
 * @param {Object} hotel
 * @returns {Array<[string, string]>}
 */
const getBankDetailRows = (hotel) => [
  ['Bank', hotel?.bank_name],
  ['A/c holder', hotel?.bank_account_holder],
  ['A/c number', hotel?.bank_account_number],
  ['IFSC', hotel?.bank_ifsc_code],
  ['Branch', hotel?.bank_branch],
].map(([label, value]) => [label, String(value || '').trim()]).filter(([, value]) => value);

/**
 * Folio card listing the hotel's bank details. Empty when none are set.
 * @param {Object} hotel
 * @returns {string}
 */
const buildFolioBankSection = (hotel) => {
  const rows = getBankDetailRows(hotel);
  if (!rows.length) return '';
  const body = rows
    .map(([label, value]) => `<tr><td class="k">${label}</td><td class="v">${escapeHtml(value)}</td></tr>`)
    .join('');
  return `
    <section class="card">
      <div class="card-head"><div class="card-title">Bank details</div></div>
      <div class="card-body"><table class="rows">${body}</table></div>
    </section>`;
};

/**
 * Bill block listing the hotel's bank details. Empty when none are set.
 * @param {Object} hotel
 * @returns {string}
 */
const buildBillBankBlock = (hotel) => {
  const rows = getBankDetailRows(hotel);
  if (!rows.length) return '';
  const body = rows
    .map(([label, value]) => `
          <tr><td class="k">${label}</td><td class="s">:</td><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `
        <div class="block bank">
          <div class="block-title">Bank details</div>
          <table class="kv">${body}
          </table>
        </div>`;
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

/**
 * Replace {{KEY}} placeholders. Inside a <style> block a key is written as a CSS comment,
 * like /*{{KEY}}*\/, so the template stays valid CSS for editors. The whole comment is replaced.
 * @param {string} template
 * @param {Object<string, string>} values
 * @returns {string}
 */
const fillTemplate = (template, values) => {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`/*{{${key}}}*/`).join(value ?? '').split(`{{${key}}}`).join(value ?? '');
  }
  return html;
};

const buildHtml = async (booking, hotel, payments) => {
  const template = fs.readFileSync(FOLIO_TEMPLATE_PATH, 'utf8');
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
    PAID_METHODS: buildPaidMethods(payments),
    BANK_SECTION: buildFolioBankSection(hotel),
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

/**
 * Split the stay across rooms: one row per room with its nightly price and line amount.
 * Uses each room's custom_price_per_night. If the booking base_amount was set manually
 * and differs, the amount is shared by those prices (or equally when no price is set),
 * so the room rows always add up to the booking's base_amount.
 * @param {Object} booking
 * @param {Array<Object>} rooms
 * @returns {Promise<Array<{ room: string, category: string, floor: string|number, nights: number, rate: number, amount: number }>>}
 */
const buildRoomBillRows = async (booking, rooms) => {
  const nights = Math.max(1, Number(booking.number_of_nights) || 1);
  const baseAmount = Math.round((Number(booking.base_amount) || 0) * 100) / 100;

  if (!rooms.length) {
    return [{
      room: '—', category: 'Room stay', floor: '—', nights, rate: baseAmount / nights, amount: baseAmount,
    }];
  }

  const nightlyPrices = await Promise.all(rooms.map(async (room) => {
    try {
      const found = await roomModel.findRoomById(room.id);
      return Number(found?.custom_price_per_night) || 0;
    } catch (_) {
      return 0;
    }
  }));
  const nightlyTotal = nightlyPrices.reduce((sum, price) => sum + price, 0);

  let amounts;
  if (nightlyTotal > 0 && Math.abs(nightlyTotal * nights - baseAmount) < 0.01) {
    amounts = nightlyPrices.map((price) => Math.round(price * nights * 100) / 100);
  } else {
    const weights = nightlyTotal > 0 ? nightlyPrices : rooms.map(() => 1);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    let allocated = 0;
    amounts = weights.map((weight, index) => {
      if (index === weights.length - 1) return Math.round((baseAmount - allocated) * 100) / 100;
      const share = Math.round(((baseAmount * weight) / weightTotal) * 100) / 100;
      allocated += share;
      return share;
    });
  }

  return rooms.map((room, index) => ({
    room: String(room.room_number || room.id),
    category: room.room_type_name || '—',
    floor: room.floor ?? '—',
    nights,
    rate: amounts[index] / nights,
    amount: amounts[index],
  }));
};

/**
 * Table body: Sr No, Room, Category, Floor, Nights, Room Price (per night), Amount.
 * @param {Array<Object>} rows - From buildRoomBillRows
 * @returns {string}
 */
const buildBillLineItems = (rows) => rows.map((row, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td class="c desc">${escapeHtml(row.room)}</td>
        <td class="l">${escapeHtml(row.category)}</td>
        <td class="c">${escapeHtml(row.floor)}</td>
        <td class="c">${escapeHtml(row.nights)}</td>
        <td class="r">${money(row.rate)}</td>
        <td class="r">${money(row.amount)}</td>
      </tr>
    `).join('');

/**
 * "Payment Received" block: one line per payment method with the net amount paid by it,
 * then the total paid and the balance due. Refunds reduce their method; failed payments are ignored.
 * @param {Array<Object>} payments
 * @param {Object} booking
 * @returns {string}
 */
const buildBillPaymentMethodRows = (payments, booking) => {
  const byMethod = new Map();
  for (const payment of payments) {
    if (payment.status === 'FAILED') continue;
    const label = METHOD_LABELS[payment.payment_method] || humanize(payment.payment_method);
    byMethod.set(label, (byMethod.get(label) || 0) + (Number(payment.amount) || 0));
  }

  const lines = [...byMethod.entries()]
    .filter(([, amount]) => Math.abs(amount) > 0.004)
    .map(([label, amount]) => `
      <tr>
        <td class="m">${escapeHtml(label)}</td><td class="s">:</td>
        <td class="a">${amount < 0 ? '−' : ''}${money(Math.abs(amount))}</td>
      </tr>`);

  if (!lines.length) {
    lines.push('<tr><td class="none" colspan="3">No payment received.</td></tr>');
  }

  lines.push(`
      <tr class="total">
        <td class="m">Total Paid</td><td class="s">:</td>
        <td class="a">${money(booking.paid_amount)}</td>
      </tr>`);
  lines.push(`
      <tr class="due">
        <td class="m">Balance Due</td><td class="s">:</td>
        <td class="a">${money(booking.due_amount)}</td>
      </tr>`);
  return lines.join('');
};

/**
 * Totals box: Sub Total, Discount, Taxable Amount, CGST, SGST, Extra charges,
 * Late checkout, Grand Total. Amounts are in INR.
 * @param {Object} booking
 * @returns {string}
 */
const buildBillSummaryRows = (booking) => {
  const row = (label, value, cls = '') => `
      <tr class="${cls}">
        <td>${label}</td>
        <td class="v">${value}</td>
      </tr>`;
  const cgstRate = Number(booking.cgst_rate || 0).toFixed(2);
  const sgstRate = Number(booking.sgst_rate || 0).toFixed(2);
  const lateHours = Number(booking.late_checkout_hours) || 0;
  const discount = Number(booking.discount_amount) || 0;

  return [
    row('Sub Total', money(booking.base_amount), 'head'),
    row('Discount', `${discount > 0 ? '−' : ''}${money(discount)}`, 'minus'),
    row('Taxable Amount', money(booking.taxable_amount), 'strong'),
    row(`Central Tax (${cgstRate}%)`, money(booking.cgst_amount)),
    row(`State/UT Tax (${sgstRate}%)`, money(booking.sgst_amount)),
    row('Extra Charges', money(booking.extra_charges_total)),
    row(`Late Checkout Charges${lateHours > 0 ? ` (${lateHours} h)` : ''}`, money(booking.late_checkout_charge)),
    row('Grand Total', money(booking.total_amount), 'grand'),
  ].join('');
};
/**
 * Clean bill invoice (rooms, charges, payment history) for a booking.
 * @param {Object} booking
 * @param {Object} hotel
 * @param {Array<Object>} payments
 * @returns {Promise<string>}
 */
const buildBillHtml = async (booking, hotel, payments) => {
  const template = fs.readFileSync(BILL_TEMPLATE_PATH, 'utf8');
  const rooms = Array.isArray(booking.rooms) ? booking.rooms : [];
  const address = joinParts([hotel?.address, hotel?.city, hotel?.state, hotel?.pincode, hotel?.country]);
  const contact = joinParts([
    hotel?.owner?.phone ? `Ph: ${hotel.owner.phone}` : '',
    hotel?.owner?.email ? `Email: ${hotel.owner.email}` : '',
  ]);

  const gstin = String(hotel?.gst_number || '').trim();
  const pan = String(hotel?.pan_number || '').trim();
  // GSTIN and PAN sit under the hotel address in the header, only when the hotel has them.
  const hotelTaxLine = [
    gstin ? `GSTIN: ${escapeHtml(gstin)}` : '',
    pan ? `PAN: ${escapeHtml(pan)}` : '',
  ].filter(Boolean).join('<span class="sep">|</span>');

  const notes = String(booking.notes || '').trim();
  const invoiceNo = String(booking.booking_number || booking.id);
  const roomRows = await buildRoomBillRows(booking, rooms);

  return fillTemplate(template, {
    FONT_FACE: getFontFaceCss(),
    HOTEL_NAME: escapeHtml(hotel?.name || 'Hotel'),
    HOTEL_ADDRESS: escapeHtml(address || '—'),
    HOTEL_CONTACT: escapeHtml(contact || ''),
    HOTEL_TAX_LINE: hotelTaxLine,
    INVOICE_NO: escapeHtml(invoiceNo),
    INVOICE_DATE: escapeHtml(formatInvoiceDate(
      booking.actual_check_out || booking.check_out_date || booking.created_at || new Date()
    )),
    PAYMENT_STATUS: escapeHtml(humanize(booking.payment_status)),
    GUEST_NAME: escapeHtml(booking.primary_guest_name || '—'),
    GUEST_ADDRESS: escapeHtml(booking.address || '—'),
    GUEST_MOBILE: escapeHtml(booking.mobile_number || '—'),
    GUEST_EMAIL: escapeHtml(booking.email || '—'),
    ADULTS: escapeHtml(booking.adults ?? 0),
    CHILDREN: escapeHtml(booking.children ?? 0),
    CHECK_IN: escapeHtml(formatDateTime(booking.actual_check_in || booking.check_in_date)),
    CHECK_OUT: escapeHtml(formatDateTime(booking.actual_check_out || booking.check_out_date)),
    NIGHTS: escapeHtml(booking.number_of_nights ?? '—'),
    LINE_ITEMS: buildBillLineItems(roomRows),
    SUMMARY_ROWS: buildBillSummaryRows(booking),
    PAYMENT_METHOD_ROWS: buildBillPaymentMethodRows(payments, booking),
    BANK_BLOCK: buildBillBankBlock(hotel),
    AMOUNT_IN_WORDS: escapeHtml(amountInWords(booking.total_amount)),
    NOTES: escapeHtml(notes || '—'),
    YEAR: String(new Date().getFullYear()),
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
 * Render HTML to a PDF file under uploads/pdfs.
 * @param {string} html
 * @param {string} fileName
 * @param {string} errorLabel
 * @returns {Promise<string>} Absolute file path
 */
const renderPdfFile = async (html, fileName, errorLabel) => {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const filePath = path.join(PDF_DIR, fileName);
  const chrome = await getBrowser();
  const page = await chrome.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');
    // The bill template shrinks itself to one page; measure again now that fonts are loaded.
    await page.evaluate(() => { if (typeof window.fitToPage === 'function') window.fitToPage(); });
    // Templates may ask for a print scale (the bill uses it to get hairline borders).
    const scale = await page.evaluate(() => (typeof window.pdfScale === 'number' ? window.pdfScale : 1));
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      scale,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } catch (err) {
    throw new AppError(
      `Failed to generate the ${errorLabel}: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  } finally {
    await page.close();
  }
  return filePath;
};

const safeBookingFileToken = (booking) =>
  String(booking.booking_number || booking.id).replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Full booking folio (stay, charges, payment history, ID proofs).
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
  const fileName = `booking_${safeBookingFileToken(booking)}_${Date.now()}.pdf`;
  await renderPdfFile(html, fileName, 'booking PDF');
  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
  };
};

/**
 * Guest tax-invoice bill slip for a booking (professional bill only).
 * @param {number|string} bookingId
 * @param {Object} reqUser
 * @param {string} baseUrl
 * @returns {Promise<{ url: string, file_name: string }>}
 */
const generateBookingBillPdf = async (bookingId, reqUser, baseUrl) => {
  const booking = await bookingService.getBookingById(bookingId, reqUser);
  const hotel = await hotelModel.findHotelById(booking.hotel_id);
  const payments = await bookingPaymentModel.findPaymentsByBookingId(booking.id);
  const html = await buildBillHtml(booking, hotel, payments);
  const fileName = `bill_${safeBookingFileToken(booking)}_${Date.now()}.pdf`;
  await renderPdfFile(html, fileName, 'booking bill');
  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
  };
};

/**
 * Delete every generated PDF and Excel file. The job runs every 3 hours.
 * @returns {number}
 */
const clearGeneratedPdfs = () => {
  if (!fs.existsSync(PDF_DIR)) return 0;
  const files = fs.readdirSync(PDF_DIR).filter((name) => /\.(pdf|xlsx)$/i.test(name));
  for (const name of files) {
    fs.unlinkSync(path.join(PDF_DIR, name));
  }
  return files.length;
};

module.exports = {
  generateBookingPdf,
  generateBookingBillPdf,
  clearGeneratedPdfs,
  closePdfBrowser,
  renderPdfFile,
  fillTemplate,
  getFontFaceCss,
  escapeHtml,
  PDF_DIR,
};
