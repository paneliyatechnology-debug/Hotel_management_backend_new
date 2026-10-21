/**
 * HTTP interface for hotel payment methods.
 */
const paymentMethodService = require('../services/paymentMethodService');
const { success } = require('../utils/response');
const { HTTP_STATUS, MESSAGES } = require('../constants');

const getPaymentMethods = async (req, res, next) => {
  try {
    const data = await paymentMethodService.getPaymentMethods(req.query, req.user);
    return success(res, MESSAGES.PAYMENT_METHODS_RETRIEVED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

const getPaymentMethodById = async (req, res, next) => {
  try {
    const data = await paymentMethodService.getPaymentMethodById(req.params.id, req.user);
    return success(res, MESSAGES.PAYMENT_METHOD_RETRIEVED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

const createPaymentMethod = async (req, res, next) => {
  try {
    const data = await paymentMethodService.createPaymentMethod(req.body, req.user);
    return success(res, MESSAGES.PAYMENT_METHOD_CREATED_SUCCESS, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const updatePaymentMethod = async (req, res, next) => {
  try {
    const data = await paymentMethodService.updatePaymentMethod(req.params.id, req.body, req.user);
    return success(res, MESSAGES.PAYMENT_METHOD_UPDATED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

const deletePaymentMethod = async (req, res, next) => {
  try {
    const data = await paymentMethodService.deletePaymentMethod(req.params.id, req.user);
    return success(res, MESSAGES.PAYMENT_METHOD_DELETED_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPaymentMethods,
  getPaymentMethodById,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
