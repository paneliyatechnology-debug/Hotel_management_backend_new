/**
 * Password Reset Token database operations using Knex.
 */
const db = require('../database/knex');

/**
 * Invalidate all existing tokens for a user
 * @param {number|string} userId
 * @returns {Promise<number>}
 */
const invalidateUserTokens = (userId) => {
  return db('password_reset_tokens')
    .where({ user_id: userId })
    .del();
};

/**
 * Create a new password reset token record
 * @param {Object} data - { userId, token, expiresAt }
 * @returns {Promise<Array<number>>}
 */
const createResetToken = ({ userId, token, expiresAt }) => {
  return db('password_reset_tokens').insert({
    user_id: userId,
    token,
    otp: 'N/A', // Set default value for DB schema non-null constraint
    expires_at: expiresAt,
    used: false,
  });
};

/**
 * Find valid, unused, unexpired reset token
 * @param {string} token
 * @returns {Promise<Object>}
 */
const findValidToken = (token) => {
  if (!token) return null;
  return db('password_reset_tokens')
    .where({
      token: token.trim(),
      used: false,
    })
    .andWhere('expires_at', '>', new Date())
    .first();
};

/**
 * Mark token record as used
 * @param {number|string} id
 * @returns {Promise<number>}
 */
const markTokenUsed = (id) => {
  return db('password_reset_tokens')
    .where({ id })
    .update({ used: true });
};

module.exports = {
  invalidateUserTokens,
  createResetToken,
  findValidToken,
  markTokenUsed,
};
