/**
 * Audit Log Router.
 * Read-only endpoints. The audit trail cannot be created, changed, or deleted through the API.
 * 1. GET /api/v1/audit-logs – List audit logs with filters and pagination.
 * 2. GET /api/v1/audit-logs/:id – Get a single audit log by ID.
 */
const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const {
  getAuditLogByIdValidator,
  getAuditLogsQueryValidator,
} = require('../middleware/auditLogValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// ==========================================
// Authentication & RBAC Guard
// SUPER_ADMIN is always allowed. HOTEL_ADMIN is limited to their own hotel in the service.
// ==========================================
router.use(authenticateUser);
router.use(requireRole(ROLE_CODES.HOTEL_ADMIN));

/**
 * GET /api/v1/audit-logs
 * List audit logs with filters and pagination
 */
router.get(
  '/',
  getAuditLogsQueryValidator,
  validate,
  auditLogController.getAuditLogs
);

/**
 * GET /api/v1/audit-logs/:id
 * Get single audit log by ID
 */
router.get(
  '/:id',
  getAuditLogByIdValidator,
  validate,
  auditLogController.getAuditLogById
);

module.exports = router;
