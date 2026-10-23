/**
 * Builds booking PDFs (full folio and guest tax-invoice bill) with PDFKit.
 * No Chromium or system browser libraries are required.
 * Files are written under uploads/pdfs and removed by the cleanup job.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bookingService = require('./bookingService');
const hotelModel = require('../models/hotelModel');
const roomModel = require('../models/roomModel');
const bookingPaymentModel = require('../models/bookingPaymentModel');
const { resolveLocalPath } = require('./uploadService');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, GST_SERVICE_TYPES } = require('../constants');

const PDF_DIR = path.join(process.cwd(), 'uploads', 'pdfs');

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

const joinParts = (parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(', ');

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

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fillTemplate = (template, values) => {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`/*{{${key}}}*/`).join(value ?? '').split(`{{${key}}}`).join(value ?? '');
  }
  return html;
};

const getFontFaceCss = () => '';

const getBankDetailRows = (hotel) => [
  ['Bank', hotel?.bank_name],
  ['A/c holder', hotel?.bank_account_holder],
  ['A/c number', hotel?.bank_account_number],
  ['IFSC', hotel?.bank_ifsc_code],
  ['Branch', hotel?.bank_branch],
].map(([label, value]) => [label, String(value || '').trim()]).filter(([, value]) => value);

/**
 * @param {string} urlOrKey
 * @returns {Promise<Buffer|null>}
 */
const loadImageBuffer = async (urlOrKey) => {
  if (!urlOrKey) return null;
  const local = resolveLocalPath(urlOrKey);
  if (local && fs.existsSync(local)) {
    try {
      return fs.readFileSync(local);
    } catch (_) {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(String(urlOrKey))) return null;
  try {
    const response = await fetch(urlOrKey, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (_) {
    return null;
  }
};

/**
 * @param {string} filePath
 * @param {{ size?: string, layout?: string, margin?: number }} [options]
 * @param {(doc: PDFKit.PDFDocument) => void|Promise<void>} build
 * @returns {Promise<string>}
 */
const writePdfDocument = async (filePath, options, build) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: options.size || 'A4',
      layout: options.layout || 'portrait',
      margin: options.margin ?? 40,
      autoFirstPage: true,
      bufferPages: true,
    });
    const stream = fs.createWriteStream(filePath);
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stream.on('finish', done);
    stream.on('error', fail);
    doc.on('error', fail);
    doc.pipe(stream);
    Promise.resolve(build(doc))
      .then(() => doc.end())
      .catch(fail);
  });
  return filePath;
};

const ensureSpace = (doc, needed = 60) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const sectionTitle = (doc, title) => {
  ensureSpace(doc, 28);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(title);
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(9);
};

const kvLine = (doc, label, value, options = {}) => {
  const labelWidth = options.labelWidth || 120;
  const startX = doc.page.margins.left;
  const valueX = startX + labelWidth;
  const width = doc.page.width - doc.page.margins.right - valueX;
  ensureSpace(doc, 14);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor('#444').text(`${label}`, startX, y, { width: labelWidth - 6 });
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000')
    .text(String(value ?? '—'), valueX, y, { width });
  doc.x = startX;
};

const drawTable = (doc, columns, rows, options = {}) => {
  const startX = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = columns.reduce((sum, col) => sum + (col.width || 1), 0);
  const widths = columns.map((col) => ((col.width || 1) / totalWeight) * usable);
  const rowHeight = options.rowHeight || 16;
  const fontSize = options.fontSize || 8;

  const drawHeader = () => {
    ensureSpace(doc, rowHeight + 4);
    let x = startX;
    const y = doc.y;
    doc.rect(startX, y, usable, rowHeight).stroke('#000');
    columns.forEach((col, index) => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000')
        .text(col.label, x + 3, y + 4, {
          width: widths[index] - 6,
          align: col.align || 'left',
          lineBreak: false,
        });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  };

  drawHeader();
  rows.forEach((row) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    let x = startX;
    const y = doc.y;
    doc.rect(startX, y, usable, rowHeight).stroke('#000');
    columns.forEach((col, index) => {
      doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor('#000')
        .text(String(row.cells[index] ?? ''), x + 3, y + 4, {
          width: widths[index] - 6,
          align: col.align || 'left',
          lineBreak: false,
        });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  });
  doc.x = startX;
  doc.moveDown(0.4);
};

/**
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

  const prices = await roomModel.findNightlyPricesByIds(rooms.map((room) => room.id));
  const nightlyPrices = rooms.map((room) => prices[room.id] || 0);
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

const paymentMethodSummary = (payments, booking) => {
  const byMethod = new Map();
  for (const payment of payments) {
    if (payment.status === 'FAILED') continue;
    const label = METHOD_LABELS[payment.payment_method] || humanize(payment.payment_method);
    byMethod.set(label, (byMethod.get(label) || 0) + (Number(payment.amount) || 0));
  }
  const lines = [...byMethod.entries()]
    .filter(([, amount]) => Math.abs(amount) > 0.004)
    .map(([label, amount]) => ({
      label,
      amount: `${amount < 0 ? '−' : ''}${money(Math.abs(amount))}`,
    }));
  if (!lines.length) lines.push({ label: 'No payment received', amount: '' });
  lines.push({ label: 'Total Paid', amount: money(booking.paid_amount), bold: true });
  lines.push({ label: 'Balance Due', amount: money(booking.due_amount), bold: true });
  return lines;
};

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {Object} booking
 * @param {Object} hotel
 * @param {Array<Object>} payments
 * @param {Array<Object>} roomRows
 */
const drawBillDocument = (doc, booking, hotel, payments, roomRows) => {
  const address = joinParts([hotel?.address, hotel?.city, hotel?.state, hotel?.pincode, hotel?.country]);
  const contact = joinParts([
    hotel?.owner?.phone ? `Ph: ${hotel.owner.phone}` : '',
    hotel?.owner?.email ? `Email: ${hotel.owner.email}` : '',
  ]);
  const taxBits = [
    hotel?.gst_number ? `GSTIN: ${hotel.gst_number}` : '',
    hotel?.pan_number ? `PAN: ${hotel.pan_number}` : '',
  ].filter(Boolean).join('  |  ');

  doc.font('Helvetica-Bold').fontSize(16).text(String(hotel?.name || 'Hotel'), { align: 'center' });
  doc.font('Helvetica').fontSize(9).text(address || '—', { align: 'center' });
  if (contact) doc.text(contact, { align: 'center' });
  if (taxBits) doc.text(taxBits, { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12).text('Bill Invoice', { align: 'center' });
  doc.moveDown(0.6);

  sectionTitle(doc, 'Billed to');
  kvLine(doc, 'Guest', booking.primary_guest_name || '—', { bold: true });
  kvLine(doc, 'Address', booking.address || '—');
  kvLine(doc, 'Mobile', booking.mobile_number || '—');
  kvLine(doc, 'Email', booking.email || '—');
  kvLine(doc, 'Guests', `${booking.adults ?? 0} adult(s), ${booking.children ?? 0} child(ren)`);

  sectionTitle(doc, 'Invoice');
  kvLine(doc, 'Invoice No.', booking.booking_number || booking.id);
  kvLine(doc, 'Date', formatInvoiceDate(
    booking.actual_check_out || booking.check_out_date || booking.created_at || new Date()
  ));
  kvLine(doc, 'Check-in', formatDateTime(booking.actual_check_in || booking.check_in_date));
  kvLine(doc, 'Check-out', formatDateTime(booking.actual_check_out || booking.check_out_date));
  kvLine(doc, 'Nights', booking.number_of_nights ?? '—');
  kvLine(doc, 'Payment', humanize(booking.payment_status));

  sectionTitle(doc, 'Rooms');
  drawTable(doc, [
    { label: 'Sr', width: 0.6, align: 'center' },
    { label: 'Room', width: 1, align: 'center' },
    { label: 'Category', width: 2.2 },
    { label: 'Floor', width: 0.8, align: 'center' },
    { label: 'Nights', width: 0.8, align: 'center' },
    { label: 'Price', width: 1.2, align: 'right' },
    { label: 'Amount', width: 1.2, align: 'right' },
  ], roomRows.map((row, index) => ({
    cells: [index + 1, row.room, row.category, row.floor, row.nights, money(row.rate), money(row.amount)],
  })));

  sectionTitle(doc, 'Payment received');
  paymentMethodSummary(payments, booking).forEach((line) => {
    kvLine(doc, line.label, line.amount || '—', { bold: line.bold, labelWidth: 140 });
  });

  const bankRows = getBankDetailRows(hotel);
  if (bankRows.length) {
    sectionTitle(doc, 'Bank details');
    bankRows.forEach(([label, value]) => kvLine(doc, label, value));
  }

  sectionTitle(doc, 'Summary');
  const lateHours = Number(booking.late_checkout_hours) || 0;
  const discount = Number(booking.discount_amount) || 0;
  [
    ['Sub Total', money(booking.base_amount)],
    ['Extra Charges', money(booking.extra_charges_total)],
    [`Late Checkout${lateHours > 0 ? ` (${lateHours} h)` : ''}`, money(booking.late_checkout_charge)],
    ['Discount', `${discount > 0 ? '−' : ''}${money(discount)}`],
    ['Taxable Amount', money(booking.taxable_amount)],
    [`Central Tax (${Number(booking.cgst_rate || 0).toFixed(2)}%)`, money(booking.cgst_amount)],
    [`State/UT Tax (${Number(booking.sgst_rate || 0).toFixed(2)}%)`, money(booking.sgst_amount)],
    ['Grand Total', money(booking.total_amount)],
  ].forEach(([label, value], index, list) => {
    kvLine(doc, label, value, { bold: index === list.length - 1 || label === 'Taxable Amount' });
  });

  doc.moveDown(0.5);
  kvLine(doc, 'Bill amount', amountInWords(booking.total_amount), { labelWidth: 90 });
  kvLine(doc, 'Note', booking.notes || '—', { labelWidth: 90 });

  doc.moveDown(1);
  ensureSpace(doc, 70);
  doc.font('Helvetica').fontSize(9).text('Terms & conditions');
  doc.text('1. This is a computer-generated invoice.');
  doc.text('2. E. & O.E. Subject to local jurisdiction only.');
  doc.moveDown(1.2);
  doc.text(`For, ${hotel?.name || 'Hotel'}`, { align: 'right' });
  doc.moveDown(1.5);
  doc.text('Authorised Signatory', { align: 'right' });
  doc.moveDown(1);
  doc.fontSize(8).fillColor('#555')
    .text(`© ${new Date().getFullYear()} ${hotel?.name || 'Hotel'}. Powered by MYOWNPMS.`, { align: 'center' });
};

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {Object} booking
 * @param {Object} hotel
 * @param {Array<Object>} payments
 * @param {Array<Buffer>} imageBuffers
 * @param {Array<Buffer>} signatureBuffers
 */
const drawFolioDocument = (doc, booking, hotel, payments, imageBuffers, signatureBuffers) => {
  const rooms = Array.isArray(booking.rooms) ? booking.rooms : [];
  const address = joinParts([hotel?.address, hotel?.city, hotel?.state, hotel?.pincode, hotel?.country]);

  doc.font('Helvetica-Bold').fontSize(16).text(String(hotel?.name || 'Hotel'));
  doc.font('Helvetica').fontSize(9).fillColor('#444').text(hotel?.hotel_type || 'Hotel');
  doc.fillColor('#000').text(address || '—');
  const meta = [
    hotel?.gst_number ? `GSTIN ${hotel.gst_number}` : '',
    hotel?.pan_number ? `PAN ${hotel.pan_number}` : '',
    hotel?.owner?.phone ? `Phone ${hotel.owner.phone}` : '',
  ].filter(Boolean).join('   ');
  if (meta) doc.text(meta);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).text(`Booking folio  ${booking.booking_number || booking.id}`);
  doc.font('Helvetica').fontSize(9).text(`Printed ${formatDateTime(new Date())}`);

  sectionTitle(doc, 'Guest');
  kvLine(doc, 'Primary guest', booking.primary_guest_name);
  kvLine(doc, 'Secondary guest', booking.secondary_guest_name || '—');
  kvLine(doc, 'Mobile', booking.mobile_number);
  kvLine(doc, 'Email', booking.email || '—');
  kvLine(doc, 'Address', booking.address || '—');
  kvLine(doc, 'Status', humanize(booking.booking_status));

  sectionTitle(doc, 'Stay');
  kvLine(doc, 'Check-in', formatDateTime(booking.check_in_date));
  kvLine(doc, 'Check-out', formatDateTime(booking.check_out_date));
  kvLine(doc, 'Actual check-in', formatDateTime(booking.actual_check_in));
  kvLine(doc, 'Actual check-out', formatDateTime(booking.actual_check_out));
  kvLine(doc, 'Nights', booking.number_of_nights);
  kvLine(doc, 'Adults / children', `${booking.adults ?? 0} / ${booking.children ?? 0}`);

  sectionTitle(doc, 'Rooms');
  if (!rooms.length) {
    doc.text('No room recorded.');
  } else {
    drawTable(doc, [
      { label: 'Room', width: 1.2 },
      { label: 'Floor', width: 1 },
      { label: 'Category', width: 2.5 },
    ], rooms.map((room) => ({
      cells: [room.room_number || room.id, room.floor ?? '—', room.room_type_name || '—'],
    })));
  }

  sectionTitle(doc, 'Charges');
  [
    ['Base amount', money(booking.base_amount)],
    ['Discount', money(booking.discount_amount)],
    ['Extra charges', money(booking.extra_charges_total)],
    ['Late checkout', money(booking.late_checkout_charge)],
    ['Taxable amount', money(booking.taxable_amount)],
    [`GST (${booking.gst_rate || 0}%)`, money(booking.gst_amount || booking.tax_amount)],
    ['CGST', money(booking.cgst_amount)],
    ['SGST', money(booking.sgst_amount)],
    ['Total', money(booking.total_amount)],
    ['Paid', money(booking.paid_amount)],
    ['Due', money(booking.due_amount)],
    ['Payment status', humanize(booking.payment_status)],
  ].forEach(([label, value]) => kvLine(doc, label, value));

  sectionTitle(doc, 'Payment history');
  if (!payments.length) {
    doc.text('No payments recorded.');
  } else {
    drawTable(doc, [
      { label: 'When', width: 2.2 },
      { label: 'Method', width: 1.2 },
      { label: 'Status', width: 1.2 },
      { label: 'By', width: 1.4 },
      { label: 'Amount', width: 1.2, align: 'right' },
    ], [...payments].reverse().map((payment) => {
      const amount = Number(payment.amount || 0);
      const source = SOURCE_LABELS[payment.source] || '';
      return {
        cells: [
          `${formatDateTime(payment.received_at)}${source ? ` (${source})` : ''}`,
          METHOD_LABELS[payment.payment_method] || humanize(payment.payment_method),
          humanize(payment.status),
          payment.received_by?.name || '—',
          amount < 0 ? `−${money(Math.abs(amount))}` : money(amount),
        ],
      };
    }));
  }

  const bankRows = getBankDetailRows(hotel);
  if (bankRows.length) {
    sectionTitle(doc, 'Bank details');
    bankRows.forEach(([label, value]) => kvLine(doc, label, value));
  }

  const drawImageGrid = (title, buffers, emptyText) => {
    sectionTitle(doc, title);
    if (!buffers.length) {
      doc.text(emptyText);
      return;
    }
    const box = 150;
    const gap = 12;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    let x = left;
    let y = doc.y;
    buffers.forEach((buffer, index) => {
      if (x + box > right) {
        x = left;
        y += box + 24;
      }
      if (y + box + 20 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        x = left;
        y = doc.page.margins.top;
      }
      try {
        doc.image(buffer, x, y, { fit: [box, box], align: 'center', valign: 'center' });
      } catch (_) {
        doc.rect(x, y, box, box).stroke('#999');
        doc.fontSize(8).text('Image unavailable', x + 8, y + box / 2);
      }
      doc.fontSize(8).text(`${title.replace(/s$/, '')} ${index + 1}`, x, y + box + 4, { width: box, align: 'center' });
      x += box + gap;
      doc.y = Math.max(doc.y, y + box + 22);
    });
    doc.x = left;
    doc.moveDown(0.4);
  };

  drawImageGrid('ID proofs', imageBuffers, 'No ID proof uploaded.');
  drawImageGrid('Signatures', signatureBuffers, 'No signature uploaded.');

  doc.moveDown(0.5);
  kvLine(doc, 'Notes', booking.notes || '—');
  kvLine(doc, 'Prepared by', booking.creator?.name || 'Front desk');
  doc.moveDown(1);
  doc.fontSize(8).fillColor('#555')
    .text(`© ${new Date().getFullYear()} ${hotel?.name || 'Hotel'}. Powered by MYOWNPMS.`, { align: 'center' });
};

/**
 * @param {Object} report
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const writeGstReportPdf = async (report, filePath) => {
  const { filters, hotel, rows, grand_totals: totals } = report;
  const period = `${filters.start_date} to ${filters.end_date}`;
  return writePdfDocument(filePath, { size: 'A4', layout: 'landscape', margin: 28 }, (doc) => {
    doc.font('Helvetica-Bold').fontSize(14).text(String(hotel.name || 'Hotel'));
    doc.font('Helvetica').fontSize(8)
      .text([hotel.address, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ') || '—');
    const taxLine = [
      hotel.gstin ? `GSTIN: ${hotel.gstin}` : '',
      hotel.pan ? `PAN: ${hotel.pan}` : '',
    ].filter(Boolean).join('  |  ');
    if (taxLine) doc.text(taxLine);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('GST Report');
    doc.font('Helvetica').fontSize(8).text(`Period: ${period}`);
    doc.moveDown(0.4);

    const columns = [
      { label: 'Invoice date', width: 1.2 },
      { label: 'Invoice no.', width: 1.6 },
      { label: 'Guest', width: 1.4 },
      { label: 'Service', width: 1.2 },
      { label: 'Gross', width: 1, align: 'right' },
      { label: 'Discount', width: 1, align: 'right' },
      { label: 'Taxable', width: 1, align: 'right' },
      { label: 'GST%', width: 0.7, align: 'right' },
      { label: 'CGST', width: 0.9, align: 'right' },
      { label: 'SGST', width: 0.9, align: 'right' },
      { label: 'IGST', width: 0.8, align: 'right' },
      { label: 'Total GST', width: 1, align: 'right' },
      { label: 'Invoice total', width: 1.1, align: 'right' },
      { label: 'Status', width: 0.9 },
      { label: 'Refunded', width: 0.9, align: 'right' },
      { label: 'Net taxable', width: 1, align: 'right' },
    ];

    const bodyRows = rows.map((row) => ({
      cells: [
        row.invoice_date,
        row.invoice_number,
        row.guest_name,
        (GST_SERVICE_TYPES[row.service_type]?.label || row.service_type || '—'),
        money(row.gross_amount),
        money(row.discount_amount),
        money(row.taxable_amount),
        money(row.gst_rate),
        money(row.cgst_amount),
        money(row.sgst_amount),
        money(row.igst_amount),
        money(row.gst_total),
        money(row.invoice_total),
        row.invoice_status,
        money(row.refunded_amount),
        money(row.net_taxable_value),
      ],
    }));

    bodyRows.push({
      bold: true,
      cells: [
        'Total', '', '', '',
        money(totals.gross_amount),
        money(totals.discount_amount),
        money(totals.total_taxable_value),
        '',
        money(totals.total_cgst),
        money(totals.total_sgst),
        money(totals.total_igst),
        money(totals.total_gst),
        money(totals.total_stored_invoice),
        '',
        money(totals.refunded_amount),
        money(totals.net_taxable_value),
      ],
    });

    drawTable(doc, columns, bodyRows, { fontSize: 7, rowHeight: 14 });
    doc.fontSize(8).fillColor('#555')
      .text(`© ${new Date().getFullYear()} ${hotel.name || 'Hotel'}. Powered by MYOWNPMS.`, { align: 'center' });
  });
};

const loadDocumentSources = async (bookingId, reqUser, includeMedia) => {
  const booking = await bookingService.getBookingById(bookingId, reqUser, { includeMedia });
  const [hotel, payments] = await Promise.all([
    hotelModel.findHotelForDocument(booking.hotel_id),
    bookingPaymentModel.findPaymentsByBookingId(booking.id),
  ]);
  return { booking, hotel, payments };
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
  const { booking, hotel, payments } = await loadDocumentSources(bookingId, reqUser, true);
  const fileName = `booking_${safeBookingFileToken(booking)}_${Date.now()}.pdf`;
  const filePath = path.join(PDF_DIR, fileName);
  try {
    const [imageBuffers, signatureBuffers] = await Promise.all([
      Promise.all((booking.images || []).map(loadImageBuffer)),
      Promise.all((booking.signatures || []).map(loadImageBuffer)),
    ]);
    await writePdfDocument(filePath, { margin: 40 }, (doc) => {
      drawFolioDocument(
        doc,
        booking,
        hotel,
        payments,
        imageBuffers.filter(Boolean),
        signatureBuffers.filter(Boolean)
      );
    });
  } catch (err) {
    throw new AppError(
      `Failed to generate the booking PDF: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
  };
};

/**
 * Guest tax-invoice bill slip for a booking.
 * @param {number|string} bookingId
 * @param {Object} reqUser
 * @param {string} baseUrl
 * @returns {Promise<{ url: string, file_name: string }>}
 */
const generateBookingBillPdf = async (bookingId, reqUser, baseUrl) => {
  const { booking, hotel, payments } = await loadDocumentSources(bookingId, reqUser, false);
  const fileName = `bill_${safeBookingFileToken(booking)}_${Date.now()}.pdf`;
  const filePath = path.join(PDF_DIR, fileName);
  try {
    const roomRows = await buildRoomBillRows(booking, Array.isArray(booking.rooms) ? booking.rooms : []);
    await writePdfDocument(filePath, { margin: 36 }, (doc) => {
      drawBillDocument(doc, booking, hotel, payments, roomRows);
    });
  } catch (err) {
    throw new AppError(
      `Failed to generate the booking bill: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return {
    url: `${baseUrl}/uploads/pdfs/${fileName}`,
    file_name: fileName,
  };
};

/**
 * @param {Object} report
 * @param {string} fileName
 * @returns {Promise<string>} Absolute path
 */
const renderGstReportPdf = async (report, fileName) => {
  const filePath = path.join(PDF_DIR, fileName);
  try {
    await writeGstReportPdf(report, filePath);
  } catch (err) {
    throw new AppError(
      `Failed to generate the GST report: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return filePath;
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

const closePdfBrowser = async () => {};

module.exports = {
  generateBookingPdf,
  generateBookingBillPdf,
  clearGeneratedPdfs,
  closePdfBrowser,
  renderGstReportPdf,
  fillTemplate,
  getFontFaceCss,
  escapeHtml,
  PDF_DIR,
};
