/**
 * API route aggregator.
 * Mounts all routers under their respective path prefixes.
 * Follows TradeNexa router aggregator pattern.
 */
const express = require('express');
const authRouter = require('./authRouter');
const hotelRouter = require('./hotelRouter');
const subscriptionPlanRouter = require('./subscriptionPlanRouter');
const roomTypeRouter = require('./roomTypeRouter');
const roomRouter = require('./roomRouter');
const bookingRouter = require('./bookingRouter');
const userRouter = require('./userRouter');

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

module.exports = router;
