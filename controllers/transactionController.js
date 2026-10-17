/**
 * Transaction Controller.
 * HTTP interface for the hotel payment list.
 */
const transactionService = require('../services/transactionService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * GET /api/v1/transactions
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getTransactions = async (req, res, next) => {
  try {
    const data = await transactionService.getTransactions(req.query, req.user);
    return success(res, MESSAGES.TRANSACTIONS_RETRIEVED_SUCCESS, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTransactions,
};
