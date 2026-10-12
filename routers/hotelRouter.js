/**
 * Hotel Router.
 * Handles public hotel registration and self-serve onboarding.
 */
const express = require('express');
const hotelController = require('../controllers/hotelController');
const { registerHotelValidator } = require('../middleware/hotelValidator');
const { validate } = require('../middleware/validation');

const router = express.Router();

// ==========================================
// Public Hotel Routes
// ==========================================

/**
 * POST /register (Mounted under /api/v1/hotel and /api/v1/hotels)
 * Register new hotel property and hotel admin
 */
router.post('/register', registerHotelValidator, validate, hotelController.registerHotel);

module.exports = router;
