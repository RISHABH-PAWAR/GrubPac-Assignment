const { Pool } = require('pg');
const logger = require('../utils/logger.util');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'content_broadcasting',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max:      parseInt(process.env.DB_POOL_MAX)     || 20,
  idleTimeoutMillis:    parseInt(process.env.DB_POOL_IDLE)    || 10000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    logger.debug('DB query', { ms: Date.now() - start, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('DB query error', { query: text, error: err.message });
    throw err;
  }
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { query, transaction, pool };
