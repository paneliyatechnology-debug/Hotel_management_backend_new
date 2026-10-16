/**
 * Authentication service handling business logic and database orchestration.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const hotelModel = require('../models/hotelModel');
const subscriptionPlanModel = require('../models/subscriptionPlanModel');
const tokenModel = require('../models/tokenModel');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} = require('../utils/jwt');
const { queueEmail } = require('../queues/emailQueue');
const { getFrontendBaseUrl } = require('../utils/frontendUrl');
const auditService = require('./auditService');
const { assertHotelActive } = require('../utils/hotelScope');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_STATUSES, ROLE_CODES } = require('../constants');

/**
 * Write an audit log entry for a security event of one user (login, failed login, password reset).
 * @param {Object} user - The user the event is about
 * @param {Object} requestMeta - { ip_address, user_agent } of the caller
 * @param {string} action - One of AUDIT_ACTIONS
 * @param {string} description
 * @param {AppError} [failure] - The refusal, for a failed event. Marks the entry FAILED with its reason.
 * @returns {Promise<void>}
 */
const recordUserEvent = (user, requestMeta, action, description, failure = null) =>
  auditService.record({
    actor: {
      id: user.id,
      name: user.name,
      role: user.role,
      hotel_id: user.hotel_id,
      request_meta: requestMeta,
    },
    action,
    entityType: AUDIT_ENTITIES.USER,
    entityId: user.id,
    description,
    ...(failure && {
      status: AUDIT_STATUSES.FAILED,
      statusCode: failure.statusCode,
      errorMessage: failure.message,
    }),
  });

/**
 * Check the account state and password of an existing user, then issue session tokens.
 * @param {Object} user
 * @param {string} password
 * @param {import('express').Response} res
 * @param {Object} [requestMeta] - { ip_address, user_agent } of the caller, for the audit trail
 * @returns {Promise<Object>}
 */
const verifyAndLogin = async (user, password, res, requestMeta) => {
  if (userModel.isUserDisabled(user)) {
    throw new AppError(
      'Your account has been disabled. Please contact your hotel administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Check account status
  if (
    user.is_active === false ||
    user.is_active === 0 ||
    Boolean(user.is_deleted) ||
    Boolean(user.deleted_at)
  ) {
    throw new AppError(
      user.is_active === false || user.is_active === 0
        ? 'Your staff account has been deactivated by Hotel Administration.'
        : 'Your account has been disabled. Please contact your Hotel Administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  // An inactive or expired plan does not block sign-in. The protected APIs return the plan error instead.
  await assertHotelActive(user, { checkPlan: false });

  // Check temporary lockout
  if (user.account_locked_until) {
    const lockTime = new Date(user.account_locked_until).getTime();
    if (lockTime <= Date.now()) {
      // Lock expired: reset lock and attempts
      await userModel.setFailedLoginAttempts(user.id, 0, null);
      user.account_locked_until = null;
      user.failed_login_attempts = 0;
    } else {
      const remainingMin = Math.max(1, Math.ceil((lockTime - Date.now()) / (60 * 1000)));
      throw new AppError(
        `Account temporarily locked due to failed attempts. Please try again in ${remainingMin} minute(s) or reset password.`,
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  // Verify password with bcrypt
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    let accountLockedUntil = null;

    if (failedAttempts >= 15) {
      accountLockedUntil = new Date(Date.now() + 1 * 60 * 1000); // 1 minute lockout
    }

    await userModel.setFailedLoginAttempts(user.id, failedAttempts, accountLockedUntil);

    const attemptsLeft = Math.max(0, 15 - failedAttempts);
    throw new AppError(
      attemptsLeft > 0
        ? `Invalid email or password. (${attemptsLeft} attempt(s) remaining)`
        : 'Account temporarily locked due to failed attempts. Please try again in 1 minute.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  // Clear lockout and record successful login
  await userModel.clearLockoutAndSetLogin(user.id);
  await recordUserEvent(user, requestMeta, AUDIT_ACTIONS.LOGIN, `${user.email} logged in.`);

  // Generate tokens & set cookies
  const accessToken = generateAccessToken(user.id, user.role, user.hotel_id);
  const refreshToken = generateRefreshToken(user.id, user.hotel_id);
  setAuthCookies(res, accessToken, refreshToken);

  // Super admin has no hotel
  const hotel = user.hotel_id ? await hotelModel.findHotelSummary(user.hotel_id) : null;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      hotel_id: user.hotel_id || null,
      is_active: Boolean(user.is_active),
      is_disabled: Boolean(user.is_disabled),
    },
    hotel,
  };
};

/**
 * Login user and issue session tokens in HTTP-only cookies.
 * Every refusal for an existing account (wrong password, disabled, deactivated, locked, hotel off)
 * is written to the audit trail as LOGIN_FAILED with the reason.
 * @param {string} email
 * @param {string} password
 * @param {import('express').Response} res
 * @param {Object} [requestMeta] - { ip_address, user_agent } of the caller, for the audit trail
 * @returns {Promise<Object>}
 */
const login = async (email, password, res, requestMeta) => {
  const user = await userModel.findUserByEmail(email);

  if (!user) {
    throw new AppError('Invalid email or password.', HTTP_STATUS.UNAUTHORIZED);
  }

  try {
    return await verifyAndLogin(user, password, res, requestMeta);
  } catch (err) {
    if (err instanceof AppError) {
      // Expired/inactive plan or deactivated hotel: clear any leftover session cookies (same as logout).
      if (err.forceLogout) {
        clearAuthCookies(res);
      }
      await recordUserEvent(
        user,
        requestMeta,
        AUDIT_ACTIONS.LOGIN_FAILED,
        `Failed login attempt for ${user.email}.`,
        err
      );
    }
    throw err;
  }
};

/**
 * Refresh access token using long-lived refresh token
 * @param {string} token
 * @param {import('express').Response} res
 * @returns {Promise<Object>}
 */
const refreshToken = async (token, res) => {
  if (!token) {
    throw new AppError('Refresh token missing. Please login again.', HTTP_STATUS.UNAUTHORIZED);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token. Please login again.', HTTP_STATUS.UNAUTHORIZED);
  }

  const user = await userModel.findUserById(decoded.id);

  if (!user) {
    throw new AppError('User account not found.', HTTP_STATUS.UNAUTHORIZED);
  }

  if (userModel.isUserDisabled(user)) {
    throw new AppError(
      'Your account has been disabled. Please contact your hotel administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (
    user.is_active === false ||
    user.is_active === 0 ||
    Boolean(user.is_deleted) ||
    Boolean(user.deleted_at)
  ) {
    throw new AppError('Account is deactivated or disabled.', HTTP_STATUS.FORBIDDEN);
  }

  try {
    await assertHotelActive(user, { checkPlan: false });
  } catch (hotelErr) {
    // Same as logout: drop cookies so the frontend cannot keep refreshing a deactivated hotel's session.
    if (hotelErr.forceLogout) {
      clearAuthCookies(res);
    }
    throw hotelErr;
  }

  const newAccessToken = generateAccessToken(user.id, user.role, user.hotel_id);
  const newRefreshToken = generateRefreshToken(user.id, user.hotel_id);
  setAuthCookies(res, newAccessToken, newRefreshToken);

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hotel_id: user.hotel_id || null,
      is_active: Boolean(user.is_active),
      is_disabled: Boolean(user.is_disabled),
    },
  };
};

/**
 * Logout user by clearing auth cookies
 * @param {import('express').Response} res
 */
const logout = async (res) => {
  clearAuthCookies(res);
  return null;
};

// A frontend running on the developer's machine, on any port.
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Frontend address the reset link points to.
 * A caller on localhost gets a link back to its own localhost, so a developer testing against the
 * live API stays on local. Every other caller gets the address from the server settings.
 * Only localhost is trusted from the request. Any other origin could be sent by an attacker to
 * point a victim's reset email at a hostile site.
 * @param {string} [requestOrigin]
 * @returns {string}
 */
const resolveResetBaseUrl = (requestOrigin) => {
  if (requestOrigin && LOCAL_ORIGIN_PATTERN.test(requestOrigin)) return requestOrigin;
  return getFrontendBaseUrl();
};

/**
 * Request password reset link (Generates single-use token & emails reset link)
 * @param {string} email
 * @param {string} [requestOrigin] - Origin header of the caller. A local frontend gets a link back to itself.
 * @returns {Promise<Object>}
 */
const forgotPassword = async (email, requestOrigin) => {
  const user = await userModel.findUserByEmail(email);

  if (!user) {
    throw new AppError(
      `This email "${email}" is not registered in our system. Please check your email or contact your administrator.`,
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (userModel.isUserDisabled(user)) {
    throw new AppError(
      'Your account has been disabled. Please contact your hotel administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (
    user.is_active === false ||
    user.is_active === 0 ||
    Boolean(user.is_deleted) ||
    Boolean(user.deleted_at)
  ) {
    throw new AppError('This account has been deactivated. Please contact your hotel administrator.', HTTP_STATUS.FORBIDDEN);
  }

  await assertHotelActive(user, { checkPlan: false });

  // Generate secure single-use reset token
  const token = crypto.randomBytes(32).toString('hex');
  const expiryMinutes = 30;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Invalidate any previous unused tokens for this user
  await tokenModel.invalidateUserTokens(user.id);

  // Store in database
  await tokenModel.createResetToken({
    userId: user.id,
    token,
    expiresAt,
  });

  // Construct secure Reset URL
  const frontendBase = resolveResetBaseUrl(requestOrigin);
  const resetUrl = frontendBase.includes('/reset-password')
    ? `${frontendBase}?token=${token}`
    : `${frontendBase.replace(/\/+$/, '')}/reset-password?token=${token}`;

  // Queue the email so the request returns at once. The queue retries a failed send.
  await queueEmail('PASSWORD_RESET', user.email, {
    userName: user.name,
    resetUrl,
    expiryMinutes,
  });

  return {
    email: user.email,
    resetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
  };
};

/**
 * Reset password using single-use reset token
 * @param {Object} params - { token, password }
 * @param {Object} [requestMeta] - { ip_address, user_agent } of the caller, for the audit trail
 * @returns {Promise<null>}
 */
const resetPassword = async ({ token, password }, requestMeta) => {
  if (!token || !token.trim()) {
    throw new AppError('Reset token is required.', HTTP_STATUS.BAD_REQUEST);
  }

  if (!password) {
    throw new AppError('Password is required.', HTTP_STATUS.BAD_REQUEST);
  }

  const resetRecord = await tokenModel.findValidToken(token.trim());

  if (!resetRecord) {
    throw new AppError(
      'Invalid or expired password reset link. Please request a new one.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const user = await userModel.findUserById(resetRecord.user_id);
  if (!user) {
    throw new AppError('User account not found.', HTTP_STATUS.NOT_FOUND);
  }

  if (userModel.isUserDisabled(user)) {
    throw new AppError(
      'Your account has been disabled. Please contact your hotel administrator.',
      HTTP_STATUS.FORBIDDEN
    );
  }

  await assertHotelActive(user, { checkPlan: false });

  // Hash new password and update in database
  const hashedPassword = await bcrypt.hash(password, 10);
  await userModel.updatePassword(user.id, hashedPassword);

  // Invalidate token (single-use enforcement)
  await tokenModel.markTokenUsed(resetRecord.id);
  await recordUserEvent(user, requestMeta, AUDIT_ACTIONS.PASSWORD_RESET, `Password reset for ${user.email}.`);

  return null;
};

/**
 * Change password for authenticated session
 * @param {number|string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<null>}
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await userModel.findUserById(userId);

  if (!user) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new AppError('Current password is incorrect.', HTTP_STATUS.BAD_REQUEST);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updatePassword(user.id, hashedPassword);

  return null;
};

/**
 * Hotel attached to a profile.
 * A hotel admin receives the full hotel and its subscription plan.
 * Other hotel roles receive the short summary. A super admin has no hotel.
 * @param {Object} user
 * @returns {Promise<Object|null>}
 */
const loadProfileHotel = async (user) => {
  if (!user.hotel_id) return null;

  if (user.role !== ROLE_CODES.HOTEL_ADMIN) {
    return hotelModel.findHotelSummary(user.hotel_id);
  }

  const hotel = await hotelModel.findHotelById(user.hotel_id);
  if (!hotel) return null;

  hotel.subscription.plan = hotel.subscription_plan_id
    ? await subscriptionPlanModel.findPlanById(hotel.subscription_plan_id, { includeDeleted: true })
    : null;

  return hotel;
};

/**
 * Get profile data for authenticated user
 * @param {number|string} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const user = await userModel.findUserById(userId);

  if (!user) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

  const hotel = await loadProfileHotel(user);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    hotel_id: user.hotel_id || null,
    is_active: Boolean(user.is_active),
    is_disabled: Boolean(user.is_disabled),
    must_change_password: Boolean(user.must_change_password),
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
    hotel,
  };
};

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
};
