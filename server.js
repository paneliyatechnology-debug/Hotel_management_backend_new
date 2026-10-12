/**
 * Server entry point.
 * Verifies database connectivity via Knex, then starts the HTTP server.
 * Modeled after TradeNexa server bootstrap.
 */
require('dotenv').config();

const http = require('http');
const app = require('./app');
const db = require('./database/knex');

const PORT = process.env.PORT || 5001;
const APP_NAME = process.env.APP_NAME || 'Hotel Management Backend';

const start = async () => {
  try {
    console.log('[Server] Verifying MySQL database connection...');
    await db.raw('SELECT 1');
    console.log('[Server] Database connected successfully via Knex!');

    const server = http.createServer(app);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] ${APP_NAME} listening on port ${PORT} (0.0.0.0)`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
      console.log(`[Server] Auth routes: http://localhost:${PORT}/api/v1/auth`);
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error.message);
    process.exit(1);
  }
};

start();
