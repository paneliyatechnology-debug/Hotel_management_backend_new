/**
 * User authentication controller.
 *
 * Lean HTTP interface delegating business operations to authService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const authService = require('../services/authService');
const { success } = require('../utils/response');
const { MESSAGES } = require('../constants');

/**
 * POST /api/v1/auth/login
 * User login with email and password (sets HTTP-only cookies).
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const data = await authService.login(email, password, res);
    return success(res, MESSAGES.LOGIN_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/refresh-token
 * Rotate access and refresh session tokens.
 */
const refreshToken = async (req, res, next) => {
  try {
    const token =
      req.cookies?.refresh_token ||
      req.cookies?.refreshToken ||
      req.body?.refresh_token;
    const data = await authService.refreshToken(token, res);
    return success(res, MESSAGES.TOKEN_REFRESHED, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 * Log out user and clear HTTP-only cookies.
 */
const logout = async (req, res, next) => {
  try {
    await authService.logout(res);
    return success(res, MESSAGES.LOGOUT_SUCCESS, null);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Send secure password reset link with CTA button to user email.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const data = await authService.forgotPassword(email, req.get('origin'));
    return success(
      res,
      'A password reset link has been sent to your email. Please check your inbox or spam folder.',
      data
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Reset password using validated reset token.
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    await authService.resetPassword({
      token,
      password,
    });
    return success(res, MESSAGES.PASSWORD_RESET_SUCCESS, null);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/auth/change-password
 * Change password for authenticated session.
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    return success(res, MESSAGES.PASSWORD_CHANGED_SUCCESS, null);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/me
 * Fetch authenticated user profile.
 */
const getMe = async (req, res, next) => {
  try {
    const data = await authService.getProfile(req.user.id);
    return success(res, MESSAGES.PROFILE_RETRIEVED, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
};
