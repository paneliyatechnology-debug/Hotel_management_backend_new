/**
 * Cron Router.
 * Maps each schedule to a handler in controllers/cronController.js, the way HTTP routers map
 * a path to a controller. To add a job, write a handler in the controller and add one line here.
 *
 * 1. Every 3 hours  – Remove generated booking PDFs.
 * 2. Every minute   – Make rooms AVAILABLE after cleaning time is over.
 */
const cron = require('node-cron');
const cronController = require('../controllers/cronController');

const CRON_ROUTES = [
  { name: 'PdfCleanup', schedule: '0 */3 * * *', handler: cronController.removeGeneratedPdfs },
  { name: 'RoomCleaning', schedule: '* * * * *', handler: cronController.releaseCleanedRoomsJob },
];

/**
 * Start every scheduled job. Call once when the server starts.
 */
const startCronJobs = () => {
  CRON_ROUTES.forEach(({ name, schedule, handler }) => {
    cron.schedule(schedule, handler, { name });
  });
};

module.exports = {
  startCronJobs,
};
