/**
 * Hotel Router.
 * Public hotel registration, hotel management for the super admin, and own-hotel update for the hotel admin.
 */
const express = require('express');
const hotelController = require('../controllers/hotelController');
const {
  registerHotelValidator,
  hotelIdValidator,
  getHotelsQueryValidator,
  updateHotelValidator,
  updateOwnHotelValidator,
  updateHotelActiveStatusValidator,
} = require('../middleware/hotelValidator');
const { validate } = require('../middleware/validation');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { uploadRoomImages } = require('../middleware/upload');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// Every hotel management route below needs a logged-in super admin.
const superAdminOnly = [authenticateUser, requireRole(ROLE_CODES.SUPER_ADMIN)];

// ==========================================
// Public Hotel Routes
// ==========================================

/**
 * POST /register (Mounted under /api/v1/hotel and /api/v1/hotels)
 * Register new hotel property and hotel admin
 * Other fields may be JSON. The logo is a form-data file.
 */
router.post('/register', uploadRoomImages, registerHotelValidator, validate, hotelController.registerHotel);

// ==========================================
// Hotel Admin: own hotel
// ==========================================

/**
 * PUT /api/v1/hotels/me
 * Update the logged-in hotel admin's own hotel profile. The logo is a form-data file.
 * Owner email and phone cannot be changed here. Must stay above the /:id routes.
 */
router.put(
  '/me',
  authenticateUser,
  requireRole(ROLE_CODES.HOTEL_ADMIN),
  uploadRoomImages,
  updateOwnHotelValidator,
  validate,
  hotelController.updateOwnHotel
);

// ==========================================
// Super Admin Hotel Management
// ==========================================

/**
 * POST /api/v1/hotels
 * Create a hotel and its owner account. The logo is a form-data file.
 */
router.post(
  '/',
  superAdminOnly,
  uploadRoomImages,
  registerHotelValidator,
  validate,
  hotelController.createHotel
);

/**
 * GET /api/v1/hotels
 * List hotels with filters, search, sorting and pagination.
 */
router.get('/', superAdminOnly, getHotelsQueryValidator, validate, hotelController.getHotels);

/**
 * GET /api/v1/hotels/:id
 * Get one hotel with its owner.
 */
router.get('/:id', superAdminOnly, hotelIdValidator, validate, hotelController.getHotelById);

/**
 * PUT /api/v1/hotels/:id
 * Update hotel details and subscription. The logo is a form-data file.
 */
router.put(
  '/:id',
  superAdminOnly,
  uploadRoomImages,
  updateHotelValidator,
  validate,
  hotelController.updateHotel
);

/**
 * PATCH /api/v1/hotels/:id/active-status
 * Switch a hotel on or off. A hotel that is off blocks all of its users.
 */
router.patch(
  '/:id/active-status',
  superAdminOnly,
  updateHotelActiveStatusValidator,
  validate,
  hotelController.updateHotelActiveStatus
);

/**
 * DELETE /api/v1/hotels/:id
 * Soft delete a hotel and its users.
 */
router.delete('/:id', superAdminOnly, hotelIdValidator, validate, hotelController.deleteHotel);

module.exports = router;
