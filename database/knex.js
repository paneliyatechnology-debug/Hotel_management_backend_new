/**
 * Knex database connection instance.
 * Shared across all models & services — configured via knexfile.js and NODE_ENV.
 */
const knex = require('knex');
const knexConfig = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env] || knexConfig.development);

module.exports = db;
