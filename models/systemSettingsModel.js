/**
 * System Settings database operations using Knex.
 * Follows TradeNexa model layer pattern.
 */
const db = require('../database/knex');

/**
 * Get active system settings (creates default if empty)
 * @returns {Promise<Object>}
 */
const getSettings = async () => {
  let settings = await db('system_settings').first();

  if (!settings) {
    const [id] = await db('system_settings').insert({
      free_trial_value: 30,
      free_trial_unit: 'days',
    });
    settings = await db('system_settings').where({ id }).first();
  }

  return settings;
};

/**
 * Update system settings
 * @param {Object} updates
 * @returns {Promise<number>}
 */
const updateSettings = async (updates) => {
  return db('system_settings').where({ id: 1 }).update({
    ...updates,
    updated_at: new Date(),
  });
};

module.exports = {
  getSettings,
  updateSettings,
};
