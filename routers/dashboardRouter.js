/**
 * Dashboard Router.
 * GET /api/v1/dashboard – unified entry point. Role is detected from the access token.
 */
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { getDashboardQueryValidator } = require('../middleware/dashboardValidator');
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
    ROLE_CODES.HOUSEKEEPING,
    ROLE_CODES.ACCOUNTANT
  )
);

/**
 * GET /api/v1/dashboard
 * Auto-routes by role:
 * - SUPER_ADMIN → platform dashboard (or hotel dashboard when hotel_id is sent)
 * - HOTEL_ADMIN → hotel dashboard
 * - RECEPTIONIST / MANAGER / HOUSEKEEPING / ACCOUNTANT → front desk dashboard
 */
router.get('/', getDashboardQueryValidator, validate, dashboardController.getDashboard);

module.exports = router;
