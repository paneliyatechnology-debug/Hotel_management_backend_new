/**
 * Hotel Request Validation Middleware.
 * Validates hotel registration payload using express-validator.
 */
const { body } = require('express-validator');

// Disallowed dangerous file extensions
const DANGEROUS_EXTENSIONS = /\.(exe|bat|cmd|sh|php|pl|cgi|vbs|msi|bin|scr)$/i;

// Indian Mobile Number Normalizer & Custom Validator
const validateIndianMobile = (value) => {
  if (!value) return false;
  const cleaned = String(value).replace(/^(\+91|0)/, '').replace(/[\s-]/g, '');
  return /^[6-9]\d{9}$/.test(cleaned);
};

// GSTIN Regex Pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

// PAN Regex Pattern
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;

// Pincode Regex Pattern (6 digits)
const PINCODE_REGEX = /^\d{6}$/;

const registerHotelValidator = [
  // Required: Property & Owner Details
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Hotel property name is required')
    .isLength({ max: 150 })
    .withMessage('Hotel name cannot exceed 150 characters'),

  body('ownerName')
    .trim()
    .notEmpty()
    .withMessage('Owner / General Manager name is required')
    .isLength({ max: 150 })
    .withMessage('Owner name cannot exceed 150 characters'),

  body('ownerEmail')
    .trim()
    .notEmpty()
    .withMessage('Owner email address is required')
    .isEmail()
    .withMessage('Please provide a valid email address format (e.g. owner@example.com)')
    .normalizeEmail(),

  body('ownerPhone')
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

  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .custom((val) => {
      if (!PINCODE_REGEX.test(String(val).trim())) {
        throw new Error('Please provide a valid 6-digit Indian postal pincode.');
      }
      return true;
    }),

  // Optional: Tax & Registration Details
  body('gstNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !GSTIN_REGEX.test(val)) {
        throw new Error('Please provide a valid 15-character GSTIN format (e.g. 24AAAAA0000A1Z5).');
      }
      return true;
    }),

  body('panNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && !PAN_REGEX.test(val)) {
        throw new Error('Please provide a valid 10-character PAN format (e.g. ABCDE1234F).');
      }
      return true;
    }),

  body('totalRooms')
    .optional()
    .custom((val) => {
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
          throw new Error('Total rooms must be a non-negative integer.');
        }
      }
      return true;
    }),

  body('hotelType')
    .optional()
    .trim()
    .isLength({ max: 100 }),

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
    }),

  body('logo')
    .optional()
    .trim(),

  body('idProofDocument')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && DANGEROUS_EXTENSIONS.test(val)) {
        throw new Error('Disallowed file format for ID proof document. Executable files are prohibited.');
      }
      return true;
    }),

  body('businessProofDocument')
    .optional({ checkFalsy: true })
    .trim()
    .custom((val) => {
      if (val && DANGEROUS_EXTENSIONS.test(val)) {
        throw new Error('Disallowed file format for business proof document. Executable files are prohibited.');
      }
      return true;
    }),

  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('subscription_plan_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('subscription_plan_id must be a valid positive integer ID'),

  body('subscription_plan_active')
    .optional()
    .isBoolean()
    .withMessage('subscription_plan_active must be a boolean'),
];

module.exports = {
  registerHotelValidator,
  validateIndianMobile,
};
