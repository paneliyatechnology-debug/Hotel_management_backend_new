/**
 * Cron Controller.
 * One handler per scheduled job. The schedule for each handler is set in routers/cronRouter.js.
 * A handler never throws, so one failed run cannot stop the schedule.
 */
const { clearGeneratedPdfs } = require('../services/bookingPdfService');
const { releaseCleanedRooms } = require('../services/roomService');

/**
 * Delete the booking folio PDFs saved in uploads/pdfs.
 */
const removeGeneratedPdfs = async () => {
  try {
    const removed = clearGeneratedPdfs();
    console.log(`[Cron:PdfCleanup] Removed ${removed} generated PDF file(s).`);
  } catch (err) {
    console.error('[Cron:PdfCleanup] Failed to remove generated PDFs:', err.message);
  }
};

/**
 * Make rooms AVAILABLE once their cleaning time after checkout is over.
 */
const releaseCleanedRoomsJob = async () => {
  try {
    const released = await releaseCleanedRooms();
    if (released > 0) {
      console.log(`[Cron:RoomCleaning] Released ${released} room(s) as available.`);
    }
  } catch (err) {
    console.error('[Cron:RoomCleaning] Failed to release cleaned rooms:', err.message);
  }
};

module.exports = {
  removeGeneratedPdfs,
  releaseCleanedRoomsJob,
};
