/**
 * Reusable HTML Email Templates
 * Modern, Clean & Professional SaaS Theme for Hotel Management Portal
 */

/**
 * Clean & Professional Hotel Registration Welcome Email Template
 * @param {Object} data
 * @param {string} data.hotelName
 * @param {string} data.ownerName
 * @param {string} data.adminEmail
 * @param {string} [data.temporaryPassword]
 * @param {string} [data.setupUrl]
 * @param {string} [data.portalUrl]
 * @param {string} data.trialStartDate
 * @param {string} data.trialEndDate
 * @returns {string} HTML string
 */
const hotelRegisteredWelcomeTemplate = (data) => {
  const portalUrl =
    data.portalUrl ||
    process.env.ADMIN_URL ||
    process.env.WEB_URL ||
    'https://hotel-management-admin-livid.vercel.app/login';
  const ctaUrl = data.setupUrl || portalUrl;
  const ctaLabel = data.setupUrl ? 'Set Up Your Permanent Password' : 'Log In to Admin Portal';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to MYOWNPMS - ${data.hotelName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 36px 20px 36px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #1e3a8a;">
                      MYOWNPMS
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                      Hotel Management System
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: #ecfdf5; color: #059669; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 12px; border: 1px solid #a7f3d0;">
                      Free Trial Active
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 36px 24px 36px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Welcome, ${data.ownerName}
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Your property <strong style="color: #0f172a;">${data.hotelName}</strong> has been successfully registered. Your 30-day free trial is now active, and your hotel management workspace is ready.
              </p>

              <!-- Credentials Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 22px;">
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">
                      Admin Access Details
                    </div>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">
                      <tr>
                        <td style="color: #64748b; padding: 6px 0; width: 36%;">Portal URL:</td>
                        <td style="padding: 6px 0;">
                          <a href="${portalUrl}" style="color: #2563eb; font-weight: 500; text-decoration: underline;" target="_blank">
                            ${portalUrl}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; padding: 6px 0;">Admin Email:</td>
                        <td style="color: #0f172a; font-weight: 600; padding: 6px 0;">
                          ${data.adminEmail}
                        </td>
                      </tr>
                      ${
                        data.temporaryPassword
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 6px 0;">Temporary Password:</td>
                        <td style="padding: 6px 0;">
                          <code style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 4px; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: 700; color: #0f172a;">
                            ${data.temporaryPassword}
                          </code>
                        </td>
                      </tr>
                      `
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 26px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 30px; border-radius: 6px; text-align: center; letter-spacing: 0.2px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; font-size: 13px; color: #64748b; line-height: 1.5; text-align: center;">
                You can log in directly with your temporary password, or click the button above to set your permanent password. For security, this link is valid for <strong>48 hours</strong>.
              </p>

              <!-- Trial Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 13px; color: #64748b;">
                <tr>
                  <td style="padding: 4px 0;">Subscription Plan:</td>
                  <td align="right" style="color: #059669; font-weight: 600; padding: 4px 0;">
                    30-Day Free Trial
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 0;">Trial Validity:</td>
                  <td align="right" style="color: #0f172a; font-weight: 600; padding: 4px 0;">
                    ${data.trialStartDate} &ndash; ${data.trialEndDate}
                  </td>
                </tr>
              </table>

              ${
                data.setupUrl
                  ? `
              <!-- Fallback Link -->
              <div style="margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                <p style="margin: 0 0 4px 0;">If the button above does not work, copy and paste this link into your browser:</p>
                <p style="margin: 0; word-break: break-all;">
                  <a href="${data.setupUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">
                    ${data.setupUrl}
                  </a>
                </p>
              </div>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">
                Need help getting started? Contact our support team at <a href="mailto:support@hotelmanagement.com" style="color: #64748b; text-decoration: underline;">support@hotelmanagement.com</a>.
              </p>
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} ${data.hotelName}. Powered by MYOWNPMS.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Clean & Professional Staff Onboarding Email Template
 * @param {Object} data
 * @param {string} data.userName
 * @param {string} data.email
 * @param {string} data.role
 * @param {string} data.hotelName
 * @param {string} [data.temporaryPassword]
 * @param {string} [data.setupUrl]
 * @param {string} [data.portalUrl]
 * @returns {string} HTML string
 */
const staffUserWelcomeTemplate = (data) => {
  const portalUrl =
    data.portalUrl ||
    process.env.ADMIN_URL ||
    process.env.WEB_URL ||
    'https://hotel-management-admin-livid.vercel.app/login';
  const ctaUrl = data.setupUrl || portalUrl;
  const ctaLabel = data.setupUrl ? 'Set Up Your Permanent Password' : 'Log In to Staff Portal';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to ${data.hotelName || 'The Team'}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 36px 20px 36px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #1e3a8a;">
                      ${data.hotelName || 'MYOWNPMS'}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                      Staff Account Onboarding
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 12px; border: 1px solid #bfdbfe;">
                      ${data.role || 'Staff Member'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 36px 24px 36px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Welcome, ${data.userName || 'Team Member'}
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Your staff account has been created for <strong style="color: #0f172a;">${data.hotelName || 'the hotel'}</strong>. You can log in to the management system using the credentials below:
              </p>

              <!-- Credentials Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 22px;">
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">
                      Your Login Credentials
                    </div>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">
                      <tr>
                        <td style="color: #64748b; padding: 6px 0; width: 36%;">Portal URL:</td>
                        <td style="padding: 6px 0;">
                          <a href="${portalUrl}" style="color: #2563eb; font-weight: 500; text-decoration: underline;" target="_blank">
                            ${portalUrl}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; padding: 6px 0;">Login Email:</td>
                        <td style="color: #0f172a; font-weight: 600; padding: 6px 0;">
                          ${data.email}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; padding: 6px 0;">Assigned Role:</td>
                        <td style="color: #0f172a; font-weight: 600; padding: 6px 0;">
                          ${data.role}
                        </td>
                      </tr>
                      ${
                        data.temporaryPassword
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 6px 0;">Temporary Password:</td>
                        <td style="padding: 6px 0;">
                          <code style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 4px; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: 700; color: #0f172a;">
                            ${data.temporaryPassword}
                          </code>
                        </td>
                      </tr>
                      `
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 26px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 30px; border-radius: 6px; text-align: center; letter-spacing: 0.2px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; font-size: 13px; color: #64748b; line-height: 1.5; text-align: center;">
                You can log in directly with your temporary password, or click the button above to set your permanent password. This setup link expires in <strong>48 hours</strong>.
              </p>

              ${
                data.setupUrl
                  ? `
              <!-- Fallback Link -->
              <div style="margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                <p style="margin: 0 0 4px 0;">If the button above does not work, copy and paste this link into your browser:</p>
                <p style="margin: 0; word-break: break-all;">
                  <a href="${data.setupUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">
                    ${data.setupUrl}
                  </a>
                </p>
              </div>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">
                If you have questions about your access, please contact your Hotel Administrator.
              </p>
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} ${data.hotelName || 'Hotel'}. Powered by MYOWNPMS.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Clean & Professional Password Reset Email Template
 * @param {Object} params
 * @param {string} params.userName
 * @param {string} params.resetUrl
 * @param {string} [params.hotelName]
 * @param {number} [params.expiryMinutes=30]
 * @returns {string} HTML string
 */
const passwordResetLinkTemplate = ({
  userName = 'Valued User',
  resetUrl,
  hotelName = process.env.APP_NAME || 'MYOWNPMS',
  expiryMinutes = 30,
}) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 36px 20px 36px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #1e3a8a;">
                      ${hotelName}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                      Account Security
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 36px 24px 36px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Reset Your Password
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Hello ${userName},<br><br>
                We received a request to reset the password for your account. Click the button below to choose a new password:
              </p>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 26px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 30px; border-radius: 6px; text-align: center; letter-spacing: 0.2px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; font-size: 13px; color: #64748b; line-height: 1.5; text-align: center;">
                This link is valid for <strong>${expiryMinutes} minutes</strong> and can only be used once. If you did not request this, please ignore this email.
              </p>

              <!-- Fallback Link -->
              <div style="margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                <p style="margin: 0 0 4px 0;">If the button above does not work, copy and paste this link into your browser:</p>
                <p style="margin: 0; word-break: break-all;">
                  <a href="${resetUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">
                    ${resetUrl}
                  </a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">
                This is an automated security email. Please do not reply directly.
              </p>
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} ${hotelName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Backward compatibility stub for renderHeroBanner if referenced
 */
const renderHeroBanner = () => '';

module.exports = {
  passwordResetLinkTemplate,
  hotelRegisteredWelcomeTemplate,
  staffUserWelcomeTemplate,
  renderHeroBanner,
};
