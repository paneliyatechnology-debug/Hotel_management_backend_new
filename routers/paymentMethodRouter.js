/**
 * Hotel payment methods.
 * Hotel staff can read the list and use a method when taking a payment.
 * Only the hotel admin can add, rename, or delete a method, and only one they added.
 * CASH, CARD, UPI, and BANK_TRANSFER are created with the hotel and stay locked.
 */
const express = require('express');
const paymentMethodController = require('../controllers/paymentMethodController');
const {
  getPaymentMethodsQueryValidator,
  getPaymentMethodByIdValidator,
  createPaymentMethodValidator,
  updatePaymentMethodValidator,
  deletePaymentMethodValidator,
} = require('../middleware/paymentMethodValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ROLE_CODES } = require('../constants');

const router = express.Router();

const hotelReaders = requireRole(
  ROLE_CODES.HOTEL_ADMIN,
  ROLE_CODES.RECEPTIONIST,
  ROLE_CODES.MANAGER,
  ROLE_CODES.HOUSEKEEPING,
  ROLE_CODES.ACCOUNTANT
);

/**
 * requireRole lets a super admin through. Payment method changes are the hotel admin's only.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const hotelAdminOnly = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED));
  }
  if (req.user.role !== ROLE_CODES.HOTEL_ADMIN) {
    return next(new AppError(
      'Only a hotel admin can manage payment methods.',
      HTTP_STATUS.FORBIDDEN
    ));
  }
  return next();
};

router.use(authenticateUser);

router.get(
  '/',
  hotelReaders,
  getPaymentMethodsQueryValidator,
  validate,
  paymentMethodController.getPaymentMethods
);

router.get(
  '/:id',
  hotelReaders,
  getPaymentMethodByIdValidator,
  validate,
  paymentMethodController.getPaymentMethodById
);

router.post(
  '/',
  hotelAdminOnly,
  createPaymentMethodValidator,
  validate,
  paymentMethodController.createPaymentMethod
);

router.put(
  '/:id',
  hotelAdminOnly,
  updatePaymentMethodValidator,
  validate,
  paymentMethodController.updatePaymentMethod
);

router.delete(
  '/:id',
  hotelAdminOnly,
  deletePaymentMethodValidator,
  validate,
  paymentMethodController.deletePaymentMethod
);

module.exports = router;
