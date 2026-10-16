/**
 * Report request validation.
 */
const { query } = require('express-validator');
const { GST_SERVICE_TYPES, GST_INVOICE_STATUSES } = require('../constants');

const SERVICE_TYPES = Object.keys(GST_SERVICE_TYPES);

// Filters shared by the report and its exports. The period rules (order, length) are checked by the service.
const gstReportFilterValidators = [
  query('start_date')
    .trim()
    .notEmpty()
    .withMessage('start_date is required.')
    .bail()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date must be in YYYY-MM-DD format.'),

  query('end_date')
    .trim()
    .notEmpty()
    .withMessage('end_date is required.')
    .bail()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('end_date must be in YYYY-MM-DD format.'),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),

  query('gst_rate')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('gst_rate must be a number between 0 and 100.'),

  query('service_type')
    .optional({ values: 'falsy' })
    .trim()
    .toUpperCase()
    .isIn(SERVICE_TYPES)
    .withMessage(`service_type must be one of: ${SERVICE_TYPES.join(', ')}.`),

  query('invoice_status')
    .optional({ values: 'falsy' })
    .trim()
    .toUpperCase()
    .isIn(GST_INVOICE_STATUSES)
    .withMessage(`invoice_status must be one of: ${GST_INVOICE_STATUSES.join(', ')}.`),
];

const getGstReportValidator = [
  ...gstReportFilterValidators,

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('limit must be an integer between 1 and 200.'),
];

const exportGstReportValidator = [
  ...gstReportFilterValidators,

  query('format')
    .trim()
    .toLowerCase()
    .isIn(['xlsx', 'pdf'])
    .withMessage('format must be xlsx or pdf.'),
];

module.exports = {
  getGstReportValidator,
  exportGstReportValidator,
};
