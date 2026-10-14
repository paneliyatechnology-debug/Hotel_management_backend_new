/**
 * Express application setup.
 *
 * Configures middleware, API routes, and global error handling.
 * Modeled after TradeNexa project architecture.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routers = require('./routers');
const errorHandler = require('./middleware/errorHandler');
const { success } = require('./utils/response');
const { HTTP_STATUS } = require('./constants');

const app = express();

// ==========================================
// Dynamic Multi-Origin CORS Configuration
// Supports Localhost (any port), Vercel, Railway, and Production Domains
// ==========================================

const getAllowedOrigins = () => {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    process.env.WEB_URL,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((val) => val.split(',').map((s) => s.trim()))
    .filter(Boolean);

  const defaultOrigins = [
    'https://hotel-management-admin-livid.vercel.app',
    'https://myownpms.com',
    'https://www.myownpms.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
  ];

  return Array.from(new Set([...defaultOrigins, ...envOrigins]));
};

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Server-to-server, curl, Postman, mobile webviews

  // 1. All localhost and 127.0.0.1 ports (Vite 5173, Next 3000, CRA, etc.)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  // 2. All Vercel deployments (*.vercel.app)
  if (/^https:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/.test(origin)) {
    return true;
  }

  // 3. All Railway deployments (*.railway.app, *.up.railway.app)
  if (/^https:\/\/[a-zA-Z0-9-_.]+\.(up\.)?railway\.app$/.test(origin)) {
    return true;
  }

  // 4. Production custom domains (myownpms.com and subdomains)
  if (/^https?:\/\/(www\.)?myownpms\.com$/.test(origin)) {
    return true;
  }

  // 5. Configured environment origins
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-hotel-id',
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // Preflight cached for 24h
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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

// Generated booking folios. Opening the URL shows the PDF in the browser.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  },
}));

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
module.exports.isOriginAllowed = isOriginAllowed;
