/**
 * Remembers the public host of the API request that is currently running.
 * Image links are built from that host, so they stay short and point at this server.
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * @param {import('express').Request} req
 * @param {import('express').NextFunction} next
 */
const runWithRequest = (req, next) => {
  const host = req.get('host');
  const publicBase = host ? `${req.protocol}://${host}` : '';
  storage.run({ publicBase }, next);
};

/**
 * @returns {string}
 */
const getPublicBase = () => {
  const store = storage.getStore();
  return store && store.publicBase ? store.publicBase : '';
};

module.exports = {
  runWithRequest,
  getPublicBase,
};
