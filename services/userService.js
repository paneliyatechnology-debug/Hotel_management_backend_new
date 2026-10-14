/**
 * User Service.
 * Implements business operations, validation, password hashing,
 * role-based access control (RBAC), data isolation, self-protection guards,
 * and soft deletion for User Management.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const bookingModel = require('../models/bookingModel');
const hotelModel = require('../models/hotelModel');
const tokenModel = require('../models/tokenModel');
const { queueEmail } = require('../queues/emailQueue');
const { generateSecureTempPassword } = require('../utils/password');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

// Permitted staff roles that a HOTEL_ADMIN can manage
const STAFF_ROLES = [
  ROLE_CODES.RECEPTIONIST,
  ROLE_CODES.MANAGER,
  ROLE_CODES.HOUSEKEEPING,
  ROLE_CODES.ACCOUNTANT,
];

// All valid system roles
const ALL_ROLES = Object.values(ROLE_CODES);

/**
 * Format user record to strip password and maintain consistent snake_case
 * @param {Object} user
 * @returns {Object|null}
 */
const formatUserResponse = (user) => {
  if (!user) return null;
  const { password, ...safe_user } = user;

  return {
    ...safe_user,
    is_active: Boolean(user.is_active),
    is_disabled: Boolean(user.is_disabled),
    must_change_password: Boolean(user.must_change_password),
    failed_login_attempts: Number(user.failed_login_attempts) || 0,
    deleted_at: user.deleted_at || null,
    is_deleted: Boolean(user.deleted_at),
    last_login_at: user.last_login_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
};

/**
 * Create a new user with validation, RBAC checks, and secure password hashing
 * @param {Object} payload
 * @param {Object} req_user
 * @returns {Promise<void>}
 */
const createUser = async (payload, req_user) => {
  const email = (payload.email || '').toLowerCase();
  if (!email) {
    throw new AppError('Email address is required.', HTTP_STATUS.BAD_REQUEST);
  }

  // Check email uniqueness
  const exists = await userModel.emailExists(email);
  if (exists) {
    throw new AppError('A user with this email already exists.', HTTP_STATUS.CONFLICT);
  }
  if (await bookingModel.emailUsedOnBooking(email)) {
    throw new AppError('This email is used on a booking.', HTTP_STATUS.CONFLICT);
  }

  const role = String(payload.role || '').toUpperCase();
  if (!ALL_ROLES.includes(role)) {
    throw new AppError(
      `Invalid role '${payload.role}'. Must be one of: ${ALL_ROLES.join(', ')}.`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Hotel staff are bound to the hotel on the caller's token.
  // Super Admin may assign a hotel because that account is not tied to one property.
  let hotel_id = req_user.role === ROLE_CODES.SUPER_ADMIN ? payload.hotel_id : req_user.hotel_id;

  // RBAC checks
  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    // Hotel Admin cannot create SUPER_ADMIN or HOTEL_ADMIN
    if (role === ROLE_CODES.SUPER_ADMIN || role === ROLE_CODES.HOTEL_ADMIN) {
      throw new AppError(
        'Hotel administrators are not permitted to create Super Admin or Hotel Admin accounts.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Must be a staff role
    if (!STAFF_ROLES.includes(role)) {
      throw new AppError(
        `Hotel administrators can only create staff roles: ${STAFF_ROLES.join(', ')}.`,
        HTTP_STATUS.FORBIDDEN
      );
    }

    if (!hotel_id) {
      throw new AppError(
        'Your account is not associated with a hotel. hotel_id must come from the authenticated user token.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (req_user.role === ROLE_CODES.SUPER_ADMIN) {
    // Super Admin can create any role
  } else {
    // Other roles are not authorized to create users
    throw new AppError(
      `Access denied. Role '${req_user.role}' is not authorized to create users.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  // If hotel_id is provided, verify hotel exists
  if (hotel_id) {
    const hotel = await hotelModel.findHotelById(hotel_id);
    if (!hotel) {
      throw new AppError(`Hotel with ID ${hotel_id} not found.`, HTTP_STATUS.BAD_REQUEST);
    }
  }

  // Password handling: if supplied, validate length; if omitted, generate secure temp password
  let rawPassword;
  if (payload.password && typeof payload.password === 'string' && payload.password.trim()) {
    if (payload.password.trim().length < 6) {
      throw new AppError('Password must be at least 6 characters long.', HTTP_STATUS.BAD_REQUEST);
    }
    rawPassword = payload.password.trim();
  } else {
    rawPassword = generateSecureTempPassword();
  }

  const hashed_password = await bcrypt.hash(rawPassword, 10);

  // Setup token for expiring password reset link (48 hours)
  const setupToken = crypto.randomBytes(32).toString('hex');
  const setupTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const is_active = payload.is_active !== undefined ? Boolean(payload.is_active) : true;
  const is_disabled = payload.is_disabled === true
    || payload.is_disabled === 1
    || payload.is_disabled === '1'
    || payload.is_disabled === 'true';
  const must_change_password = payload.must_change_password !== undefined
    ? Boolean(payload.must_change_password)
    : (payload.password ? false : true);

  const user_data = {
    name: payload.name ? payload.name.trim() : '',
    email,
    password: hashed_password,
    phone: payload.phone ? payload.phone.trim() : '',
    role,
    hotel_id: hotel_id || null,
    is_active,
    is_disabled,
    must_change_password,
    failed_login_attempts: 0,
  };

  const created_user = await userModel.createUser(user_data);

  // Save setup token in password_reset_tokens
  if (setupToken) {
    try {
      await tokenModel.invalidateUserTokens(created_user.id);
      await tokenModel.createResetToken({
        userId: created_user.id,
        token: setupToken,
        expiresAt: setupTokenExpiry,
      });
    } catch (tokenErr) {
      console.error('[UserService] Failed to create setup token:', tokenErr.message);
    }
  }

  // Enqueue onboarding email with temporary password & password reset link
  const adminBaseUrl = (
    process.env.ADMIN_URL ||
    process.env.WEB_URL ||
    'https://hotel-management-admin-livid.vercel.app'
  ).replace(/\/+$/, '');

  const portalUrl = `${adminBaseUrl}/login`;
  const setupUrl = `${adminBaseUrl}/reset-password?token=${setupToken}`;

  let hotelName = 'MYOWNPMS';
  if (hotel_id) {
    try {
      const hotelRecord = await hotelModel.findHotelById(hotel_id);
      if (hotelRecord && hotelRecord.name) {
        hotelName = hotelRecord.name;
      }
    } catch (_) {}
  }

  try {
    await queueEmail('STAFF_USER_CREATED', email, {
      userName: created_user.name || 'Team Member',
      email,
      role: created_user.role,
      hotelName,
      portalUrl,
      setupUrl,
      temporaryPassword: rawPassword,
    });
  } catch (queueErr) {
    console.error('[UserService] Failed to enqueue staff welcome email:', queueErr.message);
  }
};

/**
 * List users with pagination, sorting, search, and filters
 * Applies hotel-level data isolation for HOTEL_ADMIN
 * @param {Object} query
 * @param {Object} req_user
 * @returns {Promise<Object>}
 */
const getUsers = async (query = {}, req_user) => {
  const filters = {
    search: query.search,
    role: query.role,
    is_active: query.is_active,
    is_disabled: query.is_disabled,
  };

  // Hotel isolation. Hotel admins are scoped by the token hotel, not query hotel_id.
  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    if (!req_user.hotel_id) {
      throw new AppError(
        'Your account is not associated with a hotel. hotel_id must come from the authenticated user token.',
        HTTP_STATUS.FORBIDDEN
      );
    }
    filters.hotel_id = req_user.hotel_id;
  } else if (req_user.role === ROLE_CODES.SUPER_ADMIN) {
    if (query.hotel_id) {
      filters.hotel_id = query.hotel_id;
    }
  } else {
    throw new AppError(
      `Access denied. Role '${req_user.role}' is not authorized to list users.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  const pagination = {
    page: query.page,
    limit: query.limit,
  };

  const sorting = {
    sort_by: query.sort_by,
    sort_order: query.sort_order,
  };

  const result = await userModel.findUsers(filters, pagination, sorting);
  return {
    ...result,
    users: result.users.map((u) => formatUserResponse(u)),
  };
};

/**
 * Get a single user by ID
 * Applies hotel-level data isolation
 * @param {number|string} id
 * @param {Object} req_user
 * @returns {Promise<Object>}
 */
const getUserById = async (id, req_user) => {
  const user = await userModel.findUserById(id);

  if (!user || user.deleted_at) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  // Hotel isolation for HOTEL_ADMIN
  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    if (user.hotel_id !== req_user.hotel_id || user.role === ROLE_CODES.SUPER_ADMIN) {
      throw new AppError(
        'Access denied. You do not have permission to view this user.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (req_user.role !== ROLE_CODES.SUPER_ADMIN) {
    if (String(user.id) !== String(req_user.id)) {
      throw new AppError(
        'Access denied. You do not have permission to view this user.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  return formatUserResponse(user);
};

/**
 * Update user details according to permissions
 * Prevents updates to sensitive auth fields
 * Guards against self-deactivation and last active super admin deactivation
 * @param {number|string} id
 * @param {Object} payload
 * @param {Object} req_user
 * @returns {Promise<void>}
 */
const updateUser = async (id, payload, req_user) => {
  const existing_user = await userModel.findUserById(id);

  if (!existing_user || existing_user.deleted_at) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  // Reject sensitive authentication field modifications via general update
  const sensitive_fields = [
    'password',
    'failed_login_attempts',
    'last_login_at',
    'account_locked_until',
    'password_changed_at',
  ];

  for (const field of sensitive_fields) {
    if (payload[field] !== undefined) {
      throw new AppError(
        `Updates to sensitive authentication field '${field}' are not permitted via this endpoint.`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  const is_self = String(req_user.id) === String(id);

  const new_is_active = payload.is_active !== undefined ? Boolean(payload.is_active) : undefined;
  const is_deactivating = new_is_active === false;

  // Prevent users from deactivating their own account
  if (is_self && is_deactivating) {
    throw new AppError('You cannot deactivate your own account.', HTTP_STATUS.BAD_REQUEST);
  }

  // Prevent users from changing their own role
  if (is_self && payload.role && payload.role.toUpperCase() !== req_user.role) {
    throw new AppError('You cannot change your own role.', HTTP_STATUS.BAD_REQUEST);
  }

  // Last Active Super Admin Guard
  if (existing_user.role === ROLE_CODES.SUPER_ADMIN) {
    const is_changing_super_admin_role = payload.role && payload.role.toUpperCase() !== ROLE_CODES.SUPER_ADMIN;
    if (is_deactivating || is_changing_super_admin_role) {
      const active_super_admins = await userModel.countActiveSuperAdmins();
      if (active_super_admins <= 1) {
        throw new AppError(
          'Cannot deactivate or change the role of the last active Super Administrator.',
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }
  }

  // RBAC checks for HOTEL_ADMIN
  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    // Hotel Admin cannot edit users of other hotels
    if (existing_user.hotel_id !== req_user.hotel_id) {
      throw new AppError(
        'Access denied. You do not have permission to modify this user.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Hotel Admin cannot modify SUPER_ADMIN or HOTEL_ADMIN accounts
    if (existing_user.role === ROLE_CODES.SUPER_ADMIN || existing_user.role === ROLE_CODES.HOTEL_ADMIN) {
      throw new AppError(
        'Hotel administrators are not permitted to modify Super Admin or Hotel Admin accounts.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Hotel Admin cannot assign SUPER_ADMIN or HOTEL_ADMIN role
    if (payload.role) {
      const target_role = payload.role.toUpperCase();
      if (target_role === ROLE_CODES.SUPER_ADMIN || target_role === ROLE_CODES.HOTEL_ADMIN) {
        throw new AppError(
          'Unauthorized role assignment. Hotel administrators can only manage staff roles.',
          HTTP_STATUS.FORBIDDEN
        );
      }
      if (!STAFF_ROLES.includes(target_role)) {
        throw new AppError(
          `Hotel administrators can only assign staff roles: ${STAFF_ROLES.join(', ')}.`,
          HTTP_STATUS.FORBIDDEN
        );
      }
    }

  } else if (req_user.role !== ROLE_CODES.SUPER_ADMIN) {
    throw new AppError(
      `Access denied. Role '${req_user.role}' is not authorized to update users.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Validate email uniqueness if changing email (without trim)
  let normalized_email;
  if (payload.email) {
    normalized_email = payload.email.toLowerCase();
    if (normalized_email !== existing_user.email.toLowerCase()) {
      const email_taken = await userModel.emailExists(normalized_email, id);
      if (email_taken) {
        throw new AppError('A user with this email already exists.', HTTP_STATUS.CONFLICT);
      }
      if (await bookingModel.emailUsedOnBooking(normalized_email)) {
        throw new AppError('This email is used on a booking.', HTTP_STATUS.CONFLICT);
      }
    }
  }

  // Prepare sanitized update fields
  const updates = {};

  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (normalized_email !== undefined) updates.email = normalized_email;
  if (payload.phone !== undefined) updates.phone = payload.phone.trim();
  if (payload.role !== undefined) updates.role = payload.role.toUpperCase();
  if (new_is_active !== undefined) updates.is_active = new_is_active;

  if (payload.must_change_password !== undefined) {
    updates.must_change_password = Boolean(payload.must_change_password);
  }

  // Super Admin can reassign hotel. Hotel admins stay on the token hotel.
  if (req_user.role === ROLE_CODES.SUPER_ADMIN) {
    if (payload.hotel_id !== undefined) updates.hotel_id = payload.hotel_id;
  }

  await userModel.updateUser(id, updates);
};

/**
 * Soft-delete a user by ID
 * Sets deleted_at, is_active: false
 * Guards against self-deletion and deleting the last active Super Admin
 * @param {number|string} id
 * @param {Object} req_user
 * @returns {Promise<void>}
 */
const deleteUser = async (id, req_user) => {
  const existing_user = await userModel.findUserById(id);

  if (!existing_user || existing_user.deleted_at) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  // Prevent users from deleting their own account
  if (String(req_user.id) === String(id)) {
    throw new AppError('You cannot delete your own account.', HTTP_STATUS.BAD_REQUEST);
  }

  // Last Active Super Admin Guard
  if (existing_user.role === ROLE_CODES.SUPER_ADMIN) {
    const active_super_admins = await userModel.countActiveSuperAdmins();
    if (active_super_admins <= 1) {
      throw new AppError(
        'Cannot delete the last active Super Administrator.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  // RBAC checks for HOTEL_ADMIN
  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    // Cannot delete users outside their hotel
    if (existing_user.hotel_id !== req_user.hotel_id) {
      throw new AppError(
        'Access denied. You do not have permission to delete this user.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Cannot delete SUPER_ADMIN or HOTEL_ADMIN
    if (existing_user.role === ROLE_CODES.SUPER_ADMIN || existing_user.role === ROLE_CODES.HOTEL_ADMIN) {
      throw new AppError(
        'Hotel administrators are not permitted to delete Super Admin or Hotel Admin accounts.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (req_user.role !== ROLE_CODES.SUPER_ADMIN) {
    throw new AppError(
      `Access denied. Role '${req_user.role}' is not authorized to delete users.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  await userModel.softDeleteUser(id);
};

/**
 * Read a true/false flag. "false" stays false, unlike JavaScript Boolean("false").
 * @param {*} value
 * @param {string} field
 * @returns {boolean}
 */
const parseFlag = (value, field) => {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  throw new AppError(`${field} must be a boolean value.`, HTTP_STATUS.BAD_REQUEST);
};

/**
 * Turn is_active and is_disabled on or off.
 * A disabled user cannot log in and cannot call any protected API.
 * @param {number|string} id
 * @param {Object} payload
 * @param {Object} req_user
 * @returns {Promise<void>}
 */
const updateAccountStatus = async (id, payload, req_user) => {
  const existing_user = await userModel.findUserById(id);

  if (!existing_user || existing_user.deleted_at) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  if (payload.is_active === undefined && payload.is_disabled === undefined) {
    throw new AppError('is_active or is_disabled is required.', HTTP_STATUS.BAD_REQUEST);
  }

  if (String(req_user.id) === String(id)) {
    throw new AppError('You cannot change your own account status.', HTTP_STATUS.BAD_REQUEST);
  }

  if (req_user.role === ROLE_CODES.HOTEL_ADMIN) {
    if (Number(existing_user.hotel_id) !== Number(req_user.hotel_id)) {
      throw new AppError(
        'Access denied. You do not have permission to update this user.',
        HTTP_STATUS.FORBIDDEN
      );
    }
    if (existing_user.role === ROLE_CODES.SUPER_ADMIN || existing_user.role === ROLE_CODES.HOTEL_ADMIN) {
      throw new AppError(
        'Hotel administrators are not permitted to change Super Admin or Hotel Admin account status.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (req_user.role !== ROLE_CODES.SUPER_ADMIN) {
    throw new AppError(
      `Access denied. Role '${req_user.role}' is not authorized to update account status.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  const updates = {};
  if (payload.is_active !== undefined) updates.is_active = parseFlag(payload.is_active, 'is_active');
  if (payload.is_disabled !== undefined) updates.is_disabled = parseFlag(payload.is_disabled, 'is_disabled');

  const willBeInactive = updates.is_active === false || (updates.is_active === undefined && !existing_user.is_active);
  const willBeDisabled = updates.is_disabled === true || (updates.is_disabled === undefined && userModel.isUserDisabled(existing_user));

  if (existing_user.role === ROLE_CODES.SUPER_ADMIN && (willBeInactive || willBeDisabled)) {
    const active_super_admins = await userModel.countActiveSuperAdmins();
    const thisAdminStillCounts = existing_user.is_active && !userModel.isUserDisabled(existing_user);
    if (thisAdminStillCounts && active_super_admins <= 1) {
      throw new AppError(
        'Cannot disable or deactivate the last active Super Administrator.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  await userModel.updateUser(id, updates);
};

module.exports = {
  STAFF_ROLES,
  ALL_ROLES,
  createUser,
  getUsers,
  getUserById,
  updateUser,
  updateAccountStatus,
  deleteUser,
};
