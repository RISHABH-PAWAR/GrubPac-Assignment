const { getRedis, isRedisAvailable } = require('../config/redis');
const logger = require('../utils/logger.util');

const TTL = parseInt(process.env.REDIS_CACHE_TTL) || 60;

const get = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    const val = await getRedis().get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('Cache get failed', { key, error: err.message });
    return null;
  }
};

const set = async (key, value, ttl = TTL) => {
  if (!isRedisAvailable()) return;
  try {
    await getRedis().setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache set failed', { key, error: err.message });
  }
};

const del = async (key) => {
  if (!isRedisAvailable()) return;
  try { await getRedis().del(key); } catch (_) {}
};

// FIX #3: SCAN-based pattern deletion — non-blocking, O(1) per iteration.
// KEYS is O(N) and blocks the Redis event loop for the full keyspace scan.
// SCAN iterates in batches of `count` and yields control between calls.
const delPattern = async (pattern) => {
  if (!isRedisAvailable()) return;
  const client = getRedis();
  try {
    let cursor = '0';
    const keysToDelete = [];
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await client.del(...keysToDelete);
    }
  } catch (err) {
    logger.warn('Cache delPattern failed', { pattern, error: err.message });
  }
};

const key = (...parts) => `cbs:${parts.join(':')}`;

module.exports = { get, set, del, delPattern, key };
