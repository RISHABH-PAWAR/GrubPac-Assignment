require('dotenv').config();
const app      = require('./app');
const { pool } = require('./config/database');
const logger   = require('./utils/logger.util');
const fs       = require('fs');
const path     = require('path');

const PORT = parseInt(process.env.PORT) || 3000;

const ensureDirs = () => {
  ['uploads', 'logs'].forEach((dir) => {
    const p = path.resolve(dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
};

const waitForDb = async (retries = 10, delayMs = 2000) => {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      logger.info('PostgreSQL connection verified');
      return;
    } catch (err) {
      if (i === retries) throw err;
      logger.warn(`DB not ready (attempt ${i}/${retries}) — retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
};

const bootstrap = async () => {
  ensureDirs();

  // Retry loop handles race condition where DB container starts slower than Node
  await waitForDb();

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Content Broadcasting System started', {
      port: PORT,
      env:  process.env.NODE_ENV || 'development',
      pid:  process.pid,
    });
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      logger.info('Database pool closed');
      process.exit(0);
    });
    // Force exit if graceful shutdown stalls
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message });
    process.exit(1);
  });
};

bootstrap().catch((err) => {
  console.error('[startup] Fatal error:', err.message);
  process.exit(1);
});
