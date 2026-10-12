/**
 * JWT token utilities and HTTP-only cookie handlers.
 */
const jwt = require('jsonwebtoken');

const getAccessSecret = () =>
  process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'super_hotel_jwt_secret_key_2026_modern_secure';

const getRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET ||
  (process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'super_hotel_jwt_secret_key_2026_modern_secure') + '_refresh';

/**
 * Generate Access Token (Short-lived)
 */
const generateAccessToken = (id, role) => {
  return jwt.sign(
    { id: String(id), role, tokenType: 'ACCESS' },
    getAccessSecret(),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    }
  );
};

/**
 * Generate Refresh Token (Long-lived)
 */
const generateRefreshToken = (id) => {
  return jwt.sign(
    { id: String(id), tokenType: 'REFRESH' },
    getRefreshSecret(),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    }
  );
};

/**
 * Verify Access Token
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret());
};

/**
 * Verify Refresh Token
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshSecret());
};

/**
 * Set Access & Refresh Tokens in HTTP-Only Cookies
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';

  const accessCookieOptions = {
    expires: new Date(Date.now() + 60 * 60 * 1000), // 1 Hour
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };

  const refreshCookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 Days
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };

  res.cookie('accessToken', accessToken, accessCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);
};

/**
 * Clear Authentication Cookies
 */
const clearAuthCookies = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const clearOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    expires: new Date(0),
  };

  res.cookie('accessToken', '', clearOptions);
  res.cookie('refreshToken', '', clearOptions);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
};
