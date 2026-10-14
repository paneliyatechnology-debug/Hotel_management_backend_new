/**
 * Dashboard Controller.
 * HTTP interface for the unified role-based dashboard.
 */
const dashboardService = require('../services/dashboardService');
const { success } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * GET /api/v1/dashboard
 * Returns the dashboard that matches the authenticated user's role.
 */
const getDashboard = async (req, res, next) => {
  try {
    const { message, data } = await dashboardService.getDashboard(req.query, req.user);
    return success(res, message, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
};
