/**
 * Report Controller.
 * HTTP interface for the GST report and its Excel / PDF export.
 */
const reportService = require('../services/reportService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * GET /api/v1/reports/gst
 * Date-wise GST report with summaries, grand totals and pagination.
 */
const getGstReport = async (req, res, next) => {
  try {
    const data = await reportService.getGstReport(req.query, req.user);
    return success(res, MESSAGES.GST_REPORT_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/reports/gst/export?format=xlsx|pdf
 * Builds the whole report as a file and returns a URL that downloads it.
 */
const exportGstReport = async (req, res, next) => {
  try {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${proto}://${req.get('host')}`;
    const data = await reportService.exportGstReport(req.query, req.user, baseUrl);
    return success(res, MESSAGES.GST_REPORT_EXPORT_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getGstReport,
  exportGstReport,
};
