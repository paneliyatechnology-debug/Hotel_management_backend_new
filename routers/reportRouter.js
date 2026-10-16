/**
 * Report Router.
 * 1. GET /api/v1/reports/gst – Date-wise GST report (rows, summaries, grand totals, pagination).
 * 2. GET /api/v1/reports/gst/export – The same report as an Excel (xlsx) or PDF file.
 *
 * Needs a logged-in HOTEL_ADMIN or ACCOUNTANT of the hotel. A SUPER_ADMIN must send hotel_id.
 */
const express = require('express');
const reportController = require('../controllers/reportController');
const { getGstReportValidator, exportGstReportValidator } = require('../middleware/reportValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

router.use(authenticateUser);
router.use(requireRole(ROLE_CODES.HOTEL_ADMIN, ROLE_CODES.ACCOUNTANT));

router.get('/gst', getGstReportValidator, validate, reportController.getGstReport);
router.get('/gst/export', exportGstReportValidator, validate, reportController.exportGstReport);

module.exports = router;
