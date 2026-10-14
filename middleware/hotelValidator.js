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
  totalRoomsRule(),

  body('hotel_type')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  body('upi_id')
    .optional()
    .trim(),

  websiteRule(),

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

const updateHotelValidator = [
  ...hotelIdValidator,

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
  totalRoomsRule(),

  body('hotel_type')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  websiteRule(),

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
  updateHotelActiveStatusValidator,
  validateIndianMobile,
};
