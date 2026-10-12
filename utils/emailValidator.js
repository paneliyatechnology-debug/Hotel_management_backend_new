/**
 * Email validation and global uniqueness verification utilities.
 */
const userModel = require('../models/userModel');
const hotelModel = require('../models/hotelModel');
const guestModel = require('../models/guestModel');

/**
 * Check if an email exists globally across Users, Hotel Owners, or Guests.
 * @param {string} email - Email address to check
 * @param {Object} [options]
 * @param {string} [options.excludeModel] - Optional model name to exclude
 * @param {number|string} [options.excludeId] - Optional record ID to exclude
 * @returns {Promise<boolean>} True if email exists, false if available
 */
const checkEmailExistsGlobally = async (email, options = {}) => {
  if (!email || typeof email !== 'string') return false;
  const cleanEmail = email.trim().toLowerCase();

  const { excludeModel, excludeId } = options;

  // 1. Check users table (covers admins, owners, staff)
  const user = await userModel.findUserByEmail(cleanEmail);
  if (user) {
    if (!(excludeModel === 'User' && String(user.id) === String(excludeId))) {
      return true;
    }
  }

  // 2. Check hotels table
  const hotel = await hotelModel.findHotelByEmail(cleanEmail);
  if (hotel) {
    if (!(excludeModel === 'Hotel' && String(hotel.id) === String(excludeId))) {
      return true;
    }
  }

  // 3. Check guests table
  const guest = await guestModel.findGuestByEmail(cleanEmail);
  if (guest) {
    if (!(excludeModel === 'Guest' && String(guest.id) === String(excludeId))) {
      return true;
    }
  }

  return false;
};

module.exports = {
  checkEmailExistsGlobally,
};
