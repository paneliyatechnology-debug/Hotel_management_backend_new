/**
 * Email Service using Brevo (Sendinblue) Transactional REST API v3.
 * Dispatches transactional emails over standard HTTPS (Port 443).
 */
const {
  passwordResetLinkTemplate,
  hotelRegisteredWelcomeTemplate,
  staffUserWelcomeTemplate,
} = require('../templates/emailTemplates');

/**
 * Mask email for safe server logging (e.g. j***n@example.com)
 */
const maskEmail = (email) => {
  if (!email || !email.includes('@')) return 'unknown';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/**
 * Core Email Dispatcher via Brevo REST API v3 (HTTPS port 443)
 * @param {Object} options - { to, subject, html, text, toName }
 * @returns {Promise<Object>}
 */
const sendEmail = async ({ to, subject, html, text, toName }) => {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();

  // Fallback simulation when Brevo API key is not yet configured
  if (!apiKey) {
    console.log(`[EmailService] Simulated dispatch to ${maskEmail(to)} | Subject: "${subject}"`);
    return { success: true, simulated: true };
  }

  const senderName = process.env.FROM_NAME || process.env.APP_NAME || 'The Grand Royale Cloud';
  const senderEmail = (
    process.env.BREVO_SENDER_EMAIL ||
    process.env.FROM_EMAIL ||
    'no-reply@hotelmanagement.com'
  ).trim();

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: to.trim(),
          name: toName || undefined,
        },
      ],
      subject,
      htmlContent: html,
      textContent: text || 'Please view this message in an HTML-compatible email client.',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.message || JSON.stringify(data);
    console.error(`[EmailService] Brevo dispatch failed for ${maskEmail(to)}:`, errorMsg);
    throw new Error(`Brevo Email Error (${response.status}): ${errorMsg}`);
  }

  console.log(`[EmailService] Email sent successfully via Brevo to ${maskEmail(to)} (Message ID: ${data.messageId})`);
  return { success: true, messageId: data.messageId };
};

/**
 * Send Password Reset Email with Clickable Button & Secure URL
 * @param {string} to - Recipient email
 * @param {string} userName - User display name
 * @param {string} resetUrl - Secure password reset link
 * @param {number} [expiryMinutes=30]
 * @returns {Promise<Object>}
 */
const sendPasswordResetLinkEmail = async (to, userName, resetUrl, expiryMinutes = 30) => {
  const htmlContent = passwordResetLinkTemplate({
    userName,
    resetUrl,
    expiryMinutes,
  });

  return sendEmail({
    to,
    toName: userName,
    subject: 'Reset Your Password - The Grand Royale Cloud',
    html: htmlContent,
    text: `Hello ${userName},\n\nPlease use the following link to reset your password:\n${resetUrl}\n\nThis link is valid for ${expiryMinutes} minutes. If you did not request this, please ignore this email.`,
  });
};

/**
 * Send Hotel Registration Welcome Email with Free Trial details
 * @param {Object} data
 * @param {string} data.hotelName
 * @param {string} data.ownerName
 * @param {string} data.adminEmail
 * @param {string} [data.temporaryPassword]
 * @param {string} [data.setupUrl]
 * @param {string} [data.portalUrl]
 * @param {string} data.trialStartDate
 * @param {string} data.trialEndDate
 * @returns {Promise<Object>}
 */
const sendHotelRegisteredEmail = async (data) => {
  const htmlContent = hotelRegisteredWelcomeTemplate(data);
  const portalUrl = data.portalUrl || process.env.ADMIN_URL || 'https://hotel-management-admin-livid.vercel.app/login';

  return sendEmail({
    to: data.adminEmail,
    toName: data.ownerName,
    subject: `🎉 Congratulations! ${data.hotelName} Registered - Your Admin Temporary Password & Password Setup Link`,
    html: htmlContent,
    text: `Congratulations ${data.ownerName}!\n\nYour property ${data.hotelName} has been successfully registered on The Grand Royale Cloud.\n\nAdmin Email: ${data.adminEmail}\nTemporary Password: ${data.temporaryPassword}\nPassword Reset Link: ${data.setupUrl || portalUrl}\nPortal URL: ${portalUrl}\nTrial Period: ${data.trialStartDate} to ${data.trialEndDate}\n\nPlease use your temporary password to log in or click the password reset link above to set your permanent password.`,
  });
};

/**
 * Send Staff Member Welcome Email with Temporary Password and Password Reset Link
 * @param {Object} data
 * @param {string} data.userName
 * @param {string} data.email
 * @param {string} data.role
 * @param {string} data.hotelName
 * @param {string} [data.temporaryPassword]
 * @param {string} [data.setupUrl]
 * @param {string} [data.portalUrl]
 * @returns {Promise<Object>}
 */
const sendStaffUserCreatedEmail = async (data) => {
  const htmlContent = staffUserWelcomeTemplate(data);
  const portalUrl = data.portalUrl || process.env.ADMIN_URL || 'https://hotel-management-admin-livid.vercel.app/login';

  return sendEmail({
    to: data.email,
    toName: data.userName,
    subject: `🎉 Welcome to ${data.hotelName} - Your Staff Login Password & Account Setup Link`,
    html: htmlContent,
    text: `Hello ${data.userName},\n\nYour staff account (${data.role}) has been created for ${data.hotelName}.\n\nLogin Email: ${data.email}\nTemporary Password: ${data.temporaryPassword}\nPassword Reset Link: ${data.setupUrl || portalUrl}\nPortal URL: ${portalUrl}\n\nPlease use your temporary password to log in or click the password reset link above to set your permanent password.`,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetLinkEmail,
  sendHotelRegisteredEmail,
  sendStaffUserCreatedEmail,
  maskEmail,
};
