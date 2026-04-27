const Redis = require('ioredis');
const logger = require('../utils/logger.util');

let redisClient = null;
let redisAvailable = false;

const initRedis = () => {
  if (!process.env.REDIS_HOST) {
    logger.info('Redis not configured — caching disabled');
    return null;
  }

  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn('Redis connection failed — running without cache');
        redisAvailable = false;
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  client.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected successfully');
  });

  client.on('error', (err) => {
    redisAvailable = false;
    logger.warn('Redis error — caching disabled', { error: err.message });
  });

  client.connect().catch(() => {
    redisAvailable = false;
    logger.warn('Redis connection failed on startup — running without cache');
  });

  return client;
};

const getRedis = () => redisClient;
const isRedisAvailable = () => redisAvailable;

redisClient = initRedis();

module.exports = { getRedis, isRedisAvailable };
