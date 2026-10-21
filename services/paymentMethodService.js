/**
 * Hotel payment methods.
 * CASH, CARD, UPI, and BANK_TRANSFER are created with the hotel.
 * Nobody can edit or delete those four. A hotel admin may add, rename, and delete the others.
 */
const paymentMethodModel = require('../models/paymentMethodModel');
const auditService = require('./auditService');
const { AppError } = require('../utils/response');
const { resolveHotelId, resolveScopedHotelId } = require('../utils/hotelScope');
const { HTTP_STATUS, ROLE_CODES, AUDIT_ACTIONS, AUDIT_ENTITIES } = require('../constants');

const NAME_MAX = 50;

/**
 * @param {Object} reqUser
 */
const assertHotelAdmin = (reqUser) => {
  if (!reqUser || reqUser.role !== ROLE_CODES.HOTEL_ADMIN) {
    throw new AppError(
      'Only a hotel admin can manage payment methods.',
      HTTP_STATUS.FORBIDDEN
    );
  }
};

/**
 * @param {*} value
 * @returns {string}
 */
const readName = (value) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > NAME_MAX) {
    throw new AppError(
      'Payment method name must be between 2 and 50 characters.',
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'name', message: 'Payment method name must be between 2 and 50 characters.' }]
    );
  }
  return name;
};

/**
 * @param {number} hotelId
 * @param {string} name
 * @param {number|null} [excludeId=null]
 * @returns {Promise<void>}
 */
const assertNameAvailable = async (hotelId, name, excludeId = null) => {
  const existing = await paymentMethodModel.findActiveByName(hotelId, name);
  if (existing && Number(existing.id) !== Number(excludeId)) {
    throw new AppError(
      'A payment method with this name already exists for this hotel.',
      HTTP_STATUS.CONFLICT,
      [{ field: 'name', message: 'A payment method with this name already exists for this hotel.' }]
    );
  }
};

/**
 * Active payment methods for the caller's hotel.
 * A super admin must send hotel_id. Hotel staff use the hotel on their token.
 * @param {Object} query
 * @param {Object} reqUser
 * @returns {Promise<{ payment_methods: Object[] }>}
 */
const getPaymentMethods = async (query = {}, reqUser) => {
  const hotelId = resolveScopedHotelId(reqUser, query);
  const paymentMethods = await paymentMethodModel.findByHotelId(hotelId);
  return { payment_methods: paymentMethods };
};

/**
 * @param {number|string} id
 * @param {Object} reqUser
 * @returns {Promise<Object>}
 */
const getPaymentMethodById = async (id, reqUser) => {
  const method = await paymentMethodModel.findById(id);
  if (!method) {
    throw new AppError('Payment method not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (reqUser.role !== ROLE_CODES.SUPER_ADMIN) {
    const hotelId = resolveHotelId(reqUser);
    if (Number(method.hotel_id) !== hotelId) {
      throw new AppError(
        'Access denied. You do not have permission to view this payment method.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }
  return method;
};

/**
 * Add a payment method for the hotel admin's own hotel.
 * The four built-in names cannot be added again.
 * @param {Object} body
 * @param {Object} reqUser
 * @returns {Promise<{ id: number }>}
 */
const createPaymentMethod = async (body, reqUser) => {
  assertHotelAdmin(reqUser);
  const hotelId = resolveHotelId(reqUser);
  const name = readName(body.name);
  await assertNameAvailable(hotelId, name);

  const created = await paymentMethodModel.createPaymentMethod({ hotel_id: hotelId, name });

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.CREATE,
    entityType: AUDIT_ENTITIES.PAYMENT_METHOD,
    entityId: created.id,
    hotelId,
    description: `Payment method '${created.name}' created.`,
  });

  return { id: created.id };
};

/**
 * Rename a payment method the hotel admin added.
 * Built-in methods stay as they were created.
 * @param {number|string} id
 * @param {Object} body
 * @param {Object} reqUser
 * @returns {Promise<{ id: number }>}
 */
const updatePaymentMethod = async (id, body, reqUser) => {
  assertHotelAdmin(reqUser);
  const hotelId = resolveHotelId(reqUser);
  const existing = await paymentMethodModel.findById(id);
  if (!existing || Number(existing.hotel_id) !== hotelId) {
    throw new AppError('Payment method not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (existing.is_system) {
    throw new AppError(
      'This payment method is built in and cannot be changed.',
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'name', message: 'CASH, CARD, UPI, and BANK_TRANSFER cannot be changed.' }]
    );
  }

  const name = readName(body.name);
  await assertNameAvailable(hotelId, name, existing.id);
  const updated = await paymentMethodModel.updatePaymentMethod(existing.id, { name });

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: AUDIT_ENTITIES.PAYMENT_METHOD,
    entityId: existing.id,
    hotelId,
    description: `Payment method '${existing.name}' renamed to '${updated.name}'.`,
    changes: auditService.diffChanges(existing, { name }),
  });

  return { id: updated.id };
};

/**
 * Remove a payment method the hotel admin added.
 * Built-in methods cannot be removed. Past payments keep the name they were saved with.
 * @param {number|string} id
 * @param {Object} reqUser
 * @returns {Promise<{ id: number }>}
 */
const deletePaymentMethod = async (id, reqUser) => {
  assertHotelAdmin(reqUser);
  const hotelId = resolveHotelId(reqUser);
  const existing = await paymentMethodModel.findById(id);
  if (!existing || Number(existing.hotel_id) !== hotelId) {
    throw new AppError('Payment method not found.', HTTP_STATUS.NOT_FOUND);
  }
  if (existing.is_system) {
    throw new AppError(
      'This payment method is built in and cannot be deleted.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  await paymentMethodModel.softDeletePaymentMethod(existing.id);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.DELETE,
    entityType: AUDIT_ENTITIES.PAYMENT_METHOD,
    entityId: existing.id,
    hotelId,
    description: `Payment method '${existing.name}' deleted.`,
  });

  return { id: existing.id };
};

module.exports = {
  getPaymentMethods,
  getPaymentMethodById,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
