/**
 * WhatsApp queue worker.
 * Sends the booking template. A permanent Cloud API rejection is logged once and not retried.
 */
const { sendBookingConfirmation, maskPhone } = require('../services/whatsappService');

const WHATSAPP_QUEUE_NAME = 'whatsapp_queue';

/**
 * Process one confirmation job.
 * @param {Object} job
 * @returns {Promise<Object|null>}
 */
const processWhatsAppJob = async (job) => {
  console.log(
    `[WhatsAppWorker] Processing booking ${job.bookingNumber || job.bookingId} ` +
    `hotel ${job.hotelId} to ${maskPhone(job.to)}`
  );

  try {
    return await sendBookingConfirmation(job);
  } catch (err) {
    if (err.retryable === false) {
      console.error(`[WhatsAppWorker] Not retrying booking ${job.bookingNumber || job.bookingId}: ${err.message}`);
      return null;
    }
    throw err;
  }
};

module.exports = {
  WHATSAPP_QUEUE_NAME,
  processWhatsAppJob,
};
