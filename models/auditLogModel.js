/**
 * Audit log database operations using Knex.
 * The audit trail is append-only: this model can insert and read rows, never change or remove them.
 */
const db = require('../database/knex');
const { parseJson } = require('../utils/json');

/**
 * Shape one audit_logs row for the API.
 * @param {Object} row
 * @returns {Object}
 */
const formatAuditLog = (row) => ({
  id: row.id,
  hotel_id: row.hotel_id,
  user: {
    id: row.user_id,
    name: row.user_name,
    role: row.user_role,
  },
  action: row.action,
  status: row.status,
  status_code: row.status_code,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  description: row.description,
  error_message: row.error_message,
  error_details: parseJson(row.error_details, null),
  changes: parseJson(row.changes, null),
  request_data: parseJson(row.request_data, null),
  ip_address: row.ip_address,
  user_agent: row.user_agent,
  created_at: row.created_at,
});

/**
 * Insert one audit log row.
 * @param {Object} data - Column values of audit_logs. `changes`, `request_data` and `error_details`
 *   are objects or null.
 * @returns {Promise<void>}
 */
const createLog = async (data) => {
  await db('audit_logs').insert({
    ...data,
    changes: data.changes ? JSON.stringify(data.changes) : null,
    request_data: data.request_data ? JSON.stringify(data.request_data) : null,
    error_details: data.error_details ? JSON.stringify(data.error_details) : null,
  });
};

/**
 * Find one audit log by id.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
const findLogById = async (id) => {
  const row = await db('audit_logs').where({ id }).first();
  return row ? formatAuditLog(row) : null;
};

/**
 * List audit logs with filters and pagination. Newest first unless sort_order is asc.
 * @param {Object} [filters={}] - hotel_id, entity_type, entity_id, action, status, user_id, from_date, to_date, search
 * @param {Object} [pagination={}] - page, limit (max 100)
 * @param {Object} [sorting={}] - sort_order
 * @returns {Promise<{ audit_logs: Object[], total: number, page: number, limit: number, total_pages: number }>}
 */
const findLogs = async (filters = {}, pagination = {}, sorting = {}) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const sortOrder = String(sorting.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const applyFilters = (qb) => {
    if (filters.hotel_id) qb.where('hotel_id', Number(filters.hotel_id));
    if (filters.entity_type) qb.where('entity_type', filters.entity_type);
    if (filters.entity_id) qb.where('entity_id', Number(filters.entity_id));
    if (filters.action) qb.where('action', filters.action);
    if (filters.status) qb.where('status', filters.status);
    if (filters.user_id) qb.where('user_id', Number(filters.user_id));
    if (filters.from_date) qb.where('created_at', '>=', new Date(filters.from_date));
    if (filters.to_date) qb.where('created_at', '<=', new Date(filters.to_date));

    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.where(function () {
        this.where('description', 'like', term).orWhere('user_name', 'like', term);
      });
    }
  };

  const countQuery = db('audit_logs');
  applyFilters(countQuery);
  const dataQuery = db('audit_logs');
  applyFilters(dataQuery);

  const [totalResult, rows] = await Promise.all([
    countQuery.count('id as total').first(),
    dataQuery.orderBy('id', sortOrder).offset((page - 1) * limit).limit(limit),
  ]);
  const total = Number(totalResult?.total || 0);

  return {
    audit_logs: rows.map(formatAuditLog),
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
  };
};

module.exports = {
  createLog,
  findLogById,
  findLogs,
};
