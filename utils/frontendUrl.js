/**
 * Public web app address used in links inside emails (welcome, staff invitation, password reset).
 * Hotel owners and staff sign in on this app (for example https://myownpms.com).
 * ADMIN_URL is the super admin console and is not used here.
 */
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

/**
 * @returns {string} Address without a trailing slash or a trailing /reset-password
 */
const getFrontendBaseUrl = () =>
  (process.env.RESET_PASSWORD_URL || process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/reset-password$/, '');

/**
 * Login page and set-password link (with token) on the web app.
 * @param {string} [token] - Single-use setup token
 * @returns {{ portalUrl: string, setupUrl: string|undefined }}
 */
const buildPortalLinks = (token) => {
  const base = getFrontendBaseUrl();
  return {
    portalUrl: `${base}/login`,
    setupUrl: token ? `${base}/reset-password?token=${token}` : undefined,
  };
};

module.exports = {
  getFrontendBaseUrl,
  buildPortalLinks,
};
