/**
 * Audit Service.
 * Records who did what to which record, and serves the read-only audit trail.
 * Recording never breaks the action it describes: a failed insert is logged and swallowed.
 */
const auditLogModel = require('../models/auditLogModel');
const { resolveHotelId } = require('../utils/hotelScope');
const { AppError } = require('../utils/response');
const {
  HTTP_STATUS,
  ROLE_CODES,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_STATUSES,
} = require('../constants');

// Never written to the audit trail, even when they are part of an update.
const SENSITIVE_FIELDS = ['password', 'bank_account_number'];

// Failed requests: first path segment (after /api/v1) to the record type it works on.
const AUDIT_RESOURCES = {
  hotels: AUDIT_ENTITIES.HOTEL,
  hotel: AUDIT_ENTITIES.HOTEL,
  users: AUDIT_ENTITIES.USER,
  user: AUDIT_ENTITIES.USER,
  'subscription-plans': AUDIT_ENTITIES.SUBSCRIPTION_PLAN,
  'room-types': AUDIT_ENTITIES.ROOM_TYPE,
  rooms: AUDIT_ENTITIES.ROOM,
  room: AUDIT_ENTITIES.ROOM,
  bookings: AUDIT_ENTITIES.BOOKING,
  booking: AUDIT_ENTITIES.BOOKING,
};
const CHANGE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const ACTION_BY_METHOD = {
  POST: AUDIT_ACTIONS.CREATE,
  PUT: AUDIT_ACTIONS.UPDATE,
  PATCH: AUDIT_ACTIONS.UPDATE,
  DELETE: AUDIT_ACTIONS.DELETE,
};
const STATUS_SUB_RESOURCES = ['status', 'active-status', 'account-status'];
const FAILED_ACTION_LABELS = {
  [AUDIT_ACTIONS.CREATE]: 'Create',
  [AUDIT_ACTIONS.UPDATE]: 'Update',
  [AUDIT_ACTIONS.DELETE]: 'Delete',
  [AUDIT_ACTIONS.STATUS_CHANGE]: 'Status change of',
  [AUDIT_ACTIONS.CHECK_OUT]: 'Check-out of',
};

/**
 * Make a value safe to store as JSON and easy to compare.
 * @param {*} value
 * @returns {*}
 */
const toAuditValue = (value) => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

/**
 * True when two values mean the same thing. 1/true and '5'/5 are treated as equal because
 * database rows and request payloads do not always use the same type.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
const isSameValue = (a, b) => {
  const left = toAuditValue(a);
  const right = toAuditValue(b);
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  const normalize = (value) => (typeof value === 'boolean' ? String(Number(value)) : String(value));
  return normalize(left) === normalize(right);
};

/**
 * Compare the stored record with the values an update will write.
 * Only fields that actually change are returned, as { field: { from, to } }.
 * @param {Object} before - Record as it is now
 * @param {Object} updates - Values about to be saved
 * @returns {Object|null} Changed fields, or null when nothing changes
 */
const diffChanges = (before = {}, updates = {}) => {
  const changes = {};

  Object.keys(updates).forEach((field) => {
    if (SENSITIVE_FIELDS.includes(field)) return;
    if (isSameValue(before[field], updates[field])) return;
    changes[field] = { from: toAuditValue(before[field]), to: toAuditValue(updates[field]) };
  });

  return Object.keys(changes).length > 0 ? changes : null;
};

/**
 * Write one audit log entry.
 * @param {Object} entry
 * @param {Object|null} entry.actor - Authenticated user (with request_meta) who did it. Null for the system.
 * @param {string} entry.action - One of AUDIT_ACTIONS
 * @param {string} entry.entityType - One of AUDIT_ENTITIES
 * @param {number|null} [entry.entityId] - Id of the record
 * @param {number|null} [entry.hotelId] - Hotel the record belongs to. Defaults to the actor's hotel.
 * @param {string} entry.description - Short sentence, max 255 characters
 * @param {Object|null} [entry.changes] - Result of diffChanges
 * @param {string} [entry.status] - One of AUDIT_STATUSES. Defaults to SUCCESS.
 * @param {number|null} [entry.statusCode] - HTTP status of a failed action
 * @param {string|null} [entry.errorMessage] - Why a failed action failed
 * @param {Array|null} [entry.errorDetails] - Field errors of a failed action
 * @returns {Promise<void>}
 */
const record = async ({
  actor,
  action,
  entityType,
  entityId = null,
  hotelId,
  description,
  changes = null,
  status = AUDIT_STATUSES.SUCCESS,
  statusCode = null,
  errorMessage = null,
  errorDetails = null,
}) => {
  try {
    const meta = actor?.request_meta || {};

    await auditLogModel.createLog({
      hotel_id: hotelId ?? actor?.hotel_id ?? null,
      user_id: actor?.id ?? null,
      user_name: actor?.name ? String(actor.name).slice(0, 150) : null,
      user_role: actor?.role ?? null,
      action,
      status,
      status_code: statusCode,
      entity_type: entityType,
      entity_id: entityId,
      description: String(description).slice(0, 255),
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      error_details: errorDetails,
      changes,
      request_data: meta.request_data ?? null,
      ip_address: meta.ip_address ?? null,
      user_agent: meta.user_agent ?? null,
    });
  } catch (err) {
    console.error('[AuditService] Failed to record audit log:', err.message);
  }
};

/**
 * Write a FAILED entry for a request that ended in an error.
 * Called by the global error handler. Only changes (POST, PUT, PATCH, DELETE) by a signed-in user on
 * an audited record type are written. Reads, unknown routes and requests with no valid token are not,
 * so a caller who is not signed in cannot fill the trail.
 * @param {import('express').Request} req
 * @param {Object} failure
 * @param {number} failure.statusCode - HTTP status sent to the caller
 * @param {string} failure.message - Why it failed
 * @param {Array} [failure.errors] - Field errors
 * @returns {Promise<void>}
 */
const recordFailure = async (req, { statusCode, message, errors = [] }) => {
  if (!req.user || !CHANGE_METHODS.includes(req.method)) return;

  const [resource, idSegment, subResource] = req.originalUrl
    .split('?')[0]
    .split('/')
    .filter((segment) => segment && segment !== 'api' && segment !== 'v1');

  const entityType = AUDIT_RESOURCES[resource];
  if (!entityType) return;

  let action = ACTION_BY_METHOD[req.method];
  if (req.method === 'DELETE') action = AUDIT_ACTIONS.DELETE;
  else if (STATUS_SUB_RESOURCES.includes(subResource)) action = AUDIT_ACTIONS.STATUS_CHANGE;
  else if (subResource === 'check-out') action = AUDIT_ACTIONS.CHECK_OUT;

  const entityId = /^\d+$/.test(idSegment || '') ? Number(idSegment) : null;

  await record({
    actor: req.user,
    action,
    entityType,
    entityId,
    // A super admin has no hotel of their own, so the hotel in the path is the one affected.
    // Other roles are logged under their own hotel, even when they tried to reach another one.
    hotelId:
      req.user.role === ROLE_CODES.SUPER_ADMIN && entityType === AUDIT_ENTITIES.HOTEL && entityId
        ? entityId
        : undefined,
    description: `${FAILED_ACTION_LABELS[action]} ${entityType.toLowerCase().replace(/_/g, ' ')} failed.`,
    status: AUDIT_STATUSES.FAILED,
    statusCode,
    errorMessage: message,
    errorDetails: errors.length > 0 ? errors : null,
  });
};

/**
 * List audit logs. A hotel admin sees only their own hotel. A super admin sees every hotel.
 * @param {Object} query - page, limit, hotel_id (super admin), entity_type, entity_id, action, user_id,
 *   from_date, to_date, search, sort_order
 * @param {Object} reqUser
 * @returns {Promise<Object>}
 */
const getAuditLogs = async (query = {}, reqUser) => {
  const filters = {
    entity_type: query.entity_type,
    entity_id: query.entity_id,
    action: query.action,
    status: query.status,
    user_id: query.user_id,
    from_date: query.from_date,
    to_date: query.to_date,
    search: query.search,
  };

  if (reqUser.role === ROLE_CODES.HOTEL_ADMIN) {
    filters.hotel_id = resolveHotelId(reqUser);
  } else if (reqUser.role === ROLE_CODES.SUPER_ADMIN) {
    filters.hotel_id = query.hotel_id;
  } else {
    throw new AppError(
      `Access denied. Role '${reqUser.role}' is not authorized to view audit logs.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  return auditLogModel.findLogs(
    filters,
    { page: query.page, limit: query.limit },
    { sort_order: query.sort_order }
  );
};

/**
 * Get one audit log.
 * @param {number|string} id
 * @param {Object} reqUser
 * @returns {Promise<Object>}
 */
const getAuditLogById = async (id, reqUser) => {
  const log = await auditLogModel.findLogById(id);
  if (!log) {
    throw new AppError('Audit log not found.', HTTP_STATUS.NOT_FOUND);
  }

  if (reqUser.role === ROLE_CODES.HOTEL_ADMIN) {
    if (Number(log.hotel_id) !== resolveHotelId(reqUser)) {
      throw new AppError(
        'Access denied. You do not have permission to view audit logs of another hotel.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (reqUser.role !== ROLE_CODES.SUPER_ADMIN) {
    throw new AppError(
      `Access denied. Role '${reqUser.role}' is not authorized to view audit logs.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  return log;
};

module.exports = {
  diffChanges,
  record,
  recordFailure,
  getAuditLogs,
  getAuditLogById,
};
