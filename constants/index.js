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
  HOTEL_REGISTERED_SUCCESS: 'Hotel registered and activated with 30-Day Free Trial! Your login credentials have been set.',
  PLAN_CREATED_SUCCESS: 'Subscription plan created successfully.',
  PLAN_UPDATED_SUCCESS: 'Subscription plan updated successfully.',
  PLAN_DELETED_SUCCESS: 'Subscription plan archived successfully.',
  PLAN_RETRIEVED_SUCCESS: 'Subscription plan retrieved successfully.',
  PLANS_RETRIEVED_SUCCESS: 'Subscription plans retrieved successfully.',
  ROOM_TYPE_CREATED_SUCCESS: 'Room category created successfully.',
  ROOM_TYPE_UPDATED_SUCCESS: 'Room category updated successfully.',
  ROOM_TYPE_DELETED_SUCCESS: 'Room category deleted successfully.',
  ROOM_TYPE_RETRIEVED_SUCCESS: 'Room category retrieved successfully.',
  ROOM_TYPES_RETRIEVED_SUCCESS: 'Room categories retrieved successfully.',
  ROOM_CREATED_SUCCESS: 'Physical room created successfully.',
  ROOM_UPDATED_SUCCESS: 'Physical room updated successfully.',
  ROOM_DELETED_SUCCESS: 'Physical room deleted successfully.',
  ROOM_RETRIEVED_SUCCESS: 'Physical room retrieved successfully.',
  ROOMS_RETRIEVED_SUCCESS: 'Physical rooms retrieved successfully.',
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
