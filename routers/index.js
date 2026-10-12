/**
 * API route aggregator.
 * Mounts all routers under their respective path prefixes.
 * Follows TradeNexa router aggregator pattern.
 */
const express = require('express');
const authRouter = require('./authRouter');

const router = express.Router();

// ==========================================
// Route mounts
// ==========================================

router.use('/auth', authRouter);

module.exports = router;
