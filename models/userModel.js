/**
 * User database operations using Knex.
 * Uses consistent snake_case.
 */
const db = require('../database/knex');
const { ROLE_CODES } = require('../constants');

/**
 * Find user by ID (excludes soft-deleted)
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const findUserById = (id) => {
  return db('users')
    .where({ id })
    .whereNull('deleted_at')
    .first();
};

/**
 * Find user by email (excludes soft-deleted)
 * @param {string} email
 * @returns {Promise<Object>}
 */
const findUserByEmail = (email) => {
  if (!email) return null;
  return db('users')
    .where({ email: email.toLowerCase() })
    .whereNull('deleted_at')
    .first();
};

/**
 * Check if an email exists among non-deleted users
 * @param {string} email
 * @param {number|string} [excludeId=null]
 * @returns {Promise<boolean>}
 */
const emailExists = async (email, excludeId = null) => {
  if (!email) return false;
  let qb = db('users')
    .where({ email: email.toLowerCase() })
    .whereNull('deleted_at');
  if (excludeId) {
    qb = qb.whereNot({ id: excludeId });
  }
  const row = await qb.select('id').first();
  return Boolean(row);
};

/**
 * Count active super administrators
 * @returns {Promise<number>}
 */
const countActiveSuperAdmins = async () => {
  const result = await db('users')
    .where({ role: 'SUPER_ADMIN' })
    .whereNull('deleted_at')
    .where('is_active', true)
    .count('id as count')
    .first();
  return Number(result?.count || 0);
};

/**
 * Create a new user record
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
const createUser = async (userData) => {
  const { status, employee_id, ...cleanUserData } = userData;
  const is_active = cleanUserData.is_active !== undefined ? Boolean(cleanUserData.is_active) : true;

  const [id] = await db('users').insert({
    ...cleanUserData,
    is_active,
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
  const { status, employee_id, ...cleanUpdates } = updates;
  return db('users')
    .where({ id })
    .update({
      ...cleanUpdates,
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

/**
 * Soft delete user record by ID
 * @param {number|string} id
 * @returns {Promise<number>}
 */
const softDeleteUser = (id) => {
  return db('users')
    .where({ id })
    .update({
      deleted_at: new Date(),
      is_active: false,
      updated_at: new Date(),
    });
};

/**
 * Soft delete every user of a hotel, so nobody from it can sign in again.
 * A super admin is never touched.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<number>} Number of users deleted
 */
const softDeleteUsersByHotelId = (hotelId, client = db) => {
  return client('users')
    .where({ hotel_id: hotelId })
    .whereNot('role', ROLE_CODES.SUPER_ADMIN)
    .whereNull('deleted_at')
    .update({
      deleted_at: new Date(),
      is_active: false,
      updated_at: new Date(),
    });
};

/**
 * Find users with pagination, filters, and search
 * Always excludes soft-deleted users.
 *
 * @param {Object} [filters={}]
 * @param {Object} [pagination={ page: 1, limit: 10 }]
 * @param {Object} [sorting={ sort_by: 'created_at', sort_order: 'desc' }]
 * @returns {Promise<{ users: Object[], total: number, page: number, limit: number, total_pages: number }>}
 */
const findUsers = async (filters = {}, pagination = {}, sorting = {}) => {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 10));
  const offset = (page - 1) * limit;

  const validSortFields = ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'updated_at', 'last_login_at'];
  let sortField = sorting.sort_by || 'created_at';
  if (!validSortFields.includes(sortField)) sortField = 'created_at';
  const sortOrder = String(sorting.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const applyFilters = (qb) => {
    qb.whereNull('users.deleted_at');
    qb.whereNotIn('users.role', [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.HOTEL_ADMIN]);

    if (filters.role) {
      qb.where('users.role', String(filters.role).toUpperCase());
    }

    if (filters.is_active !== undefined && filters.is_active !== null && filters.is_active !== '') {
      const activeBool = filters.is_active === true || filters.is_active === 'true' || filters.is_active === 1 || filters.is_active === '1';
      qb.where('users.is_active', activeBool);
    }

    if (filters.is_disabled !== undefined && filters.is_disabled !== null && filters.is_disabled !== '') {
      const disabledBool = filters.is_disabled === true || filters.is_disabled === 'true' || filters.is_disabled === 1 || filters.is_disabled === '1';
      qb.where('users.is_disabled', disabledBool);
    }

    if (filters.hotel_id) {
      qb.where('users.hotel_id', Number(filters.hotel_id));
    }

    if (filters.search) {
      const s = `%${String(filters.search)}%`;
      qb.where(function () {
        this.where('users.name', 'like', s)
          .orWhere('users.email', 'like', s)
          .orWhere('users.phone', 'like', s);
      });
    }
  };

  const countQuery = db('users');
  applyFilters(countQuery);
  const totalResult = await countQuery.count('users.id as total').first();
  const total = Number(totalResult?.total || 0);

  let dataQuery = db('users');
  applyFilters(dataQuery);
  dataQuery = dataQuery.orderBy(`users.${sortField}`, sortOrder).offset(offset).limit(limit);

  const users = await dataQuery;

  return {
    users,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
  };
};

/**
 * True when the account is blocked from login and from every protected API.
 * @param {Object|null|undefined} user
 * @returns {boolean}
 */
const isUserDisabled = (user) =>
  Boolean(user) && (user.is_disabled === true || user.is_disabled === 1 || user.is_disabled === '1');

module.exports = {
  isUserDisabled,
  findUserById,
  findUserByEmail,
  emailExists,
  findUsers,
  countActiveSuperAdmins,
  createUser,
  updateUser,
  softDeleteUser,
  softDeleteUsersByHotelId,
  setFailedLoginAttempts,
  clearLockoutAndSetLogin,
  updatePassword,
};
