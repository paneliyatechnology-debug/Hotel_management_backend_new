/**
 * Audit Log Controller.
 * HTTP interface delegating business operations to auditService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const auditService = require('../services/auditService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * GET /api/v1/audit-logs
 * List audit logs with filters and pagination
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const data = await auditService.getAuditLogs(req.query, req.user);
    return success(res, MESSAGES.AUDIT_LOGS_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/audit-logs/:id
 * Get a single audit log by ID
 */
const getAuditLogById = async (req, res, next) => {
  try {
    const data = await auditService.getAuditLogById(req.params.id, req.user);
    return success(res, MESSAGES.AUDIT_LOG_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
};
