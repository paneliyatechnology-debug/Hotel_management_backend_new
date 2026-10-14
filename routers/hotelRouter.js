/**
 * Hotel Router.
 * Handles public hotel registration and self-serve onboarding.
 */
const express = require('express');
const hotelController = require('../controllers/hotelController');
const { registerHotelValidator } = require('../middleware/hotelValidator');
const { validate } = require('../middleware/validation');
const { uploadRoomImages } = require('../middleware/upload');

const router = express.Router();

// ==========================================
// Public Hotel Routes
// ==========================================

/**
 * POST /register (Mounted under /api/v1/hotel and /api/v1/hotels)
 * Register new hotel property and hotel admin
 * Other fields may be JSON. The logo is a form-data file.
 */
router.post('/register', uploadRoomImages, registerHotelValidator, validate, hotelController.registerHotel);

module.exports = router;
