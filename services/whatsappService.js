/**
 * WhatsApp Cloud API client for booking confirmations.
 * One Business sender is configured in the environment. Each message names the hotel
 * that owns the booking, taken from the authenticated hotel scope.
 * A failed send is the caller's problem to isolate: this module never rolls a booking back.
 *
 * The approved template must use seven body variables, in this order:
 * guest name, hotel name, booking number, room details, check-in, check-out, total amount.
 */
const db = require('../database/knex');
const bookingService = require('./bookingService');

const SEND_TIMEOUT_MS = 15000;
const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/i;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2}(?:_[A-Z]{2})?$/;

// Graph API codes that will not succeed on another attempt with the same payload.
const PERMANENT_ERROR_CODES = new Set([
  100, 190, 368, 131026, 131051, 132000, 132001, 132005, 132007, 132012, 132015, 133010,
]);

let missingConfigWarningShown = false;

class WhatsAppSendError extends Error {
  /**
   * @param {string} message
   * @param {{ retryable?: boolean, statusCode?: number|null }} [options]
   */
  constructor(message, { retryable = true, statusCode = null } = {}) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

/**
 * Hide the middle of a phone number in logs.
 * @param {string} phone
 * @returns {string}
 */
const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return 'unknown';
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
};

/**
 * WhatsApp template values cannot contain new lines or a run of spaces.
 * @param {*} value
 * @returns {string}
 */
const sanitizeTemplateParameter = (value) => {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 900);
  return text || '-';
};

const readConfig = () => ({
  enabledFlag: (process.env.WHATSAPP_ENABLED || '').trim().toLowerCase(),
  token: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
  phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
  templateName: (process.env.WHATSAPP_BOOKING_TEMPLATE_NAME || 'booking_confirmation').trim(),
  languageCode: (process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim(),
  graphVersion: (process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0').trim(),
  defaultCountryCode: String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),
});

/**
 * Sending is off when the flag says so, or when the sender credentials are absent.
 * @param {ReturnType<typeof readConfig>} config
 * @returns {boolean}
 */
const isDeliveryEnabled = (config) => {
  if (config.enabledFlag === 'false' || config.enabledFlag === '0') return false;
  return Boolean(config.token && config.phoneNumberId);
};

/**
 * Turn a guest mobile into the digits WhatsApp expects (country code, no plus).
 * A 10-digit local number receives WHATSAPP_DEFAULT_COUNTRY_CODE.
 * @param {*} value
 * @param {string} [defaultCountryCode]
 * @returns {string|null}
 */
const normalizeWhatsAppNumber = (value, defaultCountryCode) => {
  const countryCode = String(
    defaultCountryCode === undefined ? readConfig().defaultCountryCode : defaultCountryCode
  ).replace(/\D/g, '');
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && countryCode) {
    digits = `${countryCode}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

/**
 * @param {string|Date|null} value
 * @returns {string}
 */
const formatStayDate = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeTemplateParameter(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

/**
 * One line the template can show for every room on the stay.
 * @param {Array<Object>} rooms
 * @returns {string}
 */
const formatRoomDetails = (rooms) => {
  if (!Array.isArray(rooms) || rooms.length === 0) return '-';
  return rooms.map((room) => {
    const number = room.room_number ? String(room.room_number) : `Room ${room.id}`;
    const type = room.room_type_name ? ` ${room.room_type_name}` : '';
    const floor = room.floor !== undefined && room.floor !== null && String(room.floor).trim() !== ''
      ? `, floor ${room.floor}`
      : '';
    return `${number}${type}${floor}`;
  }).join(', ');
};

/**
 * Load the saved booking for this hotel and build the template job.
 * Returns null when there is nothing to send. Throws only when the booking cannot be read.
 * @param {number|string} bookingId
 * @param {Object} reqUser
 * @returns {Promise<Object|null>}
 */
const buildBookingConfirmation = async (bookingId, reqUser) => {
  const config = readConfig();
  if (config.enabledFlag === 'false' || config.enabledFlag === '0') {
    console.log(`[WhatsApp] Skipped booking ${bookingId}. WHATSAPP_ENABLED is off.`);
    return null;
  }

  const booking = await bookingService.getBookingById(bookingId, reqUser, { includeMedia: false });
  const to = normalizeWhatsAppNumber(booking.mobile_number, config.defaultCountryCode);
  if (!to) {
    console.warn(
      `[WhatsApp] Skipped booking ${booking.booking_number || bookingId} for hotel ${booking.hotel_id}. ` +
      `mobile_number is not a sendable WhatsApp number (${maskPhone(booking.mobile_number)}).`
    );
    return null;
  }

  const hotelRow = await db('hotels').where({ id: booking.hotel_id }).first('currency');
  const currency = String(hotelRow?.currency || 'INR').trim() || 'INR';
  const total = `${currency} ${Number(booking.total_amount || 0).toFixed(2)}`;
  const hotelName = booking.hotel?.name || 'Hotel';

  return {
    type: 'BOOKING_CONFIRMATION',
    hotelId: Number(booking.hotel_id),
    bookingId: Number(booking.id),
    bookingNumber: booking.booking_number || String(booking.id),
    to,
    parameters: [
      booking.primary_guest_name,
      hotelName,
      booking.booking_number || String(booking.id),
      formatRoomDetails(booking.rooms),
      formatStayDate(booking.check_in_date),
      formatStayDate(booking.check_out_date),
      total,
    ].map(sanitizeTemplateParameter),
    createdAt: new Date().toISOString(),
  };
};

/**
 * POST a template message to the configured WhatsApp sender.
 * Network failures and rate limits throw a retryable error. A rejected template or number does not.
 * @param {Object} job
 * @returns {Promise<Object>}
 */
const sendBookingConfirmation = async (job) => {
  const config = readConfig();
  const to = normalizeWhatsAppNumber(job.to, config.defaultCountryCode);
  const bookingLabel = job.bookingNumber || job.bookingId;

  if (!to) {
    console.error(`[WhatsApp] Booking ${bookingLabel} has no sendable number. Not retrying.`);
    return { success: false, permanent: true };
  }

  if (process.env.NODE_ENV === 'test' || !isDeliveryEnabled(config)) {
    if (process.env.NODE_ENV !== 'test' && !isDeliveryEnabled(config) && config.enabledFlag !== 'false' && config.enabledFlag !== '0') {
      if (!missingConfigWarningShown) {
        missingConfigWarningShown = true;
        console.warn(
          '[WhatsApp] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set. Confirmations are logged and not sent.'
        );
      }
    }
    console.log(
      `[WhatsApp] Simulated confirmation for booking ${bookingLabel} hotel ${job.hotelId} to ${maskPhone(to)}.`
    );
    return { success: true, simulated: true };
  }

  if (!TEMPLATE_NAME_PATTERN.test(config.templateName) || !LANGUAGE_CODE_PATTERN.test(config.languageCode)) {
    throw new WhatsAppSendError(
      'WHATSAPP_BOOKING_TEMPLATE_NAME or WHATSAPP_TEMPLATE_LANGUAGE is not a valid template identifier.',
      { retryable: false }
    );
  }

  const parameters = (Array.isArray(job.parameters) ? job.parameters : []).map(sanitizeTemplateParameter);
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.languageCode },
          components: [
            {
              type: 'body',
              parameters: parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    });
  } catch (err) {
    throw new WhatsAppSendError(`WhatsApp request failed: ${err.message}`, { retryable: true });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const graphError = data.error || {};
    const code = Number(graphError.code) || null;
    const permanent = code !== null && PERMANENT_ERROR_CODES.has(code) && response.status !== 429 && response.status < 500;
    const detail = graphError.message || `HTTP ${response.status}`;
    console.error(
      `[WhatsApp] Send failed for booking ${bookingLabel} hotel ${job.hotelId} to ${maskPhone(to)} ` +
      `(HTTP ${response.status}, code ${code || 'none'}): ${detail}`
    );
    throw new WhatsAppSendError(`WhatsApp Cloud API error (${response.status}): ${detail}`, {
      retryable: !permanent,
      statusCode: response.status,
    });
  }

  const messageId = data.messages && data.messages[0] ? data.messages[0].id : null;
  console.log(
    `[WhatsApp] Confirmation sent for booking ${bookingLabel} hotel ${job.hotelId} to ${maskPhone(to)} ` +
    `(message ${messageId || 'unknown'}).`
  );
  return { success: true, messageId };
};

module.exports = {
  maskPhone,
  normalizeWhatsAppNumber,
  sanitizeTemplateParameter,
  buildBookingConfirmation,
  sendBookingConfirmation,
  WhatsAppSendError,
};
