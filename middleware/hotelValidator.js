/**
 * Hotel Request Validation Middleware.
 * Validates hotel registration, super admin hotel management and list queries.
 * Standardized on snake_case.
 */
const { body, param, query } = require('express-validator');
// Indian Mobile Number Normalizer & Custom Validator
const validateIndianMobile = (value) => {
  if (!value) return false;
  const cleaned = String(value).replace(/^(\+91|0)/, '').replace(/[\s-]/g, '');
  return /^[6-9]\d{9}$/.test(cleaned);
};

// GSTIN Regex Pattern (15 characters)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

// PAN Regex Pattern (10 characters)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;

// Bank account number (9 to 18 digits) and IFSC code (4 letters, a zero, 6 letters or digits)
const BANK_ACCOUNT_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

// Pincode Regex Pattern (6 digits)
const PINCODE_REGEX = /^\d{6}$/;

// ==========================================
// Rules shared by registration and update.
// Each call returns a fresh chain, so a chain is never reused.
// ==========================================

const withPincodeFormat = (chain) =>
  chain.custom((val) => {
    if (!PINCODE_REGEX.test(String(val).trim())) {
      throw new Error('Please provide a valid 6-digit Indian postal pincode.');
    }
    return true;
  });

const gstNumberRule = () =>
  body('gst_number')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !GSTIN_REGEX.test(val)) {
        throw new Error('Please provide a valid 15-character GSTIN format (e.g. 24AAAAA0000A1Z5).');
      }
      return true;
    });

const panNumberRule = () =>
  body('pan_number')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !PAN_REGEX.test(val)) {
        throw new Error('Please provide a valid 10-character PAN format (e.g. ABCDE1234F).');
      }
      return true;
    });

// ==========================================
// Optional bank details printed on bills and folios.
// An empty value is allowed, so a field can be cleared on update.
// ==========================================

const bankTextRule = (field, label, max) =>
  body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max })
    .withMessage(`${label} cannot exceed ${max} characters.`);

const bankAccountNumberRule = () =>
  body('bank_account_number')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !BANK_ACCOUNT_REGEX.test(val)) {
        throw new Error('Bank account number must be 9 to 18 digits.');
      }
      return true;
    });

const bankIfscRule = () =>
  body('bank_ifsc_code')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !IFSC_REGEX.test(val)) {
        throw new Error('Please provide a valid 11-character IFSC code (e.g. HDFC0001234).');
      }
      return true;
    });

const bankDetailRules = () => [
  bankTextRule('bank_name', 'Bank name', 150),
  bankTextRule('bank_account_holder', 'Account holder name', 150),
  bankAccountNumberRule(),
  bankIfscRule(),
  bankTextRule('bank_branch', 'Bank branch', 150),
];

const totalRoomsRule = () =>
  body('total_rooms')
    .optional()
    .custom((val) => {
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
          throw new Error('Total rooms must be a non-negative integer.');
        }
      }
      return true;
    });

const websiteRule = () =>
  body('website')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val) {
        try {
          new URL(val.startsWith('http') ? val : `https://${val}`);
        } catch (_) {
          throw new Error('Please provide a valid website URL.');
        }
      }
      return true;
    });

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const parseListInput = (value, field) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value).trim();
  if (text.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new Error(`${field} must be a JSON array or a comma-separated list.`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${field} must be a JSON array or a comma-separated list.`);
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }
  return text.split(',').map((item) => item.trim()).filter(Boolean);
};

// Operational settings stored on the hotels row (also returned under hotel.settings).
const hotelSettingsRules = () => [
  body('check_in_time')
    .optional({ checkFalsy: true })
    .trim()
    .matches(TIME_HHMM)
    .withMessage('check_in_time must be HH:mm in 24-hour format (e.g. 14:00).'),

  body('check_out_time')
    .optional({ checkFalsy: true })
    .trim()
    .matches(TIME_HHMM)
    .withMessage('check_out_time must be HH:mm in 24-hour format (e.g. 12:00).'),

  body('timezone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('timezone cannot exceed 50 characters.'),

  body('currency')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 10 })
    .withMessage('currency must be 3 to 10 characters (e.g. INR).'),

  body('tax_percentage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('tax_percentage must be a number between 0 and 100.'),

  body('gst_enabled')
    .optional()
    .isBoolean()
    .withMessage('gst_enabled must be a boolean (true or false).'),

  body('upi_id')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('upi_id cannot exceed 100 characters.'),

  body('late_checkout_grace_minutes')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 1440 })
    .withMessage('late_checkout_grace_minutes must be an integer from 0 to 1440.'),

  body('amenities')
    .optional({ checkFalsy: true })
    .custom((val) => {
      parseListInput(val, 'amenities');
      return true;
    }),

  body('policies')
    .optional({ checkFalsy: true })
    .custom((val) => {
      parseListInput(val, 'policies');
      return true;
    }),
];

// ==========================================
// POST /hotels/register and POST /hotels
// ==========================================

const registerHotelValidator = [
  // Required: Property & Owner Details
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Hotel property name is required')
    .isLength({ max: 150 })
    .withMessage('Hotel name cannot exceed 150 characters'),

  body('owner_name')
    .trim()
    .notEmpty()
    .withMessage('Owner / General Manager name is required')
    .isLength({ max: 150 })
    .withMessage('Owner name cannot exceed 150 characters'),

  body('owner_email')
    .trim()
    .notEmpty()
    .withMessage('Owner email address is required')
    .isEmail()
    .withMessage('Please provide a valid email address format (e.g. owner@example.com)')
    .normalizeEmail(),

  body('owner_phone')
    .trim()
    .notEmpty()
    .withMessage('Owner mobile number is required')
    .custom((val) => {
      if (!validateIndianMobile(val)) {
        throw new Error('Please provide a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).');
      }
      return true;
    }),

  // Required: Location & Address
  body('address')
    .trim()
    .notEmpty()
    .withMessage('Hotel property address is required'),

  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ max: 100 }),

  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isLength({ max: 100 }),

  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  withPincodeFormat(
    body('pincode')
      .trim()
      .notEmpty()
      .withMessage('Pincode is required')
  ),

  // Optional: Tax & Registration Details
  gstNumberRule(),
  panNumberRule(),
  ...bankDetailRules(),
  totalRoomsRule(),

  body('hotel_type')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  websiteRule(),
  ...hotelSettingsRules(),

  body('subscription_plan_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('subscription_plan_id must be a valid positive integer ID'),

  body('subscription_plan_active')
    .optional()
    .isBoolean()
    .withMessage('subscription_plan_active must be a boolean'),
];

// ==========================================
// Super admin: list, read, update, delete
// ==========================================

const hotelIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Hotel ID must be a positive integer.'),
];

const getHotelsQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),

  query('search')
    .optional()
    .trim(),

  query('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be true or false.'),

  query('subscription_plan_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('subscription_plan_id must be a positive integer.'),

  query('subscription_plan_active')
    .optional()
    .isBoolean()
    .withMessage('subscription_plan_active must be true or false.'),

  query('sort_by')
    .optional()
    .isIn(['id', 'name', 'city', 'is_active', 'created_at', 'updated_at'])
    .withMessage('sort_by must be one of: id, name, city, is_active, created_at, updated_at.'),

  query('sort_order')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc.'),
];

// Hotel profile fields every update may carry. Used by the super admin and the hotel admin updates.
const hotelProfileUpdateRules = () => [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Hotel name cannot be empty')
    .isLength({ max: 150 })
    .withMessage('Hotel name cannot exceed 150 characters'),

  body('address')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Address cannot be empty'),

  body('city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('City cannot be empty')
    .isLength({ max: 100 }),

  body('state')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('State cannot be empty')
    .isLength({ max: 100 }),

  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  withPincodeFormat(body('pincode').optional().trim()),
  gstNumberRule(),
  panNumberRule(),
  ...bankDetailRules(),

  body('hotel_type')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  websiteRule(),
  ...hotelSettingsRules(),
];

const updateHotelValidator = [
  ...hotelIdValidator,
  ...hotelProfileUpdateRules(),
  totalRoomsRule(),

  body('subscription_plan_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('subscription_plan_id must be a valid positive integer ID'),

  body('subscription_plan_active')
    .optional()
    .isBoolean()
    .withMessage('subscription_plan_active must be a boolean'),

  body('subscription_plan_start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('subscription_plan_start_date must be a valid ISO date'),

  body('subscription_plan_end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('subscription_plan_end_date must be a valid ISO date'),

  body('auto_renew')
    .optional()
    .isBoolean()
    .withMessage('auto_renew must be a boolean'),
];

// Hotel admin: own hotel profile only. Locked fields are refused by the service.
const updateOwnHotelValidator = hotelProfileUpdateRules();

const updateHotelActiveStatusValidator = [
  ...hotelIdValidator,

  body('is_active')
    .exists({ checkNull: true })
    .withMessage('is_active is required.')
    .isBoolean()
    .withMessage('is_active must be true or false.'),
];

module.exports = {
  registerHotelValidator,
  hotelIdValidator,
  getHotelsQueryValidator,
  updateHotelValidator,
  updateOwnHotelValidator,
  updateHotelActiveStatusValidator,
  validateIndianMobile,
};
