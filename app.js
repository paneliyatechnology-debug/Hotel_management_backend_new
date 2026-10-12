/**
 * Express application setup.
 *
 * Configures middleware, API routes, and global error handling.
 * Modeled after TradeNexa project architecture.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routers = require('./routers');
const errorHandler = require('./middleware/errorHandler');
const { success } = require('./utils/response');
const { HTTP_STATUS } = require('./constants');

const app = express();

// ==========================================
// Global Middleware
// ==========================================

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Health check
// ==========================================

app.get('/health', (_req, res) => {
  return success(res, 'Server is running', { status: 'UP' });
});

app.get('/api/health', (_req, res) => {
  return success(res, 'Server is running', { status: 'UP' });
});

// ==========================================
// API Routes
// ==========================================

app.use('/api/v1', routers);
app.use('/api', routers);

// ==========================================
// 404 Route Handler
// ==========================================

app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    errors: [],
  });
});

// ==========================================
// Global Error Handler
// ==========================================

app.use(errorHandler);

module.exports = app;
