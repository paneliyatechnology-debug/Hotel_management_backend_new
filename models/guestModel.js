/**
 * Guest database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const db = require('../database/knex');

/**
 * Find guest by email
 * @param {string} email
 * @returns {Promise<Object>}
 */
const findGuestByEmail = (email) => {
  if (!email) return null;
  return db('guests')
    .where({ email: email.toLowerCase().trim(), is_deleted: false })
    .first();
};

/**
 * Create guest record
 * @param {Object} guestData
 * @returns {Promise<number>}
 */
const createGuest = async (guestData) => {
  const [id] = await db('guests').insert(guestData);
  return id;
};

module.exports = {
  findGuestByEmail,
  createGuest,
};
