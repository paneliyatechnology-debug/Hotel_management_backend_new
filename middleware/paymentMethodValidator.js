/**
 * Payment method request validation.
 * The hotel comes from the access token. A super admin sends hotel_id only when listing.
 */
const { body, param, query } = require('express-validator');

const nameRule = body('name')
  .trim()
  .notEmpty()
  .withMessage('name is required.')
  .isLength({ min: 2, max: 50 })
  .withMessage('name must be between 2 and 50 characters.');

const getPaymentMethodsQueryValidator = [
  query('hotel_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('hotel_id must be a positive integer.'),
];

const getPaymentMethodByIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid payment method ID. Must be a positive integer.'),
];

const createPaymentMethodValidator = [nameRule];

const updatePaymentMethodValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid payment method ID. Must be a positive integer.'),
  nameRule,
];

const deletePaymentMethodValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid payment method ID. Must be a positive integer.'),
];

module.exports = {
  getPaymentMethodsQueryValidator,
  getPaymentMethodByIdValidator,
  createPaymentMethodValidator,
  updatePaymentMethodValidator,
  deletePaymentMethodValidator,
};
