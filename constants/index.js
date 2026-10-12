/**
 * Application-wide constants.
 *
 * HTTP status codes, response messages, and role codes.
 */

// ==========================================
// HTTP status codes
// ==========================================

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

// ==========================================
// Response messages
// ==========================================

const MESSAGES = {
  LOGIN_SUCCESS: 'Login successful.',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  TOKEN_REFRESHED: 'Access token refreshed successfully.',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully! You can now log in with your new password.',
  PASSWORD_CHANGED_SUCCESS: 'Password changed successfully.',
  PROFILE_RETRIEVED: 'User profile retrieved successfully.',
};

// ==========================================
// Role codes
// ==========================================

const ROLE_CODES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HOTEL_ADMIN: 'HOTEL_ADMIN',
  RECEPTIONIST: 'RECEPTIONIST',
  MANAGER: 'MANAGER',
  HOUSEKEEPING: 'HOUSEKEEPING',
  ACCOUNTANT: 'ACCOUNTANT',
};

// ==========================================
// Token types
// ==========================================

const TOKEN_TYPES = {
  ACCESS: 'ACCESS',
  REFRESH: 'REFRESH',
};

module.exports = {
  HTTP_STATUS,
  MESSAGES,
  ROLE_CODES,
  TOKEN_TYPES,
};
