/**
 * User Management Controller.
 * HTTP interface delegating business operations to userService.
 * Standardizes responses using success() helper and routes errors to next(err).
 */
const userService = require('../services/userService');
const { success, successMessage } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * POST /api/v1/users
 * Create a new user with validation and secure password hashing
 */
const createUser = async (req, res, next) => {
  try {
    await userService.createUser(req.body, req.user);
    return successMessage(res, MESSAGES.USER_CREATED_SUCCESS || 'User created successfully.', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/users
 * Get users with pagination, sorting, search, and filters
 */
const getUsers = async (req, res, next) => {
  try {
    const data = await userService.getUsers(req.query, req.user);
    return success(
      res,
      MESSAGES.USERS_RETRIEVED_SUCCESS || 'Users retrieved successfully.',
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/users/:id
 * Get a single user by ID
 */
const getUserById = async (req, res, next) => {
  try {
    const data = await userService.getUserById(req.params.id, req.user);
    return success(
      res,
      MESSAGES.USER_RETRIEVED_SUCCESS || 'User retrieved successfully.',
      data,
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/users/:id
 * Update user details according to permissions
 */
const updateUser = async (req, res, next) => {
  try {
    await userService.updateUser(req.params.id, req.body, req.user);
    return successMessage(res, MESSAGES.USER_UPDATED_SUCCESS || 'User updated successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/users/:id/account-status
 * Set is_active and is_disabled
 */
const updateAccountStatus = async (req, res, next) => {
  try {
    await userService.updateAccountStatus(req.params.id, req.body, req.user);
    return successMessage(res, MESSAGES.USER_ACCOUNT_STATUS_UPDATED_SUCCESS);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/users/:id
 * Soft-delete a user by ID
 */
const deleteUser = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user);
    return successMessage(res, MESSAGES.USER_DELETED_SUCCESS || 'User deleted successfully.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  updateAccountStatus,
  deleteUser,
};
