/**
 * Authentication router.
 * Maps endpoints to validation middleware and authController handlers.
 */
const express = require('express');
const authController = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');
const {
  validate,
  loginValidator,
  forgotPasswordValidator,
  verifyTokenValidator,
  resetPasswordValidator,
  changePasswordValidator,
} = require('../middleware/validation');

const router = express.Router();

// ==========================================
// Public Authentication Routes
// ==========================================

router.post('/login', loginValidator, validate, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Forgot Password & Token-based Reset
router.post('/forgot-password', forgotPasswordValidator, validate, authController.forgotPassword);
router.get('/verify-token', verifyTokenValidator, validate, authController.verifyResetToken);
router.post('/verify-token', verifyTokenValidator, validate, authController.verifyResetToken);
router.post('/reset-password', resetPasswordValidator, validate, authController.resetPassword);

// ==========================================
// Protected Routes
// ==========================================

router.put('/change-password', authenticateUser, changePasswordValidator, validate, authController.changePassword);
router.get('/me', authenticateUser, authController.getMe);

module.exports = router;
