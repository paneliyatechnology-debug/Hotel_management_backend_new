/**
 * User database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const db = require('../database/knex');

/**
 * Find user by ID
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const findUserById = (id) => {
  return db('users')
    .where({ id, is_deleted: false })
    .first();
};

/**
 * Find user by email
 * @param {string} email
 * @returns {Promise<Object>}
 */
const findUserByEmail = (email) => {
  if (!email) return null;
  return db('users')
    .where({ email: email.toLowerCase().trim(), is_deleted: false })
    .first();
};

/**
 * Create a new user record
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
const createUser = async (userData) => {
  const [id] = await db('users').insert({
    ...userData,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db('users').where({ id }).first();
};

/**
 * Update user record by ID
 * @param {number|string} id
 * @param {Object} updates
 * @returns {Promise<number>}
 */
const updateUser = (id, updates) => {
  return db('users')
    .where({ id })
    .update({
      ...updates,
      updated_at: new Date(),
    });
};

/**
 * Increment failed login attempts & set lockout if needed
 * @param {number|string} id
 * @param {number} attempts
 * @param {Date|null} accountLockedUntil
 * @returns {Promise<number>}
 */
const setFailedLoginAttempts = (id, attempts, accountLockedUntil = null) => {
  return db('users')
    .where({ id })
    .update({
      failed_login_attempts: attempts,
      account_locked_until: accountLockedUntil,
      updated_at: new Date(),
    });
};

/**
 * Reset lockout and failed attempts counter upon successful login
 * @param {number|string} id
 * @returns {Promise<number>}
 */
const clearLockoutAndSetLogin = (id) => {
  return db('users')
    .where({ id })
    .update({
      failed_login_attempts: 0,
      account_locked_until: null,
      last_login_at: new Date(),
      updated_at: new Date(),
    });
};

/**
 * Update user password and clear must_change_password flag
 * @param {number|string} id
 * @param {string} hashedPassword
 * @returns {Promise<number>}
 */
const updatePassword = (id, hashedPassword) => {
  return db('users')
    .where({ id })
    .update({
      password: hashedPassword,
      must_change_password: false,
      failed_login_attempts: 0,
      account_locked_until: null,
      password_changed_at: new Date(),
      updated_at: new Date(),
    });
};

module.exports = {
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  setFailedLoginAttempts,
  clearLockoutAndSetLogin,
  updatePassword,
};
