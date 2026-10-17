/**
 * Transaction Router.
 * GET /api/v1/transactions – one hotel's payment list.
 */
const express = require('express');
const transactionController = require('../controllers/transactionController');
const { getTransactionsQueryValidator } = require('../middleware/transactionValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

router.use(authenticateUser);
router.use(
  requireRole(
    ROLE_CODES.HOTEL_ADMIN,
    ROLE_CODES.RECEPTIONIST,
    ROLE_CODES.MANAGER,
    ROLE_CODES.ACCOUNTANT
  )
);

/**
 * GET /api/v1/transactions
 * Payments for the token hotel. A super admin must send hotel_id.
 */
router.get('/', getTransactionsQueryValidator, validate, transactionController.getTransactions);

module.exports = router;
