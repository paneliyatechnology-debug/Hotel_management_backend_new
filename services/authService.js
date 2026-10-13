/**
 * Authentication service handling business logic and database orchestration.
 * Follows TradeNexa service layer architecture.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const tokenModel = require('../models/tokenModel');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} = require('../utils/jwt');
const {
  sendPasswordResetLinkEmail,
} = require('./emailService');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Login user and issue session tokens in HTTP-only cookies
 * @param {string} email
 * @param {string} password
 * @param {import('express').Response} res
 * @returns {Promise<Object>}
 */
const login = async (email, password, res) => {
  const user = await userModel.findUserByEmail(email);

  if (!user) {
    throw new AppError('Invalid email or password.', HTTP_STATUS.UNAUTHORIZED);
  }

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

  // Generate tokens & set cookies
  const accessToken = generateAccessToken(user.id, user.role, user.hotel_id);
  const refreshToken = generateRefreshToken(user.id, user.hotel_id);
  setAuthCookies(res, accessToken, refreshToken);

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
  };
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

/**
 * Request password reset link (Generates single-use token & emails reset link)
 * @param {string} email
 * @returns {Promise<Object>}
 */
const forgotPassword = async (email) => {
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
  const frontendBase = (process.env.RESET_PASSWORD_URL || process.env.FRONTEND_URL || 'http://localhost:3000').trim();
  const resetUrl = frontendBase.includes('/reset-password')
    ? `${frontendBase}?token=${token}`
    : `${frontendBase.replace(/\/+$/, '')}/reset-password?token=${token}`;

  // Dispatch professional HTML email with Reset Password button
  await sendPasswordResetLinkEmail(user.email, user.name, resetUrl, expiryMinutes);

  return {
    email: user.email,
    resetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
  };
};

/**
 * Reset password using single-use reset token
 * @param {Object} params - { token, password }
 * @returns {Promise<null>}
 */
const resetPassword = async ({ token, password }) => {
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

  // Hash new password and update in database
  const hashedPassword = await bcrypt.hash(password, 10);
  await userModel.updatePassword(user.id, hashedPassword);

  // Invalidate token (single-use enforcement)
  await tokenModel.markTokenUsed(resetRecord.id);

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
 * Get profile data for authenticated user
 * @param {number|string} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const user = await userModel.findUserById(userId);

  if (!user) {
    throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
  }

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
