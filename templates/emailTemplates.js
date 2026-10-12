/**
 * Reusable HTML Email Templates
 * Professional Dark Slate & Gold Theme for Hotel Management Portal
 */

const BASE_STYLES = `
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  background-color: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #334155;
`;

/**
 * Reusable Hero Banner / Pass Generator
 */
const renderHeroBanner = ({
  badge = 'SECURITY AUTHENTICATION',
  name = 'Valued User',
  hotelName = 'The Grand Royale Cloud',
  tagline = 'Authorized Password Reset Request',
}) => {
  return `
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #2e1065 100%); border: 2px solid #f59e0b; border-radius: 14px; padding: 24px 18px; text-align: center; margin: 15px 0 22px 0; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.25);">
      <div style="display: inline-block; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 20px; padding: 4px 16px; margin-bottom: 10px;">
        <span style="color: #fbbf24; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
          &#128737; ${badge}
        </span>
      </div>
      <div style="color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;">
        OFFICIAL PASS ISSUED TO
      </div>
      <h1 style="color: #ffffff; margin: 0 0 6px 0; font-size: 25px; font-weight: 900; letter-spacing: -0.5px;">
        <span style="color: #f59e0b; border-bottom: 2px dashed #f59e0b; padding-bottom: 2px;">
          ${name}
        </span>
      </h1>
      <div style="color: #e2e8f0; font-size: 15px; font-weight: 800; margin-top: 6px;">
        &#127976; ${hotelName}
      </div>
      ${
        tagline
          ? `
        <div style="display: inline-block; margin-top: 8px; font-size: 12px; color: #cbd5e1; background: rgba(255,255,255,0.08); padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);">
          ${tagline}
        </div>
      `
          : ''
      }
    </div>
  `;
};

/**
 * Professional Password Reset Email with CTA Button & Secure Link
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
  hotelName = process.env.APP_NAME || 'The Grand Royale Cloud',
  expiryMinutes = 30,
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 25px 0; background-color: #0b1120;">
      <div style="${BASE_STYLES}">
        <!-- Header -->
        <div style="background: #1e293b; border-bottom: 2px solid #f59e0b; padding: 25px; text-align: center;">
          <h2 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 700;">&#128274; Password Reset Request</h2>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 25px; text-align: center;">
          ${renderHeroBanner({
            badge: 'SECURITY AUTHENTICATION',
            name: userName,
            hotelName,
            tagline: 'Authorized Password Reset Request',
          })}

          <p style="color: #cbd5e1; font-size: 15px; margin: 18px 0 10px 0; line-height: 1.6;">
            We received a request to reset the password for your account. Click the button below to choose a new password:
          </p>

          <!-- Primary CTA Button -->
          <div style="margin: 30px 0;">
            <a href="${resetUrl}" target="_blank" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0f172a; font-weight: 800; font-size: 15px; text-decoration: none; padding: 15px 38px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 18px rgba(245, 158, 11, 0.4); text-transform: uppercase; letter-spacing: 0.8px;">
              Reset Password
            </a>
          </div>

          <!-- Expiry Notice -->
          <p style="color: #94a3b8; font-size: 13px; margin: 20px 0 10px 0; line-height: 1.5;">
            This link is valid for <strong>${expiryMinutes} minutes</strong> and can only be used once.
          </p>

          <!-- Fallback URL -->
          <div style="background: #1e293b; border-radius: 8px; padding: 14px 18px; margin-top: 25px; text-align: left; border: 1px solid #334155;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px 0;">
              If the button above does not work, copy and paste this link into your web browser:
            </p>
            <p style="margin: 0; word-break: break-all;">
              <a href="${resetUrl}" target="_blank" style="color: #38bdf8; font-size: 12px; text-decoration: underline; font-family: 'Courier New', Courier, monospace;">
                ${resetUrl}
              </a>
            </p>
          </div>

          <p style="color: #64748b; font-size: 12px; margin-top: 24px; line-height: 1.5;">
            If you did not request this password reset, please ignore this email or contact support. Your password will not change until you access the link above and create a new one.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #0b1120; padding: 15px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} ${hotelName}. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  passwordResetLinkTemplate,
  renderHeroBanner,
};
