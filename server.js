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
const NODE_ENV = process.env.NODE_ENV || 'development';

const start = async () => {
  try {
    await db.raw('SELECT 1');

    const server = http.createServer(app);

    server.listen(PORT, '0.0.0.0', () => {
      console.log('----------------------------------------------------');
      console.log(`🏨 ${APP_NAME}`);
      console.log(`🚀 Server listening on port ${PORT} [0.0.0.0]`);
      console.log(`📦 Environment: ${NODE_ENV}`);
      console.log(`🔌 Database: MySQL connected via Knex`);
      console.log(`🩺 Health check: /api/health`);
      console.log('----------------------------------------------------');
    });

    const shutdown = (signal) => {
      console.log(`\n[Server] Received ${signal}. Closing gracefully...`);
      server.close(async () => {
        try {
          await db.destroy();
          console.log('[Server] Database pool closed. Shutdown complete.');
          process.exit(0);
        } catch (err) {
          console.error('[Server] Error during shutdown:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Failed to connect database or start server:', error.message);
    process.exit(1);
  }
};

start();
