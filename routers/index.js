/**
 * API route aggregator.
 * Mounts all routers under their respective path prefixes.
 */
const express = require('express');
const authRouter = require('./authRouter');
const hotelRouter = require('./hotelRouter');
const subscriptionPlanRouter = require('./subscriptionPlanRouter');
const roomTypeRouter = require('./roomTypeRouter');
const roomRouter = require('./roomRouter');
const bookingRouter = require('./bookingRouter');
const userRouter = require('./userRouter');
const auditLogRouter = require('./auditLogRouter');
const dashboardRouter = require('./dashboardRouter');
const reportRouter = require('./reportRouter');
const transactionRouter = require('./transactionRouter');
const paymentMethodRouter = require('./paymentMethodRouter');

const router = express.Router();

// ==========================================
// Route mounts
// ==========================================

router.use('/auth', authRouter);
router.use('/hotel', hotelRouter);
router.use('/hotels', hotelRouter);
router.use('/subscription-plans', subscriptionPlanRouter);
router.use('/room-types', roomTypeRouter);
router.use('/rooms', roomRouter);
router.use('/room', roomRouter);
router.use('/bookings', bookingRouter);
router.use('/booking', bookingRouter);
router.use('/users', userRouter);
router.use('/user', userRouter);
router.use('/audit-logs', auditLogRouter);
router.use('/dashboard', dashboardRouter);
router.use('/reports', reportRouter);
router.use('/transactions', transactionRouter);
router.use('/payment-methods', paymentMethodRouter);

module.exports = router;
