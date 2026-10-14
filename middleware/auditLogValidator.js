/**
 * Audit Log Request Validation Middleware.
 * Validates audit log list filters and the log id.
 * Standardized on snake_case.
 */
const { param, query } = require('express-validator');
const { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_STATUSES } = require('../constants');

const actionValues = Object.values(AUDIT_ACTIONS);
const statusValues = Object.values(AUDIT_STATUSES);
const entityValues = Object.values(AUDIT_ENTITIES);

const getAuditLogByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Audit log ID must be a positive integer.'),
];

const getAuditLogsQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),

  query('action')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(actionValues)
    .withMessage(`action must be one of: ${actionValues.join(', ')}.`),

  query('status')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(statusValues)
    .withMessage(`status must be one of: ${statusValues.join(', ')}.`),

  query('entity_type')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(entityValues)
    .withMessage(`entity_type must be one of: ${entityValues.join(', ')}.`),

  query('entity_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('entity_id must be a positive integer.'),

  query('user_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('user_id must be a positive integer.'),

  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),

  query('from_date')
    .optional()
    .isISO8601()
    .withMessage('from_date must be a valid ISO date.'),

  query('to_date')
    .optional()
    .isISO8601()
    .withMessage('to_date must be a valid ISO date.'),

  query('search')
    .optional()
    .trim(),

  query('sort_order')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc.'),
];

module.exports = {
  getAuditLogByIdValidator,
  getAuditLogsQueryValidator,
};
