/**
 * Email Service using Nodemailer.
 * Connection pooling and template rendering for transactional emails.
 */
const nodemailer = require('nodemailer');
const {
  passwordResetLinkTemplate,
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

let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = (process.env.SMTP_USER || process.env.SMTP_EMAIL || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return cachedTransporter;
};

/**
 * Core Email Dispatcher
 * @param {Object} options - { to, subject, html, text, from }
 * @returns {Promise<Object>}
 */
const sendEmail = async ({ to, subject, html, text, from }) => {
  const senderName = process.env.FROM_NAME || process.env.APP_NAME || 'The Grand Royale Cloud';
  const senderEmail = process.env.SMTP_USER || process.env.FROM_EMAIL || 'no-reply@hotelmanagement.com';
  const defaultFrom = `"${senderName}" <${senderEmail}>`;

  // Fallback simulation when SMTP credentials are not yet configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[EmailService] Simulated dispatch to ${maskEmail(to)} | Subject: "${subject}"`);
    return { success: true, simulated: true };
  }

  const transporter = getTransporter();
  const mailOptions = {
    from: from || defaultFrom,
    to: to.trim(),
    subject,
    text: text || 'Please view this message in an HTML-compatible email client.',
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[EmailService] Email sent successfully to ${maskEmail(to)} (Message ID: ${info.messageId})`);
  return { success: true, messageId: info.messageId };
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
    subject: 'Reset Your Password - The Grand Royale Cloud',
    html: htmlContent,
    text: `Hello ${userName},\n\nPlease use the following link to reset your password:\n${resetUrl}\n\nThis link is valid for ${expiryMinutes} minutes. If you did not request this, please ignore this email.`,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetLinkEmail,
  maskEmail,
};
