/**
 * Password helpers.
 */
const crypto = require('crypto');

/**
 * Generate a cryptographically secure temporary password.
 * Format: "Temp#" + 8 random hex characters (e.g. Temp#a8f12b0e).
 * Never derived from a person's name.
 * @returns {string}
 */
const generateSecureTempPassword = () => {
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `Temp#${randomSuffix}`;
};

module.exports = {
  generateSecureTempPassword,
};
