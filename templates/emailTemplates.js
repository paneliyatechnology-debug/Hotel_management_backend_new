/**
 * HTML email templates for MYOWNPMS.
 * Brand in the header is always MYOWNPMS. Footer matches the booking folio PDF.
 */

const { buildPortalLinks } = require('../utils/frontendUrl');

const BRAND_NAME = 'MYOWNPMS';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@myownpms.com';

/**
 * Escape text for safe use inside HTML.
 * @param {*} value
 * @returns {string}
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * @param {string} [portalUrl]
 * @returns {string}
 */
const resolvePortalUrl = (portalUrl) => portalUrl || buildPortalLinks().portalUrl;

/**
 * Footer line matching the booking folio PDF.
 * @param {string} [entityName] - Hotel or property name
 * @returns {string}
 */
const brandFooter = (entityName) => {
  const year = new Date().getFullYear();
  const name = escapeHtml(entityName || BRAND_NAME);
  // Matches booking folio PDF: Â© YEAR <strong>HOTEL</strong>. Powered by MYOWNPMS.
  return `
    <p style="margin:0 0 6px 0;">
      Need help? Write to
      <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#4b5563;text-decoration:underline;">${escapeHtml(SUPPORT_EMAIL)}</a>.
    </p>
    <p style="margin:0;">&copy; ${year} <strong>${name}</strong>. Powered by ${BRAND_NAME}.</p>
  `;
};

/**
 * Shared email shell. Header always shows MYOWNPMS â€” never APP_NAME / backend labels.
 * @param {Object} options
 * @returns {string}
 */
const emailLayout = ({ title, subtitle, badgeHtml = '', bodyHtml, footerHtml, preheader = '' }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1f2937;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#0b1f33;padding:26px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">
                      ${BRAND_NAME}
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:6px;">
                      ${escapeHtml(subtitle)}
                    </div>
                  </td>
                  ${badgeHtml ? `<td align="right" style="vertical-align:middle;">${badgeHtml}</td>` : ''}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:22px 36px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;line-height:1.6;">
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
const ctaButton = (href, label) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 18px 0;">
  <tr>
    <td align="center">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;background-color:#0b1f33;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:4px;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;

/**
 * @param {string} heading
 * @param {Array<{ label: string, valueHtml: string }>} rows
 * @returns {string}
 */
const detailCard = (heading, rows) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 24px 0;">
  <tr>
    <td style="padding:20px 22px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">
        ${escapeHtml(heading)}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
        ${rows
          .map(
            (row) => `
        <tr>
          <td style="color:#6b7280;padding:7px 0;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:7px 0;color:#111827;vertical-align:top;">${row.valueHtml}</td>
        </tr>`
          )
          .join('')}
      </table>
    </td>
  </tr>
</table>`;

/**
 * @param {string} url
 * @returns {string}
 */
const fallbackLink = (url) => `
<div style="margin-top:24px;padding-top:18px;border-top:1px solid #eef2f7;font-size:12px;color:#9ca3af;line-height:1.6;">
  <p style="margin:0 0 6px 0;">If the button does not work, copy and paste this link into your browser:</p>
  <p style="margin:0;word-break:break-all;">
    <a href="${escapeHtml(url)}" target="_blank" style="color:#1d4ed8;text-decoration:underline;">${escapeHtml(url)}</a>
  </p>
</div>`;

/**
 * @param {string} password
 * @returns {string}
 */
const passwordChip = (password) =>
  `<code style="display:inline-block;background-color:#ffffff;border:1px solid #d1d5db;padding:4px 10px;border-radius:3px;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(password)}</code>`;

/**
 * Hotel registration welcome email.
 * @param {Object} data
 * @returns {string}
 */
const hotelRegisteredWelcomeTemplate = (data) => {
  const portalUrl = resolvePortalUrl(data.portalUrl);
  const ctaUrl = data.setupUrl || portalUrl;
  const ctaLabel = data.setupUrl ? 'Set Your Permanent Password' : 'Open Admin Portal';
  const ownerName = escapeHtml(data.ownerName || 'there');
  const hotelName = data.hotelName || 'Your property';

  const rows = [
    {
      label: 'Portal',
      valueHtml: `<a href="${escapeHtml(portalUrl)}" style="color:#1d4ed8;font-weight:500;text-decoration:underline;" target="_blank">${escapeHtml(portalUrl)}</a>`,
    },
    {
      label: 'Admin email',
      valueHtml: `<strong style="font-weight:600;">${escapeHtml(data.adminEmail)}</strong>`,
    },
  ];

  if (data.temporaryPassword) {
    rows.push({
      label: 'Temporary password',
      valueHtml: passwordChip(data.temporaryPassword),
    });
  }

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:700;color:#0b1f33;line-height:1.3;">
      Welcome, ${ownerName}
    </h1>
    <p style="margin:0 0 22px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      <strong style="color:#111827;">${escapeHtml(hotelName)}</strong> is registered on ${BRAND_NAME}.
      Your 30-day free trial is active and your workspace is ready.
    </p>
    ${detailCard('Admin access', rows)}
    ${ctaButton(ctaUrl, ctaLabel)}
    <p style="margin:0 0 22px 0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
      Sign in with the temporary password, or use the button above to set a permanent password.
      ${data.setupUrl ? ' The setup link is valid for <strong style="color:#374151;">48 hours</strong>.' : ''}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eef2f7;padding-top:16px;font-size:13px;color:#6b7280;">
      <tr>
        <td style="padding:5px 0;">Subscription</td>
        <td align="right" style="color:#047857;font-weight:600;padding:5px 0;">30-Day Free Trial</td>
      </tr>
      <tr>
        <td style="padding:5px 0;">Trial period</td>
        <td align="right" style="color:#111827;font-weight:600;padding:5px 0;">
          ${escapeHtml(data.trialStartDate)} &ndash; ${escapeHtml(data.trialEndDate)}
        </td>
      </tr>
    </table>
    ${data.setupUrl ? fallbackLink(data.setupUrl) : ''}
  `;

  return emailLayout({
    title: `Welcome to ${BRAND_NAME}`,
    subtitle: 'Property Management',
    badgeHtml: `<span style="display:inline-block;background-color:rgba(255,255,255,0.12);color:#d1fae5;font-size:11px;font-weight:600;padding:5px 12px;border:1px solid rgba(209,250,229,0.35);border-radius:999px;">Free Trial Active</span>`,
    bodyHtml,
    footerHtml: brandFooter(hotelName),
    preheader: `${hotelName} is ready on ${BRAND_NAME}. Your trial and login details are inside.`,
  });
};

/**
 * Staff onboarding welcome email.
 * @param {Object} data
 * @returns {string}
 */
const staffUserWelcomeTemplate = (data) => {
  const portalUrl = resolvePortalUrl(data.portalUrl);
  const ctaUrl = data.setupUrl || portalUrl;
  const ctaLabel = data.setupUrl ? 'Set Your Permanent Password' : 'Open Staff Portal';
  const userName = escapeHtml(data.userName || 'Team Member');
  const hotelName = data.hotelName || 'your hotel';
  const role = escapeHtml(data.role || 'Staff');

  const rows = [
    {
      label: 'Portal',
      valueHtml: `<a href="${escapeHtml(portalUrl)}" style="color:#1d4ed8;font-weight:500;text-decoration:underline;" target="_blank">${escapeHtml(portalUrl)}</a>`,
    },
    {
      label: 'Login email',
      valueHtml: `<strong style="font-weight:600;">${escapeHtml(data.email)}</strong>`,
    },
    {
      label: 'Role',
      valueHtml: `<strong style="font-weight:600;">${role}</strong>`,
    },
  ];

  if (data.temporaryPassword) {
    rows.push({
      label: 'Temporary password',
      valueHtml: passwordChip(data.temporaryPassword),
    });
  }

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:700;color:#0b1f33;line-height:1.3;">
      Welcome, ${userName}
    </h1>
    <p style="margin:0 0 22px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      Your staff account for <strong style="color:#111827;">${escapeHtml(hotelName)}</strong> is ready.
      Use the details below to sign in.
    </p>
    ${detailCard('Login details', rows)}
    ${ctaButton(ctaUrl, ctaLabel)}
    <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
      Sign in with the temporary password, or use the button above to set a permanent password.
      ${data.setupUrl ? ' The setup link expires in <strong style="color:#374151;">48 hours</strong>.' : ''}
    </p>
    ${data.setupUrl ? fallbackLink(data.setupUrl) : ''}
  `;

  return emailLayout({
    title: `Welcome to ${hotelName}`,
    subtitle: 'Staff Invitation',
    badgeHtml: `<span style="display:inline-block;background-color:rgba(255,255,255,0.12);color:#dbeafe;font-size:11px;font-weight:600;padding:5px 12px;border:1px solid rgba(219,234,254,0.35);border-radius:999px;">${role}</span>`,
    bodyHtml,
    footerHtml: brandFooter(hotelName),
    preheader: `Your ${data.role || 'staff'} account for ${hotelName} is ready.`,
  });
};

/**
 * Password reset email.
 * Header is always MYOWNPMS â€” never APP_NAME / "Hotel Management Backend".
 * @param {Object} params
 * @returns {string}
 */
const passwordResetLinkTemplate = ({
  userName = 'there',
  resetUrl,
  hotelName,
  expiryMinutes = 30,
}) => {
  const safeName = escapeHtml(userName);
  const footerName = hotelName || BRAND_NAME;

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:700;color:#0b1f33;line-height:1.3;">
      Reset your password
    </h1>
    <p style="margin:0 0 10px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      Hello ${safeName},
    </p>
    <p style="margin:0 0 8px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      We received a request to reset the password for your ${BRAND_NAME} account.
      Use the button below to choose a new password.
    </p>
    ${ctaButton(resetUrl, 'Reset Password')}
    <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
      This link is valid for <strong style="color:#374151;">${escapeHtml(expiryMinutes)} minutes</strong> and can be used only once.
      If you did not request this change, you can ignore this email.
    </p>
    ${fallbackLink(resetUrl)}
  `;

  return emailLayout({
    title: 'Reset Your Password',
    subtitle: 'Account Security',
    bodyHtml,
    footerHtml: brandFooter(footerName),
    preheader: `Reset your password. This link expires in ${expiryMinutes} minutes.`,
  });
};


/**
 * Hotel status change notification email (sent to hotel admin when super admin
 * activates or deactivates the hotel).
 *
 * @param {Object} data
 * @param {string} data.ownerName        - Hotel admin's display name
 * @param {string} data.hotelName        - Name of the hotel property
 * @param {boolean} data.isActive        - true = activated / approved, false = deactivated
 * @param {string} [data.reason]         - Optional reason provided by the super admin
 * @param {string} [data.portalUrl]      - Login URL for the admin portal
 * @returns {string}
 */
const hotelStatusChangedTemplate = (data) => {
  const portalUrl = resolvePortalUrl(data.portalUrl);
  const ownerName = escapeHtml(data.ownerName || 'there');
  const hotelName = data.hotelName || 'Your property';
  const isActive = Boolean(data.isActive);
  const reason = data.reason ? String(data.reason).trim() : '';

  const badgeLabel = isActive ? 'Account Active' : 'Account Suspended';
  const badgeColor = isActive ? '#d1fae5' : '#fef3c7';
  const badgeBorder = isActive ? 'rgba(209,250,229,0.35)' : 'rgba(254,243,199,0.35)';
  const badgeHtml = `<span style="display:inline-block;background-color:rgba(255,255,255,0.12);color:${badgeColor};font-size:11px;font-weight:600;padding:5px 12px;border:1px solid ${badgeBorder};border-radius:999px;">${badgeLabel}</span>`;

  const statusIcon = isActive
    ? `<div style="width:64px;height:64px;background-color:#d1fae5;border-radius:50%;margin:0 auto 20px auto;text-align:center;line-height:64px;font-size:30px;color:#065f46;">&#10003;</div>`
    : `<div style="width:64px;height:64px;background-color:#fef3c7;border-radius:50%;margin:0 auto 20px auto;text-align:center;line-height:64px;font-size:30px;color:#92400e;">&#9888;</div>`;

  const headingText = isActive
    ? 'Your Hotel Has Been Approved'
    : 'Your Hotel Account Has Been Suspended';

  const introPara = isActive
    ? `We are pleased to inform you that <strong style="color:#111827;">${escapeHtml(hotelName)}</strong> has been reviewed and <strong style="color:#047857;">approved</strong> by our platform team. Your account is now fully active and all features are accessible.`
    : `We regret to inform you that <strong style="color:#111827;">${escapeHtml(hotelName)}</strong> has been temporarily <strong style="color:#b45309;">suspended</strong> by our platform team. Access to your account and its features has been restricted.`;

  const statusMeaning = isActive
    ? [
        'Your hotel admin portal is <strong style="color:#047857;">accessible</strong>.',
        'Your staff can log in and manage day-to-day operations.',
        'Bookings, rooms, and reports are fully operational.',
        'Guests can make reservations through the system.',
      ]
    : [
        'Your hotel admin portal is <strong style="color:#b45309;">temporarily inaccessible</strong>.',
        'Staff members will not be able to log in until the account is reinstated.',
        'No new bookings can be created or managed during this period.',
        'Your data is safe and will be fully preserved.',
      ];

  const listItemsHtml = statusMeaning
    .map((item) => `<li style="padding:5px 0;font-size:14px;color:#4b5563;line-height:1.6;">${item}</li>`)
    .join('');

  const reasonCard = reason
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${isActive ? '#f0fdf4' : '#fffbeb'};border-left:4px solid ${isActive ? '#10b981' : '#f59e0b'};border-radius:0 4px 4px 0;margin:0 0 24px 0;"><tr><td style="padding:16px 20px;"><div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${isActive ? '#065f46' : '#92400e'};margin-bottom:6px;">Note from Platform Team</div><div style="font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(reason)}</div></td></tr></table>`
    : '';

  const nextSteps = isActive
    ? `<p style="margin:0 0 8px 0;font-size:14px;color:#4b5563;line-height:1.7;">Click the button below to sign in to your admin portal and get started. If you need any assistance, our support team is here to help.</p>`
    : `<p style="margin:0 0 8px 0;font-size:14px;color:#4b5563;line-height:1.7;">If you believe this is a mistake or would like to appeal this decision, please contact our support team at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#1d4ed8;text-decoration:underline;">${escapeHtml(SUPPORT_EMAIL)}</a>. Our team will review your request and respond within 24&ndash;48 hours.</p>`;

  const ctaLabel = isActive ? 'Sign In to Admin Portal' : 'Contact Support';
  const ctaHref = isActive ? portalUrl : `mailto:${SUPPORT_EMAIL}`;

  const detailRows = [
    {
      label: 'Hotel Name',
      valueHtml: `<strong style="font-weight:600;">${escapeHtml(hotelName)}</strong>`,
    },
    {
      label: 'Account Status',
      valueHtml: isActive
        ? `<span style="color:#047857;font-weight:600;">Active &amp; Approved</span>`
        : `<span style="color:#b45309;font-weight:600;">Suspended</span>`,
    },
    {
      label: 'Effective Date',
      valueHtml: `<strong style="font-weight:600;">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>`,
    },
  ];

  if (isActive) {
    detailRows.push({
      label: 'Admin Portal',
      valueHtml: `<a href="${escapeHtml(portalUrl)}" style="color:#1d4ed8;font-weight:500;text-decoration:underline;" target="_blank">${escapeHtml(portalUrl)}</a>`,
    });
  }

  const bodyHtml = `
    <div style="text-align:center;margin-bottom:28px;">
      ${statusIcon}
    </div>
    <h1 style="margin:0 0 14px 0;font-size:22px;font-weight:700;color:#0b1f33;line-height:1.3;text-align:center;">
      ${headingText}
    </h1>
    <p style="margin:0 0 6px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      Dear ${ownerName},
    </p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#4b5563;line-height:1.7;">
      ${introPara}
    </p>
    ${detailCard('Account Details', detailRows)}
    ${reasonCard}
    <div style="margin:0 0 24px 0;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;color:#374151;margin-bottom:10px;">What this means for you:</div>
      <ul style="margin:0;padding-left:20px;">
        ${listItemsHtml}
      </ul>
    </div>
    ${nextSteps}
    ${ctaButton(ctaHref, ctaLabel)}
    <p style="margin:20px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center;">
      This is an automated notification from ${BRAND_NAME}. Please do not reply directly to this email.
    </p>
  `;

  const preheader = isActive
    ? `${hotelName} has been approved \u2014 your admin portal is now active. Sign in to get started.`
    : `Important: ${hotelName} account has been suspended. Contact support for assistance.`;

  return emailLayout({
    title: isActive ? `Hotel Approved \u2014 ${hotelName}` : `Account Suspended \u2014 ${hotelName}`,
    subtitle: 'Account Status Notification',
    badgeHtml,
    bodyHtml,
    footerHtml: brandFooter(hotelName),
    preheader,
  });
};

/** @deprecated Kept for older imports. */
const renderHeroBanner = () => '';

module.exports = {
  passwordResetLinkTemplate,
  hotelRegisteredWelcomeTemplate,
  staffUserWelcomeTemplate,
  hotelStatusChangedTemplate,
  renderHeroBanner,
};
