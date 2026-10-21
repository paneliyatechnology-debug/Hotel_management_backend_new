/**
 * Hotel payment methods.
 * The four system methods are created with the hotel and are never edited or deleted.
 */
const db = require('../database/knex');

const SYSTEM_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'];

/**
 * @param {Object|null} row
 * @returns {Object|null}
 */
const formatPaymentMethod = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    hotel_id: row.hotel_id,
    name: row.name,
    is_system: Boolean(row.is_system),
    display_order: Number(row.display_order) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Create the four built-in methods for a hotel. Safe to call more than once.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<void>}
 */
const seedSystemMethods = async (hotelId, client = db) => {
  const now = new Date();
  for (let index = 0; index < SYSTEM_PAYMENT_METHODS.length; index += 1) {
    const name = SYSTEM_PAYMENT_METHODS[index];
    const existing = await client('hotel_payment_methods')
      .where({ hotel_id: hotelId })
      .whereRaw('LOWER(TRIM(name)) = ?', [name.toLowerCase()])
      .whereNull('deleted_at')
      .first();
    if (existing) {
      if (!existing.is_system || existing.name !== name) {
        await client('hotel_payment_methods').where({ id: existing.id }).update({
          name,
          is_system: true,
          display_order: index + 1,
          updated_at: now,
        });
      }
      continue;
    }
    await client('hotel_payment_methods').insert({
      hotel_id: hotelId,
      name,
      is_system: true,
      display_order: index + 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
  }
};

/**
 * Active methods for one hotel. Built-in methods come first, in their fixed order.
 * @param {number|string} hotelId
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object[]>}
 */
const findByHotelId = async (hotelId, client = db) => {
  const rows = await client('hotel_payment_methods')
    .where({ hotel_id: hotelId })
    .whereNull('deleted_at')
    .orderBy('is_system', 'desc')
    .orderBy('display_order', 'asc')
    .orderBy('id', 'asc');
  return rows.map(formatPaymentMethod);
};

/**
 * @param {number|string} id
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findById = async (id, client = db) => {
  const row = await client('hotel_payment_methods')
    .where({ id })
    .whereNull('deleted_at')
    .first();
  return formatPaymentMethod(row);
};

/**
 * Match a method name for one hotel, ignoring letter case.
 * @param {number|string} hotelId
 * @param {string} name
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const findActiveByName = async (hotelId, name, client = db) => {
  const row = await client('hotel_payment_methods')
    .where({ hotel_id: hotelId })
    .whereRaw('LOWER(TRIM(name)) = ?', [String(name).trim().toLowerCase()])
    .whereNull('deleted_at')
    .first();
  return formatPaymentMethod(row);
};

/**
 * @param {{ hotel_id: number, name: string }} data
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object>}
 */
const createPaymentMethod = async (data, client = db) => {
  const now = new Date();
  const last = await client('hotel_payment_methods')
    .where({ hotel_id: data.hotel_id })
    .whereNull('deleted_at')
    .max('display_order as display_order')
    .first();
  const [id] = await client('hotel_payment_methods').insert({
    hotel_id: data.hotel_id,
    name: data.name,
    is_system: false,
    display_order: (Number(last?.display_order) || 0) + 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });
  return findById(id, client);
};

/**
 * @param {number|string} id
 * @param {{ name: string }} updates
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<Object|null>}
 */
const updatePaymentMethod = async (id, updates, client = db) => {
  await client('hotel_payment_methods').where({ id }).update({
    name: updates.name,
    updated_at: new Date(),
  });
  return findById(id, client);
};

/**
 * @param {number|string} id
 * @param {import('knex').Knex} [client=db]
 * @returns {Promise<void>}
 */
const softDeletePaymentMethod = async (id, client = db) => {
  const now = new Date();
  await client('hotel_payment_methods').where({ id }).update({
    deleted_at: now,
    updated_at: now,
  });
};

module.exports = {
  SYSTEM_PAYMENT_METHODS,
  formatPaymentMethod,
  seedSystemMethods,
  findByHotelId,
  findById,
  findActiveByName,
  createPaymentMethod,
  updatePaymentMethod,
  softDeletePaymentMethod,
};
