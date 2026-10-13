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
  colorTheme = 'gold',
}) => {
  const isEmerald = colorTheme === 'emerald';
  const borderColor = isEmerald ? '#10b981' : '#f59e0b';
  const badgeTextColor = isEmerald ? '#34d399' : '#fbbf24';
  const badgeBg = isEmerald ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
  const shadowColor = isEmerald ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';

  return `
    <div style="background: linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #1e1b4b 100%); border: 2px solid ${borderColor}; border-radius: 14px; padding: 24px 18px; text-align: center; margin: 15px 0 22px 0; box-shadow: 0 8px 24px ${shadowColor};">
      <div style="display: inline-block; background: ${badgeBg}; border: 1px solid ${borderColor}; border-radius: 20px; padding: 4px 16px; margin-bottom: 10px;">
        <span style="color: ${badgeTextColor}; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
          &#128737; ${badge}
        </span>
      </div>
      <div style="color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;">
        OFFICIAL PASS ISSUED TO
      </div>
      <h1 style="color: #ffffff; margin: 0 0 6px 0; font-size: 25px; font-weight: 900; letter-spacing: -0.5px;">
        <span style="color: ${borderColor}; border-bottom: 2px dashed ${borderColor}; padding-bottom: 2px;">
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
            colorTheme: 'gold',
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

/**
 * Professional Hotel Registration & Free Trial Welcome Email
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
  const ctaLabel = data.setupUrl ? 'Set Up Your Admin Password' : 'Go To Hotel Admin Portal';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${data.hotelName}</title>
    </head>
    <body style="margin: 0; padding: 25px 0; background-color: #0b1120;">
      <div style="${BASE_STYLES}">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #065f46, #0f172a); border-bottom: 2px solid #10b981; padding: 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">&#127881; Welcome to The Grand Royale!</h1>
          <p style="color: #a7f3d0; margin: 6px 0 0; font-weight: 600; font-size: 14px;">Your Hotel Account & Free Trial Are Now Active</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 24px;">
          ${renderHeroBanner({
            badge: '🎉 30-DAY FREE TRIAL ACTIVATED',
            name: data.ownerName,
            hotelName: data.hotelName,
            tagline: 'Hotel Administrator &bull; Self-Serve Onboarding Successful',
            colorTheme: 'emerald',
          })}

          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 18px 0;">
            Congratulations! Your property <strong>${data.hotelName}</strong> has been successfully registered. Your multi-tenant hotel management workspace is fully operational with an active <strong>Free Trial</strong>.
          </p>

          <!-- Account Details Box -->
          <div style="background: #1e293b; border: 1px solid #334155; padding: 20px; margin: 20px 0; border-radius: 10px;">
            <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 14px; font-size: 16px;">&#128273; Hotel Admin Access Details</h4>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px; width: 40%;">Portal URL:</td>
                <td style="color: #38bdf8; padding: 8px 0; font-weight: bold; font-size: 14px;"><a href="${portalUrl}" style="color: #38bdf8; text-decoration: underline;">${portalUrl}</a></td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px;">Admin Email:</td>
                <td style="color: #f8fafc; padding: 8px 0; font-weight: bold; font-size: 14px;">${data.adminEmail}</td>
              </tr>
              ${
                data.temporaryPassword
                  ? `
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px;">Temporary Password:</td>
                <td style="color: #f59e0b; padding: 8px 0; font-family: 'Courier New', monospace; font-size: 15px; font-weight: bold;">
                  <span style="background: rgba(245, 158, 11, 0.15); padding: 3px 8px; border-radius: 4px; border: 1px dashed #f59e0b;">
                    ${data.temporaryPassword}
                  </span>
                </td>
              </tr>
              `
                  : ''
              }
            </table>
          </div>

          <!-- Free Trial Box -->
          <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); padding: 18px; margin: 20px 0; border-radius: 10px;">
            <h4 style="color: #34d399; margin: 0 0 10px 0; font-size: 15px;">&#9203; Subscription Free Trial Period</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="color: #94a3b8; padding: 4px 0;">Trial Start Date:</td>
                <td style="color: #f8fafc; font-weight: 600; padding: 4px 0;">${data.trialStartDate}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 4px 0;">Trial End Date:</td>
                <td style="color: #f8fafc; font-weight: 600; padding: 4px 0;">${data.trialEndDate}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 4px 0;">Current Status:</td>
                <td style="color: #10b981; font-weight: bold; padding: 4px 0;">ACTIVE &bull; TRIAL</td>
              </tr>
            </table>
          </div>

          <!-- CTA Button & Password Update Notice -->
          <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="color: #fcd34d; font-size: 14px; margin: 0 0 14px 0; font-weight: 600; line-height: 1.5;">
              &#128274; You can log in directly with your Temporary Password, or click below to update and set your permanent password:
            </p>
            <a href="${ctaUrl}" target="_blank" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0f172a; font-weight: 800; font-size: 15px; text-decoration: none; padding: 15px 36px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 18px rgba(245, 158, 11, 0.4); text-transform: uppercase; letter-spacing: 0.8px;">
              ${ctaLabel}
            </a>
          </div>

          ${
            data.setupUrl
              ? `
          <div style="background: #1e293b; border-radius: 8px; padding: 12px 16px; margin: 15px 0; text-align: left; border: 1px solid #334155;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0;">Direct Password Reset / Setup Link (Valid for 48 hours):</p>
            <p style="margin: 0; word-break: break-all;">
              <a href="${data.setupUrl}" style="color: #38bdf8; font-size: 12px; text-decoration: underline; font-family: monospace;">${data.setupUrl}</a>
            </p>
          </div>
          `
              : ''
          }

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-top: 24px; text-align: center;">
            Need help setting up your hotel rooms, receptionists, or billing? Contact our support team anytime.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #0b1120; padding: 16px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} ${data.hotelName}. Powered by The Grand Royale Cloud.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Professional Staff / Team Member Onboarding Email Template
 * Dispatches login credentials (temporary password) and 48-hour password reset link.
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
  const portalUrl = data.portalUrl || process.env.ADMIN_URL || 'https://hotel-management-admin-livid.vercel.app/login';
  const ctaUrl = data.setupUrl || portalUrl;
  const ctaLabel = 'SET / RESET YOUR PASSWORD';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to the Team</title>
    </head>
    <body style="margin: 0; padding: 25px 0; background-color: #0b1120;">
      <div style="${BASE_STYLES}">
        <!-- Header -->
        <div style="background: #1e293b; border-bottom: 2px solid #38bdf8; padding: 25px; text-align: center;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 22px; font-weight: 700;">&#127881; Welcome to the Team</h2>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 25px; text-align: center;">
          ${renderHeroBanner({
            badge: 'OFFICIAL STAFF ONBOARDING PASS',
            name: data.userName || 'Team Member',
            hotelName: data.hotelName || 'The Grand Royale Cloud',
            tagline: `Assigned Role: ${data.role || 'Staff Member'}`,
            colorTheme: 'emerald',
          })}

          <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 20px 0 10px 0;">
            Your staff account has been created for <strong>${data.hotelName}</strong>. You can log in to the management portal using the credentials below or click the reset link to choose your permanent password.
          </p>

          <!-- Account Details Box -->
          <div style="background: #1e293b; border: 1px solid #334155; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
            <h4 style="color: #38bdf8; margin-top: 0; margin-bottom: 14px; font-size: 16px;">&#128273; Staff Login Credentials</h4>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px; width: 40%;">Portal URL:</td>
                <td style="color: #38bdf8; padding: 8px 0; font-weight: bold; font-size: 14px;"><a href="${portalUrl}" style="color: #38bdf8; text-decoration: underline;">${portalUrl}</a></td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px;">Login Email:</td>
                <td style="color: #f8fafc; padding: 8px 0; font-weight: bold; font-size: 14px;">${data.email}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px;">Assigned Role:</td>
                <td style="color: #10b981; padding: 8px 0; font-weight: bold; font-size: 14px;">${data.role}</td>
              </tr>
              ${
                data.temporaryPassword
                  ? `
              <tr>
                <td style="color: #94a3b8; padding: 8px 0; font-size: 14px;">Temporary Password:</td>
                <td style="color: #f59e0b; padding: 8px 0; font-family: 'Courier New', monospace; font-size: 15px; font-weight: bold;">
                  <span style="background: rgba(245, 158, 11, 0.15); padding: 3px 8px; border-radius: 4px; border: 1px dashed #f59e0b;">
                    ${data.temporaryPassword}
                  </span>
                </td>
              </tr>
              `
                  : ''
              }
            </table>
          </div>

          <!-- CTA Button & Password Update Notice -->
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="color: #7dd3fc; font-size: 14px; margin: 0 0 14px 0; font-weight: 600; line-height: 1.5;">
              &#128274; You can log in directly with your Temporary Password, or click below to easily set/reset your permanent password:
            </p>
            <a href="${ctaUrl}" target="_blank" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; font-weight: 800; font-size: 15px; text-decoration: none; padding: 15px 36px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 18px rgba(14, 165, 233, 0.4); text-transform: uppercase; letter-spacing: 0.8px;">
              ${ctaLabel}
            </a>
          </div>

          ${
            data.setupUrl
              ? `
          <div style="background: #1e293b; border-radius: 8px; padding: 12px 16px; margin: 15px 0; text-align: left; border: 1px solid #334155;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0;">Direct Password Reset Link (Valid for 48 hours):</p>
            <p style="margin: 0; word-break: break-all;">
              <a href="${data.setupUrl}" style="color: #38bdf8; font-size: 12px; text-decoration: underline; font-family: monospace;">${data.setupUrl}</a>
            </p>
          </div>
          `
              : ''
          }

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-top: 24px; text-align: center;">
            If you have questions about your system access or assignments, please contact your Hotel Administrator.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #0b1120; padding: 16px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} ${data.hotelName}. Powered by The Grand Royale Cloud.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  passwordResetLinkTemplate,
  hotelRegisteredWelcomeTemplate,
  staffUserWelcomeTemplate,
  renderHeroBanner,
};
