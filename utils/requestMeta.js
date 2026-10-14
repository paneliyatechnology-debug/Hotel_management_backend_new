/**
 * Request details kept with every audit log entry.
 */
const { ROLE_CODES } = require('../constants');

// Any field whose name contains one of these words is stored as [REDACTED].
const SENSITIVE_KEY_PATTERN = /password|token|secret/i;
const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 1000;
const MAX_DEPTH = 5;

/**
 * Copy a request value so it is safe to store: secrets are hidden and long text is shortened.
 * @param {*} value
 * @param {number} [depth=0]
 * @returns {*}
 */
const sanitizeValue = (value, depth = 0) => {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeValue(item, depth + 1),
    ])
  );
};

/**
 * The data the caller sent: body fields (secrets hidden) and the names and sizes of uploaded files.
 * File contents are never stored.
 * @param {import('express').Request} req
 * @returns {Object|null} Null when nothing was sent
 */
const getRequestData = (req) => {
  const body = req.body && typeof req.body === 'object' ? sanitizeValue(req.body) : {};

  // For every role except SUPER_ADMIN the server sets hotel_id from the token. The caller did not send it.
  if (req.user && req.user.role !== ROLE_CODES.SUPER_ADMIN) {
    delete body.hotel_id;
  }

  const uploaded = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
  if (uploaded.length > 0) {
    body.files = uploaded.map((file) => ({
      field_name: file.fieldname,
      file_name: file.originalname,
      size: file.size,
    }));
  }

  return Object.keys(body).length > 0 ? body : null;
};

/**
 * Caller address, browser and the data they sent.
 * `req.ip` follows the proxy headers once Express trust proxy is on.
 * `request_data` is read only when the audit entry is written. That is after multer has parsed a
 * multipart body, which has not happened yet when the user is authenticated.
 * @param {import('express').Request} req
 * @returns {{ ip_address: string|null, user_agent: string|null, request_data: Object|null }}
 */
const getRequestMeta = (req) => ({
  ip_address: req.ip || req.socket?.remoteAddress || null,
  user_agent: (req.get('user-agent') || '').slice(0, 255) || null,
  get request_data() {
    return getRequestData(req);
  },
});

module.exports = {
  getRequestMeta,
};
