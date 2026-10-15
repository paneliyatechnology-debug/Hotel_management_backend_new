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
  HOTEL_CREATED_SUCCESS: 'Hotel created successfully. Login details were emailed to the owner.',
  HOTEL_UPDATED_SUCCESS: 'Hotel updated successfully.',
  HOTEL_ACTIVE_STATUS_UPDATED_SUCCESS: 'Hotel active status updated successfully.',
  HOTEL_DELETED_SUCCESS: 'Hotel deleted successfully.',
  HOTEL_RETRIEVED_SUCCESS: 'Hotel retrieved successfully.',
  HOTELS_RETRIEVED_SUCCESS: 'Hotels retrieved successfully.',
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
  ROOM_STATUS_UPDATED_SUCCESS: 'Room status updated successfully.',
  ROOM_DELETED_SUCCESS: 'Physical room deleted successfully.',
  ROOM_RETRIEVED_SUCCESS: 'Physical room retrieved successfully.',
  ROOMS_RETRIEVED_SUCCESS: 'Physical rooms retrieved successfully.',
  BOOKING_CREATED_SUCCESS: 'Booking created successfully.',
  BOOKING_UPDATED_SUCCESS: 'Booking updated successfully.',
  BOOKING_DELETED_SUCCESS: 'Booking deleted successfully.',
  BOOKING_CHECKED_OUT_SUCCESS: 'Checkout completed successfully. Room is now marked for cleaning.',
  BOOKING_STATUS_UPDATED_SUCCESS: 'Booking status updated successfully.',
  BOOKING_PDF_GENERATED_SUCCESS: 'Booking folio generated successfully.',
  BOOKING_BILL_GENERATED_SUCCESS: 'Booking bill generated successfully.',
  BOOKING_RETRIEVED_SUCCESS: 'Booking retrieved successfully.',
  BOOKINGS_RETRIEVED_SUCCESS: 'Bookings retrieved successfully.',
  USER_CREATED_SUCCESS: 'User created successfully.',
  USER_ACCOUNT_STATUS_UPDATED_SUCCESS: 'User account status updated successfully.',
  USER_UPDATED_SUCCESS: 'User updated successfully.',
  USER_DELETED_SUCCESS: 'User deleted successfully.',
  USER_RETRIEVED_SUCCESS: 'User retrieved successfully.',
  USERS_RETRIEVED_SUCCESS: 'Users retrieved successfully.',
  AUDIT_LOG_RETRIEVED_SUCCESS: 'Audit log retrieved successfully.',
  AUDIT_LOGS_RETRIEVED_SUCCESS: 'Audit logs retrieved successfully.',
  DASHBOARD_RETRIEVED_SUCCESS: 'Dashboard retrieved successfully.',
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
// Physical room statuses
// Used by room create, update, list filters, and PATCH /rooms/:id/status.
// ==========================================

const ROOM_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'CLEANING',
  'MAINTENANCE',
  'BLOCKED',
];

// ==========================================
// Booking stay statuses
// This is the guest's stay, not the bill.
// payment_status stays PENDING | PARTIALLY_PAID | PAID.
// Create defaults to CHECKED_IN unless the client sends another value.
// ==========================================

const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
];

// These stays no longer block the room, so the same dates can be booked again.
const NON_BLOCKING_BOOKING_STATUSES = ['CHECKED_OUT', 'CANCELLED', 'NO_SHOW'];

// ==========================================
// Payment history
// payment_method is how the money was paid. Default CASH.
// PAYMENT_STATUSES is the status of one payment row, not the booking's payment_status:
// PAID = the bill is fully paid after this payment, PARTIALLY_PAID = a balance is left,
// REFUNDED = money was taken back, FAILED = the payment did not go through.
// ==========================================

const PAYMENT_METHODS = ['CASH', 'ONLINE', 'CARD', 'UPI', 'BANK_TRANSFER'];
const PAYMENT_STATUSES = ['PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED'];

// A room stays CLEANING this long after checkout, then becomes AVAILABLE again.
const CLEANING_DURATION_MINUTES = 20;

// ==========================================
// Audit trail
// AUDIT_ACTIONS says what happened. AUDIT_ENTITIES says what it happened to.
// ==========================================

const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  CHECK_OUT: 'CHECK_OUT',
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_RESET: 'PASSWORD_RESET',
};

const AUDIT_ENTITIES = {
  HOTEL: 'HOTEL',
  USER: 'USER',
  SUBSCRIPTION_PLAN: 'SUBSCRIPTION_PLAN',
  ROOM_TYPE: 'ROOM_TYPE',
  ROOM: 'ROOM',
  BOOKING: 'BOOKING',
};

// SUCCESS: the action was done. FAILED: it was rejected or hit an error, and nothing was saved.
const AUDIT_STATUSES = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
};

module.exports = {
  HTTP_STATUS,
  MESSAGES,
  ROLE_CODES,
  ROOM_STATUSES,
  BOOKING_STATUSES,
  NON_BLOCKING_BOOKING_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  CLEANING_DURATION_MINUTES,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_STATUSES,
};
