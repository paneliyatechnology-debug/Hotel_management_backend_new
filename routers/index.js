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

module.exports = router;
