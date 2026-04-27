require('dotenv').config();
const app    = require('./app');
const { pool } = require('./config/database');
const logger = require('./utils/logger.util');
const fs     = require('fs');
const path   = require('path');

const PORT = parseInt(process.env.PORT) || 3000;

const bootstrap = async () => {
  ['uploads', 'logs'].forEach((dir) => {
    const p = path.resolve(dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });

  await pool.query('SELECT 1');
  logger.info('PostgreSQL connection verified');

  const server = app.listen(PORT, () => {
    logger.info(`Content Broadcasting System started`, {
      port: PORT, env: process.env.NODE_ENV || 'development', pid: process.pid,
    });
  });

  const shutdown = (signal) => {
    logger.info(`${signal} — shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error('Unhandled rejection', { reason: String(r) }));
  process.on('uncaughtException',  (e) => { logger.error('Uncaught exception', { error: e.message }); process.exit(1); });
};

bootstrap().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
