﻿/**
 * Email Queue Worker.
 * Processes transactional email jobs dispatched through BullMQ or the in-memory fallback queue.
 */
const {
  sendPasswordResetLinkEmail,
  sendHotelRegisteredEmail,
  sendStaffUserCreatedEmail,
  sendHotelStatusChangedEmail,
  maskEmail,
} = require('../services/emailService');

const EMAIL_QUEUE_NAME = 'email_queue';

/**
 * Process a single email job
 * @param {Object} job - { type, to, data }
 * @returns {Promise<any>}
 */
const processEmailJob = async (job) => {
  const { type, to, data } = job;
  console.log(`[EmailWorker] Processing job type="${type}" to="${maskEmail(to)}"`);

  switch (type) {
    case 'HOTEL_REGISTERED':
      return await sendHotelRegisteredEmail({
        ...data,
        adminEmail: to,
      });

    case 'STAFF_USER_CREATED':
      return await sendStaffUserCreatedEmail({
        ...data,
        email: to,
      });

    case 'PASSWORD_RESET':
      return await sendPasswordResetLinkEmail(to, data.userName, data.resetUrl, data.expiryMinutes);

    case 'HOTEL_STATUS_CHANGED':
      return await sendHotelStatusChangedEmail({
        ...data,
        adminEmail: to,
      });

    default:
      console.warn(`[EmailWorker] Unknown email job type: ${type}`);
      return null;
  }
};

module.exports = {
  EMAIL_QUEUE_NAME,
  processEmailJob,
};
