/**
 * Knex database connection instance.
 * Shared across all models & services — configured via knexfile.js and NODE_ENV.
 */
const knex = require('knex');
const knexConfig = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const config = { ...(knexConfig[env] || knexConfig.development) };

// Safety Guard: When running tests, guarantee connection to dedicated local test DB only
if (env === 'test') {
  const host = config.connection?.host || '';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`[SAFETY GUARD] Tests cannot run against remote host "${host}". Tests must run locally!`);
  }
  const dbName = config.connection?.database || '';
  const devDbName = process.env.DB_NAME || 'hotel_management_db';
  if (dbName === devDbName) {
    throw new Error(`[SAFETY GUARD] Tests cannot run against development/production database "${dbName}". Tests must run against isolated test database!`);
  }
}

const db = knex(config);

module.exports = db;
