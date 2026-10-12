/**
 * User Management Router.
 * Mounts endpoints for User Management:
 * 1. POST /api/v1/users – Create a user with validation and secure password hashing.
 * 2. GET /api/v1/users – List users with pagination, sorting, search, and filters.
 * 3. GET /api/v1/users/:id – Get a single user by ID.
 * 4. PUT /api/v1/users/:id – Update user details according to permissions.
 * 5. DELETE /api/v1/users/:id – Soft-delete a user by ID.
 *
 * Follows TradeNexa router architecture.
 */
const express = require('express');
const userController = require('../controllers/userController');
const {
  createUserValidator,
  updateUserValidator,
  getUserByIdValidator,
  deleteUserValidator,
  getUsersQueryValidator,
} = require('../middleware/userValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// ==========================================
// Authentication & RBAC Guard
// ==========================================
router.use(authenticateUser);
router.use(requireRole(ROLE_CODES.HOTEL_ADMIN));

// ==========================================
// User Management Endpoints
// ==========================================

/**
 * POST /api/v1/users
 * Create a new user
 */
router.post(
  '/',
  createUserValidator,
  validate,
  userController.createUser
);

/**
 * GET /api/v1/users
 * List users with pagination, sorting, search, and filters
 */
router.get(
  '/',
  getUsersQueryValidator,
  validate,
  userController.getUsers
);

/**
 * GET /api/v1/users/:id
 * Get single user by ID
 */
router.get(
  '/:id',
  getUserByIdValidator,
  validate,
  userController.getUserById
);

/**
 * PUT /api/v1/users/:id
 * Update user details
 */
router.put(
  '/:id',
  updateUserValidator,
  validate,
  userController.updateUser
);

/**
 * DELETE /api/v1/users/:id
 * Soft-delete a user
 */
router.delete(
  '/:id',
  deleteUserValidator,
  validate,
  userController.deleteUser
);

module.exports = router;
